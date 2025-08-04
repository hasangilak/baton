import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../middleware/errorHandler';
import { io } from '../index';
import type { ApiResponse } from '../types';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const registerAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  endpoint: z.string().url()
});

const createPlanSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  agentName: z.string().min(1),
  projectId: z.string(),
  tasks: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    order: z.number().default(0)
  }))
});

const updatePlanSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional()
});

// GET /api/mcp/connection - Get MCP server connection information
router.get('/connection', async (req, res, next) => {
  try {
    const { projectName, projectId } = req.query;
    
    let connectionUrl = 'ws://localhost:3002';
    
    if (projectId) {
      connectionUrl += `?project=${encodeURIComponent(projectId as string)}`;
    } else if (projectName) {
      connectionUrl += `?projectName=${encodeURIComponent(projectName as string)}`;
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        websocket: {
          url: connectionUrl,
          description: 'WebSocket MCP server connection'
        },
        docker: {
          host: 'localhost',
          port: 3002,
          protocol: 'ws',
          description: 'Docker container WebSocket endpoint'
        },
        usage: {
          claude_code: `ws://localhost:3002${projectName ? `?projectName=${encodeURIComponent(projectName as string)}` : ''}`,
          cursor: connectionUrl,
          windsurf: connectionUrl,
          custom: connectionUrl
        }
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/mcp/agents - Get all registered MCP agents
router.get('/agents', async (_req, res, next) => {
  try {
    const agents = await prisma.mCPAgent.findMany({
      include: {
        _count: {
          select: { plans: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const response: ApiResponse = {
      success: true,
      data: agents
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/mcp/agents - Register a new MCP agent
router.post('/agents', async (req, res, next) => {
  try {
    const validatedData = registerAgentSchema.parse(req.body);

    const agent = await prisma.mCPAgent.create({
      data: {
        name: validatedData.name,
        endpoint: validatedData.endpoint,
        description: validatedData.description ?? null,
      },
      include: {
        _count: {
          select: { plans: true }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      data: agent
    };

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// PUT /api/mcp/agents/:id/heartbeat - Agent heartbeat to update last seen
router.put('/agents/:id/heartbeat', async (req, res, next) => {
  try {
    const { id } = req.params;

    const agent = await prisma.mCPAgent.update({
      where: { id },
      data: { 
        lastSeen: new Date(),
        isActive: true
      }
    });

    const response: ApiResponse = {
      success: true,
      data: agent
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/mcp/plans - Get all MCP plans
router.get('/plans', async (req, res, next) => {
  try {
    const { projectId, agentId } = req.query;
    
    const whereClause: any = {};
    if (projectId) whereClause.projectId = projectId as string;
    if (agentId) whereClause.agentId = agentId as string;

    const plans = await prisma.mCPPlan.findMany({
      where: whereClause,
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

    const response: ApiResponse = {
      success: true,
      data: plans
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/mcp/plans/:id - Get MCP plan by ID
router.get('/plans/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const plan = await prisma.mCPPlan.findUnique({
      where: { id },
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

    if (!plan) {
      throw createError('Plan not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: plan
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/mcp/plans - Create new MCP plan from AI agent
router.post('/plans', async (req, res, next) => {
  try {
    const validatedData = createPlanSchema.parse(req.body);

    // Find or create the agent
    let agent = await prisma.mCPAgent.findUnique({
      where: { name: validatedData.agentName }
    });

    if (!agent) {
      // Auto-register agent if it doesn't exist
      agent = await prisma.mCPAgent.create({
        data: {
          name: validatedData.agentName,
          description: `Auto-registered agent: ${validatedData.agentName}`,
          endpoint: 'unknown', // Will be updated when agent registers properly
        }
      });
    }

    // Update agent last seen
    await prisma.mCPAgent.update({
      where: { id: agent.id },
      data: { lastSeen: new Date(), isActive: true }
    });

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: validatedData.projectId }
    });

    if (!project) {
      throw createError('Project not found', 404);
    }

    // Create plan and tasks in a transaction
    const plan = await prisma.$transaction(async (tx) => {
      const newPlan = await tx.mCPPlan.create({
        data: {
          title: validatedData.title,
          description: validatedData.description ?? null,
          agentId: agent.id,
          agentName: validatedData.agentName,
          projectId: validatedData.projectId,
          status: 'pending'
        }
      });

      // Create associated tasks
      if (validatedData.tasks.length > 0) {
        await tx.mCPTask.createMany({
          data: validatedData.tasks.map((task, index) => ({
            title: task.title ?? 'Untitled Task',
            description: task.description ?? null,
            priority: task.priority ?? 'medium',
            planId: newPlan.id,
            order: task.order ?? index
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

    // Emit real-time update
    io.to(`project-${validatedData.projectId}`).emit('mcp-plan-created', plan);

    const response: ApiResponse = {
      success: true,
      data: plan
    };

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// PUT /api/mcp/plans/:id - Update MCP plan
router.put('/plans/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updatePlanSchema.parse(req.body);

    const plan = await prisma.mCPPlan.update({
      where: { id },
      data: {
        ...(validatedData.title && { title: validatedData.title }),
        ...(validatedData.description !== undefined && { description: validatedData.description }),
        ...(validatedData.status && { status: validatedData.status })
      },
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

    // Emit real-time update
    io.to(`project-${plan.projectId}`).emit('mcp-plan-updated', plan);

    const response: ApiResponse = {
      success: true,
      data: plan
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// POST /api/mcp/plans/:id/convert - Convert MCP plan tasks to regular tasks
router.post('/plans/:id/convert', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const plan = await prisma.mCPPlan.findUnique({
      where: { id },
      include: {
        tasks: true,
        project: true
      }
    });

    if (!plan) {
      throw createError('Plan not found', 404);
    }

    // Default user for task creation
    const dummyUserId = 'user_default';

    // Convert MCP tasks to regular tasks
    const convertedTasks = await prisma.$transaction(async (tx) => {
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
            createdById: dummyUserId,
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
        where: { id },
        data: { status: 'completed' }
      });

      return tasks;
    });

    // Emit real-time updates
    io.to(`project-${plan.projectId}`).emit('mcp-plan-converted', { 
      projectId: plan.projectId,
      planId: id, 
      tasks: convertedTasks 
    });

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Plan converted to tasks successfully',
        tasks: convertedTasks
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/mcp/plans/:id - Delete MCP plan
router.delete('/plans/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const plan = await prisma.mCPPlan.findUnique({
      where: { id },
      select: { projectId: true }
    });

    if (!plan) {
      throw createError('Plan not found', 404);
    }

    await prisma.mCPPlan.delete({
      where: { id }
    });

    // Emit real-time update
    io.to(`project-${plan.projectId}`).emit('mcp-plan-deleted', { 
      projectId: plan.projectId,
      id 
    });

    const response: ApiResponse = {
      success: true,
      data: { message: 'Plan deleted successfully' }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;