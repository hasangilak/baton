import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simpleTest() {
  try {
    console.log('🧪 Testing basic MongoDB operations...');

    // Test basic user creation (without complex relationships)
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
      },
    });
    console.log('✅ Created user with ObjectId:', user.id);

    // Test finding the user
    const foundUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    console.log('✅ Found user:', foundUser?.name);

    // Test creating a project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        ownerId: user.id,
      },
    });
    console.log('✅ Created project with ObjectId:', project.id);

    console.log('🎉 Basic MongoDB operations work perfectly!');
    console.log('📊 Successfully created and retrieved data with ObjectIds');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

simpleTest();