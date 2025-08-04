import React, { useState } from 'react';
import { 
  ArrowUpDown, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Bot,
  List,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import clsx from 'clsx';
import { useSyncTodosToTasks, useSyncTasksToTodos } from '../../hooks/useClaudeTodos';
import { useClaudeTodos } from '../../hooks/useClaudeTodos';
import { useTasks } from '../../hooks/useTasks';

interface SyncPanelProps {
  projectId: string;
}

type SyncDirection = 'todos-to-tasks' | 'tasks-to-todos';

export const SyncPanel: React.FC<SyncPanelProps> = ({ projectId }) => {
  const [syncDirection, setSyncDirection] = useState<SyncDirection>('todos-to-tasks');
  const [lastSyncResult, setLastSyncResult] = useState<{
    type: 'success' | 'error';
    message: string;
    count?: number;
  } | null>(null);

  const { data: todosResponse } = useClaudeTodos(projectId);
  const { data: tasksData } = useTasks(projectId);
  const syncTodosToTasksMutation = useSyncTodosToTasks();
  const syncTasksToTodosMutation = useSyncTasksToTodos();

  const todos = todosResponse?.todos ?? [];
  const tasks = tasksData ?? [];

  const handleSync = async () => {
    try {
      if (syncDirection === 'todos-to-tasks') {
        const result = await syncTodosToTasksMutation.mutateAsync({ projectId });
        setLastSyncResult({
          type: 'success',
          message: result.message,
          count: result.syncedCount
        });
      } else {
        const result = await syncTasksToTodosMutation.mutateAsync({ projectId });
        setLastSyncResult({
          type: 'success',
          message: result.message,
          count: result.syncedCount
        });
      }
    } catch (error) {
      setLastSyncResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Sync failed'
      });
    }
  };

  const isLoading = syncTodosToTasksMutation.isPending || syncTasksToTodosMutation.isPending;

  const getSyncButtonText = () => {
    if (isLoading) return 'Syncing...';
    if (syncDirection === 'todos-to-tasks') {
      return `Sync ${todos.length} Todos → Tasks`;
    }
    return `Sync ${tasks.length} Tasks → Todos`;
  };

  const getSyncDescription = () => {
    if (syncDirection === 'todos-to-tasks') {
      return 'Convert Claude Code todos into actionable Baton tasks. Existing synced todos will be skipped.';
    }
    return 'Sync Baton task updates back to Claude Code todos. This keeps your Claude Code session up to date.';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <ArrowUpDown className="w-6 h-6 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">Sync Claude Code & Baton</h3>
      </div>

      {/* Sync Direction Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Sync Direction
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => setSyncDirection('todos-to-tasks')}
            className={clsx(
              'flex items-center space-x-3 p-4 rounded-lg border-2 transition-all duration-200',
              syncDirection === 'todos-to-tasks'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-blue-600" />
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <List className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">Todos → Tasks</p>
              <p className="text-xs text-gray-500">Convert todos to tasks</p>
            </div>
          </button>

          <button
            onClick={() => setSyncDirection('tasks-to-todos')}
            className={clsx(
              'flex items-center space-x-3 p-4 rounded-lg border-2 transition-all duration-200',
              syncDirection === 'tasks-to-todos'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <div className="flex items-center space-x-2">
              <List className="w-5 h-5 text-green-600" />
              <ArrowLeft className="w-4 h-4 text-gray-400" />
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">Tasks → Todos</p>
              <p className="text-xs text-gray-500">Update todos from tasks</p>
            </div>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <p className="text-sm text-gray-600">
          {getSyncDescription()}
        </p>
      </div>

      {/* Sync Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Claude Todos</span>
          </div>
          <p className="text-2xl font-bold text-blue-900 mt-1">{todos.length}</p>
          <p className="text-xs text-blue-600">
            {todos.filter(t => t.syncedTaskId).length} already synced
          </p>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <List className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-900">Baton Tasks</span>
          </div>
          <p className="text-2xl font-bold text-green-900 mt-1">{tasks.length}</p>
          <p className="text-xs text-green-600">
            {tasks.filter((t: any) => t.labels?.includes('claude-sync')).length} from Claude
          </p>
        </div>
      </div>

      {/* Sync Button */}
      <button
        onClick={handleSync}
        disabled={isLoading || (syncDirection === 'todos-to-tasks' && todos.length === 0) || (syncDirection === 'tasks-to-todos' && tasks.length === 0)}
        className={clsx(
          'w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200',
          isLoading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
        )}
      >
        {isLoading ? (
          <RefreshCw className="w-5 h-5 animate-spin" />
        ) : (
          <ArrowUpDown className="w-5 h-5" />
        )}
        <span>{getSyncButtonText()}</span>
      </button>

      {/* Last Sync Result */}
      {lastSyncResult && (
        <div className={clsx(
          'mt-4 p-4 rounded-lg flex items-start space-x-3',
          lastSyncResult.type === 'success' 
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        )}>
          {lastSyncResult.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className={clsx(
              'text-sm font-medium',
              lastSyncResult.type === 'success' ? 'text-green-900' : 'text-red-900'
            )}>
              {lastSyncResult.type === 'success' ? 'Sync Successful' : 'Sync Failed'}
            </p>
            <p className={clsx(
              'text-xs mt-1',
              lastSyncResult.type === 'success' ? 'text-green-700' : 'text-red-700'
            )}>
              {lastSyncResult.message}
              {lastSyncResult.count !== undefined && (
                <span className="font-medium"> ({lastSyncResult.count} items)</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};