#!/usr/bin/env node

/**
 * Test script to simulate bidirectional communication between backend and bridge
 * This script will:
 * 1. Connect to backend as a regular client
 * 2. Send a chat message via WebSocket
 * 3. Monitor backend → bridge communication
 * 4. Monitor bridge → backend responses
 * 5. Track the complete message flow
 */

const { io } = require('socket.io-client');
const WebSocket = require('ws');

class BridgeConnectionTester {
  constructor() {
    this.backendSocket = null;
    this.bridgeWebSocket = null;
    this.testRequestId = null;
    this.messageFlow = [];
    this.bridgePort = 8080;
    this.backendUrl = 'http://localhost:3001';
    this.conversationId = 'cme6ffrn00018kziprwfrk90y'; // Use actual conversation ID for project
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, data };
    this.messageFlow.push(logEntry);
    
    if (data) {
      console.log(`[${timestamp}] ${message}:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  }

  async connectToBackend() {
    return new Promise((resolve, reject) => {
      this.log('🔗 Connecting to backend Socket.IO server');
      
      this.backendSocket = io(this.backendUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        autoConnect: true
      });

      this.backendSocket.on('connect', () => {
        this.log('✅ Connected to backend', { socketId: this.backendSocket.id });
        this.setupBackendListeners();
        resolve();
      });

      this.backendSocket.on('connect_error', (error) => {
        this.log('❌ Backend connection error', { error: error.message });
        reject(error);
      });

      this.backendSocket.on('disconnect', (reason) => {
        this.log('🔌 Disconnected from backend', { reason });
      });
    });
  }

  async createConversation() {
    this.log('📝 Creating test conversation via API');
    
    try {
      const response = await fetch(`${this.backendUrl}/api/chat/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Bridge Connection Test',
          projectId: 'cmdxumi04000k4yhw92fvsqqa' // Default test project ID from CLAUDE.md
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      this.conversationId = data.conversation?.id || data.id;
      
      this.log('✅ Created test conversation', { 
        conversationId: this.conversationId,
        title: data.conversation?.title || data.title
      });
      
      return this.conversationId;
    } catch (error) {
      this.log('❌ Failed to create conversation', { error: error.message });
      throw error;
    }
  }

  async connectToBridge() {
    // Skip direct bridge connection - bridge service doesn't expose WebSocket for external clients
    // It only connects to the backend as a client
    this.log('⚠️  Skipping direct bridge connection - bridge service only connects to backend');
    return Promise.resolve();
  }

  setupBackendListeners() {
    // Monitor responses from backend
    this.backendSocket.on('chat:stream-response', (data) => {
      this.log('📡 Backend → Frontend: chat:stream-response', data);
    });

    this.backendSocket.on('chat:session-id-available', (data) => {
      this.log('🔗 Backend → Frontend: session-id-available', data);
    });

    this.backendSocket.on('chat:message-complete', (data) => {
      this.log('✅ Backend → Frontend: message-complete', data);
    });

    this.backendSocket.on('chat:error', (data) => {
      this.log('❌ Backend → Frontend: error', data);
    });

    this.backendSocket.on('chat:aborted', (data) => {
      this.log('⏹️ Backend → Frontend: aborted', data);
    });

    // Monitor bridge connection events
    this.backendSocket.on('claude-bridge:connected', () => {
      this.log('🌉 Backend notified: bridge connected');
    });

    this.backendSocket.on('claude-bridge:disconnected', () => {
      this.log('🌉 Backend notified: bridge disconnected');
    });
  }

  setupBridgeListeners() {
    this.bridgeWebSocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.log('📨 Bridge → Client: WebSocket message', message);
      } catch (error) {
        this.log('📨 Bridge → Client: Raw WebSocket message', { data: data.toString() });
      }
    });
  }

  async sendTestMessage() {
    const content = "Hello! This is a test message to verify bidirectional communication between backend and bridge service.";
    this.testRequestId = `test_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.log('📤 Sending test message via backend WebSocket', {
      conversationId: this.conversationId,
      content,
      requestId: this.testRequestId
    });

    const messageData = {
      conversationId: this.conversationId,
      content, // Changed from 'message' to 'content' to match backend expectations
      requestId: this.testRequestId,
      allowedTools: ['Write', 'Edit', 'Read', 'Bash'],
      permissionMode: 'default'
    };

    this.backendSocket.emit('chat:send-message', messageData);
  }

  async runTest() {
    try {
      console.log('🧪 Starting bidirectional bridge connection test\n');

      // Step 1: Connect to backend
      await this.connectToBackend();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Using existing conversation ID for the project
      this.log('📋 Using existing conversation ID for project', { conversationId: this.conversationId });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Note bridge connection architecture
      await this.connectToBridge();
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 4: Send test message
      await this.sendTestMessage();

      // Step 5: Wait for responses
      this.log('⏳ Waiting for responses (30 seconds timeout)...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Step 6: Generate report
      this.generateReport();

    } catch (error) {
      this.log('❌ Test failed', { error: error.message });
      console.error('Test error:', error);
    } finally {
      this.cleanup();
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 BIDIRECTIONAL COMMUNICATION TEST REPORT');
    console.log('='.repeat(80));

    console.log('\n📋 Message Flow Timeline:');
    this.messageFlow.forEach((entry, index) => {
      console.log(`${index + 1}. [${entry.timestamp}] ${entry.message}`);
    });

    // Analyze the flow
    console.log('\n🔍 Flow Analysis:');
    
    const hasBackendConnection = this.messageFlow.some(entry => 
      entry.message.includes('Connected to backend'));
    
    const hasBridgeConnection = this.messageFlow.some(entry => 
      entry.message.includes('Connected to bridge'));
    
    const hasMessageSent = this.messageFlow.some(entry => 
      entry.message.includes('Sending test message'));
    
    const hasStreamResponse = this.messageFlow.some(entry => 
      entry.message.includes('chat:stream-response'));
    
    const hasSessionId = this.messageFlow.some(entry => 
      entry.message.includes('session-id-available'));
    
    const hasMessageComplete = this.messageFlow.some(entry => 
      entry.message.includes('message-complete'));
    
    const hasErrors = this.messageFlow.some(entry => 
      entry.message.includes('error') || entry.message.includes('❌'));

    console.log(`✅ Backend Connection: ${hasBackendConnection ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Bridge Connection: ${hasBridgeConnection ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Message Sent: ${hasMessageSent ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Stream Response: ${hasStreamResponse ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Session ID: ${hasSessionId ? 'SUCCESS' : 'FAILED'}`);
    console.log(`✅ Message Complete: ${hasMessageComplete ? 'SUCCESS' : 'FAILED'}`);
    console.log(`❌ Errors Detected: ${hasErrors ? 'YES' : 'NO'}`);

    // Overall status
    const overallSuccess = hasBackendConnection && hasMessageSent && !hasErrors && 
                          (hasStreamResponse || hasSessionId || hasMessageComplete);
    
    console.log(`\n🎯 Overall Test Result: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);

    if (!overallSuccess) {
      console.log('\n🔧 Troubleshooting Recommendations:');
      if (!hasBackendConnection) {
        console.log('- Check if backend server is running on port 3001');
      }
      if (!hasBridgeConnection) {
        console.log('- Check if bridge service is running on port 8080');
      }
      if (!hasStreamResponse && !hasSessionId && !hasMessageComplete) {
        console.log('- Bridge service may not be receiving messages from backend');
        console.log('- Check backend logs for bridge communication');
        console.log('- Verify bridge service is properly joined to claude-bridge room');
      }
    }

    console.log('\n' + '='.repeat(80));
  }

  cleanup() {
    this.log('🧹 Cleaning up connections');
    
    if (this.backendSocket) {
      this.backendSocket.disconnect();
    }
    
    if (this.bridgeWebSocket) {
      this.bridgeWebSocket.close();
    }
  }
}

// Run the test
if (require.main === module) {
  const tester = new BridgeConnectionTester();
  tester.runTest().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  });
}

module.exports = BridgeConnectionTester;