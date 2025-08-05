#!/usr/bin/env node

/**
 * Demo Chat Handler Script
 * Provides simple responses for testing the chat functionality
 */

const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const POLLING_INTERVAL = 2000; // 2 seconds

class DemoChatHandler {
  constructor() {
    this.processing = false;
    this.processedMessages = new Set();
  }

  async generateResponse(prompt) {
    // Simple demo responses based on keywords
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi')) {
      return "Hello! I'm a demo chat assistant integrated with Baton. How can I help you manage your tasks today?";
    }
    
    if (lowerPrompt.includes('task') || lowerPrompt.includes('todo')) {
      return "I can help you manage tasks in Baton! You can:\n• Create new tasks\n• Update task status\n• Set priorities and due dates\n• Organize tasks by project\n\nWhat would you like to do?";
    }
    
    if (lowerPrompt.includes('help')) {
      return "I'm here to help! I can assist with:\n• Task management\n• Project organization\n• Claude Code integration\n• Answering questions about Baton\n\nWhat do you need help with?";
    }
    
    if (lowerPrompt.includes('claude')) {
      return "Baton integrates with Claude Code through MCP (Model Context Protocol). You can sync todos between Claude Code and Baton tasks for seamless AI-assisted development.";
    }
    
    // Default response
    return `I received your message: "${prompt}"\n\nAs a demo assistant, I can help with basic task management queries. Try asking about tasks, projects, or Claude Code integration!`;
  }

  async processChat(request) {
    const { messageId, prompt } = request;
    
    // Skip if already processed
    if (this.processedMessages.has(messageId)) {
      return;
    }
    
    this.processedMessages.add(messageId);
    console.log(`Processing chat for message ${messageId}: "${prompt}"`);
    
    try {
      // Generate response
      const response = await this.generateResponse(prompt);
      
      // Simulate typing delay for better UX
      const words = response.split(' ');
      let currentContent = '';
      
      for (let i = 0; i < words.length; i++) {
        currentContent += (i > 0 ? ' ' : '') + words[i];
        
        // Send streaming update
        await this.sendUpdate(messageId, {
          content: currentContent,
          isComplete: false,
        });
        
        // Small delay between words
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Send final response
      await this.sendUpdate(messageId, {
        content: response,
        isComplete: true,
      });
      
      console.log(`✓ Completed response for message ${messageId}`);
      
    } catch (error) {
      console.error('Error processing chat:', error);
      await this.sendUpdate(messageId, {
        content: '',
        isComplete: true,
        error: error.message,
      });
    }
  }

  async sendUpdate(messageId, data) {
    try {
      await axios.post(`${BACKEND_URL}/api/chat/response`, {
        messageId,
        ...data,
      });
    } catch (error) {
      console.error('Error sending update:', error.message);
    }
  }

  async pollForRequests() {
    if (this.processing) return;
    
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chat/pending`);
      const { requests } = response.data;
      
      if (requests && requests.length > 0) {
        this.processing = true;
        console.log(`Found ${requests.length} pending requests`);
        
        for (const request of requests) {
          await this.processChat(request);
        }
        
        this.processing = false;
      }
    } catch (error) {
      // Silently ignore connection errors (backend might not be ready)
      if (error.code !== 'ECONNREFUSED') {
        console.error('Error polling for requests:', error.message);
      }
    }
  }

  async start() {
    console.log('🤖 Starting Demo Chat Handler...');
    console.log(`📡 Backend URL: ${BACKEND_URL}`);
    console.log(`⏱️  Polling interval: ${POLLING_INTERVAL}ms`);
    console.log('');
    console.log('Ready to process chat messages!');
    console.log('-----------------------------------');
    
    // Start polling
    setInterval(() => {
      this.pollForRequests();
    }, POLLING_INTERVAL);
    
    // Initial poll
    this.pollForRequests();
  }
}

// Start the handler
const handler = new DemoChatHandler();
handler.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Demo Chat Handler...');
  process.exit(0);
});