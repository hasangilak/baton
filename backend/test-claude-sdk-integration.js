/**
 * Test Claude SDK Integration with new StreamResponse format
 * 
 * This script tests the complete flow:
 * 1. Create a conversation
 * 2. Store Claude SDK messages in the new format
 * 3. Verify database storage
 * 4. Test different SDKMessage types
 */

const { PrismaClient } = require('@prisma/client');
// Since we're running from compiled JS, we'll create the service directly
const { MessageStorageService } = require('./dist/services/message-storage.service');

const prisma = new PrismaClient();
const messageStorage = getMessageStorageService(prisma);

async function testClaudeSDKIntegration() {
  console.log('🧪 Testing Claude SDK Integration with new StreamResponse format\n');

  try {
    // 1. Create test project and conversation
    console.log('📁 Creating test project and conversation...');
    
    const testProject = await prisma.project.upsert({
      where: { id: 'test-claude-sdk-project' },
      update: {},
      create: {
        id: 'test-claude-sdk-project',
        name: 'Claude SDK Test Project',
        description: 'Testing Claude Code SDK integration',
        ownerId: 'test-user-claude-sdk',
      },
    });

    const testUser = await prisma.user.upsert({
      where: { id: 'test-user-claude-sdk' },
      update: {},
      create: {
        id: 'test-user-claude-sdk',
        email: 'test@claude-sdk.com',
        name: 'Claude SDK Tester',
      },
    });

    const testConversation = await prisma.conversation.create({
      data: {
        projectId: testProject.id,
        userId: testUser.id,
        title: 'Claude SDK Format Test',
        model: 'claude-code-headless',
      },
    });

    console.log(`✅ Created conversation: ${testConversation.id}\n`);

    // 2. Test SDKSystemMessage
    console.log('🏁 Testing SDKSystemMessage...');
    const systemStreamResponse = {
      type: 'claude_json',
      data: {
        type: 'system',
        subtype: 'init',
        apiKeySource: 'user',
        cwd: '/test/workspace',
        session_id: 'session_12345_test',
        tools: ['Read', 'Write', 'Edit', 'Bash'],
        mcp_servers: [
          { name: 'baton-mcp', status: 'connected' }
        ],
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'default',
        slash_commands: ['/help', '/clear']
      },
      requestId: 'req_system_001',
      timestamp: Date.now()
    };

    const systemMessage = await messageStorage.createClaudeSDKMessage(
      testConversation.id,
      systemStreamResponse
    );

    console.log(`✅ System message stored: ${systemMessage.id}`);
    console.log(`   Content: ${systemMessage.content.substring(0, 100)}...`);
    console.log(`   Session ID: ${systemMessage.sessionId}`);
    console.log(`   Model: ${systemMessage.model}\n`);

    // 3. Test SDKAssistantMessage
    console.log('🤖 Testing SDKAssistantMessage...');
    const assistantStreamResponse = {
      type: 'claude_json',
      data: {
        type: 'assistant',
        message: {
          id: 'msg_claude_12345',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          content: [
            {
              type: 'text',
              text: 'I can help you with that task. Let me analyze your codebase first.\n\n```typescript\nconst result = await analyzeCode();\n```\n\nThis should work perfectly!'
            }
          ],
          usage: {
            input_tokens: 150,
            output_tokens: 75,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          },
          stop_reason: 'end_turn'
        },
        parent_tool_use_id: null,
        session_id: 'session_12345_test'
      },
      requestId: 'req_assistant_001',
      timestamp: Date.now()
    };

    const assistantMessage = await messageStorage.createClaudeSDKMessage(
      testConversation.id,
      assistantStreamResponse
    );

    console.log(`✅ Assistant message stored: ${assistantMessage.id}`);
    console.log(`   Content length: ${assistantMessage.content.length}`);
    console.log(`   Claude Message ID: ${assistantMessage.claudeMessageId}`);
    console.log(`   Usage: ${JSON.stringify(assistantMessage.usage)}`);
    console.log(`   Claude Data stored: ${assistantMessage.claudeData ? 'Yes' : 'No'}\n`);

    // 4. Test SDKResultMessage (success)
    console.log('✅ Testing SDKResultMessage (success)...');
    const resultStreamResponse = {
      type: 'claude_json',
      data: {
        type: 'result',
        subtype: 'success',
        duration_ms: 2450,
        duration_api_ms: 1800,
        is_error: false,
        num_turns: 3,
        result: 'Task completed successfully. All files have been updated and tests pass.',
        session_id: 'session_12345_test',
        total_cost_usd: 0.0234,
        usage: {
          input_tokens: 520,
          output_tokens: 180,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 100
        }
      },
      requestId: 'req_result_001',
      timestamp: Date.now()
    };

    const resultMessage = await messageStorage.createClaudeSDKMessage(
      testConversation.id,
      resultStreamResponse
    );

    console.log(`✅ Result message stored: ${resultMessage.id}`);
    console.log(`   Content: ${resultMessage.content}`);
    console.log(`   Type: ${resultMessage.type}`);
    console.log(`   Usage: ${JSON.stringify(resultMessage.usage)}\n`);

    // 5. Verify conversation has session ID
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: testConversation.id },
      select: { claudeSessionId: true }
    });

    console.log(`🔗 Conversation session ID: ${updatedConversation?.claudeSessionId}`);

    // 6. Get all messages to verify storage
    console.log('\n📋 Verifying stored messages...');
    const allMessages = await prisma.message.findMany({
      where: { conversationId: testConversation.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        type: true,
        claudeMessageId: true,
        model: true,
        sessionId: true,
        usage: true,
        content: true
      }
    });

    allMessages.forEach((msg, index) => {
      console.log(`${index + 1}. ${msg.role} (${msg.type || 'legacy'})`);
      console.log(`   ID: ${msg.id}`);
      console.log(`   Claude ID: ${msg.claudeMessageId || 'N/A'}`);
      console.log(`   Model: ${msg.model || 'N/A'}`);
      console.log(`   Session: ${msg.sessionId || 'N/A'}`);
      console.log(`   Content: ${msg.content.substring(0, 80)}...`);
      console.log('');
    });

    console.log('🎉 All Claude SDK integration tests passed!\n');

    // 7. Test cleanup
    console.log('🧹 Cleaning up test data...');
    await prisma.message.deleteMany({
      where: { conversationId: testConversation.id }
    });
    await prisma.conversation.delete({
      where: { id: testConversation.id }
    });
    await prisma.project.delete({
      where: { id: testProject.id }
    });
    await prisma.user.delete({
      where: { id: testUser.id }
    });
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testClaudeSDKIntegration().catch(console.error);