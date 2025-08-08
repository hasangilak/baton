import type { Message, InteractivePrompt } from './index';
import type { ChatMessage, SystemMessage } from './streaming';

/**
 * Unified conversation item types for single-source message rendering
 * Replaces the complex 4-source array concatenation with a single collection
 */

// Base conversation item with common properties
interface BaseConversationItem {
  id: string;
  timestamp: number;
  sortOrder: number; // For consistent chronological ordering
}

// Message items (persisted database messages)
export interface MessageConversationItem extends BaseConversationItem {
  type: 'message';
  status: 'completed';
  data: Message;
}

// Streaming message items (from Claude streaming)
export interface StreamingMessageConversationItem extends BaseConversationItem {
  type: 'message';
  status: 'streaming';
  data: ChatMessage | SystemMessage;
  originalMessage: ChatMessage | SystemMessage; // For compatibility
  isStreamingMessage: true;
}

// Current assistant message (actively streaming)
export interface CurrentStreamingConversationItem extends BaseConversationItem {
  type: 'message';
  status: 'active-streaming';
  data: ChatMessage;
  originalMessage: ChatMessage;
  isStreamingMessage: true;
  isStreaming: true;
}

// Interactive prompt items
export interface PromptConversationItem extends BaseConversationItem {
  type: 'prompt';
  data: InteractivePrompt;
}

// Loading state item
export interface LoadingConversationItem extends BaseConversationItem {
  type: 'loading';
}

// Union type for all conversation items
export type ConversationItem = 
  | MessageConversationItem
  | StreamingMessageConversationItem
  | CurrentStreamingConversationItem
  | PromptConversationItem
  | LoadingConversationItem;

// Helper type guards
export const isMessageItem = (item: ConversationItem): item is MessageConversationItem | StreamingMessageConversationItem | CurrentStreamingConversationItem => 
  item.type === 'message';

export const isPromptItem = (item: ConversationItem): item is PromptConversationItem => 
  item.type === 'prompt';

export const isLoadingItem = (item: ConversationItem): item is LoadingConversationItem => 
  item.type === 'loading';

export const isStreamingItem = (item: ConversationItem): item is StreamingMessageConversationItem | CurrentStreamingConversationItem => 
  isMessageItem(item) && (item.status === 'streaming' || item.status === 'active-streaming');