import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import type { MCPPlan, Task } from '../types';

// Query hook for fetching MCP plans
export function useMCPPlans(projectId?: string, agentId?: string) {
  return useQuery({
    queryKey: queryKeys.mcpPlans.list({ projectId, agentId }),
    queryFn: async () => {
      const response = await apiService.getMCPPlans(projectId, agentId);
      return response.data;
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
  });
}

// Query hook for fetching a single MCP plan
export function useMCPPlan(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mcpPlans.detail(id!),
    queryFn: async () => {
      const response = await apiService.getMCPPlan(id!);
      return response.data;
    },
    enabled: !!id,
    staleTime: 3 * 60 * 1000,
  });
}

// Mutation hook for creating an MCP plan
export function useCreateMCPPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      agentName: string;
      projectId: string;
      tasks: Array<{
        title: string;
        description?: string;
        priority?: string;
        order?: number;
      }>;
    }) => {
      const response = await apiService.createMCPPlan(data);
      return response.data;
    },
    onSuccess: (newPlan) => {
      // Add plan to cache
      queryClient.setQueryData(queryKeys.mcpPlans.detail(newPlan.id), newPlan);
      
      // Invalidate plans lists
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpPlans.lists() });
      
      // Invalidate project-specific plans
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.mcpPlans.list({ projectId: newPlan.projectId })
      });
    },
    onError: (error) => {
      console.error('Failed to create MCP plan:', error);
      // TODO: Show error toast
    },
  });
}

// Mutation hook for updating an MCP plan
export function useUpdateMCPPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      data 
    }: { 
      id: string; 
      data: {
        title?: string;
        description?: string;
        status?: string;
      }
    }) => {
      const response = await apiService.updateMCPPlan(id, data);
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.mcpPlans.detail(id) });

      // Snapshot the previous value
      const previousPlan = queryClient.getQueryData<MCPPlan>(queryKeys.mcpPlans.detail(id));

      // Optimistically update the cache
      if (previousPlan) {
        queryClient.setQueryData(queryKeys.mcpPlans.detail(id), {
          ...previousPlan,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousPlan };
    },
    onSuccess: (updatedPlan) => {
      // Update the plan in cache
      queryClient.setQueryData(queryKeys.mcpPlans.detail(updatedPlan.id), updatedPlan);
      
      // Invalidate plans lists
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpPlans.lists() });
    },
    onError: (error, variables, context) => {
      // Revert the optimistic update
      if (context?.previousPlan) {
        queryClient.setQueryData(queryKeys.mcpPlans.detail(variables.id), context.previousPlan);
      }
      console.error('Failed to update MCP plan:', error);
      // TODO: Show error toast
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpPlans.detail(variables.id) });
    },
  });
}

// Mutation hook for converting MCP plan to tasks
export function useConvertMCPPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiService.convertMCPPlan(id);
      return { planId: id, tasks: response.data.tasks };
    },
    onSuccess: ({ planId, tasks }) => {
      // Get the plan to know which project to invalidate
      const plan = queryClient.getQueryData<MCPPlan>(queryKeys.mcpPlans.detail(planId));
      
      if (plan) {
        // Invalidate tasks for the project
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.tasks.list({ projectId: plan.projectId })
        });
        
        // Update plan status to converted
        queryClient.setQueryData(queryKeys.mcpPlans.detail(planId), {
          ...plan,
          status: 'converted',
          updatedAt: new Date().toISOString(),
        });
      }
      
      // Cache the new tasks
      tasks.forEach((task: Task) => {
        queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      });
    },
    onError: (error) => {
      console.error('Failed to convert MCP plan:', error);
      // TODO: Show error toast
    },
  });
}

// Mutation hook for deleting an MCP plan
export function useDeleteMCPPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiService.deleteMCPPlan(id);
      return id;
    },
    onSuccess: (deletedId) => {
      // Remove plan from cache
      queryClient.removeQueries({ queryKey: queryKeys.mcpPlans.detail(deletedId) });
      
      // Invalidate plans lists
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpPlans.lists() });
    },
    onError: (error) => {
      console.error('Failed to delete MCP plan:', error);
      // TODO: Show error toast
    },
  });
}