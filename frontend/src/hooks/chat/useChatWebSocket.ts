import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

interface ChatWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

interface StreamingMessage {
  id: string;
  content: string;
  isStreaming: boolean;
  requestId?: string;
  conversationId?: string;
  type: 'chat' | 'system' | 'tool_use' | 'tool_result' | 'error' | 'abort';
}

// Global socket instance for chat to ensure singleton
let globalChatSocket: Socket | null = null;

export const useChatWebSocket = (options: ChatWebSocketOptions = {}) => {
  const {
    url = import.meta.env.VITE_API_URL || 'http://localhost:3001',
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(globalChatSocket);
  const queryClient = useQueryClient();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null
  });

  // Event handlers for different WebSocket events
  const eventHandlers = useRef<Map<string, Set<Function>>>(new Map());

  // Register event listener
  const on = useCallback((event: string, handler: Function) => {
    if (!eventHandlers.current.has(event)) {
      eventHandlers.current.set(event, new Set());
    }
    eventHandlers.current.get(event)!.add(handler);
    
    // Add to socket if connected
    if (socketRef.current?.connected) {
      socketRef.current.on(event, handler as any);
    }
  }, []);

  // Unregister event listener
  const off = useCallback((event: string, handler?: Function) => {
    if (handler) {
      eventHandlers.current.get(event)?.delete(handler);
      socketRef.current?.off(event, handler as any);
    } else {
      eventHandlers.current.delete(event);
      socketRef.current?.off(event);
    }
  }, []);

  // Emit event to server
  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('⚠️  Cannot emit - WebSocket not connected:', event);
    }
  }, []);

  const connect = useCallback(() => {
    // Use existing global socket if available
    if (globalChatSocket?.connected) {
      console.log('🔌 Reusing existing chat WebSocket connection');
      socketRef.current = globalChatSocket;
      setState({ connected: true, connecting: false, error: null });
      return;
    }

    // Prevent multiple connections
    if (socketRef.current?.connected || state.connecting) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    console.log('🔌 Creating new chat WebSocket connection to:', url);
    
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      query: {
        client: 'baton-chat',
        type: 'chat'
      }
    });

    socketRef.current = socket;
    globalChatSocket = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('🔌 Chat WebSocket connected:', socket.id);
      setState({ connected: true, connecting: false, error: null });
      
      // Re-register all event handlers
      eventHandlers.current.forEach((handlers, event) => {
        handlers.forEach(handler => {
          socket.on(event, handler as any);
        });
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Chat WebSocket disconnected:', reason);
      setState(prev => ({ ...prev, connected: false, connecting: false }));
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Chat WebSocket connection error:', error);
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        connecting: false, 
        error: error.message 
      }));
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Chat WebSocket reconnected after', attemptNumber, 'attempts');
      setState({ connected: true, connecting: false, error: null });
    });

    // Set up core chat event listeners
    setupCoreEventListeners(socket);
  }, [url, queryClient]);

  const setupCoreEventListeners = useCallback((socket: Socket) => {
    // Chat streaming events
    socket.on('chat:stream-response', (data) => {
      console.log('📡 Chat stream response received:', data.requestId);
      // Emit custom event for components to handle
      window.dispatchEvent(new CustomEvent('chat:stream-response', { detail: data }));
    });

    socket.on('chat:message-complete', (data) => {
      console.log('✅ Chat message complete:', data.requestId);
      window.dispatchEvent(new CustomEvent('chat:message-complete', { detail: data }));
      
      // Invalidate message queries
      if (data.conversationId) {
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', data.conversationId]
        });
      }
    });

    socket.on('chat:session-id-available', (data) => {
      console.log('🔗 Session ID available immediately:', data.sessionId);
      window.dispatchEvent(new CustomEvent('chat:session-id-available', { detail: data }));
    });

    socket.on('chat:error', (data) => {
      console.log('❌ Chat error:', data.error);
      window.dispatchEvent(new CustomEvent('chat:error', { detail: data }));
    });

    socket.on('chat:aborted', (data) => {
      console.log('⏹️ Chat request aborted:', data.requestId);
      window.dispatchEvent(new CustomEvent('chat:aborted', { detail: data }));
    });

    // Conversation events
    socket.on('conversation:created', (conversation) => {
      console.log('💬 Conversation created:', conversation.id);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations'] 
      });
    });

    socket.on('conversation:updated', (conversation) => {
      console.log('💬 Conversation updated:', conversation.id);
      queryClient.setQueryData(['chat', 'conversation', conversation.id], conversation);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations'] 
      });
    });

    socket.on('conversation:archived', ({ conversationId }) => {
      console.log('📦 Conversation archived:', conversationId);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations'] 
      });
    });

    socket.on('conversation:deleted', ({ conversationId }) => {
      console.log('🗑️ Conversation deleted:', conversationId);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations'] 
      });
    });

    // Permission system events
    socket.on('interactive_prompt', (data) => {
      console.log('🔔 Interactive prompt received:', data);
      window.dispatchEvent(new CustomEvent('interactive_prompt', { detail: data }));
      
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending', data.conversationId]
      });
    });

    socket.on('permission:response', (data) => {
      console.log('📝 Permission response received:', data);
      window.dispatchEvent(new CustomEvent('permission:response', { detail: data }));
      
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending']
      });
    });

    // Plan review events
    socket.on('plan_review', (data) => {
      console.log('📋 Plan review received:', data);
      window.dispatchEvent(new CustomEvent('plan_review', { detail: data }));
    });

    socket.on('plan_review_completed', (data) => {
      console.log('✅ Plan review completed:', data);
      window.dispatchEvent(new CustomEvent('plan_review_completed', { detail: data }));
    });
  }, [queryClient]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Disconnecting chat WebSocket...');
      socketRef.current.disconnect();
      socketRef.current = null;
      globalChatSocket = null;
      setState({ connected: false, connecting: false, error: null });
    }
  }, []);

  // Room management
  const joinConversation = useCallback((conversationId: string) => {
    emit('join-conversation', conversationId);
  }, [emit]);

  const leaveConversation = useCallback((conversationId: string) => {
    emit('leave-conversation', conversationId);
  }, [emit]);

  // Message sending
  const sendMessage = useCallback((data: {
    conversationId: string;
    message: string;
    attachments?: any[];
    requestId?: string;
  }) => {
    emit('chat:send-message', data);
  }, [emit]);

  const abortMessage = useCallback((requestId: string) => {
    emit('chat:abort-message', { requestId });
  }, [emit]);

  // Permission responses
  const respondToPermission = useCallback((data: {
    promptId: string;
    selectedOption: string;
    conversationId: string;
  }) => {
    emit('permission:respond', data);
  }, [emit]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      // Don't disconnect immediately, let other components use it
      // The socket will be cleaned up when all components unmount
    };
  }, [connect, autoConnect]);

  return {
    ...state,
    socket: socketRef.current,
    connect,
    disconnect,
    emit,
    on,
    off,
    joinConversation,
    leaveConversation,
    sendMessage,
    abortMessage,
    respondToPermission,
  };
};