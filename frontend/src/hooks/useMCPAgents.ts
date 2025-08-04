import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { queryKeys } from '../lib/queryClient';

// Query hook for fetching all MCP agents
export function useMCPAgents() {
  return useQuery({
    queryKey: queryKeys.mcpAgents.lists(),
    queryFn: async () => {
      const response = await apiService.getMCPAgents();
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (agents don't change frequently)
  });
}

// Mutation hook for registering a new MCP agent
export function useRegisterMCPAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { 
      name: string; 
      description?: string; 
      endpoint: string 
    }) => {
      const response = await apiService.registerMCPAgent(data);
      return response.data;
    },
    onSuccess: (newAgent) => {
      if (!newAgent) return;
      
      // Add agent to cache
      queryClient.setQueryData(queryKeys.mcpAgents.detail(newAgent.id), newAgent);
      
      // Invalidate agents list
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpAgents.lists() });
    },
    onError: (error) => {
      console.error('Failed to register MCP agent:', error);
      // TODO: Show error toast
    },
  });
}