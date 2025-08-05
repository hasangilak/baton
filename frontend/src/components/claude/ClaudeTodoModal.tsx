import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Bot,
  Copy,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileText,
  Calendar,
  Hash,
  Monitor,
  ArrowUpDown,
  User,
  Activity
} from 'lucide-react';
import clsx from 'clsx';
import type { ClaudeTodo, ClaudeTodoStatus, ClaudeTodoPriority } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ClaudeTodoModalProps {
  todo: ClaudeTodo | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (todoId: string, newStatus: ClaudeTodoStatus) => void;
  onPriorityChange?: (todoId: string, newPriority: ClaudeTodoPriority) => void;
  onSync?: (todoId: string) => void;
  onPlanClick?: (planId: string) => void;
}

const statusIcons = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
};

const statusColors = {
  pending: 'text-gray-500',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
};

const statusBadgeColors = {
  pending: 'text-gray-700 bg-gray-50 border-gray-200',
  in_progress: 'text-blue-700 bg-blue-50 border-blue-200',
  completed: 'text-green-700 bg-green-50 border-green-200',
};

const priorityColors = {
  high: 'text-red-500 bg-red-50 border-red-200',
  medium: 'text-yellow-500 bg-yellow-50 border-yellow-200',
  low: 'text-green-500 bg-green-50 border-green-200',
};

const priorityIcons = {
  high: AlertCircle,
  medium: AlertCircle,
  low: AlertCircle,
};

export const ClaudeTodoModal: React.FC<ClaudeTodoModalProps> = ({
  todo,
  isOpen,
  onClose,
  onStatusChange,
  onPriorityChange,
  onSync,
  onPlanClick
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['details']));
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  if (!todo) return null;

  const StatusIcon = statusIcons[todo.status];
  const PriorityIcon = priorityIcons[todo.priority];

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const copyToClipboard = async (text: string, itemName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemName);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const exportTodo = () => {
    const exportData = {
      todo: {
        id: todo.id,
        content: todo.content,
        status: todo.status,
        priority: todo.priority,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        orderIndex: todo.orderIndex,
        createdBy: todo.createdBy,
        metadata: todo.metadata
      },
      linkedPlan: todo.linkedPlan,
      syncedTask: todo.syncedTask,
      project: todo.project,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `todo-${todo.id}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getCreatedByIcon = (createdBy: string) => {
    switch (createdBy) {
      case 'claude':
        return <Bot className="w-4 h-4" />;
      case 'human':
        return <User className="w-4 h-4" />;
      case 'system':
        return <Monitor className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getCreatedByColor = (createdBy: string) => {
    switch (createdBy) {
      case 'claude':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'human':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'system':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-gray-200 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <StatusIcon className={clsx('w-6 h-6', statusColors[todo.status])} />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className={clsx(
                  'text-lg font-semibold mb-2 break-words',
                  todo.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'
                )}>
                  {todo.content}
                </DialogTitle>
                <div className="flex items-center flex-wrap gap-2">
                  <span className={clsx(
                    'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                    statusBadgeColors[todo.status]
                  )}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {todo.status.replace('_', ' ')}
                  </span>
                  
                  <span className={clsx(
                    'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                    priorityColors[todo.priority]
                  )}>
                    <PriorityIcon className="w-3 h-3 mr-1" />
                    {todo.priority}
                  </span>

                  <span className={clsx(
                    'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                    getCreatedByColor(todo.createdBy)
                  )}>
                    {getCreatedByIcon(todo.createdBy)}
                    <span className="ml-1">by {todo.createdBy}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 ml-4">
              <select
                value={todo.status}
                onChange={(e) => onStatusChange?.(todo.id, e.target.value as ClaudeTodoStatus)}
                className="text-xs border border-gray-300 rounded px-2 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              
              <select
                value={todo.priority}
                onChange={(e) => onPriorityChange?.(todo.id, e.target.value as ClaudeTodoPriority)}
                className="text-xs border border-gray-300 rounded px-2 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(todo.content, 'content')}
                className="p-2"
              >
                <Copy className="w-4 h-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={exportTodo}
                className="p-2"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* Todo Details Section */}
            <div className="space-y-3">
              <button
                onClick={() => toggleSection('details')}
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {expandedSections.has('details') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Todo Details</span>
              </button>

              {expandedSections.has('details') && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span>Created At</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs">
                        {formatDate(todo.createdAt)}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span>Updated At</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs">
                        {formatDate(todo.updatedAt)}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Hash className="w-4 h-4" />
                        <span>Order Index</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs">
                        {todo.orderIndex}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Hash className="w-4 h-4" />
                        <span>Todo ID</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs break-all">
                        {todo.id}
                        <button
                          onClick={() => copyToClipboard(todo.id, 'todoId')}
                          className="ml-2 text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-3 h-3 inline" />
                        </button>
                        {copiedItem === 'todoId' && (
                          <span className="ml-1 text-green-600">✓</span>
                        )}
                      </div>
                    </div>

                    {todo.project && (
                      <div className="md:col-span-2">
                        <div className="flex items-center space-x-2 text-gray-600 mb-1">
                          <FileText className="w-4 h-4" />
                          <span>Project</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: todo.project.color }}
                          />
                          <span className="text-gray-900 text-xs">{todo.project.name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {copiedItem === 'content' && (
                    <div className="mt-4 text-xs text-green-600 flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Content copied to clipboard
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Linked Plan Section */}
            {todo.linkedPlan && (
              <div className="space-y-3">
                <button
                  onClick={() => toggleSection('plan')}
                  className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {expandedSections.has('plan') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Linked Plan</span>
                </button>

                {expandedSections.has('plan') && (
                  <div
                    className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-gray-300 transition-colors"
                    onClick={() => onPlanClick?.(todo.linkedPlan!.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {todo.linkedPlan.title}
                          </h4>
                          <div className="flex items-center space-x-2">
                            <span className={clsx(
                              'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                              todo.linkedPlan.status === 'accepted' ? 'text-green-700 bg-green-50 border-green-200' :
                              todo.linkedPlan.status === 'implemented' ? 'text-blue-700 bg-blue-50 border-blue-200' :
                              'text-gray-700 bg-gray-50 border-gray-200'
                            )}>
                              {todo.linkedPlan.status}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(todo.linkedPlan.capturedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400 ml-2" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sync Information Section */}
            {todo.syncedTask && (
              <div className="space-y-3">
                <button
                  onClick={() => toggleSection('sync')}
                  className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {expandedSections.has('sync') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Sync Information</span>
                </button>

                {expandedSections.has('sync') && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <ArrowUpDown className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 mb-1">
                          Synced to Baton Task
                        </h4>
                        <div className="space-y-2">
                          <div>
                            <span className="text-sm text-gray-600">Task Title: </span>
                            <span className="text-sm text-gray-900">{todo.syncedTask.title}</span>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div>
                              <span className="text-sm text-gray-600">Status: </span>
                              <span className={clsx(
                                'text-sm font-medium',
                                todo.syncedTask.status === 'done' ? 'text-green-600' :
                                todo.syncedTask.status === 'in_progress' ? 'text-blue-600' :
                                'text-gray-600'
                              )}>
                                {todo.syncedTask.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div>
                              <span className="text-sm text-gray-600">Priority: </span>
                              <span className={clsx(
                                'text-sm font-medium',
                                todo.syncedTask.priority === 'high' ? 'text-red-600' :
                                todo.syncedTask.priority === 'medium' ? 'text-yellow-600' :
                                'text-green-600'
                              )}>
                                {todo.syncedTask.priority}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            Task ID: {todo.syncedTask.id}
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metadata Section */}
            {todo.metadata && Object.keys(todo.metadata).length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => toggleSection('metadata')}
                  className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {expandedSections.has('metadata') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Additional Metadata</span>
                </button>

                {expandedSections.has('metadata') && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(todo.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Actions Section */}
            <div className="space-y-3">
              <button
                onClick={() => toggleSection('actions')}
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {expandedSections.has('actions') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Quick Actions</span>
              </button>

              {expandedSections.has('actions') && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="space-y-3">
                    {!todo.syncedTask && onSync && (
                      <Button
                        onClick={() => onSync(todo.id)}
                        className="w-full flex items-center justify-center space-x-2"
                        variant="outline"
                      >
                        <ArrowUpDown className="w-4 h-4" />
                        <span>Sync to Baton Task</span>
                      </Button>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => copyToClipboard(todo.content, 'content-action')}
                        variant="outline"
                        size="sm"
                        className="flex items-center justify-center space-x-2"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Copy Content</span>
                      </Button>
                      
                      <Button
                        onClick={exportTodo}
                        variant="outline"
                        size="sm"
                        className="flex items-center justify-center space-x-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export</span>
                      </Button>
                    </div>
                    
                    {copiedItem === 'content-action' && (
                      <div className="text-xs text-green-600 flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Content copied to clipboard
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};