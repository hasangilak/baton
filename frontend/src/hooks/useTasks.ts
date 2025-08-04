import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import type { Task, CreateTaskRequest, UpdateTaskRequest } from '../types';

// Query hook for fetching tasks by project
export function useTasks(projectId: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.tasks.list({ projectId, status }),
    queryFn: async () => {
      const response = await apiService.getTasks(projectId, status);
      return response.data;
    },
    enabled: !!projectId, // Only run if projectId is provided
    staleTime: 2 * 60 * 1000, // 2 minutes (tasks change more frequently)
  });
}

// Query hook for fetching a single task
export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id!),
    queryFn: async () => {
      const response = await apiService.getTask(id!);
      return response.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

// Mutation hook for creating a task
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTaskRequest) => {
      const response = await apiService.createTask(data);
      return response.data;
    },
    onSuccess: (newTask) => {
      if (!newTask) return;
      
      // Add task to cache
      queryClient.setQueryData(queryKeys.tasks.detail(newTask.id), newTask);
      
      // Invalidate tasks lists for the project
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: newTask.projectId })
      });
      
      // Invalidate all tasks lists to be safe
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
    },
    onError: (error) => {
      console.error('Failed to create task:', error);
      // TODO: Show error toast
    },
  });
}

// Mutation hook for updating a task
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTaskRequest }) => {
      const response = await apiService.updateTask(id, data);
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.detail(id) });

      // Snapshot the previous value
      const previousTask = queryClient.getQueryData<Task>(queryKeys.tasks.detail(id));

      // Optimistically update the cache
      if (previousTask) {
        queryClient.setQueryData(queryKeys.tasks.detail(id), {
          ...previousTask,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousTask };
    },
    onSuccess: (updatedTask) => {
      if (!updatedTask) return;
      
      // Update the task in cache
      queryClient.setQueryData(queryKeys.tasks.detail(updatedTask.id), updatedTask);
      
      // Invalidate tasks lists for the project
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: updatedTask.projectId })
      });
    },
    onError: (error, variables, context) => {
      // Revert the optimistic update
      if (context?.previousTask) {
        queryClient.setQueryData(queryKeys.tasks.detail(variables.id), context.previousTask);
      }
      console.error('Failed to update task:', error);
      // TODO: Show error toast
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(variables.id) });
    },
  });
}

// Mutation hook for deleting a task
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiService.deleteTask(id);
      return id;
    },
    onSuccess: (deletedId, _variables) => {
      // Remove task from cache
      queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(deletedId) });
      
      // Invalidate all tasks lists
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
    },
    onError: (error) => {
      console.error('Failed to delete task:', error);
      // TODO: Show error toast
    },
  });
}

// Mutation hook for reordering tasks (drag and drop)
export function useReorderTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      newStatus,
      newOrder,
      projectId,
    }: {
      id: string;
      newStatus: string;
      newOrder: number;
      projectId: string;
    }) => {
      const response = await apiService.reorderTask(id, newStatus, newOrder, projectId);
      return response.data;
    },
    onMutate: async ({ id, newStatus, newOrder, projectId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists() });

      // Snapshot the previous tasks
      const previousTasks = queryClient.getQueryData<Task[]>(
        queryKeys.tasks.list({ projectId })
      );

      // Optimistically update tasks order
      if (previousTasks) {
        const updatedTasks = [...previousTasks];
        const taskIndex = updatedTasks.findIndex(task => task.id === id);
        
        if (taskIndex !== -1) {
          const task = updatedTasks[taskIndex];
          updatedTasks[taskIndex] = {
            ...task,
            status: newStatus as any,
            order: newOrder,
            updatedAt: new Date().toISOString(),
          };
          
          // Update cache
          queryClient.setQueryData(
            queryKeys.tasks.list({ projectId }), 
            updatedTasks
          );
        }
      }

      return { previousTasks };
    },
    onSuccess: (updatedTask) => {
      if (!updatedTask) return;
      
      // Update the specific task in cache
      queryClient.setQueryData(queryKeys.tasks.detail(updatedTask.id), updatedTask);
      
      // Invalidate tasks lists to ensure consistency
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: updatedTask.projectId })
      });
    },
    onError: (error, variables, context) => {
      // Revert the optimistic update
      if (context?.previousTasks) {
        queryClient.setQueryData(
          queryKeys.tasks.list({ projectId: variables.projectId }),
          context.previousTasks
        );
      }
      console.error('Failed to reorder task:', error);
      // TODO: Show error toast
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tasks.list({ projectId: variables.projectId })
      });
    },
  });
}