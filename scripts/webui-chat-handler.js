#!/usr/bin/env node

/**
 * WebUI Chat Handler - Based on Claude Code WebUI Architecture
 * 
 * This is a complete rewrite following the WebUI comprehensive guide exactly.
 * Runs on user's local machine and streams directly to backend's NDJSON endpoint.
 */

const { query } = require("@anthropic-ai/claude-code");
const axios = require("axios");
const { io } = require("socket.io-client");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 2000;

// Token-efficient session management constants
const COMPACTION_THRESHOLD = 150000; // 150k tokens (75% of 200k limit)
const TOKEN_ESTIMATE_PER_MESSAGE = 500; // Rough estimate for token tracking

// Request tracking (following WebUI pattern exactly)
const requestAbortControllers = new Map();

class WebUIChatHandler {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  /**
   * Detects permission errors in Claude Code messages (WebUI pattern)
   * Based on SDK types: SDKAssistantMessage has message: APIAssistantMessage
   */
  isPermissionError(sdkMessage) {
    if (!sdkMessage) return false;

    console.log(`🔍 Full sdkMessage type: ${sdkMessage.type}`);
    console.log(`🔍 Full sdkMessage structure:`, JSON.stringify(sdkMessage, null, 2));

    // Check assistant AND user messages for permission error indicators
    // Permission errors often come as user messages with tool_result content
    if ((sdkMessage.type === 'assistant' || sdkMessage.type === 'user') && sdkMessage.message && sdkMessage.message.content) {
      let content = '';
      
      try {
        // Handle APIAssistantMessage.content which can be string or ContentBlock[]
        if (typeof sdkMessage.message.content === 'string') {
          content = sdkMessage.message.content;
        } else if (Array.isArray(sdkMessage.message.content)) {
          // Content is ContentBlock[] - each block can be text, tool_use, tool_result
          content = sdkMessage.message.content.map(block => {
            if (typeof block === 'string') return block;
            
            if (block && typeof block === 'object') {
              // Handle different content block types from Anthropic SDK
              switch (block.type) {
                case 'text':
                  return block.text || '';
                case 'tool_use':
                  return `Tool use: ${block.name || 'unknown'}`;
                case 'tool_result':
                  // tool_result can have content as string or ContentBlock[]
                  if (typeof block.content === 'string') {
                    return block.content;
                  } else if (Array.isArray(block.content)) {
                    return block.content.map(c => {
                      if (typeof c === 'string') return c;
                      if (c && typeof c === 'object') {
                        return c.text || c.content || JSON.stringify(c);
                      }
                      return String(c);
                    }).join(' ');
                  } else if (block.content && typeof block.content === 'object') {
                    return JSON.stringify(block.content);
                  }
                  return String(block.content || '');
                default:
                  // Handle unknown block types
                  return block.text || block.content || JSON.stringify(block);
              }
            }
            return String(block);
          }).join(' ');
        } else {
          content = String(sdkMessage.message.content);
        }
      } catch (error) {
        console.error(`❌ Error parsing message content:`, error);
        content = String(sdkMessage.message.content || '');
      }

      console.log(`🔍 Extracted content (${content.length} chars): "${content.substring(0, 200)}..."`);

      // Check for permission error patterns
      const permissionPatterns = [
        "requested permissions", 
        "haven't granted it yet",  // Exact match from Claude Code!
        "but you haven't granted it yet", // More specific match
        "permission denied",
        "not allowed to use",
        "Don't have permission",
        "not in the allowed tools list",
        "tool is not available",
        "Permission error", 
        "access denied",
        "Edit tool is not available",
        "MultiEdit tool is not available", 
        "Write tool is not available",
        "Tool not found",
        "is not in your allowed tools",
        "cannot be used because",
        "requires permission"
      ];

      const hasPermissionError = permissionPatterns.some(pattern => 
        content.toLowerCase().includes(pattern.toLowerCase())
      );

      if (hasPermissionError) {
        console.log(`🔐 PERMISSION ERROR DETECTED! Content contains permission patterns`);
        return true;
      }

      return false;
    }

    return false;
  }

  /**
   * Load conversation details including session ID and context tokens
   */
  async loadConversation(conversationId) {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversation/${conversationId}`);
      const conversation = response.data.conversation;
      
      console.log(`📊 Loaded conversation: ID=${conversationId}, Session=${conversation?.claudeSessionId || 'new'}, Tokens=${conversation?.contextTokens || 0}`);
      
      return conversation;
    } catch (error) {
      console.error(`❌ Failed to load conversation ${conversationId}:`, error.message);
      return null;
    }
  }

  /**
   * Store Claude Code session ID for conversation
   */
  async storeSessionId(conversationId, sessionId) {
    try {
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/session`, {
        claudeSessionId: sessionId,
      });
      console.log(`💾 Stored session ID ${sessionId} for conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Failed to store session ID:`, error.message);
    }
  }

  /**
   * Update token usage for conversation
   */
  async updateTokenUsage(conversationId, additionalTokens) {
    try {
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/tokens`, {
        additionalTokens: additionalTokens,
      });
      console.log(`📈 Updated tokens: +${additionalTokens} for conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Failed to update token usage:`, error.message);
    }
  }

  /**
   * Compact conversation context using Claude Code's built-in /compact command
   */
  async compactContext(conversation) {
    if (!conversation?.claudeSessionId) {
      console.log("⚠️  No session ID available for compaction");
      return false;
    }

    console.log(`🗜️  Compacting context for session ${conversation.claudeSessionId} (${conversation.contextTokens} tokens)`);

    try {
      // Use Claude Code's built-in compaction
      for await (const message of query({
        prompt: "/compact Preserve key context about our discussion topics, ongoing tasks, and project-specific information",
        options: {
          maxTurns: 1,
          resume: conversation.claudeSessionId,
          executable: "node",
          executableArgs: [],
          pathToClaudeCodeExecutable: "/home/hassan/.claude/local/node_modules/.bin/claude",
        },
      })) {
        console.log(`✅ Context compacted for conversation ${conversation.id}`);
      }

      // Update compaction timestamp
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversation.id}/compact`, {
        compactedAt: new Date().toISOString(),
        tokenReductionEstimate: 0.7, // Estimate 70% reduction
      });

      console.log(`🗜️  Compaction completed for conversation ${conversation.id}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to compact context:`, error.message);
      return false;
    }
  }

  /**
   * Main streaming function using WebUI permission pattern with token-efficient session management
   */
  async* executeClaudeCommand(message, requestId, sessionId, allowedTools, workingDirectory, permissionMode) {
    let abortController;

    try {
      // Create and store AbortController for this request (WebUI pattern)
      abortController = new AbortController();
      requestAbortControllers.set(requestId, abortController);

      console.log(`🚀 Starting Claude Code stream for request ${requestId}`);
      console.log(`📡 Message: "${message.substring(0, 100)}..."`);

      // Execute Claude SDK with standard options (WebUI pattern)
      for await (const sdkMessage of query({
        prompt: message,
        options: {
          abortController,
          executable: "node",
          executableArgs: [],
          pathToClaudeCodeExecutable: "/home/hassan/.claude/local/node_modules/.bin/claude",
          ...(sessionId ? { resume: sessionId } : {}),
          ...(allowedTools ? { allowedTools } : {}),
          ...(workingDirectory ? { cwd: workingDirectory } : {}),
          permissionMode: permissionMode || 'default',
          maxTurns: 5,
        },
      })) {
        // Check for permission errors in assistant messages
        if (this.isPermissionError(sdkMessage)) {
          console.log(`🔐 Permission error detected in message:`, sdkMessage);
          yield {
            type: "permission_error",
            data: sdkMessage,
          };
          continue;
        }

        // Yield streaming response (WebUI format)
        yield {
          type: "claude_json",
          data: sdkMessage,
        };
      }

      yield { type: "done" };

    } catch (error) {
      console.error('❌ Claude Code streaming error:', error);
      
      if (error.name === 'AbortError') {
        yield { type: "aborted" };
      } else {
        yield {
          type: "error",
          error: error.message || String(error),
        };
      }
    } finally {
      // Clean up AbortController from map (WebUI pattern)
      if (requestAbortControllers.has(requestId)) {
        requestAbortControllers.delete(requestId);
      }
    }
  }

  /**
   * Handle permission error by creating interactive prompt (WebUI pattern)
   */
  async handlePermissionError(sdkMessage, context) {
    console.log(`🔐 Processing permission error for context:`, context);
    
    // Extract tool information from the error message
    const content = Array.isArray(sdkMessage.message.content) 
      ? sdkMessage.message.content.map(c => c.text || c.content || String(c)).join(' ')
      : String(sdkMessage.message.content);

    // Try to extract tool name from the error message
    let toolName = 'Edit'; // Default to Edit since that's what we're testing
    if (content.includes('MultiEdit')) toolName = 'MultiEdit';
    if (content.includes('Write')) toolName = 'Write';
    if (content.includes('Bash')) toolName = 'Bash';

    console.log(`🔐 Requesting permission for ${toolName} tool based on error message`);
    
    try {
      const response = await axios.post(`${BACKEND_URL}/api/chat/prompts/tool-permission`, {
        conversationId: context.conversationId,
        toolName,
        context: `${toolName} tool usage requested - ${content.substring(0, 100)}...`,
        sessionId: context.sessionId,
        errorMessage: content
      });
      
      console.log(`📝 Created permission prompt for ${toolName}: ${response.data.promptId}`);
      
      // Wait for user response via Socket.IO
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log(`⏰ Permission request for ${toolName} timed out`);
          resolve({ allowed: false, response: 'timeout' });
        }, 30000); // 30 second timeout
        
        const responseHandler = (data) => {
          if (data.sessionId === context.sessionId) {
            clearTimeout(timeout);
            this.socket.off('session:continue', responseHandler);
            
            const allowed = data.response === 'yes' || data.response === 'yes_dont_ask';
            console.log(`✅ Permission ${allowed ? 'granted' : 'denied'} for ${toolName}`);
            
            resolve({ 
              allowed, 
              response: data.response,
              toolName: toolName 
            });
          }
        };
        
        this.socket.on('session:continue', responseHandler);
      });
      
    } catch (error) {
      console.error(`❌ Error requesting permission for ${toolName}:`, error);
      return { 
        allowed: false, 
        response: 'error',
        error: error.message 
      };
    }
  }

  /**
   * Process streaming request by executing Claude Code locally
   */
  async processStreamingRequest(request) {
    const { message, requestId, conversationId, messageId, sessionId, allowedTools, workingDirectory, permissionMode } = request;

    console.log(`📦 Processing Claude Code request ${requestId} for conversation ${conversationId}`);
    console.log(`🔧 AllowedTools: ${JSON.stringify(allowedTools)} (length: ${allowedTools?.length || 0})`);

    // Load conversation details for token-efficient session management
    const conversation = await this.loadConversation(conversationId);
    
    // Check if context compaction is needed (token efficiency)
    if (conversation && conversation.contextTokens > COMPACTION_THRESHOLD) {
      console.log(`🗜️  Context tokens (${conversation.contextTokens}) exceed threshold (${COMPACTION_THRESHOLD}), attempting compaction...`);
      await this.compactContext(conversation);
      // Reload conversation after compaction
      const updatedConversation = await this.loadConversation(conversationId);
      if (updatedConversation) {
        conversation.contextTokens = updatedConversation.contextTokens;
        conversation.lastCompacted = updatedConversation.lastCompacted;
      }
    }

    // Determine effective session ID (stored session takes precedence)
    const effectiveSessionId = conversation?.claudeSessionId || sessionId;
    console.log(`🔗 Session management: stored=${conversation?.claudeSessionId || 'none'}, provided=${sessionId || 'none'}, using=${effectiveSessionId || 'new'}`);

    // Load conversation-level permissions (WebUI-inspired approach)
    const baseAllowedTools = allowedTools || [];
    const essentialTools = ["Read", "LS", "Glob", "Grep", "WebFetch"]; // Always safe tools
    
    let effectiveAllowedTools;
    
    try {
      // Fetch granted permissions for this conversation from database
      const permissionsResponse = await axios.get(`${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`);
      const conversationPermissions = permissionsResponse.data.permissions || [];
      console.log(`🔐 Loaded ${conversationPermissions.length} conversation permissions: ${JSON.stringify(conversationPermissions)}`);
      
      // Combine base tools + essential tools + granted conversation permissions
      effectiveAllowedTools = [...new Set([...baseAllowedTools, ...essentialTools, ...conversationPermissions])];
      console.log(`🛠️  Using effective allowedTools with conversation permissions: ${JSON.stringify(effectiveAllowedTools)}`);
      
    } catch (error) {
      console.error(`⚠️  Could not load conversation permissions, using base tools only:`, error.message);
      effectiveAllowedTools = [...new Set([...baseAllowedTools, ...essentialTools])];
      console.log(`🛠️  Using fallback allowedTools: ${JSON.stringify(effectiveAllowedTools)}`);
    }
    
    // No canUseTool callback - we'll detect permission errors reactively from tool_result messages

    try {
      // Build context prompt with project information
      let contextPrompt = message;
      if (request.projectName) {
        contextPrompt = `Project: ${request.projectName}\n\n${message}`;
      }

      console.log(`🚀 Starting Claude Code execution for request ${requestId}`);
      console.log(`📡 Message: "${contextPrompt.substring(0, 100)}..."`);
      
      let fullContent = '';
      let currentSessionId = effectiveSessionId; // Use stored session ID for continuity
      let newSessionCaptured = false;
      let estimatedTokenUsage = 0;
      
      console.log(`🚀 Starting execution with session continuity: ${currentSessionId ? 'resume' : 'new'}, tools: ${JSON.stringify(effectiveAllowedTools)}`);
      
      try {
        // Execute Claude Code locally with token-efficient session management
        for await (const streamResponse of this.executeClaudeCommand(
          contextPrompt,
          requestId,
          currentSessionId, // Use stored session ID for continuity
          effectiveAllowedTools,
          workingDirectory,
          permissionMode
        )) {
            
            // Handle permission errors
            if (streamResponse.type === 'permission_error') {
              console.log(`🔐 Permission error detected, handling...`);
              
              const permissionResult = await this.handlePermissionError(streamResponse.data, {
                conversationId,
                sessionId: currentSessionId,
                requestId
              });
              
              if (permissionResult.allowed) {
                console.log(`✅ Permission granted for ${permissionResult.toolName} - stored in conversation permissions`);
                
                // Store permission in database for future use
                try {
                  await axios.post(`${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`, {
                    toolName: permissionResult.toolName,
                    status: 'granted',
                    grantedBy: 'user'
                  });
                  console.log(`💾 Stored ${permissionResult.toolName} permission in database`);
                } catch (error) {
                  console.error(`⚠️  Failed to store permission in database:`, error.message);
                }
                
                // Send informational message about permission being granted
                if (this.socket && this.socket.connected) {
                  this.socket.emit('chat-bridge:response', {
                    messageId,
                    requestId,
                    streamResponse: {
                      type: "claude_json",
                      data: {
                        type: "system",
                        message: {
                          content: `Permission granted for ${permissionResult.toolName} tool. This permission will be remembered for future requests in this conversation. Please retry your request.`
                        }
                      }
                    },
                    content: `Permission granted for ${permissionResult.toolName} tool. This permission will be remembered for future requests in this conversation.`,
                    isComplete: false,
                    sessionId: currentSessionId
                  });
                }
                
              } else {
                console.log(`❌ Permission denied, continuing with error`);
                // Send permission denied message to frontend
                if (this.socket && this.socket.connected) {
                  this.socket.emit('chat-bridge:response', {
                    messageId,
                    requestId,
                    streamResponse: {
                      type: "error",
                      error: `Permission denied for ${permissionResult.toolName} tool`
                    },
                    content: `Permission denied for ${permissionResult.toolName} tool`,
                    isComplete: true,
                    sessionId: currentSessionId
                  });
                }
                return; // Exit completely on permission denial
              }
              
              // Continue processing the stream without restarting
              continue;
            }
            
            // Extract content for database storage
            if (streamResponse.type === 'claude_json' && streamResponse.data) {
              const sdkMessage = streamResponse.data;
              
              // Token-efficient session ID capture and management
              const newSessionId = sdkMessage.sessionId || sdkMessage.session_id ||
                                (sdkMessage.message && (sdkMessage.message.sessionId || sdkMessage.message.session_id));
              
              // Store new session ID if captured and not already stored
              if (newSessionId && (!conversation?.claudeSessionId || newSessionId !== conversation.claudeSessionId)) {
                currentSessionId = newSessionId;
                console.log(`🆔 Captured new session ID: ${currentSessionId}`);
                
                // Store session ID asynchronously for future requests
                if (!newSessionCaptured) {
                  newSessionCaptured = true;
                  this.storeSessionId(conversationId, newSessionId).catch(err => {
                    console.error(`⚠️  Failed to store session ID:`, err.message);
                  });
                }
              } else if (!currentSessionId && conversation?.claudeSessionId) {
                currentSessionId = conversation.claudeSessionId;
              }

              // Extract text content for database storage and estimate token usage
              if (sdkMessage.type === 'assistant' && sdkMessage.message) {
                let textContent = '';
                if (Array.isArray(sdkMessage.message.content)) {
                  textContent = sdkMessage.message.content
                    .filter((block) => block.type === 'text')
                    .map((block) => block.text)
                    .join('');
                } else if (typeof sdkMessage.message.content === 'string') {
                  textContent = sdkMessage.message.content;
                }
                
                if (textContent && textContent !== fullContent) {
                  fullContent = textContent;
                  // Estimate token usage for tracking (rough approximation: ~4 chars per token)
                  estimatedTokenUsage = Math.max(estimatedTokenUsage, Math.ceil(textContent.length / 4));
                }
              } else if (sdkMessage.type === 'result' && sdkMessage.result) {
                fullContent = sdkMessage.result;
                estimatedTokenUsage = Math.max(estimatedTokenUsage, Math.ceil(sdkMessage.result.length / 4));
              }
            }

            // Send streaming response back to backend via Socket.IO
            if (this.socket && this.socket.connected) {
              this.socket.emit('chat-bridge:response', {
                messageId,
                requestId,
                streamResponse,
                content: fullContent,
                isComplete: streamResponse.type === 'done' || streamResponse.type === 'error' || streamResponse.type === 'aborted',
                sessionId: currentSessionId
              });
            }
            
            // Handle completion and update token usage
            if (streamResponse.type === 'done' || streamResponse.type === 'error' || streamResponse.type === 'aborted') {
              console.log(`✅ Claude Code execution completed for request ${requestId}`);
              
              // Update token usage for session management (token efficiency)
              if (estimatedTokenUsage > 0) {
                const totalEstimatedTokens = estimatedTokenUsage + TOKEN_ESTIMATE_PER_MESSAGE;
                this.updateTokenUsage(conversationId, totalEstimatedTokens).catch(err => {
                  console.error(`⚠️  Failed to update token usage:`, err.message);
                });
              }
              
              break;
            }
          }
      } catch (executionError) {
        console.error(`❌ Error during Claude Code execution:`, executionError);
        throw executionError;
      }

    } catch (error) {
      console.error(`❌ Error executing Claude Code for request ${requestId}:`, error);
      
      // Send error response back to backend
      if (this.socket && this.socket.connected) {
        this.socket.emit('chat-bridge:response', {
          messageId,
          requestId,
          content: '',
          isComplete: true,
          error: error.message || String(error),
        });
      }
    }
  }

  /**
   * Handle abort request (WebUI pattern exactly)
   */
  handleAbortRequest(requestId) {
    const abortController = requestAbortControllers.get(requestId);
    if (abortController) {
      abortController.abort();
      requestAbortControllers.delete(requestId);
      console.log(`⏹️ Request ${requestId} aborted successfully`);
      return true;
    }
    
    console.warn(`⚠️ No abort controller found for request ${requestId}`);
    return false;
  }

  /**
   * Connect to backend via Socket.IO (for compatibility with existing system)
   */
  connectSocket() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("🔌 Connected to Baton backend via Socket.IO");
      this.isConnected = true;
      
      // Register as chat bridge
      this.socket.emit("chat-bridge:connect");
    });

    this.socket.on("chat:request", async (request) => {
      console.log(`📬 Received chat request: ${request.messageId || request.requestId}`);
      await this.processStreamingRequest(request);
    });

    this.socket.on("chat:pending", async (requests) => {
      console.log(`📬 Received ${requests.length} pending requests`);
      for (const request of requests) {
        await this.processStreamingRequest(request);
      }
    });

    this.socket.on("abort:request", (data) => {
      console.log(`⏹️ Abort request received: ${data.requestId}`);
      this.handleAbortRequest(data.requestId);
    });

    this.socket.on("disconnect", () => {
      console.log("🔌 Disconnected from backend");
      this.isConnected = false;
    });

    this.socket.on("error", (error) => {
      console.error("❌ Socket error:", error);
    });
  }

  /**
   * Polling fallback for when Socket.IO is not available
   */
  async pollForRequests() {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/pending`);
      const { requests } = response.data;

      if (requests && requests.length > 0) {
        console.log(`📥 Polled ${requests.length} pending requests`);
        for (const request of requests) {
          await this.processStreamingRequest(request);
        }
      }
    } catch (error) {
      if (error.code !== 'ECONNRESET') {
        console.error("❌ Error polling for requests:", error.message);
      }
    }
  }

  /**
   * Start the handler
   */
  async start() {
    console.log("🚀 Starting WebUI Chat Handler...");
    console.log(`🌐 Backend URL: ${BACKEND_URL}`);
    console.log(`📡 Using WebUI streaming endpoint: ${BACKEND_URL}/api/chat/messages/stream-webui`);

    // Connect via Socket.IO (primary)
    this.connectSocket();

    // Polling fallback (secondary)
    setInterval(() => {
      if (!this.isConnected) {
        this.pollForRequests();
      }
    }, POLLING_INTERVAL);

    console.log("✅ WebUI Chat Handler ready");
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    console.log("\n🛑 Shutting down WebUI Chat Handler...");
    
    // Abort all pending requests
    for (const [requestId, abortController] of requestAbortControllers) {
      console.log(`⏹️ Aborting pending request: ${requestId}`);
      abortController.abort();
    }
    requestAbortControllers.clear();

    // Disconnect Socket.IO
    if (this.socket) {
      this.socket.disconnect();
    }

    console.log("✅ WebUI Chat Handler shutdown complete");
    process.exit(0);
  }
}

// Create and start handler
const handler = new WebUIChatHandler();

// Start the handler
handler.start().catch(error => {
  console.error("❌ Fatal error starting WebUI Chat Handler:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", () => handler.shutdown());
process.on("SIGTERM", () => handler.shutdown());