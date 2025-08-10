/**
 * Streaming Status Indicator - Real-time WebSocket activity display
 * 
 * Provides visual feedback for active WebSocket streams, tool executions,
 * and Claude Code SDK session status. Enhances user experience during
 * long-running operations and real-time message streaming.
 * 
 * Features:
 * - Real-time connection status monitoring
 * - Active request tracking with progress indicators
 * - Tool execution status with risk assessment
 * - Session information and token usage
 * - Collapsible detailed view for debugging
 */

import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Activity, 
  Clock, 
  Zap, 
  Terminal, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Hash,
  DollarSign
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActiveRequest {
  requestId: string;
  message: string;
  startTime: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  toolsUsed?: string[];
  sessionId?: string;
  model?: string;
}

interface SessionInfo {
  id: string;
  model?: string;
  totalTokens?: number;
  totalCost?: number;
  requestCount?: number;
  startTime?: number;
}

interface StreamingStatusIndicatorProps {
  // Connection status
  isConnected?: boolean;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
  
  // Active requests
  activeRequests?: ActiveRequest[];
  
  // Session information
  currentSession?: SessionInfo;
  
  // WebSocket events
  lastMessageTime?: number;
  messagesPerSecond?: number;
  
  // Tool execution
  activeTools?: string[];
  
  // Display options
  compact?: boolean;
  showDebugInfo?: boolean;
  position?: 'top' | 'bottom' | 'inline';
}

/**
 * Get connection status styling
 */
const getConnectionConfig = (quality: string, isConnected: boolean) => {
  if (!isConnected) {
    return { 
      icon: WifiOff, 
      color: 'text-red-400', 
      bg: 'bg-red-900/20', 
      border: 'border-red-500/50',
      label: 'Disconnected' 
    };
  }

  switch (quality) {
    case 'excellent':
      return { 
        icon: Wifi, 
        color: 'text-green-400', 
        bg: 'bg-green-900/20', 
        border: 'border-green-500/50',
        label: 'Excellent' 
      };
    case 'good':
      return { 
        icon: Wifi, 
        color: 'text-green-400', 
        bg: 'bg-green-900/20', 
        border: 'border-green-500/50',
        label: 'Good' 
      };
    case 'fair':
      return { 
        icon: Wifi, 
        color: 'text-yellow-400', 
        bg: 'bg-yellow-900/20', 
        border: 'border-yellow-500/50',
        label: 'Fair' 
      };
    case 'poor':
      return { 
        icon: Wifi, 
        color: 'text-orange-400', 
        bg: 'bg-orange-900/20', 
        border: 'border-orange-500/50',
        label: 'Poor' 
      };
    default:
      return { 
        icon: Wifi, 
        color: 'text-gray-400', 
        bg: 'bg-gray-900/20', 
        border: 'border-gray-500/50',
        label: 'Connected' 
      };
  }
};

/**
 * Format duration for display
 */
const formatDuration = (startTime: number): string => {
  const duration = Date.now() - startTime;
  if (duration < 1000) return `${Math.round(duration)}ms`;
  if (duration < 60000) return `${Math.round(duration / 1000)}s`;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Format cost display
 */
const formatCost = (cost?: number): string => {
  if (!cost || cost === 0) return 'Free';
  if (cost < 0.001) return '<$0.001';
  return `$${cost.toFixed(4)}`;
};

export const StreamingStatusIndicator: React.FC<StreamingStatusIndicatorProps> = ({
  isConnected = false,
  connectionQuality = 'disconnected',
  activeRequests = [],
  currentSession,
  lastMessageTime,
  messagesPerSecond = 0,
  activeTools = [],
  compact = false,
  showDebugInfo = false,
  position = 'bottom'
}) => {
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update time for duration calculations
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const connectionConfig = getConnectionConfig(connectionQuality, isConnected);
  const hasActivity = activeRequests.length > 0 || activeTools.length > 0;
  const ConnectionIcon = connectionConfig.icon;

  // Determine if we should show the indicator
  const shouldShow = isConnected || hasActivity || activeRequests.length > 0;
  
  if (!shouldShow && !showDebugInfo) {
    return null;
  }

  // Compact view
  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-2 py-1 rounded-sm ${connectionConfig.bg} ${connectionConfig.border} border`}>
        <ConnectionIcon size={12} className={connectionConfig.color} />
        {hasActivity && (
          <>
            <Activity size={12} className="text-blue-400 animate-pulse" />
            <span className="text-xs text-gray-300">{activeRequests.length}</span>
          </>
        )}
        {currentSession && (
          <span className="text-xs text-gray-400 font-mono">
            {currentSession.id.slice(-6)}
          </span>
        )}
      </div>
    );
  }

  // Full view
  const positionClasses = {
    top: 'sticky top-0 z-10',
    bottom: 'sticky bottom-0 z-10',
    inline: ''
  };

  return (
    <div className={`${positionClasses[position]} bg-gray-900/95 border-t border-gray-800 backdrop-blur-sm`}>
      <div className="px-4 py-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <ConnectionIcon size={16} className={connectionConfig.color} />
              <span className={`text-sm font-medium ${connectionConfig.color}`}>
                {connectionConfig.label}
              </span>
              {messagesPerSecond > 0 && (
                <span className="text-xs text-gray-400">
                  {messagesPerSecond.toFixed(1)}/s
                </span>
              )}
            </div>

            {/* Active Requests */}
            {activeRequests.length > 0 && (
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-blue-400 animate-pulse" />
                <span className="text-sm text-blue-300">
                  {activeRequests.length} active
                </span>
              </div>
            )}

            {/* Active Tools */}
            {activeTools.length > 0 && (
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-orange-400" />
                <span className="text-sm text-orange-300">
                  {activeTools.join(', ')}
                </span>
              </div>
            )}

            {/* Session Info */}
            {currentSession && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="font-mono">
                  {currentSession.id.slice(-8)}
                </span>
                {currentSession.model && (
                  <span className="bg-gray-800 px-1.5 py-0.5 rounded">
                    {currentSession.model}
                  </span>
                )}
                {currentSession.totalTokens && (
                  <span className="flex items-center gap-1">
                    <Hash size={10} />
                    {currentSession.totalTokens.toLocaleString()}
                  </span>
                )}
                {currentSession.totalCost && (
                  <span className="flex items-center gap-1">
                    <DollarSign size={10} />
                    {formatCost(currentSession.totalCost)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Expand Button */}
          {(activeRequests.length > 0 || showDebugInfo) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Active Requests Details */}
            {activeRequests.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-2 font-medium">Active Requests</div>
                <div className="space-y-2">
                  {activeRequests.map((request) => (
                    <div key={request.requestId} className="bg-gray-800/50 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {request.status === 'processing' && (
                            <Activity size={12} className="text-blue-400 animate-pulse" />
                          )}
                          {request.status === 'completed' && (
                            <CheckCircle2 size={12} className="text-green-400" />
                          )}
                          {request.status === 'error' && (
                            <XCircle size={12} className="text-red-400" />
                          )}
                          {request.status === 'pending' && (
                            <Clock size={12} className="text-yellow-400" />
                          )}
                          <span className="text-xs text-gray-300 font-medium">
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">
                          {formatDuration(request.startTime)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {request.message}
                      </div>
                      {request.toolsUsed && request.toolsUsed.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          Tools: {request.toolsUsed.join(', ')}
                        </div>
                      )}
                      {request.sessionId && (
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          Session: {request.sessionId.slice(-8)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session Details */}
            {currentSession && expanded && (
              <div>
                <div className="text-xs text-gray-400 mb-2 font-medium">Session Information</div>
                <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-400">ID:</span>
                      <span className="ml-1 font-mono">{currentSession.id}</span>
                    </div>
                    {currentSession.model && (
                      <div>
                        <span className="text-gray-400">Model:</span>
                        <span className="ml-1">{currentSession.model}</span>
                      </div>
                    )}
                    {currentSession.requestCount && (
                      <div>
                        <span className="text-gray-400">Requests:</span>
                        <span className="ml-1">{currentSession.requestCount}</span>
                      </div>
                    )}
                    {currentSession.startTime && (
                      <div>
                        <span className="text-gray-400">Duration:</span>
                        <span className="ml-1">{formatDuration(currentSession.startTime)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Debug Information */}
            {showDebugInfo && (
              <div>
                <div className="text-xs text-gray-400 mb-2 font-medium">Debug Information</div>
                <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300 font-mono">
                  <div>Connection Quality: {connectionQuality}</div>
                  <div>Messages/sec: {messagesPerSecond.toFixed(2)}</div>
                  {lastMessageTime && (
                    <div>
                      Last Message: {formatDistanceToNow(new Date(lastMessageTime), { addSuffix: true })}
                    </div>
                  )}
                  <div>Active Tools: [{activeTools.join(', ')}]</div>
                  <div>Active Requests: {activeRequests.length}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Last Activity Indicator */}
        {lastMessageTime && !expanded && (
          <div className="text-xs text-gray-500 mt-1">
            Last activity {formatDistanceToNow(new Date(lastMessageTime), { addSuffix: true })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StreamingStatusIndicator;