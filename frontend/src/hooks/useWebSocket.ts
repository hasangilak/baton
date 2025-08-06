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

// Global socket instance to ensure singleton
let globalSocket: Socket | null = null;
let globalSocketRefCount = 0;

export const useWebSocket = (options: WebSocketHookOptions = {}) => {
  const {
    url = import.meta.env.VITE_API_URL || 'http://localhost:3001',
    autoConnect = true,
    activeProjectId
  } = options;

  const socketRef = useRef<Socket | null>(globalSocket);
  const queryClient = useQueryClient();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null
  });

  const connect = useCallback(() => {
    // Use existing global socket if available
    if (globalSocket?.connected) {
      console.log('🔌 Reusing existing WebSocket connection');
      socketRef.current = globalSocket;
      setState({ connected: true, connecting: false, error: null });
      setupEventListeners(globalSocket);
      return;
    }

    // Prevent multiple connections - check both connected and connection state
    if (socketRef.current?.connected || state.connecting || globalSocket?.io._readyState === 'opening') {
      console.log('🔌 Skipping connection - already connected or connecting');
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    console.log('🔌 Creating new WebSocket connection to:', url);
    
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      forceNew: false, // Reuse existing connection if available
      autoConnect: true, // Explicitly enable auto-connect
      // Add a custom query to identify our socket
      query: {
        client: 'baton-frontend'
      }
    });

    socketRef.current = socket;
    globalSocket = socket;

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

    // Chat message events
    socket.on('message:updated', (data) => {
      console.log('💬 Message updated:', data);
      // Store tool usage in a temporary cache if needed
      if (data.toolUsages) {
        console.log('🔧 Tool usages:', data.toolUsages);
      }
      
      // Emit custom event for WebUI streaming integration
      if (data.content && data.conversationId) {
        const customEvent = new CustomEvent('webui:message-updated', {
          detail: {
            content: data.content,
            isComplete: data.isComplete,
            conversationId: data.conversationId,
            messageId: data.messageId,
            toolUsages: data.toolUsages
          }
        });
        window.dispatchEvent(customEvent);
        console.log('📡 Dispatched custom event for WebUI streaming integration');
      }
      
      // Invalidate conversation-specific message queries to refetch with updated data
      if (data.conversationId) {
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', data.conversationId]
        });
        console.log('🔄 Invalidated message queries for conversation:', data.conversationId);
      } else {
        // Fallback: invalidate all message queries if conversationId is missing
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages']
        });
        console.log('🔄 Invalidated all message queries (no conversationId)');
      }
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

    // Interactive prompt events
    socket.on('interactive_prompt', (data) => {
      console.log('🔔 Interactive prompt received:', data);
      // Invalidate queries to refetch pending prompts for the specific conversation
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending', data.conversationId]
      });
    });

    socket.on('prompt:response', (data) => {
      console.log('📝 Prompt response received:', data);
      // Find which conversation this prompt belongs to and invalidate queries
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending']
      });
    });

    socket.on('prompt:timeout', (data) => {
      console.log('⏰ Prompt timeout received:', data);
      // Invalidate queries to refetch pending prompts
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending']
      });
    });

    // Chat events
    socket.on('conversation:created', (conversation: any) => {
      console.log('💬 Conversation created:', conversation);
      if (!shouldProcessEvent(conversation.projectId)) {
        console.log('🚫 Ignoring conversation:created event for inactive project:', conversation.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations', conversation.projectId] 
      });
    });

    socket.on('conversation:archived', ({ conversationId }: { conversationId: string }) => {
      console.log('📦 Conversation archived:', conversationId);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations'] 
      });
    });

    socket.on('conversation:deleted', ({ conversationId }: { conversationId: string }) => {
      console.log('🗑️ Conversation deleted:', conversationId);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations'] 
      });
    });

    socket.on('message:complete', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      console.log('✅ Message complete:', messageId);
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'messages', conversationId] 
      });
    });
  }, [queryClient, shouldProcessEvent]);

  const disconnect = useCallback(() => {
    // Only disconnect if this is the last reference
    if (globalSocketRefCount <= 1 && socketRef.current) {
      console.log('🔌 Disconnecting WebSocket (last reference)...');
      socketRef.current.disconnect();
      socketRef.current = null;
      globalSocket = null;
      setState({ connected: false, connecting: false, error: null });
    } else if (socketRef.current) {
      console.log('🔌 Keeping WebSocket alive (other components using it)...');
      socketRef.current = null;
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

  // Auto-connect on mount with proper strict mode handling
  useEffect(() => {
    let mounted = true;
    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

    // Increment reference count
    globalSocketRefCount++;
    console.log(`🔌 WebSocket reference count: ${globalSocketRefCount}`);

    if (autoConnect && mounted) {
      connect();
    }

    return () => {
      mounted = false;
      
      // Decrement reference count
      globalSocketRefCount--;
      console.log(`🔌 WebSocket reference count: ${globalSocketRefCount}`);
      
      // Clean up any pending timeout first
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      
      // Only disconnect if this is the last reference
      if (globalSocketRefCount === 0) {
        // In development with strict mode, we need to handle cleanup carefully
        if (import.meta.env.DEV) {
          const socket = socketRef.current || globalSocket;
          
          if (!socket) {
            // No socket to clean up
            return;
          }
          
          // Check the actual WebSocket readyState if available
          const websocket = (socket.io as any).engine?.transport?.ws;
          const isConnecting = websocket?.readyState === WebSocket.CONNECTING;
          
          if (isConnecting) {
            // Socket is still connecting, don't disconnect yet
            console.log('🔌 WebSocket still in CONNECTING state, skipping cleanup');
            return;
          }
          
          if (socket.connected) {
            // Socket is connected, safe to disconnect
            disconnect();
          } else if (!socket.connected && socket.io._readyState === 'opening') {
            // Socket.IO is opening but WebSocket might be done, wait a bit
            console.log('🔌 Socket.IO still opening, delaying cleanup...');
            cleanupTimeout = setTimeout(() => {
              if (!mounted && globalSocketRefCount === 0) {
                disconnect();
              }
            }, 1000); // Shorter delay since we checked WebSocket state
          }
          // If disconnected or in other states, no cleanup needed
        } else {
          // In production, disconnect immediately
          disconnect();
        }
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