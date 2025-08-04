import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../middleware/errorHandler';
import type { ApiResponse, CreateProjectRequest, UpdateProjectRequest } from '../types';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6')
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});

// GET /api/projects - Get all projects
router.get('/', async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
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

    const response: ApiResponse = {
      success: true,
      data: projects
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/projects/:id - Get project by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const project = await prisma.project.findUnique({
      where: { id },
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
          orderBy: { order: 'asc' }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    if (!project) {
      throw createError('Project not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: project
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/projects - Create new project
router.post('/', async (req, res, next) => {
  try {
    const validatedData = createProjectSchema.parse(req.body);
    
    // For now, we'll use a dummy user ID. In production, get from auth
    const dummyUserId = 'user_default';
    
    // Ensure default user exists
    await prisma.user.upsert({
      where: { id: dummyUserId },
      update: {},
      create: {
        id: dummyUserId,
        email: 'user@example.com',
        name: 'Default User'
      }
    });

    const project = await prisma.project.create({
      data: {
        ...validatedData,
        ownerId: dummyUserId
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

    const response: ApiResponse = {
      success: true,
      data: project
    };

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateProjectSchema.parse(req.body);

    const project = await prisma.project.update({
      where: { id },
      data: validatedData,
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    const response: ApiResponse = {
      success: true,
      data: project
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(createError('Invalid input data', 400));
    }
    next(error);
  }
});

// DELETE /api/projects/:id - Delete project
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.project.delete({
      where: { id }
    });

    const response: ApiResponse = {
      success: true,
      data: { message: 'Project deleted successfully' }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;