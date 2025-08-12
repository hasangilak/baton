/**
 * Simplified Message Renderer - Replaces complex MessageTypeRenderer
 * 
 * Uses the new message processing pipeline for clean, simple message rendering
 * Reduces complexity from 486 lines to ~100 lines with better maintainability
 */

import React from 'react';
import type { ProcessedMessage } from '../../../services/chat/messages';

// Import individual message components
import AssistantMessage from './AssistantMessage';
import UserMessage from './UserMessage';
import SystemMessageComponent from './SystemMessage';
import ToolMessageComponent from './ToolMessage';
import ResultMessage from './ResultMessage';
import ErrorMessage from './ErrorMessage';
import AbortMessage from './AbortMessage';

// Specialized components for specific tools
import { TodoWriteTimeline } from './TodoWriteTimeline';
import ExitPlanModeMessage from './ExitPlanModeMessage';

interface SimpleMessageRendererProps {
  message: ProcessedMessage;
  isStreaming?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showTimestamp?: boolean;
  compact?: boolean;
  onPlanReviewDecision?: (planReviewId: string, decision: any) => void;
}

/**
 * Simple message renderer with direct component mapping
 * No complex type discrimination - just clean, direct rendering
 */
export const SimpleMessageRenderer: React.FC<SimpleMessageRendererProps> = ({
  message,
  isStreaming = false,
  onCopy,
  onRetry,
  showTimestamp = true,
  compact = false,
  onPlanReviewDecision,
}) => {
  // Common props for all message components
  const baseProps = {
    message: message as any, // Legacy compatibility
    isStreaming,
    onCopy,
    onRetry,
    showTimestamp,
    compact,
  };

  // Direct component mapping based on message type
  switch (message.type) {
    case 'user':
      return <UserMessage {...baseProps} />;
      
    case 'assistant':
      return <AssistantMessage {...baseProps} />;
      
    case 'system':
      return <SystemMessageComponent {...baseProps} />;
      
    case 'tool':
      return renderToolMessage(message, baseProps, onPlanReviewDecision);
      
    case 'result':
      return <ResultMessage {...baseProps} />;
      
    case 'error':
      return <ErrorMessage {...baseProps} />;
      
    case 'abort':
      return <AbortMessage {...baseProps} />;
      
    default:
      return renderUnknownMessage(message, baseProps);
  }
};

/**
 * Render tool messages with special handling for specific tools
 */
function renderToolMessage(
  message: ProcessedMessage, 
  baseProps: any,
  onPlanReviewDecision?: (planReviewId: string, decision: any) => void
) {
  const toolName = message.metadata?.toolName?.toLowerCase();
  
  // Special handling for TodoWrite tool
  if (toolName === 'todowrite' && message.metadata?.toolInput?.todos) {
    return (
      <TodoWriteTimeline 
        todos={message.metadata.toolInput.todos}
      />
    );
  }
  
  // Special handling for ExitPlanMode tool
  if (toolName === 'exitplanmode') {
    const planReviewId = message.metadata?.planReviewId;
    
    const handlePlanDecision = planReviewId ? (decision: string) => {
      if (onPlanReviewDecision) {
        onPlanReviewDecision(planReviewId, { decision });
      }
    } : undefined;
    
    return (
      <ExitPlanModeMessage 
        {...baseProps} 
        onPlanDecision={handlePlanDecision}
      />
    );
  }
  
  // Default tool message rendering
  return <ToolMessageComponent {...baseProps} />;
}

/**
 * Render unknown message types with debug info
 */
function renderUnknownMessage(message: ProcessedMessage, baseProps: any) {
  return (
    <div className="flex gap-3 p-4 bg-yellow-900/20 border-l-4 border-yellow-500 rounded">
      <div className="w-8 h-8 rounded-lg bg-yellow-600 flex items-center justify-center">
        <span className="text-white text-xs">?</span>
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-yellow-200 mb-1">
          Unknown Message Type: {message.type}
        </div>
        <div className="text-xs text-gray-400 mb-2">
          ID: {message.id} | Timestamp: {new Date(message.timestamp).toLocaleTimeString()}
        </div>
        {message.content && (
          <div className="text-xs text-gray-300 p-2 bg-gray-900 rounded">
            {message.content.substring(0, 200)}
            {message.content.length > 200 && '...'}
          </div>
        )}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 cursor-pointer">
              Debug Info
            </summary>
            <pre className="text-xs text-gray-400 mt-1 bg-gray-900 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(message, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

// Export for backward compatibility
export const MessageTypeRenderer = SimpleMessageRenderer;
export default SimpleMessageRenderer;