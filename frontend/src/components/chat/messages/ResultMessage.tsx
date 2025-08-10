/**
 * Result Message Component - Enhanced Claude SDK Result Integration
 * 
 * Linear minimal design with comprehensive support for Claude Code SDK result messages.
 * Handles execution results with detailed performance metrics, cost analysis,
 * token usage statistics, and error information.
 * 
 * Features:
 * - Claude Code SDK result message types (success, error_max_turns, error_during_execution)
 * - Performance metrics with duration and API timing
 * - Cost analysis and token usage breakdown
 * - Turn count and execution statistics
 * - Enhanced error handling with context
 * - Collapsible detailed view with raw SDK data
 */

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Hash,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Copy,
  BarChart3,
  AlertTriangle,
  XCircle,
  Zap,
  Activity,
  Timer,
  Target
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';

interface ResultMessageProps {
  message: any & {
    metadata?: {
      sdk?: {
        type: string;
        subtype?: 'success' | 'error_max_turns' | 'error_during_execution';
        duration?: number;
        cost?: number;
        tokens?: number;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
        isError?: boolean;
        numTurns?: number;
        sessionId?: string;
      };
      isWebSocket?: boolean;
      hasSDKData?: boolean;
    };
    // SDK-specific result fields
    data?: {
      duration?: number;
      duration_ms?: number;
      duration_api_ms?: number;
      cost?: number;
      total_cost_usd?: number;
      tokens?: number;
      usage?: any;
      isError?: boolean;
      is_error?: boolean;
      numTurns?: number;
      num_turns?: number;
      subtype?: string;
      result?: string;
    };
  };
  showTimestamp?: boolean;
  compact?: boolean;
  showMetadata?: boolean;
  realTimeUpdate?: boolean;
  onCopy?: (content: string, messageId: string) => void;
}

// Enhanced metadata extraction with SDK support
const extractMeta = (m: any) => {
  const content = m.message || m.content || '';
  const sdkData = m.metadata?.sdk || m.data || {};
  
  // Try SDK fields first, then legacy parsing
  const duration = sdkData.duration_ms || sdkData.duration || 
                   (content.match(/Duration:\s*(\d+(?:\.\d+)?)\s*ms/)?.[1] && Number(content.match(/Duration:\s*(\d+(?:\.\d+)?)\s*ms/)?.[1]));
  
  const durationApi = sdkData.duration_api_ms;
  
  const cost = sdkData.total_cost_usd || sdkData.cost || 
               (content.match(/Cost:\s*\$(\d+(?:\.\d+)?)/)?.[1] && Number(content.match(/Cost:\s*\$(\d+(?:\.\d+)?)/)?.[1]));
  
  const usage = sdkData.usage || {};
  const totalTokens = usage.input_tokens + usage.output_tokens || sdkData.tokens ||
                      (content.match(/Tokens:\s*(\d+)/)?.[1] && Number(content.match(/Tokens:\s*(\d+)/)?.[1]));
  
  return {
    duration,
    durationApi,
    cost,
    usage,
    totalTokens,
    numTurns: sdkData.num_turns || sdkData.numTurns,
    isError: sdkData.is_error || sdkData.isError,
    subtype: sdkData.subtype,
    sessionId: sdkData.session_id || sdkData.sessionId,
    result: sdkData.result || content,
    model: sdkData.model
  };
};

const fmtDuration = (ms?: number) => {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000); const s = Math.floor((ms % 60000) / 1000); return `${m}m ${s}s`;
};

const fmtCost = (c?: number) => (c === undefined || c === null) ? 'Free' : `$${c.toFixed(4)}`;

const perf = (d?: number) => {
  if (!d) return { color: 'text-gray-400', label: 'Unknown' };
  if (d < 1000) return { color: 'text-green-400', label: 'Excellent' };
  if (d < 5000) return { color: 'text-green-400', label: 'Good' };
  if (d < 15000) return { color: 'text-yellow-400', label: 'Fair' };
  return { color: 'text-red-400', label: 'Slow' };
};

// Enhanced result type configuration
const getResultConfig = (subtype?: string, isError?: boolean) => {
  if (isError || ['error_max_turns', 'error_during_execution'].includes(subtype || '')) {
    return {
      icon: XCircle,
      color: 'red',
      label: subtype === 'error_max_turns' ? 'Max Turns Reached' : 
             subtype === 'error_during_execution' ? 'Execution Error' : 'Error',
      description: 'Task failed to complete'
    };
  }
  
  return {
    icon: CheckCircle2,
    color: 'green', 
    label: 'SUCCESS',
    description: 'Task completed successfully'
  };
};

export const ResultMessage: React.FC<ResultMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false,
  showMetadata = false,
  realTimeUpdate = false,
  onCopy
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Enhanced metadata extraction
  const { 
    duration, 
    durationApi, 
    cost, 
    usage, 
    totalTokens, 
    numTurns, 
    isError, 
    subtype, 
    sessionId, 
    result, 
    model 
  } = useMemo(() => extractMeta(message), [message]);
  
  const performance = useMemo(() => perf(duration), [duration]);
  const resultConfig = useMemo(() => getResultConfig(subtype, isError), [subtype, isError]);
  
  const timestamp = message.timestamp || message.createdAt || Date.now();
  const messageId = message.id || `result_${Date.now()}`;
  const summaryText = result || message.content || message.message || '';
  const isWebSocketMessage = message.metadata?.isWebSocket;
  
  const ResultIcon = resultConfig.icon;

  const handleCopy = async () => {
    try {
      const content = JSON.stringify({
        result: summaryText,
        metadata: { 
          duration, 
          durationApi, 
          cost, 
          usage, 
          totalTokens, 
          numTurns,
          isError,
          subtype,
          sessionId,
          model, 
          performance: performance.label 
        },
        timestamp: new Date(timestamp).toISOString()
      }, null, 2);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, messageId);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const metricsInline = (
    <div className="flex items-center gap-3 text-[10px] text-gray-500">
      {/* Duration Metrics */}
      {duration !== undefined && (
        <span className="flex items-center gap-1">
          <Clock size={12} className="text-gray-400" />
          {fmtDuration(duration)}
          {durationApi && durationApi !== duration && (
            <span className="text-gray-600">({fmtDuration(durationApi)} API)</span>
          )}
        </span>
      )}
      
      {/* Cost */}
      {cost !== undefined && cost !== null && (
        <span className="flex items-center gap-1">
          <DollarSign size={12} className="text-gray-400" />
          {fmtCost(cost)}
        </span>
      )}
      
      {/* Token Usage */}
      {totalTokens !== undefined && totalTokens !== null && (
        <span className="flex items-center gap-1">
          <Hash size={12} className="text-gray-400" />
          {totalTokens.toLocaleString()}
          {usage && usage.input_tokens && usage.output_tokens && (
            <span className="text-gray-600">
              ({usage.input_tokens.toLocaleString()}→{usage.output_tokens.toLocaleString()})
            </span>
          )}
        </span>
      )}
      
      {/* Turn Count */}
      {numTurns !== undefined && (
        <span className="flex items-center gap-1">
          <Target size={12} className="text-gray-400" />
          {numTurns} turns
        </span>
      )}
      
      {/* Performance Rating */}
      {duration !== undefined && (
        <span className={`flex items-center gap-1 ${performance.color}`}>
          <TrendingUp size={12} />
          {performance.label}
        </span>
      )}
      
      {/* Real-time Indicator */}
      {realTimeUpdate && (
        <span className="flex items-center gap-1 text-green-400">
          <Activity size={12} className="animate-pulse" />
          Live
        </span>
      )}
    </div>
  );

  const row = (
    <div className="flex items-center gap-2">
      {/* Enhanced status icon */}
      <ResultIcon size={14} className={`text-${resultConfig.color}-400`} />
      
      {/* Enhanced label with status */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold text-${resultConfig.color}-300`}>
          {resultConfig.label}
        </span>
        
        {/* WebSocket indicator */}
        {isWebSocketMessage && (
          <Zap size={10} className="text-blue-400" title="WebSocket result" />
        )}
        
        {/* Subtype indicator */}
        {subtype && subtype !== 'success' && (
          <span className="text-[10px] uppercase bg-gray-800 px-1 rounded text-gray-400">
            {subtype.replace('error_', '')}
          </span>
        )}
      </div>
      
      {/* Enhanced metrics */}
      {metricsInline}
      
      {/* Result content */}
      <span className="flex-1 truncate font-mono text-[11px] text-gray-400">
        {summaryText.slice(0, 140)}{summaryText.length > 140 ? '…' : ''}
      </span>
      
      {/* Session ID for WebSocket messages */}
      {showMetadata && sessionId && (
        <span className="text-[10px] text-purple-400 font-mono">
          {sessionId.slice(-6)}
        </span>
      )}
      
      {/* Timestamp */}
      {showTimestamp && (
        <span className="text-[10px] text-gray-500">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </span>
      )}
      
      {/* Expand button */}
      <button
        className="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
        onClick={() => setExpanded(e => !e)}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  );

  if (compact && !expanded) {
    return (
      <div 
        className={`border-l-2 border-${resultConfig.color}-500/70 pl-3 py-1.5 bg-gray-900/20 rounded-sm cursor-pointer`} 
        onClick={() => setExpanded(true)}
      >
        {row}
      </div>
    );
  }

  return (
    <div className={`border-l-2 border-${resultConfig.color}-500/70 pl-3 py-2 bg-gray-900/30 rounded-sm space-y-2`}>
      {row}
      {expanded && (
        <div className="space-y-3">
          {/* Enhanced Result Content */}
          <div className="bg-gray-950/60 border border-gray-800 rounded p-3">
            <div className="text-[11px] font-medium text-gray-400 mb-2 flex items-center gap-1">
              <BarChart3 size={12} />
              {isError ? 'Error Details' : 'Execution Result'}
            </div>
            <pre className="text-xs leading-snug text-gray-300 font-mono whitespace-pre-wrap">
              {summaryText || 'No result content'}
            </pre>
          </div>

          {/* Enhanced Performance Metrics */}
          {(duration || cost || usage || numTurns) && (
            <div className="bg-gray-950/40 border border-gray-800 rounded p-3">
              <div className="text-[11px] font-medium text-gray-400 mb-2 flex items-center gap-1">
                <Timer size={12} />
                Performance Metrics
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-[11px] text-gray-400">
                {/* Timing */}
                {duration && (
                  <div>
                    <span className="text-gray-500">Total Duration:</span>
                    <span className="ml-1 text-gray-300 font-medium">{fmtDuration(duration)}</span>
                  </div>
                )}
                
                {durationApi && durationApi !== duration && (
                  <div>
                    <span className="text-gray-500">API Time:</span>
                    <span className="ml-1 text-gray-300 font-medium">{fmtDuration(durationApi)}</span>
                  </div>
                )}
                
                {/* Cost */}
                {cost !== undefined && cost !== null && (
                  <div>
                    <span className="text-gray-500">Cost:</span>
                    <span className="ml-1 text-gray-300 font-medium">{fmtCost(cost)}</span>
                  </div>
                )}
                
                {/* Token breakdown */}
                {usage && usage.input_tokens && usage.output_tokens && (
                  <>
                    <div>
                      <span className="text-gray-500">Input Tokens:</span>
                      <span className="ml-1 text-gray-300 font-medium">{usage.input_tokens.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Output Tokens:</span>
                      <span className="ml-1 text-gray-300 font-medium">{usage.output_tokens.toLocaleString()}</span>
                    </div>
                    {usage.cache_read_input_tokens > 0 && (
                      <div>
                        <span className="text-gray-500">Cache Read:</span>
                        <span className="ml-1 text-gray-300 font-medium">{usage.cache_read_input_tokens.toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Execution stats */}
                {numTurns && (
                  <div>
                    <span className="text-gray-500">Turns:</span>
                    <span className="ml-1 text-gray-300 font-medium">{numTurns}</span>
                  </div>
                )}
                
                {duration && (
                  <div>
                    <span className="text-gray-500">Performance:</span>
                    <span className={`ml-1 font-medium ${performance.color}`}>{performance.label}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Session Information */}
          {showMetadata && (sessionId || model) && (
            <div className="bg-gray-950/40 border border-gray-800 rounded p-2">
              <div className="text-[11px] font-medium text-gray-400 mb-2">Session Information</div>
              <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-500">
                {sessionId && (
                  <div>
                    <span className="text-gray-400">Session ID:</span>
                    <span className="ml-1 text-gray-300 font-mono">{sessionId}</span>
                  </div>
                )}
                {model && (
                  <div>
                    <span className="text-gray-400">Model:</span>
                    <span className="ml-1 text-gray-300">{model}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-400">Message ID:</span>
                  <span className="ml-1 text-gray-300 font-mono">{messageId.slice(-12)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Type:</span>
                  <span className="ml-1 text-gray-300">
                    {isWebSocketMessage ? 'WebSocket SDK Result' : 'Legacy Result'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Raw SDK Data (for debugging) */}
          {showMetadata && (message.data || message.metadata?.sdk) && (
            <div className="bg-gray-950/50 border border-gray-800 rounded p-2 max-h-40 overflow-auto">
              <div className="text-[11px] font-medium text-gray-400 mb-1">Raw SDK Data</div>
              <pre className="text-[11px] leading-snug text-gray-300 font-mono">
                {JSON.stringify(message.data || message.metadata?.sdk, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-gray-400 hover:text-gray-200"
              onClick={handleCopy}
            >
              <Copy size={12} />
              <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultMessage;