/**
 * Transient Message Card Component
 * 
 * Displays transient/status messages in chat history with a collapsed view.
 * Users can expand to see the full status message for debugging/review.
 */

import React, { useState } from 'react';
import { ChevronRight, Clock, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ProcessedMessage } from '../../../services/chat/messages';

interface TransientMessageCardProps {
  message: ProcessedMessage;
  showInHistory?: boolean; // Show full details in history mode
}

export const TransientMessageCard: React.FC<TransientMessageCardProps> = ({ 
  message, 
  showInHistory = false 
}) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!message.metadata?.isTransient) {
    return null;
  }

  // Format content for display
  const preview = message.content.length > 50 
    ? `${message.content.substring(0, 50)}...` 
    : message.content;

  return (
    <div className="my-1 text-xs text-gray-500 max-w-full">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 hover:text-gray-400 transition-colors w-full text-left group"
      >
        <ChevronRight 
          className={`w-3 h-3 transition-transform flex-shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`} 
        />
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span className="italic truncate min-w-0 flex-1">
          {preview}
        </span>
        <span className="text-[10px] text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatDistanceToNow(message.timestamp, { addSuffix: true })}
        </span>
      </button>
      
      {expanded && (
        <div className="ml-5 mt-1 p-2 bg-gray-900/50 rounded text-gray-400 border-l-2 border-gray-700">
          <div className="flex items-start gap-2">
            <MessageCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">{message.content}</div>
              
              {/* Show metadata in expanded view */}
              {showInHistory && (
                <div className="mt-2 space-y-1 text-[10px] text-gray-600">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">Type:</span> {message.metadata?.messageClass || 'status'}
                    </div>
                    <div>
                      <span className="text-gray-500">Priority:</span> {message.metadata?.displayPriority || 'ephemeral'}
                    </div>
                  </div>
                  
                  {message.metadata?.sessionId && (
                    <div>
                      <span className="text-gray-500">Session:</span> 
                      <span className="font-mono ml-1">{message.metadata.sessionId.substring(0, 8)}...</span>
                    </div>
                  )}
                  
                  {message.metadata?.requestId && (
                    <div>
                      <span className="text-gray-500">Request:</span> 
                      <span className="font-mono ml-1">{message.metadata.requestId.substring(0, 8)}...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Batch display for multiple transient messages
export const TransientMessageBatch: React.FC<{
  messages: ProcessedMessage[];
  onExpand?: (messageId: string) => void;
}> = ({ messages, onExpand }) => {
  const [showAll, setShowAll] = useState(false);
  
  const transientMessages = messages.filter(m => m.metadata?.isTransient);
  
  if (transientMessages.length === 0) {
    return null;
  }

  if (transientMessages.length === 1) {
    return <TransientMessageCard message={transientMessages[0]} />;
  }

  return (
    <div className="my-2 text-xs text-gray-500">
      <button 
        onClick={() => setShowAll(!showAll)}
        className="flex items-center gap-2 hover:text-gray-400 transition-colors group"
      >
        <ChevronRight 
          className={`w-3 h-3 transition-transform ${
            showAll ? 'rotate-90' : ''
          }`} 
        />
        <Clock className="w-3 h-3" />
        <span className="italic">
          {transientMessages.length} status messages
        </span>
        <span className="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </span>
      </button>
      
      {showAll && (
        <div className="ml-5 mt-1 space-y-1">
          {transientMessages.map((message) => (
            <TransientMessageCard 
              key={message.id} 
              message={message} 
              showInHistory={true}
            />
          ))}
        </div>
      )}
    </div>
  );
};