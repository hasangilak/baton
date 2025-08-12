#!/usr/bin/env node

/**
 * Simple test to send a message and check sessionId handling
 */

const io = require('socket.io-client');

const TEST_PROJECT_ID = '689b0107dec8469824f3f4f7'; // The existing "baton" project
const TEST_CONVERSATION_ID = '689bc55de34d753ff33e5142'; // Created test conversation

async function sendTestMessage() {
  console.log('🧪 Sending test message to verify sessionId handling');
  
  // Connect to backend WebSocket
  const backendSocket = io('http://localhost:3001', {
    transports: ['websocket', 'polling']
  });

  return new Promise((resolve, reject) => {
    const testRequestId = `test_${Date.now()}`;
    let receivedSessionId = null;

    // Set timeout for test
    const timeout = setTimeout(() => {
      backendSocket.disconnect();
      resolve({ receivedSessionId, testRequestId });
    }, 15000);

    backendSocket.on('connect', () => {
      console.log('✅ Connected to backend WebSocket');
      
      // Listen for stream responses
      backendSocket.on('chat:stream-response', (data) => {
        console.log(`📡 Stream response:`, {
          type: data.type,
          requestId: data.requestId,
          sessionId: data.sessionId,
          dataType: data.data?.type
        });

        // Capture sessionId
        if (data.sessionId) {
          receivedSessionId = data.sessionId;
          console.log(`🔗 SessionId captured: ${receivedSessionId}`);
        }

        // If result, complete test
        if (data.type === 'claude_json' && data.data?.type === 'result') {
          console.log('🏁 Test complete - check database manually');
          clearTimeout(timeout);
          backendSocket.disconnect();
          resolve({ receivedSessionId, testRequestId });
        }
      });

      backendSocket.on('chat:error', (error) => {
        console.error('❌ Chat error:', error);
        clearTimeout(timeout);
        backendSocket.disconnect();
        reject(error);
      });

      // Send test message
      console.log('📤 Sending test message...');
      backendSocket.emit('chat:send-message', {
        projectId: TEST_PROJECT_ID,
        content: 'Hello! Test sessionId storage in database.',
        requestId: testRequestId,
        sessionId: '0b2fb441-a8b1-4d31-bc8b-33c41f6c0595', // Use existing session ID
        allowedTools: [],
        workingDirectory: process.cwd(),
        permissionMode: 'default'
      });
    });

    backendSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      clearTimeout(timeout);
      backendSocket.disconnect();
      reject(error);
    });
  });
}

// Run the test
sendTestMessage()
  .then((result) => {
    console.log('🎉 Test message sent:', result);
    console.log('📋 Check database with the captured sessionId');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });