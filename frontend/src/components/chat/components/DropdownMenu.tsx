import React, { useState } from 'react';
import { Archive, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Conversation } from '../../../types';

interface Props { conversation: Conversation; onArchive: () => void; onDelete: () => void }

export const DropdownMenu: React.FC<Props> = ({ onArchive, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setIsOpen(o => !o); }} className="p-1 hover:bg-[#3E3E42] rounded transition-colors">
        <MoreHorizontal className="w-4 h-4 text-gray-400" />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-[#3E3E42] border border-[#565658] rounded-lg shadow-lg z-10">
          <button onClick={e => { e.stopPropagation(); onArchive(); setIsOpen(false); }} className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2D2D30] transition-colors flex items-center space-x-2">
            <Archive className="w-4 h-4" />
            <span>Archive</span>
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); setIsOpen(false); }} className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[#2D2D30] transition-colors flex items-center space-x-2">
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};
