import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import type { 
  ClaudeCodePlan, 
  ClaudeCodePlanStatus, 
  CapturePlanRequest 
} from '../types';

// Query hook for fetching plans by project
export function usePlans(projectId: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.plans.list({ 
      projectId, 
      ...(status && { status }) 
    }),
    queryFn: async () => {
      const response = await apiService.getPlans(projectId, status);
      return response; // Handle API response
    },
    enabled: !!projectId, // Only run if projectId is provided
    staleTime: 2 * 60 * 1000, // 2 minutes (plans change less frequently than tasks)
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for real-time updates
  });
}

// Query hook for fetching a single plan
export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plans.detail(id!),
    queryFn: async () => {
      const response = await apiService.getPlan(id!);
      return response.data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutation hook for capturing a plan (from hooks)
export function useCapturePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CapturePlanRequest) => {
      const response = await apiService.capturePlan(data);
      return response.data;
    },
    onSuccess: (newPlan) => {
      if (!newPlan) return;
      
      // Add plan to cache
      queryClient.setQueryData(queryKeys.plans.detail(newPlan.id), newPlan);
      
      // Invalidate plans lists for the project
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.plans.list({ projectId: newPlan.projectId })
      });
      
      // Invalidate all plans lists to be safe
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.lists() });
    },
    onError: (error) => {
      console.error('Failed to capture plan:', error);
      // TODO: Show error toast
    },
  });
}

// Mutation hook for updating a plan
export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      data 
    }: { 
      id: string; 
      data: {
        title?: string;
        status?: ClaudeCodePlanStatus;
        metadata?: any;
      }
    }) => {
      const response = await apiService.updatePlan(id, data);
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.plans.detail(id) });

      // Snapshot the previous value
      const previousPlan = queryClient.getQueryData<ClaudeCodePlan>(queryKeys.plans.detail(id));

      // Optimistically update the cache
      if (previousPlan) {
        queryClient.setQueryData(queryKeys.plans.detail(id), {
          ...previousPlan,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousPlan };
    },
    onSuccess: (updatedPlan) => {
      if (!updatedPlan) return;
      
      // Update the plan in cache
      queryClient.setQueryData(queryKeys.plans.detail(updatedPlan.id), updatedPlan);
      
      // Invalidate plans lists for the project
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.plans.list({ projectId: updatedPlan.projectId })
      });
    },
    onError: (error, variables, context) => {
      // Revert the optimistic update
      if (context?.previousPlan) {
        queryClient.setQueryData(queryKeys.plans.detail(variables.id), context.previousPlan);
      }
      console.error('Failed to update plan:', error);
      // TODO: Show error toast
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.detail(variables.id) });
    },
  });
}

// Mutation hook for deleting a plan
export function useDeletePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiService.deletePlan(id);
      return id;
    },
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.plans.detail(id) });

      // Snapshot the previous plan for potential rollback
      const previousPlan = queryClient.getQueryData<ClaudeCodePlan>(queryKeys.plans.detail(id));

      // Optimistically remove the plan from cache
      queryClient.removeQueries({ queryKey: queryKeys.plans.detail(id) });
      
      // Update plans lists optimistically
      queryClient.setQueriesData(
        { queryKey: queryKeys.plans.lists() },
        (oldData: any) => {
          if (!oldData?.plans) return oldData;
          return {
            ...oldData,
            plans: oldData.plans.filter((plan: ClaudeCodePlan) => plan.id !== id),
            pagination: {
              ...oldData.pagination,
              total: oldData.pagination.total - 1,
            },
          };
        }
      );

      return { previousPlan };
    },
    onSuccess: (deletedId) => {
      // Remove plan from cache (already done in onMutate, but ensure consistency)
      queryClient.removeQueries({ queryKey: queryKeys.plans.detail(deletedId) });
      
      // Invalidate all plans lists to ensure accurate counts
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.lists() });
    },
    onError: (error, variables, context) => {
      // Restore the plan if deletion failed
      if (context?.previousPlan) {
        queryClient.setQueryData(queryKeys.plans.detail(variables), context.previousPlan);
        
        // Also restore in lists
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.lists() });
      }
      console.error('Failed to delete plan:', error);
      // TODO: Show error toast
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.lists() });
    },
  });
}

// Export all plan-related query keys for use in other components
export const planQueryKeys = queryKeys.plans;