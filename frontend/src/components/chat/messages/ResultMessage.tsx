/**
 * Result Message Component - Final execution results and metadata
 * 
 * Displays completion metrics, performance data, and execution summaries
 */

import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Hash, 
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Copy,
  BarChart3
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';

interface ResultMessageProps {
  message: any;
  showTimestamp?: boolean;
  compact?: boolean;
  onCopy?: (content: string, messageId: string) => void;
}

/**
 * Parse execution metadata from result message
 */
const parseMetadata = (message: any) => {
  let duration, cost, tokens, model;
  
  // Try to extract from message content
  if (message.message || message.content) {
    const content = message.message || message.content;
    
    // Extract duration (Duration: 2763ms)
    const durationMatch = content.match(/Duration:\s*(\d+(?:\.\d+)?)\s*ms/);
    if (durationMatch) {
      duration = parseFloat(durationMatch[1]);
    }
    
    // Extract cost (Cost: $0.0918)
    const costMatch = content.match(/Cost:\s*\$(\d+(?:\.\d+)?)/);
    if (costMatch) {
      cost = parseFloat(costMatch[1]);
    }
    
    // Extract tokens (Tokens: 23 output)
    const tokensMatch = content.match(/Tokens:\s*(\d+)/);
    if (tokensMatch) {
      tokens = parseInt(tokensMatch[1]);
    }
  }
  
  // Try to extract from data object
  if (message.data) {
    const data = message.data;
    duration = duration || data.duration || data.executionTime;
    cost = cost || data.cost || data.price;
    tokens = tokens || data.tokens || data.tokenCount;
    model = data.model;
  }
  
  return { duration, cost, tokens, model };
};

/**
 * Format duration with appropriate units
 */
const formatDuration = (ms?: number): string => {
  if (!ms) return 'Unknown';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

/**
 * Format cost with currency
 */
const formatCost = (cost?: number): string => {
  if (cost === undefined || cost === null) return 'Free';
  return `$${cost.toFixed(4)}`;
};

/**
 * Performance indicator based on duration
 */
const getPerformanceIndicator = (duration?: number) => {
  if (!duration) return { color: 'text-gray-400', label: 'Unknown' };
  if (duration < 1000) return { color: 'text-green-400', label: 'Excellent' };
  if (duration < 5000) return { color: 'text-green-400', label: 'Good' };
  if (duration < 15000) return { color: 'text-yellow-400', label: 'Fair' };
  return { color: 'text-red-400', label: 'Slow' };
};

export const ResultMessage: React.FC<ResultMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false,
  onCopy,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { duration, cost, tokens, model } = parseMetadata(message);
  const performance = getPerformanceIndicator(duration);
  const timestamp = message.timestamp || message.createdAt || Date.now();
  const messageId = message.id || `result_${Date.now()}`;

  const handleCopy = async () => {
    try {
      const content = JSON.stringify({
        result: message.message || message.content,
        metadata: { duration, cost, tokens, model },
        timestamp: new Date(timestamp).toISOString()
      }, null, 2);
      
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, messageId);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Compact view
  if (compact && !isExpanded) {
    return (
      <div 
        className="flex items-center gap-2 p-2 bg-green-900/10 border border-green-800/50 rounded cursor-pointer"
        onClick={() => setIsExpanded(true)}
      >
        <CheckCircle2 size={14} className="text-green-400" />
        <span className="text-xs text-green-400 font-medium">RESULT</span>
        {duration && (
          <span className="text-xs text-gray-500">{formatDuration(duration)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-green-900/10 border border-green-800/50 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-green-900/20 flex items-center justify-center">
          <CheckCircle2 size={18} className="text-green-400" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-green-400">Execution Complete</span>
            <span className={`text-xs px-2 py-1 rounded ${performance.color} bg-current bg-opacity-20`}>
              {performance.label}
            </span>
          </div>
          
          {showTimestamp && (
            <div className="text-xs text-gray-500 mt-1">
              {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="text-gray-400 hover:text-gray-200 h-6 w-6 p-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        {/* Duration */}
        {duration && (
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">Duration</div>
              <div className={`text-sm font-medium ${performance.color}`}>
                {formatDuration(duration)}
              </div>
            </div>
          </div>
        )}

        {/* Cost */}
        {cost !== undefined && (
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">Cost</div>
              <div className="text-sm font-medium text-gray-300">
                {formatCost(cost)}
              </div>
            </div>
          </div>
        )}

        {/* Tokens */}
        {tokens && (
          <div className="flex items-center gap-2">
            <Hash size={14} className="text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">Tokens</div>
              <div className="text-sm font-medium text-gray-300">
                {tokens.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Performance Score */}
        {duration && (
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">Performance</div>
              <div className={`text-sm font-medium ${performance.color}`}>
                {performance.label}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Result content preview */}
      <div className="bg-gray-900/50 rounded p-3 mb-3">
        <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
          <BarChart3 size={12} />
          Result Summary
        </div>
        <div className="text-sm text-gray-300 font-mono">
          {(message.message || message.content || '').substring(0, 200)}
          {(message.message || message.content || '').length > 200 && '...'}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-green-800/30 pt-3 space-y-3">
          {/* Full result */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-2">Complete Result</div>
            <div className="bg-gray-900 rounded p-3 max-h-40 overflow-auto">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {message.message || message.content || 'No content'}
              </pre>
            </div>
          </div>

          {/* Raw data if available */}
          {message.data && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2">Raw Data</div>
              <div className="bg-gray-900 rounded p-3 max-h-32 overflow-auto">
                <pre className="text-xs text-gray-300 font-mono">
                  {JSON.stringify(message.data, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-gray-200 h-7 px-2"
              onClick={handleCopy}
            >
              <Copy size={12} className="mr-1" />
              {copied ? 'Copied' : 'Copy Result'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultMessage;