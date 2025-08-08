import { useMemo } from 'react';
import type { Message, InteractivePrompt } from '../types';
import type { 
  ConversationItem, 
  MessageConversationItem, 
  StreamingMessageConversationItem,
  CurrentStreamingConversationItem,
  PromptConversationItem,
  LoadingConversationItem 
} from '../types/conversation';
import { generateMessageId } from '../utils/id';

interface UseConversationItemsProps {
  // Database messages (persisted)
  dbMessages?: Message[];
  
  // Claude streaming state
  claudeStreaming: {
    messages: any[];
    currentAssistantMessage: any | null;
    isStreaming: boolean;
  };
  
  // Interactive prompts
  pendingPrompts: InteractivePrompt[];
  
  // Current conversation ID for message creation
  selectedConversationId?: string | null;
}

/**
 * Unified conversation items hook - replaces 4-source array concatenation
 * Returns a single, chronologically ordered array of all conversation elements
 */
export function useConversationItems({
  dbMessages = [],
  claudeStreaming,
  pendingPrompts,
  selectedConversationId
}: UseConversationItemsProps): ConversationItem[] {
  
  return useMemo(() => {
    const items: ConversationItem[] = [];
    let sortOrder = 0;
    
    // 1. Transform database messages
    dbMessages.forEach((message) => {
      const item: MessageConversationItem = {
        id: message.id,
        type: 'message',
        status: 'completed',
        timestamp: new Date(message.createdAt).getTime(),
        sortOrder: sortOrder++,
        data: message
      };
      items.push(item);
    });
    
    // 2. Transform completed streaming messages
    claudeStreaming.messages.forEach((msg: any, index: number) => {
      const messageId = msg.id || 
                       msg.timestamp?.toString() || 
                       `msg-${index}-${generateMessageId()}`;
      const timestamp = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
      
      
      const item: StreamingMessageConversationItem = {
        id: messageId,
        type: 'message',
        status: 'streaming',
        timestamp,
        sortOrder: sortOrder++,
        data: msg,
        originalMessage: msg,
        isStreamingMessage: true
      };
      items.push(item);
    });
    
    // 3. Transform current assistant message (if streaming)
    if (claudeStreaming.currentAssistantMessage) {
      const msg = claudeStreaming.currentAssistantMessage;
      const timestamp = Date.now();
      
      const item: CurrentStreamingConversationItem = {
        id: 'streaming',
        type: 'message',
        status: 'active-streaming',
        timestamp,
        sortOrder: sortOrder++,
        data: msg,
        originalMessage: msg,
        isStreamingMessage: true,
        isStreaming: true
      };
      items.push(item);
    }
    
    // 4. Add loading state if streaming but no current message
    else if (claudeStreaming.isStreaming) {
      const item: LoadingConversationItem = {
        id: 'loading',
        type: 'loading',
        timestamp: Date.now(),
        sortOrder: sortOrder++
      };
      items.push(item);
    }
    
    // 5. Transform interactive prompts
    pendingPrompts.forEach((prompt) => {
      const item: PromptConversationItem = {
        id: prompt.id,
        type: 'prompt',
        timestamp: new Date(prompt.createdAt).getTime(),
        sortOrder: sortOrder++,
        data: prompt
      };
      items.push(item);
    });
    
    // Sort chronologically by timestamp, then by sortOrder for stability
    return items.sort((a, b) => {
      const timeDiff = a.timestamp - b.timestamp;
      return timeDiff !== 0 ? timeDiff : a.sortOrder - b.sortOrder;
    });
    
  }, [dbMessages, claudeStreaming, pendingPrompts, selectedConversationId]);
}