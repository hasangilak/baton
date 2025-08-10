/**
 * Simple Event Bus for Chat Component Communication
 * 
 * Provides a clean way for components to communicate without prop drilling
 * Built on top of browser's EventTarget API for simplicity and performance
 */

export type ChatEventType = 
  | 'message:received'
  | 'message:streaming'
  | 'message:complete'
  | 'message:error'
  | 'message:aborted'
  | 'conversation:selected'
  | 'conversation:created'
  | 'conversation:updated'
  | 'permission:requested'
  | 'permission:responded'
  | 'plan:review'
  | 'plan:completed'
  | 'session:available'
  | 'chat:connecting'
  | 'chat:connected'
  | 'chat:disconnected';

interface ChatEventData {
  'message:received': {
    messageId: string;
    content: string;
    type: string;
    conversationId?: string;
    metadata?: any;
  };
  'message:streaming': {
    messageId: string;
    content: string;
    isComplete: boolean;
    conversationId?: string;
  };
  'message:complete': {
    messageId: string;
    conversationId?: string;
    sessionId?: string;
  };
  'message:error': {
    error: string;
    requestId?: string;
    conversationId?: string;
  };
  'message:aborted': {
    requestId: string;
    reason?: string;
  };
  'conversation:selected': {
    conversationId: string;
  };
  'conversation:created': {
    conversation: any;
  };
  'conversation:updated': {
    conversation: any;
  };
  'permission:requested': {
    promptId: string;
    conversationId: string;
    toolName?: string;
    riskLevel?: string;
    message: string;
  };
  'permission:responded': {
    promptId: string;
    selectedOption: string;
    conversationId: string;
  };
  'plan:review': {
    planReviewId: string;
    plan: string;
    conversationId: string;
  };
  'plan:completed': {
    planReviewId: string;
    decision: string;
  };
  'session:available': {
    sessionId: string;
    conversationId: string;
  };
  'chat:connecting': {};
  'chat:connected': {
    socketId: string;
  };
  'chat:disconnected': {
    reason: string;
  };
}

class ChatEventBus extends EventTarget {
  private static instance: ChatEventBus;
  
  // Singleton pattern for global event bus
  static getInstance(): ChatEventBus {
    if (!ChatEventBus.instance) {
      ChatEventBus.instance = new ChatEventBus();
    }
    return ChatEventBus.instance;
  }

  /**
   * Emit an event to all listeners
   */
  emit<T extends ChatEventType>(
    eventType: T,
    data: ChatEventData[T],
    options?: { once?: boolean; priority?: 'high' | 'normal' | 'low' }
  ): void {
    const event = new CustomEvent(eventType, {
      detail: {
        ...data,
        timestamp: Date.now(),
        priority: options?.priority || 'normal',
        once: options?.once || false
      }
    });

    console.log(`📡 EventBus: Emitting ${eventType}`, data);
    this.dispatchEvent(event);
  }

  /**
   * Listen to an event
   */
  on<T extends ChatEventType>(
    eventType: T,
    handler: (data: ChatEventData[T] & { timestamp: number }) => void,
    options?: { once?: boolean; priority?: number }
  ): () => void {
    const eventHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      handler(customEvent.detail);
    };

    this.addEventListener(eventType, eventHandler, {
      once: options?.once,
      // priority can be used for future enhancements
    });

    // Return unsubscribe function
    return () => {
      this.removeEventListener(eventType, eventHandler);
    };
  }

  /**
   * Listen to an event once
   */
  once<T extends ChatEventType>(
    eventType: T,
    handler: (data: ChatEventData[T] & { timestamp: number }) => void
  ): void {
    this.on(eventType, handler, { once: true });
  }

  /**
   * Remove all listeners for a specific event type
   */
  removeAllListeners(eventType?: ChatEventType): void {
    if (eventType) {
      // Remove all listeners for specific event
      const listeners = (this as any)._listeners?.[eventType];
      if (listeners) {
        listeners.forEach((listener: EventListener) => {
          this.removeEventListener(eventType, listener);
        });
      }
    } else {
      // Remove all listeners (nuclear option)
      // This is harder with EventTarget, so we'll just create a new instance
      ChatEventBus.instance = new ChatEventBus();
    }
  }

  /**
   * Get active listener count for debugging
   */
  getListenerCount(eventType?: ChatEventType): number {
    // EventTarget doesn't expose listener count directly
    // This is a simplified implementation for debugging
    return 0;
  }
}

// Export singleton instance
export const chatEventBus = ChatEventBus.getInstance();

/**
 * Hook for using the event bus in React components
 */
export const useChatEventBus = () => {
  return {
    emit: chatEventBus.emit.bind(chatEventBus),
    on: chatEventBus.on.bind(chatEventBus),
    once: chatEventBus.once.bind(chatEventBus),
    removeAllListeners: chatEventBus.removeAllListeners.bind(chatEventBus),
  };
};

/**
 * Convenience functions for common event patterns
 */
export const ChatEvents = {
  // Message events
  messageReceived: (data: ChatEventData['message:received']) => 
    chatEventBus.emit('message:received', data),
  
  messageStreaming: (data: ChatEventData['message:streaming']) => 
    chatEventBus.emit('message:streaming', data),
  
  messageComplete: (data: ChatEventData['message:complete']) => 
    chatEventBus.emit('message:complete', data),
  
  messageError: (data: ChatEventData['message:error']) => 
    chatEventBus.emit('message:error', data, { priority: 'high' }),
  
  messageAborted: (data: ChatEventData['message:aborted']) => 
    chatEventBus.emit('message:aborted', data),

  // Conversation events
  conversationSelected: (conversationId: string) => 
    chatEventBus.emit('conversation:selected', { conversationId }),
  
  conversationCreated: (conversation: any) => 
    chatEventBus.emit('conversation:created', { conversation }),
  
  conversationUpdated: (conversation: any) => 
    chatEventBus.emit('conversation:updated', { conversation }),

  // Permission events
  permissionRequested: (data: ChatEventData['permission:requested']) => 
    chatEventBus.emit('permission:requested', data, { priority: 'high' }),
  
  permissionResponded: (data: ChatEventData['permission:responded']) => 
    chatEventBus.emit('permission:responded', data),

  // Plan events
  planReview: (data: ChatEventData['plan:review']) => 
    chatEventBus.emit('plan:review', data),
  
  planCompleted: (data: ChatEventData['plan:completed']) => 
    chatEventBus.emit('plan:completed', data),

  // Session events
  sessionAvailable: (sessionId: string, conversationId: string) => 
    chatEventBus.emit('session:available', { sessionId, conversationId }),

  // Connection events
  connecting: () => 
    chatEventBus.emit('chat:connecting', {}),
  
  connected: (socketId: string) => 
    chatEventBus.emit('chat:connected', { socketId }),
  
  disconnected: (reason: string) => 
    chatEventBus.emit('chat:disconnected', { reason }),
};