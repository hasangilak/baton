import React from 'react';

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  testId?: string;
  onClick?: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ 
  icon: Icon, 
  label, 
  testId, 
  onClick 
}) => {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="flex items-center space-x-2 px-3 py-2 bg-[#2D2D30] hover:bg-[#252526] rounded-lg transition-colors text-sm text-[#8B8B8D] hover:text-[#E5E5E5]"
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
};