/**
 * Chat Store using Zustand
 * 
 * Replaces ChatContext with global state management for chat functionality
 * Integrates with WebSocket store and provides all chat-related operations
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { MessageProcessor, type ProcessedMessage } from '../services/chat/messages';
import { useSocketStore } from './socketStore';
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
  
  // Session state for Claude Code continuity
  sessionState: {[conversationId: string]: {sessionId?: string; initialized: boolean; pending: boolean}};
}

// Store interface with actions
interface ChatStore extends ChatState {
  // State setters
  setSelectedConversation: (id: string | null) => void;
  setConversationDetails: (details: any) => void;
  setMessages: (messages: ProcessedMessage[]) => void;
  setStreamingState: (isStreaming: boolean, message?: ProcessedMessage | null) => void;
  setOptimisticMessage: (message: ProcessedMessage | null) => void;
  setSidebarVisible: (visible: boolean) => void;
  setPermissionMode: (mode: 'default' | 'plan' | 'acceptEdits') => void;
  setInputValue: (value: string) => void;
  setLoadingMessages: (loading: boolean) => void;
  setCreatingConversation: (creating: boolean) => void;
  setError: (error: string | null) => void;
  setSessionState: (conversationId: string, sessionData: {sessionId?: string; initialized: boolean; pending: boolean}) => void;
  
  // Complex actions
  selectConversation: (id: string | null) => void;
  clearError: () => void;
  resetState: () => void;
  
  // Session management
  isSessionReady: (conversationId: string) => boolean;
  isSessionPending: (conversationId: string) => boolean;
  initializeSession: (conversationId: string) => Promise<string | null>;
  
  // Message operations
  loadMessages: (dbMessages: any[]) => void;
  getAllMessages: () => ProcessedMessage[];
  
  // WebSocket operations
  joinConversationWithSession: (conversationId: string) => Promise<void>;
  sendWebSocketMessage: (data: any) => void;
  abortMessage: () => void;
  
  // Computed values
  isNewChat: () => boolean;
  
  // Initialization
  initialize: (projectId: string) => void;
  setupWebSocketHandlers: () => () => void; // Returns cleanup function
}

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
  sessionState: {},
};

export const useChatStore = create<ChatStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // State setters
    setSelectedConversation: (id: string | null) => 
      set({ selectedConversationId: id, error: null }),
    
    setConversationDetails: (details: any) => 
      set({ conversationDetails: details }),
    
    setMessages: (messages: ProcessedMessage[]) => 
      set({ messages }),
    
    setStreamingState: (isStreaming: boolean, message?: ProcessedMessage | null) => 
      set({ isStreaming, streamingMessage: message || null }),
    
    setOptimisticMessage: (message: ProcessedMessage | null) => 
      set({ optimisticUserMessage: message }),
    
    setSidebarVisible: (visible: boolean) => 
      set({ showSidebar: visible }),
    
    setPermissionMode: (mode: 'default' | 'plan' | 'acceptEdits') => 
      set({ permissionMode: mode }),
    
    setInputValue: (value: string) => 
      set({ inputValue: value }),
    
    setLoadingMessages: (loading: boolean) => 
      set({ isLoadingMessages: loading }),
    
    setCreatingConversation: (creating: boolean) => 
      set({ isCreatingConversation: creating }),
    
    setError: (error: string | null) => 
      set({ error }),
    
    setSessionState: (conversationId: string, sessionData: {sessionId?: string; initialized: boolean; pending: boolean}) =>
      set((state) => ({
        sessionState: {
          ...state.sessionState,
          [conversationId]: sessionData
        }
      })),

    // Complex actions
    selectConversation: (id: string | null) => {
      set({ 
        selectedConversationId: id, 
        inputValue: '', // Reset input when switching conversations
        error: null 
      });
    },
    
    clearError: () => set({ error: null }),
    
    resetState: () => set({ ...initialState }),

    // Session management
    isSessionReady: (conversationId: string) => {
      const { sessionState } = get();
      const session = sessionState[conversationId];
      return session?.initialized && !!session.sessionId;
    },
    
    isSessionPending: (conversationId: string) => {
      const { sessionState } = get();
      const session = sessionState[conversationId];
      return session?.pending || false;
    },
    
    initializeSession: async (conversationId: string) => {
      if (!conversationId) return null;
      
      const { setSessionState } = get();
      
      // Set pending
      setSessionState(conversationId, {
        initialized: false,
        pending: true
      });

      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_BASE_URL}/api/chat/conversation/${conversationId}`);
        
        if (response.ok) {
          const result = await response.json();
          const conversation = result.data;
          
          if (conversation?.claudeSessionId) {
            setSessionState(conversationId, {
              sessionId: conversation.claudeSessionId,
              initialized: true,
              pending: false
            });
            
            return conversation.claudeSessionId;
          }
        }
      } catch (error) {
        console.error('❌ Failed to initialize session for conversation:', conversationId, error);
      }
      
      // Clear pending on failure
      setSessionState(conversationId, {
        initialized: false,
        pending: false
      });
      
      return null;
    },

    // Message operations
    loadMessages: (dbMessages: any[]) => {
      if (!dbMessages) return;
      
      const processedMessages = MessageProcessor.processMessages(dbMessages);
      const deduplicatedMessages = MessageProcessor.deduplicateMessages(processedMessages);
      
      set({ messages: deduplicatedMessages });
    },
    
    getAllMessages: (): ProcessedMessage[] => {
      const { messages, optimisticUserMessage, streamingMessage } = get();
      let allMessages = [...messages];
      
      // Add optimistic user message
      if (optimisticUserMessage) {
        allMessages = MessageProcessor.mergeStreamingMessage(allMessages, optimisticUserMessage);
      }
      
      // Add streaming message
      if (streamingMessage) {
        allMessages = MessageProcessor.mergeStreamingMessage(allMessages, streamingMessage);
      }
      
      return allMessages;
    },

    // WebSocket operations
    joinConversationWithSession: async (conversationId: string) => {
      const socketStore = useSocketStore.getState();
      const { socket, isConnected, joinConversation } = socketStore;
      
      if (socket && isConnected) {
        joinConversation(conversationId);
        console.log('🏠 Joined conversation room:', conversationId);
        
        // Try to initialize session if needed
        const { sessionState, initializeSession } = get();
        const session = sessionState[conversationId];
        if (!session?.initialized && !session?.pending) {
          console.log('🔄 Attempting session initialization for conversation:', conversationId);
          await initializeSession(conversationId);
        }
      }
    },
    
    sendWebSocketMessage: (data: any) => {
      const socketStore = useSocketStore.getState();
      const { socket, isConnected, emit } = socketStore;
      
      if (socket && isConnected) {
        emit('chat:send-message', data);
        console.log('📤 Sent WebSocket message:', data);
      } else {
        throw new Error('Not connected to chat service');
      }
    },
    
    abortMessage: () => {
      const socketStore = useSocketStore.getState();
      const { socket, isConnected, emit } = socketStore;
      
      if (socket && isConnected) {
        emit('chat:abort');
        console.log('⏹️ Aborted current message');
      }
    },

    // Computed values
    isNewChat: () => {
      const { selectedConversationId, messages, optimisticUserMessage, isStreaming } = get();
      
      // If no conversation is selected, it's a new chat
      if (!selectedConversationId) {
        return true;
      }
      
      // If we have messages or an optimistic user message, it's not a new chat
      if (messages.length > 0 || optimisticUserMessage) {
        return false;
      }
      
      // If we're streaming, it's not a new chat (conversation started)
      if (isStreaming) {
        return false;
      }
      
      // Default to new chat
      return true;
    },

    // Initialization
    initialize: (projectId: string) => {
      // Initialize socket connection
      const socketStore = useSocketStore.getState();
      if (!socketStore.isConnected && !socketStore.isConnecting) {
        socketStore.connect();
        
        // Join project room if provided
        if (projectId) {
          // Wait for connection before joining room
          const unsubscribe = useSocketStore.subscribe(
            (state) => state.isConnected,
            (isConnected) => {
              if (isConnected) {
                socketStore.joinProject(projectId);
                unsubscribe();
              }
            }
          );
        }
      }
      
      // Set socket context reference for chat service
      setSocketContext(() => ({
        socket: socketStore.socket,
        isConnected: socketStore.isConnected,
        emit: socketStore.emit,
        on: socketStore.on,
        off: socketStore.off,
      }));
    },
    
    setupWebSocketHandlers: () => {
      const socketStore = useSocketStore.getState();
      const { socket, isConnected, on, off } = socketStore;
      
      if (!socket || !isConnected) {
        return () => {}; // Return empty cleanup function
      }
      
      const {
        selectedConversationId,
        setStreamingState,
        setOptimisticMessage,
        setConversationDetails,
        setError,
        conversationDetails
      } = get();

      // Stream response handler
      const handleStreamResponse = (data: any) => {
        const currentState = get();
        if (data.conversationId !== currentState.selectedConversationId) return;
        
        const processedMessage = MessageProcessor.processMessage(data);
        if (processedMessage) {
          setStreamingState(!processedMessage.metadata?.isComplete, processedMessage);
        }
      };

      // Message complete handler
      const handleMessageComplete = (data: any) => {
        const currentState = get();
        if (data.conversationId !== currentState.selectedConversationId) return;
        
        setStreamingState(false, null);
        setOptimisticMessage(null);
        
        // Note: We'll need to handle query invalidation externally since we don't have queryClient here
        console.log('💬 Message complete, should refresh messages from server');
      };

      // Session available handler
      const handleSessionAvailable = (data: any) => {
        const currentState = get();
        if (data.conversationId === currentState.selectedConversationId) {
          // Update conversation details with session ID
          setConversationDetails({
            ...currentState.conversationDetails,
            claudeSessionId: data.sessionId
          });
          
          // Note: URL updates will need to be handled externally
          console.log('💬 Session available:', data.sessionId);
          
          // Clear any session-related errors
          get().clearError();
        }
      };

      // Error handler
      const handleError = (data: any) => {
        setStreamingState(false, null);
        setError(data.error);
      };

      // Abort handler
      const handleAbort = (data: any) => {
        setStreamingState(false, null);
      };

      // Register WebSocket listeners
      on('chat:stream-response', handleStreamResponse);
      on('chat:message-complete', handleMessageComplete);
      on('chat:session-id-available', handleSessionAvailable);
      on('chat:error', handleError);
      on('chat:aborted', handleAbort);

      // Return cleanup function
      return () => {
        off('chat:stream-response', handleStreamResponse);
        off('chat:message-complete', handleMessageComplete);
        off('chat:session-id-available', handleSessionAvailable);
        off('chat:error', handleError);
        off('chat:aborted', handleAbort);
      };
    },
  }))
);

// Individual selectors to prevent object recreation and infinite loops
export const useSelectedConversationId = () => useChatStore((state) => state.selectedConversationId);
export const useConversationDetails = () => useChatStore((state) => state.conversationDetails);
export const useChatMessages = () => useChatStore((state) => state.messages);
export const useIsStreaming = () => useChatStore((state) => state.isStreaming);
export const useStreamingMessage = () => useChatStore((state) => state.streamingMessage);
export const useOptimisticUserMessage = () => useChatStore((state) => state.optimisticUserMessage);
export const useChatError = () => useChatStore((state) => state.error);
export const useIsLoadingMessages = () => useChatStore((state) => state.isLoadingMessages);
export const useIsCreatingConversation = () => useChatStore((state) => state.isCreatingConversation);

export const useShowSidebar = () => useChatStore((state) => state.showSidebar);
export const usePermissionMode = () => useChatStore((state) => state.permissionMode);
export const useInputValue = () => useChatStore((state) => state.inputValue);

export const useSessionState = () => useChatStore((state) => state.sessionState);

// DEPRECATED: Use individual selectors or direct store access instead
// These composite selectors create new objects on every call and cause infinite loops
// 
// Instead use:
// - Individual selectors: useSelectedConversationId(), useIsStreaming(), etc.
// - Direct store access: useChatStore.getState() inside useEffect
// 
// export const useChatState = () => ({ ... }); // ❌ DON'T USE - CAUSES INFINITE LOOPS
// export const useChatActions = () => ({ ... }); // ❌ DON'T USE - CAUSES INFINITE LOOPS

// Utility function to initialize chat store for specific project
export const initializeChatStore = (projectId: string) => {
  const store = useChatStore.getState();
  store.initialize(projectId);
  return store.setupWebSocketHandlers();
};