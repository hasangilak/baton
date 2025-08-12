/**
 * HTTP Client with Connection Pooling for Backend Calls
 */

import { config } from './config';
import { logger, ContextualLogger } from './logger';

export interface HTTPClientConfig {
  baseURL: string;
  timeout: number;
  maxConnections: number;
  keepAlive: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

export interface RequestMetrics {
  url: string;
  method: string;
  duration: number;
  status: number;
  attempts: number;
  success: boolean;
  error?: string;
}

export class HTTPClient {
  private baseURL: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private logger: ContextualLogger;
  private requestMetrics: RequestMetrics[] = [];
  private maxMetricsHistory = 100;

  // Connection pool would be implemented here in a full HTTP client
  // For now, we'll use fetch with better error handling and retries
  private activeRequests = new Map<string, AbortController>();

  constructor(config: HTTPClientConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.logger = new ContextualLogger(logger, 'HTTPClient');

    this.logger.info('HTTP Client initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts
    });
  }

  /**
   * Make HTTP request with retry logic and metrics
   */
  async request<T = any>(
    path: string, 
    options: RequestOptions = {},
    requestId?: string
  ): Promise<T> {
    const url = `${this.baseURL}${path.startsWith('/') ? path : '/' + path}`;
    const method = options.method || 'GET';
    const timeout = options.timeout || this.timeout;
    const maxAttempts = (options.retries ?? this.retryAttempts) + 1;
    
    const contextLogger = new ContextualLogger(logger, 'HTTPClient', requestId);
    const startTime = Date.now();
    
    let lastError: Error | null = null;
    let attempt = 0;

    for (attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        contextLogger.debug('Making HTTP request', {
          url,
          method,
          attempt,
          maxAttempts
        });

        const response = await this.makeRequest(url, {
          ...options,
          timeout
        }, requestId);

        const duration = Date.now() - attemptStartTime;
        const totalDuration = Date.now() - startTime;

        // Record successful metrics
        this.recordMetrics({
          url,
          method,
          duration: totalDuration,
          status: response.status,
          attempts: attempt,
          success: true
        });

        contextLogger.debug('HTTP request successful', {
          status: response.status,
          duration: totalDuration,
          attempts: attempt
        });

        // Parse response
        if (response.headers.get('content-type')?.includes('application/json')) {
          return await response.json();
        } else {
          return await response.text() as T;
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const duration = Date.now() - attemptStartTime;
        
        contextLogger.warn('HTTP request attempt failed', {
          attempt,
          maxAttempts,
          duration,
          error: lastError.message
        });

        // Don't retry on certain errors
        if (this.shouldNotRetry(lastError, attempt)) {
          break;
        }

        // Wait before retry (except for last attempt)
        if (attempt < maxAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          contextLogger.debug('Retrying request', { delay, nextAttempt: attempt + 1 });
          await this.sleep(delay);
        }
      }
    }

    // Record failed metrics
    const totalDuration = Date.now() - startTime;
    this.recordMetrics({
      url,
      method,
      duration: totalDuration,
      status: 0,
      attempts: attempt,
      success: false,
      error: lastError?.message
    });

    contextLogger.error('HTTP request failed after all attempts', {
      attempts: attempt,
      totalDuration,
      finalError: lastError?.message
    });

    throw lastError || new Error('Request failed after all attempts');
  }

  /**
   * GET request
   */
  async get<T = any>(path: string, options: Omit<RequestOptions, 'method'> = {}, requestId?: string): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' }, requestId);
  }

  /**
   * POST request
   */
  async post<T = any>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}, requestId?: string): Promise<T> {
    return this.request<T>(path, { 
      ...options, 
      method: 'POST',
      body: typeof body === 'object' ? JSON.stringify(body) : body,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, requestId);
  }

  /**
   * PUT request
   */
  async put<T = any>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}, requestId?: string): Promise<T> {
    return this.request<T>(path, { 
      ...options, 
      method: 'PUT',
      body: typeof body === 'object' ? JSON.stringify(body) : body,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, requestId);
  }

  /**
   * DELETE request
   */
  async delete<T = any>(path: string, options: Omit<RequestOptions, 'method'> = {}, requestId?: string): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' }, requestId);
  }

  /**
   * Make actual fetch request
   */
  private async makeRequest(url: string, options: RequestOptions, requestId?: string): Promise<Response> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), options.timeout || this.timeout);
    
    // Track active request
    if (requestId) {
      this.activeRequests.set(requestId, abortController);
    }

    try {
      // Combine abort signals
      const combinedSignal = this.combineAbortSignals([
        abortController.signal,
        options.signal
      ]);

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Baton-Bridge/1.0',
          ...options.headers
        },
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
        signal: combinedSignal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout or aborted');
        }
        throw error;
      }
      
      throw new Error(String(error));
    } finally {
      if (requestId) {
        this.activeRequests.delete(requestId);
      }
    }
  }

  /**
   * Combine multiple abort signals
   */
  private combineAbortSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
    const validSignals = signals.filter((signal): signal is AbortSignal => !!signal);
    
    if (validSignals.length === 0) {
      return new AbortController().signal;
    }
    
    if (validSignals.length === 1) {
      return validSignals[0];
    }

    const controller = new AbortController();
    
    for (const signal of validSignals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    
    return controller.signal;
  }

  /**
   * Check if error should not be retried
   */
  private shouldNotRetry(error: Error, attempt: number): boolean {
    // Don't retry on first attempt for certain errors
    if (error.message.includes('HTTP 4')) {
      return true; // Client errors (400-499) shouldn't be retried
    }
    
    if (error.message.includes('timeout') && attempt >= 2) {
      return true; // Give up on timeouts after 2 attempts
    }
    
    if (error.name === 'AbortError') {
      return true; // Don't retry aborted requests
    }
    
    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: base delay * 2^(attempt-1) + jitter
    const baseDelay = this.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Up to 1 second jitter
    
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Record request metrics
   */
  private recordMetrics(metrics: RequestMetrics): void {
    this.requestMetrics.push(metrics);
    
    // Keep only recent metrics
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get request metrics
   */
  getMetrics(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    errorRate: number;
    recentMetrics: RequestMetrics[];
  } {
    const total = this.requestMetrics.length;
    const successful = this.requestMetrics.filter(m => m.success).length;
    const failed = total - successful;
    const avgResponseTime = total > 0 
      ? this.requestMetrics.reduce((sum, m) => sum + m.duration, 0) / total 
      : 0;
    const errorRate = total > 0 ? failed / total : 0;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      averageResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      recentMetrics: [...this.requestMetrics].reverse().slice(0, 10) // Last 10 requests
    };
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * Abort all active requests
   */
  abortAllRequests(): void {
    this.logger.info('Aborting all active requests', {
      count: this.activeRequests.size
    });

    for (const [requestId, controller] of this.activeRequests) {
      controller.abort();
      this.logger.debug('Aborted request', { requestId });
    }
    
    this.activeRequests.clear();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; responseTime?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await this.get('/health', { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        responseTime
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Create HTTP client instance for backend
 */
export function createBackendClient(): HTTPClient {
  const cfg = config.getConfig();
  
  return new HTTPClient({
    baseURL: cfg.backendUrl,
    timeout: cfg.fetchTimeout,
    maxConnections: 10,
    keepAlive: true,
    retryAttempts: 2,
    retryDelay: 1000
  });
}