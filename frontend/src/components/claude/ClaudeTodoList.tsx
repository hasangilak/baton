import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle,
  Bot,
  RefreshCw,
  ArrowUpDown,
  ExternalLink,
  MoreHorizontal
} from 'lucide-react';
import clsx from 'clsx';
import type { ClaudeTodo } from '../../types';
import { useClaudeTodos, useDeleteClaudeTodo } from '../../hooks/useClaudeTodos';
import { useWebSocket } from '../../hooks/useWebSocket';

interface ClaudeTodoListProps {
  projectId: string;
  onSync?: () => void;
}

const statusIcons = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
};

const priorityColors = {
  high: 'text-red-500 bg-red-50 border-red-200',
  medium: 'text-yellow-500 bg-yellow-50 border-yellow-200',
  low: 'text-green-500 bg-green-50 border-green-200',
};

const statusColors = {
  pending: 'text-gray-500',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
};

export const ClaudeTodoList: React.FC<ClaudeTodoListProps> = ({ 
  projectId, 
  onSync 
}) => {
  const { data: todosResponse, isLoading, refetch } = useClaudeTodos(projectId);
  const deleteTodoMutation = useDeleteClaudeTodo();
  const [selectedTodos, setSelectedTodos] = useState<string[]>([]);
  
  // WebSocket integration for real-time updates
  const { on, off } = useWebSocket({ activeProjectId: projectId });
  const [localTodos, setLocalTodos] = useState<ClaudeTodo[]>([]);

  // Use WebSocket data if available, otherwise fall back to React Query data
  const todos = localTodos.length > 0 ? localTodos : (todosResponse?.todos ?? []);

  // Sync local todos with React Query data when it changes
  useEffect(() => {
    if (todosResponse?.todos) {
      setLocalTodos(todosResponse.todos);
    }
  }, [todosResponse?.todos]);

  // WebSocket event listeners for real-time updates
  useEffect(() => {
    if (!on || !off) return;

    const handleBatchUpdate = (data: { projectId: string; todos: ClaudeTodo[]; action: string }) => {
      console.log('🤖 ClaudeTodoList received batch update:', data);
      if (data.projectId === projectId && data.todos) {
        setLocalTodos(data.todos);
      }
    };

    const handleTodoCreated = (todo: ClaudeTodo) => {
      console.log('🤖 ClaudeTodoList received todo created:', todo);
      if (todo.projectId === projectId) {
        setLocalTodos(prev => [...prev, todo]);
      }
    };

    const handleTodoUpdated = (todo: ClaudeTodo) => {
      console.log('🤖 ClaudeTodoList received todo updated:', todo);
      if (todo.projectId === projectId) {
        setLocalTodos(prev => prev.map(t => t.id === todo.id ? todo : t));
      }
    };

    const handleTodoDeleted = (data: { projectId: string; todoId: string; deletedTodo: any }) => {
      console.log('🤖 ClaudeTodoList received todo deleted:', data);
      if (data.projectId === projectId) {
        setLocalTodos(prev => prev.filter(t => t.id !== data.todoId));
      }
    };

    const handleSyncToTasks = (data: { projectId: string; syncedTasks: any[]; action: string }) => {
      console.log('🤖 ClaudeTodoList received sync to tasks:', data);
      if (data.projectId === projectId) {
        // Refetch todos to get updated sync status
        refetch();
      }
    };

    const handleSyncFromTasks = (data: { projectId: string; syncedTodos: ClaudeTodo[]; action: string }) => {
      console.log('🤖 ClaudeTodoList received sync from tasks:', data);
      if (data.projectId === projectId) {
        // Refetch todos to get the complete updated list
        refetch();
      }
    };

    const handleMCPOperation = (data: { projectId: string; operation: string; count: number; action: string }) => {
      console.log('🤖 ClaudeTodoList received MCP operation:', data);
      if (data.projectId === projectId && data.operation === 'TodoWrite') {
        // MCP TodoWrite operation completed, refetch todos to get updated data
        refetch();
      }
    };

    // Register WebSocket event listeners
    on('claude-todos-batch-updated', handleBatchUpdate);
    on('claude-todo-created', handleTodoCreated);
    on('claude-todo-updated', handleTodoUpdated);
    on('claude-todo-deleted', handleTodoDeleted);
    on('claude-todos-synced-to-tasks', handleSyncToTasks);
    on('claude-tasks-synced-to-todos', handleSyncFromTasks);
    on('claude-mcp-operation-completed', handleMCPOperation);

    // Cleanup event listeners on unmount
    return () => {
      off('claude-todos-batch-updated', handleBatchUpdate);
      off('claude-todo-created', handleTodoCreated);
      off('claude-todo-updated', handleTodoUpdated);
      off('claude-todo-deleted', handleTodoDeleted);
      off('claude-todos-synced-to-tasks', handleSyncToTasks);
      off('claude-tasks-synced-to-todos', handleSyncFromTasks);
      off('claude-mcp-operation-completed', handleMCPOperation);
    };
  }, [on, off, projectId, refetch]);

  const handleTodoSelect = (todoId: string) => {
    setSelectedTodos(prev => 
      prev.includes(todoId) 
        ? prev.filter(id => id !== todoId)
        : [...prev, todoId]
    );
  };

  const handleDelete = async (todoId: string) => {
    if (confirm('Are you sure you want to delete this todo?')) {
      await deleteTodoMutation.mutateAsync(todoId);
    }
  };

  const renderTodo = (todo: ClaudeTodo) => {
    const StatusIcon = statusIcons[todo.status];
    const isSelected = selectedTodos.includes(todo.id);

    return (
      <div
        key={todo.id}
        className={clsx(
          'group flex items-start space-x-3 p-4 rounded-lg border transition-all duration-200',
          isSelected 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        )}
        data-testid={`claude-todo-item-${todo.id}`}
      >
        <button
          onClick={() => handleTodoSelect(todo.id)}
          className="mt-1 flex-shrink-0"
          data-testid={`claude-todo-select-${todo.id}`}
        >
          <StatusIcon 
            className={clsx(
              'w-5 h-5 transition-colors duration-200',
              statusColors[todo.status]
            )}
          />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className={clsx(
                'text-sm font-medium',
                todo.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'
              )}>
                {todo.content}
              </p>
              
              <div className="flex items-center space-x-4 mt-2">
                <span className={clsx(
                  'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                  priorityColors[todo.priority]
                )}>
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {todo.priority}
                </span>

                <span className="text-xs text-gray-500">
                  by {todo.createdBy}
                </span>

                {todo.syncedTask && (
                  <div className="flex items-center space-x-1 text-xs text-blue-600">
                    <ArrowUpDown className="w-3 h-3" />
                    <span>Synced to task</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleDelete(todo.id)}
                className="p-1 text-gray-400 hover:text-red-500 rounded"
                title="Delete todo"
                data-testid={`claude-todo-delete-${todo.id}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-start space-x-3 p-4 bg-gray-100 rounded-lg">
              <div className="w-5 h-5 bg-gray-300 rounded-full mt-1" />
              <div className="flex-1">
                <div className="w-3/4 h-4 bg-gray-300 rounded mb-2" />
                <div className="w-1/2 h-3 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bot className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Claude Code Todos</h3>
          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-sm font-medium">
            {todos.length}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            data-testid="claude-todo-refresh-button"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>

          {selectedTodos.length > 0 && onSync && (
            <button
              onClick={onSync}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="claude-todo-sync-button"
            >
              <ArrowUpDown className="w-4 h-4" />
              <span>Sync to Tasks ({selectedTodos.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Todos List */}
      {todos.length > 0 ? (
        <div className="space-y-3">
          {todos.map(renderTodo)}
        </div>
      ) : (
        <div className="text-center py-12">
          <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Claude Code todos</h4>
          <p className="text-gray-500 mb-6">
            Todos created in Claude Code plan mode will appear here automatically.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Use Claude Code's plan mode to create todos that sync with Baton. 
              Your todos will persist across Claude Code sessions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};