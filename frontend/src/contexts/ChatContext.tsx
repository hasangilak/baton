/**
 * Centralized Chat Context
 * 
 * Unifies all chat-related state and services into a single, clean context
 * Replaces multiple useState/useEffect hooks with centralized state management
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConversations, useConversation } from '../hooks/chat/useConversations';
import { useChatMessages } from '../hooks/chat/useChatMessages';
import { chatEventBus } from '../services/chat/eventBus';
import type { ProcessedMessage } from '../services/chat/messages';

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
  
  // Connection
  isConnected: boolean;
  
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
  | { type: 'SET_CONNECTION_STATE'; payload: boolean }
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
  isConnected: false,
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
    
    case 'SET_CONNECTION_STATE':
      return { ...state, isConnected: action.payload };
    
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
  
  const {
    messages,
    isStreaming,
    streamingMessage,
    optimisticUserMessage,
    isConnected,
    sendMessage: sendMessageHook,
    stopStreaming: stopStreamingHook,
    loadMessages,
  } = useChatMessages({
    conversationId: state.selectedConversationId
  });

  // Sync hook state with context state - only dispatch if values actually changed
  useEffect(() => {
    if (JSON.stringify(state.messages) !== JSON.stringify(messages)) {
      dispatch({ type: 'SET_MESSAGES', payload: messages });
    }
  }, [messages, state.messages]);

  useEffect(() => {
    if (state.isStreaming !== isStreaming || state.streamingMessage !== streamingMessage) {
      dispatch({ type: 'SET_STREAMING_STATE', payload: { isStreaming, message: streamingMessage } });
    }
  }, [isStreaming, streamingMessage, state.isStreaming, state.streamingMessage]);

  useEffect(() => {
    if (state.optimisticUserMessage !== optimisticUserMessage) {
      dispatch({ type: 'SET_OPTIMISTIC_MESSAGE', payload: optimisticUserMessage });
    }
  }, [optimisticUserMessage, state.optimisticUserMessage]);

  useEffect(() => {
    if (state.isConnected !== isConnected) {
      dispatch({ type: 'SET_CONNECTION_STATE', payload: isConnected });
    }
  }, [isConnected, state.isConnected]);

  useEffect(() => {
    if (state.conversationDetails !== conversationDetails) {
      dispatch({ type: 'SET_CONVERSATION_DETAILS', payload: conversationDetails });
    }
  }, [conversationDetails, state.conversationDetails]);

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
    try {
      let conversationId = state.selectedConversationId;
      
      // If no conversation selected, create one first
      if (!conversationId) {
        const newId = await createConversation(content.slice(0, 40) || 'New Chat');
        if (!newId) {
          throw new Error('Failed to create conversation');
        }
        conversationId = newId;
      }
      
      await sendMessageHook(content, attachments);
      dispatch({ type: 'SET_INPUT_VALUE', payload: '' });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to send message' });
    }
  }, [state.selectedConversationId, createConversation, sendMessageHook]);

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
    stopStreamingHook();
  }, [stopStreamingHook]);

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

  // Event bus integration for global state sync
  useEffect(() => {
    const handleSessionAvailable = (data: any) => {
      if (data.conversationId === state.selectedConversationId) {
        // Update conversation details when session becomes available
        dispatch({ 
          type: 'SET_CONVERSATION_DETAILS', 
          payload: { 
            ...state.conversationDetails,
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
      }
    };

    const unsubscribe = chatEventBus.on('session:available', handleSessionAvailable);
    return unsubscribe;
  }, [state.selectedConversationId, state.conversationDetails, setSearchParams]);

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