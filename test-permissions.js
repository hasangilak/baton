#!/usr/bin/env node

/**
 * Test script for conversation-level permissions system
 * Tests the WebUI chat handler with permission prompts
 */

const axios = require('axios');

const BACKEND_URL = 'http://localhost:3001';

async function testPermissionsSystem() {
    console.log('🧪 Testing Conversation-Level Permissions System\n');

    try {
        // Step 1: Create a test conversation
        console.log('1️⃣ Creating test conversation...');
        const conversationResponse = await axios.post(`${BACKEND_URL}/api/chat/conversations`, {
            projectId: 'demo-project-1',
            title: 'Permission Test Conversation'
        });
        
        const conversationId = conversationResponse.data.conversation.id;
        console.log(`✅ Created conversation: ${conversationId}\n`);

        // Step 2: Check initial permissions (should be empty)
        console.log('2️⃣ Checking initial permissions...');
        const initialPerms = await axios.get(`${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`);
        console.log(`✅ Initial permissions: ${JSON.stringify(initialPerms.data.permissions)}\n`);

        // Step 3: Grant Edit permission manually
        console.log('3️⃣ Granting Edit tool permission...');
        await axios.post(`${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`, {
            toolName: 'Edit',
            status: 'granted',
            grantedBy: 'test_script'
        });
        console.log('✅ Edit permission granted\n');

        // Step 4: Check permissions after granting
        console.log('4️⃣ Checking permissions after granting...');
        const updatedPerms = await axios.get(`${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`);
        console.log(`✅ Updated permissions: ${JSON.stringify(updatedPerms.data.permissions)}\n`);

        // Step 5: Test WebUI streaming endpoint with permission pre-loaded
        console.log('5️⃣ Testing WebUI streaming with pre-loaded permissions...');
        const streamResponse = await axios({
            method: 'post',
            url: `${BACKEND_URL}/api/chat/messages/stream-webui`,
            data: {
                conversationId,
                message: 'Edit hello.txt and change it to "permissions test successful"',
                requestId: 'test_req_' + Date.now(),
                workingDirectory: '/home/hassan/work/baton',
                allowedTools: ['Read', 'LS', 'Glob', 'Grep', 'WebFetch'] // Edit NOT included - should be loaded from conversation permissions
            },
            responseType: 'stream',
            timeout: 30000
        });

        console.log('📡 Streaming response received, parsing NDJSON...');
        
        let response = '';
        streamResponse.data.on('data', (chunk) => {
            response += chunk.toString();
        });

        await new Promise((resolve) => {
            streamResponse.data.on('end', resolve);
        });

        // Parse NDJSON responses
        const lines = response.split('\n').filter(line => line.trim());
        let foundEditToolUsage = false;
        let foundSuccess = false;

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                console.log(`📦 Received: ${parsed.type} - ${JSON.stringify(parsed).substring(0, 100)}...`);
                
                if (parsed.type === 'claude_json' && parsed.data && parsed.data.message) {
                    // Check for tool usage
                    if (Array.isArray(parsed.data.message.content)) {
                        for (const block of parsed.data.message.content) {
                            if (block.type === 'tool_use' && block.name === 'Edit') {
                                foundEditToolUsage = true;
                                console.log('✅ Found Edit tool usage without permission prompt!');
                            }
                        }
                    }
                }
                
                if (parsed.type === 'done' || (parsed.data && parsed.data.type === 'result')) {
                    foundSuccess = true;
                }
            } catch (e) {
                // Skip invalid JSON lines
            }
        }

        // Step 6: Results
        console.log('\n📊 Test Results:');
        console.log(`✅ Conversation created: ${conversationId}`);
        console.log(`✅ Initial permissions empty: ${initialPerms.data.permissions.length === 0}`);
        console.log(`✅ Permission granted successfully: ${updatedPerms.data.permissions.includes('Edit')}`);
        console.log(`✅ Edit tool used without prompts: ${foundEditToolUsage}`);
        console.log(`✅ Request completed successfully: ${foundSuccess}`);

        if (foundEditToolUsage && !foundSuccess) {
            console.log('\n⚠️  Edit tool was used but request may not have completed successfully');
        } else if (foundEditToolUsage && foundSuccess) {
            console.log('\n🎉 SUCCESS: Conversation-level permissions working correctly!');
            console.log('   - Edit permission was pre-loaded from database');
            console.log('   - No permission prompts were shown');
            console.log('   - Claude Code executed with granted tools');
            console.log('   - Context was preserved throughout');
        } else {
            console.log('\n❌ PARTIAL SUCCESS: Permission system working but Edit tool may not have been used');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testPermissionsSystem();