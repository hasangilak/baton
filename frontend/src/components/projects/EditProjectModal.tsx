import React, { useState, useEffect, useCallback } from 'react';
import { X, Folder, Palette } from 'lucide-react';
import clsx from 'clsx';
import { useUpdateProject, useDeleteProject } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project, UpdateProjectRequest } from '../../types';

interface EditProjectModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
}

const colorOptions = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#f59e0b'
];

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  project,
  isOpen,
  onClose,
  onDelete
}) => {
  const [formData, setFormData] = useState<UpdateProjectRequest>({
    name: '',
    description: '',
    color: '#3b82f6'
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const toast = useToast();

  const handleClose = useCallback(() => {
    setFormData({ name: '', description: '', color: '#3b82f6' });
    setErrors({});
    setShowDeleteConfirm(false);
    onClose();
  }, [onClose]);

  // Update form data when project changes
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name,
        description: project.description || '',
        color: project.color
      });
    }
  }, [project]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !showDeleteConfirm) {
        e.preventDefault();
        document.getElementById('edit-project-form')?.dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true })
        );
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDeleteConfirm, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!project) return;
    
    // Validation
    const newErrors: { [key: string]: string } = {};
    if (!formData.name?.trim()) {
      newErrors.name = 'Project name is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await updateProjectMutation.mutateAsync({ 
        id: project.id, 
        data: formData 
      });
      toast.success('Project updated', `"${result?.name ?? 'Project'}" has been updated successfully.`);
      handleClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project';
      toast.error('Failed to update project', errorMessage);
      setErrors({ general: errorMessage });
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    
    try {
      await deleteProjectMutation.mutateAsync(project.id);
      toast.success('Project deleted', `"${project.name}" has been deleted.`);
      onDelete?.();
      handleClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      toast.error('Failed to delete project', errorMessage);
      setErrors({ general: errorMessage });
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="inline-block transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6 sm:align-middle">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Folder className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Project
              </h3>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {!showDeleteConfirm ? (
            // Edit Form
            <form id="edit-project-form" onSubmit={handleSubmit} className="space-y-6">
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
                  className={clsx(
                    'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  )}
                  placeholder="Enter project name"
                  autoFocus
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
                />
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
                      className={clsx(
                        'w-8 h-8 rounded-full border-2 transition-all duration-200',
                        formData.color === color 
                          ? 'border-gray-900 scale-110' 
                          : 'border-gray-300 hover:border-gray-400'
                      )}
                      style={{ backgroundColor: color }}
                      title={color}
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

              {/* Actions */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={updateProjectMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  Delete Project
                </button>
                
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={updateProjectMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateProjectMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            // Delete Confirmation
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <X className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Delete Project
                </h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete "{project.name}"? This action cannot be undone.
                  All tasks and data associated with this project will be permanently deleted.
                </p>
              </div>

              {errors.general && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-800">{errors.general}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteProjectMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteProjectMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};