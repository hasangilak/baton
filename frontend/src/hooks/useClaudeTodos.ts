import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { 
  ClaudeTodosResponse, 
  CreateClaudeTodosRequest,
  SyncTodosToTasksRequest,
  SyncTasksToTodosRequest,
  SyncResponse 
} from '../types';
import { api } from '../services/api';

// Query keys
export const claudeTodosKeys = {
  all: ['claude-todos'] as const,
  byProject: (projectId: string) => ['claude-todos', projectId] as const,
};

// Get Claude todos for a project
export const useClaudeTodos = (projectId: string) => {
  return useQuery({
    queryKey: claudeTodosKeys.byProject(projectId),
    queryFn: async (): Promise<ClaudeTodosResponse> => {
      const response = await api.get(`/api/claude-todos?projectId=${projectId}`);
      return response.data;
    },
    enabled: !!projectId,
  });
};

// Create or update Claude todos
export const useCreateClaudeTodos = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateClaudeTodosRequest): Promise<ClaudeTodosResponse> => {
      const response = await api.post('/api/claude-todos', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific project's todos
      queryClient.invalidateQueries({
        queryKey: claudeTodosKeys.byProject(variables.projectId)
      });
    },
  });
};

// Delete a Claude todo
export const useDeleteClaudeTodo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (todoId: string): Promise<{ success: boolean; message: string }> => {
      const response = await api.delete(`/api/claude-todos/${todoId}`);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all claude todos queries
      queryClient.invalidateQueries({
        queryKey: claudeTodosKeys.all
      });
    },
  });
};

// Sync Claude todos to Baton tasks
export const useSyncTodosToTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SyncTodosToTasksRequest): Promise<SyncResponse> => {
      const response = await api.post('/api/claude-todos/sync-to-tasks', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate both todos and tasks for the project
      queryClient.invalidateQueries({
        queryKey: claudeTodosKeys.byProject(variables.projectId)
      });
      queryClient.invalidateQueries({
        queryKey: ['tasks', variables.projectId]
      });
    },
  });
};

// Sync Baton tasks to Claude todos
export const useSyncTasksToTodos = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SyncTasksToTodosRequest): Promise<SyncResponse> => {
      const response = await api.post('/api/claude-todos/sync-from-tasks', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate both todos and tasks for the project
      queryClient.invalidateQueries({
        queryKey: claudeTodosKeys.byProject(variables.projectId)
      });
      queryClient.invalidateQueries({
        queryKey: ['tasks', variables.projectId]
      });
    },
  });
};