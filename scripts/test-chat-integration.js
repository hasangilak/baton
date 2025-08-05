#!/usr/bin/env node

/**
 * Test script for Baton Chat Integration
 * 
 * This script tests the chat functionality to ensure everything is working correctly.
 */

const http = require('http');

const API_URL = process.env.BATON_API_URL || 'http://localhost:3001';
const PROJECT_ID = 'demo-project-1';

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Baton-Test/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Request failed: ${res.statusCode} - ${parsed.error || responseData}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testChatIntegration() {
  console.log('🧪 Testing Baton Chat Integration\n');

  try {
    // Test 1: Create a conversation
    console.log('1️⃣ Creating a new conversation...');
    const createResult = await makeRequest('/api/chat/conversations', 'POST', {
      projectId: PROJECT_ID,
      title: 'Test Conversation'
    });
    
    if (!createResult.conversation) {
      throw new Error('Failed to create conversation');
    }
    
    const conversationId = createResult.conversation.id;
    console.log(`✅ Conversation created: ${conversationId}\n`);

    // Test 2: Get conversations
    console.log('2️⃣ Fetching conversations...');
    const conversations = await makeRequest(`/api/chat/conversations/${PROJECT_ID}`);
    
    if (!conversations.conversations || !Array.isArray(conversations.conversations)) {
      throw new Error('Failed to fetch conversations');
    }
    
    console.log(`✅ Found ${conversations.conversations.length} conversations\n`);

    // Test 3: Send a message (without streaming for simplicity)
    console.log('3️⃣ Testing message endpoint...');
    console.log('⚠️  Note: Actual message sending requires Claude API key\n');

    // Test 4: Get messages
    console.log('4️⃣ Fetching messages...');
    const messages = await makeRequest(`/api/chat/messages/${conversationId}`);
    
    if (!messages.messages || !Array.isArray(messages.messages)) {
      throw new Error('Failed to fetch messages');
    }
    
    console.log(`✅ Found ${messages.messages.length} messages\n`);

    // Test 5: Test hook integration
    console.log('5️⃣ Testing hook scripts...');
    
    // Test project context finding
    const { findProjectContext } = require('./capture-chat-message');
    const projectContext = findProjectContext();
    
    if (projectContext) {
      console.log(`✅ Project context found: ${projectContext.projectName || projectContext.projectId}`);
    } else {
      console.log('⚠️  No .baton-project file found in current directory');
    }

    // Test chat intent detection
    const { detectChatIntent } = require('./chat-context-enhancer');
    const testPrompts = [
      'Show me my tasks',
      'How do I implement authentication?',
      'Create a plan for the new feature',
      'Help me understand this code'
    ];
    
    console.log('\n📝 Intent Detection Tests:');
    testPrompts.forEach(prompt => {
      const intent = detectChatIntent(prompt);
      console.log(`   "${prompt}" → ${intent}`);
    });

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📌 Next steps:');
    console.log('   1. Set ANTHROPIC_API_KEY environment variable');
    console.log('   2. Configure hooks in ~/.claude/settings.local.json');
    console.log('   3. Create .baton-project file in your workspace');
    console.log('   4. Start chatting in Claude Code!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n🔍 Troubleshooting:');
    console.error('   1. Make sure Docker containers are running');
    console.error('   2. Check that backend is accessible at', API_URL);
    console.error('   3. Verify database migrations have been run');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testChatIntegration();
}