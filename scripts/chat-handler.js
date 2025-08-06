#!/usr/bin/env node

/**
 * Chat Handler Script
 * Processes chat messages using the user's local Claude Code installation
 * and sends responses back to the Baton backend
 */

const { query } = require('@anthropic-ai/claude-code');
const axios = require('axios');
const { io } = require('socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 1000;

class ChatHandler {
  constructor() {
    this.processing = false;
    this.socket = null;
  }

  connectSocket() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to Baton backend via Socket.IO');
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
  }

  async processChat(request) {
    const { messageId, conversationId, prompt, projectContext } = request;
    
    console.log(`Processing chat for message ${messageId}`);
    
    try {
      // Build context-aware prompt
      let contextPrompt = prompt;
      if (projectContext) {
        contextPrompt = `Project: ${projectContext.name}\n\n${prompt}`;
      }

      const messages = [];
      let fullContent = '';
      const abortController = new AbortController();

      console.log(`Sending to Claude Code: "${contextPrompt.substring(0, 100)}..."`);

      // Use local Claude Code in headless mode
      for await (const message of query({
        prompt: contextPrompt,
        abortController,
        options: {
          maxTurns: 1,  // Single turn for chat responses
        },
      })) {
        messages.push(message);
        
        console.log('Received message type:', message.type);
        
        // Handle different message types from Claude Code SDK
        if (message.type === 'assistant' && message.message) {
          // Assistant message with actual content
          const content = this.extractContent(message);
          if (content && content !== fullContent) {
            fullContent = content;  // Claude sends the full content each time
            
            // Send streaming update
            await this.sendUpdate(messageId, {
              content: fullContent,
              isComplete: false,
            });
          }
        } else if (message.type === 'result') {
          // Final result message - completion indicator
          console.log('Query completed successfully');
          // The fullContent should already have the complete response
        }
      }

      // Send final response
      await this.sendUpdate(messageId, {
        content: fullContent,
        isComplete: true,
      });

    } catch (error) {
      console.error('Error processing chat:', error);
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