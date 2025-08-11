/**
 * Unified Chat Messages Hook
 * 
 * Integrates WebSocket, message processing, and event bus for clean message management
 * Replaces the complex useChat hook with a streamlined, focused implementation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedWebSocket } from '../useUnifiedWebSocket';
import { MessageProcessor, type ProcessedMessage } from '../../services/chat/messages';
import { chatEventBus, ChatEvents } from '../../services/chat/eventBus';

interface ChatMessagesOptions {
  conversationId: string | null;
  autoConnect?: boolean;
}

interface ChatState {
  messages: ProcessedMessage[];
  streamingMessage: ProcessedMessage | null;
  optimisticUserMessage: ProcessedMessage | null;
  isStreaming: boolean;
  isConnected: boolean;
  error: string | null;
}

export const useChatMessages = (options: ChatMessagesOptions) => {
  const { conversationId, autoConnect = true } = options;
  
  const queryClient = useQueryClient();
  const unifiedWebSocket = useUnifiedWebSocket({ autoConnect, namespace: 'chat' });
  const { 
    connected, 
    emit, 
    on, 
    off,
    joinConversation, 
    leaveConversation,
    sendMessage: sendWebSocketMessage,
    abortMessage,
    _debug
  } = unifiedWebSocket;
  
  console.log('🔍 [DEBUG] useChatMessages useUnifiedWebSocket state:', {
    connected,
    debug: _debug,
    autoConnect,
    namespace: 'chat'
  });

  // Chat state
  const [state, setState] = useState<ChatState>({
    messages: [],
    streamingMessage: null,
    optimisticUserMessage: null,
    isStreaming: false,
    isConnected: false,
    error: null,
  });

  // Refs for managing request state
  const currentRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update connection state
  useEffect(() => {
    console.log('🔍 [DEBUG] useChatMessages connection state changed:', {
      connected,
      prevConnected: state.isConnected,
      namespace: 'chat'
    });
    
    setState(prev => ({ ...prev, isConnected: connected }));
    
    if (connected) {
      ChatEvents.connected('websocket');
    } else {
      ChatEvents.disconnected('connection lost');
    }
  }, [connected, state.isConnected]);

  // Join/leave conversation rooms
  useEffect(() => {
    if (connected && conversationId) {
      joinConversation(conversationId);
      return () => leaveConversation(conversationId);
    }
  }, [connected, conversationId, joinConversation, leaveConversation]);

  // Set up WebSocket event listeners
  useEffect(() => {
    if (!connected) return;

    // Stream response handler
    const handleStreamResponse = (data: any) => {
      if (data.conversationId !== conversationId) return;
      
      const processedMessage = MessageProcessor.processMessage(data);
      if (processedMessage) {
        setState(prev => ({
          ...prev,
          streamingMessage: processedMessage,
          isStreaming: !processedMessage.metadata?.isComplete
        }));
        
        ChatEvents.messageStreaming({
          messageId: processedMessage.id,
          content: processedMessage.content,
          isComplete: processedMessage.metadata?.isComplete || false,
          conversationId: conversationId || undefined
        });
      }
    };

    // Message complete handler
    const handleMessageComplete = (data: any) => {
      if (data.conversationId !== conversationId) return;
      
      setState(prev => ({
        ...prev,
        isStreaming: false,
        streamingMessage: null,
        optimisticUserMessage: null
      }));
      
      ChatEvents.messageComplete({
        messageId: data.messageId,
        conversationId: conversationId || undefined,
        sessionId: data.sessionId
      });
      
      currentRequestIdRef.current = null;
      
      // Refresh messages from server
      queryClient.invalidateQueries({
        queryKey: ['chat', 'messages', conversationId]
      });
    };

    // Error handler
    const handleError = (data: any) => {
      setState(prev => ({
        ...prev,
        isStreaming: false,
        streamingMessage: null,
        error: data.error
      }));
      
      ChatEvents.messageError({
        error: data.error,
        requestId: data.requestId,
        conversationId: conversationId || undefined
      });
      
      currentRequestIdRef.current = null;
    };

    // Abort handler
    const handleAbort = (data: any) => {
      if (data.requestId === currentRequestIdRef.current) {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          streamingMessage: null
        }));
        
        ChatEvents.messageAborted({
          requestId: data.requestId,
          reason: data.reason
        });
        
        currentRequestIdRef.current = null;
      }
    };

    // Register WebSocket listeners
    on('chat:stream-response', handleStreamResponse);
    on('chat:message-complete', handleMessageComplete);
    on('chat:error', handleError);
    on('chat:aborted', handleAbort);

    return () => {
      off('chat:stream-response', handleStreamResponse);
      off('chat:message-complete', handleMessageComplete);
      off('chat:error', handleError);
      off('chat:aborted', handleAbort);
    };
  }, [connected, conversationId, on, off, queryClient]);

  // Send message function
  const sendMessage = useCallback(async (
    content: string, 
    attachments?: Array<{
      filename: string;
      mimeType: string;
      size: number;
      url: string;
    }>
  ) => {
    console.log('🔍 [DEBUG] useChatMessages.sendMessage called:', {
      contentLength: content?.length || 0,
      hasAttachments: !!attachments?.length,
      connected,
      conversationId,
      sendWebSocketMessageExists: !!sendWebSocketMessage
    });
    
    if (!connected || !conversationId) {
      console.error('❌ [DEBUG] Cannot send message:', {
        connected,
        conversationId,
        error: 'Not connected or no conversation selected'
      });
      throw new Error('Not connected or no conversation selected');
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentRequestIdRef.current = requestId;

    // Create optimistic user message
    const optimisticMessage: ProcessedMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content,
      timestamp: Date.now(),
      metadata: {
        conversationId,
        isComplete: true,
        optimistic: true
      }
    };

    setState(prev => ({
      ...prev,
      optimisticUserMessage: optimisticMessage,
      isStreaming: true,
      error: null
    }));

    // Send via WebSocket
    console.log('🔍 [DEBUG] About to call sendWebSocketMessage with:', {
      conversationId,
      messageContent: content,
      requestId,
      attachmentsCount: attachments?.length || 0
    });
    
    sendWebSocketMessage({
      conversationId,
      message: content,
      attachments,
      requestId
    });
    
    console.log('✅ [DEBUG] sendWebSocketMessage called successfully');

    ChatEvents.messageReceived({
      messageId: optimisticMessage.id,
      content,
      type: 'user',
      conversationId
    });

  }, [connected, conversationId, sendWebSocketMessage]);

  // Stop streaming function
  const stopStreaming = useCallback(() => {
    if (currentRequestIdRef.current) {
      abortMessage(currentRequestIdRef.current);
    }
  }, [abortMessage]);

  // Load messages from database
  const loadMessages = useCallback((dbMessages: any[]) => {
    const processedMessages = MessageProcessor.processMessages(dbMessages);
    const deduplicatedMessages = MessageProcessor.deduplicateMessages(processedMessages);
    
    setState(prev => ({
      ...prev,
      messages: deduplicatedMessages
    }));
  }, []);

  // Get combined messages for rendering
  const getAllMessages = useCallback((): ProcessedMessage[] => {
    let allMessages = [...state.messages];
    
    // Add optimistic user message
    if (state.optimisticUserMessage) {
      allMessages = MessageProcessor.mergeStreamingMessage(allMessages, state.optimisticUserMessage);
    }
    
    // Add streaming message
    if (state.streamingMessage) {
      allMessages = MessageProcessor.mergeStreamingMessage(allMessages, state.streamingMessage);
    }
    
    return allMessages;
  }, [state.messages, state.optimisticUserMessage, state.streamingMessage]);

  return {
    // State
    messages: getAllMessages(),
    isStreaming: state.isStreaming,
    isConnected: state.isConnected,
    error: state.error,
    streamingMessage: state.streamingMessage,
    optimisticUserMessage: state.optimisticUserMessage,
    
    // Actions
    sendMessage,
    stopStreaming,
    loadMessages,
    
    // WebSocket state
    connected: state.isConnected,
  };
};