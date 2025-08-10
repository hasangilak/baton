/**
 * Simplified Permission Prompt Component
 * 
 * Replaces the complex 268-line InteractivePrompt with a clean, focused implementation
 * Uses the new event bus system for communication
 */

import React, { useState, useCallback } from 'react';
import { Shield, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { chatEventBus } from '../../../services/chat/eventBus';

interface PermissionOption {
  id: string;
  label: string;
  value?: string;
  isDefault?: boolean;
  isRecommended?: boolean;
}

interface PermissionPromptData {
  id: string;
  type: 'tool_permission' | 'permission' | 'tool_usage';
  title?: string;
  message: string;
  options: PermissionOption[];
  status: 'pending' | 'responded' | 'timeout';
  context?: {
    toolName?: string;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    usageCount?: number;
    projectPath?: string;
    parameters?: string;
  };
  conversationId: string;
  timestamp?: number;
}

interface SimplePermissionPromptProps {
  prompt: PermissionPromptData;
  isResponding?: boolean;
  onResponse?: (promptId: string, optionId: string) => void;
}

// Risk level styling
const riskStyles = {
  LOW: { 
    badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: 'text-green-400',
    border: 'border-green-500/40'
  },
  MEDIUM: { 
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: 'text-yellow-400',
    border: 'border-yellow-500/40'
  },
  HIGH: { 
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: 'text-orange-400',
    border: 'border-orange-500/40'
  },
  CRITICAL: { 
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: 'text-red-400',
    border: 'border-red-500/40'
  }
};

export const SimplePermissionPrompt: React.FC<SimplePermissionPromptProps> = ({
  prompt,
  isResponding = false,
  onResponse
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Only show pending prompts
  if (prompt.status !== 'pending') return null;

  const riskLevel = prompt.context?.riskLevel || 'MEDIUM';
  const styles = riskStyles[riskLevel];
  const toolName = prompt.context?.toolName;

  const handleOptionSelect = useCallback((optionId: string) => {
    if (isResponding || selectedOption) return;
    
    setSelectedOption(optionId);
    
    // Call local handler
    if (onResponse) {
      onResponse(prompt.id, optionId);
    }
    
    // Emit event for other components
    chatEventBus.emit('permission:responded', {
      promptId: prompt.id,
      selectedOption: optionId,
      conversationId: prompt.conversationId
    });
  }, [isResponding, selectedOption, onResponse, prompt.id, prompt.conversationId]);

  return (
    <div 
      className={`my-3 rounded-lg bg-gray-900/50 border ${styles.border} overflow-hidden`}
      data-testid="permission-prompt"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/30">
        <Shield className={`w-4 h-4 ${styles.icon}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-200 text-sm">
              {prompt.title || 'Permission Required'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${styles.badge}`}>
              {riskLevel}
            </span>
            {toolName && (
              <span className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-0.5 rounded">
                {toolName}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-300 mt-1">{prompt.message}</p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded hover:bg-gray-800"
        >
          {showDetails ? 'Less' : 'More'}
        </button>
      </div>

      {/* Details */}
      {showDetails && prompt.context && (
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-950/30">
          <div className="space-y-2 text-xs">
            {prompt.context.usageCount !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">Usage Count:</span>
                <span className="text-gray-300">{prompt.context.usageCount}</span>
              </div>
            )}
            {prompt.context.projectPath && (
              <div className="flex justify-between">
                <span className="text-gray-500">Path:</span>
                <span className="text-gray-300 font-mono truncate max-w-xs">
                  {prompt.context.projectPath}
                </span>
              </div>
            )}
            {prompt.context.parameters && (
              <div>
                <div className="text-gray-500 mb-1">Parameters:</div>
                <pre className="text-gray-300 bg-black/30 p-2 rounded text-xs overflow-auto max-h-32">
                  {prompt.context.parameters}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Options */}
      <div className="flex flex-wrap gap-2 p-4 bg-gray-950/20">
        {prompt.options.map((option) => {
          const isSelected = selectedOption === option.id;
          const isAllow = /allow|yes/i.test(option.label);
          const isDeny = /deny|no/i.test(option.label);
          
          return (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option.id)}
              disabled={isResponding || selectedOption !== null}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                transition-all duration-200 disabled:opacity-50
                ${isSelected 
                  ? 'bg-blue-600 text-white border border-blue-500' 
                  : 'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700'
                }
                ${isAllow && !isSelected ? 'hover:bg-green-800/50 hover:border-green-600' : ''}
                ${isDeny && !isSelected ? 'hover:bg-red-800/50 hover:border-red-600' : ''}
              `}
              data-testid={`permission-option-${option.id}`}
            >
              {isSelected && isResponding && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSelected && !isResponding && <CheckCircle2 className="w-4 h-4" />}
              
              <span className="text-xs text-gray-500 font-mono">{option.id}</span>
              <span>{option.label}</span>
              
              {option.isRecommended && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
              {option.isDefault && !option.isRecommended && (
                <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded">
                  Default
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-950/30 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Waiting for response...</span>
        </div>
        
        {selectedOption && (
          <div className="flex items-center gap-2 text-xs">
            {isResponding ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                <span className="text-blue-400">Sending...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-green-400">Response sent</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Export both names for compatibility
export const PermissionPrompt = SimplePermissionPrompt;
export default SimplePermissionPrompt;