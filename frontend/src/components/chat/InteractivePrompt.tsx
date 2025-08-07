import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Settings,
  User,
  Bot,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  Timer,
  Zap
} from 'lucide-react';
import clsx from 'clsx';
import type { InteractivePrompt, PromptOption } from '../../types';
import { Button } from '@/components/ui/button';

interface InteractivePromptComponentProps {
  prompt: InteractivePrompt;
  onOptionSelect: (promptId: string, optionId: string) => void;
  isResponding?: boolean;
}

const promptTypeIcons = {
  permission: User,
  tool_usage: Settings,
  tool_permission: Settings,
  multiple_choice: FileText,
  three_option: FileText,
  file_selection: FileText,
};

const promptTypeColors = {
  permission: 'text-blue-600 bg-blue-50 border-blue-200',
  tool_usage: 'text-purple-600 bg-purple-50 border-purple-200',
  tool_permission: 'text-orange-600 bg-orange-50 border-orange-200',
  multiple_choice: 'text-green-600 bg-green-50 border-green-200',
  three_option: 'text-green-600 bg-green-50 border-green-200',
  file_selection: 'text-yellow-600 bg-yellow-50 border-yellow-200',
};

const riskLevelColors = {
  LOW: 'text-green-600 bg-green-50 border-green-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200', 
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  CRITICAL: 'text-red-600 bg-red-50 border-red-200',
};

const riskLevelIcons = {
  LOW: ShieldCheck,
  MEDIUM: Shield,
  HIGH: ShieldAlert,
  CRITICAL: AlertCircle,
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

export const InteractivePromptComponent: React.FC<InteractivePromptComponentProps> = ({
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
    
    // For tool permission prompts, show a cleaner format
    if (prompt.type === 'tool_permission' && prompt.context?.toolName) {
      return `Allow Claude Code to use the ${prompt.context.toolName} tool?`;
    }
    
    // For other prompts, show the full message but limit length
    if (message.length > 200) {
      return message.substring(0, 200) + '...';
    }
    
    return message;
  };

  // Extract enhanced context data
  const riskLevel = (prompt.context as any)?.riskLevel || 'MEDIUM';
  const toolName = (prompt.context as any)?.toolName;
  const usageCount = (prompt.context as any)?.usageCount || 0;
  const usageStatistics = (prompt as any).usageStatistics;
  const timestamp = (prompt as any).timestamp;
  
  const RiskIcon = riskLevelIcons[riskLevel as keyof typeof riskLevelIcons] || Shield;
  const riskColors = riskLevelColors[riskLevel as keyof typeof riskLevelColors] || riskLevelColors.MEDIUM;

  // Dynamic background based on risk level
  const containerBg = riskLevel === 'CRITICAL' ? 'bg-red-50 border-red-200' :
                      riskLevel === 'HIGH' ? 'bg-orange-50 border-orange-200' :
                      riskLevel === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200';

  return (
    <div className={clsx("rounded-lg p-4 my-3", containerBg)} data-testid="permission-prompt-container">
      {/* Enhanced Header with Risk Analysis */}
      <div className="flex items-start space-x-3 mb-3">
        <div className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-lg border',
          promptTypeColors[prompt.type]
        )}>
          <PromptIcon className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-2">
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

          {/* Risk Level Indicator */}
          <div className="flex items-center space-x-2 mb-2">
            <div className={clsx(
              'flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium border',
              riskColors
            )}>
              <RiskIcon className="w-3 h-3" />
              <span>{riskLevel} RISK</span>
            </div>
            
            {/* Usage Statistics */}
            {usageCount > 0 && (
              <div className="flex items-center space-x-1 px-2 py-1 rounded-md text-xs bg-gray-100 border border-gray-200">
                <BarChart3 className="w-3 h-3 text-gray-500" />
                <span className="text-gray-600">Used {usageCount} times</span>
              </div>
            )}

            {/* Recommended Action Badge */}
            {usageStatistics?.recommendedAction && (
              <div className={clsx(
                'flex items-center space-x-1 px-2 py-1 rounded-md text-xs border',
                usageStatistics.recommendedAction === 'auto_allow' 
                  ? 'bg-green-100 border-green-200 text-green-700'
                  : 'bg-yellow-100 border-yellow-200 text-yellow-700'
              )}>
                <Zap className="w-3 h-3" />
                <span>
                  {usageStatistics.recommendedAction === 'auto_allow' ? 'Low Risk' : 'Review Needed'}
                </span>
              </div>
            )}
          </div>
          
          <p className="text-sm text-gray-800 leading-relaxed">
            {formatPromptMessage(prompt.message)}
          </p>
          
          {/* Enhanced Context Info */}
          {(prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && toolName && (
            <div className="mt-3 text-xs text-gray-700 bg-white rounded-lg px-3 py-2 border shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Settings className="w-3 h-3 text-gray-400" />
                  <span><strong>Tool:</strong> {toolName}</span>
                </div>
                
                {usageCount > 0 && (
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-3 h-3 text-gray-400" />
                    <span><strong>Usage:</strong> {usageCount} times</span>
                  </div>
                )}
              </div>

              {(prompt.context as any)?.projectPath && (
                <div className="mt-1 flex items-center space-x-2">
                  <FileText className="w-3 h-3 text-gray-400" />
                  <span><strong>Location:</strong> {(prompt.context as any).projectPath}</span>
                </div>
              )}

              {(prompt.context as any)?.parameters && (
                <div className="mt-2 p-2 bg-gray-50 rounded border text-xs font-mono">
                  <div className="text-gray-500 mb-1">Parameters:</div>
                  <div className="text-gray-700 max-h-20 overflow-y-auto">
                    {(prompt.context as any).parameters.length > 200 
                      ? (prompt.context as any).parameters.substring(0, 200) + '...'
                      : (prompt.context as any).parameters
                    }
                  </div>
                </div>
              )}

              {(prompt.context as any)?.originalContext && (
                <div className="mt-2 flex items-start space-x-2">
                  <AlertCircle className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Context:</strong> {(prompt.context as any).originalContext}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>30s timeout</span>
          </div>
          {timestamp && (
            <div className="flex items-center space-x-1">
              <Timer className="w-3 h-3" />
              <span>
                {new Date(timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
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
              data-testid={`permission-option-${option.id}`}
              data-testid-semantic={
                option.value === 'allow_once' || option.label?.toLowerCase().includes('once') ? 'permission-allow-once' :
                option.value === 'allow_always' || option.label?.toLowerCase().includes('always') || option.label?.toLowerCase().includes("don't ask") ? 'permission-allow-always' :
                option.value === 'deny' || option.label?.toLowerCase().includes('deny') || option.label?.toLowerCase().includes('no') ? 'permission-deny' :
                `permission-option-${option.id}`
              }
              className={clsx(
                'w-full justify-start text-left h-auto py-2 px-3',
                isSelected && 'ring-2 ring-blue-500 ring-offset-1',
                option.isRecommended && 'shadow-md border-blue-300',
                // Special styling for tool usage options
                (prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && index === 0 && 'border-green-300 hover:border-green-400',
                (prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && index === 1 && 'border-blue-300 hover:border-blue-400',
                (prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && index === 2 && 'border-red-300 hover:border-red-400'
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