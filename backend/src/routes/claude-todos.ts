import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const router = Router();
const prisma = new PrismaClient();

// GET /api/claude-todos - Get all Claude Code todos for a project
// @ts-expect-error Express route handler return type inference issue
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
      });
    }

    const todos = await prisma.claudeTodo.findMany({
      where: { projectId },
      orderBy: { orderIndex: 'asc' },
      include: {
        project: {
          select: { name: true, color: true }
        },
        syncedTask: {
          select: { 
            id: true, 
            title: true, 
            status: true,
            priority: true
          }
        }
      }
    });

    // Transform to Claude Code format
    const claudeFormattedTodos = todos.map(todo => ({
      id: todo.id,
      content: todo.content,
      status: todo.status,
      priority: todo.priority,
      project: todo.project,
      syncedTask: todo.syncedTask,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      metadata: todo.metadata
    }));

    res.json({
      todos: claudeFormattedTodos,
      count: todos.length
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/claude-todos - Create or update Claude Code todos
// @ts-expect-error Express route handler return type inference issue
router.post('/', async (req, res, next) => {
  try {
    const { projectId, todos } = req.body;
    
    if (!projectId || !todos || !Array.isArray(todos)) {
      return res.status(400).json({
        error: 'Project ID and todos array are required',
        code: 'INVALID_REQUEST_BODY'
      });
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    // Use transaction for data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Get existing todos to track deletions
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
      const processedTodos = [];
      for (let i = 0; i < todos.length; i++) {
        const todo = todos[i];
        
        if (!todo.id || !todo.content || !todo.status || !todo.priority) {
          throw new Error(`Invalid todo at index ${i}: missing required fields`);
        }

        const upsertedTodo = await tx.claudeTodo.upsert({
          where: { id: todo.id },
          update: {
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            orderIndex: i,
            metadata: todo.metadata || null,
            updatedAt: new Date()
          },
          create: {
            id: todo.id,
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            projectId,
            orderIndex: i,
            metadata: todo.metadata || null,
            createdBy: 'system'
          },
          include: {
            project: {
              select: { name: true, color: true }
            },
            syncedTask: {
              select: { 
                id: true, 
                title: true, 
                status: true,
                priority: true
              }
            }
          }
        });

        processedTodos.push(upsertedTodo);
      }

      return processedTodos;
    });

    // Emit WebSocket event after successful database operations
    try {
      io.to(`project-${projectId}`).emit('claude-todos-batch-updated', {
        projectId,
        todos: result,
        count: result.length,
        action: 'batch-update'
      });
    } catch (wsError) {
      console.error('Failed to emit WebSocket event for claude-todos-batch-updated:', wsError);
      // Don't throw - WebSocket failure shouldn't break the main operation
    }

    res.json({
      success: true,
      todos: result,
      count: result.length,
      message: `Successfully processed ${result.length} todos`
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/claude-todos/:id - Delete a specific Claude Code todo
// @ts-expect-error Express route handler return type inference issue
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const todo = await prisma.claudeTodo.findUnique({
      where: { id },
      include: {
        syncedTask: {
          select: { id: true, title: true }
        }
      }
    });

    if (!todo) {
      return res.status(404).json({
        error: 'Todo not found',
        code: 'TODO_NOT_FOUND'
      });
    }

    await prisma.claudeTodo.delete({
      where: { id }
    });

    // Emit WebSocket event after successful deletion
    try {
      io.to(`project-${todo.projectId}`).emit('claude-todo-deleted', {
        projectId: todo.projectId,
        todoId: id,
        deletedTodo: {
          id: todo.id,
          content: todo.content,
          syncedTask: todo.syncedTask
        }
      });
    } catch (wsError) {
      console.error('Failed to emit WebSocket event for claude-todo-deleted:', wsError);
      // Don't throw - WebSocket failure shouldn't break the main operation
    }

    res.json({
      success: true,
      message: 'Todo deleted successfully',
      deletedTodo: {
        id: todo.id,
        content: todo.content,
        syncedTask: todo.syncedTask
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/claude-todos/sync-to-tasks - Sync Claude Code todos to Baton tasks
// @ts-expect-error Express route handler return type inference issue
router.post('/sync-to-tasks', async (req, res, next) => {
  try {
    const { projectId, todoIds } = req.body;
    
    if (!projectId) {
      return res.status(400).json({
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
      });
    }

    // Build where clause based on todoIds filter
    const whereClause: any = { projectId };
    if (todoIds && Array.isArray(todoIds) && todoIds.length > 0) {
      whereClause.id = { in: todoIds };
    }

    // Fetch todos to sync
    const claudeTodos = await prisma.claudeTodo.findMany({
      where: whereClause,
      orderBy: { orderIndex: 'asc' }
    });

    if (claudeTodos.length === 0) {
      return res.json({
        success: true,
        syncedCount: 0,
        message: 'No todos found to sync'
      });
    }

    // Convert todos to tasks in a transaction
    const syncedTasks = await prisma.$transaction(async (tx) => {
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
          where: { projectId, status: batonStatus },
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
            projectId,
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
    try {
      io.to(`project-${projectId}`).emit('claude-todos-synced-to-tasks', {
        projectId,
        syncedCount: syncedTasks.length,
        syncedTasks,
        action: 'todos-to-tasks'
      });
    } catch (wsError) {
      console.error('Failed to emit WebSocket event for claude-todos-synced-to-tasks:', wsError);
      // Don't throw - WebSocket failure shouldn't break the main operation
    }

    res.json({
      success: true,
      syncedCount: syncedTasks.length,
      syncedTasks,
      message: `Successfully synced ${syncedTasks.length} todos to tasks`
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/claude-todos/sync-from-tasks - Sync Baton tasks to Claude Code todos
// @ts-expect-error Express route handler return type inference issue
router.post('/sync-from-tasks', async (req, res, next) => {
  try {
    const { projectId, taskIds } = req.body;
    
    if (!projectId) {
      return res.status(400).json({
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
      });
    }

    // Build where clause based on taskIds filter
    const whereClause: any = { projectId };
    if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
      whereClause.id = { in: taskIds };
    }

    // Fetch tasks to sync
    const batonTasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { order: 'asc' }
    });

    if (batonTasks.length === 0) {
      return res.json({
        success: true,
        syncedCount: 0,
        message: 'No tasks found to sync'
      });
    }

    // Convert tasks to todos in a transaction
    const syncedTodos = await prisma.$transaction(async (tx) => {
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
              projectId,
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
    try {
      io.to(`project-${projectId}`).emit('claude-tasks-synced-to-todos', {
        projectId,
        syncedCount: syncedTodos.length,
        syncedTodos: claudeFormattedTodos,
        action: 'tasks-to-todos'
      });
    } catch (wsError) {
      console.error('Failed to emit WebSocket event for claude-tasks-synced-to-todos:', wsError);
      // Don't throw - WebSocket failure shouldn't break the main operation
    }

    res.json({
      success: true,
      syncedCount: syncedTodos.length,
      syncedTodos: claudeFormattedTodos,
      message: `Successfully synced ${syncedTodos.length} tasks to todos`
    });
  } catch (error) {
    next(error);
  }
});

export default router;