import { PrismaClient } from '@prisma/client';
import { Resource } from "@modelcontextprotocol/sdk/types.js";

export class BatonResourceProvider {
  constructor(private prisma: PrismaClient) {}

  async listResources(): Promise<Resource[]> {
    const resources: Resource[] = [
      // Project Resources
      {
        uri: "baton://projects",
        name: "All Projects",
        description: "List of all projects in Baton",
        mimeType: "application/json",
      },
      {
        uri: "baton://projects/active",
        name: "Active Projects",
        description: "List of currently active projects",
        mimeType: "application/json",
      },
      
      // Task Resources
      {
        uri: "baton://tasks",
        name: "All Tasks",
        description: "List of all tasks across all projects",
        mimeType: "application/json",
      },
      {
        uri: "baton://tasks/pending",
        name: "Pending Tasks",
        description: "Tasks with status 'todo' or 'in_progress'",
        mimeType: "application/json",
      },
      
      // MCP Plan Resources
      {
        uri: "baton://mcp-plans",
        name: "MCP Plans",
        description: "AI-generated task plans from MCP agents",
        mimeType: "application/json",
      },
      {
        uri: "baton://mcp-agents",
        name: "MCP Agents",
        description: "Registered AI agents and their status",
        mimeType: "application/json",
      },
    ];

    // Add dynamic project-specific resources
    const projects = await this.prisma.project.findMany({
      select: { id: true, name: true, description: true }
    });

    for (const project of projects) {
      resources.push({
        uri: `baton://projects/${project.id}`,
        name: `Project: ${project.name}`,
        description: project.description || `Tasks and details for ${project.name}`,
        mimeType: "application/json",
      });

      resources.push({
        uri: `baton://projects/${project.id}/tasks`,
        name: `Tasks: ${project.name}`,
        description: `All tasks in project ${project.name}`,
        mimeType: "application/json",
      });

      resources.push({
        uri: `baton://projects/${project.id}/tasks/kanban`,
        name: `Kanban Board: ${project.name}`,
        description: `Kanban board view of tasks in ${project.name}`,
        mimeType: "application/json",
      });
    }

    return resources;
  }

  async readResource(uri: string): Promise<any> {
    const url = new URL(uri);
    const path = url.pathname;
    const pathParts = path.split('/').filter(Boolean);

    switch (pathParts[0]) {
      case 'projects':
        return this.handleProjectResource(pathParts);
      case 'tasks':
        return this.handleTaskResource(pathParts);
      case 'mcp-plans':
        return this.handleMCPPlanResource(pathParts);
      case 'mcp-agents':
        return this.handleMCPAgentResource(pathParts);
      default:
        throw new Error(`Unknown resource path: ${path}`);
    }
  }

  private async handleProjectResource(pathParts: string[]): Promise<any> {
    if (pathParts.length === 1) {
      // All projects
      return this.prisma.project.findMany({
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          _count: {
            select: { tasks: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (pathParts[1] === 'active') {
      // Active projects (projects with recent activity)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      return this.prisma.project.findMany({
        where: {
          OR: [
            { updatedAt: { gte: thirtyDaysAgo } },
            { tasks: { some: { updatedAt: { gte: thirtyDaysAgo } } } }
          ]
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          _count: {
            select: { tasks: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });
    }

    const projectId = pathParts[1];
    if (pathParts.length === 2) {
      // Specific project
      return this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          tasks: {
            include: {
              assignee: {
                select: { id: true, name: true, email: true, avatar: true }
              },
              createdBy: {
                select: { id: true, name: true, email: true, avatar: true }
              }
            },
            orderBy: [{ status: 'asc' }, { order: 'asc' }]
          },
          _count: {
            select: { tasks: true }
          }
        }
      });
    }

    if (pathParts[2] === 'tasks') {
      if (pathParts[3] === 'kanban') {
        // Kanban board view
        const tasks = await this.prisma.task.findMany({
          where: { projectId },
          include: {
            assignee: {
              select: { id: true, name: true, email: true, avatar: true }
            },
            createdBy: {
              select: { id: true, name: true, email: true, avatar: true }
            }
          },
          orderBy: [{ status: 'asc' }, { order: 'asc' }]
        });

        // Group tasks by status for kanban view
        const kanban = {
          todo: tasks.filter(t => t.status === 'todo').map(t => ({
            ...t,
            labels: t.labels ? JSON.parse(t.labels) : []
          })),
          in_progress: tasks.filter(t => t.status === 'in_progress').map(t => ({
            ...t,
            labels: t.labels ? JSON.parse(t.labels) : []
          })),
          done: tasks.filter(t => t.status === 'done').map(t => ({
            ...t,
            labels: t.labels ? JSON.parse(t.labels) : []
          }))
        };

        return {
          projectId,
          columns: kanban,
          summary: {
            total: tasks.length,
            todo: kanban.todo.length,
            in_progress: kanban.in_progress.length,
            done: kanban.done.length
          }
        };
      }

      // Project tasks
      const tasks = await this.prisma.task.findMany({
        where: { projectId },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true, avatar: true }
          }
        },
        orderBy: [{ status: 'asc' }, { order: 'asc' }]
      });

      return tasks.map(task => ({
        ...task,
        labels: task.labels ? JSON.parse(task.labels) : []
      }));
    }

    throw new Error(`Unknown project resource path: ${pathParts.join('/')}`);
  }

  private async handleTaskResource(pathParts: string[]): Promise<any> {
    if (pathParts.length === 1) {
      // All tasks
      const tasks = await this.prisma.task.findMany({
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          project: {
            select: { id: true, name: true, color: true }
          }
        },
        orderBy: [{ createdAt: 'desc' }]
      });

      return tasks.map(task => ({
        ...task,
        labels: task.labels ? JSON.parse(task.labels) : []
      }));
    }

    if (pathParts[1] === 'pending') {
      // Pending tasks
      const tasks = await this.prisma.task.findMany({
        where: {
          status: { in: ['todo', 'in_progress'] }
        },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true, avatar: true }
          },
          project: {
            select: { id: true, name: true, color: true }
          }
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
      });

      return tasks.map(task => ({
        ...task,
        labels: task.labels ? JSON.parse(task.labels) : []
      }));
    }

    throw new Error(`Unknown task resource path: ${pathParts.join('/')}`);
  }

  private async handleMCPPlanResource(pathParts: string[]): Promise<any> {
    return this.prisma.mCPPlan.findMany({
      include: {
        agent: true,
        project: {
          select: { id: true, name: true, color: true }
        },
        tasks: {
          orderBy: { order: 'asc' }
        },
        _count: {
          select: { tasks: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async handleMCPAgentResource(pathParts: string[]): Promise<any> {
    return this.prisma.mCPAgent.findMany({
      include: {
        _count: {
          select: { plans: true }
        }
      },
      orderBy: { lastSeen: 'desc' }
    });
  }
}