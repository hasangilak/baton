import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: how long cached data is considered fresh
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Cache time: how long unused data stays in cache
      gcTime: 10 * 60 * 1000, // 10 minutes (replaces cacheTime in v5)
      // Retry failed requests 2 times before giving up
      retry: 2,
      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus
      refetchOnWindowFocus: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
      // Show error notifications by default
      onError: (error) => {
        console.error('Mutation error:', error);
        // TODO: Add toast notification here
      },
    },
  },
});

// Query key factory for consistent key management
export const queryKeys = {
  // Projects
  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.projects.lists(), filters] as const,
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
  },
  
  // Tasks
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (filters: { projectId: string; status?: string }) => [...queryKeys.tasks.lists(), filters] as const,
    details: () => [...queryKeys.tasks.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tasks.details(), id] as const,
  },
  
  // MCP Agents
  mcpAgents: {
    all: ['mcp-agents'] as const,
    lists: () => [...queryKeys.mcpAgents.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.mcpAgents.lists(), filters] as const,
    details: () => [...queryKeys.mcpAgents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.mcpAgents.details(), id] as const,
  },
  
  // MCP Plans
  mcpPlans: {
    all: ['mcp-plans'] as const,
    lists: () => [...queryKeys.mcpPlans.all, 'list'] as const,
    list: (filters: { projectId?: string; agentId?: string }) => [...queryKeys.mcpPlans.lists(), filters] as const,
    details: () => [...queryKeys.mcpPlans.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.mcpPlans.details(), id] as const,
  },
} as const;