/**
 * Dedicated WebSocket Context Provider
 * 
 * Provides a single, centralized WebSocket connection for the entire app
 * Follows React best practices with Context Provider + Custom Hook pattern
 * Handles connection management, room subscriptions, and event handling
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { claudeTodosKeys } from '../hooks/useClaudeTodos';
import { queryKeys } from '../lib/queryClient';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Core socket operations
  emit: (event: string, data: any) => void;
  on: (event: string, handler: Function) => void;
  off: (event: string, handler: Function) => void;
  
  // Room management
  joinRoom: (room: string) => void;
  leaveRoom: (room: string) => void;
  joinProject: (projectId: string) => void;
  leaveProject: (projectId: string) => void;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  
  // Connection control
  connect: () => void;
  disconnect: () => void;
  
  // Debug info
  connectionInfo: {
    socketId?: string;
    transport?: string;
    reconnectAttempts: number;
    lastConnected?: number;
    rooms: Set<string>;
  };
}

// Create the context with default values
const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  emit: () => {},
  on: () => {},
  off: () => {},
  joinRoom: () => {},
  leaveRoom: () => {},
  joinProject: () => {},
  leaveProject: () => {},
  joinConversation: () => {},
  leaveConversation: () => {},
  connect: () => {},
  disconnect: () => {},
  connectionInfo: {
    reconnectAttempts: 0,
    rooms: new Set(),
  },
});

interface SocketProviderProps {
  children: React.ReactNode;
  url?: string;
  activeProjectId?: string;
  autoConnect?: boolean;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({
  children,
  url = import.meta.env.VITE_API_URL || 'http://localhost:3001',
  activeProjectId,
  autoConnect = true,
}) => {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const reconnectAttemptsRef = useRef(0);
  const roomsRef = useRef<Set<string>>(new Set());
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastConnected, setLastConnected] = useState<number | undefined>();

  // Connection function
  const connect = useCallback(() => {
    if (socketRef.current?.connected || isConnecting) {
      console.log('🔌 [SocketProvider] Already connected or connecting, skipping');
      return;
    }

    console.log('🔌 [SocketProvider] Creating WebSocket connection to:', url);
    setIsConnecting(true);
    setError(null);

    const socket = io(url, {
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
        namespace: 'both', // Support both general and chat events
      },
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('🔌 [SocketProvider] Connected:', socket.id, {
        transport: socket.io.engine?.transport?.name,
      });
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      setLastConnected(Date.now());
      reconnectAttemptsRef.current = 0;

      // Re-join all rooms after reconnection
      roomsRef.current.forEach(room => {
        socket.emit('join', room);
        console.log('🏠 [SocketProvider] Re-joined room:', room);
      });

      // Auto-join project room if specified
      if (activeProjectId) {
        socket.emit('join-project', activeProjectId);
        console.log('📋 [SocketProvider] Joined project room:', activeProjectId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [SocketProvider] Disconnected:', reason);
      setIsConnected(false);
      setIsConnecting(false);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ [SocketProvider] Connection error:', error);
      setIsConnected(false);
      setIsConnecting(false);
      setError(error.message);
      reconnectAttemptsRef.current++;
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 [SocketProvider] Reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      setLastConnected(Date.now());
      reconnectAttemptsRef.current = 0;
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 [SocketProvider] Reconnection attempt:', attemptNumber);
      reconnectAttemptsRef.current = attemptNumber;
    });

    socket.on('reconnect_error', (error) => {
      console.error('❌ [SocketProvider] Reconnection error:', error);
      setError(`Reconnection failed: ${error.message}`);
    });

    // Set up global event listeners for data invalidation
    setupGlobalEventListeners(socket);
  }, [url, activeProjectId, isConnecting]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 [SocketProvider] Disconnecting...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
      setError(null);
      roomsRef.current.clear();
    }
  }, []);

  // Core socket operations
  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
      console.log(`📤 [SocketProvider] Emitted: ${event}`, data);
    } else {
      console.warn(`⚠️ [SocketProvider] Cannot emit ${event}: not connected`);
    }
  }, []);

  const on = useCallback((event: string, handler: Function) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler as any);
      console.log(`👂 [SocketProvider] Listening to: ${event}`);
    }
  }, []);

  const off = useCallback((event: string, handler: Function) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler as any);
      console.log(`🔇 [SocketProvider] Stopped listening to: ${event}`);
    }
  }, []);

  // Room management functions
  const joinRoom = useCallback((room: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join', room);
      roomsRef.current.add(room);
      console.log(`🏠 [SocketProvider] Joined room: ${room}`);
    }
  }, []);

  const leaveRoom = useCallback((room: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave', room);
      roomsRef.current.delete(room);
      console.log(`🚪 [SocketProvider] Left room: ${room}`);
    }
  }, []);

  // Specialized room management
  const joinProject = useCallback((projectId: string) => {
    joinRoom(`project-${projectId}`);
  }, [joinRoom]);

  const leaveProject = useCallback((projectId: string) => {
    leaveRoom(`project-${projectId}`);
  }, [leaveRoom]);

  const joinConversation = useCallback((conversationId: string) => {
    joinRoom(`conversation-${conversationId}`);
  }, [joinRoom]);

  const leaveConversation = useCallback((conversationId: string) => {
    leaveRoom(`conversation-${conversationId}`);
  }, [leaveRoom]);

  // Global event listeners for data invalidation
  const setupGlobalEventListeners = useCallback((socket: Socket) => {
    // Task events
    socket.on('task-created', (task) => {
      console.log('📋 [SocketProvider] Task created:', task.id);
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: task.projectId })
      });
    });

    socket.on('task-updated', (task) => {
      console.log('📋 [SocketProvider] Task updated:', task.id);
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: task.projectId })
      });
    });

    socket.on('task-deleted', (data) => {
      console.log('📋 [SocketProvider] Task deleted:', data.id);
      queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(data.id) });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: data.projectId })
      });
    });

    socket.on('task-reordered', (task) => {
      console.log('📋 [SocketProvider] Task reordered:', task.id);
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: task.projectId })
      });
    });

    // Claude Todo events
    socket.on('claude-todo-created', (todo) => {
      console.log('🤖 [SocketProvider] Claude todo created:', todo.id);
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(todo.projectId)
      });
    });

    socket.on('claude-todo-updated', (todo) => {
      console.log('🤖 [SocketProvider] Claude todo updated:', todo.id);
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(todo.projectId)
      });
    });

    socket.on('claude-todo-deleted', (data) => {
      console.log('🤖 [SocketProvider] Claude todo deleted:', data.id);
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
    });

    socket.on('claude-todos-batch-updated', (data) => {
      console.log('🤖 [SocketProvider] Claude todos batch updated:', data.projectId);
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
    });

    // Sync events
    socket.on('claude-todos-synced-to-tasks', (data) => {
      console.log('🔄 [SocketProvider] Claude todos synced to tasks:', data.projectId);
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: data.projectId })
      });
    });

    socket.on('tasks-synced-to-claude-todos', (data) => {
      console.log('🔄 [SocketProvider] Tasks synced to Claude todos:', data.projectId);
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: data.projectId })
      });
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
    });
  }, [queryClient]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      if (socketRef.current) {
        console.log('🔌 [SocketProvider] Cleaning up connection');
        socketRef.current.disconnect();
      }
    };
  }, [autoConnect, connect]);

  // Handle project changes
  useEffect(() => {
    if (isConnected && activeProjectId && socketRef.current) {
      // Leave previous project rooms and join new one
      socketRef.current.emit('join-project', activeProjectId);
      console.log('📋 [SocketProvider] Switched to project:', activeProjectId);
    }
  }, [isConnected, activeProjectId]);

  // Context value
  const contextValue: SocketContextType = {
    socket: socketRef.current,
    isConnected,
    isConnecting,
    error,
    emit,
    on,
    off,
    joinRoom,
    leaveRoom,
    joinProject,
    leaveProject,
    joinConversation,
    leaveConversation,
    connect,
    disconnect,
    connectionInfo: {
      socketId: socketRef.current?.id,
      transport: socketRef.current?.io.engine?.transport?.name,
      reconnectAttempts: reconnectAttemptsRef.current,
      lastConnected,
      rooms: roomsRef.current,
    },
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Export context for testing purposes
export { SocketContext };