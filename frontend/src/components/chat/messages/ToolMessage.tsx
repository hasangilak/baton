/**
 * Tool Message Component - Advanced tool execution visualization
 * 
 * Features:
 * - Real-time execution status
 * - Parameter preview with syntax highlighting
 * - Collapsible detailed view
 * - Performance metrics display
 * - Error handling with retry capabilities
 */

import React, { useState, useMemo } from 'react';
import { 
  Terminal, 
  Globe, 
  Search, 
  FileText, 
  Settings, 
  Play,
  CheckCircle, 
  XCircle, 
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';
import type { StreamingToolMessage as ToolMessageType } from '../../../types';

interface ToolMessageProps {
  message: ToolMessageType & { metadata?: any }; // Allow enhanced messages with metadata
  isStreaming?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showTimestamp?: boolean;
  compact?: boolean;
}

/**
 * Tool icon mapping based on tool name
 */
const getToolIcon = (toolName: string) => {
  const name = toolName.toLowerCase();
  if (name.includes('websearch') || name.includes('search')) return Globe;
  if (name.includes('bash') || name.includes('terminal')) return Terminal;
  if (name.includes('grep') || name.includes('find')) return Search;
  if (name.includes('read') || name.includes('file')) return FileText;
  return Settings;
};

/**
 * Tool status color mapping
 */
const getStatusConfig = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'running':
    case 'executing':
      return {
        icon: Play,
        color: 'text-blue-400',
        bg: 'bg-blue-900/20',
        border: 'border-blue-700',
        label: 'Running'
      };
    case 'done':
    case 'completed':
    case 'success':
      return {
        icon: CheckCircle,
        color: 'text-green-400',
        bg: 'bg-green-900/20',
        border: 'border-green-700',
        label: 'Done'
      };
    case 'failed':
    case 'error':
      return {
        icon: XCircle,
        color: 'text-red-400',
        bg: 'bg-red-900/20',
        border: 'border-red-700',
        label: 'Failed'
      };
    case 'pending':
    case 'waiting':
      return {
        icon: Clock,
        color: 'text-yellow-400',
        bg: 'bg-yellow-900/20',
        border: 'border-yellow-700',
        label: 'Pending'
      };
    default:
      return {
        icon: Settings,
        color: 'text-gray-400',
        bg: 'bg-gray-900/20',
        border: 'border-gray-700',
        label: 'Unknown'
      };
  }
};

/**
 * Parameter formatter with smart truncation
 */
const formatParameters = (input: Record<string, any>, maxLength: number = 200) => {
  try {
    const jsonString = JSON.stringify(input, null, 2);
    if (jsonString.length <= maxLength) {
      return jsonString;
    }
    return JSON.stringify(input) + ' // Truncated - click to expand';
  } catch {
    return String(input);
  }
};

/**
 * Risk level assessment based on tool name and parameters
 */
const assessRiskLevel = (toolName: string, input: any): 'low' | 'medium' | 'high' => {
  const dangerousTools = ['bash', 'write', 'edit', 'multiedit', 'delete'];
  const moderateTools = ['websearch', 'webfetch', 'notebookedit'];
  
  const name = toolName.toLowerCase();
  
  if (dangerousTools.some(tool => name.includes(tool))) {
    // Check for dangerous parameters
    const inputStr = JSON.stringify(input).toLowerCase();
    if (inputStr.includes('rm ') || inputStr.includes('delete') || inputStr.includes('format')) {
      return 'high';
    }
    return 'medium';
  }
  
  if (moderateTools.some(tool => name.includes(tool))) {
    return 'medium';
  }
  
  return 'low';
};

export const ToolMessageComponent: React.FC<ToolMessageProps> = ({
  message,
  isStreaming = false,
  onCopy,
  onRetry,
  showTimestamp = true,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Extract tool information from metadata (ChatPage streaming) or direct message properties
  const toolName = message.metadata?.toolName || message.name || 'Unknown Tool';
  const toolInput = message.metadata?.toolInput || message.input || {};
  const toolId = message.id || `tool_${Date.now()}`;
  const timestamp = message.timestamp || Date.now();
  
  // Extract status from message or infer from streaming state
  const status = (message as any).status || (isStreaming ? 'running' : 'completed');
  
  const ToolIcon = getToolIcon(toolName);
  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;
  
  // Risk assessment
  const riskLevel = useMemo(() => assessRiskLevel(toolName, toolInput), [toolName, toolInput]);
  
  // Parameter preview
  const parameterPreview = useMemo(() => {
    if (!toolInput || Object.keys(toolInput).length === 0) {
      return 'No parameters';
    }
    return formatParameters(toolInput, 100);
  }, [toolInput]);

  const handleCopy = async () => {
    try {
      const content = JSON.stringify({ tool: toolName, input: toolInput }, null, 2);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, toolId);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Compact view
  if (compact && !isExpanded) {
    return (
      <div 
        className={`flex items-center gap-3 p-2 rounded border ${statusConfig.bg} ${statusConfig.border} cursor-pointer hover:bg-opacity-80`}
        onClick={() => setIsExpanded(true)}
      >
        <ToolIcon size={16} className={statusConfig.color} />
        <span className="text-sm font-medium text-gray-200">{toolName}</span>
        <span className={`text-xs px-2 py-1 rounded ${statusConfig.color}`}>
          {statusConfig.label.toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${statusConfig.bg} ${statusConfig.border} transition-all hover:bg-opacity-80`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusConfig.bg}`}>
          <ToolIcon size={18} className={statusConfig.color} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-200">{toolName}</span>
            
            {/* Risk indicator */}
            {riskLevel === 'high' && (
              <AlertTriangle size={14} className="text-red-400" />
            )}
            
            {/* Status badge */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${statusConfig.bg} ${statusConfig.border}`}>
              <StatusIcon size={12} className={statusConfig.color} />
              <span className={`text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.label.toUpperCase()}
              </span>
            </div>
          </div>
          
          {showTimestamp && (
            <div className="text-xs text-gray-500 mt-1">
              {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
            </div>
          )}
        </div>

        {/* Expand/Collapse button */}
        <Button
          size="sm"
          variant="ghost"
          className="text-gray-400 hover:text-gray-200 h-6 w-6 p-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
      </div>

      {/* Parameter preview (always visible) */}
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-400 mb-1">Arguments</div>
        <div className="bg-gray-900 rounded p-2 font-mono text-xs text-gray-300">
          {parameterPreview}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="space-y-3 border-t border-gray-700 pt-3">
          {/* Full parameters */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-2">Full Parameters</div>
            <div className="bg-gray-900 rounded p-3 font-mono text-xs text-gray-300 max-h-40 overflow-auto">
              <pre>{JSON.stringify(toolInput, null, 2)}</pre>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400">Tool ID:</span>
              <span className="text-gray-300 ml-2 font-mono">{toolId}</span>
            </div>
            <div>
              <span className="text-gray-400">Risk Level:</span>
              <span className={`ml-2 font-medium ${
                riskLevel === 'high' ? 'text-red-400' : 
                riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {riskLevel.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-gray-200 h-7 px-2"
              onClick={handleCopy}
            >
              <Copy size={12} className="mr-1" />
              {copied ? 'Copied' : 'Copy'}
            </Button>
            
            {onRetry && status === 'failed' && (
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-400 hover:text-gray-200 h-7 px-2"
                onClick={() => onRetry?.(toolId)}
              >
                <Play size={12} className="mr-1" />
                Retry
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolMessageComponent;