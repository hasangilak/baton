#!/usr/bin/env node

/**
 * Streamlined Claude Code Handler
 * Based on Claude Code WebUI streaming patterns
 * Simplified approach - forward raw SDK messages directly
 */

const { query } = require("@anthropic-ai/claude-code");
const axios = require("axios");
const { io } = require("socket.io-client");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

class StreamingChatHandler {
  constructor() {
    this.processing = false;
    this.socket = null;
    this.activeStreams = new Map(); // Track active streams by messageId
  }

  connectSocket() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("🔌 Connected to Baton backend");
      this.socket.emit("chat-bridge:connect");
    });

    this.socket.on("chat:request", async (request) => {
      console.log(`📨 Received chat request for message ${request.messageId}`);
      await this.processStreamingChat(request);
    });

    this.socket.on("disconnect", () => {
      console.log("🔌 Disconnected from backend");
    });

    this.socket.on("error", (error) => {
      console.error("❌ Socket error:", error);
    });
  }

  async processStreamingChat(request) {
    const { messageId, conversationId, prompt, projectContext } = request;
    
    console.log(`🎬 Starting stream for message ${messageId}`);
    console.log(`📝 User prompt: "${prompt.substring(0, 200)}..."`);

    try {
      // Get conversation for session management
      const conversation = await this.getConversation(conversationId);
      
      // Build simple context prompt
      let contextPrompt = prompt;
      if (projectContext?.name) {
        contextPrompt = `Project: ${projectContext.name}\n\n${prompt}`;
      }

      // Create abort controller for this stream
      const abortController = new AbortController();
      this.activeStreams.set(messageId, abortController);

      console.log(`📡 Streaming to Claude Code SDK...`);
      console.log(`🔗 Session: ${conversation?.claudeSessionId ? 'resume' : 'new'}`);

      let currentSessionId = null;
      let fullContent = '';

      // Stream Claude Code responses with simplified options (WebUI pattern)
      for await (const sdkMessage of query({
        prompt: contextPrompt,
        options: {
          abortController,
          maxTurns: 1,
          // Simple options - no complex callbacks that cause stream-json issues
          permissionMode: 'default' as const,
          ...(conversation?.claudeSessionId ? { resume: conversation.claudeSessionId } : {}),
        },
      })) {
        // Capture session ID (WebUI pattern)
        const sessionId = sdkMessage.sessionId || sdkMessage.session_id || 
                         (sdkMessage.message && (sdkMessage.message.sessionId || sdkMessage.message.session_id));
        
        if (sessionId && !currentSessionId) {
          currentSessionId = sessionId;
          console.log(`🆔 Session ID captured: ${currentSessionId}`);
        }

        // Extract content for final storage (WebUI pattern)
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

        // Forward raw SDK message to frontend (WebUI pattern)
        await this.forwardStreamMessage(messageId, {
          type: 'claude_json',
          data: sdkMessage,
          messageId: messageId,
        });
      }

      // Store session ID if captured
      if (currentSessionId && conversationId) {
        await this.storeSessionId(conversationId, currentSessionId);
      }

      // Send completion
      await this.forwardStreamMessage(messageId, {
        type: 'done',
        messageId: messageId,
        finalContent: fullContent,
      });

      console.log(`✅ Stream completed for message ${messageId}`);

    } catch (error) {
      console.error(`❌ Streaming error for message ${messageId}:`, error);
      
      // Send error to frontend
      await this.forwardStreamMessage(messageId, {
        type: 'error',
        messageId: messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Clean up abort controller
      this.activeStreams.delete(messageId);
    }
  }

  async forwardStreamMessage(messageId, streamData) {
    if (this.socket && this.socket.connected) {
      // Send as streaming chunk
      this.socket.emit('chat-stream:chunk', {
        messageId,
        ...streamData,
      });
    } else {
      // Fallback to HTTP
      try {
        await axios.post(`${BACKEND_URL}/api/chat/stream-chunk`, {
          messageId,
          ...streamData,
        });
      } catch (error) {
        console.error('❌ Error forwarding stream message:', error.message);
      }
    }
  }

  async getConversation(conversationId) {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversation/${conversationId}`);
      return response.data.conversation || null;
    } catch (error) {
      console.error('❌ Error fetching conversation:', error.message);
      return null;
    }
  }

  async storeSessionId(conversationId, sessionId) {
    try {
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/session`, {
        claudeSessionId: sessionId,
      });
      console.log(`💾 Stored session ID ${sessionId}`);
    } catch (error) {
      console.error('❌ Error storing session ID:', error.message);
    }
  }

  async start() {
    console.log('🚀 Starting Streamlined Claude Code Handler');
    console.log('🎯 Based on Claude Code WebUI streaming patterns');
    console.log(`🔗 Backend URL: ${BACKEND_URL}`);
    
    this.connectSocket();
  }
}

// Start the handler
const handler = new StreamingChatHandler();
handler.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down Streamlined Chat Handler...');
  if (handler.socket) {
    handler.socket.disconnect();
  }
  process.exit(0);
});