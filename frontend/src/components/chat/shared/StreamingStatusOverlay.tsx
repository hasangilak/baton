/**
 * Streaming Status Overlay Component
 * 
 * Shows Claude's current action as a floating overlay during streaming.
 * Displays transient status messages without cluttering the chat history.
 */

import React from 'react';
import { useChatStore } from '../../../stores/chatStore';
import { formatDistanceToNow } from 'date-fns';

export const StreamingStatusOverlay: React.FC = () => {
  const { activeStatusMessage, isStreaming, streamingContext } = useChatStore();
  
  if (!isStreaming || !activeStatusMessage || !streamingContext?.hasActiveStatus) {
    return null;
  }

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 animate-pulse">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 
                      rounded-full px-4 py-2 shadow-xl max-w-md">
        <div className="flex items-center gap-3">
          {/* Animated dots indicator */}
          <div className="flex gap-1">
            <span 
              className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" 
              style={{ animationDelay: '0ms' }} 
            />
            <span 
              className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" 
              style={{ animationDelay: '150ms' }} 
            />
            <span 
              className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" 
              style={{ animationDelay: '300ms' }} 
            />
          </div>
          
          {/* Status message */}
          <span className="text-sm text-gray-300 font-medium truncate">
            {activeStatusMessage.content}
          </span>
          
          {/* Optional timestamp for long operations */}
          {activeStatusMessage.timestamp && (
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(activeStatusMessage.timestamp, { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Additional utility component for enhanced status display
export const EnhancedStreamingIndicator: React.FC<{
  showToolsCount?: boolean;
  showDuration?: boolean;
}> = ({ showToolsCount = false, showDuration = false }) => {
  const { activeStatusMessage, isStreaming, streamingContext } = useChatStore();
  
  if (!isStreaming) {
    return null;
  }

  // If we have a status message, show the overlay
  if (activeStatusMessage && streamingContext?.hasActiveStatus) {
    return <StreamingStatusOverlay />;
  }

  // Fallback to simple streaming indicator
  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 
                      rounded-full px-3 py-1.5 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400">
            Claude is working...
          </span>
        </div>
      </div>
    </div>
  );
};