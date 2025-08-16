import React, { useState, useEffect, useCallback } from 'react';
import { Folder, Palette, FolderOpen } from 'lucide-react';
import { useCreateProject } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { CreateProjectRequest } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
}

const colorOptions = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#f59e0b'
];

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<CreateProjectRequest>({
    name: '',
    description: '',
    color: '#3b82f6',
    rootDirectory: ''
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const createProjectMutation = useCreateProject();
  const toast = useToast();

  const handleClose = useCallback(() => {
    setFormData({ name: '', description: '', color: '#3b82f6', rootDirectory: '' });
    setErrors({});
    onClose();
  }, [onClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('create-project-form')?.dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true })
        );
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await createProjectMutation.mutateAsync(formData);
      if (result) {
        toast.success('Project created', `"${result.name}" has been created successfully.`);
        onSuccess?.(result.id);
        handleClose();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      toast.error('Failed to create project', errorMessage);
      setErrors({ general: errorMessage });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Folder className="w-5 h-5 text-blue-600" />
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Create New Project
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-600">
            Create a new project to organize your tasks and collaborate with your team.
          </DialogDescription>
        </DialogHeader>

        <form id="create-project-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Project Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Project Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={cn(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
                errors.name ? 'border-red-300' : 'border-gray-300'
              )}
              placeholder="Enter project name"
              autoFocus
              data-testid="create-project-name-input"
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Describe your project (optional)"
              data-testid="create-project-description-input"
            />
          </div>

          {/* Root Directory */}
          <div>
            <label htmlFor="rootDirectory" className="block text-sm font-medium text-gray-700 mb-2">
              <FolderOpen className="w-4 h-4 inline mr-2" />
              Root Directory
            </label>
            <input
              type="text"
              id="rootDirectory"
              value={formData.rootDirectory}
              onChange={(e) => setFormData({ ...formData, rootDirectory: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="/path/to/your/project (optional)"
              data-testid="create-project-root-directory-input"
            />
            <p className="text-sm text-gray-500 mt-1">
              Working directory for Claude Code to execute commands. Leave blank to use default.
            </p>
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <Palette className="w-4 h-4 inline mr-2" />
              Project Color
            </label>
            <div className="grid grid-cols-6 gap-3">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all duration-200',
                    formData.color === color 
                      ? 'border-gray-900 scale-110' 
                      : 'border-gray-300 hover:border-gray-400'
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                  data-testid={`create-project-color-${color.replace('#', '')}`}
                />
              ))}
            </div>
          </div>

          {/* General Error */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{errors.general}</p>
            </div>
          )}
        </form>
        
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={createProjectMutation.isPending}
            data-testid="create-project-cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-project-form"
            disabled={createProjectMutation.isPending}
            data-testid="create-project-submit-button"
          >
            {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};