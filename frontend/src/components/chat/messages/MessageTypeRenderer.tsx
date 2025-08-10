/**
 * Message Type Renderer - Enhanced WebSocket-Driven Component Dispatcher
 * 
 * Advanced component architecture with compound patterns and intelligent message routing
 * Fully integrated with Claude Code SDK StreamResponse format and WebSocket real-time updates
 * 
 * Features:
 * - Complete Claude Code SDK message type support
 * - Real-time WebSocket message routing
 * - StreamResponse format discrimination
 * - Performance-optimized component selection
 * - Comprehensive fallback handling
 */

import React from 'react';
import type { Message, StreamingSystemMessage, StreamingToolMessage } from '../../../types';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { SystemMessageComponent } from './SystemMessage';
import { ToolMessageComponent } from './ToolMessage';
import { ResultMessage } from './ResultMessage';
import { ErrorMessage } from './ErrorMessage';
import { AbortMessage } from './AbortMessage';
import { TodoWriteTimeline } from './TodoWriteTimeline';
import ExitPlanModeMessage from './ExitPlanModeMessage';

// Enhanced interfaces for WebSocket message support
interface StreamResponseMessage {
  type: 'claude_json' | 'error' | 'done' | 'aborted';
  data?: SDKMessage;
  error?: string;
  requestId?: string;
  timestamp?: number;
}

interface SDKMessage {
  type: 'assistant' | 'user' | 'system' | 'result';
  subtype?: 'init' | 'success' | 'error_max_turns' | 'error_during_execution';
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: Array<{ type: string; text: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  session_id?: string;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: any;
  is_error?: boolean;
  num_turns?: number;
}

interface MessageTypeRendererProps {
  message: Message | StreamResponseMessage | any; // Support WebSocket, database, and legacy types
  isStreaming?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showTimestamp?: boolean;
  compact?: boolean;
  virtualizedIndex?: number; // For virtual scrolling optimization
  onPlanReviewDecision?: (planReviewId: string, decision: any) => void;
  // WebSocket-specific props
  showMetadata?: boolean; // Show SDK metadata like session ID, usage, etc.
  realTimeUpdate?: boolean; // Indicates this is a real-time WebSocket message
}

/**
 * Enhanced WebSocket-aware message type discrimination
 * Handles StreamResponse format and Claude Code SDK messages
 */
function getMessageType(message: any): string {
  // Priority 1: StreamResponse format from WebSocket (claude_json type)
  if (message.type === 'claude_json' && message.data) {
    const sdkData = message.data;
    
    // Map SDK message types to component types
    switch (sdkData.type) {
      case 'assistant':
        return 'assistant';
      case 'user':
        return 'user';
      case 'system':
        return 'system';
      case 'result':
        return 'result';
      default:
        return 'assistant'; // Default fallback for Claude responses
    }
  }

  // Priority 2: Other StreamResponse types
  if (message.type) {
    switch (message.type) {
      case 'error':
        return 'error';
      case 'done':
        return 'completion';
      case 'aborted':
        return 'abort';
      case 'chat':
        return message.role === 'user' ? 'user' : 'assistant';
      case 'system':
        return 'system';
      case 'tool_use':
        return 'tool';
      case 'tool_result':
        return 'result';
      default:
        break; // Continue to legacy handling
    }
  }

  // Priority 3: Streaming metadata (from ChatPage streaming message processing)
  if (message.metadata?.streamingType) {
    switch (message.metadata.streamingType) {
      case 'chat':
        return message.role === 'user' ? 'user' : 'assistant';
      case 'system':
        return 'system';
      case 'tool_use':
        return 'tool';
      case 'tool_result':
      case 'result':
        return 'result';
      case 'error':
        return 'error';
      case 'abort':
        return 'abort';
    }
  }

  // Priority 4: Legacy database message format
  if (message.role) {
    switch (message.role) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      case 'system':
        return 'system';
    }
  }

  // Priority 5: Error conditions
  if (message.error || message.status === 'failed') {
    return 'error';
  }
  
  // Priority 6: Content-based pattern detection
  if (message.name && message.input) return 'tool';
  if (message.subtype === 'completion') return 'result';
  if (message.message && message.subtype) return 'system';
  
  return 'unknown';
}

/**
 * Extract comprehensive message metadata for enhanced component rendering
 */
function extractMessageMetadata(message: any) {
  const metadata: any = {
    id: message.id || message.requestId || `msg_${Date.now()}`,
    timestamp: message.timestamp || message.createdAt || Date.now(),
    isWebSocket: !!(message.type && ['claude_json', 'error', 'done', 'aborted'].includes(message.type)),
    isStreamResponse: !!message.type,
    hasSDKData: !!(message.type === 'claude_json' && message.data),
  };

  // Extract SDK-specific metadata
  if (message.type === 'claude_json' && message.data) {
    const sdk = message.data;
    metadata.sdk = {
      type: sdk.type,
      subtype: sdk.subtype,
      sessionId: sdk.session_id,
      model: sdk.message?.model,
      usage: sdk.message?.usage || sdk.usage,
      messageId: sdk.message?.id,
      isError: sdk.is_error,
      duration: sdk.duration_ms,
      cost: sdk.total_cost_usd,
      numTurns: sdk.num_turns,
    };

    // Extract content
    if (sdk.message?.content && Array.isArray(sdk.message.content)) {
      metadata.content = sdk.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    } else if (sdk.result) {
      metadata.content = sdk.result;
    }
  }

  // Legacy content extraction
  if (!metadata.content) {
    metadata.content = message.content || message.message || '';
  }

  return metadata;
}

/**
 * Enhanced message deduplication and filtering logic
 */
function shouldRenderMessage(message: any, messageType: string, metadata: any): boolean {
  // Always render WebSocket real-time messages
  if (metadata.isWebSocket && metadata.isStreamResponse) {
    return true;
  }

  // Skip empty messages unless they're system/tool messages that might have metadata
  if (!metadata.content && !message.content && !message.message && 
      !['tool', 'system', 'result'].includes(messageType)) {
    return false;
  }

  // Skip duplicate assistant messages (streaming vs persisted)
  if (messageType === 'assistant') {
    // TODO: Implement sophisticated deduplication based on message ID and timestamp
    // For now, render all to avoid missing messages during development
    return true;
  }

  // Skip messages that are just completion indicators unless they have useful data
  if (messageType === 'completion' && !metadata.sdk?.sessionId) {
    return false;
  }

  // Always render error and abort messages
  if (['error', 'abort'].includes(messageType)) {
    return true;
  }
  
  return true;
}

/**
 * Enhanced WebSocket-driven message type renderer with compound component pattern
 */
export const MessageTypeRenderer: React.FC<MessageTypeRendererProps> = ({
  message,
  isStreaming = false,
  onCopy,
  onRetry,
  showTimestamp = true,
  compact = false,
  virtualizedIndex,
  onPlanReviewDecision,
  showMetadata = false,
  realTimeUpdate = false,
}) => {
  const messageType = getMessageType(message);
  const metadata = extractMessageMetadata(message);
  
  // Skip rendering if deduplication rules apply
  if (!shouldRenderMessage(message, messageType, metadata)) {
    return null;
  }

  // Enhanced common props with WebSocket metadata
  const commonProps = {
    message,
    isStreaming,
    onCopy,
    onRetry,
    showTimestamp,
    compact,
    virtualizedIndex,
    showMetadata: showMetadata || metadata.isWebSocket, // Show metadata for WebSocket messages
    realTimeUpdate,
  };

  switch (messageType) {
    case 'user':
      return <UserMessage {...commonProps} />;
      
    case 'assistant':
      return <AssistantMessage {...commonProps} />;
      
    case 'system':
      // Enhanced system message handling for SDK messages
      const systemMessage = {
        ...message,
        metadata: metadata,
        // Map SDK data to system message format
        ...(metadata.hasSDKData && {
          subtype: metadata.sdk.subtype || 'init',
          data: metadata.sdk,
        }),
      };
      return <SystemMessageComponent {...commonProps} message={systemMessage as StreamingSystemMessage} />;
      
    case 'tool':
      // Check for specialized tool components
      const toolName = message.metadata?.toolName || message.name || '';
      const isTodoWrite = toolName.toLowerCase() === 'todowrite';
      const isExitPlanMode = toolName.toLowerCase() === 'exitplanmode';
      const todosData = message.metadata?.toolInput?.todos || message.input?.todos;
      
      if (isTodoWrite && todosData) {
        return <TodoWriteTimeline todos={todosData} />;
      }
      
      if (isExitPlanMode) {
        // Check if we have a valid plan review ID from the bridge service
        const planReviewId = message.metadata?.planReviewId || message.planReviewId;
        
        // Create wrapper function to handle plan decisions for ExitPlanMode
        const handlePlanDecision = planReviewId ? (decision: 'auto_accept' | 'review_accept' | 'edit_plan' | 'reject') => {
          if (onPlanReviewDecision) {
            // Use the actual plan review ID created by the bridge service
            onPlanReviewDecision(planReviewId, {
              decision,
              feedback: undefined,
              editedPlan: undefined
            });
          }
        } : undefined;
        
        return <ExitPlanModeMessage {...commonProps} message={message as StreamingToolMessage} onPlanDecision={handlePlanDecision} />;
      }
      
      return <ToolMessageComponent {...commonProps} message={message as StreamingToolMessage} />;
      
    case 'result':
      // Enhanced result message with SDK data
      const resultMessage = {
        ...message,
        metadata: metadata,
        // Map SDK result data for better display
        ...(metadata.hasSDKData && metadata.sdk.type === 'result' && {
          content: metadata.content || metadata.sdk.result,
          data: {
            duration: metadata.sdk.duration,
            cost: metadata.sdk.cost,
            tokens: metadata.sdk.usage?.input_tokens + metadata.sdk.usage?.output_tokens,
            isError: metadata.sdk.isError,
            numTurns: metadata.sdk.numTurns,
            usage: metadata.sdk.usage,
          },
        }),
      };
      return <ResultMessage {...commonProps} message={resultMessage} />;
      
    case 'error':
      // Enhanced error message with request context
      const errorMessage = {
        ...message,
        error: message.error || metadata.content || 'Unknown error',
        requestId: metadata.id,
        timestamp: metadata.timestamp,
      };
      return <ErrorMessage {...commonProps} message={errorMessage} />;
      
    case 'abort':
      // Enhanced abort message with context
      const abortMessage = {
        ...message,
        reason: message.reason || metadata.content || 'Request aborted',
        timestamp: metadata.timestamp,
      };
      return <AbortMessage {...commonProps} message={abortMessage} />;

    case 'completion':
      // New completion message type for 'done' StreamResponse
      return (
        <div className="flex gap-3 p-2 bg-green-900/20 border-l-4 border-green-500 rounded-sm">
          <div className="w-6 h-6 rounded bg-green-600 flex items-center justify-center">
            <span className="text-white text-xs">✓</span>
          </div>
          <div className="flex-1">
            <div className="text-sm text-green-300 font-medium">Task Completed</div>
            {metadata.sdk?.sessionId && (
              <div className="text-xs text-gray-400 font-mono">
                Session: {metadata.sdk.sessionId.slice(-8)}
              </div>
            )}
            {showTimestamp && (
              <div className="text-xs text-gray-500 mt-1">
                {new Date(metadata.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      );
      
    default:
      // Enhanced fallback with WebSocket debug info
      return (
        <div className="flex gap-3 p-4 bg-gray-800 border-l-4 border-yellow-400 rounded">
          <div className="w-8 h-8 rounded-lg bg-yellow-600 flex items-center justify-center">
            <span className="text-white text-xs">?</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-yellow-200 mb-1">
              Unknown Message Type: {messageType}
            </div>
            <div className="text-xs text-gray-400 font-mono mb-2">
              Type: {message.type || 'undefined'} | 
              Role: {message.role || 'undefined'}
              {metadata.isWebSocket && ' | WebSocket: true'}
              {metadata.hasSDKData && ` | SDK: ${metadata.sdk.type}`}
            </div>
            {metadata.content && (
              <div className="text-xs text-gray-300 mb-2 p-2 bg-gray-900 rounded">
                {metadata.content.substring(0, 200)}
                {metadata.content.length > 200 && '...'}
              </div>
            )}
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer">
                Debug Info (Message Structure)
              </summary>
              <pre className="text-xs text-gray-400 mt-1 bg-gray-900 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify({ 
                  messageType,
                  metadata: {
                    isWebSocket: metadata.isWebSocket,
                    hasSDKData: metadata.hasSDKData,
                    sdk: metadata.sdk
                  },
                  originalMessage: message 
                }, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      );
  }
};

// Export compound components for advanced usage
export const MessageTypeRenderer_Compound = {
  Assistant: AssistantMessage,
  User: UserMessage,
  System: SystemMessageComponent,
  Tool: ToolMessageComponent,
  Result: ResultMessage,
  Error: ErrorMessage,
  Abort: AbortMessage,
  Renderer: MessageTypeRenderer,
};

export default MessageTypeRenderer;