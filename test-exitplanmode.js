#!/usr/bin/env node

/**
 * Test script to directly test ExitPlanMode tool detection
 */

const axios = require('axios');

const BRIDGE_URL = 'http://localhost:8080';
const BACKEND_URL = 'http://localhost:3001';

async function testExitPlanModeDirectly() {
  console.log('🧪 Testing ExitPlanMode direct invocation...\n');
  
  try {
    // Create a test conversation
    const convResponse = await axios.post(`${BACKEND_URL}/api/chat/conversations`, {
      projectId: 'cmdxumi04000k4yhw92fvsqqa',
      title: 'ExitPlanMode Direct Test'
    });
    
    const conversationId = convResponse.data.conversation.id;
    console.log(`✅ Created conversation: ${conversationId}`);
    
    // Send a message that explicitly asks Claude to enter plan mode and then use ExitPlanMode
    const message = `You are now in plan mode. I want you to create a detailed implementation plan for adding a search feature to our application, then use the ExitPlanMode tool to present the plan for review.

The search feature should include:
1. Backend search API endpoints
2. Frontend search components
3. Search result highlighting
4. Search filters and sorting
5. Search history

Please create a comprehensive plan and then call the ExitPlanMode tool with the plan content.`;

    console.log('📤 Sending direct ExitPlanMode test message...');
    
    const bridgeRequest = {
      message: message,
      requestId: `exitplanmode-test-${Date.now()}`,
      conversationId: conversationId,
      allowedTools: ['Read', 'LS', 'Glob', 'Grep', 'ExitPlanMode'],
      workingDirectory: '/home/hassan/work/baton',
      permissionMode: 'plan'
    };

    console.log('🌉 Sending request to bridge...');
    
    // Start streaming request
    const response = await axios.post(`${BRIDGE_URL}/execute`, bridgeRequest, {
      responseType: 'stream',
      timeout: 120000 // 2 minute timeout
    });

    let planModeDetected = false;
    let planContent = '';
    let toolUseDetected = false;
    
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            
            if (data.type === 'claude_json' && data.data) {
              const sdkMessage = data.data;
              
              // Log all messages to see what's happening
              console.log(`📨 Message type: ${sdkMessage.type}, role: ${sdkMessage.message?.role || 'n/a'}`);
              
              // Check for tool use in assistant messages
              if (sdkMessage.message && Array.isArray(sdkMessage.message.content)) {
                for (const block of sdkMessage.message.content) {
                  if (block.type === 'tool_use') {
                    toolUseDetected = true;
                    console.log(`🔧 Tool use detected: ${block.name}`);
                    
                    if (block.name === 'ExitPlanMode') {
                      planModeDetected = true;
                      planContent = block.input?.plan || 'No plan content';
                      console.log('🎯 ExitPlanMode tool detected!');
                      console.log(`📋 Plan content length: ${planContent.length} characters`);
                      console.log(`📋 Plan preview: ${planContent.substring(0, 300)}...`);
                    }
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
      console.log('\n🏁 ExitPlanMode test completed!');
      
      if (planModeDetected) {
        console.log('✅ SUCCESS: ExitPlanMode tool was used!');
        console.log('✅ Plan review workflow should have been triggered');
        console.log('✅ Bridge service should have intercepted the plan');
      } else if (toolUseDetected) {
        console.log('⚠️  Tools were detected but not ExitPlanMode');
        console.log('❓ Claude may not have used the ExitPlanMode tool');
      } else {
        console.log('❌ No tool use detected');
        console.log('❓ Check if Claude is configured to use tools');
      }
      
      process.exit(planModeDetected ? 0 : 1);
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
console.log('🚀 Starting ExitPlanMode Direct Test...\n');
testExitPlanModeDirectly();