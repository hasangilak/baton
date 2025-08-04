import React, { useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
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
import { useTasks, useReorderTask } from '../../hooks';
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
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  
  // React Query hooks
  const { data: tasks = [], isLoading, error, refetch } = useTasks(projectId);
  const reorderTaskMutation = useReorderTask();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const getTasksByStatus = (status: TaskStatus): Task[] => {
    return tasks
      .filter(task => task.status === status)
      .sort((a, b) => a.order - b.order);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    setDraggedTask(task || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
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

    const draggedTaskData = tasks.find(t => t.id === taskId);
    if (!draggedTaskData || (draggedTaskData.status === newStatus && draggedTaskData.order === newOrder)) {
      return;
    }

    // Use React Query mutation with optimistic updates
    reorderTaskMutation.mutate({
      id: taskId,
      newStatus,
      newOrder,
      projectId,
    });
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Handle drag over logic if needed
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <div className="text-gray-500">Loading tasks...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="text-red-500 text-center">
            <div className="text-lg font-medium">Failed to load tasks</div>
            <div className="text-sm">{error.message}</div>
          </div>
          <button 
            onClick={() => refetch()}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6">
      {/* Show loading indicator during reorder operations */}
      {reorderTaskMutation.isPending && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span>Updating task...</span>
          </div>
        </div>
      )}
      
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