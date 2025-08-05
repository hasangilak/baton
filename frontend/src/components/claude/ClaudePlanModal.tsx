import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  Archive,
  Calendar,
  Monitor,
  Hash,
  Copy,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Bot,
  ArrowUpDown,
  AlertCircle,
  MoreHorizontal,
  X
} from 'lucide-react';
import clsx from 'clsx';
import type { ClaudeCodePlan, ClaudeCodePlanStatus, ClaudeTodo } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ClaudePlanModalProps {
  plan: ClaudeCodePlan | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (planId: string, newStatus: ClaudeCodePlanStatus) => void;
  onTodoClick?: (todo: ClaudeTodo) => void;
}

const statusIcons = {
  accepted: CheckCircle2,
  implemented: Clock,
  archived: Archive,
};

const statusColors = {
  accepted: 'text-green-500',
  implemented: 'text-blue-500',
  archived: 'text-gray-500',
};

const statusBadgeColors = {
  accepted: 'text-green-700 bg-green-50 border-green-200',
  implemented: 'text-blue-700 bg-blue-50 border-blue-200',
  archived: 'text-gray-700 bg-gray-50 border-gray-200',
};

const priorityColors = {
  high: 'text-red-500 bg-red-50 border-red-200',
  medium: 'text-yellow-500 bg-yellow-50 border-yellow-200',
  low: 'text-green-500 bg-green-50 border-green-200',
};

const todoStatusColors = {
  pending: 'text-gray-500',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
};

const todoStatusIcons = {
  pending: Clock,
  in_progress: Clock,
  completed: CheckCircle2,
};

export const ClaudePlanModal: React.FC<ClaudePlanModalProps> = ({
  plan,
  isOpen,
  onClose,
  onStatusChange,
  onTodoClick
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['content']));
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  if (!plan) return null;

  const StatusIcon = statusIcons[plan.status];
  const linkedTodos = plan.linkedTodos || [];
  const completedTodos = linkedTodos.filter(todo => todo.status === 'completed').length;
  const totalTodos = linkedTodos.length;
  const progressPercentage = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

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

  const exportPlan = () => {
    const exportData = {
      plan: {
        id: plan.id,
        title: plan.title,
        content: plan.content,
        status: plan.status,
        capturedAt: plan.capturedAt,
        sessionId: plan.sessionId,
        metadata: plan.metadata
      },
      linkedTodos: linkedTodos,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plan-${plan.id}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-gray-200 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl font-semibold text-gray-900 mb-2 break-words">
                  {plan.title}
                </DialogTitle>
                <div className="flex items-center flex-wrap gap-2">
                  <span className={clsx(
                    'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                    statusBadgeColors[plan.status]
                  )}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {plan.status}
                  </span>
                  
                  {totalTodos > 0 && (
                    <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                      {completedTodos}/{totalTodos} todos ({progressPercentage}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 ml-4">
              <select
                value={plan.status}
                onChange={(e) => onStatusChange?.(plan.id, e.target.value as ClaudeCodePlanStatus)}
                className="text-xs border border-gray-300 rounded px-2 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="accepted">Accepted</option>
                <option value="implemented">Implemented</option>
                <option value="archived">Archived</option>
              </select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(plan.content, 'content')}
                className="p-2"
              >
                <Copy className="w-4 h-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={exportPlan}
                className="p-2"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* Plan Content Section */}
            <div className="space-y-3">
              <button
                onClick={() => toggleSection('content')}
                className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {expandedSections.has('content') ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Plan Content</span>
              </button>

              {expandedSections.has('content') && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
                    {plan.content}
                  </pre>
                  {copiedItem === 'content' && (
                    <div className="mt-2 text-xs text-green-600 flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Copied to clipboard
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Progress Overview */}
            {totalTodos > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => toggleSection('progress')}
                  className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {expandedSections.has('progress') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Progress Overview</span>
                </button>

                {expandedSections.has('progress') && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Completion Progress</span>
                        <span className="font-medium">{progressPercentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-semibold text-gray-500">
                          {linkedTodos.filter(t => t.status === 'pending').length}
                        </div>
                        <div className="text-xs text-gray-600">Pending</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-blue-600">
                          {linkedTodos.filter(t => t.status === 'in_progress').length}
                        </div>
                        <div className="text-xs text-gray-600">In Progress</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-green-600">
                          {completedTodos}
                        </div>
                        <div className="text-xs text-gray-600">Completed</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Linked Todos Section */}
            {linkedTodos.length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => toggleSection('todos')}
                  className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {expandedSections.has('todos') ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>Linked Todos ({linkedTodos.length})</span>
                </button>

                {expandedSections.has('todos') && (
                  <div className="space-y-2">
                    {linkedTodos.map((todo) => {
                      const TodoStatusIcon = todoStatusIcons[todo.status];
                      return (
                        <div
                          key={todo.id}
                          className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors cursor-pointer"
                          onClick={() => onTodoClick?.(todo)}
                        >
                          <TodoStatusIcon
                            className={clsx('w-4 h-4', todoStatusColors[todo.status])}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={clsx(
                              'text-sm',
                              todo.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'
                            )}>
                              {todo.content}
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className={clsx(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
                                priorityColors[todo.priority]
                              )}>
                                <AlertCircle className="w-2.5 h-2.5 mr-1" />
                                {todo.priority}
                              </span>
                              {todo.createdAt && (
                                <span className="text-xs text-gray-500">
                                  {formatDate(todo.createdAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Metadata Section */}
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
                <span>Plan Details</span>
              </button>

              {expandedSections.has('metadata') && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span>Captured At</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs">
                        {formatDate(plan.capturedAt)}
                      </div>
                    </div>

                    {plan.sessionId && (
                      <div>
                        <div className="flex items-center space-x-2 text-gray-600 mb-1">
                          <Hash className="w-4 h-4" />
                          <span>Session ID</span>
                        </div>
                        <div className="text-gray-900 font-mono text-xs break-all">
                          {plan.sessionId}
                          <button
                            onClick={() => copyToClipboard(plan.sessionId!, 'sessionId')}
                            className="ml-2 text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="w-3 h-3 inline" />
                          </button>
                          {copiedItem === 'sessionId' && (
                            <span className="ml-1 text-green-600">✓</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span>Created At</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs">
                        {formatDate(plan.createdAt)}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span>Updated At</span>
                      </div>
                      <div className="text-gray-900 font-mono text-xs">
                        {formatDate(plan.updatedAt)}
                      </div>
                    </div>

                    {plan.metadata && (plan.metadata as any)?.cwd && (
                      <div className="md:col-span-2">
                        <div className="flex items-center space-x-2 text-gray-600 mb-1">
                          <Monitor className="w-4 h-4" />
                          <span>Working Directory</span>
                        </div>
                        <div className="text-gray-900 font-mono text-xs break-all">
                          {(plan.metadata as any).cwd}
                        </div>
                      </div>
                    )}

                    {plan.project && (
                      <div className="md:col-span-2">
                        <div className="flex items-center space-x-2 text-gray-600 mb-1">
                          <FileText className="w-4 h-4" />
                          <span>Project</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: plan.project.color }}
                          />
                          <span className="text-gray-900 text-xs">{plan.project.name}</span>
                        </div>
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