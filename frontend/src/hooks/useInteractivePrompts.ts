import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  
  // Real-time prompt state (like successful implementations)
  const [pendingPrompts, setPendingPrompts] = useState<InteractivePrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing pending prompts on mount (like successful implementations)
  useEffect(() => {
    console.log('🔄 useInteractivePrompts mounting, conversationId:', conversationId);
    if (!conversationId) {
      console.log('⚠️ No conversation ID, skipping prompt loading');
      return;
    }
    
    const loadPendingPrompts = async () => {
      try {
        console.log('🔄 Starting to load pending prompts...');
        setIsLoading(true);
        const response = await fetch(`${API_BASE}/chat/conversations/${conversationId}/prompts/pending`);
        console.log('📡 Response received:', response.status, response.ok);
        if (response.ok) {
          const data = await response.json();
          console.log('📥 Loaded existing pending prompts data:', data);
          // Handle the API response structure (data.prompts)
          if (data.success && data.prompts) {
            setPendingPrompts(data.prompts);
            console.log('✅ Set pending prompts:', data.prompts.length, 'prompts');
          }
        } else {
          console.error('❌ API response not ok:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ Error loading pending prompts:', error);
        setError(error instanceof Error ? error.message : 'Failed to load prompts');
      } finally {
        setIsLoading(false);
      }
    };

    loadPendingPrompts();
  }, [conversationId]);

  // Listen for real-time prompt events via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleInteractivePrompt = (data: any) => {
      console.log('🔔 Received real-time interactive prompt:', data);
      console.log('🔍 Current conversation ID:', conversationId);
      console.log('🔍 Prompt conversation ID:', data.conversationId);
      
      // Only handle prompts for the current conversation
      if (data.conversationId !== conversationId) {
        console.log('🚫 Ignoring prompt for different conversation:', data.conversationId, 'vs', conversationId);
        return;
      }

      // Create prompt object matching our InteractivePrompt type
      const prompt: InteractivePrompt = {
        id: data.promptId,
        conversationId: data.conversationId,
        sessionId: data.sessionId,
        type: data.type,
        title: data.title,
        message: data.message,
        options: data.options,
        context: data.context,
        status: 'pending',
        selectedOption: undefined,
        autoHandler: undefined,
        timeoutAt: new Date(Date.now() + (data.timeout || 300000)).toISOString(), // 5 minutes default
        createdAt: new Date().toISOString(),
        respondedAt: undefined
      };

      // Add to pending prompts (replacing any existing with same ID)
      setPendingPrompts(prev => {
        const filtered = prev.filter(p => p.id !== prompt.id);
        return [...filtered, prompt];
      });
    };

    // Listen for real-time prompt events
    socket.on('interactive_prompt', handleInteractivePrompt);

    return () => {
      socket.off('interactive_prompt', handleInteractivePrompt);
    };
  }, [socket, conversationId]);

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
    onSuccess: (_data, variables) => {
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
      // Immediately remove from pending prompts (optimistic update)
      setPendingPrompts(prev => prev.filter(p => p.id !== promptId));
      
      await respondToPrompt.mutateAsync({ promptId, optionId });
    } catch (error) {
      console.error('Failed to respond to prompt:', error);
      // On error, we could add the prompt back, but for now just log the error
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