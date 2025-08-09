/**
 * Message Type Renderer - Central dispatcher for different message types
 * 
 * Advanced component architecture with compound patterns and intelligent message routing
 * Based on comprehensive message type analysis and streaming behavior study
 */

import React from 'react';
import type { Message, StreamingSystemMessage, StreamingToolMessage } from '../../../types';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { SystemMessageComponent } from './SystemMessage';
import { ToolMessageComponent } from './ToolMessage';
import { TodoWriteComponent } from './TodoWriteComponent';
import { ResultMessage } from './ResultMessage';
import { ErrorMessage } from './ErrorMessage';
import { AbortMessage } from './AbortMessage';

interface MessageTypeRendererProps {
  message: Message | any; // Support both new and legacy message types
  isStreaming?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showTimestamp?: boolean;
  compact?: boolean;
  virtualizedIndex?: number; // For virtual scrolling optimization
}

/**
 * Advanced message type discrimination with fallback handling
 */
function getMessageType(message: any): string {
  // Check streaming metadata first (from ChatPage streaming message processing)
  if (message.metadata?.streamingType) {
    switch (message.metadata.streamingType) {
      case 'chat':
        return message.role === 'user' ? 'user' : 'assistant';
      case 'system':
        return 'system';
      case 'tool_use':
        return 'tool';
      case 'tool_result':
        return 'result';
      case 'result':
        return 'result';
      case 'error':
        return 'error';
      case 'abort':
        return 'abort';
      default:
        return 'unknown';
    }
  }

  // Handle direct streaming message types
  if (message.type) {
    switch (message.type) {
      case 'chat':
        return message.role === 'user' ? 'user' : 'assistant';
      case 'system':
        return 'system';
      case 'tool_use':
        return 'tool';
      case 'tool_result':
        return 'result';
      case 'result':
        return 'result';
      case 'error':
        return 'error';
      case 'abort':
        return 'abort';
      default:
        return 'unknown';
    }
  }

  // Handle legacy message format
  if (message.role === 'user') return 'user';
  if (message.role === 'assistant') return 'assistant';
  if (message.error) return 'error';
  
  // Fallback detection based on content patterns
  if (message.name && message.input) return 'tool';
  if (message.subtype === 'completion') return 'result';
  if (message.message && message.subtype) return 'system';
  
  return 'unknown';
}

/**
 * Message deduplication logic to prevent duplicate displays
 */
function shouldRenderMessage(message: any, messageType: string): boolean {
  // Skip duplicate assistant messages (streaming vs persisted)
  if (messageType === 'assistant') {
    // Check if this is a duplicate by comparing content and timestamp proximity
    // This is a placeholder for advanced deduplication logic
    return true; // For now, render all - can be enhanced
  }
  
  // Skip empty or malformed messages
  if (!message.content && !message.message && messageType !== 'tool') {
    return false;
  }
  
  return true;
}

/**
 * Main message type renderer with compound component pattern
 */
export const MessageTypeRenderer: React.FC<MessageTypeRendererProps> = ({
  message,
  isStreaming = false,
  onCopy,
  onRetry,
  showTimestamp = true,
  compact = false,
  virtualizedIndex,
}) => {
  const messageType = getMessageType(message);
  
  // Skip rendering if deduplication rules apply
  if (!shouldRenderMessage(message, messageType)) {
    return null;
  }

  // Apply performance optimization for virtual scrolling
  const commonProps = {
    message,
    isStreaming,
    onCopy,
    onRetry,
    showTimestamp,
    compact,
    virtualizedIndex,
  };

  switch (messageType) {
    case 'user':
      return <UserMessage {...commonProps} />;
      
    case 'assistant':
      return <AssistantMessage {...commonProps} />;
      
    case 'system':
      return <SystemMessageComponent {...commonProps} message={message as StreamingSystemMessage} />;
      
    case 'tool':
      // Check if this is a TodoWrite tool and render specialized component
      const toolName = message.metadata?.toolName || message.name || '';
      const isTodoWrite = toolName.toLowerCase() === 'todowrite';
      const todosData = message.metadata?.toolInput?.todos || message.input?.todos;
      
      if (isTodoWrite && todosData) {
        return <TodoWriteComponent todos={todosData} />;
      }
      
      return <ToolMessageComponent {...commonProps} message={message as StreamingToolMessage} />;
      
    case 'result':
      return <ResultMessage {...commonProps} />;
      
    case 'error':
      return <ErrorMessage {...commonProps} />;
      
    case 'abort':
      return <AbortMessage {...commonProps} />;
      
    default:
      // Fallback for unknown message types with debug info
      return (
        <div className="flex gap-3 p-4 bg-gray-800 border-l-4 border-yellow-400">
          <div className="w-8 h-8 rounded-lg bg-yellow-600 flex items-center justify-center">
            <span className="text-white text-xs">?</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-yellow-200 mb-1">
              Unknown Message Type
            </div>
            <div className="text-xs text-gray-400 font-mono">
              Type: {message.type || 'undefined'} | 
              Role: {message.role || 'undefined'}
            </div>
            <details className="mt-2">
              <summary className="text-xs text-gray-500 cursor-pointer">
                Debug Info
              </summary>
              <pre className="text-xs text-gray-400 mt-1 bg-gray-900 p-2 rounded overflow-auto">
                {JSON.stringify(message, null, 2)}
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