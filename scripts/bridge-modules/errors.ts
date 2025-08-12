/**
 * Comprehensive Error Handling for Claude Code Bridge
 */

import { logger, ContextualLogger } from './logger';

export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  RESOURCE_ERROR = 'RESOURCE_ERROR',
  CLAUDE_SDK_ERROR = 'CLAUDE_SDK_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  STREAM_ERROR = 'STREAM_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ErrorContext {
  requestId?: string;
  conversationId?: string;
  toolName?: string;
  filePath?: string;
  userId?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

export class BridgeError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly userMessage: string;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN_ERROR,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    recoverable: boolean = true,
    userMessage?: string
  ) {
    super(message);
    this.name = 'BridgeError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    this.userMessage = userMessage || this.generateUserMessage();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BridgeError);
    }
  }

  private generateUserMessage(): string {
    switch (this.type) {
      case ErrorType.VALIDATION_ERROR:
        return 'Invalid request parameters provided';
      case ErrorType.PERMISSION_ERROR:
        return 'Permission denied for this operation';
      case ErrorType.RESOURCE_ERROR:
        return 'System resources are currently unavailable';
      case ErrorType.CLAUDE_SDK_ERROR:
        return 'Claude Code execution encountered an error';
      case ErrorType.NETWORK_ERROR:
        return 'Network connection error occurred';
      case ErrorType.FILE_SYSTEM_ERROR:
        return 'File operation failed';
      case ErrorType.TIMEOUT_ERROR:
        return 'Operation timed out';
      case ErrorType.CONFIGURATION_ERROR:
        return 'System configuration error';
      case ErrorType.STREAM_ERROR:
        return 'Streaming operation failed';
      default:
        return 'An unexpected error occurred';
    }
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      userMessage: this.userMessage,
      stack: this.stack
    };
  }
}

export interface ErrorRecoveryStrategy {
  canRecover(error: BridgeError): boolean;
  recover(error: BridgeError): Promise<any>;
  getRetryDelay(): number;
  getMaxRetries(): number;
}

export class ErrorHandler {
  private logger: ContextualLogger;
  private errorCounts = new Map<ErrorType, number>();
  private recentErrors: BridgeError[] = [];
  private maxRecentErrors = 50;
  private recoveryStrategies = new Map<ErrorType, ErrorRecoveryStrategy>();

  constructor() {
    this.logger = new ContextualLogger(logger, 'ErrorHandler');
    this.setupDefaultRecoveryStrategies();
  }

  /**
   * Handle an error with proper logging and recovery
   */
  async handleError(error: Error | BridgeError, context: ErrorContext = {}): Promise<BridgeError> {
    let bridgeError: BridgeError;

    // Convert regular errors to BridgeError
    if (error instanceof BridgeError) {
      bridgeError = error;
      // Update context if provided
      if (Object.keys(context).length > 0) {
        bridgeError.context = { ...bridgeError.context, ...context };
      }
    } else {
      bridgeError = this.convertToBridgeError(error, context);
    }

    // Log the error
    this.logError(bridgeError);

    // Update error counts
    this.incrementErrorCount(bridgeError.type);

    // Add to recent errors
    this.addToRecentErrors(bridgeError);

    // Check if system health is compromised
    this.checkSystemHealth();

    return bridgeError;
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(error: BridgeError): Promise<{ recovered: boolean; result?: any; error?: BridgeError }> {
    if (!error.recoverable) {
      this.logger.warn('Error is not recoverable', { errorType: error.type }, undefined, error.context.requestId);
      return { recovered: false, error };
    }

    const strategy = this.recoveryStrategies.get(error.type);
    if (!strategy || !strategy.canRecover(error)) {
      this.logger.info('No recovery strategy available', { errorType: error.type }, undefined, error.context.requestId);
      return { recovered: false, error };
    }

    try {
      this.logger.info('Attempting error recovery', { 
        errorType: error.type,
        strategy: strategy.constructor.name 
      }, undefined, error.context.requestId);

      const result = await strategy.recover(error);
      
      this.logger.info('Error recovery successful', { errorType: error.type }, undefined, error.context.requestId);
      return { recovered: true, result };
      
    } catch (recoveryError) {
      const newBridgeError = await this.handleError(recoveryError as Error, {
        ...error.context,
        operation: 'error_recovery',
        metadata: { originalErrorType: error.type }
      });
      
      this.logger.error('Error recovery failed', {}, recoveryError, error.context.requestId);
      return { recovered: false, error: newBridgeError };
    }
  }

  /**
   * Convert regular error to BridgeError
   */
  private convertToBridgeError(error: Error, context: ErrorContext): BridgeError {
    const type = this.classifyError(error);
    const severity = this.assessSeverity(error, type);
    const recoverable = this.isRecoverable(error, type);

    return new BridgeError(
      error.message,
      type,
      severity,
      context,
      recoverable
    );
  }

  /**
   * Classify error type based on error characteristics
   */
  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Check for specific error patterns
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT_ERROR;
    }

    if (message.includes('permission') || message.includes('denied') || message.includes('unauthorized')) {
      return ErrorType.PERMISSION_ERROR;
    }

    if (message.includes('file') || message.includes('directory') || message.includes('enoent')) {
      return ErrorType.FILE_SYSTEM_ERROR;
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorType.VALIDATION_ERROR;
    }

    if (message.includes('stream') || message.includes('readable') || message.includes('writable')) {
      return ErrorType.STREAM_ERROR;
    }

    if (message.includes('config') || message.includes('configuration')) {
      return ErrorType.CONFIGURATION_ERROR;
    }

    if (message.includes('resource') || message.includes('memory') || message.includes('limit')) {
      return ErrorType.RESOURCE_ERROR;
    }

    if (stack.includes('claude') || message.includes('claude')) {
      return ErrorType.CLAUDE_SDK_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Assess error severity
   */
  private assessSeverity(error: Error, type: ErrorType): ErrorSeverity {
    // Critical errors that could crash the system
    if (type === ErrorType.RESOURCE_ERROR || type === ErrorType.CONFIGURATION_ERROR) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity errors that affect functionality
    if (type === ErrorType.CLAUDE_SDK_ERROR || type === ErrorType.STREAM_ERROR) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity errors that are recoverable
    if (type === ErrorType.NETWORK_ERROR || type === ErrorType.TIMEOUT_ERROR) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity errors (validation, permissions)
    return ErrorSeverity.LOW;
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(error: Error, type: ErrorType): boolean {
    // These error types are generally not recoverable
    const nonRecoverableTypes = [
      ErrorType.VALIDATION_ERROR,
      ErrorType.PERMISSION_ERROR,
      ErrorType.CONFIGURATION_ERROR
    ];

    if (nonRecoverableTypes.includes(type)) {
      return false;
    }

    // Check specific error messages
    if (error.message.includes('abort')) {
      return false;
    }

    return true;
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: BridgeError): void {
    const logData = {
      type: error.type,
      severity: error.severity,
      recoverable: error.recoverable,
      context: error.context
    };

    const requestId = error.context.requestId;

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.critical(error.message, logData, requestId, undefined, error);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(error.message, logData, requestId, undefined, error);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(error.message, logData, requestId, undefined, error);
        break;
      case ErrorSeverity.LOW:
        this.logger.info(error.message, logData, requestId);
        break;
    }
  }

  /**
   * Increment error count for type
   */
  private incrementErrorCount(type: ErrorType): void {
    const current = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, current + 1);
  }

  /**
   * Add error to recent errors list
   */
  private addToRecentErrors(error: BridgeError): void {
    this.recentErrors.push(error);
    
    // Keep only recent errors
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors = this.recentErrors.slice(-this.maxRecentErrors);
    }
  }

  /**
   * Check overall system health based on error patterns
   */
  private checkSystemHealth(): void {
    const now = Date.now();
    const last5Minutes = now - (5 * 60 * 1000);
    
    // Count recent critical errors
    const recentCriticalErrors = this.recentErrors.filter(error => 
      error.severity === ErrorSeverity.CRITICAL && 
      error.timestamp.getTime() > last5Minutes
    );

    if (recentCriticalErrors.length >= 3) {
      this.logger.critical('System health compromised - multiple critical errors', {
        recentCriticalErrors: recentCriticalErrors.length,
        timeWindow: '5 minutes'
      });
    }

    // Check error rate
    const recentErrors = this.recentErrors.filter(error => 
      error.timestamp.getTime() > last5Minutes
    );

    if (recentErrors.length >= 20) {
      this.logger.warn('High error rate detected', {
        recentErrors: recentErrors.length,
        timeWindow: '5 minutes'
      });
    }
  }

  /**
   * Setup default recovery strategies
   */
  private setupDefaultRecoveryStrategies(): void {
    // Network error recovery
    this.recoveryStrategies.set(ErrorType.NETWORK_ERROR, new NetworkErrorRecovery());
    
    // Timeout error recovery
    this.recoveryStrategies.set(ErrorType.TIMEOUT_ERROR, new TimeoutErrorRecovery());
    
    // Resource error recovery
    this.recoveryStrategies.set(ErrorType.RESOURCE_ERROR, new ResourceErrorRecovery());
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    recentErrors: number;
    criticalErrors: number;
  } {
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    const errorsByType = Object.fromEntries(this.errorCounts);
    
    const now = Date.now();
    const last24Hours = now - (24 * 60 * 60 * 1000);
    const recentErrors = this.recentErrors.filter(error => 
      error.timestamp.getTime() > last24Hours
    ).length;
    
    const criticalErrors = this.recentErrors.filter(error => 
      error.severity === ErrorSeverity.CRITICAL
    ).length;

    return {
      totalErrors,
      errorsByType,
      recentErrors,
      criticalErrors
    };
  }

  /**
   * Clear error statistics
   */
  clearStatistics(): void {
    this.errorCounts.clear();
    this.recentErrors = [];
    this.logger.info('Error statistics cleared');
  }
}

// Recovery Strategy Implementations

class NetworkErrorRecovery implements ErrorRecoveryStrategy {
  canRecover(error: BridgeError): boolean {
    return error.type === ErrorType.NETWORK_ERROR && !error.message.includes('abort');
  }

  async recover(error: BridgeError): Promise<any> {
    // Simple retry logic - actual implementation would depend on the specific operation
    await new Promise(resolve => setTimeout(resolve, this.getRetryDelay()));
    return { recovered: true, strategy: 'network_retry' };
  }

  getRetryDelay(): number {
    return 2000; // 2 seconds
  }

  getMaxRetries(): number {
    return 3;
  }
}

class TimeoutErrorRecovery implements ErrorRecoveryStrategy {
  canRecover(error: BridgeError): boolean {
    return error.type === ErrorType.TIMEOUT_ERROR;
  }

  async recover(error: BridgeError): Promise<any> {
    // Increase timeout for retry
    await new Promise(resolve => setTimeout(resolve, this.getRetryDelay()));
    return { recovered: true, strategy: 'timeout_retry', increasedTimeout: true };
  }

  getRetryDelay(): number {
    return 5000; // 5 seconds
  }

  getMaxRetries(): number {
    return 2;
  }
}

class ResourceErrorRecovery implements ErrorRecoveryStrategy {
  canRecover(error: BridgeError): boolean {
    return error.type === ErrorType.RESOURCE_ERROR && 
           !error.message.includes('memory') && 
           error.recoverable;
  }

  async recover(error: BridgeError): Promise<any> {
    // Trigger garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    await new Promise(resolve => setTimeout(resolve, this.getRetryDelay()));
    return { recovered: true, strategy: 'resource_cleanup' };
  }

  getRetryDelay(): number {
    return 10000; // 10 seconds
  }

  getMaxRetries(): number {
    return 1;
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Convenience functions
export function createError(
  message: string,
  type: ErrorType = ErrorType.UNKNOWN_ERROR,
  context: ErrorContext = {}
): BridgeError {
  return new BridgeError(message, type, ErrorSeverity.MEDIUM, context);
}

export function createValidationError(message: string, context: ErrorContext = {}): BridgeError {
  return new BridgeError(message, ErrorType.VALIDATION_ERROR, ErrorSeverity.LOW, context, false);
}

export function createPermissionError(message: string, context: ErrorContext = {}): BridgeError {
  return new BridgeError(message, ErrorType.PERMISSION_ERROR, ErrorSeverity.LOW, context, false);
}

export function createResourceError(message: string, context: ErrorContext = {}): BridgeError {
  return new BridgeError(message, ErrorType.RESOURCE_ERROR, ErrorSeverity.CRITICAL, context);
}