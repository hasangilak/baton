#!/usr/bin/env node

/**
 * Simple test to verify plan mode interruption works
 */

const axios = require('axios');

const BRIDGE_URL = 'http://localhost:8080';
const BACKEND_URL = 'http://localhost:3001';
const PROJECT_ID = 'demo-project-1';

async function testPlanInterruption() {
  console.log('🧪 Testing Plan Mode Interruption...\n');
  
  try {
    // 1. Create a conversation
    console.log('📝 Creating conversation...');
    const convResponse = await axios.post(`${BACKEND_URL}/api/chat/conversations`, {
      projectId: PROJECT_ID,
      title: 'Plan Interruption Test'
    });
    
    const conversationId = convResponse.data.conversation.id;
    console.log(`✅ Created conversation: ${conversationId}`);
    
    // 2. Send a message that should trigger ExitPlanMode
    const message = `I want to implement a user authentication system. Please create a detailed plan and then use ExitPlanMode to present it for review.`;
    
    console.log('📤 Sending message to trigger plan mode...');
    
    const request = {
      message: message,
      requestId: `plan-test-${Date.now()}`,
      conversationId: conversationId,
      allowedTools: ['ExitPlanMode'],
      workingDirectory: '/home/hassan/work/baton',
      permissionMode: 'auto'
    };
    
    const response = await axios.post(`${BRIDGE_URL}/execute`, request, {
      responseType: 'stream',
      timeout: 30000
    });
    
    let planDetected = false;
    let planReviewCreated = false;
    
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
                    planDetected = true;
                    console.log('🎯 ExitPlanMode detected!');
                    console.log(`📋 Plan: ${(block.input?.plan || '').substring(0, 100)}...`);
                  }
                }
              }
            }
            
            if (data.type === 'plan_review_created') {
              planReviewCreated = true;
              console.log('🛑 Plan review created - user interruption should occur!');
            }
            
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });
    
    response.data.on('end', () => {
      console.log('\n🏁 Test completed!');
      
      if (planDetected && planReviewCreated) {
        console.log('✅ SUCCESS: Plan mode interruption worked!');
        process.exit(0);
      } else if (planDetected) {
        console.log('⚠️  ExitPlanMode detected but no plan review created');
        console.log('❓ Check backend logs for plan review creation');
        process.exit(1);
      } else {
        console.log('❌ ExitPlanMode was not used');
        process.exit(1);
      }
    });
    
    response.data.on('error', (error) => {
      console.error('❌ Stream error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testPlanInterruption();