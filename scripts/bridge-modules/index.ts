/**
 * Main Bridge Orchestrator using Modular Components
 */

import { Server } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';
import { createServer } from 'http';

// Import all modules
import { config, ConfigManager } from './config';
import { logger, ContextualLogger } from './logger';
import { PermissionManager } from './permissions';
import { ClaudeSDK, ClaudeRequest } from './claude-sdk';
import { StreamManager, StreamResponse } from './streams';
import { ResourceManager } from './resources';
import { errorHandler, BridgeError, ErrorType } from './errors';

/**
 * Bridge Request Interface - conversationId-first Architecture
 * ============================================================
 * ARCHITECTURE CHANGE: conversationId is now primary identifier
 * - conversationId: Primary identifier for conversation operations
 * - projectId: Project context for association and Claude working directory
 * - sessionId: Claude Code SDK session ID for conversation continuity
 * - This enables proper conversation-centric operations with Claude SDK
 */
export interface BridgeRequest {
  message: string;
  requestId: string;
  conversationId: string;   // Primary conversation identifier
  projectId?: string;       // Project context for association
  sessionId?: string;       // Claude Code session ID for resumption
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: any;
  projectName?: string;
}

export class ModularClaudeCodeBridge {
  // Core configuration
  private config: ConfigManager;
  
  // Module instances
  private logger: ContextualLogger;
  private permissionManager: PermissionManager;
  private claudeSDK: ClaudeSDK;
  private streamManager: StreamManager;
  private resourceManager: ResourceManager;
  
  // Networking
  private io: Server | null = null;
  private backendSocket: Socket | null = null;
  
  // State tracking
  private activeRequests = new Map<string, AbortController>();

  constructor(port: number = 8080, backendUrl: string = 'http://localhost:3001') {
    // Initialize configuration
    this.config = ConfigManager.getInstance();
    this.config.updateConfig({ port, backendUrl });
    
    // Initialize logger
    this.logger = new ContextualLogger(logger, 'ModularBridge');
    
    // Initialize modules
    this.permissionManager = new PermissionManager();
    this.claudeSDK = new ClaudeSDK(this.logger, this.permissionManager);
    this.streamManager = new StreamManager();
    this.resourceManager = new ResourceManager(this.streamManager, this.claudeSDK);
    
    this.logger.info('Modular Claude Code Bridge initialized', {
      port,
      backendUrl,
      modules: ['config', 'logger', 'permissions', 'claude-sdk', 'streams', 'resources', 'errors']
    });
  }

  /**
   * Start the bridge service
   */
  async start(): Promise<void> {
    try {
      // Validate configuration
      const validation = this.config.validate();
      if (!validation.valid) {
        throw new BridgeError(
          `Configuration validation failed: ${validation.errors.join(', ')}`,
          ErrorType.CONFIGURATION_ERROR,
        );
      }

      // Create HTTP server for Socket.IO
      const httpServer = createServer();
      
      // Create Socket.IO server
      this.io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        },
        transports: ['websocket', 'polling']
      });

      // Connect to backend WebSocket
      await this.connectToBackend();
      
      // Set up WebSocket event handlers
      this.setupWebSocketHandlers();

      // Start HTTP server
      const cfg = this.config.getConfig();
      httpServer.listen(cfg.port, () => {
        this.logger.info('Modular Bridge WebSocket server running', {
          port: cfg.port,
          backendUrl: cfg.backendUrl
        });
      });

    } catch (error) {
      const bridgeError = await errorHandler.handleError(error as Error);
      this.logger.critical('Failed to start bridge service', {}, bridgeError);
      throw bridgeError;
    }
  }

  /**
   * Connect to backend WebSocket
   */
  private async connectToBackend(): Promise<void> {
    try {
      const cfg = this.config.getConfig();
      this.logger.info('Connecting to backend', { backendUrl: cfg.backendUrl });
      
      // Convert WebSocket URL to HTTP URL for socket.io-client
      const httpUrl = cfg.backendUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      
      this.backendSocket = ioClient(httpUrl, {
        transports: ['websocket', 'polling'],
        timeout: cfg.websocketTimeout,
        reconnection: true,
        reconnectionDelay: cfg.reconnectionDelay,
        reconnectionAttempts: cfg.reconnectionAttempts,
      });

      this.backendSocket.on('connect', () => {
        this.logger.info('Connected to backend WebSocket server');
        this.backendSocket?.emit('claude-bridge:connect');
        
        // Wire up permission manager with backend socket (only once)
        this.permissionManager.setBackendSocket(this.backendSocket);
        
        this.setupBackendEventHandlers();
      });

      this.backendSocket.on('disconnect', (reason) => {
        this.logger.warn('Disconnected from backend', { reason });
      });

      this.backendSocket.on('connect_error', (error) => {
        this.logger.error('Backend connection error', {}, error);
      });

      this.backendSocket.on('reconnect', (attemptNumber) => {
        this.logger.info('Reconnected to backend', { attemptNumber });
        this.backendSocket?.emit('claude-bridge:connect');
        this.backendSocket?.emit('join-room', 'claude-bridge');
      });
      
    } catch (error) {
      const bridgeError = await errorHandler.handleError(error as Error, {
        operation: 'backend_connection'
      });
      throw bridgeError;
    }
  }

  /**
   * Set up backend event handlers
   */
  private setupBackendEventHandlers(): void {
    if (!this.backendSocket) return;

    // Handle Claude Code execution requests from backend
    this.backendSocket.on('claude:execute', async (request: BridgeRequest) => {
      this.logger.info('Received claude:execute from backend', { requestId: request.requestId });
      await this.handleExecuteRequest(this.backendSocket!, request);
    });

    // Handle abort requests from backend
    this.backendSocket.on('claude:abort', (requestId: string) => {
      this.logger.info('Received claude:abort from backend', { requestId });
      this.handleAbortRequest(this.backendSocket!, requestId);
    });

    this.logger.info('Backend event handlers configured');
  }

  /**
   * Set up WebSocket handlers for client connections
   */
  private setupWebSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      this.logger.info('Client connected', { socketId: socket.id });

      // Handle Claude Code execution requests
      socket.on('claude:execute', async (request: BridgeRequest) => {
        this.logger.info('Received claude:execute from client', { 
          requestId: request.requestId,
          socketId: socket.id
        });
        await this.handleExecuteRequest(socket, request);
      });

      // Handle abort requests
      socket.on('claude:abort', (requestId: string) => {
        this.logger.info('Received claude:abort from client', { 
          requestId,
          socketId: socket.id
        });
        this.handleAbortRequest(socket, requestId);
      });

      // Handle health checks
      socket.on('bridge:health', () => {
        const healthStatus = this.resourceManager.getHealthStatus();
        socket.emit('bridge:health-response', {
          status: healthStatus.healthy ? 'ok' : 'degraded',
          service: 'modular-claude-code-bridge',
          timestamp: Date.now(),
          activeRequests: this.activeRequests.size,
          health: healthStatus
        });
      });

      // Handle file operations
      socket.on('files:list', async (data: { workingDirectory?: string; search?: string }) => {
        await this.handleFileListRequest(socket, data);
      });

      socket.on('files:content', async (data: { filePath: string; workingDirectory?: string }) => {
        await this.handleFileContentRequest(socket, data);
      });

      socket.on('disconnect', () => {
        this.logger.info('Client disconnected', { socketId: socket.id });
      });
    });
  }

  /**
   * Handle Claude Code execution request
   */
  private async handleExecuteRequest(socket: any, request: BridgeRequest): Promise<void> {
    const contextLogger = new ContextualLogger(logger, 'ModularBridge', request.requestId);
    
    try {
      contextLogger.info('Handling execute request', {
        conversationId: request.conversationId,
        projectId: request.projectId,
        sessionId: request.sessionId,
        messageLength: request.message.length
      });

      // Check if system can accept new request
      const canAccept = this.resourceManager.canAcceptNewRequest();
      if (!canAccept.allowed) {
        socket.emit('claude:error', {
          requestId: request.requestId,
          error: canAccept.reason,
          timestamp: Date.now()
        });
        return;
      }

      // Increment request counter
      this.resourceManager.incrementRequestCount();

      // Convert bridge request to Claude request (conversationId-first)
      const claudeRequest: ClaudeRequest = {
        message: request.message,
        requestId: request.requestId,
        conversationId: request.conversationId,
        projectId: request.projectId,
        sessionId: request.sessionId,
        allowedTools: request.allowedTools,
        workingDirectory: request.workingDirectory,
        permissionMode: request.permissionMode,
        projectName: request.projectName
      };

      let currentSessionId = request.sessionId;

      // Execute Claude query using the SDK
      for await (const sdkMessage of this.claudeSDK.executeQuery(claudeRequest)) {
        // Capture session ID from system messages
        if (sdkMessage.type === "system" && sdkMessage.session_id) {
          currentSessionId = sdkMessage.session_id;
        }

        // Send stream response
        const streamResponse: StreamResponse = {
          type: "claude_json",
          data: sdkMessage,
          requestId: request.requestId,
          timestamp: Date.now(),
          sessionId: sdkMessage.session_id as string
        };
        
        socket.emit('claude:stream', streamResponse);

        // Handle completion
        if (sdkMessage.type === "result") {
          contextLogger.info('Claude Code execution completed', {
            subtype: sdkMessage.subtype
          });
          break;
        }
      }

      // Send completion
      socket.emit('claude:complete', {
        requestId: request.requestId,
        sessionId: currentSessionId,
        timestamp: Date.now()
      });

      contextLogger.info('Execute request completed');

    } catch (error) {
      contextLogger.error('Execute request failed', {}, error);
      
      this.resourceManager.incrementErrorCount();
      const bridgeError = await errorHandler.handleError(error as Error, {
        requestId: request.requestId,
        operation: 'claude_execute',
        projectId: request.projectId
      });

      if (error instanceof Error && error.name === 'AbortError') {
        socket.emit('claude:aborted', {
          requestId: request.requestId,
          timestamp: Date.now()
        });
      } else {
        socket.emit('claude:error', {
          requestId: request.requestId,
          error: bridgeError.userMessage,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Handle abort request
   */
  private handleAbortRequest(socket: any, requestId: string): void {
    try {
      if (!requestId) {
        socket.emit('claude:error', {
          requestId: 'unknown',
          error: 'Request ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const success = this.claudeSDK.abortQuery(requestId);
      
      if (success) {
        this.logger.info('Request aborted successfully', { requestId });
        socket.emit('claude:aborted', {
          requestId,
          message: 'Request aborted successfully',
          timestamp: Date.now()
        });
      } else {
        this.logger.warn('No active request found to abort', { requestId });
        socket.emit('claude:error', {
          requestId,
          error: 'Request not found or already completed',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.logger.error('Abort request error', {}, error);
      socket.emit('claude:error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle file list request
   */
  private async handleFileListRequest(socket: any, data: { workingDirectory?: string; search?: string }): Promise<void> {
    try {
      const workingDir = data.workingDirectory || process.cwd();
      const search = data.search || '';
      
      this.logger.debug('File list request', { workingDir, search });
      
      const files = await this.resourceManager.scanDirectory(workingDir, search);
      
      socket.emit('files:list-response', {
        files,
        workingDirectory: workingDir,
        count: files.length
      });
      
    } catch (error) {
      this.logger.error('File list request error', {}, error);
      socket.emit('files:list-response', {
        error: error instanceof Error ? error.message : String(error),
        files: [],
        workingDirectory: data.workingDirectory || process.cwd(),
        count: 0
      });
    }
  }

  /**
   * Handle file content request
   */
  private async handleFileContentRequest(socket: any, data: { filePath: string; workingDirectory?: string }): Promise<void> {
    try {
      const { filePath, workingDirectory } = data;
      
      if (!filePath) {
        socket.emit('files:content-response', {
          error: 'File path is required'
        });
        return;
      }

      const fileData = await this.resourceManager.readFileContent(filePath, workingDirectory);
      
      socket.emit('files:content-response', fileData);
      
    } catch (error) {
      this.logger.error('File content request error', {}, error);
      socket.emit('files:content-response', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping Modular Claude Code Bridge');

    try {
      // Abort all active Claude queries
      const activeQueries = this.claudeSDK.getActiveQueryIds();
      for (const requestId of activeQueries) {
        this.claudeSDK.abortQuery(requestId);
      }
      
      // Close all streams
      this.streamManager.closeAllStreams();
      
      // Shutdown resource manager
      await this.resourceManager.shutdown();
      
      // Close Socket.IO server
      if (this.io) {
        this.io.close();
        this.io = null;
      }
      
      // Disconnect from backend
      if (this.backendSocket) {
        this.backendSocket.disconnect();
        this.backendSocket = null;
      }
      
      // Final logger shutdown
      await logger.shutdown();
      
      this.logger.info('Modular Bridge stopped successfully');
      
    } catch (error) {
      const bridgeError = await errorHandler.handleError(error as Error, {
        operation: 'bridge_shutdown'
      });
      this.logger.critical('Bridge shutdown error', {}, bridgeError);
    }
  }

  /**
   * Get bridge status and metrics
   */
  getStatus() {
    return {
      service: 'modular-claude-code-bridge',
      version: '2.0.0',
      uptime: process.uptime(),
      activeRequests: this.claudeSDK.getActiveQueryCount(),
      activeStreams: this.streamManager.getActiveStreamCount(),
      resourceHealth: this.resourceManager.getHealthStatus(),
      errorStats: errorHandler.getErrorStatistics(),
      config: this.config.getConfig()
    };
  }
}