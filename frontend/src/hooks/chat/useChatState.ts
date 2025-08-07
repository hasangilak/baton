/**
 * Chat State Management Hook - Based on Claude Code WebUI Architecture
 * 
 * Manages message history, loading states, session and request IDs,
 * following the comprehensive implementation guide patterns.
 */

import { useState, useCallback } from 'react';
import type { AllMessage, ChatStateOptions } from '../../types/streaming';
import { generateId, generateMessageId } from '../../utils/id';

// Default system message
const DEFAULT_MESSAGES: AllMessage[] = [
  {
    type: "system",
    subtype: "welcome",
    message: "Welcome to Baton AI Chat. How can I help you today?",
    timestamp: Date.now(),
  },
];

export function useChatState(options: ChatStateOptions = {}) {
  const {
    defaultMessages = DEFAULT_MESSAGES,
    autoScroll = true,
  } = options;

  // Core state
  const [messages, setMessages] = useState<AllMessage[]>(defaultMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  // Message manipulation functions
  const addMessage = useCallback((msg: AllMessage) => {
    setMessages((prev) => {
      // Ensure message has a stable id for React keys
      const withId: AllMessage = (msg as any).id ? msg : ({ ...(msg as any), id: generateMessageId() } as AllMessage);

      // Avoid duplicate messages by checking timestamp and content
      const isDuplicate = prev.some(existing => 
        (existing as any).id && (withId as any).id ? (existing as any).id === (withId as any).id : (
          existing.timestamp === withId.timestamp && JSON.stringify(existing) === JSON.stringify(withId)
        )
      );
      
      if (isDuplicate) {
        return prev;
      }
      
      return [...prev, withId];
    });
  }, []);

  const updateLastMessage = useCallback((content: string) => {
    setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex < 0) return prev;
      
      const lastMessage = prev[lastIndex];
      if (lastMessage && lastMessage.type === "chat") {
        const updatedMessage = { ...lastMessage, content };
        return [...prev.slice(0, lastIndex), updatedMessage];
      }
      
      return prev;
    });
  }, []);

  const updateMessage = useCallback((index: number, updates: Partial<AllMessage>) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      
      const currentMessage = prev[index];
      if (!currentMessage) return prev;
      
      const updatedMessage = { ...currentMessage, ...updates } as AllMessage;
      return [...prev.slice(0, index), updatedMessage, ...prev.slice(index + 1)];
    });
  }, []);

  const removeMessage = useCallback((index: number) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages(defaultMessages);
  }, [defaultMessages]);

  // Request ID management
  const generateRequestId = useCallback(() => {
    const requestId = generateId();
    setCurrentRequestId(requestId);
    return requestId;
  }, []);

  const clearRequestId = useCallback(() => {
    setCurrentRequestId(null);
  }, []);

  // Loading state management
  const startRequest = useCallback(() => {
    setIsLoading(true);
  }, []);

  const finishRequest = useCallback(() => {
    setIsLoading(false);
    setCurrentRequestId(null);
  }, []);

  const resetRequestState = useCallback(() => {
    setIsLoading(false);
    setCurrentRequestId(null);
  }, []);

  // Session management
  const updateSessionId = useCallback((sessionId: string) => {
    console.log('🆔 Updating session ID:', sessionId);
    setCurrentSessionId(sessionId);
  }, []);

  const clearSession = useCallback(() => {
    setCurrentSessionId(null);
  }, []);

  // Utility functions
  const getLastMessage = useCallback(() => {
    return messages[messages.length - 1] || null;
  }, [messages]);

  const getMessageCount = useCallback(() => {
    return messages.length;
  }, [messages]);

  const getUserMessageCount = useCallback(() => {
    return messages.filter(msg => msg.type === "chat" && "role" in msg && msg.role === "user").length;
  }, [messages]);

  const getAssistantMessageCount = useCallback(() => {
    return messages.filter(msg => msg.type === "chat" && "role" in msg && msg.role === "assistant").length;
  }, [messages]);

  // Find messages by type
  const findMessagesByType = useCallback((type: AllMessage['type']) => {
    return messages.filter(msg => msg.type === type);
  }, [messages]);

  // Get conversation summary
  const getConversationSummary = useCallback(() => {
    const userMessages = getUserMessageCount();
    const assistantMessages = getAssistantMessageCount();
    const systemMessages = findMessagesByType('system').length;
    
    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      systemMessages,
      hasActiveSession: !!currentSessionId,
      isLoading,
    };
  }, [messages.length, getUserMessageCount, getAssistantMessageCount, findMessagesByType, currentSessionId, isLoading]);

  return {
    // State
    messages,
    input,
    isLoading,
    currentSessionId,
    currentRequestId,
    
    // Setters
    setMessages,
    setInput,
    setCurrentSessionId,
    
    // Message management
    addMessage,
    updateLastMessage,
    updateMessage,
    removeMessage,
    clearMessages,
    
    // Request management
    generateRequestId,
    clearRequestId,
    startRequest,
    finishRequest,
    resetRequestState,
    
    // Session management
    updateSessionId,
    clearSession,
    
    // Utilities
    getLastMessage,
    getMessageCount,
    getUserMessageCount,
    getAssistantMessageCount,
    findMessagesByType,
    getConversationSummary,
    
    // Options
    autoScroll,
  };
}