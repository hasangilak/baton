import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import type { TaskStatus } from '../../types';

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  headerColor: string;
  count: number;
  status: TaskStatus;
  children: React.ReactNode;
}

const getStatusDot = (status: TaskStatus) => {
  switch (status) {
    case 'todo':
      return 'bg-orange-400';
    case 'in_progress':
      return 'bg-blue-400';
    case 'done':
      return 'bg-green-400';
    default:
      return 'bg-gray-400';
  }
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  id,
  title,
  color,
  headerColor,
  count,
  status,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'kanban-column flex flex-col',
        color,
        isOver && 'ring-2 ring-primary-300 ring-opacity-50'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className={clsx('w-2 h-2 rounded-full', getStatusDot(status))} />
          <h3 className={clsx('font-medium', headerColor)}>{title}</h3>
          <span className={clsx(
            'px-2 py-1 text-xs font-medium rounded-full',
            'bg-white bg-opacity-70 text-gray-600'
          )}>
            {count}
          </span>
        </div>
        
        <button 
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white hover:bg-opacity-50 rounded"
          title="Add new task"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Column Content */}
      <div className="flex-1 space-y-3">
        {children}
      </div>

      {/* Drop Zone Indicator */}
      {isOver && (
        <div className="mt-3 p-2 border-2 border-dashed border-primary-300 rounded-lg bg-primary-50 bg-opacity-50">
          <div className="text-center text-sm text-primary-600">
            Drop task here
          </div>
        </div>
      )}
    </div>
  );
};