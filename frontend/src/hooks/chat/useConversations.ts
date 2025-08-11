/**
 * Simplified Conversations Hook
 * 
 * Clean conversation management using our new architecture
 * Integrates with the centralized WebSocket and event system
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWebSocket } from '../useUnifiedWebSocket';
import { ChatEvents, chatEventBus } from '../../services/chat/eventBus';
import { useToast } from '../useToast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Conversation {
  id: string;
  title: string;
  projectId: string;
  claudeSessionId?: string;
  contextTokens?: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
}

export const useConversations = (projectId: string) => {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const { connected, emit } = useUnifiedWebSocket({ namespace: 'chat' });

  // Query conversations
  const { 
    data: conversationsData, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['chat', 'conversations', projectId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
    enabled: !!projectId,
  });

  const conversations: Conversation[] = conversationsData?.conversations || conversationsData?.data || [];

  // Create conversation
  const createConversation = useMutation({
    mutationFn: async (title?: string) => {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title || 'New Chat'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create conversation');
      }

      return response.json();
    },
    onSuccess: (data) => {
      const conversation = data.conversation || data;
      
      // Invalidate and refetch conversations list
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', projectId] });
      
      // Emit event for real-time updates
      ChatEvents.conversationCreated(conversation);
      
      success('Success', 'New conversation created');
    },
    onError: (error) => {
      console.error('Failed to create conversation:', error);
      showError('Error', 'Failed to create conversation');
    },
  });

  // Archive conversation
  const archiveConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/archive`, {
        method: 'PUT',
      });

      if (!response.ok) throw new Error('Failed to archive conversation');
      return response.json();
    },
    onSuccess: (data, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', projectId] });
      
      // Emit WebSocket event
      if (connected) {
        emit('conversation:archived', { conversationId });
      }
      
      success('Success', 'Conversation archived');
    },
    onError: () => {
      showError('Error', 'Failed to archive conversation');
    },
  });

  // Delete conversation
  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete conversation');
    },
    onSuccess: (data, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', projectId] });
      
      // Emit WebSocket event
      if (connected) {
        emit('conversation:deleted', { conversationId });
      }
      
      success('Success', 'Conversation deleted');
    },
    onError: () => {
      showError('Error', 'Failed to delete conversation');
    },
  });

  // Get single conversation details
  const getConversation = useCallback(async (conversationId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/details`);
    if (!response.ok) throw new Error('Failed to fetch conversation details');
    return response.json();
  }, []);

  // Update conversation session ID
  const updateSessionId = useCallback(async (conversationId: string, sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/session`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeSessionId: sessionId })
      });

      if (response.ok) {
        // Update local cache
        queryClient.setQueryData(
          ['chat', 'conversation', conversationId], 
          (old: any) => old ? { ...old, claudeSessionId: sessionId } : null
        );
        
        // Invalidate conversations list to update session info
        queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', projectId] });
      }
    } catch (error) {
      console.error('Failed to update session ID:', error);
    }
  }, [queryClient, projectId]);

  // Listen for real-time conversation updates
  useEffect(() => {
    const handleConversationCreated = (data: any) => {
      if (data.conversation.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', projectId] });
      }
    };

    const handleConversationUpdated = (data: any) => {
      if (data.conversation.projectId === projectId) {
        // Update specific conversation in cache
        queryClient.setQueryData(
          ['chat', 'conversation', data.conversation.id],
          data.conversation
        );
        
        // Update conversations list
        queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', projectId] });
        
        ChatEvents.conversationUpdated(data.conversation);
      }
    };

    const unsubscribeCreated = chatEventBus.on('conversation:created', handleConversationCreated);
    const unsubscribeUpdated = chatEventBus.on('conversation:updated', handleConversationUpdated);

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [projectId, queryClient]);

  return {
    // Data
    conversations,
    isLoading,
    error,
    
    // Actions
    createConversation,
    archiveConversation,
    deleteConversation,
    getConversation,
    updateSessionId,
  };
};

// Single conversation hook
export const useConversation = (conversationId: string | null) => {
  return useQuery({
    queryKey: ['chat', 'conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/details`);
      if (!response.ok) throw new Error('Failed to fetch conversation');
      return response.json();
    },
    enabled: !!conversationId,
  });
};