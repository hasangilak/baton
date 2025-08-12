/**
 * Centralized Chat Context
 * 
 * Unifies all chat-related state and services into a single, clean context
 * Replaces multiple useState/useEffect hooks with centralized state management
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useConversation } from '../hooks/chat/useConversations';
import { MessageProcessor, type ProcessedMessage } from '../services/chat/messages';
import { useSocketStore, initializeSocketForChat } from '../stores/socketStore';
import { setSocketContext } from '../services/chat.service';

// Chat state interface
interface ChatState {
  // Current conversation
  selectedConversationId: string | null;
  conversationDetails: any | null;
  
  // Messages
  messages: ProcessedMessage[];
  isStreaming: boolean;
  streamingMessage: ProcessedMessage | null;
  optimisticUserMessage: ProcessedMessage | null;
  
  // UI state
  showSidebar: boolean;
  permissionMode: 'default' | 'plan' | 'acceptEdits';
  
  // Input state
  inputValue: string;
  
  // Loading states
  isLoadingMessages: boolean;
  isCreatingConversation: boolean;
  
  // Error state
  error: string | null;
}

// Action types
type ChatAction =
  | { type: 'SET_SELECTED_CONVERSATION'; payload: string | null }
  | { type: 'SET_CONVERSATION_DETAILS'; payload: any }
  | { type: 'SET_MESSAGES'; payload: ProcessedMessage[] }
  | { type: 'SET_STREAMING_STATE'; payload: { isStreaming: boolean; message?: ProcessedMessage | null } }
  | { type: 'SET_OPTIMISTIC_MESSAGE'; payload: ProcessedMessage | null }
  | { type: 'SET_SIDEBAR_VISIBLE'; payload: boolean }
  | { type: 'SET_PERMISSION_MODE'; payload: 'default' | 'plan' | 'acceptEdits' }
  | { type: 'SET_INPUT_VALUE'; payload: string }
  | { type: 'SET_LOADING_MESSAGES'; payload: boolean }
  | { type: 'SET_CREATING_CONVERSATION'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: ChatState = {
  selectedConversationId: null,
  conversationDetails: null,
  messages: [],
  isStreaming: false,
  streamingMessage: null,
  optimisticUserMessage: null,
  showSidebar: false,
  permissionMode: 'default',
  inputValue: '',
  isLoadingMessages: false,
  isCreatingConversation: false,
  error: null,
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_SELECTED_CONVERSATION':
      return { 
        ...state, 
        selectedConversationId: action.payload,
        error: null // Clear error when switching conversations
      };
    
    case 'SET_CONVERSATION_DETAILS':
      return { ...state, conversationDetails: action.payload };
    
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    
    case 'SET_STREAMING_STATE':
      return { 
        ...state, 
        isStreaming: action.payload.isStreaming,
        streamingMessage: action.payload.message || null
      };
    
    case 'SET_OPTIMISTIC_MESSAGE':
      return { ...state, optimisticUserMessage: action.payload };
    
    case 'SET_SIDEBAR_VISIBLE':
      return { ...state, showSidebar: action.payload };
    
    case 'SET_PERMISSION_MODE':
      return { ...state, permissionMode: action.payload };
    
    case 'SET_INPUT_VALUE':
      return { ...state, inputValue: action.payload };
    
    case 'SET_LOADING_MESSAGES':
      return { ...state, isLoadingMessages: action.payload };
    
    case 'SET_CREATING_CONVERSATION':
      return { ...state, isCreatingConversation: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'RESET_STATE':
      return { ...initialState };
    
    default:
      return state;
  }
}

// Context interface
interface ChatContextValue {
  // State
  state: ChatState;
  
  // Conversation management
  conversations: any[];
  createConversation: (title?: string) => Promise<string | null>;
  archiveConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  selectConversation: (id: string | null) => void;
  
  // Message management
  sendMessage: (content: string, attachments?: any[]) => Promise<void>;
  stopStreaming: () => void;
  loadMessages: (dbMessages: any[]) => void;
  getAllMessages: () => ProcessedMessage[];
  
  // Session management (unified WebSocket)
  sessionState: any;
  isSessionReady: (conversationId: string) => boolean;
  isSessionPending: (conversationId: string) => boolean;
  initializeSession: (conversationId: string) => Promise<void>;
  
  // UI actions
  setInputValue: (value: string) => void;
  setSidebarVisible: (visible: boolean) => void;
  setPermissionMode: (mode: 'default' | 'plan' | 'acceptEdits') => void;
  
  // Utility
  isNewChat: boolean;
  clearError: () => void;
}

// Create context
const ChatContext = createContext<ChatContextValue | null>(null);

// Provider props
interface ChatProviderProps {
  children: React.ReactNode;
  projectId: string;
  initialConversationId?: string | null;
  initialSessionId?: string | null;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  projectId,
  initialConversationId = null,
  initialSessionId = null
}) => {
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialState,
    selectedConversationId: initialConversationId
  });

  const queryClient = useQueryClient();

  // Hooks integration
  const {
    conversations,
    createConversation: createConversationMutation,
    archiveConversation: archiveConversationMutation,
    deleteConversation: deleteConversationMutation,
  } = useConversations(projectId);

  const { data: conversationDetails } = useConversation(state.selectedConversationId);
  
  // URL parameter management for session ID
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Use Zustand store for WebSocket management
  const { socket, isConnected } = useSocketStore();
  
  // Initialize socket connection when ChatContext is used
  useEffect(() => {
    initializeSocketForChat(projectId);
  }, [projectId]);
  
  // Set socket context reference for chat service (only once)
  useEffect(() => {
    const socketStore = useSocketStore.getState();
    setSocketContext(() => ({
      socket: socketStore.socket,
      isConnected: socketStore.isConnected,
      emit: socketStore.emit,
      on: socketStore.on,
      off: socketStore.off,
    }));
  }, []); // Remove dependencies to prevent re-runs
  
  // Session state management for Claude Code continuity
  const [sessionState, setSessionState] = useState<{[conversationId: string]: {sessionId?: string; initialized: boolean; pending: boolean}}>({});

  // Session management functions
  const isSessionReady = useCallback((conversationId: string) => {
    const session = sessionState[conversationId];
    return session?.initialized && !!session.sessionId;
  }, [sessionState]);

  const isSessionPending = useCallback((conversationId: string) => {
    const session = sessionState[conversationId];
    return session?.pending || false;
  }, [sessionState]);

  const initializeSession = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    
    setSessionState(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        pending: true
      }
    }));

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/chat/conversation/${conversationId}`);
      
      if (response.ok) {
        const result = await response.json();
        const conversation = result.data;
        
        if (conversation?.claudeSessionId) {
          setSessionState(prev => ({
            ...prev,
            [conversationId]: {
              sessionId: conversation.claudeSessionId,
              initialized: true,
              pending: false
            }
          }));
          
          return conversation.claudeSessionId;
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize session for conversation:', conversationId, error);
    }
    
    setSessionState(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        pending: false
      }
    }));
    
    return null;
  }, []);

  // Join conversation room
  const joinConversationWithSession = useCallback(async (conversationId: string) => {
    if (socket && isConnected) {
      const { joinConversation } = useSocketStore.getState();
      joinConversation(conversationId);
      console.log('🏠 Joined conversation room:', conversationId);
      
      // Try to initialize session if needed
      const session = sessionState[conversationId];
      if (!session?.initialized && !session?.pending) {
        console.log('🔄 Attempting session initialization for conversation:', conversationId);
        await initializeSession(conversationId);
      }
    }
  }, [socket, isConnected, sessionState, initializeSession]);

  // Send message via WebSocket
  const sendWebSocketMessage = useCallback((data: any) => {
    if (socket && isConnected) {
      const { emit } = useSocketStore.getState();
      emit('chat:send-message', data);
      console.log('📤 Sent WebSocket message:', data);
    } else {
      throw new Error('Not connected to chat service');
    }
  }, [socket, isConnected]);

  // Abort current message
  const abortMessage = useCallback(() => {
    if (socket && isConnected) {
      const { emit } = useSocketStore.getState();
      emit('chat:abort');
      console.log('⏹️ Aborted current message');
    }
  }, [socket, isConnected]);

  // Note: on, off, emit are now provided by Zustand socketStore

  // Note: Removed connection state sync to prevent infinite loops
  // We use Zustand's isConnected directly instead of syncing with ChatContext state

  // Conversation details sync
  useEffect(() => {
    if (state.conversationDetails !== conversationDetails) {
      dispatch({ type: 'SET_CONVERSATION_DETAILS', payload: conversationDetails });
    }
  }, [conversationDetails, state.conversationDetails]);

  // WebSocket event handlers for unified chat system
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    // Get socket actions directly from store to avoid dependency issues
    const { on, off } = useSocketStore.getState();

    // Stream response handler
    const handleStreamResponse = (data: any) => {
      if (data.conversationId !== state.selectedConversationId) return;
      
      const processedMessage = MessageProcessor.processMessage(data);
      if (processedMessage) {
        dispatch({
          type: 'SET_STREAMING_STATE',
          payload: {
            isStreaming: !processedMessage.metadata?.isComplete,
            message: processedMessage
          }
        });
      }
    };

    // Message complete handler
    const handleMessageComplete = (data: any) => {
      if (data.conversationId !== state.selectedConversationId) return;
      
      dispatch({
        type: 'SET_STREAMING_STATE',
        payload: { isStreaming: false, message: null }
      });
      
      dispatch({ type: 'SET_OPTIMISTIC_MESSAGE', payload: null });
      
      // Refresh messages from server
      queryClient.invalidateQueries({
        queryKey: ['chat', 'messages', state.selectedConversationId]
      });
    };

    // Session available handler
    const handleSessionAvailable = (data: any) => {
      if (data.conversationId === state.selectedConversationId) {
        // Update conversation details with session ID (use conversationDetails from React Query)
        dispatch({ 
          type: 'SET_CONVERSATION_DETAILS', 
          payload: { 
            ...conversationDetails,
            claudeSessionId: data.sessionId 
          }
        });
        
        // Update URL with session ID
        if (data.sessionId) {
          setSearchParams(prev => ({
            ...Object.fromEntries(prev),
            sessionId: data.sessionId
          }));
        }
        
        // Clear any session-related errors
        dispatch({ type: 'SET_ERROR', payload: null });
      }
    };

    // Error handler
    const handleError = (data: any) => {
      dispatch({
        type: 'SET_STREAMING_STATE',
        payload: { isStreaming: false, message: null }
      });
      
      dispatch({ type: 'SET_ERROR', payload: data.error });
    };

    // Abort handler
    const handleAbort = (data: any) => {
      dispatch({
        type: 'SET_STREAMING_STATE',
        payload: { isStreaming: false, message: null }
      });
    };

    // Register WebSocket listeners
    on('chat:stream-response', handleStreamResponse);
    on('chat:message-complete', handleMessageComplete);
    on('chat:session-id-available', handleSessionAvailable);
    on('chat:error', handleError);
    on('chat:aborted', handleAbort);

    return () => {
      off('chat:stream-response', handleStreamResponse);
      off('chat:message-complete', handleMessageComplete);
      off('chat:session-id-available', handleSessionAvailable);
      off('chat:error', handleError);
      off('chat:aborted', handleAbort);
    };
  }, [socket, state.selectedConversationId, queryClient, setSearchParams]); // Removed state.conversationDetails to prevent infinite loop with conversation details sync

  // Action handlers
  const createConversation = useCallback(async (title?: string): Promise<string | null> => {
    dispatch({ type: 'SET_CREATING_CONVERSATION', payload: true });
    try {
      const result = await createConversationMutation.mutateAsync(title);
      const newId = result?.id || result?.conversation?.id;
      if (newId) {
        dispatch({ type: 'SET_SELECTED_CONVERSATION', payload: newId });
        return newId;
      }
      return null;
    } finally {
      dispatch({ type: 'SET_CREATING_CONVERSATION', payload: false });
    }
  }, [createConversationMutation]);

  const archiveConversation = useCallback(async (id: string) => {
    await archiveConversationMutation.mutateAsync(id);
    if (state.selectedConversationId === id) {
      dispatch({ type: 'SET_SELECTED_CONVERSATION', payload: null });
    }
  }, [archiveConversationMutation, state.selectedConversationId]);

  const deleteConversation = useCallback(async (id: string) => {
    await deleteConversationMutation.mutateAsync(id);
    if (state.selectedConversationId === id) {
      dispatch({ type: 'SET_SELECTED_CONVERSATION', payload: null });
    }
  }, [deleteConversationMutation, state.selectedConversationId]);

  const selectConversation = useCallback((id: string | null) => {
    dispatch({ type: 'SET_SELECTED_CONVERSATION', payload: id });
    // Reset input when switching conversations
    dispatch({ type: 'SET_INPUT_VALUE', payload: '' });
  }, []);

  const sendMessage = useCallback(async (content: string, attachments?: any[]) => {
    console.log('🔍 [DEBUG] ChatContext.sendMessage called (unified):', {
      contentLength: content?.length || 0,
      hasAttachments: !!attachments?.length,
      selectedConversationId: state.selectedConversationId,
      isConnected
    });
    
    if (!isConnected) {
      console.error('❌ [DEBUG] WebSocket not connected:', {
        isConnected
      });
      throw new Error('Not connected to chat service');
    }
    
    try {
      let conversationId = state.selectedConversationId;
      
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
      const isFirstMessage = state.messages.length === 0 && !state.optimisticUserMessage;
      
      console.log('🔍 [DEBUG] Session info:', {
        conversationId,
        sessionId: session?.sessionId,
        isFirstMessage,
        sessionReady: isSessionReady(conversationId),
        sessionPending: isSessionPending(conversationId)
      });
      
      // Join conversation room if not already joined
      await joinConversationWithSession(conversationId);
      
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

      dispatch({
        type: 'SET_OPTIMISTIC_MESSAGE',
        payload: optimisticMessage
      });
      
      dispatch({
        type: 'SET_STREAMING_STATE',
        payload: { isStreaming: true, message: null }
      });
      
      // Send via unified WebSocket
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('🔍 [DEBUG] Sending message via unified WebSocket:', {
        conversationId,
        sessionId: session?.sessionId,
        requestId,
        isFirstMessage
      });
      
      sendWebSocketMessage({
        conversationId,
        message: content,
        attachments,
        requestId,
        sessionId: session?.sessionId // Include session ID when available
      });
      
      dispatch({ type: 'SET_INPUT_VALUE', payload: '' });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      console.log('✅ [DEBUG] Message sent successfully via unified WebSocket');
      
    } catch (error) {
      console.error('❌ [DEBUG] ChatContext.sendMessage error:', error);
      
      // Clear optimistic states on error
      dispatch({ type: 'SET_OPTIMISTIC_MESSAGE', payload: null });
      dispatch({ type: 'SET_STREAMING_STATE', payload: { isStreaming: false, message: null } });
      
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to send message' });
    }
  }, [
    state.selectedConversationId, 
    state.messages.length, 
    state.optimisticUserMessage,
    isConnected,
    createConversation, 
    sendWebSocketMessage,
    sessionState,
    isSessionReady,
    isSessionPending,
    joinConversationWithSession
  ]);

  const setInputValue = useCallback((value: string) => {
    dispatch({ type: 'SET_INPUT_VALUE', payload: value });
  }, []);

  const setSidebarVisible = useCallback((visible: boolean) => {
    dispatch({ type: 'SET_SIDEBAR_VISIBLE', payload: visible });
  }, []);

  const setPermissionMode = useCallback((mode: 'default' | 'plan' | 'acceptEdits') => {
    dispatch({ type: 'SET_PERMISSION_MODE', payload: mode });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const stopStreaming = useCallback(() => {
    // Use unified WebSocket abort functionality
    abortMessage(); // This will abort the current message if any
  }, [abortMessage]);

  // Computed values
  const isNewChat = useMemo(() => {
    // If no conversation is selected, it's a new chat
    if (!state.selectedConversationId) {
      return true;
    }
    
    // If we have messages or an optimistic user message, it's not a new chat
    if (state.messages.length > 0 || state.optimisticUserMessage) {
      return false;
    }
    
    // If we're streaming, it's not a new chat (conversation started)
    if (state.isStreaming) {
      return false;
    }
    
    // Default to new chat
    return true;
  }, [state.selectedConversationId, state.messages.length, state.optimisticUserMessage, state.isStreaming]);

  // Load messages from database for selected conversation
  const loadMessages = useCallback((dbMessages: any[]) => {
    if (!dbMessages) return;
    
    const processedMessages = MessageProcessor.processMessages(dbMessages);
    const deduplicatedMessages = MessageProcessor.deduplicateMessages(processedMessages);
    
    dispatch({ type: 'SET_MESSAGES', payload: deduplicatedMessages });
  }, []);

  // Get combined messages for rendering (including optimistic and streaming)
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

  // Context value
  const value: ChatContextValue = {
    state,
    conversations,
    createConversation,
    archiveConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
    stopStreaming,
    loadMessages,
    getAllMessages,
    // Session management from unified WebSocket
    sessionState,
    isSessionReady,
    isSessionPending,
    initializeSession,
    setInputValue,
    setSidebarVisible,
    setPermissionMode,
    isNewChat,
    clearError,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

// Hook to use chat context
export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};

export default ChatContext;