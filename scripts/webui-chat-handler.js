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
   * Main streaming function using WebUI permission pattern
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

    // Use extremely restrictive allowedTools to force permission errors
    const baseAllowedTools = allowedTools || [];
    const essentialTools = []; // NO essential tools to force permission errors
    let effectiveAllowedTools = [...new Set([...baseAllowedTools, ...essentialTools])];
    
    console.log(`🛠️  Using effective allowedTools: ${JSON.stringify(effectiveAllowedTools)}`);
    
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
      let currentSessionId = sessionId;

      // Restart loop - allows restarting Claude Code execution with updated permissions
      let restartExecution = true;
      let restartCount = 0;
      const maxRestarts = 5; // Prevent infinite restart loops

      while (restartExecution && restartCount < maxRestarts) {
        restartExecution = false; // Will be set to true if we need to restart
        restartCount++;
        
        console.log(`🔄 Execution attempt ${restartCount} with tools: ${JSON.stringify(effectiveAllowedTools)}`);

        try {
          // Execute Claude Code locally and stream responses back to backend via Socket.IO
          for await (const streamResponse of this.executeClaudeCommand(
            contextPrompt,
            requestId,
            currentSessionId || sessionId, // Use captured session ID for continuity
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
                console.log(`✅ Permission granted for ${permissionResult.toolName}, restarting with updated tools`);
                
                // Add the granted tool to effective allowed tools
                effectiveAllowedTools = [...new Set([...effectiveAllowedTools, permissionResult.toolName])];
                console.log(`🔧 Updated allowedTools: ${JSON.stringify(effectiveAllowedTools)}`);
                
                // Set restart flag to break out of current stream and restart
                restartExecution = true;
                break; // Break out of the streaming loop
                
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
            }
            
            // Extract content for database storage
            if (streamResponse.type === 'claude_json' && streamResponse.data) {
              const sdkMessage = streamResponse.data;
              
              // Capture session ID
              const newSessionId = sdkMessage.sessionId || sdkMessage.session_id ||
                                (sdkMessage.message && (sdkMessage.message.sessionId || sdkMessage.message.session_id));
              
              if (newSessionId && !currentSessionId) {
                currentSessionId = newSessionId;
                console.log(`🆔 Captured session ID: ${currentSessionId}`);
              }

              // Extract text content for database storage
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
                }
              } else if (sdkMessage.type === 'result' && sdkMessage.result) {
                fullContent = sdkMessage.result;
              }
            }

            // Send streaming response back to backend via Socket.IO (only if not restarting)
            if (!restartExecution && this.socket && this.socket.connected) {
              this.socket.emit('chat-bridge:response', {
                messageId,
                requestId,
                streamResponse,
                content: fullContent,
                isComplete: streamResponse.type === 'done' || streamResponse.type === 'error' || streamResponse.type === 'aborted',
                sessionId: currentSessionId
              });
            }
            
            // Handle completion
            if (streamResponse.type === 'done' || streamResponse.type === 'error' || streamResponse.type === 'aborted') {
              console.log(`✅ Claude Code execution completed for request ${requestId}`);
              restartExecution = false; // Ensure we don't restart on completion
              break;
            }
          }

        } catch (restartError) {
          console.error(`❌ Error during execution attempt ${restartCount}:`, restartError);
          if (restartCount >= maxRestarts) {
            throw restartError; // Re-throw if max restarts exceeded
          }
          // Continue to next restart attempt
        }
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