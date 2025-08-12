import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testMongoDB() {
  try {
    console.log('🧪 Testing MongoDB integration...');

    // Create a test user
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        avatar: null,
      },
    });
    console.log('✅ Created user:', user.id);

    // Create a test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        description: 'Test project for MongoDB integration',
        ownerId: user.id,
      },
    });
    console.log('✅ Created project:', project.id);

    // Create a test conversation
    const conversation = await prisma.conversation.create({
      data: {
        title: 'Test Conversation',
        projectId: project.id,
        userId: user.id,
      },
    });
    console.log('✅ Created conversation:', conversation.id);

    // Create a test message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello MongoDB!',
      },
    });
    console.log('✅ Created message:', message.id);

    // Test permission creation
    const permission = await prisma.conversationPermission.create({
      data: {
        conversationId: conversation.id,
        toolName: 'Write',
        status: 'granted',
        grantedBy: 'user',
      },
    });
    console.log('✅ Created permission:', permission.id);

    console.log('🎉 All MongoDB operations completed successfully!');
    console.log('📊 Test data created with IDs:', {
      userId: user.id,
      projectId: project.id,
      conversationId: conversation.id,
      messageId: message.id,
      permissionId: permission.id,
    });

  } catch (error) {
    console.error('❌ MongoDB test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testMongoDB();