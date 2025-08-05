import { 
  ApiResponse,
  Conversation,
  Message,
  CreateConversationRequest,
  SendMessageRequest,
  StreamingResponse
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ChatService {
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
  async getMessages(conversationId: string): Promise<ApiResponse<Message[]>> {
    return this.request<Message[]>(`/api/chat/messages/${conversationId}`);
  }

  // Send message with SSE streaming
  async sendMessage(
    data: SendMessageRequest,
    onStream: (response: StreamingResponse) => void
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/chat/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    // Handle SSE stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onStream(data as StreamingResponse);
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
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
}

export const chatService = new ChatService();