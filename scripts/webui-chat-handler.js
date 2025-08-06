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
   * Main streaming function using AsyncGenerator pattern (following WebUI exactly)
   */
  async* executeClaudeCommand(message, requestId, sessionId, allowedTools, workingDirectory, permissionMode) {
    let abortController;

    try {
      // Create and store AbortController for this request (WebUI pattern)
      abortController = new AbortController();
      requestAbortControllers.set(requestId, abortController);

      console.log(`🚀 Starting Claude Code stream for request ${requestId}`);
      console.log(`📡 Message: "${message.substring(0, 100)}..."`);

      // Execute Claude SDK with options (following WebUI patterns exactly)
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
          maxTurns: 1,
        },
      })) {
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
   * Process streaming request by executing Claude Code locally
   */
  async processStreamingRequest(request) {
    const { message, requestId, conversationId, messageId, sessionId, allowedTools, workingDirectory, permissionMode } = request;

    console.log(`📦 Processing Claude Code request ${requestId} for conversation ${conversationId}`);

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

      // Execute Claude Code locally and stream responses back to backend via Socket.IO
      for await (const streamResponse of this.executeClaudeCommand(
        contextPrompt,
        requestId,
        sessionId,
        allowedTools,
        workingDirectory,
        permissionMode
      )) {
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
        
        // Handle completion
        if (streamResponse.type === 'done' || streamResponse.type === 'error' || streamResponse.type === 'aborted') {
          console.log(`✅ Claude Code execution completed for request ${requestId}`);
          break;
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