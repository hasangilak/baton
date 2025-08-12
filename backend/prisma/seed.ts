import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create default user
  const defaultUser = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      id: 'user_default',
      email: 'user@example.com',
      name: 'Default User',
      avatar: null,
    },
  });

  // Create baton project for development
  const batonProject = await prisma.project.upsert({
    where: { id: '689b0107dec8469824f3f4f7' },
    update: {},
    create: {
      id: '689b0107dec8469824f3f4f7',
      name: 'baton',
      description: 'Auto-created from Claude Code workspace',
      color: '#3b82f6',
      ownerId: defaultUser.id,
    },
  });
  
  // Old demo project creation removed to keep development environment clean
  /*
  const demoProject = await prisma.project.upsert({
    where: { id: 'demo-project-1' },
    update: {},
    create: {
      id: 'demo-project-1',
      name: 'Demo Project',
      description: 'A demonstration project for Baton task manager',
      color: '#3b82f6',
      ownerId: defaultUser.id,
    },
  });
  */

  // Sample tasks creation removed since it depends on demo project
  /*
  const tasks = [
    {
      id: 'task-1',
      title: 'Design Homepage Wireframe',
      description: 'Create wireframes for the main homepage layout',
      status: 'todo',
      priority: 'high',
      order: 0,
      labels: JSON.stringify(['design', 'wireframe']),
    },
    {
      id: 'task-2', 
      title: 'Implement User Authentication',
      description: 'Set up JWT-based authentication system',
      status: 'in_progress',
      priority: 'high',
      order: 0,
      labels: JSON.stringify(['backend', 'auth']),
    },
    {
      id: 'task-3',
      title: 'Write API Documentation',
      description: 'Document all REST API endpoints',
      status: 'done',
      priority: 'medium',
      order: 0,
      labels: JSON.stringify(['docs', 'api']),
      completedAt: new Date(),
    },
    {
      id: 'task-4',
      title: 'Setup CI/CD Pipeline',
      description: 'Configure GitHub Actions for deployment',
      status: 'todo',
      priority: 'medium',
      order: 1,
      labels: JSON.stringify(['devops', 'ci/cd']),
    },
  ];

  for (const taskData of tasks) {
    await prisma.task.upsert({
      where: { id: taskData.id },
      update: {},
      create: {
        ...taskData,
        projectId: demoProject.id,
        createdById: defaultUser.id,
        assigneeId: defaultUser.id,
      },
    });
  }
  */

  // Create sample MCP agent
  const sampleAgent = await prisma.mCPAgent.upsert({
    where: { name: 'Claude Code Assistant' },
    update: {},
    create: {
      name: 'Claude Code Assistant',
      description: 'AI coding assistant that helps with development tasks',
      endpoint: 'http://localhost:3002/mcp',
      isActive: true,
      lastSeen: new Date(),
    },
  });

  // Create sample MCP plan
  await prisma.mCPPlan.upsert({
    where: { id: 'mcp-plan-1' },
    update: {},
    create: {
      id: 'mcp-plan-1',
      title: 'Implement Dark Mode Support',
      description: 'Add dark mode toggle and theme switching functionality',
      agentId: sampleAgent.id,
      agentName: sampleAgent.name,
      projectId: batonProject.id, // Use baton project
      status: 'pending',
      tasks: {
        create: [
          {
            title: 'Add theme context provider',
            description: 'Create React context for theme management',
            priority: 'high',
            order: 0,
          },
          {
            title: 'Update CSS variables',
            description: 'Define dark mode color variables',
            priority: 'medium',
            order: 1,
          },
          {
            title: 'Add theme toggle component',
            description: 'Create UI component for switching themes',
            priority: 'low',
            order: 2,
          },
        ],
      },
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log(`👤 Created user: ${defaultUser.name} (${defaultUser.email})`);
  console.log(`📁 Created project: ${batonProject.name}`);
  console.log(`🤖 Created MCP agent: ${sampleAgent.name}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });