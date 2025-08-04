import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/plans/capture
 * Capture a plan from Claude Code's ExitPlanMode hook
 */
router.post('/capture', async (req, res) => {
  try {
    const {
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

    // Create the plan
    const plan = await prisma.claudeCodePlan.create({
      data: {
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

    res.status(201).json({
      success: true,
      plan
    });

  } catch (error) {
    console.error('Error capturing plan:', error);
    res.status(500).json({
      error: 'Internal server error while capturing plan'
    });
  }
});

/**
 * GET /api/plans
 * Get all plans, optionally filtered by project
 */
router.get('/', async (req, res) => {
  try {
    const { projectId, status, limit = 50, offset = 0 } = req.query;

    const whereClause: any = {};
    
    if (projectId) {
      whereClause.projectId = projectId as string;
    }
    
    if (status) {
      whereClause.status = status as string;
    }

    const plans = await prisma.claudeCodePlan.findMany({
      where: whereClause,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
      orderBy: {
        capturedAt: 'desc'
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    const total = await prisma.claudeCodePlan.count({
      where: whereClause
    });

    res.json({
      success: true,
      plans,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + parseInt(limit as string)
      }
    });

  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      error: 'Internal server error while fetching plans'
    });
  }
});

/**
 * GET /api/plans/:id
 * Get a specific plan by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await prisma.claudeCodePlan.findUnique({
      where: { id },
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

    if (!plan) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    res.json({
      success: true,
      plan
    });

  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({
      error: 'Internal server error while fetching plan'
    });
  }
});

/**
 * PUT /api/plans/:id
 * Update a plan's status or other properties
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, metadata } = req.body;

    // Check if plan exists
    const existingPlan = await prisma.claudeCodePlan.findUnique({
      where: { id }
    });

    if (!existingPlan) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    // Update the plan
    const updateData: any = {};
    
    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;
    if (metadata !== undefined) updateData.metadata = metadata;

    const updatedPlan = await prisma.claudeCodePlan.update({
      where: { id },
      data: updateData,
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
    io.to(`project-${updatedPlan.projectId}`).emit('plan:updated', updatedPlan);

    res.json({
      success: true,
      plan: updatedPlan
    });

  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({
      error: 'Internal server error while updating plan'
    });
  }
});

/**
 * DELETE /api/plans/:id
 * Delete a specific plan
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if plan exists
    const existingPlan = await prisma.claudeCodePlan.findUnique({
      where: { id }
    });

    if (!existingPlan) {
      return res.status(404).json({
        error: 'Plan not found'
      });
    }

    await prisma.claudeCodePlan.delete({
      where: { id }
    });

    // Emit WebSocket event for real-time updates
    io.to(`project-${existingPlan.projectId}`).emit('plan:deleted', { id });

    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({
      error: 'Internal server error while deleting plan'
    });
  }
});

export default router;