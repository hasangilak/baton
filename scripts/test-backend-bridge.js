#!/usr/bin/env node

/**
 * Backend-Bridge Test Script
 * 
 * Tests the backend and bridge connection directly without frontend involvement.
 * Captures Claude's thinking/status messages and displays them with proper formatting.
 * 
 * Usage:
 * node scripts/test-backend-bridge.js [--verbose] [--scenario <name>]
 * 
 * Scenarios:
 * - simple: Send "Hi" message
 * - complex: Search for mustang car prices (with tools)
 * - custom: Use a custom message from command line
 */

const { io } = require('socket.io-client');
const colors = require('colors');

// Configuration
const BACKEND_URL = 'http://localhost:3001';
const DEFAULT_PROJECT_ID = 'cmdxumi04000k4yhw92fvsqqa'; // Baton project ID from CLAUDE.md

// Command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const scenarioIndex = args.indexOf('--scenario');
const scenario = scenarioIndex !== -1 && scenarioIndex + 1 < args.length ? args[scenarioIndex + 1] : 'simple';

// Test scenarios
const SCENARIOS = {
  simple: {
    name: 'Simple Greeting',
    message: 'Hi',
    description: 'Tests basic response and thinking messages'
  },
  complex: {
    name: 'Complex Tool Query',
    message: 'search the web for random mustang car prices',
    description: 'Tests tool execution and status messages'
  },
  stock: {
    name: 'Stock Price Query',
    message: 'what is the current microsoft stock price',
    description: 'Tests web search tool usage with status messages'
  },
  custom: {
    name: 'Custom Message',
    message: args[args.indexOf('--message') + 1] || 'Tell me about the weather',
    description: 'Custom message provided via --message parameter'
  }
};

class BackendBridgeTestClient {
  constructor() {
    this.socket = null;
    this.currentConversationId = null;
    this.currentSessionId = null;
    this.messageCount = 0;
    this.startTime = Date.now();
    this.lastMessageTime = Date.now();
  }

  /**
   * Connect to backend WebSocket server
   */
  async connect() {
    console.log('🔌 Connecting to backend WebSocket server...'.cyan);
    
    this.socket = io(BACKEND_URL, {
      transports: ['websocket'],
      timeout: 10000
    });

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('✅ Connected to backend WebSocket server'.green);
        this.setupEventHandlers();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:'.red, error.message);
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        if (!this.socket.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Set up WebSocket event handlers
   */
  setupEventHandlers() {
    // Handle stream responses from Claude
    this.socket.on('chat:stream-response', (data) => {
      this.handleStreamResponse(data);
    });

    // Handle session ID availability
    this.socket.on('chat:session-id-available', (data) => {
      this.handleSessionAvailable(data);
    });

    // Handle conversation creation
    this.socket.on('chat:conversation-created', (data) => {
      this.handleConversationCreated(data);
    });

    // Handle message completion
    this.socket.on('chat:message-complete', (data) => {
      this.handleMessageComplete(data);
    });

    // Handle errors
    this.socket.on('chat:error', (data) => {
      this.handleError(data);
    });

    // Handle aborts
    this.socket.on('chat:aborted', (data) => {
      this.handleAborted(data);
    });
  }

  /**
   * Handle stream responses from Claude
   */
  handleStreamResponse(data) {
    const now = Date.now();
    const elapsed = now - this.lastMessageTime;
    this.lastMessageTime = now;
    
    if (verbose) {
      console.log('\n📡 Raw stream response:'.gray);
      console.log(JSON.stringify(data, null, 2).gray);
    }

    // Extract message details
    const { type, data: claudeData, requestId, timestamp } = data;
    
    if (type === 'claude_json' && claudeData) {
      this.messageCount++;
      this.processClaudeMessage(claudeData, elapsed);
    } else if (type === 'error') {
      console.log(`❌ [${this.formatTime()}] Error: ${data.error}`.red);
    } else if (type === 'done') {
      console.log(`✅ [${this.formatTime()}] Request completed`.green);
    }
  }

  /**
   * Process Claude SDK messages
   */
  processClaudeMessage(claudeData, elapsed) {
    const { type, message, session_id, result, subtype } = claudeData;
    const timestamp = this.formatTime();
    
    switch (type) {
      case 'system':
        console.log(`🔧 [${timestamp}] System (${subtype}): Session ${session_id}`.blue);
        break;
        
      case 'assistant':
        this.processAssistantMessage(message, timestamp, elapsed);
        break;
        
      case 'user':
        console.log(`👤 [${timestamp}] User message sent`.cyan);
        break;
        
      case 'result':
        this.processResultMessage(claudeData, timestamp);
        break;
        
      default:
        console.log(`❓ [${timestamp}] Unknown message type: ${type}`.yellow);
    }
  }

  /**
   * Process assistant messages (including thinking and tool usage)
   */
  processAssistantMessage(message, timestamp, elapsed) {
    if (!message || !message.content) return;

    const content = message.content;
    const messageId = message.id;
    const model = message.model;

    // Process different content blocks
    const textBlocks = content.filter(block => block.type === 'text');
    const toolBlocks = content.filter(block => block.type === 'tool_use');
    const thinkingBlocks = content.filter(block => block.type === 'thinking');

    // Display thinking blocks (status messages)
    thinkingBlocks.forEach((block, i) => {
      const thinkingText = block.thinking || block.text || '';
      console.log(`🤔 [${timestamp}] Thinking (${elapsed}ms): ${thinkingText.substring(0, 100)}${thinkingText.length > 100 ? '...' : ''}`.yellow);
      
      if (verbose && thinkingText.length > 100) {
        console.log(`   Full thinking: ${thinkingText}`.gray);
      }
    });

    // Display text content
    textBlocks.forEach((block, i) => {
      const text = block.text || '';
      const isStatusMessage = this.isStatusMessage(text);
      
      if (isStatusMessage) {
        console.log(`🤔 [${timestamp}] Status (${elapsed}ms): ${text}`.yellow);
      } else {
        console.log(`💬 [${timestamp}] Assistant (${elapsed}ms): ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`.green);
        
        if (verbose && text.length > 150) {
          console.log(`   Full response: ${text}`.gray);
        }
      }
    });

    // Display tool usage
    toolBlocks.forEach((block, i) => {
      const toolName = block.name;
      const toolInput = block.input;
      console.log(`🔧 [${timestamp}] Tool Use (${elapsed}ms): ${toolName}`.cyan);
      
      if (verbose) {
        console.log(`   Tool input: ${JSON.stringify(toolInput, null, 2)}`.gray);
      }
    });

    // Display usage info if available
    if (message.usage && verbose) {
      const usage = message.usage;
      console.log(`📊 Token usage: Input=${usage.input_tokens}, Output=${usage.output_tokens}`.gray);
    }
  }

  /**
   * Process result messages
   */
  processResultMessage(claudeData, timestamp) {
    const { result, subtype, is_error, duration_ms, total_cost_usd, usage } = claudeData;
    
    console.log(`📊 [${timestamp}] Result (${subtype}): ${is_error ? 'ERROR' : 'SUCCESS'}`.blue);
    
    if (result) {
      console.log(`   Result: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`.blue);
    }
    
    if (verbose) {
      console.log(`   Duration: ${duration_ms}ms, Cost: $${total_cost_usd}`.gray);
      if (usage) {
        console.log(`   Usage: ${JSON.stringify(usage, null, 2)}`.gray);
      }
    }
  }

  /**
   * Check if text is a status message
   */
  isStatusMessage(text) {
    if (!text) return false;
    
    const statusPatterns = [
      /^I'll\s+\w+/i,
      /^Let\s+me\s+\w+/i,
      /^I'm\s+going\s+to\s+\w+/i,
      /^Searching\b/i,
      /^Looking\s+at/i,
      /^Checking\b/i,
      /^Analyzing\b/i
    ];
    
    return statusPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Handle session availability
   */
  handleSessionAvailable(data) {
    console.log(`🆔 [${this.formatTime()}] Session available: ${data.sessionId}`.magenta);
    this.currentSessionId = data.sessionId;
    this.currentConversationId = data.conversationId;
  }

  /**
   * Handle conversation creation
   */
  handleConversationCreated(data) {
    console.log(`📝 [${this.formatTime()}] Conversation created: ${data.conversationId}`.magenta);
    this.currentConversationId = data.conversationId;
  }

  /**
   * Handle message completion
   */
  handleMessageComplete(data) {
    const elapsed = Date.now() - this.startTime;
    console.log(`✅ [${this.formatTime()}] Message completed (Total: ${elapsed}ms)`.green);
    console.log(`   Messages processed: ${this.messageCount}`.gray);
  }

  /**
   * Handle errors
   */
  handleError(data) {
    console.log(`❌ [${this.formatTime()}] Error: ${data.error}`.red);
    if (data.sessionRequired) {
      console.log(`   Session required: ${data.existingSessionId}`.red);
    }
  }

  /**
   * Handle aborted messages
   */
  handleAborted(data) {
    console.log(`⏹️ [${this.formatTime()}] Message aborted`.yellow);
  }

  /**
   * Send a message to the backend
   */
  async sendMessage(message, conversationId = null, sessionId = null) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`\n📤 [${this.formatTime()}] Sending message...`.cyan);
    console.log(`   Content: "${message}"`.cyan);
    console.log(`   RequestId: ${requestId}`.gray);
    console.log(`   ConversationId: ${conversationId || 'new'}`.gray);
    console.log(`   SessionId: ${sessionId || 'new'}`.gray);

    const messageData = {
      content: message,
      requestId,
      conversationId,
      projectId: DEFAULT_PROJECT_ID,
      sessionId,
      permissionMode: 'default'
    };

    this.startTime = Date.now();
    this.lastMessageTime = Date.now();
    this.messageCount = 0;

    this.socket.emit('chat:send-message', messageData);
  }

  /**
   * Format timestamp for display
   */
  formatTime() {
    const now = new Date();
    return now.toLocaleTimeString() + '.' + now.getMilliseconds().toString().padStart(3, '0');
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('\n🔌 Disconnected from backend server'.cyan);
    }
  }
}

/**
 * Main test execution
 */
async function runTest() {
  console.log('🧪 Backend-Bridge Test Client'.bold.green);
  console.log('================================\n');

  const client = new BackendBridgeTestClient();

  try {
    // Connect to backend
    await client.connect();
    
    // Get test scenario
    const testScenario = SCENARIOS[scenario] || SCENARIOS.simple;
    console.log(`📋 Running scenario: ${testScenario.name}`.bold);
    console.log(`   Description: ${testScenario.description}`);
    console.log(`   Message: "${testScenario.message}"`);
    console.log(`   Verbose mode: ${verbose ? 'ON' : 'OFF'}`);
    console.log('');

    // Send first message
    await client.sendMessage(testScenario.message);

    // Wait for completion (listening to events)
    console.log('⏳ Waiting for responses... (Press Ctrl+C to exit)\n'.yellow);

    // Keep the script running
    process.on('SIGINT', () => {
      console.log('\n\n👋 Test completed by user'.yellow);
      client.disconnect();
      process.exit(0);
    });

    // Auto-exit after 60 seconds for automated testing
    setTimeout(() => {
      console.log('\n⏰ Test timeout reached (60s)'.yellow);
      client.disconnect();
      process.exit(0);
    }, 60000);

  } catch (error) {
    console.error('❌ Test failed:'.red, error.message);
    client.disconnect();
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the test
if (require.main === module) {
  runTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { BackendBridgeTestClient };