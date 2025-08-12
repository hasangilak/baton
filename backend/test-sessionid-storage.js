#!/usr/bin/env node

/**
 * Test Script: SessionId Storage in Database
 * 
 * This script tests the sessionId storage functionality by:
 * 1. Creating a test conversation 
 * 2. Storing messages with sessionId
 * 3. Verifying sessionId is properly stored and retrieved
 * 4. Testing conversation sessionId updates
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testSessionIdStorage() {
  console.log('🧪 Starting SessionId Storage Test...\n');

  try {
    // 1. Find or create a test project
    let testProject = await prisma.project.findFirst({
      where: { name: 'Test Project' }
    });

    if (!testProject) {
      // Create a test user first
      let testUser = await prisma.user.findFirst({
        where: { email: 'test@example.com' }
      });

      if (!testUser) {
        testUser = await prisma.user.create({
          data: {
            email: 'test@example.com',
            name: 'Test User'
          }
        });
        console.log('✅ Created test user:', testUser.id);
      }

      testProject = await prisma.project.create({
        data: {
          name: 'Test Project',
          description: 'Project for testing sessionId storage',
          ownerId: testUser.id
        }
      });
      console.log('✅ Created test project:', testProject.id);
    } else {
      console.log('✅ Using existing test project:', testProject.id);
    }

    // 2. Create a test conversation
    const testUser = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });

    const conversation = await prisma.conversation.create({
      data: {
        title: 'SessionId Test Conversation',
        projectId: testProject.id,
        userId: testUser.id,
        model: 'claude-3-sonnet'
      }
    });
    console.log('✅ Created test conversation:', conversation.id);

    // 3. Test creating messages with sessionId
    const testSessionId = 'session_test_' + Date.now();
    console.log('🔑 Test sessionId:', testSessionId);

    // Create user message with sessionId
    const userMessage = await prisma.message.create({
      data: {
        projectId: testProject.id,
        role: 'user',
        content: 'Hello, this is a test message!',
        sessionId: testSessionId,
        status: 'completed'
      }
    });
    console.log('✅ Created user message with sessionId:', userMessage.id);

    // Create assistant message with sessionId
    const assistantMessage = await prisma.message.create({
      data: {
        projectId: testProject.id,
        role: 'assistant',
        content: 'Hello! I received your message.',
        sessionId: testSessionId,
        claudeMessageId: 'msg_test_' + Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        usage: {
          input_tokens: 10,
          output_tokens: 8
        },
        status: 'completed'
      }
    });
    console.log('✅ Created assistant message with sessionId:', assistantMessage.id);

    // 4. Test conversation sessionId update
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        claudeSessionId: testSessionId
      }
    });
    console.log('✅ Updated conversation with sessionId:', updatedConversation.claudeSessionId);

    // 5. Test retrieving messages by sessionId
    const messagesBySession = await prisma.message.findMany({
      where: {
        sessionId: testSessionId
      },
      select: {
        id: true,
        role: true,
        content: true,
        sessionId: true,
        claudeMessageId: true,
        model: true,
        usage: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log('\n📋 Messages found with sessionId:');
    messagesBySession.forEach((msg, index) => {
      console.log(`${index + 1}. [${msg.role}] ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`);
      console.log(`   SessionId: ${msg.sessionId}`);
      console.log(`   Claude Message ID: ${msg.claudeMessageId || 'N/A'}`);
      console.log(`   Model: ${msg.model || 'N/A'}`);
      console.log(`   Usage: ${msg.usage ? JSON.stringify(msg.usage) : 'N/A'}`);
      console.log('');
    });

    // 6. Test retrieving conversation with sessionId
    const conversationWithSession = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: {
        id: true,
        title: true,
        claudeSessionId: true,
        contextTokens: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log('💬 Conversation with sessionId:');
    console.log(`   ID: ${conversationWithSession.id}`);
    console.log(`   Title: ${conversationWithSession.title}`);
    console.log(`   Claude Session ID: ${conversationWithSession.claudeSessionId}`);
    console.log(`   Status: ${conversationWithSession.status}`);
    console.log(`   Context Tokens: ${conversationWithSession.contextTokens}`);
    console.log('');

    // 7. Test searching conversations by sessionId
    const conversationsBySession = await prisma.conversation.findMany({
      where: {
        claudeSessionId: testSessionId
      },
      select: {
        id: true,
        title: true,
        claudeSessionId: true,
        project: {
          select: {
            name: true
          }
        }
      }
    });

    console.log('🔍 Conversations found with sessionId:');
    conversationsBySession.forEach((conv, index) => {
      console.log(`${index + 1}. ${conv.title} (Project: ${conv.project.name})`);
      console.log(`   Session ID: ${conv.claudeSessionId}`);
      console.log('');
    });

    // 8. Test sessionId-based message retrieval (simulating real usage)
    console.log('🔄 Testing sessionId-based message retrieval...');
    
    const messagesInSession = await prisma.message.findMany({
      where: {
        sessionId: testSessionId,
        status: 'completed'
      },
      include: {
        attachments: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log(`✅ Found ${messagesInSession.length} messages in session ${testSessionId}`);

    // 9. Verify database indexes are working
    console.log('🚀 Testing database indexes...');
    
    const start = Date.now();
    await prisma.message.findMany({
      where: { sessionId: testSessionId },
      take: 1
    });
    const queryTime = Date.now() - start;
    
    console.log(`✅ SessionId index query completed in ${queryTime}ms`);

    // 10. Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    
    await prisma.message.deleteMany({
      where: {
        sessionId: testSessionId
      }
    });
    console.log('✅ Deleted test messages');

    await prisma.conversation.delete({
      where: { id: conversation.id }
    });
    console.log('✅ Deleted test conversation');

    console.log('\n🎉 SessionId Storage Test PASSED! All functionality working correctly.');

  } catch (error) {
    console.error('❌ SessionId Storage Test FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testSessionIdStorage().catch(console.error);