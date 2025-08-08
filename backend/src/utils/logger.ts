/**
 * Structured Logging System - Based on Claude Code WebUI Architecture
 * 
 * Provides structured logging with different loggers for different components,
 * following the comprehensive implementation guide patterns.
 */

// Simple structured logger implementation
// In production, you might want to use winston, pino, or similar
class StructuredLogger {
  constructor(private namespace: string[]) {}

  private formatMessage(level: string, message: string, data?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const ns = this.namespace.join(':');
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${ns}] ${message}${logData}`;
  }

  debug(message: string, data?: Record<string, any>) {
    console.debug(this.formatMessage('debug', message, data));
  }

  info(message: string, data?: Record<string, any>) {
    console.info(this.formatMessage('info', message, data));
  }

  warn(message: string, data?: Record<string, any>) {
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message: string, data?: Record<string, any>) {
    console.error(this.formatMessage('error', message, data));
  }
}

function getLogger(namespace: string[]): StructuredLogger {
  return new StructuredLogger(namespace);
}

// Export structured loggers for different components (following WebUI pattern)
export const logger = {
  cli: getLogger(['cli']),
  validation: getLogger(['validation']),
  chat: getLogger(['chat']),
  streaming: getLogger(['streaming']),
  history: getLogger(['history']),
  api: getLogger(['api']),
  app: getLogger(['app']),
  handlers: getLogger(['handlers']),
  storage: getLogger(['storage']), // For MessageStorageService
};

// Export the factory function for custom loggers
export { getLogger };