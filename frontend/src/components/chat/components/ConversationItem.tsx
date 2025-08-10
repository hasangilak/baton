import React from 'react';
import type { ConversationItem } from '../../../types/conversation';
import type { Message } from '../../../types';
import { MessageBubble, LoadingMessage } from './MessageBubble';
import { InteractivePromptComponent } from '../InteractivePrompt';
import PlanReviewModal, { type PlanReviewDecision } from '../PlanReviewModal';
import { extractMessageContent } from './messageUtils';
import { isMessageItem, isPromptItem, isPlanReviewItem, isLoadingItem } from '../../../types/conversation';

interface ConversationItemProps {
  item: ConversationItem;
  onPromptResponse?: (promptId: string, optionId: string) => void;
  onPlanReviewDecision?: (planReviewId: string, decision: PlanReviewDecision) => void;
  isRespondingToPrompt?: boolean;
}

/**
 * Unified conversation item renderer - handles all types of conversation elements
 * Replaces inline type checking and rendering logic in layout components
 */
export const ConversationItemRenderer: React.FC<ConversationItemProps> = ({
  item,
  onPromptResponse,
  onPlanReviewDecision,
  isRespondingToPrompt = false
}) => {
  // Handle loading items
  if (isLoadingItem(item)) {
    return <LoadingMessage />;
  }
  
  // Handle prompt items
  if (isPromptItem(item)) {
    return (
      <InteractivePromptComponent
        prompt={item.data}
        onOptionSelect={onPromptResponse || (() => {})}
        isResponding={isRespondingToPrompt}
      />
    );
  }
  
  // Handle plan review items
  if (isPlanReviewItem(item)) {
    return (
      <PlanReviewModal
        isOpen={item.data.status === 'pending'}
        onClose={() => {}} // Handled by parent
        planReviewId={item.data.id}
        conversationId={item.data.conversationId}
        planContent={item.data.planContent}
        title={item.data.title}
        message={item.data.message}
        onDecision={(decision) => onPlanReviewDecision?.(item.data.id, decision)}
      />
    );
  }
  
  // Handle message items (all types)
  if (isMessageItem(item)) {
    let message: Message;
    let streamingMessage: any = undefined;
    let isStreaming = false;
    
    if (item.status === 'completed') {
      // Database message - use directly
      message = item.data as Message;
    } else {
      // Streaming message - convert to Message format
      const streamingData = item.data;
      const timestamp = new Date(item.timestamp);
      
      message = {
        id: item.id,
        conversationId: '', // Will be filled by parent context
        role: streamingData.type === 'chat' ? (streamingData.role || 'assistant') : 'system',
        content: extractMessageContent(streamingData),
        status: item.status === 'active-streaming' ? 'sending' : 'completed',
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
        metadata: streamingData.type !== 'chat' ? {
          streamingType: streamingData.type,
          streamingSubtype: streamingData.subtype
        } : undefined
      };
      
      streamingMessage = streamingData;
      isStreaming = item.status === 'active-streaming';
    }
    
    return (
      <MessageBubble
        message={message}
        streamingMessage={streamingMessage}
        isStreaming={isStreaming}
        onPlanReviewDecision={onPlanReviewDecision}
      />
    );
  }
  
  // Fallback - shouldn't happen with proper typing
  console.warn('Unknown conversation item type:', item);
  return null;
};