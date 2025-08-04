import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { claudeTodosKeys } from './useClaudeTodos';
import { queryKeys } from '../lib/queryClient';

interface WebSocketHookOptions {
  url?: string;
  autoConnect?: boolean;
  activeProjectId?: string;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

export const useWebSocket = (options: WebSocketHookOptions = {}) => {
  const {
    url = import.meta.env.VITE_API_URL || 'http://localhost:3001',
    autoConnect = true,
    activeProjectId
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null
  });

  const connect = useCallback(() => {
    // Prevent multiple connections
    if (socketRef.current?.connected) return;

    setState(prev => ({ ...prev, connecting: true, error: null }));

    console.log('🔌 Connecting to Baton WebSocket at:', url);
    
    socketRef.current = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      forceNew: false, // Reuse existing connection if available
      // Add a custom query to identify our socket
      query: {
        client: 'baton-frontend'
      }
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected:', socket.id);
      setState({ connected: true, connecting: false, error: null });
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      setState(prev => ({ ...prev, connected: false, connecting: false }));
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        connecting: false, 
        error: error.message 
      }));
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
      setState({ connected: true, connecting: false, error: null });
    });

    // Register event listeners for real-time updates
    setupEventListeners(socket);
  }, [url, queryClient]);

  // Helper function to validate if event should be processed for current project
  const shouldProcessEvent = useCallback((eventProjectId: string) => {
    if (!activeProjectId) return true; // Process all events if no active project filter
    return eventProjectId === activeProjectId;
  }, [activeProjectId]);

  const setupEventListeners = useCallback((socket: Socket) => {
    // Task events (existing)
    socket.on('task-created', (task) => {
      console.log('📋 Task created:', task);
      if (!shouldProcessEvent(task.projectId)) {
        console.log('🚫 Ignoring task-created event for inactive project:', task.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: task.projectId })
      });
    });

    socket.on('task-updated', (task) => {
      console.log('📋 Task updated:', task);
      if (!shouldProcessEvent(task.projectId)) {
        console.log('🚫 Ignoring task-updated event for inactive project:', task.projectId);
        return;
      }
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: task.projectId })
      });
    });

    socket.on('task-deleted', (data) => {
      console.log('📋 Task deleted:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring task-deleted event for inactive project:', data.projectId);
        return;
      }
      queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list({ projectId: data.projectId }) });
    });

    socket.on('task-reordered', (task) => {
      console.log('📋 Task reordered:', task);
      if (!shouldProcessEvent(task.projectId)) {
        console.log('🚫 Ignoring task-reordered event for inactive project:', task.projectId);
        return;
      }
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: task.projectId })
      });
    });

    // Claude todo events (new)
    socket.on('claude-todo-created', (todo) => {
      console.log('🤖 Claude todo created:', todo);
      if (!shouldProcessEvent(todo.projectId)) {
        console.log('🚫 Ignoring claude-todo-created event for inactive project:', todo.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(todo.projectId)
      });
    });

    socket.on('claude-todo-updated', (todo) => {
      console.log('🤖 Claude todo updated:', todo);
      if (!shouldProcessEvent(todo.projectId)) {
        console.log('🚫 Ignoring claude-todo-updated event for inactive project:', todo.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(todo.projectId)
      });
    });

    socket.on('claude-todo-deleted', (data) => {
      console.log('🤖 Claude todo deleted:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring claude-todo-deleted event for inactive project:', data.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
    });

    socket.on('claude-todos-batch-updated', (data) => {
      console.log('🤖 Claude todos batch updated:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring claude-todos-batch-updated event for inactive project:', data.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
    });

    // Sync events
    socket.on('claude-todos-synced-to-tasks', (data) => {
      console.log('🔄 Claude todos synced to tasks:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring claude-todos-synced-to-tasks event for inactive project:', data.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: data.projectId })
      });
    });

    socket.on('claude-tasks-synced-to-todos', (data) => {
      console.log('🔄 Claude tasks synced to todos:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring claude-tasks-synced-to-todos event for inactive project:', data.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: data.projectId })
      });
    });

    // Plan events (new)
    socket.on('plan:created', (plan) => {
      console.log('📋 Plan created:', plan);
      if (!shouldProcessEvent(plan.projectId)) {
        console.log('🚫 Ignoring plan:created event for inactive project:', plan.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: ['plans', plan.projectId]
      });
    });

    socket.on('plan:updated', (plan) => {
      console.log('📋 Plan updated:', plan);
      if (!shouldProcessEvent(plan.projectId)) {
        console.log('🚫 Ignoring plan:updated event for inactive project:', plan.projectId);
        return;
      }
      queryClient.setQueryData(['plans', plan.id], plan);
      queryClient.invalidateQueries({ 
        queryKey: ['plans', plan.projectId]
      });
    });

    socket.on('plan:deleted', (data) => {
      console.log('📋 Plan deleted:', data);
      if (data.projectId && !shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring plan:deleted event for inactive project:', data.projectId);
        return;
      }
      queryClient.removeQueries({ queryKey: ['plans', data.id] });
      if (data.projectId) {
        queryClient.invalidateQueries({ queryKey: ['plans', data.projectId] });
      }
    });

    // MCP events
    socket.on('claude-mcp-operation-completed', (data) => {
      console.log('⚡ Claude MCP operation completed:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring claude-mcp-operation-completed event for inactive project:', data.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: claudeTodosKeys.byProject(data.projectId)
      });
    });
  }, [queryClient, shouldProcessEvent]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Disconnecting WebSocket...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setState({ connected: false, connecting: false, error: null });
    }
  }, []);

  const joinProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-project', projectId);
      console.log('🏠 Joined project room:', projectId);
    }
  }, []);

  const leaveProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-project', projectId);
      console.log('🚪 Left project room:', projectId);
    }
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
  }, []);

  const off = useCallback((event: string, handler?: (data: any) => void) => {
    if (socketRef.current) {
      if (handler) {
        socketRef.current.off(event, handler);
      } else {
        socketRef.current.off(event);
      }
    }
  }, []);

  // Auto-connect on mount with strict mode protection
  useEffect(() => {
    let isEffectActive = true;

    if (autoConnect && isEffectActive) {
      connect();
    }

    return () => {
      isEffectActive = false;
      // In development with strict mode, delay disconnection to avoid premature cleanup
      if (import.meta.env.DEV) {
        setTimeout(() => {
          if (!isEffectActive) {
            disconnect();
          }
        }, 50);
      } else {
        disconnect();
      }
    };
  }, [connect, disconnect, autoConnect]);

  return {
    ...state,
    connect,
    disconnect,
    joinProject,
    leaveProject,
    emit,
    on,
    off,
    socket: socketRef.current
  };
};