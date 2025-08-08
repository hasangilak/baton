/**
 * System Message Component - Internal system communications
 * 
 * Handles system messages, initialization, status updates, and metadata display
 */

import React, { useState } from 'react';
import { Settings, Info, AlertCircle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';
import type { StreamingSystemMessage } from '../../../types';

interface SystemMessageProps {
  message: StreamingSystemMessage;
  showTimestamp?: boolean;
  compact?: boolean;
}

const getSystemTypeConfig = (subtype?: string) => {
  switch (subtype) {
    case 'sdk_system':
    case 'initialization':
      return {
        icon: Settings,
        color: 'text-blue-400',
        bg: 'bg-blue-900/10',
        border: 'border-blue-800/50',
        label: 'System'
      };
    case 'completion':
    case 'success':
      return {
        icon: CheckCircle,
        color: 'text-green-400',
        bg: 'bg-green-900/10',
        border: 'border-green-800/50',
        label: 'Completed'
      };
    case 'stream_error':
    case 'processing_error':
    case 'parse_error':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bg: 'bg-red-900/10',
        border: 'border-red-800/50',
        label: 'Error'
      };
    default:
      return {
        icon: Info,
        color: 'text-gray-400',
        bg: 'bg-gray-900/10',
        border: 'border-gray-700/50',
        label: 'Info'
      };
  }
};

export const SystemMessageComponent: React.FC<SystemMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const config = getSystemTypeConfig(message.subtype);
  const Icon = config.icon;
  const timestamp = message.timestamp || Date.now();
  const hasData = message.data && Object.keys(message.data).length > 0;

  // Compact view
  if (compact && !isExpanded) {
    return (
      <div 
        className={`flex items-center gap-2 p-2 rounded border ${config.bg} ${config.border} cursor-pointer`}
        onClick={() => setIsExpanded(true)}
      >
        <Icon size={14} className={config.color} />
        <span className="text-xs text-gray-400">{config.label}</span>
        <span className="text-xs text-gray-500 flex-1 truncate">{message.message}</span>
      </div>
    );
  }

  return (
    <div className={`rounded border p-3 ${config.bg} ${config.border} transition-colors`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-6 h-6 rounded flex items-center justify-center ${config.bg} flex-shrink-0 mt-0.5`}>
          <Icon size={14} className={config.color} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
            
            {showTimestamp && (
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
              </span>
            )}

            {message.subtype && (
              <span className="text-xs text-gray-600 bg-gray-700 px-2 py-0.5 rounded">
                {message.subtype}
              </span>
            )}

            {/* Expand button if has data */}
            {hasData && (
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-400 hover:text-gray-200 h-5 w-5 p-0 ml-auto"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </Button>
            )}
          </div>

          {/* Message content */}
          <div className="text-sm text-gray-300">
            {message.message}
          </div>

          {/* Expanded data view */}
          {isExpanded && hasData && (
            <div className="mt-3 border-t border-gray-700 pt-3">
              <div className="text-xs font-medium text-gray-400 mb-2">System Data</div>
              <div className="bg-gray-900 rounded p-2 max-h-40 overflow-auto">
                <pre className="text-xs text-gray-300 font-mono">
                  {JSON.stringify(message.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemMessageComponent;