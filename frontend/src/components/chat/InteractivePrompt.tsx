import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Tool,
  User,
  Bot,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import type { InteractivePrompt, PromptOption } from '../../types';
import { Button } from '@/components/ui/button';

interface InteractivePromptProps {
  prompt: InteractivePrompt;
  onOptionSelect: (promptId: string, optionId: string) => void;
  isResponding?: boolean;
}

const promptTypeIcons = {
  permission: User,
  tool_usage: Tool,
  multiple_choice: FileText,
  three_option: FileText,
  file_selection: FileText,
};

const promptTypeColors = {
  permission: 'text-blue-600 bg-blue-50 border-blue-200',
  tool_usage: 'text-purple-600 bg-purple-50 border-purple-200',
  multiple_choice: 'text-green-600 bg-green-50 border-green-200',
  three_option: 'text-green-600 bg-green-50 border-green-200',
  file_selection: 'text-yellow-600 bg-yellow-50 border-yellow-200',
};

const getOptionButtonVariant = (option: PromptOption) => {
  if (option.isRecommended) {
    return 'default'; // Primary blue button for recommended options
  }
  if (option.isDefault) {
    return 'secondary'; // Secondary button for default options
  }
  return 'outline'; // Outline button for regular options
};

const getOptionButtonIcon = (option: PromptOption) => {
  if (option.value === 'yes' || option.value === 'yes_dont_ask') {
    return <CheckCircle2 className="w-4 h-4" />;
  }
  if (option.value === 'no' || option.value === 'no_explain') {
    return <AlertCircle className="w-4 h-4" />;
  }
  return null;
};

export const InteractivePrompt: React.FC<InteractivePromptProps> = ({
  prompt,
  onOptionSelect,
  isResponding = false
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (prompt.status !== 'pending') {
    return null; // Don't show non-pending prompts
  }

  const PromptIcon = promptTypeIcons[prompt.type] || AlertCircle;

  const handleOptionClick = (optionId: string) => {
    if (isResponding || selectedOption) return;
    
    setSelectedOption(optionId);
    onOptionSelect(prompt.id, optionId);
  };

  const formatPromptMessage = (message: string) => {
    // For tool usage prompts, extract the tool name for a cleaner display
    if (prompt.type === 'tool_usage' && prompt.context?.toolName) {
      return `Allow ${prompt.context.toolName} to run?`;
    }
    
    // For other prompts, show the full message but limit length
    if (message.length > 200) {
      return message.substring(0, 200) + '...';
    }
    
    return message;
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-3">
      {/* Header */}
      <div className="flex items-start space-x-3 mb-3">
        <div className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-lg border',
          promptTypeColors[prompt.type]
        )}>
          <PromptIcon className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <Bot className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              Claude Code needs your permission
            </span>
            {prompt.title && (
              <span className={clsx(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                promptTypeColors[prompt.type]
              )}>
                {prompt.title}
              </span>
            )}
          </div>
          
          <p className="text-sm text-gray-800 leading-relaxed">
            {formatPromptMessage(prompt.message)}
          </p>
          
          {/* Context info for tool usage */}
          {prompt.type === 'tool_usage' && prompt.context?.toolName && (
            <div className="mt-2 text-xs text-gray-600 bg-white rounded px-2 py-1 border">
              <strong>Tool:</strong> {prompt.context.toolName}
              {prompt.context.projectPath && (
                <>
                  <br />
                  <strong>Location:</strong> {prompt.context.projectPath}
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="text-xs text-gray-500 flex items-center space-x-1">
          <Clock className="w-3 h-3" />
          <span>30s timeout</span>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {prompt.options.map((option, index) => {
          const isSelected = selectedOption === option.id;
          const ButtonIcon = getOptionButtonIcon(option);
          
          return (
            <Button
              key={option.id}
              variant={getOptionButtonVariant(option)}
              size="sm"
              onClick={() => handleOptionClick(option.id)}
              disabled={isResponding || selectedOption !== null}
              className={clsx(
                'w-full justify-start text-left h-auto py-2 px-3',
                isSelected && 'ring-2 ring-blue-500 ring-offset-1',
                option.isRecommended && 'shadow-md border-blue-300',
                // Special styling for tool usage options
                prompt.type === 'tool_usage' && index === 0 && 'border-green-300 hover:border-green-400',
                prompt.type === 'tool_usage' && index === 1 && 'border-blue-300 hover:border-blue-400',
                prompt.type === 'tool_usage' && index === 2 && 'border-red-300 hover:border-red-400'
              )}
            >
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-gray-500 min-w-[1.5rem]">
                  {option.id}.
                </span>
                
                {ButtonIcon}
                
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">
                    {option.label}
                  </span>
                  
                  {/* Show additional context for specific option types */}
                  {option.isRecommended && (
                    <span className="text-xs text-blue-600 block">Recommended</span>
                  )}
                  
                  {option.isDefault && !option.isRecommended && (
                    <span className="text-xs text-gray-500 block">Default</span>
                  )}
                </div>
                
                {isSelected && isResponding && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                )}
                
                {isSelected && !isResponding && (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
              </div>
            </Button>
          );
        })}
      </div>
      
      {/* Status message */}
      {selectedOption && (
        <div className="mt-3 text-xs text-gray-600 flex items-center space-x-1">
          {isResponding ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Sending response to Claude Code...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              <span>Response sent! Claude Code will continue...</span>
            </>
          )}
        </div>
      )}
      
      {/* Auto-timeout warning */}
      <div className="mt-3 text-xs text-amber-700 bg-amber-100 rounded px-2 py-1">
        <AlertCircle className="w-3 h-3 inline mr-1" />
        This prompt will timeout in 30 seconds if no option is selected.
      </div>
    </div>
  );
};