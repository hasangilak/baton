/**
 * Stream Management for Claude Code Bridge
 */

import { config } from './config';
import { logger, ContextualLogger } from './logger';

export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted";
  data?: any;
  error?: string;
  requestId: string;
  timestamp: number;
}

export interface StreamMetrics {
  messagesStreamed: number;
  totalDataSize: number;
  startTime: number;
  lastMessageTime: number;
  errorCount: number;
  isActive: boolean;
}

export class StreamManager {
  private activeStreams = new Map<string, StreamController>();
  private logger: ContextualLogger;

  constructor() {
    this.logger = new ContextualLogger(logger, 'StreamManager');
  }

  /**
   * Create a new stream for a request
   */
  createStream(requestId: string): StreamController {
    if (this.activeStreams.has(requestId)) {
      this.logger.warn('Stream already exists, closing previous', { requestId });
      this.closeStream(requestId);
    }

    const controller = new StreamController(requestId);
    this.activeStreams.set(requestId, controller);
    
    this.logger.info('Created new stream', { requestId });
    return controller;
  }

  /**
   * Get an existing stream
   */
  getStream(requestId: string): StreamController | null {
    return this.activeStreams.get(requestId) || null;
  }

  /**
   * Close a stream
   */
  closeStream(requestId: string): void {
    const controller = this.activeStreams.get(requestId);
    if (controller) {
      controller.close();
      this.activeStreams.delete(requestId);
      this.logger.info('Closed stream', { requestId });
    }
  }

  /**
   * Get active stream count
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Get metrics for all active streams
   */
  getStreamMetrics(): Record<string, StreamMetrics> {
    const metrics: Record<string, StreamMetrics> = {};
    
    for (const [requestId, controller] of this.activeStreams) {
      metrics[requestId] = controller.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Cleanup inactive or stale streams
   */
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [requestId, controller] of this.activeStreams) {
      const metrics = controller.getMetrics();
      const timeSinceLastActivity = now - metrics.lastMessageTime;
      
      if (!metrics.isActive && timeSinceLastActivity > staleThreshold) {
        this.logger.info('Cleaning up stale stream', { 
          requestId, 
          timeSinceLastActivity 
        });
        this.closeStream(requestId);
      }
    }
  }

  /**
   * Close all streams
   */
  closeAllStreams(): void {
    this.logger.info('Closing all streams', { 
      count: this.activeStreams.size 
    });

    for (const [requestId] of this.activeStreams) {
      this.closeStream(requestId);
    }
  }
}

export class StreamController {
  private requestId: string;
  private stream: ReadableStream<Uint8Array>;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private metrics: StreamMetrics;
  private logger: ContextualLogger;
  private closed = false;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.logger = new ContextualLogger(logger, 'StreamController', requestId);
    
    this.metrics = {
      messagesStreamed: 0,
      totalDataSize: 0,
      startTime: Date.now(),
      lastMessageTime: Date.now(),
      errorCount: 0,
      isActive: true
    };

    this.stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
        this.logger.debug('Stream controller initialized');
      },
      cancel: (reason) => {
        this.logger.info('Stream cancelled by client', { reason });
        this.close();
      }
    });
  }

  /**
   * Send a response through the stream
   */
  sendResponse(response: StreamResponse): boolean {
    if (this.closed || !this.controller) {
      this.logger.warn('Attempted to send to closed stream');
      return false;
    }

    try {
      const data = `data: ${JSON.stringify(response)}\n\n`;
      const encoded = new TextEncoder().encode(data);
      
      this.controller.enqueue(encoded);
      
      // Update metrics
      this.metrics.messagesStreamed++;
      this.metrics.totalDataSize += encoded.length;
      this.metrics.lastMessageTime = Date.now();

      this.logger.debug('Response sent', {
        type: response.type,
        dataSize: encoded.length
      });

      return true;
    } catch (error) {
      this.metrics.errorCount++;
      this.logger.error('Failed to send response', {}, error);
      return false;
    }
  }

  /**
   * Send error response
   */
  sendError(error: string | Error): boolean {
    const errorMessage = error instanceof Error ? error.message : error;
    
    return this.sendResponse({
      type: 'error',
      error: errorMessage,
      requestId: this.requestId,
      timestamp: Date.now()
    });
  }

  /**
   * Send completion response
   */
  sendCompletion(): boolean {
    const success = this.sendResponse({
      type: 'done',
      requestId: this.requestId,
      timestamp: Date.now()
    });

    if (success) {
      this.metrics.isActive = false;
      this.logger.info('Stream completed', {
        messagesStreamed: this.metrics.messagesStreamed,
        totalDataSize: this.metrics.totalDataSize,
        duration: Date.now() - this.metrics.startTime
      });
    }

    return success;
  }

  /**
   * Send abort response
   */
  sendAbort(): boolean {
    const success = this.sendResponse({
      type: 'aborted',
      requestId: this.requestId,
      timestamp: Date.now()
    });

    if (success) {
      this.metrics.isActive = false;
      this.logger.info('Stream aborted');
    }

    return success;
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.metrics.isActive = false;

    try {
      if (this.controller) {
        this.controller.close();
        this.controller = null;
      }
    } catch (error) {
      this.logger.warn('Error closing stream controller', {}, error);
    }

    this.logger.debug('Stream closed', {
      duration: Date.now() - this.metrics.startTime,
      messagesStreamed: this.metrics.messagesStreamed
    });
  }

  /**
   * Get the readable stream
   */
  getStream(): ReadableStream<Uint8Array> {
    return this.stream;
  }

  /**
   * Get stream metrics
   */
  getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if stream is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Check if stream is healthy
   */
  isHealthy(): boolean {
    const now = Date.now();
    const timeSinceStart = now - this.metrics.startTime;
    const timeSinceLastMessage = now - this.metrics.lastMessageTime;
    
    // Stream is unhealthy if:
    // - It's been running for more than 10 minutes without completion
    // - No messages for more than 2 minutes while active
    // - Error rate is too high
    
    if (this.metrics.isActive && timeSinceStart > 10 * 60 * 1000) {
      return false;
    }
    
    if (this.metrics.isActive && timeSinceLastMessage > 2 * 60 * 1000) {
      return false;
    }
    
    if (this.metrics.messagesStreamed > 0 && 
        this.metrics.errorCount / this.metrics.messagesStreamed > 0.1) {
      return false;
    }
    
    return true;
  }
}

/**
 * Create a proper Server-Sent Events response
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    }
  });
}

/**
 * Stream health check utility
 */
export class StreamHealthChecker {
  private streamManager: StreamManager;
  private checkInterval: NodeJS.Timeout | null = null;
  private logger: ContextualLogger;

  constructor(streamManager: StreamManager) {
    this.streamManager = streamManager;
    this.logger = new ContextualLogger(logger, 'StreamHealthChecker');
  }

  /**
   * Start periodic health checks
   */
  start(intervalMs: number = 30000): void { // 30 seconds default
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);

    this.logger.info('Stream health checker started', { intervalMs });
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.info('Stream health checker stopped');
    }
  }

  /**
   * Perform health check on all streams
   */
  private performHealthCheck(): void {
    const metrics = this.streamManager.getStreamMetrics();
    const unhealthyStreams: string[] = [];
    
    for (const [requestId, streamMetrics] of Object.entries(metrics)) {
      const controller = this.streamManager.getStream(requestId);
      if (controller && !controller.isHealthy()) {
        unhealthyStreams.push(requestId);
      }
    }

    if (unhealthyStreams.length > 0) {
      this.logger.warn('Found unhealthy streams', { 
        unhealthyStreams,
        count: unhealthyStreams.length
      });

      // Close unhealthy streams
      for (const requestId of unhealthyStreams) {
        this.streamManager.closeStream(requestId);
      }
    }

    // Cleanup stale streams
    this.streamManager.cleanup();

    this.logger.debug('Health check completed', {
      totalStreams: Object.keys(metrics).length,
      unhealthyStreams: unhealthyStreams.length
    });
  }
}