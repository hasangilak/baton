import React from 'react';

interface Todo { id: string; content: string; status: 'pending' | 'in_progress' | 'completed'; }
interface Props { todos: Todo[]; }

export const TodoWriteTimeline: React.FC<Props> = ({ todos }) => {
  if (!todos?.length) return null;
  return (
    <div className="rounded-lg border border-[#2C2D30] bg-[#1B1C1F]/60 p-2.5">
      <ul className="relative ml-3 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-gray-800">
        {todos.map((t, i) => (
          <li key={t.id} className="relative pl-3 py-0.5 text-xs">
            <span className={`absolute -left-[5px] top-2 h-1.5 w-1.5 rounded-full ${t.status === 'completed' ? 'bg-emerald-500/70' : t.status === 'in_progress' ? 'bg-sky-400' : 'bg-amber-400'}`} />
            <span className="text-gray-500 mr-2">Step {i + 1}</span>
            <span className={t.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-200'}>{t.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TodoWriteTimeline;
