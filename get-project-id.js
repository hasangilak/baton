#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://baton_user:baton_password@localhost:5432/baton'
});

async function getProjectId() {
  try {
    const projects = await prisma.project.findMany();
    console.log('Available projects:');
    projects.forEach(project => {
      console.log(`  - ${project.name}: ${project.id}`);
    });
    
    if (projects.length > 0) {
      console.log('\nUse this project ID for testing:', projects[0].id);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

getProjectId();