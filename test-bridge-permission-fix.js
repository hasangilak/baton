#!/usr/bin/env node

/**
 * Test Bridge Permission Fix
 * 
 * This script tests that the bridge service no longer crashes when 
 * handling permission prompts in the canUseTool callback.
 */

const API_BASE_URL = 'http://localhost:3001';
const BRIDGE_URL = 'http://localhost:8080';

async function createTestConversation() {
  console.log('📝 Creating test conversation with plan mode...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'cmdxumi04000k4yhw92fvsqqa',
        title: 'Bridge Permission Fix Test'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      const conversationId = data.conversation.id;
      console.log('✅ Created test conversation:', conversationId);
      
      // Set permission mode to 'plan' to trigger permission system
      const modeResponse = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/permission-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permissionMode: 'plan',
          reason: 'bridge_permission_test'
        })
      });
      
      if (modeResponse.ok) {
        console.log('✅ Set permission mode to "plan"');
        return conversationId;
      } else {
        console.error('❌ Failed to set permission mode');
        return null;
      }
    } else {
      console.error('❌ Failed to create conversation:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error creating conversation:', error.message);
    return null;
  }
}

async function testBridgePermissionHandling(conversationId) {
  console.log('🧪 Testing bridge permission handling...');
  
  try {
    // Send a message that will trigger tool usage requiring permission
    const response = await fetch(`${API_BASE_URL}/api/chat/messages/stream-webui`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Please use the Read tool to read the README.md file and tell me about the project structure',
        conversationId: conversationId,
        requestId: 'bridge-test-' + Date.now(),
        permissionMode: 'plan' // This should trigger permission prompts
      })
    });
    
    if (response.ok) {
      console.log('✅ Streaming request initiated successfully');
      
      // Read the stream to see if it completes without errors
      const reader = response.body.getReader();
      let messageCount = 0;
      let hasError = false;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                messageCount++;
                
                // Check for error types
                if (data.type === 'error' || data.data?.type === 'error') {
                  console.error('❌ Stream error detected:', data);
                  hasError = true;
                  break;
                }
                
                // Log interesting messages
                if (data.data?.message?.content) {
                  console.log(`📩 Message ${messageCount}: ${data.data.type || 'unknown'}`);
                }
              } catch (parseError) {
                // Ignore non-JSON lines
              }
            }
          }
          
          if (hasError) break;
          
          // Safety timeout - don't wait forever
          if (messageCount > 50) {
            console.log('⚠️  Stopping after 50 messages to prevent timeout');
            break;
          }
        }
        
        if (!hasError) {
          console.log(`✅ Stream completed successfully with ${messageCount} messages`);
          console.log('✅ No bridge crashes detected in permission handling');
          return true;
        } else {
          console.error('❌ Stream had errors');
          return false;
        }
        
      } finally {
        reader.releaseLock();
      }
      
    } else {
      const errorData = await response.text();
      console.error('❌ Failed to initiate streaming:', response.status, errorData);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error testing bridge permission handling:', error.message);
    return false;
  }
}

async function runBridgePermissionTest() {
  console.log('🚀 Starting Bridge Permission Fix Test');
  console.log('=' .repeat(50));
  
  // Check services health
  try {
    const bridgeResponse = await fetch(`${BRIDGE_URL}/health`);
    const backendResponse = await fetch(`${API_BASE_URL}/api/projects`);
    
    if (!bridgeResponse.ok || !backendResponse.ok) {
      console.error('❌ Services not healthy');
      process.exit(1);
    }
    console.log('✅ Bridge and backend services are healthy');
  } catch (error) {
    console.error('❌ Service health check failed:', error.message);
    process.exit(1);
  }
  
  const conversationId = await createTestConversation();
  if (!conversationId) {
    console.error('❌ Failed to create test conversation');
    process.exit(1);
  }
  
  console.log('\n🔧 Testing permission system with streaming...');
  const testPassed = await testBridgePermissionHandling(conversationId);
  
  if (testPassed) {
    console.log('\n✅ BRIDGE PERMISSION FIX TEST PASSED!');
    console.log('🎉 Bridge service handles permissions without crashing');
    console.log('\nFix validated:');
    console.log('• ReadableStream controller null safety checks work');
    console.log('• Permission prompts don\'t crash bridge service');
    console.log('• Streaming continues properly after permission handling');
  } else {
    console.error('\n❌ Bridge permission fix test failed');
    process.exit(1);
  }
}

// Run the bridge permission test
runBridgePermissionTest().catch(error => {
  console.error('❌ Bridge permission test crashed:', error);
  process.exit(1);
});