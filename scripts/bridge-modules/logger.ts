/**
 * Structured Logging System for Claude Code Bridge
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  requestId?: string;
  module?: string;
  error?: Error | string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableStructured: boolean;
  maxFileSize: number;
  maxFiles: number;
}

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private flushInterval?: NodeJS.Timeout;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      enableStructured: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      ...config
    };

    if (this.config.enableFile) {
      this.setupFileLogging();
    }
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  private setupFileLogging(): void {
    // Set up periodic flush for file logging
    this.flushInterval = setInterval(() => {
      this.flushLogs();
    }, 5000); // Flush every 5 seconds
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = LogLevel[entry.level];
    const module = entry.module ? `[${entry.module}]` : '';
    const requestId = entry.requestId ? `{${entry.requestId}}` : '';
    
    if (this.config.enableStructured) {
      return JSON.stringify({
        timestamp,
        level,
        message: entry.message,
        module: entry.module,
        requestId: entry.requestId,
        context: entry.context,
        error: entry.error instanceof Error ? {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        } : entry.error
      });
    } else {
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? ` ERROR: ${entry.error}` : '';
      return `${timestamp} ${level} ${module}${requestId} ${entry.message}${contextStr}${errorStr}`;
    }
  }

  private getLogIcon(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '🔍';
      case LogLevel.INFO: return 'ℹ️ ';
      case LogLevel.WARN: return '⚠️ ';
      case LogLevel.ERROR: return '❌';
      case LogLevel.CRITICAL: return '🚨';
      default: return '📝';
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, requestId?: string, module?: string, error?: Error | string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      requestId,
      module,
      error
    };

    // Console output with emojis (for backward compatibility)
    if (this.config.enableConsole) {
      const icon = this.getLogIcon(level);
      const moduleStr = module ? `[${module}]` : '';
      const requestIdStr = requestId ? `{${requestId}}` : '';
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      const errorStr = error ? ` ${error}` : '';
      
      const consoleMessage = `${icon} ${moduleStr}${requestIdStr} ${message}${contextStr}${errorStr}`;
      
      if (level >= LogLevel.ERROR) {
        console.error(consoleMessage);
      } else if (level >= LogLevel.WARN) {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
    }

    // Add to buffer for file logging
    if (this.config.enableFile) {
      this.logBuffer.push(entry);
    }
  }

  debug(message: string, context?: Record<string, any>, requestId?: string, module?: string): void {
    this.log(LogLevel.DEBUG, message, context, requestId, module);
  }

  info(message: string, context?: Record<string, any>, requestId?: string, module?: string): void {
    this.log(LogLevel.INFO, message, context, requestId, module);
  }

  warn(message: string, context?: Record<string, any>, requestId?: string, module?: string, error?: Error | string): void {
    this.log(LogLevel.WARN, message, context, requestId, module, error);
  }

  error(message: string, context?: Record<string, any>, requestId?: string, module?: string, error?: Error | string): void {
    this.log(LogLevel.ERROR, message, context, requestId, module, error);
  }

  critical(message: string, context?: Record<string, any>, requestId?: string, module?: string, error?: Error | string): void {
    this.log(LogLevel.CRITICAL, message, context, requestId, module, error);
  }

  // Convenience methods for common bridge operations
  bridgeRequest(requestId: string, message: string, context?: Record<string, any>): void {
    this.info(`Bridge executing Claude Code request`, { 
      messagePreview: message.substring(0, 100) + '...',
      ...context 
    }, requestId, 'Bridge');
  }

  permissionRequest(toolName: string, riskLevel: string, requestId?: string): void {
    this.info(`Requesting permission for tool`, { 
      toolName, 
      riskLevel 
    }, requestId, 'Permission');
  }

  permissionGranted(toolName: string, decision: string, requestId?: string): void {
    this.info(`Permission granted for tool`, { 
      toolName, 
      decision 
    }, requestId, 'Permission');
  }

  streamMessage(messageCount: number, messageType: string, requestId?: string): void {
    this.debug(`Stream message processed`, { 
      messageCount, 
      messageType 
    }, requestId, 'Stream');
  }

  private flushLogs(): void {
    if (this.logBuffer.length === 0 || !this.config.filePath) {
      return;
    }

    try {
      const fs = require('fs');
      const logs = this.logBuffer.map(entry => this.formatMessage(entry)).join('\n') + '\n';
      
      // Append to log file
      fs.appendFileSync(this.config.filePath, logs);
      
      // Clear buffer
      this.logBuffer = [];
      
      // Check file size and rotate if needed
      this.rotateLogsIfNeeded();
      
    } catch (error) {
      console.error('Failed to write logs to file:', error);
    }
  }

  private rotateLogsIfNeeded(): void {
    if (!this.config.filePath) return;

    try {
      const fs = require('fs');
      const path = require('path');
      
      if (!fs.existsSync(this.config.filePath)) return;
      
      const stats = fs.statSync(this.config.filePath);
      if (stats.size < this.config.maxFileSize) return;
      
      // Rotate logs
      const dir = path.dirname(this.config.filePath);
      const name = path.basename(this.config.filePath, path.extname(this.config.filePath));
      const ext = path.extname(this.config.filePath);
      
      // Remove oldest log if we have too many
      const oldestLog = path.join(dir, `${name}.${this.config.maxFiles}${ext}`);
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }
      
      // Shift existing logs
      for (let i = this.config.maxFiles - 1; i >= 1; i--) {
        const current = path.join(dir, `${name}.${i}${ext}`);
        const next = path.join(dir, `${name}.${i + 1}${ext}`);
        if (fs.existsSync(current)) {
          fs.renameSync(current, next);
        }
      }
      
      // Move current log to .1
      const rotatedLog = path.join(dir, `${name}.1${ext}`);
      fs.renameSync(this.config.filePath, rotatedLog);
      
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Final flush
    this.flushLogs();
  }
}

// Create contextual loggers for different modules
export class ContextualLogger {
  constructor(
    private logger: Logger, 
    private module: string, 
    private requestId?: string
  ) {}

  debug(message: string, context?: Record<string, any>): void {
    this.logger.debug(message, context, this.requestId, this.module);
  }

  info(message: string, context?: Record<string, any>): void {
    this.logger.info(message, context, this.requestId, this.module);
  }

  warn(message: string, context?: Record<string, any>, error?: Error | string): void {
    this.logger.warn(message, context, this.requestId, this.module, error);
  }

  error(message: string, context?: Record<string, any>, error?: Error | string): void {
    this.logger.error(message, context, this.requestId, this.module, error);
  }

  critical(message: string, context?: Record<string, any>, error?: Error | string): void {
    this.logger.critical(message, context, this.requestId, this.module, error);
  }
}

// Export singleton instance
export const logger = Logger.getInstance({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableFile: process.env.BRIDGE_LOG_FILE === 'true',
  filePath: process.env.BRIDGE_LOG_PATH || '/tmp/bridge-service.log'
});