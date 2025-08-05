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

      // Use local Claude Code
      for await (const message of query({
        prompt: contextPrompt,
        options: {
          maxTurns: 3,
        },
      })) {
        messages.push(message);
        
        // Extract content based on message structure
        if (message.role === 'assistant') {
          const content = this.extractContent(message);
          if (content) {
            fullContent += content;
            
            // Send streaming update
            await this.sendUpdate(messageId, {
              content: fullContent,
              isComplete: false,
            });
          }
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