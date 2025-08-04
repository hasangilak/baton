import { PrismaClient } from '@prisma/client';
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';

export class BatonToolProvider {
  constructor(private prisma: PrismaClient) {}

  async listTools(): Promise<Tool[]> {
    return [
      // Project Management Tools
      {
        name: "create_project",
        description: "Create a new project in Baton",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Project name"
            },
            description: {
              type: "string",
              description: "Project description (optional)"
            },
            color: {
              type: "string",
              description: "Project color in hex format (default: #3b82f6)",
              pattern: "^#[0-9a-fA-F]{6}$"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "update_project",
        description: "Update an existing project",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID to update"
            },
            name: {
              type: "string",
              description: "New project name (optional)"
            },
            description: {
              type: "string",
              description: "New project description (optional)"
            },
            color: {
              type: "string",
              description: "New project color in hex format (optional)",
              pattern: "^#[0-9a-fA-F]{6}$"
            }
          },
          required: ["projectId"]
        }
      },

      // Task Management Tools
      {
        name: "create_task",
        description: "Create a new task in a project",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID where the task will be created"
            },
            title: {
              type: "string",
              description: "Task title"
            },
            description: {
              type: "string",
              description: "Task description (optional)"
            },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "done"],
              description: "Task status (default: todo)"
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Task priority (default: medium)"
            },
            assigneeId: {
              type: "string",
              description: "User ID to assign the task to (optional)"
            },
            dueDate: {
              type: "string",
              format: "date-time",
              description: "Due date for the task (optional)"
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Task labels (optional)"
            }
          },
          required: ["projectId", "title"]
        }
      },
      {
        name: "update_task",
        description: "Update an existing task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "Task ID to update"
            },
            title: {
              type: "string",
              description: "New task title (optional)"
            },
            description: {
              type: "string",
              description: "New task description (optional)"
            },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "done"],
              description: "New task status (optional)"
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "New task priority (optional)"
            },
            assigneeId: {
              type: "string",
              description: "New assignee ID (optional)"
            },
            dueDate: {
              type: "string",
              format: "date-time",
              description: "New due date (optional)"
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "New task labels (optional)"
            }
          },
          required: ["taskId"]
        }
      },
      {
        name: "move_task",
        description: "Move a task to a different status/column",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "Task ID to move"
            },
            newStatus: {
              type: "string",
              enum: ["todo", "in_progress", "done"],
              description: "New status for the task"
            },
            newOrder: {
              type: "number",
              description: "New order position in the column (optional)"
            }
          },
          required: ["taskId", "newStatus"]
        }
      },

      // MCP Plan Management Tools
      {
        name: "create_mcp_plan",
        description: "Create a new MCP plan with tasks from an AI agent",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Plan title"
            },
            description: {
              type: "string",
              description: "Plan description (optional)"
            },
            agentName: {
              type: "string",
              description: "Name of the AI agent creating the plan"
            },
            projectId: {
              type: "string",
              description: "Project ID where the plan belongs"
            },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: {
                    type: "string",
                    enum: ["low", "medium", "high"]
                  },
                  order: { type: "number" }
                },
                required: ["title"]
              },
              description: "Array of tasks in the plan"
            }
          },
          required: ["title", "agentName", "projectId", "tasks"]
        }
      },
      {
        name: "convert_mcp_plan",
        description: "Convert MCP plan tasks to regular project tasks",
        inputSchema: {
          type: "object",
          properties: {
            planId: {
              type: "string",
              description: "MCP Plan ID to convert"
            }
          },
          required: ["planId"]
        }
      },

      // Analytics and Reporting Tools
      {
        name: "get_project_analytics",
        description: "Get analytics and insights for a project",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID to analyze"
            },
            timeframe: {
              type: "string",
              enum: ["week", "month", "quarter", "year"],
              description: "Timeframe for analytics (default: month)"
            }
          },
          required: ["projectId"]
        }
      },
      {
        name: "get_team_productivity",
        description: "Get team productivity metrics",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID to analyze (optional, if not provided analyzes all projects)"
            },
            timeframe: {
              type: "string",
              enum: ["week", "month", "quarter"],
              description: "Timeframe for analysis (default: month)"
            }
          }
        }
      }
    ];
  }

  async callTool(name: string, args: any): Promise<any> {
    switch (name) {
      case "create_project":
        return this.createProject(args);
      case "update_project":
        return this.updateProject(args);
      case "create_task":
        return this.createTask(args);
      case "update_task":
        return this.updateTask(args);
      case "move_task":
        return this.moveTask(args);
      case "create_mcp_plan":
        return this.createMCPPlan(args);
      case "convert_mcp_plan":
        return this.convertMCPPlan(args);
      case "get_project_analytics":
        return this.getProjectAnalytics(args);
      case "get_team_productivity":
        return this.getTeamProductivity(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async createProject(args: any): Promise<any> {
    const { name, description, color = '#3b82f6' } = args;
    
    // Ensure default user exists
    const defaultUser = await this.prisma.user.upsert({
      where: { id: 'user_default' },
      update: {},
      create: {
        id: 'user_default',
        email: 'user@example.com',
        name: 'Default User'
      }
    });

    const project = await this.prisma.project.create({
      data: {
        name,
        description,
        color,
        ownerId: defaultUser.id
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    return {
      success: true,
      project,
      message: `Project "${name}" created successfully`
    };
  }

  private async updateProject(args: any): Promise<any> {
    const { projectId, ...updateData } = args;

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    return {
      success: true,
      project,
      message: `Project updated successfully`
    };
  }

  private async createTask(args: any): Promise<any> {
    const { projectId, title, description, status = 'todo', priority = 'medium', assigneeId, dueDate, labels = [] } = args;

    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    // Get next order for the status column
    const lastTask = await this.prisma.task.findFirst({
      where: { projectId, status },
      orderBy: { order: 'desc' }
    });

    const nextOrder = lastTask ? lastTask.order + 1 : 0;

    const task = await this.prisma.task.create({
      data: {
        title,
        description,
        status,
        priority,
        projectId,
        createdById: 'user_default',
        assigneeId,
        dueDate: dueDate ? new Date(dueDate) : null,
        labels: JSON.stringify(labels),
        order: nextOrder
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
      }
    });

    return {
      success: true,
      task: {
        ...task,
        labels: task.labels ? JSON.parse(task.labels) : []
      },
      message: `Task "${title}" created successfully`
    };
  }

  private async updateTask(args: any): Promise<any> {
    const { taskId, dueDate, labels, ...updateData } = args;

    const data: any = updateData;
    if (dueDate) data.dueDate = new Date(dueDate);
    if (labels) data.labels = JSON.stringify(labels);
    if (updateData.status === 'done') {
      data.completedAt = new Date();
    } else if (updateData.status && updateData.status !== 'done') {
      data.completedAt = null;
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data,
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
      }
    });

    return {
      success: true,
      task: {
        ...task,
        labels: task.labels ? JSON.parse(task.labels) : []
      },
      message: `Task updated successfully`
    };
  }

  private async moveTask(args: any): Promise<any> {
    const { taskId, newStatus, newOrder } = args;

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // If newOrder is not provided, put at the end of the column
    let order = newOrder;
    if (order === undefined) {
      const lastTask = await this.prisma.task.findFirst({
        where: { projectId: task.projectId, status: newStatus },
        orderBy: { order: 'desc' }
      });
      order = lastTask ? lastTask.order + 1 : 0;
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: newStatus,
        order,
        completedAt: newStatus === 'done' ? new Date() : null
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
      }
    });

    return {
      success: true,
      task: {
        ...updatedTask,
        labels: updatedTask.labels ? JSON.parse(updatedTask.labels) : []
      },
      message: `Task moved to ${newStatus}`
    };
  }

  private async createMCPPlan(args: any): Promise<any> {
    const { title, description, agentName, projectId, tasks } = args;

    // Find or create the agent
    let agent = await this.prisma.mCPAgent.findUnique({
      where: { name: agentName }
    });

    if (!agent) {
      agent = await this.prisma.mCPAgent.create({
        data: {
          name: agentName,
          description: `Auto-registered agent: ${agentName}`,
          endpoint: 'mcp://unknown',
        }
      });
    }

    // Update agent last seen
    await this.prisma.mCPAgent.update({
      where: { id: agent.id },
      data: { lastSeen: new Date(), isActive: true }
    });

    // Create plan and tasks in a transaction
    const plan = await this.prisma.$transaction(async (tx) => {
      const newPlan = await tx.mCPPlan.create({
        data: {
          title,
          description,
          agentId: agent.id,
          agentName,
          projectId,
          status: 'pending'
        }
      });

      // Create associated tasks
      if (tasks.length > 0) {
        await tx.mCPTask.createMany({
          data: tasks.map((task: any, index: number) => ({
            title: task.title,
            description: task.description,
            priority: task.priority || 'medium',
            order: task.order !== undefined ? task.order : index,
            planId: newPlan.id
          }))
        });
      }

      return tx.mCPPlan.findUnique({
        where: { id: newPlan.id },
        include: {
          agent: true,
          project: {
            select: { id: true, name: true, color: true }
          },
          tasks: {
            orderBy: { order: 'asc' }
          }
        }
      });
    });

    return {
      success: true,
      plan,
      message: `MCP Plan "${title}" created with ${tasks.length} tasks`
    };
  }

  private async convertMCPPlan(args: any): Promise<any> {
    const { planId } = args;

    const plan = await this.prisma.mCPPlan.findUnique({
      where: { id: planId },
      include: {
        tasks: true,
        project: true
      }
    });

    if (!plan) {
      throw new Error(`MCP Plan with ID ${planId} not found`);
    }

    // Convert MCP tasks to regular tasks
    const convertedTasks = await this.prisma.$transaction(async (tx) => {
      const tasks = [];
      
      for (const mcpTask of plan.tasks) {
        // Get next order for the status column
        const lastTask = await tx.task.findFirst({
          where: { projectId: plan.projectId, status: mcpTask.status },
          orderBy: { order: 'desc' }
        });

        const nextOrder = lastTask ? lastTask.order + 1 : 0;

        const task = await tx.task.create({
          data: {
            title: `[${plan.agentName}] ${mcpTask.title}`,
            description: mcpTask.description,
            status: mcpTask.status,
            priority: mcpTask.priority,
            projectId: plan.projectId,
            createdById: 'user_default',
            order: nextOrder,
            labels: JSON.stringify([`mcp-plan:${plan.id}`, `agent:${plan.agentName}`])
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
          }
        });

        tasks.push({
          ...task,
          labels: task.labels ? JSON.parse(task.labels) : []
        });
      }

      // Update plan status to completed
      await tx.mCPPlan.update({
        where: { id: planId },
        data: { status: 'completed' }
      });

      return tasks;
    });

    return {
      success: true,
      convertedTasks,
      message: `Converted ${convertedTasks.length} tasks from MCP plan to project tasks`
    };
  }

  private async getProjectAnalytics(args: any): Promise<any> {
    const { projectId, timeframe = 'month' } = args;

    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const tasks = project.tasks;
    const tasksInTimeframe = tasks.filter(task => 
      task.createdAt >= startDate && task.createdAt <= endDate
    );

    const completedTasks = tasks.filter(task => task.status === 'done');
    const completedInTimeframe = completedTasks.filter(task => 
      task.completedAt && task.completedAt >= startDate && task.completedAt <= endDate
    );

    // Calculate metrics
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;
    const velocityInTimeframe = completedInTimeframe.length;

    // Task distribution by status
    const statusDistribution = {
      todo: tasks.filter(t => t.status === 'todo').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      done: tasks.filter(t => t.status === 'done').length
    };

    // Priority distribution
    const priorityDistribution = {
      low: tasks.filter(t => t.priority === 'low').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      high: tasks.filter(t => t.priority === 'high').length
    };

    // Team member contributions
    const teamContributions = tasks.reduce((acc, task) => {
      if (task.assignee) {
        if (!acc[task.assignee.id]) {
          acc[task.assignee.id] = {
            name: task.assignee.name,
            assigned: 0,
            completed: 0
          };
        }
        acc[task.assignee.id].assigned++;
        if (task.status === 'done') {
          acc[task.assignee.id].completed++;
        }
      }
      return acc;
    }, {} as any);

    return {
      success: true,
      analytics: {
        project: {
          id: project.id,
          name: project.name
        },
        timeframe: {
          period: timeframe,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        summary: {
          totalTasks,
          completedTasks: completedTasks.length,
          completionRate: Math.round(completionRate * 100) / 100,
          velocityInTimeframe,
          tasksCreatedInTimeframe: tasksInTimeframe.length
        },
        distributions: {
          status: statusDistribution,
          priority: priorityDistribution
        },
        teamContributions: Object.values(teamContributions)
      }
    };
  }

  private async getTeamProductivity(args: any): Promise<any> {
    const { projectId, timeframe = 'month' } = args;

    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
    }

    const whereClause = projectId ? { projectId } : {};

    const tasks = await this.prisma.task.findMany({
      where: {
        ...whereClause,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true }
        },
        project: {
          select: { id: true, name: true }
        }
      }
    });

    const completedTasks = tasks.filter(task => task.status === 'done');

    // Calculate team metrics
    const teamMetrics = tasks.reduce((acc, task) => {
      if (task.assignee) {
        if (!acc[task.assignee.id]) {
          acc[task.assignee.id] = {
            id: task.assignee.id,
            name: task.assignee.name,
            email: task.assignee.email,
            tasksAssigned: 0,
            tasksCompleted: 0,
            highPriorityTasks: 0,
            projects: new Set()
          };
        }
        
        acc[task.assignee.id].tasksAssigned++;
        if (task.status === 'done') {
          acc[task.assignee.id].tasksCompleted++;
        }
        if (task.priority === 'high') {
          acc[task.assignee.id].highPriorityTasks++;
        }
        if (task.project) {
          acc[task.assignee.id].projects.add(task.project.name);
        }
      }
      return acc;
    }, {} as any);

    // Convert Sets to arrays and calculate completion rates
    const teamStats = Object.values(teamMetrics).map((member: any) => ({
      ...member,
      projects: Array.from(member.projects),
      completionRate: member.tasksAssigned > 0 
        ? Math.round((member.tasksCompleted / member.tasksAssigned) * 100) 
        : 0
    }));

    return {
      success: true,
      productivity: {
        timeframe: {
          period: timeframe,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        overview: {
          totalTasks: tasks.length,
          completedTasks: completedTasks.length,
          teamSize: teamStats.length,
          averageCompletionRate: teamStats.length > 0 
            ? Math.round(teamStats.reduce((sum, member) => sum + member.completionRate, 0) / teamStats.length)
            : 0
        },
        teamMembers: teamStats.sort((a, b) => b.completionRate - a.completionRate)
      }
    };
  }
}