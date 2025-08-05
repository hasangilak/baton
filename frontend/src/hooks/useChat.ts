import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatService } from '../services/chat.service';
import { useToast } from './useToast';
import type { 
  Message, 
  StreamingResponse,
  SendMessageRequest 
} from '../types';

export const chatKeys = {
  all: ['chat'] as const,
  conversations: (projectId: string) => [...chatKeys.all, 'conversations', projectId] as const,
  messages: (conversationId: string) => [...chatKeys.all, 'messages', conversationId] as const,
  search: (projectId: string, query: string) => [...chatKeys.all, 'search', projectId, query] as const,
};

export function useConversations(projectId: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: chatKeys.conversations(projectId),
    queryFn: () => chatService.getConversations(projectId),
    enabled: !!projectId,
  });

  const createConversation = useMutation({
    mutationFn: (title?: string) => 
      chatService.createConversation({ projectId, title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations(projectId) });
      success('Success', 'New conversation created');
    },
    onError: () => {
      showError('Error', 'Failed to create conversation');
    },
  });

  const archiveConversation = useMutation({
    mutationFn: (conversationId: string) => 
      chatService.archiveConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations(projectId) });
      success('Success', 'Conversation archived');
    },
  });

  const deleteConversation = useMutation({
    mutationFn: (conversationId: string) => 
      chatService.deleteConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations(projectId) });
      success('Success', 'Conversation deleted');
    },
  });

  return {
    conversations: data?.conversations || data?.data || [],
    isLoading,
    error,
    createConversation,
    archiveConversation,
    deleteConversation,
  };
}

export function useMessages(conversationId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: chatKeys.messages(conversationId || ''),
    queryFn: () => chatService.getMessages(conversationId!),
    enabled: !!conversationId,
  });

  return {
    messages: data?.messages || data?.data || [],
    isLoading,
    error,
  };
}

export function useChat(conversationId: string | null) {
  const queryClient = useQueryClient();
  const { error: showError } = useToast();
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    content: string,
    attachments?: SendMessageRequest['attachments']
  ) => {
    if (!conversationId) {
      showError('Error', 'No conversation selected');
      return;
    }

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      await chatService.sendMessage(
        {
          conversationId,
          content,
          attachments,
        },
        (response: StreamingResponse) => {
          // Update streaming message
          setStreamingMessage(prev => {
            if (!prev) {
              // Create new message object
              return {
                id: response.id,
                conversationId,
                role: 'assistant',
                content: response.content,
                status: response.isComplete ? 'completed' : 'sending',
                error: response.error,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } as Message;
            }
            
            return {
              ...prev,
              content: response.content,
              status: response.isComplete ? 'completed' : 'sending',
              error: response.error,
            };
          });

          if (response.isComplete) {
            setIsStreaming(false);
            // Invalidate messages query to refetch complete message with metadata
            queryClient.invalidateQueries({ 
              queryKey: chatKeys.messages(conversationId) 
            });
            // Clear streaming message
            setTimeout(() => setStreamingMessage(null), 100);
          }
        }
      );
    } catch (error) {
      setIsStreaming(false);
      setStreamingMessage(null);
      showError('Error', 'Failed to send message');
    }
  }, [conversationId, queryClient]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  const uploadFile = useMutation({
    mutationFn: (file: File) => chatService.uploadFile(file),
    onError: () => {
      showError('Error', 'Failed to upload file');
    },
  });

  return {
    sendMessage,
    streamingMessage,
    isStreaming,
    stopStreaming,
    uploadFile,
  };
}

export function useChatSearch(projectId: string) {
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: chatKeys.search(projectId, query),
    queryFn: () => chatService.searchConversations(projectId, query),
    enabled: !!projectId && query.length > 2,
  });

  return {
    searchQuery: query,
    setSearchQuery: setQuery,
    searchResults: data?.conversations || data?.data || [],
    isSearching: isLoading,
  };
}