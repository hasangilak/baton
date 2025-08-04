import { PrismaClient } from '@prisma/client';
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export class BatonToolProvider {
  constructor(private prisma: PrismaClient, private workspaceManager?: any, private io?: any) {}

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
      },

      // Claude Code Integration Tools
      {
        name: "TodoRead",
        description: "Read all todos for the current project from Claude Code integration",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Optional: Specific project ID to read todos from (if not provided, will try to detect from workspace)"
            }
          }
        }
      },
      {
        name: "TodoWrite",
        description: "Write/update todos for Claude Code integration",
        inputSchema: {
          type: "object",
          properties: {
            todos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier for the todo"
                  },
                  content: {
                    type: "string",
                    description: "Todo content/description"
                  },
                  status: {
                    type: "string",
                    enum: ["pending", "in_progress", "completed"],
                    description: "Todo status"
                  },
                  priority: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Todo priority"
                  }
                },
                required: ["id", "content", "status", "priority"]
              },
              description: "Array of todos to write/update"
            },
            projectId: {
              type: "string",
              description: "Optional: Specific project ID to write todos to (if not provided, will try to detect from workspace)"
            }
          },
          required: ["todos"]
        }
      },
      {
        name: "sync_todos_to_tasks",
        description: "Sync Claude Code todos to Baton tasks for the current project",
        inputSchema: {
          type: "object",
          properties: {
            todoIds: {
              type: "array", 
              items: { type: "string" },
              description: "Specific todo IDs to sync (optional, syncs all if not provided)"
            }
          }
        }
      },
      {
        name: "sync_tasks_to_todos",
        description: "Sync Baton tasks to Claude Code todos for the current project",
        inputSchema: {
          type: "object",
          properties: {
            taskIds: {
              type: "array",
              items: { type: "string" },
              description: "Specific task IDs to sync (optional, syncs all if not provided)"
            }
          }
        }
      },
      
      // Workspace Management Tools
      {
        name: "associate_workspace_project",
        description: "Associate current workspace with a Baton project",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID to associate with current workspace"
            }
          },
          required: ["projectId"]
        }
      },
      {
        name: "get_workspace_info",
        description: "Get current workspace project information",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "detect_workspace_project",
        description: "Ask Claude Code to find and read the .baton-project file to detect current workspace project",
        inputSchema: {
          type: "object",
          properties: {
            searchPath: {
              type: "string",
              description: "Optional: Starting path to search for .baton-project file (defaults to current directory)"
            }
          }
        }
      }
    ];
  }

  async callTool(name: string, args: any, projectId?: string | null): Promise<any> {
    switch (name) {
      case "create_project":
        return this.createProject(args);
      case "update_project":
        return this.updateProject(args);
      case "create_task":
        return this.createTask(args, projectId);
      case "update_task":
        return this.updateTask(args, projectId);
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
      case "associate_workspace_project":
        return this.associateWorkspaceProject(args);
      case "get_workspace_info":
        return this.getWorkspaceInfo(args);
      case "detect_workspace_project":
        return this.detectWorkspaceProject(args);
      case "TodoRead":
        return this.todoRead(args);
      case "TodoWrite":
        return this.todoWrite(args);
      case "sync_todos_to_tasks":
        return this.syncTodosToTasks(args);
      case "sync_tasks_to_todos":
        return this.syncTasksToTodos(args);
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

  private async createTask(args: any, contextProjectId?: string | null): Promise<any> {
    const { projectId: argsProjectId, title, description, status = 'todo', priority = 'medium', assigneeId, dueDate, labels = [] } = args;

    // Use projectId from args if provided, otherwise use context projectId
    const targetProjectId = argsProjectId || contextProjectId;
    
    if (!targetProjectId) {
      throw new Error('No project specified. Please provide a projectId or ensure you are in a project workspace.');
    }

    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: targetProjectId }
    });

    if (!project) {
      throw new Error(`Project with ID ${targetProjectId} not found`);
    }

    // Get next order for the status column
    const lastTask = await this.prisma.task.findFirst({
      where: { projectId: targetProjectId, status },
      orderBy: { order: 'desc' }
    });

    const nextOrder = lastTask ? lastTask.order + 1 : 0;

    const task = await this.prisma.task.create({
      data: {
        title,
        description,
        status,
        priority,
        projectId: targetProjectId,
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

  private async updateTask(args: any, _contextProjectId?: string | null): Promise<any> {
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

  private async associateWorkspaceProject(args: any): Promise<any> {
    const { projectId } = args;
    
    if (!this.workspaceManager) {
      throw new Error("Workspace manager not available");
    }

    try {
      const success = await this.workspaceManager.associateWorkspaceWithProject(projectId);
      
      if (success) {
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true, description: true }
        });

        return {
          success: true,
          message: `Workspace associated with project "${project?.name}"`,
          project: {
            id: projectId,
            name: project?.name,
            description: project?.description
          }
        };
      } else {
        return {
          success: false,
          message: "Failed to associate workspace with project"
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async getWorkspaceInfo(_args: any): Promise<any> {
    if (!this.workspaceManager) {
      return {
        success: false,
        message: "Workspace manager not available"
      };
    }

    try {
      const currentProjectId = await this.workspaceManager.detectCurrentProject();
      
      if (!currentProjectId) {
        return {
          success: true,
          hasProject: false,
          message: "No project associated with current workspace",
          workspacePath: process.cwd(),
          suggestions: "Run 'associate_workspace_project' to link this workspace to a Baton project"
        };
      }

      const project = await this.prisma.project.findUnique({
        where: { id: currentProjectId },
        include: {
          owner: {
            select: { name: true, email: true }
          },
          _count: {
            select: { tasks: true }
          }
        }
      });

      const mappings = await this.workspaceManager.listWorkspaceMappings();

      return {
        success: true,
        hasProject: true,
        currentProject: {
          id: project?.id,
          name: project?.name,
          description: project?.description,
          owner: project?.owner,
          taskCount: project?._count?.tasks
        },
        workspacePath: process.cwd(),
        allMappings: mappings
      };
    } catch (error) {
      return {
        success: false,
        message: `Error getting workspace info: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async todoRead(args: any): Promise<any> {
    try {
      const { projectId: providedProjectId } = args;
      
      // Use provided project ID if available, otherwise try to detect it
      let currentProjectId: string | null = providedProjectId || null;
      
      if (!currentProjectId && this.workspaceManager) {
        currentProjectId = await this.workspaceManager.detectCurrentProject();
        console.log(`🔍 Workspace detection result: ${currentProjectId || 'none'}`);
      }
      
      // Validate project ID if provided
      if (currentProjectId) {
        const project = await this.prisma.project.findUnique({
          where: { id: currentProjectId },
          select: { id: true, name: true }
        });
        
        if (!project) {
          return {
            success: false,
            todos: [],
            error: `Project with ID '${currentProjectId}' not found. Please check the project ID or use 'detect_workspace_project' tool.`
          };
        }
        
        console.log(`✅ Using project: ${project.name} (${project.id})`);
      }
      
      if (!currentProjectId) {
        return {
          success: false,
          todos: [],
          requiresWorkspaceDetection: true,
          message: "No project context found. I need to find your .baton-project file to determine the correct project.",
          instructions: {
            message: "Please help me find your project configuration by running the 'detect_workspace_project' tool or by manually executing these commands:",
            steps: [
              {
                command: "find . -name '.baton-project' -type f | head -1",
                description: "Find the .baton-project file in the current workspace"
              },
              {
                command: "cat [found-file-path]",
                description: "Read the contents to get the project ID"
              }
            ],
            expectedFormat: "Then use the detected projectId with the TodoRead tool"
          }
        };
      }

      // Fetch all claude todos for the current project
      const claudeTodos = await this.prisma.claudeTodo.findMany({
        where: { projectId: currentProjectId },
        orderBy: { orderIndex: 'asc' }
      });

      // Transform to Claude Code format
      const todos = claudeTodos.map(todo => ({
        id: todo.id,
        content: todo.content,
        status: todo.status,
        priority: todo.priority
      }));

      return { todos };
    } catch (error) {
      return {
        todos: [],
        error: `Failed to read todos: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async todoWrite(args: any): Promise<any> {
    try {
      const { todos, projectId: providedProjectId } = args;
      
      // Use provided project ID if available, otherwise try to detect it
      let currentProjectId: string | null = providedProjectId || null;
      
      if (!currentProjectId && this.workspaceManager) {
        currentProjectId = await this.workspaceManager.detectCurrentProject();
        console.log(`🔍 Workspace detection result: ${currentProjectId || 'none'}`);
      }
      
      // Validate project ID if provided
      if (currentProjectId) {
        const project = await this.prisma.project.findUnique({
          where: { id: currentProjectId },
          select: { id: true, name: true }
        });
        
        if (!project) {
          return {
            success: false,
            count: 0,
            error: `Project with ID '${currentProjectId}' not found. Please check the project ID or use 'detect_workspace_project' tool.`
          };
        }
        
        console.log(`✅ Using project: ${project.name} (${project.id})`);
      }
      
      if (!currentProjectId) {
        return {
          success: false,
          count: 0,
          requiresWorkspaceDetection: true,
          message: "No project context found. I need to find your .baton-project file to determine the correct project.",
          instructions: {
            message: "Please help me find your project configuration by running the 'detect_workspace_project' tool or by manually executing these commands:",
            steps: [
              {
                command: "find . -name '.baton-project' -type f | head -1",
                description: "Find the .baton-project file in the current workspace"
              },
              {
                command: "cat [found-file-path]",
                description: "Read the contents to get the project ID"
              }
            ],
            expectedFormat: "Then use the detected projectId with the TodoWrite tool"
          }
        };
      }

      // Use transaction to ensure data consistency
      const result = await this.prisma.$transaction(async (tx) => {
        // First, get existing todos to track what needs to be deleted
        const existingTodos = await tx.claudeTodo.findMany({
          where: { projectId: currentProjectId! },
          select: { id: true }
        });
        
        const existingIds = existingTodos.map(t => t.id);
        const newIds = todos.map((t: any) => t.id);
        
        // Delete todos that are no longer in the new list
        const idsToDelete = existingIds.filter(id => !newIds.includes(id));
        if (idsToDelete.length > 0) {
          await tx.claudeTodo.deleteMany({
            where: {
              id: { in: idsToDelete },
              projectId: currentProjectId!
            }
          });
        }

        // Upsert each todo
        let processedCount = 0;
        for (let i = 0; i < todos.length; i++) {
          const todo = todos[i];
          await tx.claudeTodo.upsert({
            where: { id: todo.id },
            update: {
              content: todo.content,
              status: todo.status,
              priority: todo.priority,
              orderIndex: i,
              updatedAt: new Date()
            },
            create: {
              id: todo.id,
              content: todo.content,
              status: todo.status,
              priority: todo.priority,
              projectId: currentProjectId!,
              orderIndex: i,
              createdBy: 'claude'
            }
          });
          processedCount++;
        }
        
        return processedCount;
      });

      // Emit WebSocket event after successful database transaction
      if (this.io && currentProjectId) {
        try {
          this.io.to(`project-${currentProjectId}`).emit('claude-mcp-operation-completed', {
            projectId: currentProjectId,
            operation: 'TodoWrite',
            count: result,
            action: 'todos-updated'
          });
        } catch (wsError) {
          console.error('Failed to emit WebSocket event for claude-mcp-operation-completed:', wsError);
          // Don't throw - WebSocket failure shouldn't break the main operation
        }
      }

      return {
        success: true,
        count: result,
        message: `Successfully processed ${result} todos`
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: `Failed to write todos: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async syncTodosToTasks(args: any): Promise<any> {
    try {
      const { todoIds } = args;
      
      // Get current project ID from workspace manager
      let currentProjectId: string | null = null;
      
      if (this.workspaceManager) {
        currentProjectId = await this.workspaceManager.detectCurrentProject();
      }
      
      if (!currentProjectId) {
        return {
          success: false,
          message: "No project associated with current workspace. Use 'associate_workspace_project' to link workspace to a project."
        };
      }

      // Build where clause based on todoIds filter
      const whereClause: any = { projectId: currentProjectId };
      if (todoIds && todoIds.length > 0) {
        whereClause.id = { in: todoIds };
      }

      // Fetch todos to sync
      const claudeTodos = await this.prisma.claudeTodo.findMany({
        where: whereClause,
        orderBy: { orderIndex: 'asc' }
      });

      if (claudeTodos.length === 0) {
        return {
          success: true,
          syncedCount: 0,
          message: "No todos found to sync"
        };
      }

      // Convert todos to tasks in a transaction
      const syncedTasks = await this.prisma.$transaction(async (tx) => {
        const tasks = [];
        
        for (const todo of claudeTodos) {
          // Skip if already synced to a task
          if (todo.syncedTaskId) {
            continue;
          }

          // Map Claude Code status to Baton task status
          let batonStatus = 'todo';
          if (todo.status === 'in_progress') batonStatus = 'in_progress';
          if (todo.status === 'completed') batonStatus = 'done';

          // Get next order for the status column
          const lastTask = await tx.task.findFirst({
            where: { projectId: currentProjectId!, status: batonStatus },
            orderBy: { order: 'desc' }
          });

          const nextOrder = lastTask ? lastTask.order + 1 : 0;

          // Create the task
          const task = await tx.task.create({
            data: {
              title: `[Claude] ${todo.content}`,
              description: `Synced from Claude Code todo (ID: ${todo.id})`,
              status: batonStatus,
              priority: todo.priority,
              projectId: currentProjectId!,
              createdById: 'user_default',
              order: nextOrder,
              labels: JSON.stringify(['claude-sync', `todo:${todo.id}`])
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

          // Update the todo to link it to the task
          await tx.claudeTodo.update({
            where: { id: todo.id },
            data: { syncedTaskId: task.id }
          });

          tasks.push({
            ...task,
            labels: task.labels ? JSON.parse(task.labels) : []
          });
        }
        
        return tasks;
      });

      // Emit WebSocket event after successful sync operation
      if (this.io && currentProjectId) {
        try {
          this.io.to(`project-${currentProjectId}`).emit('claude-todos-synced-to-tasks', {
            projectId: currentProjectId,
            syncedCount: syncedTasks.length,
            syncedTasks,
            action: 'todos-to-tasks',
            source: 'mcp'
          });
        } catch (wsError) {
          console.error('Failed to emit WebSocket event for claude-todos-synced-to-tasks (MCP):', wsError);
          // Don't throw - WebSocket failure shouldn't break the main operation
        }
      }

      return {
        success: true,
        syncedCount: syncedTasks.length,
        syncedTasks,
        message: `Successfully synced ${syncedTasks.length} todos to tasks`
      };
    } catch (error) {  
      return {
        success: false,
        syncedCount: 0,
        error: `Failed to sync todos to tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async syncTasksToTodos(args: any): Promise<any> {
    try {
      const { taskIds } = args;
      
      // Get current project ID from workspace manager
      let currentProjectId: string | null = null;
      
      if (this.workspaceManager) {
        currentProjectId = await this.workspaceManager.detectCurrentProject();
      }
      
      if (!currentProjectId) {
        return {
          success: false,
          message: "No project associated with current workspace. Use 'associate_workspace_project' to link workspace to a project."
        };
      }

      // Build where clause based on taskIds filter
      const whereClause: any = { projectId: currentProjectId };
      if (taskIds && taskIds.length > 0) {
        whereClause.id = { in: taskIds };
      }

      // Fetch tasks to sync
      const batonTasks = await this.prisma.task.findMany({
        where: whereClause,
        orderBy: { order: 'asc' }
      });

      if (batonTasks.length === 0) {
        return {
          success: true,
          syncedCount: 0,
          message: "No tasks found to sync"
        };
      }

      // Convert tasks to todos in a transaction
      const syncedTodos = await this.prisma.$transaction(async (tx) => {
        const todos = [];
        
        for (let i = 0; i < batonTasks.length; i++) {
          const task = batonTasks[i];
          if (!task) continue;
          
          // Check if task is already synced from a Claude todo
          const existingTodo = await tx.claudeTodo.findFirst({
            where: { syncedTaskId: task.id }
          });

          if (existingTodo) {
            // Update existing linked todo
            const updatedTodo = await tx.claudeTodo.update({
              where: { id: existingTodo.id },
              data: {
                content: task.title,
                status: task.status === 'done' ? 'completed' : 
                       task.status === 'in_progress' ? 'in_progress' : 'pending',
                priority: task.priority,
                orderIndex: i,
                updatedAt: new Date()
              }
            });
            todos.push(updatedTodo);
          } else {
            // Create new todo for this task
            const todoId = `task-${task.id}-${Date.now()}`;
            const newTodo = await tx.claudeTodo.create({
              data: {
                id: todoId,
                content: task.title,
                status: task.status === 'done' ? 'completed' : 
                       task.status === 'in_progress' ? 'in_progress' : 'pending',
                priority: task.priority,
                projectId: currentProjectId!,
                orderIndex: i,
                createdBy: 'system',
                syncedTaskId: task.id
              }
            });
            todos.push(newTodo);
          }
        }
        
        return todos;
      });

      // Transform to Claude Code format for response
      const claudeFormattedTodos = syncedTodos.map(todo => ({
        id: todo.id,
        content: todo.content,
        status: todo.status,
        priority: todo.priority
      }));

      // Emit WebSocket event after successful sync operation
      if (this.io && currentProjectId) {
        try {
          this.io.to(`project-${currentProjectId}`).emit('claude-tasks-synced-to-todos', {
            projectId: currentProjectId,
            syncedCount: syncedTodos.length,
            syncedTodos: claudeFormattedTodos,
            action: 'tasks-to-todos',
            source: 'mcp'
          });
        } catch (wsError) {
          console.error('Failed to emit WebSocket event for claude-tasks-synced-to-todos (MCP):', wsError);
          // Don't throw - WebSocket failure shouldn't break the main operation
        }
      }

      return {
        success: true,
        syncedCount: syncedTodos.length,
        syncedTodos: claudeFormattedTodos,
        message: `Successfully synced ${syncedTodos.length} tasks to todos`
      };
    } catch (error) {
      return {
        success: false,
        syncedCount: 0,
        error: `Failed to sync tasks to todos: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async detectWorkspaceProject(args: any): Promise<any> {
    try {
      const { searchPath = "." } = args;
      
      return {
        success: true,
        requiresClaudeCodeExecution: true,
        instructions: {
          message: "I need to find your project's .baton-project configuration file to determine the correct project context.",
          steps: [
            {
              command: `find ${searchPath} -name '.baton-project' -type f | head -1`,
              description: "Find the .baton-project file in the current workspace"
            },
            {
              command: "cat [FOUND_FILE_PATH]",
              description: "Read the contents of the .baton-project file to get the project ID"
            }
          ],
          expectedFormat: "Please return just the projectId value from the JSON file (e.g., 'cmdx0019o0001ijdvw3z1bbbi')",
          fallback: "If no .baton-project file is found, you can create one with: echo '{\"projectId\": \"your-project-id\"}' > .baton-project"
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to initiate workspace detection: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}