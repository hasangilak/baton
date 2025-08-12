import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { claudeTodosKeys } from './useClaudeTodos';
import { queryKeys } from '../lib/queryClient';
import { ChatEvents } from '../services/chat/eventBus';
import { setUnifiedSocketRef } from '../services/chat.service';

interface UnifiedWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  activeProjectId?: string;
  namespace?: 'general' | 'chat' | 'both';
}

interface SessionState {
  [conversationId: string]: {
    sessionId?: string;
    initialized: boolean;
    pending: boolean;
  };
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

// Removed unused StreamingMessage interface - types handled by individual modules

// Global socket instance and reference counting to ensure single connection
let globalUnifiedSocket: Socket | null = null;
let globalSocketRefCount = 0;

export const useUnifiedWebSocket = (options: UnifiedWebSocketOptions = {}) => {
  const {
    url = import.meta.env.VITE_API_URL || 'http://localhost:3001',
    autoConnect = true,
    activeProjectId,
    namespace = 'both'
  } = options;

  const socketRef = useRef<Socket | null>(globalUnifiedSocket);
  const queryClient = useQueryClient();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null
  });

  // Session state management for Claude Code continuity
  const [sessionState, setSessionState] = useState<SessionState>({});

  // Event handlers registry for custom event listeners
  const eventHandlers = useRef<Map<string, Set<Function>>>(new Map());

  const connect = useCallback(() => {
    // Use existing global socket if available
    if (globalUnifiedSocket?.connected) {
      console.log('🔌 [DEBUG] Reusing existing unified WebSocket connection:', {
        socketId: globalUnifiedSocket.id,
        connected: globalUnifiedSocket.connected,
        readyState: globalUnifiedSocket.io.readyState
      });
      socketRef.current = globalUnifiedSocket;
      setState({ connected: true, connecting: false, error: null });
      setUnifiedSocketRef(globalUnifiedSocket);
      setupEventListeners(globalUnifiedSocket);
      return;
    }

    // Prevent multiple connections - check both connected and connection state
    if (socketRef.current?.connected || state.connecting || globalUnifiedSocket?.io._readyState === 'opening') {
      console.log('🔌 Skipping connection - already connected or connecting');
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    console.log('🔌 Creating new unified WebSocket connection to:', url);
    
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      forceNew: false,
      autoConnect: true,
      query: {
        client: 'baton-unified',
        namespace
      }
    });

    socketRef.current = socket;
    globalUnifiedSocket = socket;

    socket.on('connect', () => {
      console.log('🔌 [DEBUG] Unified WebSocket connected:', socket.id, {
        socketConnected: socket.connected,
        readyState: socket.io.readyState,
        transport: socket.io.engine?.transport?.name
      });
      setState({ connected: true, connecting: false, error: null });
      
      // Update ChatService reference
      setUnifiedSocketRef(socket);
      
      // Re-register custom event handlers
      eventHandlers.current.forEach((handlers, event) => {
        handlers.forEach(handler => {
          socket.on(event, handler as any);
        });
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Unified WebSocket disconnected:', reason);
      setState(prev => ({ ...prev, connected: false, connecting: false }));
      
      // Clear ChatService reference
      setUnifiedSocketRef(null);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Unified WebSocket connection error:', error);
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        connecting: false, 
        error: error.message 
      }));
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Unified WebSocket reconnected after', attemptNumber, 'attempts');
      setState({ connected: true, connecting: false, error: null });
    });

    // Register core event listeners
    setupEventListeners(socket);
  }, [url, queryClient, namespace]);

  // Helper function to validate if event should be processed for current project
  const shouldProcessEvent = useCallback((eventProjectId: string) => {
    if (!activeProjectId) return true;
    return eventProjectId === activeProjectId;
  }, [activeProjectId]);

  const setupEventListeners = useCallback((socket: Socket) => {
    // ===== TASK EVENTS (from useWebSocket) =====
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

    // ===== CLAUDE TODO EVENTS (from useWebSocket) =====
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

    // ===== SYNC EVENTS (from useWebSocket) =====
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

    // ===== CHAT EVENTS (from useChatWebSocket) =====
    socket.on('chat:stream-response', (data) => {
      console.log('📡 Chat stream response:', data.requestId);
      // Emit custom DOM event and handle via event handlers
      window.dispatchEvent(new CustomEvent('chat:stream-response', { detail: data }));
    });

    socket.on('chat:session-id-available', async (data) => {
      console.log('🔗 Session ID available:', data.sessionId, 'for conversation:', data.conversationId);
      
      const conversationId = data.conversationId;
      
      if (conversationId) {
        // Update local session state immediately
        setSessionState(prev => ({
          ...prev,
          [conversationId]: {
            sessionId: data.sessionId,
            initialized: true,
            pending: false
          }
        }));

        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/session`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claudeSessionId: data.sessionId })
          });
          
          if (response.ok) {
            console.log('✅ Conversation updated with session ID immediately');
            
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('sessionId', data.sessionId);
            window.history.replaceState({}, '', currentUrl.toString());
            
            console.log('🔄 Updated URL with session ID immediately:', currentUrl.toString());
            
            ChatEvents.sessionAvailable(data.sessionId, conversationId);
            
            queryClient.invalidateQueries({ 
              queryKey: ['chat', 'conversation', conversationId]
            });
          } else {
            console.error('❌ Failed to update conversation with session ID');
          }
        } catch (error) {
          console.error('❌ Error updating session ID:', error);
        }
      }
      
      // Also emit DOM event
      window.dispatchEvent(new CustomEvent('chat:session-id-available', { detail: data }));
    });

    socket.on('chat:message-complete', async (data) => {
      console.log('✅ Chat message complete:', data.requestId, 'Session ID:', data.sessionId);
      
      if (data.conversationId) {
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', data.conversationId]
        });
      }
      
      window.dispatchEvent(new CustomEvent('chat:message-complete', { detail: data }));
    });

    socket.on('chat:error', (data) => {
      console.log('❌ Chat error:', data.error);
      
      // Handle session-related errors
      if (data.sessionRequired && data.existingSessionId) {
        console.log('🔄 Session error - updating local state with existing session:', data.existingSessionId);
        setSessionState(prev => ({
          ...prev,
          [data.conversationId || 'unknown']: {
            sessionId: data.existingSessionId,
            initialized: true,
            pending: false
          }
        }));
      }
      
      window.dispatchEvent(new CustomEvent('chat:error', { detail: data }));
    });

    socket.on('chat:aborted', (data) => {
      console.log('⏹️ Chat request aborted:', data.requestId);
      window.dispatchEvent(new CustomEvent('chat:aborted', { detail: data }));
    });

    // ===== CONVERSATION EVENTS (unified from both hooks) =====
    socket.on('conversation:created', (conversation: any) => {
      console.log('💬 Conversation created:', conversation);
      if (!shouldProcessEvent(conversation.projectId)) {
        console.log('🚫 Ignoring conversation:created event for inactive project:', conversation.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversations', conversation.projectId] 
      });
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

    // ===== LEGACY CHAT MESSAGE EVENTS (from useWebSocket) =====
    socket.on('message:updated', (data) => {
      console.log('💬 Message updated (legacy):', data);
      if (data.toolUsages) {
        console.log('🔧 Tool usages:', data.toolUsages);
      }
      
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
      
      if (data.conversationId) {
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages', data.conversationId]
        });
        console.log('🔄 Invalidated message queries for conversation:', data.conversationId);
      } else {
        queryClient.invalidateQueries({ 
          queryKey: ['chat', 'messages']
        });
        console.log('🔄 Invalidated all message queries (no conversationId)');
      }
    });

    // ===== PLAN EVENTS (from useWebSocket) =====
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

    socket.on('claude:plan-captured', (data) => {
      console.log('🤖 Claude plan captured:', data);
      if (!shouldProcessEvent(data.projectId)) {
        console.log('🚫 Ignoring claude:plan-captured event for inactive project:', data.projectId);
        return;
      }
      queryClient.invalidateQueries({ 
        queryKey: ['plans', data.projectId]
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

    // ===== MCP EVENTS (from useWebSocket) =====
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

    // ===== INTERACTIVE PROMPT EVENTS (from useWebSocket) =====
    socket.on('interactive_prompt', (data) => {
      console.log('🔔 Interactive prompt received:', data);
      console.log('📊 Analytics data:', {
        riskLevel: data.riskLevel,
        usageStatistics: data.usageStatistics,
        timestamp: data.timestamp
      });
      
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending', data.conversationId]
      });

      if (data.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['permission-analytics', data.conversationId]
        });
        queryClient.invalidateQueries({
          queryKey: ['live-permission-status', data.conversationId]
        });
      }

      const customEvent = new CustomEvent('baton:permission-request', {
        detail: {
          promptId: data.promptId,
          conversationId: data.conversationId,
          type: data.type,
          toolName: data.context?.toolName,
          riskLevel: data.context?.riskLevel,
          message: data.message,
          options: data.options,
          timestamp: data.timestamp
        }
      });
      window.dispatchEvent(customEvent);
      
      // Also emit generic event for useChatWebSocket compatibility
      window.dispatchEvent(new CustomEvent('interactive_prompt', { detail: data }));
    });

    socket.on('permission_escalation', (data) => {
      console.log('📢 Permission escalation:', data);
      
      const customEvent = new CustomEvent('baton:permission-escalation', {
        detail: {
          promptId: data.promptId,
          stage: data.stage,
          toolName: data.toolName,
          riskLevel: data.riskLevel,
          escalationType: data.escalationType,
          message: data.message,
          timestamp: data.timestamp
        }
      });
      window.dispatchEvent(customEvent);
    });

    socket.on('permission:response', (data) => {
      console.log('📝 Permission response received:', data);
      
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending']
      });

      if (data.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['permission-analytics', data.conversationId]
        });
        queryClient.invalidateQueries({
          queryKey: ['live-permission-status', data.conversationId]
        });
      }
      
      const customEvent = new CustomEvent('baton:permission-response', {
        detail: {
          promptId: data.promptId,
          selectedOption: data.selectedOption,
          conversationId: data.conversationId,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(customEvent);
      
      // Also emit generic event for useChatWebSocket compatibility
      window.dispatchEvent(new CustomEvent('permission:response', { detail: data }));
    });

    // ===== ANALYTICS EVENTS (from useWebSocket) =====
    socket.on('permission_request', (data) => {
      console.log('🔐 Permission request notification:', data);
      
      const customEvent = new CustomEvent('baton:permission-request', {
        detail: {
          conversationId: data.conversationId,
          toolName: data.toolName,
          riskLevel: data.riskLevel,
          timestamp: data.timestamp
        }
      });
      window.dispatchEvent(customEvent);
    });

    socket.on('permission_analytics', (data) => {
      console.log('📊 Permission analytics update:', data);
      
      const customEvent = new CustomEvent('baton:analytics-update', {
        detail: {
          conversationId: data.conversationId,
          toolName: data.toolName,
          decision: data.decision,
          responseTime: data.responseTime,
          riskLevel: data.riskLevel,
          timestamp: data.timestamp
        }
      });
      window.dispatchEvent(customEvent);

      if (data.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['permission-analytics', data.conversationId]
        });
        queryClient.invalidateQueries({
          queryKey: ['live-permission-status', data.conversationId]
        });
      }
    });

    socket.on('permission_statistics', (data) => {
      console.log('📈 Global permission statistics update:', data);
      
      const customEvent = new CustomEvent('baton:global-statistics', {
        detail: {
          totalResponses: data.totalResponses,
          averageResponseTime: data.averageResponseTime,
          decision: data.decision,
          riskLevel: data.riskLevel
        }
      });
      window.dispatchEvent(customEvent);

      queryClient.invalidateQueries({
        queryKey: ['permission-analytics']
      });
    });

    socket.on('analytics_event', (data) => {
      console.log('📋 Analytics event received:', data);
      
      switch (data.eventType) {
        case 'prompt_received':
        case 'prompt_responded':
        case 'prompt_completed':
        case 'prompt_failed':
          if (data.conversationId) {
            queryClient.invalidateQueries({
              queryKey: ['live-permission-status', data.conversationId]
            });
          }
          break;
        default:
          console.log('Unknown analytics event type:', data.eventType);
      }
    });

    socket.on('prompt:timeout', (data) => {
      console.log('⏰ Prompt timeout received:', data);
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending']
      });

      const customEvent = new CustomEvent('baton:prompt-timeout', {
        detail: {
          promptId: data.promptId,
          conversationId: data.conversationId,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(customEvent);
    });

    // ===== PLAN REVIEW EVENTS (from both hooks) =====
    socket.on('plan_review', (data) => {
      console.log('📋 Plan review received via WebSocket:', data);
      
      const event = new CustomEvent('plan_review', { detail: data });
      window.dispatchEvent(event);
    });

    socket.on('plan_review_completed', (data) => {
      console.log('✅ Plan review completed via WebSocket:', data);
      
      const event = new CustomEvent('plan_review_completed', { detail: data });
      window.dispatchEvent(event);
    });

    socket.on('permission_mode_changed', (data) => {
      console.log('🔄 Permission mode changed via WebSocket:', data);
      
      const event = new CustomEvent('permission_mode_changed', { detail: data });
      window.dispatchEvent(event);
      
      queryClient.invalidateQueries({ 
        queryKey: ['chat', 'conversation', data.conversationId]
      });
    });
    
    // ===== BRIDGE SERVICE EVENTS (from useWebSocket) =====
    socket.on('claude-bridge:connected', () => {
      console.log('🌉 Claude Code bridge service connected');
      const event = new CustomEvent('baton:bridge-connected', { 
        detail: { connected: true, timestamp: Date.now() } 
      });
      window.dispatchEvent(event);
    });
    
    socket.on('claude-bridge:disconnected', () => {
      console.log('🌉 Claude Code bridge service disconnected');
      const event = new CustomEvent('baton:bridge-disconnected', { 
        detail: { connected: false, timestamp: Date.now() } 
      });
      window.dispatchEvent(event);
    });
  }, [queryClient, shouldProcessEvent]);

  const disconnect = useCallback(() => {
    // Only disconnect if this is the last reference
    if (globalSocketRefCount <= 1 && socketRef.current) {
      console.log('🔌 Disconnecting unified WebSocket (last reference)...');
      socketRef.current.disconnect();
      socketRef.current = null;
      globalUnifiedSocket = null;
      setUnifiedSocketRef(null);
      setState({ connected: false, connecting: false, error: null });
    } else if (socketRef.current) {
      console.log('🔌 Keeping unified WebSocket alive (other components using it)...');
      socketRef.current = null;
    }
  }, []);

  // ===== ROOM MANAGEMENT METHODS =====
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

  const joinConversation = useCallback((conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-conversation', conversationId);
      console.log('💬 Joined conversation room:', conversationId);
    }
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-conversation', conversationId);
      console.log('💬 Left conversation room:', conversationId);
    }
  }, []);

  // ===== CUSTOM EVENT LISTENER METHODS =====
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

  const off = useCallback((event: string, handler?: Function) => {
    if (handler) {
      eventHandlers.current.get(event)?.delete(handler);
      socketRef.current?.off(event, handler as any);
    } else {
      eventHandlers.current.delete(event);
      socketRef.current?.off(event);
    }
  }, []);

  // ===== UTILITY METHODS =====
  const emit = useCallback((event: string, data: any) => {
    console.log('🔍 [DEBUG] useUnifiedWebSocket.emit called:', {
      event,
      dataKeys: data ? Object.keys(data) : 'no data',
      connected: state.connected,
      socketConnected: socketRef.current?.connected,
      socketExists: !!socketRef.current,
      socketId: socketRef.current?.id
    });
    
    if (socketRef.current?.connected) {
      console.log('✅ [DEBUG] Emitting WebSocket event:', event, data);
      socketRef.current.emit(event, data);
    } else {
      console.warn('⚠️  Cannot emit unified WebSocket event - not connected:', event, {
        connected: state.connected,
        socketConnected: socketRef.current?.connected,
        socketExists: !!socketRef.current
      });
    }
  }, [state.connected]);
  
  // ===== CHAT-SPECIFIC METHODS =====
  const sendMessage = useCallback((data: {
    conversationId: string;
    message: string;
    attachments?: any[];
    requestId?: string;
    sessionId?: string;
  }) => {
    console.log('🔍 [DEBUG] useUnifiedWebSocket.sendMessage called:', {
      conversationId: data.conversationId,
      messageLength: data.message?.length || 0,
      hasAttachments: !!data.attachments?.length,
      requestId: data.requestId,
      sessionId: data.sessionId
    });

    // Get current session state for this conversation
    const currentSession = sessionState[data.conversationId];
    const sessionId = data.sessionId || currentSession?.sessionId;

    // Mark as pending if this is the first message
    if (!currentSession?.initialized) {
      setSessionState(prev => ({
        ...prev,
        [data.conversationId]: {
          sessionId: sessionId,
          initialized: false,
          pending: true
        }
      }));
    }

    // Send message with session ID if available
    emit('chat:send-message', {
      ...data,
      sessionId
    });
  }, [emit, sessionState]);

  const abortMessage = useCallback((requestId: string) => {
    emit('chat:abort-message', { requestId });
  }, [emit]);

  // Session management utilities
  const getSessionState = useCallback((conversationId: string) => {
    return sessionState[conversationId] || { initialized: false, pending: false };
  }, [sessionState]);

  const isSessionReady = useCallback((conversationId: string) => {
    const session = sessionState[conversationId];
    return session?.initialized && session?.sessionId;
  }, [sessionState]);

  const isSessionPending = useCallback((conversationId: string) => {
    const session = sessionState[conversationId];
    return session?.pending && !session?.initialized;
  }, [sessionState]);

  // Session recovery and initialization
  const initializeSession = useCallback(async (conversationId: string) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/chat/conversation/${conversationId}`);
      
      if (response.ok) {
        const result = await response.json();
        const conversation = result.data;
        
        if (conversation?.claudeSessionId) {
          console.log('🔄 Recovered existing session for conversation:', conversationId, conversation.claudeSessionId);
          setSessionState(prev => ({
            ...prev,
            [conversationId]: {
              sessionId: conversation.claudeSessionId,
              initialized: true,
              pending: false
            }
          }));
          
          // Update URL with session ID
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('sessionId', conversation.claudeSessionId);
          window.history.replaceState({}, '', currentUrl.toString());
          
          return conversation.claudeSessionId;
        }
      }
    } catch (error) {
      console.error('❌ Failed to initialize session for conversation:', conversationId, error);
    }
    
    return null;
  }, []);

  const checkSessionHealth = useCallback(async (conversationId: string) => {
    const session = sessionState[conversationId];
    if (!session?.sessionId) {
      return false;
    }

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/chat/conversation/${conversationId}`);
      
      if (response.ok) {
        const result = await response.json();
        const conversation = result.data;
        return conversation?.claudeSessionId === session.sessionId;
      }
    } catch (error) {
      console.error('❌ Session health check failed:', error);
    }
    
    return false;
  }, [sessionState]);

  // Helper to join conversation and initialize session
  const joinConversationWithSession = useCallback(async (conversationId: string) => {
    // First join the conversation room
    joinConversation(conversationId);
    
    // Then try to initialize session if needed
    const session = sessionState[conversationId];
    if (!session?.initialized && !session?.pending) {
      console.log('🔄 Attempting session initialization for conversation:', conversationId);
      await initializeSession(conversationId);
    }
  }, [joinConversation, sessionState, initializeSession]);

  // ===== PERMISSION RESPONSE METHODS =====
  const respondToPermission = useCallback((promptId: string, selectedOption: string, conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('permission:respond', {
        promptId,
        selectedOption,
        conversationId,
        timestamp: Date.now()
      });
      console.log('📝 Sent permission response:', { promptId, selectedOption });
    }
  }, []);
  
  const respondToPlanReview = useCallback((promptId: string, decision: string, conversationId: string, feedback?: string, editedPlan?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('plan:review-respond', {
        promptId,
        decision,
        conversationId,
        feedback,
        editedPlan,
        timestamp: Date.now()
      });
      console.log('📋 Sent plan review response:', { promptId, decision });
    }
  }, []);

  // ===== CONNECTION LIFECYCLE =====
  useEffect(() => {
    let mounted = true;
    let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

    // Increment reference count
    globalSocketRefCount++;
    console.log(`🔌 Unified WebSocket reference count: ${globalSocketRefCount}`);

    if (autoConnect && mounted) {
      connect();
    }
    
    // If global socket is already connected, sync the state immediately
    if (globalUnifiedSocket?.connected) {
      console.log('🔍 [DEBUG] Syncing state with already connected global socket');
      setState({ connected: true, connecting: false, error: null });
      socketRef.current = globalUnifiedSocket;
      setUnifiedSocketRef(globalUnifiedSocket);
    }

    return () => {
      mounted = false;
      
      // Decrement reference count
      globalSocketRefCount--;
      console.log(`🔌 Unified WebSocket reference count: ${globalSocketRefCount}`);
      
      // Clean up any pending timeout first
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      
      // Only disconnect if this is the last reference
      if (globalSocketRefCount === 0) {
        if (import.meta.env.DEV) {
          const socket = socketRef.current || globalUnifiedSocket;
          
          if (!socket) {
            return;
          }
          
          const websocket = (socket.io as any).engine?.transport?.ws;
          const isConnecting = websocket?.readyState === WebSocket.CONNECTING;
          
          if (isConnecting) {
            console.log('🔌 Unified WebSocket still in CONNECTING state, skipping cleanup');
            return;
          }
          
          if (socket.connected) {
            disconnect();
          } else if (!socket.connected && socket.io._readyState === 'opening') {
            console.log('🔌 Socket.IO still opening, delaying cleanup...');
            cleanupTimeout = setTimeout(() => {
              if (!mounted && globalSocketRefCount === 0) {
                disconnect();
              }
            }, 1000);
          }
        } else {
          disconnect();
        }
      }
    };
  }, [connect, disconnect, autoConnect]);

  return {
    ...state,
    socket: socketRef.current,
    connect,
    disconnect,
    joinProject,
    leaveProject,
    joinConversation,
    leaveConversation,
    emit,
    on,
    off,
    sendMessage,
    abortMessage,
    respondToPermission,
    respondToPlanReview,
    // Session management
    getSessionState,
    isSessionReady,
    isSessionPending,
    initializeSession,
    checkSessionHealth,
    joinConversationWithSession,
    sessionState,
    // Debug info
    _debug: {
      socketExists: !!socketRef.current,
      socketConnected: socketRef.current?.connected,
      socketId: socketRef.current?.id,
      namespace: options.namespace,
      refCount: globalSocketRefCount,
      sessionCount: Object.keys(sessionState).length
    }
  };
};