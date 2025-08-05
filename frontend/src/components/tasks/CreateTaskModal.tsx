import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Calendar, Tag, Flag } from 'lucide-react';
import { useCreateTask } from '../../hooks/useTasks';
import { useToast } from '../../hooks/useToast';
import type { CreateTaskRequest, TaskStatus, TaskPriority } from '../../types';
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

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  initialStatus?: TaskStatus;
  onSuccess?: (taskId: string) => void;
}

const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'high', label: 'High', color: 'text-red-600' },
];

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  projectId,
  initialStatus = 'todo',
  onSuccess
}) => {
  const [formData, setFormData] = useState<CreateTaskRequest>({
    title: '',
    description: '',
    status: initialStatus,
    priority: 'medium',
    projectId,
    labels: [],
    dueDate: undefined,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [labelInput, setLabelInput] = useState('');

  const createTaskMutation = useCreateTask();
  const toast = useToast();

  const handleClose = useCallback(() => {
    setFormData({
      title: '',
      description: '',
      status: initialStatus,
      priority: 'medium',
      projectId,
      labels: [],
      dueDate: undefined,
    });
    setErrors({});
    setLabelInput('');
    onClose();
  }, [onClose, projectId, initialStatus]);

  // Update form data when modal opens with new status
  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        status: initialStatus,
        projectId,
      }));
    }
  }, [isOpen, initialStatus, projectId]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('create-task-form')?.dispatchEvent(
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
    if (!formData.title.trim()) {
      newErrors.title = 'Task title is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await createTaskMutation.mutateAsync(formData);
      if (result) {
        toast.success('Task created', `"${result.title}" has been created successfully.`);
        onSuccess?.(result.id);
        handleClose();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create task';
      toast.error('Failed to create task', errorMessage);
      setErrors({ general: errorMessage });
    }
  };

  const addLabel = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && labelInput.trim()) {
      e.preventDefault();
      const newLabel = labelInput.trim();
      const currentLabels = formData.labels ?? [];
      if (!currentLabels.includes(newLabel)) {
        setFormData(prev => ({
          ...prev,
          labels: [...currentLabels, newLabel]
        }));
      }
      setLabelInput('');
    }
  };

  const removeLabel = (labelToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      labels: (prev.labels ?? []).filter(label => label !== labelToRemove)
    }));
  };

  const getStatusDisplay = (status: TaskStatus) => {
    switch (status) {
      case 'todo':
        return 'To Do';
      case 'in_progress':
        return 'In Progress';
      case 'done':
        return 'Done';
      default:
        return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-blue-600" />
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Create New Task
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-600">
            Create a new task in the {getStatusDisplay(initialStatus)} column.
          </DialogDescription>
        </DialogHeader>

        <form id="create-task-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Task Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Task Title *
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={cn(
                'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
                errors.title ? 'border-red-300' : 'border-gray-300'
              )}
              placeholder="What needs to be done?"
              autoFocus
              data-testid="create-task-title-input"
            />
            {errors.title && (
              <p className="text-sm text-red-600 mt-1">{errors.title}</p>
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
              placeholder="Add more details about this task (optional)"
              data-testid="create-task-description-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                <Flag className="w-4 h-4 inline mr-2" />
                Priority
              </label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                data-testid="create-task-priority-select"
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Due Date
              </label>
              <input
                type="date"
                id="dueDate"
                value={formData.dueDate ? formData.dueDate.split('T')[0] : ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined 
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                data-testid="create-task-due-date-input"
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label htmlFor="labels" className="block text-sm font-medium text-gray-700 mb-2">
              <Tag className="w-4 h-4 inline mr-2" />
              Labels
            </label>
            <input
              type="text"
              id="labels"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={addLabel}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Type a label and press Enter"
              data-testid="create-task-labels-input"
            />
            {(formData.labels?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(formData.labels ?? []).map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeLabel(label)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                      data-testid={`remove-label-${label}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
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
            disabled={createTaskMutation.isPending}
            data-testid="create-task-cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-task-form"
            disabled={createTaskMutation.isPending}
            data-testid="create-task-submit-button"
          >
            {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};