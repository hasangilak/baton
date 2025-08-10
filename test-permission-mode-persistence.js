#!/usr/bin/env node

/**
 * Test Permission Mode Persistence Fix
 * 
 * This script tests that manual permission mode changes in the frontend
 * are properly persisted to the database and not overridden by the backend.
 */

const API_BASE_URL = 'http://localhost:3001';

async function createTestConversation() {
  console.log('📝 Creating test conversation...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'cmdxumi04000k4yhw92fvsqqa', // Default Baton project
        title: 'Permission Mode Persistence Test'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('✅ Created test conversation:', data.conversation.id);
      return data.conversation.id;
    } else {
      console.error('❌ Failed to create conversation:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error creating conversation:', error.message);
    return null;
  }
}

async function testPermissionModePersistence(conversationId) {
  console.log('🧪 Testing permission mode persistence...');
  
  // Test 1: Set permission mode to 'plan'
  console.log('1. Setting permission mode to "plan"');
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/permission-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissionMode: 'plan',
        reason: 'test_persistence'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('✅ Permission mode set to "plan"');
    } else {
      console.error('❌ Failed to set permission mode:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error setting permission mode:', error.message);
    return false;
  }
  
  // Test 2: Retrieve permission mode and verify it's 'plan'
  console.log('2. Retrieving permission mode to verify persistence');
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/permission-mode`);
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log(`✅ Retrieved permission mode: "${data.permissionMode}"`);
      
      if (data.permissionMode === 'plan') {
        console.log('✅ Permission mode correctly persisted as "plan"');
      } else {
        console.error(`❌ Expected "plan" but got "${data.permissionMode}"`);
        return false;
      }
    } else {
      console.error('❌ Failed to retrieve permission mode:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error retrieving permission mode:', error.message);
    return false;
  }
  
  // Test 3: Set to 'acceptEdits' and verify
  console.log('3. Setting permission mode to "acceptEdits"');
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/permission-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissionMode: 'acceptEdits',
        reason: 'test_cycling'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('✅ Permission mode set to "acceptEdits"');
    } else {
      console.error('❌ Failed to set permission mode to acceptEdits:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error setting permission mode to acceptEdits:', error.message);
    return false;
  }
  
  // Test 4: Verify it persisted correctly
  console.log('4. Verifying "acceptEdits" persistence');
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/permission-mode`);
    const data = await response.json();
    
    if (response.ok && data.success) {
      if (data.permissionMode === 'acceptEdits') {
        console.log('✅ Permission mode correctly persisted as "acceptEdits"');
        return true;
      } else {
        console.error(`❌ Expected "acceptEdits" but got "${data.permissionMode}"`);
        return false;
      }
    } else {
      console.error('❌ Failed to retrieve permission mode:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error retrieving permission mode:', error.message);
    return false;
  }
}

async function runPersistenceTest() {
  console.log('🚀 Starting Permission Mode Persistence Test');
  console.log('=' .repeat(50));
  
  // Check backend health
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects`);
    if (!response.ok) {
      console.error('❌ Backend not responding');
      process.exit(1);
    }
    console.log('✅ Backend is healthy');
  } catch (error) {
    console.error('❌ Backend health check failed:', error.message);
    process.exit(1);
  }
  
  const conversationId = await createTestConversation();
  if (!conversationId) {
    console.error('❌ Failed to create test conversation');
    process.exit(1);
  }
  
  const testPassed = await testPermissionModePersistence(conversationId);
  
  if (testPassed) {
    console.log('\n✅ ALL PERMISSION MODE PERSISTENCE TESTS PASSED!');
    console.log('🎉 Permission mode changes are now properly persisted');
    console.log('\nNext steps:');
    console.log('1. Test in chat interface by cycling permission modes');
    console.log('2. Verify bridge service no longer overrides manual changes');
    console.log('3. Confirm permission mode stays consistent across requests');
  } else {
    console.error('\n❌ Permission mode persistence test failed');
    process.exit(1);
  }
}

// Run the persistence test
runPersistenceTest().catch(error => {
  console.error('❌ Persistence test crashed:', error);
  process.exit(1);
});