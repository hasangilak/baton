#!/usr/bin/env node

/**
 * WebUI Chat Handler - Working Version without AsyncIterable
 * 
 * This version avoids AsyncIterable entirely since it causes Claude Code to exit with code 1.
 * Uses string prompts only, which are known to work.
 */

const { query } = require("@anthropic-ai/claude-code");
const axios = require("axios");
const { io } = require("socket.io-client");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 2000;

// Token management constants
const COMPACTION_THRESHOLD = 150000;
const TOKEN_ESTIMATE_PER_MESSAGE = 500;

// Request tracking
const requestAbortControllers = new Map();

// Permission tracking
const pendingPermissionRequests = new Map();

class WebUIChatHandler {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  /**
   * Create an interactive permission prompt for a tool
   */
  async createPermissionPrompt(toolName, context) {
    try {
      const promptData = {
        type: 'tool_permission',
        title: 'Tool Permission Required',
        message: `Claude Code wants to use the ${toolName} tool. This tool can modify files and execute commands.`,
        options: [
          {
            id: '1',
            label: 'Allow Once',
            value: 'allow_once',
            isRecommended: false
          },
          {
            id: '2', 
            label: 'Allow Always',
            value: 'allow_always',
            isRecommended: true
          },
          {
            id: '3',
            label: 'Deny',
            value: 'deny',
            isRecommended: false
          }
        ],
        context: {
          toolName,
          projectPath: context.workingDirectory,
          originalContext: context.requestId
        }
      };

      const response = await axios.post(
        `${BACKEND_URL}/api/chat/conversations/${context.conversationId}/prompts`,
        promptData,
        { timeout: 10000 }
      );

      if (response.data.success) {
        console.log(`🔐 Created permission prompt for ${toolName}:`, response.data.prompt.id);
        return response.data.prompt;
      } else {
        throw new Error('Failed to create permission prompt');
      }
    } catch (error) {
      console.error(`❌ Error creating permission prompt:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for user permission response
   */
  async waitForPermissionResponse(promptId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingPermissionRequests.delete(promptId);
        reject(new Error('Permission request timed out'));
      }, timeoutMs);

      // Store the resolver for this prompt
      pendingPermissionRequests.set(promptId, {
        resolve: (response) => {
          clearTimeout(timeoutId);
          pendingPermissionRequests.delete(promptId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          pendingPermissionRequests.delete(promptId);
          reject(error);
        }
      });
    });
  }

  /**
   * Handle permission response from user
   */
  handlePermissionResponse(promptId, response) {
    const pendingRequest = pendingPermissionRequests.get(promptId);
    if (pendingRequest) {
      console.log(`📨 Received permission response for prompt ${promptId}:`, response);
      pendingRequest.resolve(response);
    } else {
      console.warn(`⚠️ No pending permission request found for prompt ${promptId}`);
    }
  }

  /**
   * Permission handler with interactive prompts
   */
  async handleToolPermission(toolName, context) {
    console.log(`🔧 Tool permission check: ${toolName}`);
    
    // Safe tools list - auto-allow (matches the list in processStreamingRequest)
    const safeTools = ["Read", "LS", "Glob", "Grep", "WebFetch", "WebSearch"];
    if (safeTools.includes(toolName)) {
      console.log(`✅ Tool ${toolName} is safe-listed`);
      return true;
    }

    // Check database permissions first
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/conversations/${context.conversationId}/permissions`,
        { timeout: 5000 }
      );
      
      const permissions = response.data.permissions || [];
      if (permissions.includes(toolName)) {
        console.log(`✅ Tool ${toolName} already permitted`);
        return true;
      }
    } catch (error) {
      console.log(`⚠️ Could not check permissions: ${error.message}`);
    }

    // Need user permission - create interactive prompt
    try {
      console.log(`🔐 Requesting user permission for ${toolName}`);
      const prompt = await this.createPermissionPrompt(toolName, context);
      
      // Wait for user response
      const response = await this.waitForPermissionResponse(prompt.id);
      
      if (response.value === 'allow_once' || response.value === 'allow_always') {
        console.log(`✅ User granted permission for ${toolName}`);
        
        // Store permission in database if "allow always"
        if (response.value === 'allow_always') {
          try {
            await axios.post(
              `${BACKEND_URL}/api/chat/conversations/${context.conversationId}/permissions`,
              {
                toolName,
                status: 'granted',
                grantedBy: 'user'
              },
              { timeout: 5000 }
            );
            console.log(`💾 Stored permanent permission for ${toolName}`);
          } catch (error) {
            console.error(`⚠️ Failed to store permission:`, error.message);
          }
        }
        
        return true;
      } else {
        console.log(`❌ User denied permission for ${toolName}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Permission request failed for ${toolName}:`, error.message);
      // Fallback to deny for security
      return false;
    }
  }

  /**
   * Check if message is a permission error
   */
  isPermissionError(sdkMessage) {
    if (!sdkMessage) return false;

    let content = "";
    
    // Extract content from various message formats
    if (sdkMessage.type === "assistant" && sdkMessage.message?.content) {
      if (typeof sdkMessage.message.content === "string") {
        content = sdkMessage.message.content;
      } else if (Array.isArray(sdkMessage.message.content)) {
        content = sdkMessage.message.content
          .map(block => {
            if (typeof block === "string") return block;
            if (block?.type === "text") return block.text || "";
            return "";
          })
          .join(" ");
      }
    } else if (sdkMessage.type === "text" && sdkMessage.text) {
      content = sdkMessage.text;
    } else if (sdkMessage.content) {
      content = typeof sdkMessage.content === "string" ? sdkMessage.content : JSON.stringify(sdkMessage.content);
    }

    // Comprehensive permission detection patterns
    const permissionPatterns = [
      // Direct permission asks
      "permission", "not allowed", "not available", "requires approval", "grant access",
      
      // Claude Code interactive prompts  
      "do you want to", "should i", "may i", "can i", "would you like me to",
      "shall i", "is it okay to", "proceed with", "continue with",
      
      // Tool usage requests
      "use the", "run the", "execute the", "perform", "invoke",
      
      // File operations
      "create a file", "write to", "modify", "delete", "overwrite",
      "save to", "read from", "access file",
      
      // System actions  
      "install", "download", "connect to", "access system", "run command",
      
      // Interactive confirmations
      "proceed?", "continue?", "approve", "confirm", "allow me to",
      
      // Tool-specific patterns
      "writing file", "creating file", "bash command", "shell command"
    ];

    const lowerContent = content.toLowerCase();
    return permissionPatterns.some(pattern => lowerContent.includes(pattern));
  }

  /**
   * Extract tool name from permission message
   */
  extractToolFromPermissionMessage(sdkMessage) {
    if (!sdkMessage) return "Unknown";

    let content = "";
    
    // Extract content (same logic as isPermissionError)
    if (sdkMessage.type === "assistant" && sdkMessage.message?.content) {
      if (typeof sdkMessage.message.content === "string") {
        content = sdkMessage.message.content;
      } else if (Array.isArray(sdkMessage.message.content)) {
        content = sdkMessage.message.content
          .map(block => {
            if (typeof block === "string") return block;
            if (block?.type === "text") return block.text || "";
            return "";
          })
          .join(" ");
      }
    } else if (sdkMessage.type === "text" && sdkMessage.text) {
      content = sdkMessage.text;
    } else if (sdkMessage.content) {
      content = typeof sdkMessage.content === "string" ? sdkMessage.content : JSON.stringify(sdkMessage.content);
    }

    const lowerContent = content.toLowerCase();

    // Tool name extraction patterns
    const toolPatterns = [
      // Direct tool mentions
      { pattern: /use the (\w+) tool/i, tool: "$1" },
      { pattern: /run the (\w+) tool/i, tool: "$1" },
      { pattern: /(\w+) tool/i, tool: "$1" },
      
      // Action-based tool inference (more specific patterns first)
      { pattern: /(append|add to|write to|modify|edit|update) .*\.txt/i, tool: "Write" },
      { pattern: /(create|write|save) .*file/i, tool: "Write" },
      { pattern: /(edit|modify|update|change) .*file/i, tool: "Edit" },
      { pattern: /(read|access|open) .*file/i, tool: "Read" },
      { pattern: /(bash|shell|command|install|download)/i, tool: "Bash" },
      { pattern: /(search|find|grep)/i, tool: "Grep" },
      { pattern: /(list|directory|folder)/i, tool: "LS" },
      { pattern: /(web|http|url|fetch)/i, tool: "WebFetch" },
    ];

    for (const { pattern, tool } of toolPatterns) {
      const match = content.match(pattern);
      if (match) {
        return tool === "$1" ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : tool;
      }
    }

    // Fallback to generic
    return "Tool";
  }

  /**
   * Check if tool is already permitted in database
   */
  async isToolAlreadyPermitted(toolName, context) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/conversations/${context.conversationId}/permissions`,
        { timeout: 5000 }
      );
      
      const permissions = response.data.permissions || [];
      return permissions.includes(toolName);
    } catch (error) {
      console.warn(`⚠️ Could not check permissions for ${toolName}:`, error.message);
      return false;
    }
  }

  /**
   * Store permission in database for future use
   */
  async storePermissionInDatabase(toolName, context) {
    try {
      await axios.post(
        `${BACKEND_URL}/api/chat/conversations/${context.conversationId}/permissions`,
        {
          toolName,
          status: 'granted',
          grantedBy: 'user'
        },
        { timeout: 5000 }
      );
      console.log(`💾 Stored permanent permission for ${toolName}`);
    } catch (error) {
      console.error(`⚠️ Failed to store permission for ${toolName}:`, error.message);
    }
  }

  /**
   * Load conversation details
   */
  async loadConversation(conversationId) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/conversation/${conversationId}`,
        { timeout: 5000 }
      );
      const conversation = response.data.conversation;
      
      console.log(`📊 Loaded conversation:`, {
        id: conversationId,
        sessionId: conversation?.claudeSessionId || "new",
        tokens: conversation?.contextTokens || 0
      });
      
      return conversation;
    } catch (error) {
      console.error(`❌ Failed to load conversation:`, error.message);
      return null;
    }
  }

  /**
   * Store session ID
   */
  async storeSessionId(conversationId, sessionId) {
    try {
      await axios.put(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/session`,
        { claudeSessionId: sessionId },
        { timeout: 5000 }
      );
      console.log(`💾 Stored session ID ${sessionId} for conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Failed to store session ID:`, error.message);
    }
  }

  /**
   * Update token usage
   */
  async updateTokenUsage(conversationId, additionalTokens) {
    try {
      await axios.put(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/tokens`,
        { additionalTokens },
        { timeout: 5000 }
      );
      console.log(`📈 Updated tokens: +${additionalTokens} for conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Failed to update token usage:`, error.message);
    }
  }

  /**
   * Execute Claude command - SIMPLIFIED VERSION WITHOUT AsyncIterable
   */
  async *executeClaudeCommand(message, requestId, sessionId, allowedTools, workingDirectory, permissionMode, context) {
    let abortController;

    try {
      abortController = new AbortController();
      requestAbortControllers.set(requestId, abortController);

      console.log(`🚀 Starting Claude Code execution`);
      console.log(`📡 Message: "${message.substring(0, 100)}..."`);
      console.log(`🔗 Session: ${sessionId ? `resuming ${sessionId}` : "new session"}`);
      console.log(`🛠️ Tools: ${allowedTools?.join(", ") || "none"}`);

      // ALWAYS use string prompt - no AsyncIterable
      const prompt = message;

      // Build options - WITHOUT stream-json format
      const options = {
        abortController,
        maxTurns: 20,
      };

      // Add session resume if available
      if (sessionId && sessionId.trim() !== "") {
        options.resume = sessionId;
        console.log(`✅ Resuming session: ${sessionId}`);
      }

      // Add allowed tools
      if (allowedTools && allowedTools.length > 0) {
        options.allowedTools = allowedTools;
      }

      // Add working directory
      if (workingDirectory) {
        options.cwd = workingDirectory;
      }

      // Add permission mode
      options.permissionMode = permissionMode || "default";

      // DO NOT add canUseTool, inputFormat, outputFormat - these require AsyncIterable
      // Permission handling will be done via message parsing instead

      console.log(`🔧 Query options (simplified):`, {
        hasAbortController: !!options.abortController,
        maxTurns: options.maxTurns,
        resume: options.resume || "none",
        allowedTools: options.allowedTools || "none",
        cwd: options.cwd || "default",
        permissionMode: options.permissionMode
      });

      // Execute query with string prompt only
      let messageCount = 0;
      let errorCount = 0;
      const maxErrors = 3;

      try {
        for await (const sdkMessage of query({ prompt, options })) {
          messageCount++;
          
          // Log first few messages for debugging
          if (messageCount <= 2) {
            console.log(`📨 Message ${messageCount} type: ${sdkMessage.type || "unknown"}`);
          }

          // Check for permission requests and intervene
          if (this.isPermissionError(sdkMessage)) {
            console.log(`🔐 Permission request detected in message ${messageCount}`);
            
            // Extract tool name from message
            const toolName = this.extractToolFromPermissionMessage(sdkMessage);
            console.log(`🔧 Extracted tool: ${toolName}`);
            
            // Check if already permitted
            const isAlreadyPermitted = await this.isToolAlreadyPermitted(toolName, context);
            if (isAlreadyPermitted) {
              console.log(`✅ Tool ${toolName} already permitted, continuing...`);
            } else {
              console.log(`🛑 Requesting user permission for tool: ${toolName}`);
              
              try {
                // Create permission prompt and wait for user response
                const prompt = await this.createPermissionPrompt(toolName, context);
                const response = await this.waitForPermissionResponse(prompt.id);
                
                if (response.value === 'deny') {
                  console.log(`❌ User denied permission for ${toolName}, aborting...`);
                  yield { type: "error", error: `Permission denied for ${toolName} tool` };
                  return;
                }
                
                console.log(`✅ User granted permission for ${toolName}, continuing...`);
                
                // Store permission if "allow always"
                if (response.value === 'allow_always') {
                  await this.storePermissionInDatabase(toolName, context);
                }
              } catch (error) {
                console.error(`❌ Permission handling failed:`, error.message);
                yield { type: "error", error: `Permission handling failed: ${error.message}` };
                return;
              }
            }
          }

          yield {
            type: "claude_json",
            data: sdkMessage,
          };
        }
      } catch (iterationError) {
        errorCount++;
        console.error(`❌ Error during iteration ${messageCount}:`, iterationError.message);
        
        if (errorCount >= maxErrors) {
          throw iterationError;
        }
        
        // Try to continue
        yield {
          type: "error",
          error: iterationError.message,
          recoverable: true
        };
      }

      console.log(`✅ Processed ${messageCount} messages`);
      yield { type: "done" };

    } catch (error) {
      console.error("❌ Claude Code execution error:", error.message);
      
      // More specific error handling
      if (error.message?.includes("exited with code 1")) {
        console.error(`
⚠️ Claude Code failed to start. Possible causes:
1. Invalid session ID: ${sessionId || "none"}
2. Message too long: ${message?.length || 0} characters
3. Invalid tools: ${allowedTools?.join(", ") || "none"}

Attempting without session resume...
`);

        // Retry without session if it might be the issue
        if (sessionId) {
          console.log("🔄 Retrying without session resume...");
          
          try {
            const retryOptions = {
              abortController,
              maxTurns: 150,
            };
            
            if (allowedTools?.length > 0) {
              retryOptions.allowedTools = allowedTools;
            }
            if (workingDirectory) {
              retryOptions.cwd = workingDirectory;
            }
            retryOptions.permissionMode = permissionMode || "default";
            // Permission handling via message parsing (no canUseTool to avoid AsyncIterable)

            for await (const sdkMessage of query({ prompt: message, options: retryOptions })) {
              yield {
                type: "claude_json",
                data: sdkMessage,
              };
            }
            
            yield { type: "done" };
            return; // Success on retry
            
          } catch (retryError) {
            console.error("❌ Retry also failed:", retryError.message);
          }
        }
      }

      if (error.name === "AbortError") {
        yield { type: "aborted" };
      } else {
        yield {
          type: "error",
          error: error.message || String(error),
        };
      }
    } finally {
      if (requestAbortControllers.has(requestId)) {
        requestAbortControllers.delete(requestId);
      }
    }
  }

  /**
   * Process streaming request
   */
  async processStreamingRequest(request) {
    const {
      message,
      requestId,
      conversationId,
      messageId,
      sessionId,
      allowedTools,
      workingDirectory,
      permissionMode,
    } = request;

    console.log(`\n📦 Processing request ${requestId} for conversation ${conversationId}`);

    try {
      // Load conversation
      const conversation = await this.loadConversation(conversationId);

      // Check token limits
      if (conversation?.contextTokens > COMPACTION_THRESHOLD) {
        console.log(`⚠️ Token limit approaching (${conversation.contextTokens}/${COMPACTION_THRESHOLD})`);
        // In production, trigger compaction here
      }

      // Determine session ID
      const effectiveSessionId = conversation?.claudeSessionId || sessionId;
      
      console.log(`🔗 Session resolution:`, {
        fromDB: conversation?.claudeSessionId || "none",
        fromRequest: sessionId || "none",
        using: effectiveSessionId || "new"
      });

      // Build context
      const context = {
        conversationId,
        sessionId: effectiveSessionId,
        requestId,
        messageId,
      };

      // Load and merge permissions - start with safe tools only
      let effectiveTools = allowedTools || [];
      const safeTools = ["Read", "LS", "Glob", "Grep", "WebFetch", "WebSearch"];
      
      try {
        const permResponse = await axios.get(
          `${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`,
          { timeout: 5000 }
        );
        const dbPermissions = permResponse.data.permissions || [];
        effectiveTools = [...new Set([...effectiveTools, ...safeTools, ...dbPermissions])];
        console.log(`🔐 Loaded ${dbPermissions.length} permissions from DB`);
        console.log(`🔒 Dangerous tools will require user permission: Write, Edit, Bash, MultiEdit, NotebookEdit`);
      } catch (error) {
        effectiveTools = [...new Set([...effectiveTools, ...safeTools])];
        console.log(`⚠️ Using safe tools only (DB permissions unavailable)`);
        console.log(`🔒 Dangerous tools will require user permission: Write, Edit, Bash, MultiEdit, NotebookEdit`);
      }

      console.log(`🛠️ Final tools: ${effectiveTools.join(", ")}`);

      // Add project context if provided
      let contextMessage = message;
      if (request.projectName) {
        contextMessage = `Project: ${request.projectName}\n\n${message}`;
      }

      // Execute Claude command
      let fullContent = "";
      let currentSessionId = effectiveSessionId;
      let newSessionCaptured = false;
      let estimatedTokens = 0;

      for await (const streamResponse of this.executeClaudeCommand(
        contextMessage,
        requestId,
        currentSessionId,
        effectiveTools,
        workingDirectory,
        permissionMode,
        context
      )) {
        // Handle different response types
        if (streamResponse.type === "claude_json" && streamResponse.data) {
          const sdkMessage = streamResponse.data;
          
          // Extract session ID from various possible locations
          const possibleSessionId = 
            sdkMessage.sessionId ||
            sdkMessage.session_id ||
            sdkMessage.session?.id ||
            sdkMessage.metadata?.sessionId ||
            (sdkMessage.type === "session" && sdkMessage.id);

          if (possibleSessionId && possibleSessionId !== currentSessionId) {
            currentSessionId = possibleSessionId;
            console.log(`🆔 New session ID captured: ${currentSessionId}`);
            
            if (!newSessionCaptured) {
              newSessionCaptured = true;
              this.storeSessionId(conversationId, possibleSessionId).catch(err => {
                console.error(`⚠️ Failed to store session:`, err.message);
              });
            }
          }

          // Extract content from various message types
          if (sdkMessage.type === "assistant" && sdkMessage.message) {
            let textContent = "";
            
            if (typeof sdkMessage.message.content === "string") {
              textContent = sdkMessage.message.content;
            } else if (Array.isArray(sdkMessage.message.content)) {
              textContent = sdkMessage.message.content
                .filter(block => block?.type === "text")
                .map(block => block.text || "")
                .join("");
            }
            
            if (textContent && textContent !== fullContent) {
              fullContent = textContent;
              estimatedTokens = Math.ceil(textContent.length / 4);
            }
          } else if (sdkMessage.type === "text" && sdkMessage.text) {
            fullContent += sdkMessage.text;
            estimatedTokens = Math.ceil(fullContent.length / 4);
          } else if (sdkMessage.type === "result" && sdkMessage.result) {
            fullContent = sdkMessage.result;
            estimatedTokens = Math.ceil(sdkMessage.result.length / 4);
          }
        }

        // Send response to backend
        if (this.socket?.connected) {
          this.socket.emit("chat-bridge:response", {
            messageId,
            requestId,
            streamResponse,
            content: fullContent,
            isComplete: ["done", "error", "aborted"].includes(streamResponse.type),
            sessionId: currentSessionId,
          });
        }

        // Check if complete
        if (["done", "error", "aborted"].includes(streamResponse.type)) {
          console.log(`✅ Request completed: ${streamResponse.type}`);
          
          // Update token usage
          if (estimatedTokens > 0) {
            const totalTokens = estimatedTokens + TOKEN_ESTIMATE_PER_MESSAGE;
            this.updateTokenUsage(conversationId, totalTokens).catch(err => {
              console.error(`⚠️ Failed to update tokens:`, err.message);
            });
          }
          
          break;
        }
      }

    } catch (error) {
      console.error(`❌ Error processing request:`, error.message);

      if (this.socket?.connected) {
        this.socket.emit("chat-bridge:response", {
          messageId,
          requestId,
          content: "",
          isComplete: true,
          error: error.message || String(error),
        });
      }
    }
  }

  /**
   * Handle abort request
   */
  handleAbortRequest(requestId) {
    const abortController = requestAbortControllers.get(requestId);
    if (abortController) {
      abortController.abort();
      requestAbortControllers.delete(requestId);
      console.log(`⏹️ Request ${requestId} aborted`);
      return true;
    }
    console.warn(`⚠️ No abort controller found for request ${requestId}`);
    return false;
  }

  /**
   * Connect to backend
   */
  connectSocket() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("🔌 Connected to backend via Socket.IO");
      this.isConnected = true;
      this.socket.emit("chat-bridge:connect", {
        version: "1.0.0",
        features: ["string-prompt", "session-resume", "abort"],
      });
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

    this.socket.on("permission:response", (data) => {
      console.log(`🔐 Permission response received:`, data);
      this.handlePermissionResponse(data.promptId, data.response);
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`🔌 Disconnected from backend: ${reason}`);
      this.isConnected = false;
    });

    this.socket.on("error", (error) => {
      console.error("❌ Socket error:", error);
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
    });
  }

  /**
   * Poll for requests (fallback)
   */
  async pollForRequests() {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/pending`,
        { timeout: 5000 }
      );
      const { requests } = response.data;

      if (requests?.length > 0) {
        console.log(`📥 Polled ${requests.length} pending requests`);
        for (const request of requests) {
          await this.processStreamingRequest(request);
        }
      }
    } catch (error) {
      if (error.code !== "ECONNRESET" && error.code !== "ENOTFOUND") {
        console.error("❌ Polling error:", error.message);
      }
    }
  }

  /**
   * Start the handler
   */
  async start() {
    console.log("🚀 Starting WebUI Chat Handler (No AsyncIterable Version)");
    console.log(`🌐 Backend URL: ${BACKEND_URL}`);
    console.log(`📡 Using string prompts only (AsyncIterable disabled)`);
    console.log(`🔧 This avoids the 'exited with code 1' error`);

    // Connect Socket.IO
    this.connectSocket();

    // Polling fallback
    setInterval(() => {
      if (!this.isConnected) {
        this.pollForRequests();
      }
    }, POLLING_INTERVAL);

    console.log("✅ WebUI Chat Handler ready\n");
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
handler.start().catch((error) => {
  console.error("❌ Fatal error starting WebUI Chat Handler:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", () => handler.shutdown());
process.on("SIGTERM", () => handler.shutdown());