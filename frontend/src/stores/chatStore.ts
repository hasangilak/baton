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
  
  // Messages (single source of truth)
  messages: ProcessedMessage[];
  isStreaming: boolean;
  
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
  bridgeServiceError: boolean;
  
  // Session state for Claude Code continuity
  sessionState: {[conversationId: string]: {sessionId?: string; initialized: boolean; pending: boolean}};
  
  // Last message retry data
  lastMessageData: {content: string; attachments?: any[]; conversationId: string; permissionMode?: 'default' | 'plan' | 'acceptEdits'} | null;
}

// Store interface with actions
interface ChatStore extends ChatState {
  // State setters
  setSelectedConversation: (id: string | null) => void;
  setConversationDetails: (details: any) => void;
  setMessages: (messages: ProcessedMessage[]) => void;
  setStreamingState: (isStreaming: boolean) => void;
  addOrUpdateMessage: (message: ProcessedMessage) => void;
  setSidebarVisible: (visible: boolean) => void;
  setPermissionMode: (mode: 'default' | 'plan' | 'acceptEdits') => void;
  setInputValue: (value: string) => void;
  setLoadingMessages: (loading: boolean) => void;
  setCreatingConversation: (creating: boolean) => void;
  setError: (error: string | null) => void;
  setBridgeServiceError: (error: boolean) => void;
  setSessionState: (conversationId: string, sessionData: {sessionId?: string; initialized: boolean; pending: boolean}) => void;
  
  // Complex actions
  selectConversation: (id: string | null) => void;
  clearError: () => void;
  clearBridgeError: () => void;
  resetState: () => void;
  
  // Session management
  isSessionReady: (conversationId: string) => boolean;
  isSessionPending: (conversationId: string) => boolean;
  initializeSession: (conversationId: string) => Promise<string | null>;
  
  // Message operations
  loadMessages: (dbMessages: any[]) => void;
  fetchAndLoadMessages: (conversationId: string) => Promise<void>;
  getAllMessages: () => ProcessedMessage[];
  
  // WebSocket operations
  joinConversationWithSession: (conversationId: string) => Promise<void>;
  sendWebSocketMessage: (data: any) => void;
  abortMessage: () => void;
  retryLastMessage: () => void;
  
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
  
  showSidebar: false,
  permissionMode: 'default',
  inputValue: '',
  isLoadingMessages: false,
  isCreatingConversation: false,
  error: null,
  bridgeServiceError: false,
  sessionState: {},
  lastMessageData: null,
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
    
    setStreamingState: (isStreaming: boolean) => 
      set({ isStreaming }),
    
    // Simple direct message update - no deduplication, just add or update
    addOrUpdateMessage: (message: ProcessedMessage) => {
      const { messages } = get();
      const existingIndex = messages.findIndex(m => m.id === message.id);
      
      if (existingIndex >= 0) {
        // Update existing message
        const updatedMessages = [...messages];
        updatedMessages[existingIndex] = message;
        console.log('🔄 Updated existing message:', message.id);
        set({ messages: updatedMessages });
      } else {
        // Add new message
        console.log('➕ Added new message:', message.id);
        set({ messages: [...messages, message] });
      }
    },
    
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
    
    setBridgeServiceError: (bridgeServiceError: boolean) => 
      set({ bridgeServiceError }),
    
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
        // Note: Don't clear errors here - let user handle errors explicitly
      });
    },
    
    clearError: () => set({ error: null }),
    
    clearBridgeError: () => set({ bridgeServiceError: false }),
    
    resetState: () => set({ ...initialState }),

    // Session management
    isSessionReady: (conversationId: string) => {
      const { sessionState } = get();
      const session = sessionState[conversationId];
      return Boolean(session?.initialized && session?.sessionId);
    },
    
    isSessionPending: (conversationId: string) => {
      const { sessionState } = get();
      const session = sessionState[conversationId];
      return Boolean(session?.pending);
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
      console.log('📥 Loading', processedMessages.length, 'processed messages from database');
      set({ messages: processedMessages });
    },
    
    fetchAndLoadMessages: async (conversationId?: string, sessionId?: string) => {
      if (!conversationId && !sessionId) return;
      
      set({ isLoadingMessages: true });
      
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        
        let response;
        let messages = [];
        let conversation = null;
        
        if (sessionId) {
          // Use by-session endpoint - gets both conversation and messages in one call
          console.log('📥 Fetching by session ID:', sessionId);
          response = await fetch(`${API_BASE_URL}/api/chat/conversations/by-session/${sessionId}`);
          
          if (response.ok) {
            const data = await response.json();
            conversation = data.conversation;
            messages = data.messages || [];
            
            console.log('✅ Found conversation and messages for session:', conversation?.id, `(${messages.length} messages)`);
            
            // Set up conversation state if we got it from sessionId
            if (conversation) {
              get().setConversationDetails(conversation);
              get().selectConversation(conversation.id);
              get().setSessionState(conversation.id, {
                sessionId: sessionId,
                initialized: true,
                pending: false
              });
            }
          }
        } else if (conversationId) {
          // Use conversation endpoint for conversationId-based fetching
          console.log('📥 Fetching messages for conversation:', conversationId);
          response = await fetch(`${API_BASE_URL}/api/chat/conversation/${conversationId}/messages`);
          
          if (response.ok) {
            const data = await response.json();
            messages = data.messages || data.data?.messages || [];
          }
        }
        
        if (!response || !response.ok) {
          throw new Error(`Failed to fetch messages: ${response?.status || 'No response'}`);
        }
        
        // Load messages into store
        get().loadMessages(messages);
        
        const logDetails = sessionId 
          ? `session ${sessionId} (conversation: ${conversation?.id})`
          : `conversation ${conversationId}`;
        console.log('📥 Loaded', messages.length, 'messages from database for', logDetails);
        
      } catch (error) {
        const errorContext = sessionId ? `session ${sessionId}` : `conversation ${conversationId}`;
        console.error('❌ Failed to fetch messages for', errorContext, ':', error);
        // Don't throw - just log the error and continue
      } finally {
        set({ isLoadingMessages: false });
      }
    },
    
    getAllMessages: (): ProcessedMessage[] => {
      return get().messages;
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
        // Store last message data for potential retry
        set({ 
          lastMessageData: {
            content: data.content,
            attachments: data.attachments,
            conversationId: data.conversationId,
            permissionMode: data.permissionMode
          }
        });
        
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
    
    retryLastMessage: () => {
      const { lastMessageData, bridgeServiceError } = get();
      
      if (!lastMessageData) {
        console.log('⚠️ No last message data available for retry');
        return;
      }
      
      if (bridgeServiceError) {
        // Clear bridge service error before retry
        get().clearBridgeError();
      }
      
      console.log('🔄 Retrying last message:', lastMessageData);
      
      // Recreate the message request data
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { sessionState } = get();
      const session = sessionState[lastMessageData.conversationId];
      
      get().sendWebSocketMessage({
        conversationId: lastMessageData.conversationId,
        content: lastMessageData.content,
        attachments: lastMessageData.attachments,
        requestId,
        sessionId: session?.sessionId,
        permissionMode: lastMessageData.permissionMode,
      });
    },

    // Computed values
    isNewChat: () => {
      const { selectedConversationId, messages, isStreaming } = get();
      
      // If no conversation is selected, it's a new chat
      if (!selectedConversationId) {
        return true;
      }
      
      // If we have messages, it's not a new chat
      if (messages.length > 0) {
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
        setConversationDetails,
        setError,
        conversationDetails,
        addOrUpdateMessage
      } = get();

      // Stream response handler with race condition protection
      const handleStreamResponse = (data: any) => {
        const currentState = get();
        console.log('🎯 Received chat:stream-response:', { 
          dataType: data.type, 
          requestId: data.requestId,
          conversationMatch: data.conversationId === currentState.selectedConversationId 
        });
        
        // Guard: Ignore messages for different conversations
        if (data.conversationId !== currentState.selectedConversationId) {
          console.log('🚫 Ignoring stream response for different conversation');
          return;
        }
        
        const processedMessage = MessageProcessor.processMessage(data);
        if (processedMessage) {
          console.log('✅ Adding/updating message:', { 
            messageId: processedMessage.id,
            messageType: processedMessage.type,
            contentLength: processedMessage.content.length 
          });
          
          // Simple: just add or update the message
          addOrUpdateMessage(processedMessage);
          
          // Update streaming state based on message completion
          const isStreaming = !processedMessage.metadata?.isComplete;
          setStreamingState(isStreaming);
        } else {
          console.log('⚠️ Failed to process stream message:', data.type);
        }
      };

      // Simple message complete handler - just stop streaming
      const handleMessageComplete = (data: any) => {
        const currentState = get();
        console.log('🏁 Message completion event received:', {
          conversationId: data.conversationId,
          selectedConversationId: currentState.selectedConversationId
        });
        
        // Guard: Only process completion for current conversation
        if (data.conversationId !== currentState.selectedConversationId) {
          console.log('🚫 Ignoring completion for different conversation');
          return;
        }
        
        // Simple: just stop streaming
        setStreamingState(false);
        console.log('💬 Message complete, stopped streaming');
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
          
          // Update session state to mark as initialized
          get().setSessionState(data.conversationId, {
            sessionId: data.sessionId,
            initialized: true,
            pending: false
          });
          
          console.log('💬 Session available and state updated:', data.sessionId);
          
          // Clear session-related errors only (not bridge service errors)
          if (currentState.error && !currentState.bridgeServiceError) {
            get().setError(null);
          }
        }
      };

      // Enhanced error handler with bridge service detection
      const handleError = (data: any) => {
        setStreamingState(false);
        
        // Check if this is a bridge service error
        const isBridgeError = data.error && data.error.includes('No bridge service connected');
        
        if (isBridgeError) {
          console.log('🌉 Bridge service disconnected, setting bridge error state');
          get().setBridgeServiceError(true);
          setError('Bridge service required for Claude Code integration');
        } else {
          get().setBridgeServiceError(false);
          setError(data.error);
        }
      };

      // Abort handler
      const handleAbort = (data: any) => {
        setStreamingState(false);
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
export const useChatError = () => useChatStore((state) => state.error);
export const useIsLoadingMessages = () => useChatStore((state) => state.isLoadingMessages);
export const useIsCreatingConversation = () => useChatStore((state) => state.isCreatingConversation);

export const useShowSidebar = () => useChatStore((state) => state.showSidebar);
export const usePermissionMode = () => useChatStore((state) => state.permissionMode);
export const useInputValue = () => useChatStore((state) => state.inputValue);

export const useSessionState = () => useChatStore((state) => state.sessionState);
export const useBridgeServiceError = () => useChatStore((state) => state.bridgeServiceError);

// Simple selector that returns messages array (stable reference)
export const useAllMessages = () => useChatStore((state) => state.messages);

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