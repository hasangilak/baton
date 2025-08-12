import type { Message } from '../../types';

// Simplified message types for the new pipeline
export interface ProcessedMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool' | 'result' | 'error' | 'abort';
  content: string;
  timestamp: number;
  metadata?: {
    requestId?: string;
    conversationId?: string;
    sessionId?: string;
    isStreaming?: boolean;
    isComplete?: boolean;
    toolName?: string;
    toolInput?: any;
    toolOutput?: any;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    cost?: number;
    duration?: number;
    [key: string]: any;
  };
}

// WebSocket message formats from Claude Code SDK
interface SDKMessage {
  type: 'assistant' | 'user' | 'system' | 'result';
  subtype?: 'init' | 'success' | 'error_max_turns' | 'error_during_execution';
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: Array<{ type: string; text?: string; name?: string; input?: any; id?: string }>;
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
  is_error?: boolean;
  num_turns?: number;
}

interface StreamResponseMessage {
  type: 'claude_json' | 'error' | 'done' | 'aborted';
  data?: SDKMessage;
  error?: string;
  requestId?: string;
  timestamp?: number;
}

/**
 * Message Processing Pipeline - Centralized message transformation
 */
export class MessageProcessor {
  /**
   * Process any message into a standardized format
   */
  static processMessage(rawMessage: any): ProcessedMessage | null {
    try {
      // Handle different message formats
      if (rawMessage.type === 'claude_json' && rawMessage.data) {
        return this.processSDKMessage(rawMessage);
      } else if (rawMessage.type === 'error') {
        return this.processErrorMessage(rawMessage);
      } else if (rawMessage.type === 'done') {
        return this.processCompletionMessage(rawMessage);
      } else if (rawMessage.type === 'aborted') {
        return this.processAbortMessage(rawMessage);
      } else if (rawMessage.role || rawMessage.message) {
        return this.processLegacyMessage(rawMessage);
      }

      return null;
    } catch (error) {
      console.error('❌ Message processing error:', error);
      return null;
    }
  }

  /**
   * Process Claude Code SDK messages
   */
  private static processSDKMessage(rawMessage: StreamResponseMessage): ProcessedMessage | null {
    const { data } = rawMessage;
    if (!data) return null;

    const messageId = data.message?.id || rawMessage.requestId || `msg_${Date.now()}`;
    const timestamp = rawMessage.timestamp || Date.now();

    // Handle different SDK message types
    switch (data.type) {
      case 'assistant':
        return this.processAssistantMessage(data, messageId, timestamp);
      case 'user':
        return this.processUserMessage(data, messageId, timestamp);
      case 'system':
        return this.processSystemMessage(data, messageId, timestamp);
      case 'result':
        return this.processResultMessage(data, messageId, timestamp);
      default:
        return null;
    }
  }

  private static processAssistantMessage(data: SDKMessage, messageId: string, timestamp: number): ProcessedMessage {
    const content = data.message?.content || [];
    
    // Check if this is a tool use message
    const toolUseBlocks = content.filter(block => block.type === 'tool_use');
    const textBlocks = content.filter(block => block.type === 'text');
    
    if (toolUseBlocks.length > 0) {
      // This is a tool message
      return {
        id: messageId,
        type: 'tool',
        content: textBlocks.map(block => block.text).join('') || '',
        timestamp,
        metadata: {
          sessionId: data.session_id,
          toolName: toolUseBlocks[0]?.name,
          toolInput: toolUseBlocks[0]?.input,
          usage: data.message?.usage,
          cost: data.total_cost_usd,
          duration: data.duration_ms,
          isComplete: true
        }
      };
    }

    // Regular assistant message
    return {
      id: messageId,
      type: 'assistant',
      content: textBlocks.map(block => block.text).join('') || '',
      timestamp,
      metadata: {
        sessionId: data.session_id,
        usage: data.message?.usage,
        cost: data.total_cost_usd,
        duration: data.duration_ms,
        model: data.message?.model,
        isComplete: true
      }
    };
  }

  private static processUserMessage(data: SDKMessage, messageId: string, timestamp: number): ProcessedMessage {
    const content = data.message?.content?.map(block => block.text).join('') || '';
    
    return {
      id: messageId,
      type: 'user',
      content,
      timestamp,
      metadata: {
        sessionId: data.session_id,
        isComplete: true
      }
    };
  }

  private static processSystemMessage(data: SDKMessage, messageId: string, timestamp: number): ProcessedMessage {
    return {
      id: messageId,
      type: 'system',
      content: data.message?.content?.map(block => block.text).join('') || '',
      timestamp,
      metadata: {
        subtype: data.subtype,
        sessionId: data.session_id,
        isComplete: true
      }
    };
  }

  private static processResultMessage(data: SDKMessage, messageId: string, timestamp: number): ProcessedMessage {
    return {
      id: messageId,
      type: 'result',
      content: data.result || '',
      timestamp,
      metadata: {
        sessionId: data.session_id,
        usage: data.message?.usage,
        cost: data.total_cost_usd,
        duration: data.duration_ms,
        isComplete: true
      }
    };
  }

  private static processErrorMessage(rawMessage: any): ProcessedMessage {
    return {
      id: rawMessage.requestId || `error_${Date.now()}`,
      type: 'error',
      content: rawMessage.error || 'Unknown error occurred',
      timestamp: rawMessage.timestamp || Date.now(),
      metadata: {
        requestId: rawMessage.requestId,
        isComplete: true
      }
    };
  }

  private static processCompletionMessage(rawMessage: any): ProcessedMessage | null {
    // Completion messages are usually just status updates, might not need UI representation
    return null;
  }

  private static processAbortMessage(rawMessage: any): ProcessedMessage {
    return {
      id: rawMessage.requestId || `abort_${Date.now()}`,
      type: 'abort',
      content: rawMessage.reason || 'Request was aborted',
      timestamp: rawMessage.timestamp || Date.now(),
      metadata: {
        requestId: rawMessage.requestId,
        isComplete: true
      }
    };
  }

  private static processLegacyMessage(rawMessage: any): ProcessedMessage {
    // Handle legacy message formats from the database
    const messageType = this.determineLegacyMessageType(rawMessage);
    
    return {
      id: rawMessage.id || `legacy_${Date.now()}`,
      type: messageType,
      content: rawMessage.content || rawMessage.message || '',
      timestamp: rawMessage.createdAt ? new Date(rawMessage.createdAt).getTime() : Date.now(),
      metadata: {
        conversationId: rawMessage.conversationId,
        sessionId: rawMessage.sessionId,
        claudeMessageId: rawMessage.claudeMessageId,
        model: rawMessage.model,
        usage: rawMessage.usage,
        attachments: rawMessage.attachments,
        status: rawMessage.status,
        isComplete: true,
        legacy: true,
        optimistic: false // Mark database messages as non-optimistic
      }
    };
  }

  private static determineLegacyMessageType(message: any): ProcessedMessage['type'] {
    if (message.role === 'user') return 'user';
    if (message.role === 'assistant') return 'assistant';
    if (message.role === 'system') return 'system';
    if (message.name && message.input) return 'tool';
    if (message.error) return 'error';
    return 'system'; // default fallback
  }

  /**
   * Batch process multiple messages
   */
  static processMessages(rawMessages: any[]): ProcessedMessage[] {
    return rawMessages
      .map(message => this.processMessage(message))
      .filter((message): message is ProcessedMessage => message !== null);
  }

  /**
   * Filter out duplicate messages based on ID and content
   */
  static deduplicateMessages(messages: ProcessedMessage[]): ProcessedMessage[] {
    const seen = new Map<string, ProcessedMessage>();
    
    for (const message of messages) {
      const key = `${message.id}_${message.type}`;
      if (!seen.has(key) || seen.get(key)!.timestamp < message.timestamp) {
        seen.set(key, message);
      }
    }
    
    return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Merge streaming updates with existing messages
   */
  static mergeStreamingMessage(
    existingMessages: ProcessedMessage[],
    streamingMessage: ProcessedMessage
  ): ProcessedMessage[] {
    const messages = [...existingMessages];
    const existingIndex = messages.findIndex(m => m.id === streamingMessage.id);
    
    if (existingIndex >= 0) {
      // Update existing message
      messages[existingIndex] = streamingMessage;
    } else {
      // Add new message
      messages.push(streamingMessage);
    }
    
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }
}