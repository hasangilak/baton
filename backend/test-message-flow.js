#!/usr/bin/env node

/**
 * Complete Message Storage and Display Flow Test
 * 
 * Tests the entire chat flow:
 * 1. WebSocket connection to backend
 * 2. Message creation and storage
 * 3. Message retrieval and display
 * 4. Real-time updates via WebSocket
 * 5. Error handling
 */

const { io } = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');

// Test configuration
const BACKEND_URL = 'http://localhost:3001';
const TEST_CONVERSATION_ID = `test-conversation-${Date.now()}`;
const TEST_PROJECT_ID = '689b0107dec8469824f3f4f7'; // Baton project from seed data

class MessageFlowTester {
  constructor() {
    this.prisma = new PrismaClient();
    this.socket = null;
    this.testResults = {
      connection: false,
      messageStorage: false,
      messageRetrieval: false,
      realTimeUpdates: false,
      errorHandling: false
    };
    this.receivedMessages = new Map();
  }

  async init() {
    console.log('🚀 Initializing Message Flow Test');
    console.log(`📊 Test Conversation ID: ${TEST_CONVERSATION_ID}`);
    console.log(`📁 Test Project ID: ${TEST_PROJECT_ID}`);
    
    // Connect to WebSocket
    this.socket = io(BACKEND_URL, {
      transports: ['websocket'],
      forceNew: true
    });

    return new Promise((resolve) => {
      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected:', this.socket.id);
        this.testResults.connection = true;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ WebSocket connection failed:', error.message);
        resolve();
      });
    });
  }

  async testMessageStorage() {
    console.log('\n📝 Testing Message Creation and Storage...');
    
    try {
      // First ensure conversation exists
      await this.prisma.conversation.upsert({
        where: { id: TEST_CONVERSATION_ID },
        create: {
          id: TEST_CONVERSATION_ID,
          title: 'Message Flow Test Conversation',
          projectId: TEST_PROJECT_ID,
          userId: 'test-user'
        },
        update: {}
      });

      console.log('✅ Test conversation created/verified');

      // Set up listeners for WebSocket responses
      this.setupWebSocketListeners();

      // Send a test message via WebSocket
      const requestId = `test-request-${Date.now()}`;
      const testMessage = 'Hello, this is a test message for storage verification.';
      
      console.log(`📤 Sending test message with requestId: ${requestId}`);
      
      this.socket.emit('chat:send-message', {
        conversationId: TEST_CONVERSATION_ID,
        content: testMessage,
        requestId: requestId,
        sessionId: `test-session-${Date.now()}`,
        allowedTools: ['Write', 'Edit', 'Read'],
        workingDirectory: '/tmp/test',
        permissionMode: 'default'
      });

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify message was stored in database
      const storedMessages = await this.prisma.message.findMany({
        where: { conversationId: TEST_CONVERSATION_ID },
        orderBy: { createdAt: 'asc' },
        include: { attachments: true }
      });

      console.log(`📊 Found ${storedMessages.length} messages in database`);
      
      if (storedMessages.length >= 1) {
        const userMessage = storedMessages.find(m => m.role === 'user');
        if (userMessage && userMessage.content === testMessage) {
          console.log('✅ User message stored correctly');
          this.testResults.messageStorage = true;
        } else {
          console.log('❌ User message not found or content mismatch');
        }

        const assistantMessage = storedMessages.find(m => m.role === 'assistant');
        if (assistantMessage) {
          console.log(`✅ Assistant message placeholder created (status: ${assistantMessage.status})`);
        } else {
          console.log('❌ Assistant message placeholder not created');
        }
      } else {
        console.log('❌ No messages found in database');
      }

    } catch (error) {
      console.error('❌ Message storage test failed:', error.message);
    }
  }

  setupWebSocketListeners() {
    console.log('👂 Setting up WebSocket listeners...');

    this.socket.on('chat:stream-response', (data) => {
      console.log(`📡 Received stream response for ${data.requestId}`);
      this.receivedMessages.set(data.requestId, data);
      this.testResults.realTimeUpdates = true;
    });

    this.socket.on('chat:message-complete', (data) => {
      console.log(`✅ Message completed for ${data.requestId}`);
    });

    this.socket.on('chat:error', (data) => {
      console.log(`❌ Chat error for ${data.requestId}: ${data.error}`);
      this.testResults.errorHandling = true;
    });
  }

  async testMessageRetrieval() {
    console.log('\n📖 Testing Message Retrieval...');
    
    try {
      // Test conversation retrieval (if endpoint exists)
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: TEST_CONVERSATION_ID },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { attachments: true }
          }
        }
      });

      if (conversation && conversation.messages.length > 0) {
        console.log(`✅ Retrieved conversation with ${conversation.messages.length} messages`);
        console.log(`📄 Messages: ${conversation.messages.map(m => `${m.role}: ${m.content.substring(0, 50)}...`).join(', ')}`);
        this.testResults.messageRetrieval = true;
      } else {
        console.log('❌ No conversation or messages found');
      }

    } catch (error) {
      console.error('❌ Message retrieval test failed:', error.message);
    }
  }

  async testPersistenceAcrossSessions() {
    console.log('\n🔄 Testing Message Persistence Across Sessions...');
    
    try {
      // Disconnect and reconnect
      this.socket.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('🔌 Reconnecting...');
      this.socket.connect();
      
      await new Promise(resolve => {
        this.socket.on('connect', resolve);
      });
      
      console.log('✅ Reconnected to WebSocket');

      // Check if messages persist
      const persistedMessages = await this.prisma.message.findMany({
        where: { conversationId: TEST_CONVERSATION_ID },
        orderBy: { createdAt: 'asc' }
      });

      if (persistedMessages.length > 0) {
        console.log(`✅ Messages persisted across sessions: ${persistedMessages.length} messages found`);
      } else {
        console.log('❌ Messages not persisted across sessions');
      }

    } catch (error) {
      console.error('❌ Persistence test failed:', error.message);
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling...');
    
    try {
      // Test with invalid conversation ID
      const invalidRequestId = `invalid-request-${Date.now()}`;
      
      this.socket.emit('chat:send-message', {
        conversationId: 'invalid-conversation-id',
        content: 'This should trigger an error',
        requestId: invalidRequestId
      });

      // Wait for error response
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (this.testResults.errorHandling) {
        console.log('✅ Error handling working correctly');
      } else {
        console.log('⚠️ No error received - may need to check error handling');
      }

    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      // Delete test messages and conversation
      await this.prisma.message.deleteMany({
        where: { conversationId: TEST_CONVERSATION_ID }
      });
      
      await this.prisma.conversation.delete({
        where: { id: TEST_CONVERSATION_ID }
      });
      
      console.log('✅ Test data cleaned up');
    } catch (error) {
      console.error('⚠️ Cleanup failed (may be okay if test data was not created):', error.message);
    } finally {
      await this.prisma.$disconnect();
      if (this.socket) {
        this.socket.disconnect();
      }
    }
  }

  printResults() {
    console.log('\n🎯 TEST RESULTS');
    console.log('===============');
    
    Object.entries(this.testResults).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
    });
    
    const totalTests = Object.keys(this.testResults).length;
    const passedTests = Object.values(this.testResults).filter(Boolean).length;
    const successRate = (passedTests / totalTests * 100).toFixed(1);
    
    console.log(`\n📊 Success Rate: ${passedTests}/${totalTests} (${successRate}%)`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED - Message flow is working correctly!');
    } else {
      console.log('⚠️ Some tests failed - Message flow needs attention');
    }
  }

  async runAllTests() {
    try {
      await this.init();
      
      if (!this.testResults.connection) {
        console.log('❌ Cannot proceed without WebSocket connection');
        return;
      }

      await this.testMessageStorage();
      await this.testMessageRetrieval();
      await this.testPersistenceAcrossSessions();
      await this.testErrorHandling();
      
    } catch (error) {
      console.error('🚨 Test suite failed:', error);
    } finally {
      this.printResults();
      await this.cleanup();
    }
  }
}

// Run the test
async function main() {
  console.log('🧪 BATON MESSAGE FLOW TEST SUITE');
  console.log('=================================');
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

  const tester = new MessageFlowTester();
  await tester.runAllTests();
  
  console.log(`\n⏰ Completed at: ${new Date().toISOString()}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MessageFlowTester;