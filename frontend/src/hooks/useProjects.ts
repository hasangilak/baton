import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import type { CreateProjectRequest, UpdateProjectRequest } from '../types';
import { useToast } from './useToast';

// Query hook for fetching all projects
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.lists(),
    queryFn: async () => {
      const response = await apiService.getProjects();
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Query hook for fetching a single project
export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id!),
    queryFn: async () => {
      const response = await apiService.getProject(id!);
      return response.data;
    },
    enabled: !!id, // Only run if id is provided
    staleTime: 5 * 60 * 1000,
  });
}

// Mutation hook for creating a project
export function useCreateProject() {
  const queryClient = useQueryClient();
  const { error: showError } = useToast();

  return useMutation({
    mutationFn: async (data: CreateProjectRequest) => {
      const response = await apiService.createProject(data);
      return response.data;
    },
    onSuccess: (newProject) => {
      if (!newProject) return;
      
      // Invalidate and refetch projects list
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      
      // Add the new project to the cache
      queryClient.setQueryData(queryKeys.projects.detail(newProject.id), newProject);
    },
    onError: (error) => {
      console.error('Failed to create project:', error);
      showError('Failed to create project', 'Please try again.');
    },
  });
}

// Mutation hook for updating a project
export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { error: showError } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateProjectRequest }) => {
      const response = await apiService.updateProject(id, data);
      return response.data;
    },
    onSuccess: (updatedProject) => {
      if (!updatedProject) return;
      
      // Update the project in the cache
      queryClient.setQueryData(queryKeys.projects.detail(updatedProject.id), updatedProject);
      
      // Invalidate projects list to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
    onError: (error) => {
      console.error('Failed to update project:', error);
      showError('Failed to update project', 'Please try again.');
    },
  });
}

// Mutation hook for deleting a project
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { error: showError } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiService.deleteProject(id);
      return id;
    },
    onSuccess: (deletedId) => {
      // Remove the project from cache
      queryClient.removeQueries({ queryKey: queryKeys.projects.detail(deletedId) });
      
      // Invalidate projects list
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      
      // Also invalidate related tasks
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
    onError: (error) => {
      console.error('Failed to delete project:', error);
      showError('Failed to delete project', 'Please try again.');
    },
  });
}