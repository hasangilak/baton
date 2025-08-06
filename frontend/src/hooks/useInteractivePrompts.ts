import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';
import type { InteractivePrompt } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface UseInteractivePromptsProps {
  conversationId: string | null;
}

export const useInteractivePrompts = ({ conversationId }: UseInteractivePromptsProps) => {
  const queryClient = useQueryClient();
  const { socket } = useWebSocket(); // Use shared WebSocket connection
  const [isRespondingToPrompt, setIsRespondingToPrompt] = useState(false);

  // Fetch pending prompts
  const {
    data: pendingPrompts = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['interactivePrompts', 'pending', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const response = await fetch(`${API_BASE}/chat/conversations/${conversationId}/prompts/pending`);
      if (!response.ok) {
        throw new Error('Failed to fetch pending prompts');
      }
      
      const result = await response.json();
      return result.prompts || [];
    },
    enabled: !!conversationId,
    refetchInterval: 5000, // Poll every 5 seconds for new prompts
  });

  // Respond to prompt mutation
  const respondToPrompt = useMutation({
    mutationFn: async ({ promptId, optionId }: { promptId: string; optionId: string }) => {
      const response = await fetch(`${API_BASE}/chat/prompts/${promptId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedOption: optionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to respond to prompt');
      }

      return response.json();
    },
    onMutate: () => {
      setIsRespondingToPrompt(true);
    },
    onSuccess: (data, variables) => {
      console.log('✅ Prompt response sent:', variables);
      
      // Invalidate and refetch pending prompts
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending', conversationId]
      });
      
      setIsRespondingToPrompt(false);
    },
    onError: (error, variables) => {
      console.error('❌ Failed to respond to prompt:', error, variables);
      setIsRespondingToPrompt(false);
    },
  });

  // WebSocket event listeners are now handled in the shared useWebSocket hook
  // No need for separate event listeners here since the shared connection 
  // already handles 'interactive_prompt', 'prompt:response', and 'prompt:timeout' events

  const handlePromptResponse = useCallback(async (promptId: string, optionId: string) => {
    try {
      await respondToPrompt.mutateAsync({ promptId, optionId });
    } catch (error) {
      console.error('Failed to respond to prompt:', error);
    }
  }, [respondToPrompt]);

  return {
    pendingPrompts: pendingPrompts as InteractivePrompt[],
    isLoading,
    error,
    isRespondingToPrompt,
    handlePromptResponse,
    socket,
  };
};