/**
 * Claude SDK Interaction Layer
 */

import { query, type PermissionResult, type SDKUserMessage, type PermissionMode, Options } from "@anthropic-ai/claude-code";
import { config } from './config';
import { logger, ContextualLogger } from './logger';
import { PermissionManager, type PermissionRequest } from './permissions';

/**
 * Claude SDK Request Interface - ConversationId-first Architecture
 * ================================================================
 * - conversationId: Primary identifier for conversation operations
 * - projectId: Optional project context for working directory and permissions
 * - sessionId: Optional Claude Code session ID for conversation resumption
 * - When sessionId provided: Sets claudeOptions.resume for context continuity
 * - When sessionId missing: Creates new Claude Code session
 */
export interface ClaudeRequest {
  message: string;
  requestId: string;
  conversationId: string;   // Primary conversation identifier
  projectId?: string;       // Project context for working directory
  sessionId?: string;       // Claude Code session for resumption  
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: PermissionMode;
  projectName?: string;
}

export interface ClaudeOptions {
  abortController: AbortController;
  executable: string;
  executableArgs: string[];
  pathToClaudeCodeExecutable: string;
  maxTurns: number;
  mcpServers: Record<string, any>;
  permissionMode: PermissionMode;
  resume?: string;
  model: string;
  cwd?: string;
  allowedTools?: string[];
  canUseTool?: (toolName: string, parameters: Record<string, any>) => Promise<PermissionResult>;
}

export class ClaudeSDK {
  private permissionManager: PermissionManager;
  private logger: ContextualLogger;
  private activeQueries = new Map<string, AbortController>();

  constructor(logger?: ContextualLogger, permissionManager?: PermissionManager) {
    this.permissionManager = permissionManager || new PermissionManager();
    this.logger = logger || new ContextualLogger(logger, 'ClaudeSDK');
  }

  /**
   * Execute a Claude Code query
   */
  async *executeQuery(request: ClaudeRequest): AsyncGenerator<any, void, unknown> {
    const { requestId, conversationId, projectId, message, projectName, sessionId } = request;
    const contextLogger = new ContextualLogger(logger, 'ClaudeSDK', requestId);
    
    contextLogger.info('Starting Claude Code execution', {
      conversationId,
      projectId,
      sessionId: sessionId || 'new',
      projectName,
      messageLength: message.length
    });

    try {
      // Create abort controller for this request
      const abortController = new AbortController();
      this.activeQueries.set(requestId, abortController);

      // Build Claude options
      const claudeOptions = await this.buildClaudeOptions(request, abortController);
      
      // Create prompt stream
      const promptStream = this.createPromptStream(message, projectName, sessionId, requestId);

      let messageCount = 0;
      let lastMessageTime = Date.now();

      // Execute Claude query
      for await (const sdkMessage of query({
        prompt: promptStream,
        options: claudeOptions as Options
      })) {
        messageCount++;
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        lastMessageTime = now;

        // Enhanced logging for session ID tracking
        if (sdkMessage.session_id) {
          if (sessionId && sessionId !== sdkMessage.session_id) {
            contextLogger.warn('🚨 Claude returned DIFFERENT session ID than requested', {
              requestedSessionId: sessionId,
              claudeReturnedSessionId: sdkMessage.session_id,
              messageType: sdkMessage.type,
              messageCount,
              resumeAttempted: !!sessionId
            });
          } else if (sessionId && sessionId === sdkMessage.session_id) {
            contextLogger.info('✅ Claude returned SAME session ID as requested', {
              sessionId: sdkMessage.session_id,
              messageType: sdkMessage.type,
              messageCount,
              resumeSuccessful: true
            });
          } else if (!sessionId) {
            contextLogger.info('🆕 Claude created new session ID', {
              newSessionId: sdkMessage.session_id,
              messageType: sdkMessage.type,
              messageCount
            });
          }
        }

        // Log message details
        this.logMessage(sdkMessage, messageCount, requestId, timeSinceLastMessage);

        yield sdkMessage;

        // Check for completion
        if (sdkMessage.type === "result") {
          contextLogger.info('Claude Code execution completed', {
            subtype: sdkMessage.subtype,
            messageCount,
            totalTime: now - Date.now()
          });
          break;
        }
      }

      contextLogger.info('Query execution finished', { messageCount });

    } catch (error) {
      contextLogger.error('Claude Code execution failed', {}, error);
      throw error;
    } finally {
      // Clean up
      this.activeQueries.delete(requestId);
    }
  }

  /**
   * Abort a running query
   */
  abortQuery(requestId: string): boolean {
    const abortController = this.activeQueries.get(requestId);
    
    if (abortController) {
      abortController.abort();
      this.activeQueries.delete(requestId);
      this.logger.info('Query aborted', { requestId });
      return true;
    }
    
    this.logger.warn('No active query found to abort', { requestId });
    return false;
  }

  /**
   * Get active query count
   */
  getActiveQueryCount(): number {
    return this.activeQueries.size;
  }

  /**
   * Get list of active query IDs
   */
  getActiveQueryIds(): string[] {
    return Array.from(this.activeQueries.keys());
  }

  /**
   * Build Claude Code options
   */
  private async buildClaudeOptions(request: ClaudeRequest, abortController: AbortController): Promise<ClaudeOptions> {
    const cfg = config.getConfig();
    const { conversationId, sessionId, allowedTools, workingDirectory, permissionMode = 'default', projectId } = request;

    // Get effective permission mode from backend (conversation-first approach)
    let effectivePermissionMode = permissionMode;
    if (conversationId) {
      try {
        // Use conversation-based permission mode with project fallback
        const backendPermissionMode = await this.permissionManager.getConversationPermissionMode(conversationId);
        if (backendPermissionMode !== permissionMode) {
          this.logger.info('Permission mode updated from conversation', {
            conversationId,
            original: permissionMode,
            updated: backendPermissionMode
          });
          effectivePermissionMode = backendPermissionMode as PermissionMode;
        }
      } catch (error) {
        this.logger.warn('Failed to check backend permission mode', {}, error);
      }
    }

    const claudeOptions: any = {
      abortController,
      executable: process.execPath,
      executableArgs: [],
      pathToClaudeCodeExecutable: cfg.claudeCodePath,
      maxTurns: cfg.maxTurns,
      mcpServers: {},
      model: 'claude-sonnet-4-20250514',
      permissionMode: effectivePermissionMode as any,
      canUseTool: async (toolName: string, parameters: Record<string, any>) => {
        return this.handleToolPermission(toolName, parameters, request);
      }
    };

    // Add session resume if provided
    if (sessionId && sessionId.trim() !== "") {
      claudeOptions.resume = sessionId;
      this.logger.info('🔄 Setting Claude resume sessionId', { 
        sessionId, 
        requestId: request.requestId,
        projectId: request.projectId
      });
    } else {
      this.logger.info('🆕 New Claude session (no sessionId to resume)', { 
        requestId: request.requestId,
        projectId: request.projectId
      });
    }

    // Add working directory
    if (workingDirectory) {
      claudeOptions.cwd = workingDirectory;
    } else if (cfg.workingDirectory) {
      claudeOptions.cwd = cfg.workingDirectory;
    }

    // Add allowed tools
    if (allowedTools && allowedTools.length > 0) {
      claudeOptions.allowedTools = allowedTools;
    }

    return claudeOptions;
  }

  /**
   * Handle tool permission requests
   */
  private async handleToolPermission(
    toolName: string, 
    parameters: Record<string, any>, 
    request: ClaudeRequest
  ): Promise<PermissionResult> {
    const riskLevel = this.permissionManager.assessRiskLevel(toolName);
    
    const permissionRequest: PermissionRequest = {
      toolName,
      parameters,
      projectId: request.projectId,
      riskLevel,
      requestId: request.requestId
    };

    return await this.permissionManager.canUseTool(permissionRequest);
  }

  /**
   * Create prompt stream for Claude query
   */
  private async *createPromptStream(
    message: string, 
    projectName?: string, 
    sessionId?: string, 
    requestId?: string
  ): AsyncIterableIterator<SDKUserMessage> {
    // Build context message with project info
    let contextMessage = message;
    if (projectName) {
      contextMessage = `Project: ${projectName}\n\n${message}`;
    }

    yield {
      type: 'user',
      message: { role: 'user', content: contextMessage },
      parent_tool_use_id: null,
      session_id: sessionId || `bridge-${Date.now()}`
    };

    // Wait for completion signal (this will be resolved when the query completes)
    return new Promise<void>(() => {}); // This keeps the generator alive
  }

  /**
   * Log message details
   */
  private logMessage(
    sdkMessage: any, 
    messageCount: number, 
    requestId: string, 
    timeSinceLastMessage: number
  ): void {
    // Basic message logging
    if (messageCount <= 5) { // Log first 5 messages in detail
      this.logger.debug('Claude message received', {
        messageCount,
        type: sdkMessage.type || 'unknown',
        timeSinceLastMessage
      });
    }

    // Detailed content analysis
    try {
      const type = sdkMessage.type;
      const role = sdkMessage.message?.role || 'n/a';
      const content = sdkMessage.message?.content;
      
      const contentSummary = this.summarizeContent(content);
      
      this.logger.debug('Message details', {
        seq: messageCount,
        type,
        role,
        content: contentSummary,
        responseTime: timeSinceLastMessage
      });
      
    } catch (error) {
      this.logger.debug('Could not analyze message content', {
        seq: messageCount
      });
    }

    // Log structured message for analysis
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('Full Claude message', {
        message: JSON.stringify(sdkMessage, null, 2)
      });
    }
  }

  /**
   * Summarize message content for logging
   */
  private summarizeContent(content: any): string {
    if (!content) return 'none';
    
    if (typeof content === 'string') {
      return `str(${content.length})`;
    }
    
    if (Array.isArray(content)) {
      const textBlocks = content.filter((c: any) => c?.type === 'text');
      const toolBlocks = content.filter((c: any) => c?.type === 'tool_use');
      const textLen = textBlocks
        .map((t: any) => (t?.text || '').length)
        .reduce((a: number, b: number) => a + b, 0);
      
      return `array{text:${textBlocks.length} (${textLen} chars), tools:${toolBlocks.length}}`;
    }
    
    return typeof content;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Claude SDK', {
      activeQueries: this.activeQueries.size
    });

    // Abort all active queries
    for (const [requestId, abortController] of this.activeQueries) {
      abortController.abort();
      this.logger.info('Aborted query during cleanup', { requestId });
    }
    
    this.activeQueries.clear();
  }
}