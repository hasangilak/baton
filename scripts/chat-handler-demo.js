#!/usr/bin/env node

/**
 * Demo Chat Handler Script (For testing without Claude Code)
 * This version simulates Claude Code responses for demonstration
 */

const axios = require('axios');
const { io } = require('socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 1000;

class DemoChatHandler {
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

      // Simulate Claude Code processing with realistic responses
      const responses = this.generateMockResponse(contextPrompt, projectContext);
      
      let fullContent = '';
      
      // Simulate streaming response
      for (let i = 0; i < responses.length; i++) {
        const chunk = responses[i];
        fullContent += chunk;
        
        // Send streaming update
        await this.sendUpdate(messageId, {
          content: fullContent,
          isComplete: i === responses.length - 1,
        });
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error('Error processing chat:', error);
      await this.sendUpdate(messageId, {
        content: '',
        isComplete: true,
        error: error.message,
      });
    }
  }

  generateMockResponse(prompt, projectContext) {
    // Analyze the prompt and generate appropriate responses
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('hello world') && lowerPrompt.includes('python')) {
      return [
        "Here's a simple Hello World function in Python:\n\n",
        "```python\n",
        "def hello_world():\n",
        "    \"\"\"A simple function that prints Hello, World!\"\"\"\n",
        "    print(\"Hello, World!\")\n",
        "    return \"Hello, World!\"\n\n",
        "# Call the function\n",
        "if __name__ == \"__main__\":\n",
        "    hello_world()\n",
        "```\n\n",
        "This function demonstrates:\n",
        "- Function definition with `def`\n",
        "- Docstring for documentation\n",
        "- Print statement for output\n",
        "- Return value\n",
        "- Main guard for script execution\n\n",
        "You can run this by saving it to a `.py` file and executing `python filename.py`."
      ];
    }
    
    if (lowerPrompt.includes('ci/cd') || lowerPrompt.includes('ci-cd')) {
      return [
        `I'll help you set up CI/CD for the ${projectContext?.name || 'your'} project. `,
        "Here's a comprehensive approach:\n\n",
        "## 1. GitHub Actions Workflow\n\n",
        "Create `.github/workflows/ci-cd.yml`:\n\n",
        "```yaml\n",
        "name: CI/CD Pipeline\n",
        "on:\n",
        "  push:\n",
        "    branches: [ main, develop ]\n",
        "  pull_request:\n",
        "    branches: [ main ]\n\n",
        "jobs:\n",
        "  test:\n",
        "    runs-on: ubuntu-latest\n",
        "    steps:\n",
        "      - uses: actions/checkout@v3\n",
        "      - name: Setup Node.js\n",
        "        uses: actions/setup-node@v3\n",
        "        with:\n",
        "          node-version: '18'\n",
        "      - run: npm ci\n",
        "      - run: npm test\n",
        "```\n\n",
        "## 2. Docker Integration\n\n",
        "Since you're using Docker Compose, add deployment steps:\n\n",
        "```yaml\n",
        "  deploy:\n",
        "    needs: test\n",
        "    runs-on: ubuntu-latest\n",
        "    if: github.ref == 'refs/heads/main'\n",
        "    steps:\n",
        "      - uses: actions/checkout@v3\n",
        "      - name: Build and Deploy\n",
        "        run: |\n",
        "          docker compose build\n",
        "          docker compose up -d\n",
        "```\n\n",
        "This setup provides automated testing and deployment for your project."
      ];
    }
    
    // Default response for other prompts
    return [
      "I'm a demo version of Claude Code running through the Baton chat bridge. ",
      `I received your message: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"\n\n`,
      projectContext ? `Working in project: **${projectContext.name}**\n\n` : '',
      "Here are some things I can help you with:\n",
      "- Writing code and functions\n",
      "- Setting up CI/CD pipelines\n",
      "- Debugging issues\n",
      "- Architecture and design questions\n",
      "- Documentation and best practices\n\n",
      "The chat bridge is working correctly! 🎉"
    ].filter(Boolean);
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
    console.log('Starting Demo Chat Handler...');
    console.log(`Backend URL: ${BACKEND_URL}`);
    console.log('🤖 This is a demo version that simulates Claude Code responses');
    
    // Connect via Socket.IO
    this.connectSocket();
    
    // Also poll periodically as backup
    setInterval(() => {
      if (!this.socket || !this.socket.connected) {
        this.pollForRequests();
      }
    }, POLLING_INTERVAL * 5);
  }
}

// Start the handler
const handler = new DemoChatHandler();
handler.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Demo Chat Handler...');
  if (handler.socket) {
    handler.socket.disconnect();
  }
  process.exit(0);
});