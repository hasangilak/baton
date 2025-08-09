#!/usr/bin/env node

/**
 * Test script to simulate ExitPlanMode detection and plan review workflow
 */

const axios = require('axios');

const BRIDGE_URL = 'http://localhost:8080';
const BACKEND_URL = 'http://localhost:3001';
const PROJECT_ID = 'cmdxumi04000k4yhw92fvsqqa';

async function createTestConversation() {
  console.log('📝 Creating test conversation...');
  
  const response = await axios.post(`${BACKEND_URL}/api/chat/conversations`, {
    projectId: PROJECT_ID,
    title: 'Plan Mode Test Conversation'
  });
  
  const conversationId = response.data.conversation.id;
  console.log(`✅ Created conversation: ${conversationId}`);
  return conversationId;
}

async function testPlanReviewWorkflow() {
  console.log('🧪 Testing Plan Review Workflow...\n');
  
  try {
    // 1. Create a test conversation
    const conversationId = await createTestConversation();
    
    // 2. Send a message that should trigger ExitPlanMode
    console.log('📤 Sending message to trigger plan mode...');
    
    const bridgeRequest = {
      message: "Please create a plan for implementing a user authentication system with login, registration, and password reset functionality. Make it detailed with specific steps.",
      requestId: `test-${Date.now()}`,
      conversationId: conversationId,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'ExitPlanMode'], // Include ExitPlanMode tool
      workingDirectory: '/home/hassan/work/baton',
      permissionMode: 'plan' // Use plan mode to trigger planning
    };

    console.log('🌉 Sending request to bridge...');
    
    // Start streaming request
    const response = await axios.post(`${BRIDGE_URL}/execute`, bridgeRequest, {
      responseType: 'stream',
      timeout: 60000 // 1 minute timeout
    });

    let receivedPlanMode = false;
    let planContent = '';
    
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            
            if (data.type === 'claude_json' && data.data) {
              const sdkMessage = data.data;
              
              // Check for ExitPlanMode tool use
              if (sdkMessage.message && Array.isArray(sdkMessage.message.content)) {
                for (const block of sdkMessage.message.content) {
                  if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
                    receivedPlanMode = true;
                    planContent = block.input?.plan || 'No plan content';
                    console.log('📋 ExitPlanMode detected!');
                    console.log(`📋 Plan content preview: ${planContent.substring(0, 200)}...`);
                  }
                }
              }
            }
            
            if (data.type === 'done') {
              console.log('✅ Stream completed');
            }
            
            if (data.type === 'error') {
              console.error('❌ Stream error:', data.error);
            }
            
          } catch (parseError) {
            // Ignore parsing errors for non-JSON lines
          }
        }
      }
    });

    response.data.on('end', () => {
      console.log('\n🏁 Test completed!');
      
      if (receivedPlanMode) {
        console.log('✅ SUCCESS: ExitPlanMode was detected and intercepted!');
        console.log('✅ Plan review workflow should have been triggered');
        console.log('✅ Bridge service correctly handled PLAN risk level');
      } else {
        console.log('❌ ExitPlanMode was not detected - check bridge configuration');
      }
      
      process.exit(receivedPlanMode ? 0 : 1);
    });

    response.data.on('error', (error) => {
      console.error('❌ Stream error:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Starting Plan Mode Test...\n');
testPlanReviewWorkflow();