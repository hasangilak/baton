import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDefaultUser() {
  try {
    console.log('🌱 Seeding default user...');
    
    // Create default user with a proper ObjectId
    const user = await prisma.user.create({
      data: {
        email: 'user@example.com',
        name: 'Default User',
        avatar: null
      }
    });
    
    console.log('✅ Default user created with ID:', user.id);
    console.log('📋 User details:', {
      id: user.id,
      email: user.email,
      name: user.name
    });
    
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log('ℹ️  Default user already exists');
    } else {
      console.error('❌ Failed to seed default user:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

seedDefaultUser();