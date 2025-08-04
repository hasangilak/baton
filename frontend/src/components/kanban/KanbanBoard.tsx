import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { apiService } from '../../services/api';
import type { Task, TaskStatus } from '../../types';

interface KanbanBoardProps {
  projectId: string;
}

const COLUMN_CONFIG = {
  todo: {
    title: 'To do',
    color: 'bg-gray-100',
    headerColor: 'text-gray-700',
    count: 4,
  },
  in_progress: {
    title: 'In Progress',
    color: 'bg-blue-50',
    headerColor: 'text-blue-700',
    count: 2,
  },
  done: {
    title: 'Done',
    color: 'bg-green-50', 
    headerColor: 'text-green-700',
    count: 1,
  },
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ projectId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const response = await apiService.getTasks(projectId);
      if (response.success && response.data) {
        setTasks(response.data);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTasksByStatus = (status: TaskStatus): Task[] => {
    return tasks
      .filter(task => task.status === status)
      .sort((a, b) => a.order - b.order);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    setDraggedTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Determine if we're dropping over a column or a task
    let newStatus: TaskStatus;
    let newOrder: number;

    if (overId.startsWith('column-')) {
      // Dropping over a column
      newStatus = overId.replace('column-', '') as TaskStatus;
      const tasksInColumn = getTasksByStatus(newStatus);
      newOrder = tasksInColumn.length;
    } else {
      // Dropping over a task
      const targetTask = tasks.find(t => t.id === overId);
      if (!targetTask) return;
      
      newStatus = targetTask.status;
      newOrder = targetTask.order;
    }

    const draggedTask = tasks.find(t => t.id === taskId);
    if (!draggedTask || (draggedTask.status === newStatus && draggedTask.order === newOrder)) {
      return;
    }

    try {
      // Optimistically update the UI
      const updatedTasks = tasks.map(task => {
        if (task.id === taskId) {
          return { ...task, status: newStatus, order: newOrder };
        }
        return task;
      });
      setTasks(updatedTasks);

      // Update on the server
      await apiService.reorderTask(taskId, newStatus, newOrder, projectId);
      
      // Refresh tasks to get the correct order
      loadTasks();
    } catch (error) {
      console.error('Failed to reorder task:', error);
      // Revert optimistic update on error
      loadTasks();
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Handle drag over logic if needed
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-6 h-full">
          {(Object.keys(COLUMN_CONFIG) as TaskStatus[]).map((status) => {
            const columnTasks = getTasksByStatus(status);
            const config = COLUMN_CONFIG[status];

            return (
              <KanbanColumn
                key={status}
                id={`column-${status}`}
                title={config.title}
                color={config.color}
                headerColor={config.headerColor}
                count={columnTasks.length}
                status={status}
              >
                <SortableContext
                  items={columnTasks.map(task => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isDragging={draggedTask?.id === task.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
};