import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Calendar, 
  MessageCircle, 
  Link as LinkIcon, 
  MoreHorizontal,
  AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { format, isToday, isPast } from 'date-fns';
import type { Task } from '../../types';

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'low':
      return 'text-green-600 bg-green-50 border-green-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

const getPriorityLabel = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return priority;
  }
};

const formatDueDate = (dateString?: string) => {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  
  if (isToday(date)) {
    return 'Today';
  }
  
  return format(date, 'MMM d');
};

const isDueDateOverdue = (dateString?: string) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  return isPast(date) && !isToday(date);
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, isDragging }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue = isDueDateOverdue(task.dueDate);
  const dueLabel = formatDueDate(task.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        'task-card cursor-grab active:cursor-grabbing',
        (isDragging || isSortableDragging) && 'opacity-50 rotate-2 scale-105 shadow-lg z-10'
      )}
    >
      {/* Task Status & Priority */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {task.status === 'in_progress' && (
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          )}
          
          <span className={clsx(
            'px-2 py-1 text-xs font-medium rounded-full border',
            getPriorityColor(task.priority)
          )}>
            {getPriorityLabel(task.priority)}
          </span>
        </div>
        
        <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Task Title */}
      <h4 className="font-medium text-gray-900 mb-2 line-clamp-2 leading-tight">
        {task.title}
      </h4>

      {/* Task Description */}
      {task.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.labels.slice(0, 3).map((label, index) => (
            <span
              key={index}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-md"
            >
              {label}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded-md">
              +{task.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Task Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-3">
          {/* Due Date */}
          {dueLabel && (
            <div className={clsx(
              'flex items-center space-x-1',
              isOverdue ? 'text-red-600' : 'text-gray-500'
            )}>
              <Calendar className="w-3 h-3" />
              <span className={isOverdue ? 'font-medium' : ''}>{dueLabel}</span>
              {isOverdue && <AlertCircle className="w-3 h-3" />}
            </div>
          )}

          {/* Comments */}
          {task.commentCount > 0 && (
            <div className="flex items-center space-x-1">
              <MessageCircle className="w-3 h-3" />
              <span>{task.commentCount}</span>
            </div>
          )}

          {/* Links - if task has attachments */}
          <div className="flex items-center space-x-1 opacity-60">
            <LinkIcon className="w-3 h-3" />
            <span>0</span>
          </div>
        </div>

        {/* Assignee */}
        <div className="flex items-center space-x-1">
          {task.assignee ? (
            <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-medium">
                {task.assignee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
          ) : (
            <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-400 text-xs">?</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Indicator for In Progress Tasks */}
      {task.status === 'in_progress' && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>2/5</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div className="bg-blue-500 h-1 rounded-full" style={{ width: '40%' }} />
          </div>
        </div>
      )}
    </div>
  );
};