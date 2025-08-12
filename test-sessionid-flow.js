#!/usr/bin/env node

/**
 * Test sessionId flow from bridge → backend → database
 */

const io = require('socket.io-client');
const { MongoClient } = require('mongodb');

const TEST_PROJECT_ID = '689b0107dec8469824f3f4f7'; // The existing "baton" project

async function testSessionIdFlow() {
  console.log('🧪 Testing sessionId flow: Bridge → Backend → Database');
  
  // Connect to backend WebSocket
  const backendSocket = io('http://localhost:3001', {
    transports: ['websocket', 'polling']
  });

  // Connect to MongoDB for verification
  const mongoClient = new MongoClient('mongodb://localhost:27017');
  await mongoClient.connect();
  const db = mongoClient.db('baton_dev');
  const messagesCollection = db.collection('messages');

  return new Promise((resolve, reject) => {
    const testRequestId = `test_${Date.now()}`;
    let receivedSessionId = null;
    let messageStored = false;

    // Set timeout for test
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Test timeout after 30 seconds'));
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
      backendSocket.disconnect();
      mongoClient.close();
    };

    backendSocket.on('connect', () => {
      console.log('✅ Connected to backend WebSocket');
      
      // Listen for stream responses
      backendSocket.on('chat:stream-response', async (data) => {
        console.log(`📡 Received stream response:`, {
          type: data.type,
          requestId: data.requestId,
          sessionId: data.sessionId,
          hasData: !!data.data
        });

        // Capture sessionId from stream response
        if (data.sessionId) {
          receivedSessionId = data.sessionId;
          console.log(`🔗 Captured sessionId: ${receivedSessionId}`);
        }

        // If this is a result message, check database storage
        if (data.type === 'claude_json' && data.data?.type === 'result') {
          console.log('🏁 Result message received, checking database...');
          
          // Wait a moment for database storage
          setTimeout(async () => {
            try {
              const message = await messagesCollection.findOne({
                sessionId: receivedSessionId
              }, { sort: { createdAt: -1 } });

              if (message) {
                console.log('✅ Message found in database:', {
                  id: message._id,
                  sessionId: message.sessionId,
                  projectId: message.projectId,
                  role: message.role,
                  type: message.type
                });
                messageStored = true;

                // Verify sessionId matches
                if (message.sessionId === receivedSessionId) {
                  console.log('🎯 SessionId flow verification PASSED!');
                  cleanup();
                  resolve({
                    success: true,
                    sessionId: receivedSessionId,
                    messageId: message._id,
                    projectId: message.projectId
                  });
                } else {
                  console.log('❌ SessionId mismatch!');
                  cleanup();
                  reject(new Error(`SessionId mismatch: expected ${receivedSessionId}, got ${message.sessionId}`));
                }
              } else {
                console.log('❌ No message found in database');
                cleanup();
                reject(new Error('Message not stored in database'));
              }
            } catch (error) {
              console.error('❌ Database check error:', error);
              cleanup();
              reject(error);
            }
          }, 2000); // Wait 2 seconds for storage
        }
      });

      backendSocket.on('chat:error', (error) => {
        console.error('❌ Chat error:', error);
        cleanup();
        reject(new Error(`Chat error: ${error.error}`));
      });

      // Send test message
      console.log('📤 Sending test message...');
      backendSocket.emit('chat:send-message', {
        projectId: TEST_PROJECT_ID,
        content: 'Hello, test the sessionId flow!',
        requestId: testRequestId,
        allowedTools: [],
        workingDirectory: process.cwd(),
        permissionMode: 'default'
      });
    });

    backendSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      cleanup();
      reject(error);
    });
  });
}

// Run the test
testSessionIdFlow()
  .then((result) => {
    console.log('🎉 Test completed successfully:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test failed:', error.message);
    process.exit(1);
  });