import React from 'react';

export const ActionButton: React.FC<{ icon: React.ElementType; label: string; testId?: string }> = ({ icon: Icon, label, testId }) => (
  <button
    className="flex items-center space-x-2 px-3.5 py-1.5 border border-[#303134] rounded-md hover:bg-[#26272A] bg-[#202123] transition-colors shadow-sm text-gray-300 text-sm"
    data-testid={testId}
  >
    <Icon className="w-4 h-4 text-[#9A9B9E]" />
    <span className="leading-none">{label}</span>
  </button>
);
