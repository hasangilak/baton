import React from 'react';
import { Sparkles } from 'lucide-react';
import { MessageTypeRenderer } from '../messages/MessageTypeRenderer';
import type { Message } from '../../../types';
import type { PlanReviewDecision } from '../PlanReviewModal';

interface Props { 
  message: Message; 
  isStreaming?: boolean; 
  streamingMessage?: any;
  onPlanReviewDecision?: (planReviewId: string, decision: PlanReviewDecision) => void;
}

export const MessageBubble: React.FC<Props> = ({ message, isStreaming, streamingMessage, onPlanReviewDecision }) => {
  let processedMessage = message;
  if (streamingMessage) {
    processedMessage = {
      ...message,
      metadata: {
        ...message.metadata,
        streamingType: streamingMessage.type,
        streamingSubtype: streamingMessage.subtype,
        streamingData: streamingMessage,
        ...(streamingMessage.type === 'tool_use' ? { toolName: streamingMessage.name || 'Tool', toolInput: streamingMessage.input || streamingMessage.args || streamingMessage.parameters } : {})
      }
    };
  }
  const handleCopy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); } catch (e) { console.error('Failed to copy', e); }
  };
  const handleRetry = (messageId: string) => { console.log('Retry message:', messageId); };
  return (
    <div className="mb-6" data-testid={`message-${message.id}`} data-testid-role={`message-role-${message.role}`} data-testid-status={message.status}>
  <MessageTypeRenderer 
    message={processedMessage} 
    isStreaming={isStreaming} 
    onCopy={(c) => handleCopy(c)} 
    onRetry={handleRetry}
    onPlanReviewDecision={onPlanReviewDecision}
  />
    </div>
  );
};

export const LoadingMessage: React.FC = () => (
  <div className="mb-6">
    <div className="max-w-[85%]">
      <div className="flex items-start space-x-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#3E3E42]">
          <Sparkles className="w-4 h-4 text-[#FF6B6B]" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#8B8B8D] mb-1">Claude</p>
          <div className="inline-block px-4 py-2 rounded-xl bg-transparent text-[#E5E5E5]">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
              <span className="text-sm text-[#8B8B8D]">Claude is thinking...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
