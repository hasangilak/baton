import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../middleware/errorHandler';
import { io } from '../index';
import type { ApiResponse } from '../types';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assigneeId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  labels: z.array(z.string()).default([])
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  labels: z.array(z.string()).optional(),
  order: z.number().optional()
});

// GET /api/tasks?projectId=xxx - Get tasks by project
router.get('/', async (req, res, next) => {
  try {
    const { projectId, status } = req.query;
    
    if (!projectId) {
      throw createError('Project ID is required', 400);
    }

    const whereClause: any = { projectId: projectId as string };
    if (status) {
      whereClause.status = status as string;
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
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
      orderBy: [
        { status: 'asc' },
        { order: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    // Parse labels from JSON string
    const tasksWithLabels = tasks.map(task => ({
      ...task,
      labels: task.labels ? JSON.parse(task.labels) : []
    }));

    const response: ApiResponse = {
      success: true,
      data: tasksWithLabels
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id - Get task by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        project: {
          select: { id: true, name: true, color: true }
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!task) {
      throw createError('Task not found', 404);
    }

    const taskWithLabels = {
      ...task,
      labels: task.labels ? JSON.parse(task.labels) : []
    };

    const response: ApiResponse = {
      success: true,
      data: taskWithLabels
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks - Create new task
router.post('/', async (req, res, next) => {
  try {
    const validatedData = createTaskSchema.parse(req.body);
    const { projectId } = req.body;
    
    if (!projectId) {
      throw createError('Project ID is required', 400);
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw createError('Project not found', 404);
    }

    // For now, use default user. In production, get from auth
    const dummyUserId = 'user_default';

    // Get next order for the status column
    const lastTask = await prisma.task.findFirst({
      where: { projectId, status: validatedData.status },
      orderBy: { order: 'desc' }
    });

    const nextOrder = lastTask ? lastTask.order + 1 : 0;

    const task = await prisma.task.create({
      data: {
        title: validatedData.title,
        description: validatedData.description ?? null,
        status: validatedData.status ?? 'todo',
        priority: validatedData.priority ?? 'medium',
        assigneeId: validatedData.assigneeId ?? null,
        projectId,
        createdById: dummyUserId,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        labels: JSON.stringify(validatedData.labels),
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

    const taskWithLabels = {
      ...task,
      labels: task.labels ? JSON.parse(task.labels) : []
    };

    // Emit real-time update
    io.to(`project-${projectId}`).emit('task-created', taskWithLabels);

    const response: ApiResponse = {
      success: true,
      data: taskWithLabels
    };

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateTaskSchema.parse(req.body);

    // Handle status change completion
    const updateData: any = { ...validatedData };
    if (validatedData.dueDate) {
      updateData.dueDate = new Date(validatedData.dueDate);
    }
    if (validatedData.labels) {
      updateData.labels = JSON.stringify(validatedData.labels);
    }
    if (validatedData.status === 'done') {
      updateData.completedAt = new Date();
    } else if (validatedData.status && (validatedData.status === 'todo' || validatedData.status === 'in_progress')) {
      updateData.completedAt = null;
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
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

    const taskWithLabels = {
      ...task,
      labels: task.labels ? JSON.parse(task.labels) : []
    };

    // Emit real-time update
    io.to(`project-${task.projectId}`).emit('task-updated', taskWithLabels);

    const response: ApiResponse = {
      success: true,
      data: taskWithLabels
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: { projectId: true }
    });

    if (!task) {
      throw createError('Task not found', 404);
    }

    await prisma.task.delete({
      where: { id }
    });

    // Emit real-time update
    io.to(`project-${task.projectId}`).emit('task-deleted', { id });

    const response: ApiResponse = {
      success: true,
      data: { message: 'Task deleted successfully' }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks/:id/reorder - Reorder task within column or between columns
router.post('/:id/reorder', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newStatus, newOrder, projectId } = req.body;

    if (!newStatus || newOrder === undefined || !projectId) {
      throw createError('newStatus, newOrder, and projectId are required', 400);
    }

    // Get all tasks in the target status column
    const tasksInColumn = await prisma.task.findMany({
      where: { projectId, status: newStatus },
      orderBy: { order: 'asc' }
    });

    // Remove the moving task from the list
    const filteredTasks = tasksInColumn.filter(task => task.id !== id);

    // Insert the task at the new position
    const updatedTasks = [...filteredTasks];
    updatedTasks.splice(newOrder, 0, { id } as any);

    // Update all tasks with new orders
    const updatePromises = updatedTasks.map((task, index) => 
      prisma.task.update({
        where: { id: task.id },
        data: { 
          order: index,
          status: newStatus,
          ...(newStatus === 'done' ? { completedAt: new Date() } : { completedAt: null })
        }
      })
    );

    await Promise.all(updatePromises);

    // Get the updated task
    const updatedTask = await prisma.task.findUnique({
      where: { id },
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

    const taskWithLabels = {
      ...updatedTask,
      labels: updatedTask?.labels ? JSON.parse(updatedTask.labels) : []
    };

    // Emit real-time update
    io.to(`project-${projectId}`).emit('task-reordered', taskWithLabels);

    const response: ApiResponse = {
      success: true,
      data: taskWithLabels
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;