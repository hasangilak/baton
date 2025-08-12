/**
 * Chat Integration Hook
 * 
 * Integrates the new Zustand chat store with existing conversation management
 * Provides a bridge between the old ChatContext API and the new store architecture
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { 
  useChatStore, 
  useSelectedConversationId,
  useConversationDetails,
  useChatMessages,
  useIsStreaming,
  useChatError,
  useIsLoadingMessages,
  useIsCreatingConversation,
  useShowSidebar,
  usePermissionMode,
  useInputValue,
  useSessionState,
  useBridgeServiceError,
  useAllMessages
} from '../../stores/chatStore';
import { useSocketStore } from '../../stores/socketStore';
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
  const error = useChatError();
  const isLoadingMessages = useIsLoadingMessages();
  const isCreatingConversation = useIsCreatingConversation();
  
  const showSidebar = useShowSidebar();
  const permissionMode = usePermissionMode();
  const inputValue = useInputValue();
  
  const sessionState = useSessionState();
  const bridgeServiceError = useBridgeServiceError();
  
  // Use reactive selector for messages
  const allMessages = useAllMessages();
  
  // Get socket connection state
  const isConnected = useSocketStore((state) => state.isConnected);

  // Create state object for compatibility (but don't use in useEffect deps!)
  const state = {
    selectedConversationId,
    conversationDetails: conversationDetailsFromStore,
    messages,
    isStreaming,
    error,
    isLoadingMessages,
    isCreatingConversation,
    showSidebar,
    permissionMode,
    inputValue,
    isConnected,
    bridgeServiceError,
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

  // Extract sessionId outside useEffect to prevent unnecessary re-renders
  const urlSessionId = searchParams.get('sessionId');
  
  // Track processed sessionId to prevent duplicate API calls
  const processedSessionRef = useRef<string | null>(null);

  // Handle two scenarios: new conversation vs existing conversation with sessionId
  useEffect(() => {
    
    if (urlSessionId) {
      // Guard: Skip if we've already processed this sessionId
      if (processedSessionRef.current === urlSessionId) {
        console.log('🔄 Skipping duplicate sessionId processing:', urlSessionId);
        return;
      }
      // Scenario 2: Existing conversation - find conversation by sessionId and load messages
      console.log('🔄 Scenario 2: Loading existing conversation for sessionId:', urlSessionId);
      
      const loadExistingConversation = async () => {
        try {
          // Mark as processed to prevent duplicate calls
          processedSessionRef.current = urlSessionId;
          
          // Use chatStore's enhanced fetchAndLoadMessages with sessionId
          // This will handle: find conversation + set up state + load messages in one call
          const store = useChatStore.getState();
          await store.fetchAndLoadMessages(undefined, urlSessionId);
        } catch (error) {
          console.error('❌ Error loading conversation by sessionId:', error);
        }
      };
      
      loadExistingConversation();
    } else {
      // Reset processed session when no sessionId in URL
      processedSessionRef.current = null;
      
      if (selectedConversationId) {
        // Scenario 1: New conversation - don't load messages, just set up session when available
        console.log('🔄 Scenario 1: New conversation for conversationId:', selectedConversationId);
        
        const setupNewConversation = async () => {
          const store = useChatStore.getState();
          
          // Only initialize session if we don't have one yet
          const currentSession = store.sessionState[selectedConversationId];
          if (!currentSession?.sessionId && !currentSession?.pending) {
            console.log('🆔 Setting up new conversation session for:', selectedConversationId);
            await store.initializeSession(selectedConversationId);
          }
          
          // For new conversations, DO NOT load messages - they will come from Claude responses
        };
        
        setupNewConversation();
      }
    }
  }, [selectedConversationId, urlSessionId]);

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
      const isFirstMessage = messages.length === 0;
      
      console.log('🔍 [DEBUG] Session info:', {
        conversationId,
        sessionId: session?.sessionId,
        isFirstMessage,
        sessionReady: useChatStore.getState().isSessionReady(conversationId),
        sessionPending: useChatStore.getState().isSessionPending(conversationId),
      });
      
      // Join conversation room if not already joined
      await useChatStore.getState().joinConversationWithSession(conversationId);
      
      // Start streaming
      useChatStore.getState().setStreamingState(true);
      
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
        permissionMode, // Include current permission mode
      });
      
      useChatStore.getState().setInputValue('');
      useChatStore.getState().setError(null);
      
      console.log('✅ [DEBUG] Message sent successfully via WebSocket');
      
    } catch (error) {
      console.error('❌ [DEBUG] ChatIntegration.sendMessage error:', error);
      
      // Stop streaming on error
      useChatStore.getState().setStreamingState(false);
      useChatStore.getState().setError(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  // Setup enhanced WebSocket handlers that integrate with React Query
  useEffect(() => {
    const { on, off } = useSocketStore.getState();
    
    // Enhanced session available handler with URL updates
    const handleSessionAvailable = (data: any) => {
      if (data.conversationId === selectedConversationId && data.sessionId) {
        // Update URL with session ID
        setSearchParams(prev => ({
          ...Object.fromEntries(prev),
          sessionId: data.sessionId,
        }));
        
        // Invalidate conversation data to reflect new session ID
        queryClient.invalidateQueries({
          queryKey: ['chat', 'conversation', data.conversationId],
        });
        
        // Also invalidate conversations list to update session info in sidebar
        queryClient.invalidateQueries({
          queryKey: ['chat', 'conversations', projectId],
        });
        
        console.log('🔗 Updated URL with session ID and invalidated caches:', data.sessionId);
      }
    };
    
    // Enhanced message complete handler with query invalidation
    const handleMessageComplete = (data: any) => {
      const conversationId = data.conversationId || selectedConversationId;
      if (conversationId) {
        // Invalidate conversation details (for updated timestamps, etc.)
        queryClient.invalidateQueries({
          queryKey: ['chat', 'conversation', conversationId],
        });
        
        // Invalidate conversations list (for updated timestamps in sidebar)
        queryClient.invalidateQueries({
          queryKey: ['chat', 'conversations', projectId],
        });
        
        console.log('🔄 Invalidated React Query caches after message completion');
      }
    };
    
    // Set up additional WebSocket listeners for integration features
    on('chat:session-id-available', handleSessionAvailable);
    on('chat:message-complete', handleMessageComplete);
    
    // Also set up the core chat store handlers
    const cleanup = useChatStore.getState().setupWebSocketHandlers();
    
    return () => {
      // Clean up additional handlers
      off('chat:session-id-available', handleSessionAvailable);
      off('chat:message-complete', handleMessageComplete);
      // Clean up core handlers
      cleanup();
    };
  }, [selectedConversationId, queryClient, setSearchParams]);

  // Computed values
  const isNewChat = useMemo(() => {
    return useChatStore.getState().isNewChat();
  }, [selectedConversationId, messages.length, isStreaming]);

  // Bridge service retry function
  const retryBridgeMessage = () => {
    console.log('🔄 Attempting to retry bridge message');
    return useChatStore.getState().retryLastMessage();
  };

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
    getAllMessages: () => allMessages,
    
    // Session management
    sessionState: sessionState,
    isSessionReady: useChatStore.getState().isSessionReady,
    isSessionPending: useChatStore.getState().isSessionPending,
    initializeSession: useChatStore.getState().initializeSession,
    
    // Bridge service management
    retryBridgeMessage,
    
    // UI actions
    setInputValue: useChatStore.getState().setInputValue,
    setSidebarVisible: useChatStore.getState().setSidebarVisible,
    setPermissionMode: useChatStore.getState().setPermissionMode,
    
    // Utility
    isNewChat,
    clearError: useChatStore.getState().clearError,
    clearBridgeError: useChatStore.getState().clearBridgeError,
  };
};