import type { 
  ApiResponse,
  Conversation,
  Message,
  CreateConversationRequest,
  SendMessageRequest,
  StreamingResponse
} from '../types/index';
import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Global WebSocket connection for chat service
let globalSocket: Socket | null = null;

class ChatService {
  private socket: Socket | null = null;
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('Chat API request failed:', error);
      throw error;
    }
  }

  private ensureSocketConnection(): Socket {
    if (!globalSocket) {
      globalSocket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });
      
      globalSocket.on('connect', () => {
        console.log('💬 Chat service WebSocket connected:', globalSocket?.id);
      });
      
      globalSocket.on('disconnect', (reason) => {
        console.log('💬 Chat service WebSocket disconnected:', reason);
      });
      
      globalSocket.on('connect_error', (error) => {
        console.error('💬 Chat service WebSocket connection error:', error);
      });
    }
    
    this.socket = globalSocket;
    return globalSocket;
  }

  // Conversations
  async createConversation(data: CreateConversationRequest): Promise<ApiResponse<Conversation>> {
    return this.request<Conversation>('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getConversations(projectId: string): Promise<ApiResponse<Conversation[]>> {
    return this.request<Conversation[]>(`/api/chat/conversations/${projectId}`);
  }

  async archiveConversation(conversationId: string): Promise<ApiResponse<Conversation>> {
    return this.request<Conversation>(`/api/chat/conversations/${conversationId}/archive`, {
      method: 'PUT',
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  }

  // Messages
  async getMessages(conversationId: string, sessionId?: string): Promise<ApiResponse<Message[]>> {
    if (sessionId) {
      return this.request<Message[]>(`/api/chat/messages/${conversationId}/${sessionId}`);
    }
    // Fallback to old endpoint for backwards compatibility
    return this.request<Message[]>(`/api/chat/messages/${conversationId}`);
  }

  // Get conversation details including Claude session ID
  async getConversation(conversationId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/chat/conversation/${conversationId}`);
  }

  // Send message with WebSocket streaming
  async sendMessage(
    data: SendMessageRequest,
    onStream: (response: StreamingResponse) => void
  ): Promise<void> {
    const socket = this.ensureSocketConnection();
    
    const requestId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    return new Promise((resolve, reject) => {
      // Set up event listeners for this specific request
      const handleStreamResponse = (response: any) => {
        if (response.requestId === requestId) {
          console.log('📡 Received stream response:', response.type);
          
          // Convert bridge response to frontend format
          let streamResponse: StreamingResponse;
          
          if (response.type === 'claude_json' && response.data) {
            // Extract content from Claude response
            let content = '';
            let isComplete = false;
            
            if (response.data.type === 'assistant' && response.data.message) {
              if (Array.isArray(response.data.message.content)) {
                content = response.data.message.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text)
                  .join('');
              } else if (typeof response.data.message.content === 'string') {
                content = response.data.message.content;
              }
            } else if (response.data.type === 'result') {
              isComplete = true;
            }
            
            streamResponse = {
              id: response.messageId,
              content,
              isComplete,
              timestamp: response.timestamp
            };
          } else {
            // Handle other response types
            streamResponse = {
              id: response.messageId,
              content: '',
              isComplete: response.type === 'done',
              error: response.type === 'error' ? response.error : undefined,
              timestamp: response.timestamp
            };
          }
          
          onStream(streamResponse);
        }
      };
      
      const handleComplete = (response: any) => {
        if (response.requestId === requestId) {
          console.log('✅ Message complete:', response.messageId);
          
          // Send final completion signal
          onStream({
            id: response.messageId,
            content: '',
            isComplete: true,
            timestamp: response.timestamp
          });
          
          // Clean up listeners
          socket.off('chat:stream-response', handleStreamResponse);
          socket.off('chat:message-complete', handleComplete);
          socket.off('chat:error', handleError);
          socket.off('chat:aborted', handleAborted);
          
          resolve();
        }
      };
      
      const handleError = (response: any) => {
        if (response.requestId === requestId) {
          console.error('❌ Chat error:', response.error);
          
          // Clean up listeners
          socket.off('chat:stream-response', handleStreamResponse);
          socket.off('chat:message-complete', handleComplete);
          socket.off('chat:error', handleError);
          socket.off('chat:aborted', handleAborted);
          
          reject(new Error(response.error || 'Chat request failed'));
        }
      };
      
      const handleAborted = (response: any) => {
        if (response.requestId === requestId) {
          console.log('⏹️ Chat request aborted:', response.requestId);
          
          // Clean up listeners
          socket.off('chat:stream-response', handleStreamResponse);
          socket.off('chat:message-complete', handleComplete);
          socket.off('chat:error', handleError);
          socket.off('chat:aborted', handleAborted);
          
          reject(new Error('Chat request was aborted'));
        }
      };
      
      // Set up listeners
      socket.on('chat:stream-response', handleStreamResponse);
      socket.on('chat:message-complete', handleComplete);
      socket.on('chat:error', handleError);
      socket.on('chat:aborted', handleAborted);
      
      // Send the message request via WebSocket
      const messageData = {
        ...data,
        requestId,
      };
      
      socket.emit('chat:send-message', messageData);
      console.log('📤 Sent WebSocket message request:', requestId);
      
      // Set up timeout
      setTimeout(() => {
        socket.off('chat:stream-response', handleStreamResponse);
        socket.off('chat:message-complete', handleComplete);
        socket.off('chat:error', handleError);
        socket.off('chat:aborted', handleAborted);
        reject(new Error('WebSocket message request timeout'));
      }, 300000); // 5 minute timeout for longer Claude responses
    });
  }
  
  // Abort message sending
  abortMessage(requestId: string): void {
    const socket = this.socket;
    if (socket && socket.connected) {
      socket.emit('claude:abort', requestId);
      console.log('⏹️ Sent abort request for:', requestId);
    }
  }

  // Search
  async searchConversations(
    projectId: string,
    query: string
  ): Promise<ApiResponse<Conversation[]>> {
    const params = new URLSearchParams({ projectId, query });
    return this.request<Conversation[]>(`/api/chat/search?${params.toString()}`);
  }

  // File upload
  async uploadFile(file: File): Promise<{
    filename: string;
    mimeType: string;
    size: number;
    url: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/chat/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    const data = await response.json();
    return data.file;
  }
  
  // Get WebSocket connection for direct use by hooks
  getSocket(): Socket | null {
    return this.ensureSocketConnection();
  }
  
  // Create conversation via WebSocket
  async createConversationWS(data: CreateConversationRequest): Promise<ApiResponse<Conversation>> {
    const socket = this.ensureSocketConnection();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket conversation creation timeout'));
      }, 10000); // 10 second timeout
      
      socket.emit('conversation:create', data, (response: any) => {
        clearTimeout(timeout);
        
        if (response.success && response.conversation) {
          resolve({
            success: true,
            conversation: response.conversation,
            data: response.conversation
          });
        } else {
          reject(new Error(response.error || 'Failed to create conversation'));
        }
      });
    });
  }
  
  // Clean up WebSocket connection
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
    }
  }
}

export const chatService = new ChatService();

// Export WebSocket utilities for hooks
export const getChatSocket = () => chatService.getSocket();
export const disconnectChatService = () => chatService.disconnect();