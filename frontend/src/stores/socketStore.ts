/**
 * WebSocket Store using Zustand
 * 
 * Manages WebSocket connection state and operations globally
 * Eliminates React Context re-render issues and provides better performance
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';

interface SocketState {
  // Connection state
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Connection info
  socketId: string | null;
  transport: string | null;
  reconnectAttempts: number;
  lastConnected: number | null;
  
  // Specific room tracking
  joinedProjects: Set<string>;
  joinedConversations: Set<string>;
  
  // Actions
  connect: (url?: string, options?: any) => void;
  disconnect: () => void;
  
  // Event handling
  emit: (event: string, data?: any) => void;
  on: (event: string, handler: Function) => void;
  off: (event: string, handler: Function) => void;
  
  // Specific room management
  joinProject: (projectId: string) => void;
  leaveProject: (projectId: string) => void;
  joinConversation: (conversationId: string, sessionId?: string) => void;
  leaveConversation: (conversationId: string) => void;
  
  // Internal state management
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  setSocketInfo: (socketId: string | null, transport: string | null) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setLastConnected: (timestamp: number) => void;
}

export const useSocketStore = create<SocketState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    socket: null,
    isConnected: false,
    isConnecting: false,
    error: null,
    socketId: null,
    transport: null,
    reconnectAttempts: 0,
    lastConnected: null,
    joinedProjects: new Set<string>(),
    joinedConversations: new Set<string>(),

    // Connection management
    connect: (url = 'http://localhost:3001', options = {}) => {
      const state = get();
      
      // Prevent multiple connections
      if (state.isConnected || state.isConnecting) {
        console.log('🔌 [SocketStore] Already connected or connecting, skipping');
        return;
      }

      console.log('🔌 [SocketStore] Creating WebSocket connection to:', url);
      set({ isConnecting: true, error: null });

      const defaultOptions = {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        forceNew: false,
        autoConnect: true,
        query: {
          client: 'baton-unified',
          namespace: 'both',
        },
      };

      const socket = io(url, { ...defaultOptions, ...options });

      // Connection event handlers
      socket.on('connect', () => {
        const state = get();
        console.log('🔌 [SocketStore] Connected:', socket.id, {
          transport: socket.io.engine?.transport?.name,
        });
        
        set({
          isConnected: true,
          isConnecting: false,
          error: null,
          socketId: socket.id || null,
          transport: socket.io.engine?.transport?.name || null,
          lastConnected: Date.now(),
          reconnectAttempts: 0,
        });

        // Re-join all rooms after reconnection using specific events
        state.joinedProjects.forEach(projectId => {
          socket.emit('join-project', projectId);
          console.log('📋 [SocketStore] Re-joined project:', projectId);
        });
        
        state.joinedConversations.forEach(conversationId => {
          // For reconnection, we don't have session ID available in socketStore
          // The chat system will handle session-aware rejoining
          socket.emit('join-conversation', { 
            conversationId,
            reconnection: true,
            timestamp: Date.now()
          });
          console.log('💬 [SocketStore] Re-joined conversation:', conversationId);
        });
      });

      socket.on('disconnect', (reason) => {
        console.log('🔌 [SocketStore] Disconnected:', reason);
        set({
          isConnected: false,
          isConnecting: false,
          socketId: null,
          transport: null,
        });
        
        // Don't set error for normal disconnections
        if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
          set({ error: `Connection lost: ${reason}` });
        }
      });

      socket.on('connect_error', (error) => {
        console.error('🔌 [SocketStore] Connection error:', error.message);
        set({
          isConnected: false,
          isConnecting: false,
          error: `Connection failed: ${error.message}`,
        });
        get().incrementReconnectAttempts();
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log('🔌 [SocketStore] Reconnected after', attemptNumber, 'attempts');
        set({
          reconnectAttempts: attemptNumber,
          error: null,
        });
      });

      socket.on('reconnect_failed', () => {
        console.error('🔌 [SocketStore] Reconnection failed');
        set({
          error: 'Failed to reconnect to server',
          isConnecting: false,
        });
      });

      // Store socket reference
      set({ socket });
    },

    disconnect: () => {
      const { socket } = get();
      if (socket) {
        console.log('🔌 [SocketStore] Disconnecting socket');
        socket.disconnect();
        set({
          socket: null,
          isConnected: false,
          isConnecting: false,
          socketId: null,
          transport: null,
          error: null,
        });
      }
    },

    // Event handling
    emit: (event: string, data?: any) => {
      const { socket, isConnected } = get();
      if (socket && isConnected) {
        socket.emit(event, data);
      } else {
        console.warn('🔌 [SocketStore] Cannot emit event, socket not connected:', event);
      }
    },

    on: (event: string, handler: Function) => {
      const { socket } = get();
      if (socket) {
        socket.on(event, handler as any);
      }
    },

    off: (event: string, handler: Function) => {
      const { socket } = get();
      if (socket) {
        socket.off(event, handler as any);
      }
    },

    // Specific room management
    joinProject: (projectId: string) => {
      const { socket, isConnected } = get();
      if (socket && isConnected && projectId) {
        socket.emit('join-project', projectId);
        set((state) => ({
          joinedProjects: new Set([...state.joinedProjects, projectId])
        }));
        console.log('📋 [SocketStore] Joined project:', projectId);
      }
    },

    leaveProject: (projectId: string) => {
      const { socket, isConnected } = get();
      if (socket && isConnected && projectId) {
        socket.emit('leave-project', projectId);
        set((state) => {
          const newProjects = new Set(state.joinedProjects);
          newProjects.delete(projectId);
          return { joinedProjects: newProjects };
        });
        console.log('📋 [SocketStore] Left project:', projectId);
      }
    },

    joinConversation: (conversationId: string, sessionId?: string) => {
      const { socket, isConnected } = get();
      if (socket && isConnected && conversationId) {
        // Send conversation ID and optional session ID for better room management
        socket.emit('join-conversation', { 
          conversationId, 
          sessionId,
          timestamp: Date.now() 
        });
        set((state) => ({
          joinedConversations: new Set([...state.joinedConversations, conversationId])
        }));
        console.log('💬 [SocketStore] Joined conversation:', conversationId, sessionId ? `with session: ${sessionId}` : 'without session');
      }
    },

    leaveConversation: (conversationId: string) => {
      const { socket, isConnected } = get();
      if (socket && isConnected && conversationId) {
        socket.emit('leave-conversation', conversationId);
        set((state) => {
          const newConversations = new Set(state.joinedConversations);
          newConversations.delete(conversationId);
          return { joinedConversations: newConversations };
        });
        console.log('💬 [SocketStore] Left conversation:', conversationId);
      }
    },

    // Internal state management
    setConnected: (connected: boolean) => set({ isConnected: connected }),
    setConnecting: (connecting: boolean) => set({ isConnecting: connecting }),
    setError: (error: string | null) => set({ error }),
    setSocketInfo: (socketId: string | null, transport: string | null) => 
      set({ socketId, transport }),
    
    incrementReconnectAttempts: () => set((state) => ({
      reconnectAttempts: state.reconnectAttempts + 1
    })),
    
    resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
    setLastConnected: (timestamp: number) => set({ lastConnected: timestamp }),
  }))
);

// Selectors for common use cases
export const useSocketConnection = () => useSocketStore((state) => ({
  isConnected: state.isConnected,
  isConnecting: state.isConnecting,
  error: state.error,
}));

export const useSocketActions = () => useSocketStore((state) => ({
  connect: state.connect,
  disconnect: state.disconnect,
  emit: state.emit,
  on: state.on,
  off: state.off,
}));

export const useSocketRooms = () => useSocketStore((state) => ({
  joinProject: state.joinProject,
  leaveProject: state.leaveProject,
  joinConversation: state.joinConversation,
  leaveConversation: state.leaveConversation,
}));

// Utility function to initialize socket connection for chat routes
export const initializeSocketForChat = (projectId?: string) => {
  const store = useSocketStore.getState();
  
  if (!store.isConnected && !store.isConnecting) {
    store.connect();
    
    // Join project room if provided
    if (projectId) {
      // Wait for connection before joining room
      const unsubscribe = useSocketStore.subscribe(
        (state) => state.isConnected,
        (isConnected) => {
          if (isConnected) {
            store.joinProject(projectId);
            unsubscribe();
          }
        }
      );
    }
  }
};