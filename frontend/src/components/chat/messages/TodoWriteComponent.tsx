import React from 'react';
import { CheckCircle, Clock, Play, Circle } from 'lucide-react';

interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoWriteComponentProps {
  todos: Todo[];
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return { icon: CheckCircle, color: 'text-green-400' };
    case 'in_progress': return { icon: Play, color: 'text-blue-400' };
    default: return { icon: Clock, color: 'text-yellow-400' };
  }
};

export const TodoWriteComponent: React.FC<TodoWriteComponentProps> = ({ todos }) => {
  if (!todos?.length) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm p-2 bg-gray-900/30 rounded">
        <Circle size={14} />
        No todos
      </div>
    );
  }

  const completed = todos.filter(t => t.status === 'completed').length;
  const progress = Math.round((completed / todos.length) * 100);

  return (
    <div className="bg-gray-900/40 rounded border border-gray-800 p-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300">Todos ({todos.length})</span>
        <span className="text-green-400 text-xs">{progress}%</span>
      </div>
      
      {/* Progress */}
      <div className="w-full bg-gray-800 rounded-full h-1">
        <div 
          className="bg-green-500 h-1 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {todos.map((todo) => {
          const { icon: StatusIcon, color } = getStatusIcon(todo.status);
          return (
            <div key={todo.id} className="flex items-start gap-2 text-sm">
              <StatusIcon size={14} className={`${color} mt-0.5 flex-shrink-0`} />
              <span className={todo.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-200'}>
                {todo.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodoWriteComponent;