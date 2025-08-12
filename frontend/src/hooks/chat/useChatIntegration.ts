/**
 * Chat Integration Hook
 * 
 * Integrates the new Zustand chat store with existing conversation management
 * Provides a bridge between the old ChatContext API and the new store architecture
 */

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { 
  useChatStore, 
  useSelectedConversationId,
  useConversationDetails,
  useChatMessages,
  useIsStreaming,
  useStreamingMessage,
  useOptimisticUserMessage,
  useChatError,
  useIsLoadingMessages,
  useIsCreatingConversation,
  useShowSidebar,
  usePermissionMode,
  useInputValue,
  useSessionState
} from '../../stores/chatStore';
import { useConversations, useConversation } from './useConversations';
import type { ProcessedMessage } from '../../services/chat/messages';

export const useChatIntegration = (projectId: string) => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Use individual selectors to prevent object recreation and infinite loops
  const selectedConversationId = useSelectedConversationId();
  const conversationDetailsFromStore = useConversationDetails();
  const messages = useChatMessages();
  const isStreaming = useIsStreaming();
  const streamingMessage = useStreamingMessage();
  const optimisticUserMessage = useOptimisticUserMessage();
  const error = useChatError();
  const isLoadingMessages = useIsLoadingMessages();
  const isCreatingConversation = useIsCreatingConversation();
  
  const showSidebar = useShowSidebar();
  const permissionMode = usePermissionMode();
  const inputValue = useInputValue();
  
  const sessionState = useSessionState();

  // Create state object for compatibility (but don't use in useEffect deps!)
  const state = {
    selectedConversationId,
    conversationDetails: conversationDetailsFromStore,
    messages,
    isStreaming,
    streamingMessage,
    optimisticUserMessage,
    error,
    isLoadingMessages,
    isCreatingConversation,
    showSidebar,
    permissionMode,
    inputValue,
  };

  // Get conversation management hooks
  const {
    conversations,
    createConversation: createConversationMutation,
    archiveConversation: archiveConversationMutation,
    deleteConversation: deleteConversationMutation,
  } = useConversations(projectId);

  const { data: conversationDetails, refetch: refetchConversation } = useConversation(selectedConversationId);

  // Sync conversation details with store when they change
  useEffect(() => {
    if (conversationDetails !== conversationDetailsFromStore) {
      useChatStore.getState().setConversationDetails(conversationDetails);
    }
  }, [conversationDetails, conversationDetailsFromStore]);

  // Enhanced conversation management that integrates with mutations
  const createConversation = async (title?: string): Promise<string | null> => {
    useChatStore.getState().setCreatingConversation(true);
    try {
      const result = await createConversationMutation.mutateAsync(title);
      const newId = result?.id || result?.conversation?.id;
      if (newId) {
        useChatStore.getState().selectConversation(newId);
        return newId;
      }
      return null;
    } finally {
      useChatStore.getState().setCreatingConversation(false);
    }
  };

  const archiveConversation = async (id: string) => {
    await archiveConversationMutation.mutateAsync(id);
    if (selectedConversationId === id) {
      useChatStore.getState().selectConversation(null);
    }
  };

  const deleteConversation = async (id: string) => {
    await deleteConversationMutation.mutateAsync(id);
    if (selectedConversationId === id) {
      useChatStore.getState().selectConversation(null);
    }
  };

  // Enhanced sendMessage that handles conversation creation
  const sendMessage = async (content: string, attachments?: any[]) => {
    console.log('🔍 [DEBUG] ChatIntegration.sendMessage called:', {
      contentLength: content?.length || 0,
      hasAttachments: !!attachments?.length,
      selectedConversationId: selectedConversationId,
    });

    try {
      let conversationId = selectedConversationId;
      
      // If no conversation selected, create one first
      if (!conversationId) {
        console.log('🔍 [DEBUG] No conversation selected, creating new one');
        const newId = await createConversation(content.slice(0, 40) || 'New Chat');
        if (!newId) {
          throw new Error('Failed to create conversation');
        }
        conversationId = newId;
        console.log('✅ [DEBUG] Created new conversation:', conversationId);
      }
      
      // Get session information
      const session = sessionState[conversationId];
      const isFirstMessage = messages.length === 0 && !optimisticUserMessage;
      
      console.log('🔍 [DEBUG] Session info:', {
        conversationId,
        sessionId: session?.sessionId,
        isFirstMessage,
        sessionReady: useChatStore.getState().isSessionReady(conversationId),
        sessionPending: useChatStore.getState().isSessionPending(conversationId),
      });
      
      // Join conversation room if not already joined
      await useChatStore.getState().joinConversationWithSession(conversationId);
      
      // Create optimistic user message
      const optimisticMessage: ProcessedMessage = {
        id: `user_${Date.now()}`,
        type: 'user',
        content,
        timestamp: Date.now(),
        metadata: {
          conversationId,
          isComplete: true,
          optimistic: true,
        },
      };

      useChatStore.getState().setOptimisticMessage(optimisticMessage);
      useChatStore.getState().setStreamingState(true, null);
      
      // Send via WebSocket
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('🔍 [DEBUG] Sending message via WebSocket:', {
        conversationId,
        sessionId: session?.sessionId,
        requestId,
        isFirstMessage,
      });
      
      useChatStore.getState().sendWebSocketMessage({
        conversationId,
        content: content, // Backend expects 'content', not 'message'
        attachments,
        requestId,
        sessionId: session?.sessionId, // Include session ID when available
      });
      
      useChatStore.getState().setInputValue('');
      useChatStore.getState().setError(null);
      
      console.log('✅ [DEBUG] Message sent successfully via WebSocket');
      
    } catch (error) {
      console.error('❌ [DEBUG] ChatIntegration.sendMessage error:', error);
      
      // Clear optimistic states on error
      useChatStore.getState().setOptimisticMessage(null);
      useChatStore.getState().setStreamingState(false, null);
      useChatStore.getState().setError(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  // Setup enhanced WebSocket handlers that integrate with React Query
  useEffect(() => {
    const cleanup = useChatStore.getState().setupWebSocketHandlers();
    
    // Override the message complete handler to integrate with React Query
    const originalSetup = useChatStore.getState().setupWebSocketHandlers;
    useChatStore.setState({
      setupWebSocketHandlers: () => {
        const originalCleanup = originalSetup();
        
        // Add additional handler for query invalidation
        const handleMessageComplete = () => {
          queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', selectedConversationId],
          });
        };

        const handleSessionAvailable = (data: any) => {
          if (data.sessionId) {
            setSearchParams(prev => ({
              ...Object.fromEntries(prev),
              sessionId: data.sessionId,
            }));
          }
        };

        // Note: In a full implementation, we'd need to properly integrate these handlers
        // For now, we'll rely on the existing setup
        
        return () => {
          originalCleanup();
          // Additional cleanup if needed
        };
      }
    });
    
    return cleanup;
  }, [selectedConversationId, queryClient, setSearchParams]);

  // Computed values
  const isNewChat = useMemo(() => {
    return useChatStore.getState().isNewChat();
  }, [selectedConversationId, messages.length, optimisticUserMessage, isStreaming]);

  // Return a ChatContext-compatible interface
  return {
    // State
    state,
    
    // Conversation management
    conversations,
    createConversation,
    archiveConversation,
    deleteConversation,
    selectConversation: useChatStore.getState().selectConversation,
    
    // Message management
    sendMessage,
    stopStreaming: useChatStore.getState().abortMessage,
    loadMessages: useChatStore.getState().loadMessages,
    getAllMessages: useChatStore.getState().getAllMessages,
    
    // Session management
    sessionState: sessionState,
    isSessionReady: useChatStore.getState().isSessionReady,
    isSessionPending: useChatStore.getState().isSessionPending,
    initializeSession: useChatStore.getState().initializeSession,
    
    // UI actions
    setInputValue: useChatStore.getState().setInputValue,
    setSidebarVisible: useChatStore.getState().setSidebarVisible,
    setPermissionMode: useChatStore.getState().setPermissionMode,
    
    // Utility
    isNewChat,
    clearError: useChatStore.getState().clearError,
  };
};