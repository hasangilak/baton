/**
 * System Message Component - Enhanced Claude SDK Integration
 * 
 * Linear minimal design with comprehensive support for Claude Code SDK system messages.
 * Handles initialization, configuration, tool status, MCP server information,
 * and session management with rich metadata display.
 * 
 * Features:
 * - Claude Code SDK system message types (init, config, tool_status)
 * - Session information and model details
 * - Tool and MCP server status display
 * - Collapsible detailed view for debugging
 * - Real-time status updates from WebSocket
 */

import React, { useState } from 'react';
import { 
  Settings, 
  Info, 
  AlertCircle, 
  CheckCircle, 
  ChevronDown, 
  ChevronRight,
  Terminal,
  Zap,
  Globe,
  Code,
  Hash,
  Clock,
  User,
  Folder
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { StreamingSystemMessage } from '../../../types';

interface SystemMessageProps {
  message: StreamingSystemMessage & {
    metadata?: {
      sdk?: {
        type: string;
        subtype?: string;
        sessionId?: string;
        model?: string;
        usage?: any;
      };
      isWebSocket?: boolean;
      hasSDKData?: boolean;
    };
    // SDK-specific fields
    data?: {
      apiKeySource?: string;
      cwd?: string;
      tools?: string[];
      mcp_servers?: Array<{ name: string; status: string }>;
      model?: string;
      permissionMode?: string;
      slash_commands?: string[];
      sessionId?: string;
    };
  };
  showTimestamp?: boolean;
  compact?: boolean;
  showMetadata?: boolean;
  realTimeUpdate?: boolean;
}

const configFor = (subtype?: string, sdkType?: string) => {
  // Handle Claude SDK system message types
  if (sdkType === 'system') {
    switch (subtype) {
      case 'init':
        return { icon: Settings, color: 'blue', label: 'Claude Initialized', description: 'Claude Code session started' };
      case 'config':
        return { icon: Code, color: 'purple', label: 'Configuration', description: 'Settings updated' };
      case 'tool_status':
        return { icon: Terminal, color: 'orange', label: 'Tools', description: 'Tool availability updated' };
      case 'mcp_status':
        return { icon: Globe, color: 'cyan', label: 'MCP Servers', description: 'MCP server status updated' };
      default:
        return { icon: Settings, color: 'blue', label: 'System', description: 'System message' };
    }
  }

  // Handle legacy system message types
  switch (subtype) {
    case 'sdk_system':
    case 'initialization':
      return { icon: Settings, color: 'blue', label: 'System', description: 'System initialization' };
    case 'completion':
    case 'success':
      return { icon: CheckCircle, color: 'green', label: 'Completed', description: 'Operation completed' };
    case 'stream_error':
    case 'processing_error':
    case 'parse_error':
      return { icon: AlertCircle, color: 'red', label: 'Error', description: 'System error occurred' };
    default:
      return { icon: Info, color: 'gray', label: 'Info', description: 'System information' };
  }
};

export const SystemMessageComponent: React.FC<SystemMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false,
  showMetadata = false,
  realTimeUpdate = false
}) => {
  const [expanded, setExpanded] = useState(false);
  
  // Enhanced configuration with SDK support
  const cfg = configFor(message.subtype, message.metadata?.sdk?.type);
  const Icon = cfg.icon;
  const timestamp = message.timestamp || Date.now();
  
  // Check for expandable data
  const hasData = (message.data && Object.keys(message.data).length > 0) || 
                  (message.metadata?.sdk && Object.keys(message.metadata.sdk).length > 0);
  
  // Extract SDK data for enhanced display
  const sdkData = message.metadata?.sdk || message.data;
  const isClaudeInit = message.metadata?.sdk?.type === 'system' && message.subtype === 'init';
  const isWebSocketMessage = message.metadata?.isWebSocket;

  const row = (
    <div className="flex items-center gap-2">
      <Icon size={14} className={`text-${cfg.color}-400`} />
      
      {/* Enhanced label with description */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium text-${cfg.color}-300`}>{cfg.label}</span>
        
        {/* Real-time indicator */}
        {realTimeUpdate && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
        )}
        
        {/* WebSocket indicator */}
        {isWebSocketMessage && (
          <Zap size={10} className="text-blue-400" title="WebSocket message" />
        )}
        
        {/* Subtype */}
        {message.subtype && (
          <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-800 px-1 rounded">
            {message.subtype}
          </span>
        )}
      </div>

      {/* Enhanced content with SDK info */}
      <div className="flex-1 truncate text-xs text-gray-400">
        {/* Primary message */}
        <span>{message.message || cfg.description}</span>
        
        {/* SDK metadata inline */}
        {showMetadata && sdkData && (
          <span className="ml-2 text-gray-500">
            {sdkData.model && (
              <span className="bg-gray-700 px-1 py-0.5 rounded mr-1 text-[10px]">
                {sdkData.model}
              </span>
            )}
            {sdkData.sessionId && (
              <span className="font-mono text-[10px]">
                {sdkData.sessionId.slice(-6)}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Tools/MCP count indicators */}
      {sdkData?.tools && sdkData.tools.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <Terminal size={10} />
          <span>{sdkData.tools.length}</span>
        </div>
      )}
      
      {sdkData?.mcp_servers && sdkData.mcp_servers.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <Globe size={10} />
          <span>{sdkData.mcp_servers.length}</span>
        </div>
      )}

      {/* Timestamp */}
      {showTimestamp && (
        <span className="text-[10px] text-gray-500">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </span>
      )}

      {/* Expand button */}
      {hasData && (
        <button
          className="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
          onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
    </div>
  );

  if (compact && !expanded) {
    return (
      <div className={`border-l-2 pl-3 py-1.5 border-${cfg.color}-500/70 bg-gray-900/20 rounded-sm`}>
        {row}
      </div>
    );
  }

  return (
    <div className={`border-l-2 pl-3 py-2 space-y-2 border-${cfg.color}-500/70 bg-gray-900/30 rounded-sm`}>
      {row}
      
      {expanded && hasData && (
        <div className="space-y-3">
          {/* Claude Initialization Details */}
          {isClaudeInit && sdkData && (
            <div className="bg-gray-950/60 border border-gray-800 rounded p-3">
              <div className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-2">
                <Settings size={12} className="text-blue-400" />
                Claude Code Session Details
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-400">
                {sdkData.model && (
                  <div>
                    <span className="text-gray-500">Model:</span>
                    <span className="ml-1 text-gray-300 font-medium">{sdkData.model}</span>
                  </div>
                )}
                
                {sdkData.sessionId && (
                  <div>
                    <span className="text-gray-500">Session:</span>
                    <span className="ml-1 text-gray-300 font-mono">{sdkData.sessionId.slice(-12)}</span>
                  </div>
                )}
                
                {sdkData.apiKeySource && (
                  <div>
                    <span className="text-gray-500">API Key:</span>
                    <span className="ml-1 text-gray-300">{sdkData.apiKeySource}</span>
                  </div>
                )}
                
                {sdkData.permissionMode && (
                  <div>
                    <span className="text-gray-500">Permission Mode:</span>
                    <span className="ml-1 text-gray-300">{sdkData.permissionMode}</span>
                  </div>
                )}
                
                {sdkData.cwd && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Working Directory:</span>
                    <span className="ml-1 text-gray-300 font-mono text-xs break-all">{sdkData.cwd}</span>
                  </div>
                )}
              </div>
              
              {/* Tools Section */}
              {sdkData.tools && sdkData.tools.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Terminal size={12} className="text-orange-400" />
                    Available Tools ({sdkData.tools.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sdkData.tools.map((tool, index) => (
                      <span key={index} className="bg-gray-800 px-2 py-0.5 rounded text-[10px] text-gray-300">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* MCP Servers Section */}
              {sdkData.mcp_servers && sdkData.mcp_servers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Globe size={12} className="text-cyan-400" />
                    MCP Servers ({sdkData.mcp_servers.length})
                  </div>
                  <div className="space-y-1">
                    {sdkData.mcp_servers.map((server, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-800 px-2 py-1 rounded">
                        <span className="text-[11px] text-gray-300">{server.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          server.status === 'connected' 
                            ? 'bg-green-900/30 text-green-300' 
                            : 'bg-red-900/30 text-red-300'
                        }`}>
                          {server.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Slash Commands */}
              {sdkData.slash_commands && sdkData.slash_commands.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="text-xs font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Hash size={12} className="text-purple-400" />
                    Slash Commands
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sdkData.slash_commands.map((command, index) => (
                      <span key={index} className="bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded text-[10px] font-mono">
                        {command}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Raw Data Section */}
          {!isClaudeInit && (message.data || message.metadata?.sdk) && (
            <div className="bg-gray-950/60 border border-gray-800 rounded p-2 max-h-52 overflow-auto">
              <div className="text-[11px] font-medium text-gray-400 mb-2">System Data</div>
              <pre className="text-[11px] leading-snug text-gray-300 font-mono">
                {JSON.stringify(message.data || message.metadata?.sdk, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Metadata Section (for debugging) */}
          {showMetadata && message.metadata && (
            <div className="bg-gray-950/40 border border-gray-700 rounded p-2">
              <div className="text-[11px] font-medium text-gray-400 mb-2">Message Metadata</div>
              <div className="text-[10px] text-gray-500 space-y-1">
                <div>WebSocket: {message.metadata.isWebSocket ? 'Yes' : 'No'}</div>
                <div>SDK Data: {message.metadata.hasSDKData ? 'Yes' : 'No'}</div>
                {message.metadata.sdk?.type && (
                  <div>SDK Type: {message.metadata.sdk.type}</div>
                )}
                {realTimeUpdate && (
                  <div className="text-green-400">⚡ Real-time update</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemMessageComponent;