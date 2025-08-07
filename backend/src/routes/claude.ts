import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/claude/plans
 * Capture a plan from Claude Code's ExitPlanMode hook
 * This endpoint is designed to work with the capture-plan.js hook script
 */
router.post('/plans', async (req, res) => {
  try {
    const {
      id,
      projectId,
      title,
      content,
      status = 'accepted',
      sessionId,
      capturedAt,
      metadata
    } = req.body;

    // Validate required fields
    if (!projectId || !content) {
      return res.status(400).json({
        error: 'Missing required fields: projectId and content are required'
      });
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        error: `Project with ID '${projectId}' not found`
      });
    }

    // Create the plan with provided ID or generate one
    const planId = id || `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    const plan = await prisma.claudeCodePlan.create({
      data: {
        id: planId,
        title: title || `Plan captured on ${new Date().toISOString()}`,
        content,
        status,
        projectId,
        sessionId,
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        metadata: metadata || {}
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });

    // Emit WebSocket event for real-time updates
    io.to(`project-${projectId}`).emit('plan:created', plan);
    io.emit('claude:plan-captured', { projectId, planId: plan.id, title: plan.title });

    return res.status(201).json({
      success: true,
      plan,
      message: `Plan "${plan.title}" captured successfully`
    });

  } catch (error) {
    console.error('Error capturing plan:', error);
    return res.status(500).json({
      error: 'Internal server error while capturing plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/claude/todos
 * Sync todos from Claude Code's TodoWrite hook
 * This endpoint is designed to work with the capture-todos.js hook script
 */
router.post('/todos', async (req, res) => {
  try {
    const { projectId, todos } = req.body;

    // Validate required fields
    if (!projectId || !todos || !Array.isArray(todos)) {
      return res.status(400).json({
        error: 'Missing required fields: projectId and todos array are required'
      });
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        error: `Project with ID '${projectId}' not found`
      });
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // First, get existing todos to track what needs to be deleted
      const existingTodos = await tx.claudeTodo.findMany({
        where: { projectId },
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
            projectId
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
            priority: todo.priority || 'medium',
            orderIndex: i,
            updatedAt: new Date()
          },
          create: {
            id: todo.id,
            content: todo.content,
            status: todo.status,
            priority: todo.priority || 'medium',
            projectId,
            orderIndex: i,
            createdBy: 'claude'
          }
        });
        processedCount++;
      }
      
      return { processedCount, deletedCount: idsToDelete.length };
    });

    // Emit WebSocket event for real-time updates
    io.to(`project-${projectId}`).emit('claude:todos-synced', {
      projectId,
      count: result.processedCount,
      deleted: result.deletedCount
    });

    return res.status(200).json({
      success: true,
      count: result.processedCount,
      deleted: result.deletedCount,
      message: `Successfully synced ${result.processedCount} todos`
    });

  } catch (error) {
    console.error('Error syncing todos:', error);
    return res.status(500).json({
      error: 'Internal server error while syncing todos',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/claude/hook-status
 * Check the status of Claude Code hook integration
 */
router.get('/hook-status', async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        error: 'Project ID is required'
      });
    }

    // Get recent hook activity
    const recentPlans = await prisma.claudeCodePlan.count({
      where: {
        projectId,
        capturedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    const recentTodos = await prisma.claudeTodo.count({
      where: {
        projectId,
        updatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    const totalPlans = await prisma.claudeCodePlan.count({
      where: { projectId }
    });

    const totalTodos = await prisma.claudeTodo.count({
      where: { projectId }
    });

    return res.json({
      success: true,
      status: {
        hooksActive: true,
        recentActivity: {
          plans: recentPlans,
          todos: recentTodos,
          lastDay: true
        },
        totals: {
          plans: totalPlans,
          todos: totalTodos
        },
        endpoints: {
          plans: '/api/claude/plans',
          todos: '/api/claude/todos',
          mcp: '/mcp/sse'
        }
      }
    });

  } catch (error) {
    console.error('Error checking hook status:', error);
    return res.status(500).json({
      error: 'Internal server error while checking hook status'
    });
  }
});

export default router;