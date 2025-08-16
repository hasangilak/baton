import { useMemo } from 'react';
import type { Message, InteractivePrompt } from '../types';
import type { ProcessedMessage } from '../services/chat/messages';
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
  // Database messages (can be either type - ProcessedMessage from store or Message from API)
  dbMessages?: (Message | ProcessedMessage)[];
  
  // WebSocket-based chat state
  streamingMessage?: Message | null;
  optimisticUserMessage?: Message | null;
  isStreaming: boolean;
  
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
  streamingMessage,
  optimisticUserMessage,
  isStreaming,
  pendingPrompts,
  selectedConversationId
}: UseConversationItemsProps): ConversationItem[] {
  
  return useMemo(() => {
    const items: ConversationItem[] = [];
    let sortOrder = 0;
    
    // 1. Transform database messages (handle both Message and ProcessedMessage types)
    dbMessages.forEach((message) => {
      // Type guard to handle both ProcessedMessage and Message types
      const isProcessedMessage = 'timestamp' in message && typeof message.timestamp === 'number';
      
      // Get timestamp from appropriate field
      const timestamp = isProcessedMessage 
        ? (message as ProcessedMessage).timestamp 
        : new Date((message as Message).createdAt).getTime();
      
      console.log('🔄 Converting message for display:', {
        messageId: message.id,
        messageType: isProcessedMessage ? 'ProcessedMessage' : 'Message',
        hasTimestamp: isProcessedMessage,
        hasCreatedAt: 'createdAt' in message,
        timestamp
      });
      
      const item: MessageConversationItem = {
        id: message.id,
        type: 'message',
        status: 'completed',
        timestamp,
        sortOrder: sortOrder++,
        data: message as any // Type assertion - MessageConversationItem expects Message but we support both
      };
      items.push(item);
    });
    
    // 2. Add optimistic user message (shown immediately when user sends message)
    if (optimisticUserMessage) {
      const item: MessageConversationItem = {
        id: optimisticUserMessage.id,
        type: 'message',
        status: 'completed', // User messages are immediately "completed"
        timestamp: new Date(optimisticUserMessage.createdAt).getTime(),
        sortOrder: sortOrder++,
        data: optimisticUserMessage
      };
      items.push(item);
    }
    
    // 3. Add streaming assistant message (if currently streaming)
    if (streamingMessage) {
      const item: CurrentStreamingConversationItem = {
        id: streamingMessage.id,
        type: 'message',
        status: streamingMessage.status === 'completed' ? 'completed' : 'active-streaming',
        timestamp: new Date(streamingMessage.createdAt).getTime(),
        sortOrder: sortOrder++,
        data: streamingMessage,
        originalMessage: streamingMessage,
        isStreamingMessage: true,
        isStreaming: streamingMessage.status !== 'completed'
      };
      items.push(item);
    }
    
    // 4. Add loading state if streaming but no streaming message yet
    else if (isStreaming) {
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
    
  }, [dbMessages, streamingMessage, optimisticUserMessage, isStreaming, pendingPrompts, selectedConversationId]);
}