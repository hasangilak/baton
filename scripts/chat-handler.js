#!/usr/bin/env node

/**
 * Chat Handler Script
 * Processes chat messages using the user's local Claude Code installation
 * and sends responses back to the Baton backend
 */

const { query } = require('@anthropic-ai/claude-code');
const axios = require('axios');
const { io } = require('socket.io-client');
const { PromptDetector } = require('./prompt-detector');
const { PromptDecisionEngine } = require('./decision-engine');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 1000;

// Context management constants
const TOKEN_LIMIT = 200000;
const COMPACT_THRESHOLD = 150000; // 75% of limit
const EMERGENCY_THRESHOLD = 180000; // 90% of limit

class ChatHandler {
  constructor() {
    this.processing = false;
    this.socket = null;
    this.decisionEngine = null; // Will be initialized after socket connection
  }

  connectSocket() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to Baton backend via Socket.IO');
      // Initialize decision engine with socket for user delegation
      this.decisionEngine = new PromptDecisionEngine(this.socket);
      // Register as a chat bridge
      this.socket.emit('chat-bridge:connect');
    });

    this.socket.on('chat:request', async (request) => {
      console.log(`Received chat request for message ${request.messageId}`);
      await this.processChat(request);
    });

    this.socket.on('chat:pending', async (requests) => {
      console.log(`Received ${requests.length} pending requests`);
      for (const request of requests) {
        await this.processChat(request);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from backend');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Handle user responses to interactive prompts
    this.socket.on('prompt:response', async (response) => {
      console.log(`📝 Received user response for prompt ${response.promptId}`);
      if (this.decisionEngine?.strategies) {
        // Find the user delegation strategy and handle the response
        const userStrategy = this.decisionEngine.strategies.find(
          s => s.constructor.name === 'UserDelegationStrategy'
        );
        if (userStrategy) {
          userStrategy.handleUserResponse(response.promptId, response.selectedOption);
        }
      }
    });
  }

  async processChat(request) {
    const { messageId, conversationId, prompt, projectContext } = request;
    
    console.log(`🚀 Processing chat for message ${messageId} with session-aware context management`);
    
    try {
      // Get conversation and check if context management is needed
      const conversation = await this.getConversation(conversationId);
      const shouldCompact = await this.shouldCompactContext(conversation);
      
      if (shouldCompact) {
        console.log(`🗜️  Context compaction needed for conversation ${conversationId}`);
        await this.compactContext(conversation);
      }
      
      // Build efficient prompt with project context only
      let contextPrompt = prompt;
      if (projectContext) {
        contextPrompt = `Project: ${projectContext.name}\n\n${prompt}`;
      }

      const messages = [];
      let fullContent = '';
      let toolUsages = [];
      let finalResult = '';
      let currentSessionId = null;
      const abortController = new AbortController();

      // Determine session options for Claude Code SDK
      const sessionOptions = this.getSessionOptions(conversation);
      
      console.log(`📡 Sending to Claude Code SDK: "${contextPrompt.substring(0, 150)}..."`);
      console.log(`🔗 Session mode: ${sessionOptions.mode}, Session ID: ${sessionOptions.sessionId || 'new'}`);

      // Use Claude Code SDK with efficient session management
      for await (const message of query({
        prompt: contextPrompt,
        abortController,
        options: {
          maxTurns: 1,
          ...sessionOptions.options
        },
      })) {
        messages.push(message);
        
        console.log('Received message type:', message.type);
        
        // Log full message structure for debugging tool usage
        if (message.type === 'user' || message.toolUses) {
          console.log('Full message:', JSON.stringify(message, null, 2));
        }
        
        // Handle different message types from Claude Code SDK
        if (message.type === 'assistant' && message.message) {
          // Extract text content for prompt detection
          const textContent = this.extractContent(message);
          
          // Check for interactive prompts first
          if (textContent) {
            const prompt = PromptDetector.detectPrompt(textContent);
            if (prompt && this.decisionEngine) {
              console.log(`🔔 Interactive prompt detected: ${PromptDetector.getPromptSummary(prompt)}`);
              
              // Handle the prompt using our decision engine
              const decision = await this.decisionEngine.handlePrompt(
                prompt,
                conversationId,
                currentSessionId
              );
              
              if (decision) {
                console.log(`✅ Prompt handled automatically: ${decision.action}`);
                // For now, continue processing - in a full implementation,
                // we might need to send the decision back to Claude Code
                continue;
              } else {
                console.log(`👤 Prompt delegated to user, continuing...`);
                // Continue processing while waiting for user response
              }
            }
          }
          // Check for tool use in assistant messages
          if (message.message.content && Array.isArray(message.message.content)) {
            const toolUseBlocks = message.message.content.filter(c => c.type === 'tool_use');
            if (toolUseBlocks.length > 0) {
              console.log('Tool use blocks detected:', toolUseBlocks.length);
              toolUsages = toolUseBlocks.map(block => ({
                name: block.name || 'Unknown Tool',
                id: block.id
              }));
              
              // Send tool usage update
              await this.sendUpdate(messageId, {
                content: fullContent,
                toolUsages: toolUsages,
                isComplete: false,
              });
            }
          }
          
          // Assistant message with actual content
          const content = this.extractContent(message);
          if (content && content !== fullContent) {
            fullContent = content;  // Claude sends the full content each time
            
            // Send streaming update
            await this.sendUpdate(messageId, {
              content: fullContent,
              toolUsages: toolUsages,
              isComplete: false,
            });
          }
        } else if (message.type === 'user' && message.message) {
          // User message with tool results
          const content = message.message.content;
          if (Array.isArray(content)) {
            const toolResults = content.filter(c => c.type === 'tool_result');
            if (toolResults.length > 0) {
              console.log('Tool results detected:', toolResults.length);
              
              // Extract and combine all tool result content
              const toolResultContent = toolResults.map(result => result.content).join('\n\n');
              console.log('Tool result content length:', toolResultContent.length);
              
              // Update fullContent with the tool results
              if (toolResultContent && toolResultContent.length > fullContent.length) {
                fullContent = toolResultContent;
              }
              
              // Extract tool names from the content
              toolUsages = toolResults.map(result => {
                const match = result.content?.match(/Web search|WebSearch|WebFetch/i);
                return {
                  name: match ? 'WebSearch' : 'Tool',
                  id: result.tool_use_id
                };
              });
              
              // Send tool usage update with result content
              await this.sendUpdate(messageId, {
                content: fullContent,
                toolUsages: toolUsages,
                isComplete: false,
              });
            }
          }
        } else if (message.type === 'result') {
          // Final result message with complete response
          console.log('Query completed successfully');
          if (message.result) {
            finalResult = message.result;
            console.log('Final result:', finalResult.substring(0, 200));
            
            // Send the final result immediately as an update
            await this.sendUpdate(messageId, {
              content: finalResult,
              toolUsages: toolUsages,
              isComplete: false, // Keep streaming for now
            });
          }
        }
        
        // Capture session ID if available for future context preservation
        if (message.sessionId && !currentSessionId) {
          currentSessionId = message.sessionId;
          console.log(`🆔 Captured session ID: ${currentSessionId}`);
        }
      }

      // Store session ID in database for future context preservation
      if (currentSessionId && conversationId) {
        await this.storeSessionId(conversationId, currentSessionId);
      }
      
      // Update token usage estimate for this conversation
      await this.updateTokenUsage(conversationId, finalResult || fullContent);

      // Send final response with result
      await this.sendUpdate(messageId, {
        content: finalResult || fullContent,
        toolUsages: toolUsages,
        isComplete: true,
      });

    } catch (error) {
      console.error('❌ Error processing chat:', error);
      await this.sendUpdate(messageId, {
        content: '',
        isComplete: true,
        error: error.message,
      });
    }
  }

  extractContent(message) {
    // Handle Claude Code SDK message format
    if (message.message && message.message.content) {
      // Content can be an array of content blocks
      if (Array.isArray(message.message.content)) {
        const textContent = message.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');
        console.log('Extracted text from content blocks:', textContent.substring(0, 100));
        return textContent;
      }
      // Or a simple string
      if (typeof message.message.content === 'string') {
        console.log('Extracted string content:', message.message.content.substring(0, 100));
        return message.message.content;
      }
    }
    
    // Fallback to simpler formats
    if ('content' in message && typeof message.content === 'string') {
      return message.content;
    }
    if ('text' in message && typeof message.text === 'string') {
      return message.text;
    }
    return '';
  }

  /**
   * Session-Aware Context Management Methods
   * These methods implement token-efficient context preservation using Claude Code SDK's session management
   */

  async getConversation(conversationId) {
    try {
      // Get conversation details including session ID and token usage
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversation/${conversationId}`);
      return response.data.conversation || null;
    } catch (error) {
      console.error('Error fetching conversation:', error.message);
      return null;
    }
  }

  async shouldCompactContext(conversation) {
    if (!conversation) return false;
    
    const tokenThresholdReached = conversation.contextTokens > COMPACT_THRESHOLD;
    const timeThresholdReached = conversation.lastCompacted && 
      (Date.now() - new Date(conversation.lastCompacted).getTime()) > (24 * 60 * 60 * 1000); // 24 hours
    
    const shouldCompact = tokenThresholdReached || timeThresholdReached;
    
    if (shouldCompact) {
      console.log(`📊 Context stats: ${conversation.contextTokens}/${TOKEN_LIMIT} tokens (${Math.round(conversation.contextTokens/TOKEN_LIMIT*100)}%)`);
    }
    
    return shouldCompact;
  }

  getSessionOptions(conversation) {
    if (!conversation) {
      return {
        mode: 'new',
        sessionId: null,
        options: { continue: true }
      };
    }

    if (conversation.claudeSessionId) {
      return {
        mode: 'resume',
        sessionId: conversation.claudeSessionId,
        options: { resume: conversation.claudeSessionId }
      };
    }

    return {
      mode: 'continue',
      sessionId: null,
      options: { continue: true }
    };
  }

  async compactContext(conversation) {
    if (!conversation?.claudeSessionId) {
      console.log('⚠️  No session ID available for compaction');
      return;
    }

    console.log(`🗜️  Compacting context for session ${conversation.claudeSessionId}`);
    
    try {
      // Use Claude Code's built-in compact command
      for await (const message of query({
        prompt: "/compact Preserve key context about our discussion topics, ongoing tasks, and project-specific information",
        options: { 
          maxTurns: 1,
          resume: conversation.claudeSessionId
        }
      })) {
        console.log(`✅ Context compacted for conversation ${conversation.id}`);
      }
      
      // Update database with compaction timestamp and estimated token reduction
      await this.updateCompactionStatus(conversation.id);
      
    } catch (error) {
      console.error('❌ Error compacting context:', error.message);
    }
  }

  async storeSessionId(conversationId, sessionId) {
    try {
      // Update conversation with Claude Code session ID
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/session`, {
        claudeSessionId: sessionId
      });
      
      console.log(`💾 Stored session ID ${sessionId} for conversation ${conversationId}`);
    } catch (error) {
      console.error('Error storing session ID:', error.message);
    }
  }

  async updateTokenUsage(conversationId, content) {
    try {
      // Rough token estimation: ~4 characters per token
      const estimatedTokens = Math.ceil(content.length / 4);
      
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/tokens`, {
        additionalTokens: estimatedTokens
      });
      
      console.log(`📈 Updated token usage: +${estimatedTokens} tokens for conversation ${conversationId}`);
    } catch (error) {
      console.error('Error updating token usage:', error.message);
    }
  }

  async updateCompactionStatus(conversationId) {
    try {
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/compact`, {
        compactedAt: new Date().toISOString(),
        tokenReductionEstimate: 0.7 // Estimate 70% reduction
      });
      
      console.log(`🗜️  Updated compaction status for conversation ${conversationId}`);
    } catch (error) {
      console.error('Error updating compaction status:', error.message);
    }
  }

  async sendUpdate(messageId, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat-bridge:response', {
        messageId,
        ...data,
      });
    } else {
      // Fallback to HTTP if Socket is not available
      try {
        await axios.post(`${BACKEND_URL}/api/chat/response`, {
          messageId,
          ...data,
        });
      } catch (error) {
        console.error('Error sending update:', error.message);
      }
    }
  }

  async pollForRequests() {
    if (this.processing) return;
    
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/pending`);
      const { requests } = response.data;
      
      if (requests && requests.length > 0) {
        this.processing = true;
        for (const request of requests) {
          await this.processChat(request);
        }
        this.processing = false;
      }
    } catch (error) {
      console.error('Error polling for requests:', error.message);
    }
  }

  async start() {
    console.log('Starting Chat Handler...');
    console.log(`Backend URL: ${BACKEND_URL}`);
    
    // Connect via Socket.IO
    this.connectSocket();
    
    // Also poll periodically as backup
    setInterval(() => {
      if (!this.socket || !this.socket.connected) {
        this.pollForRequests();
      }
    }, POLLING_INTERVAL * 5); // Poll less frequently when socket is primary
  }
}

// Start the handler
const handler = new ChatHandler();
handler.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Chat Handler...');
  if (handler.socket) {
    handler.socket.disconnect();
  }
  process.exit(0);
});