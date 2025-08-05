export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = 'active' | 'archived' | 'completed';

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  status: ProjectStatus;
  isStarred: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: User;
  _count?: {
    tasks: number;
  };
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  assigneeId?: string;
  createdById: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  labels: string[];
  commentCount: number;
  assignee?: User;
  createdBy?: User;
  project?: {
    id: string;
    name: string;
    color: string;
  };
}

export interface Comment {
  id: string;
  content: string;
  taskId: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author?: User;
}

export interface MCPPlan {
  id: string;
  title: string;
  description?: string;
  agentId: string;
  agentName: string;
  projectId: string;
  tasks: MCPTask[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  agent?: MCPAgent;
  project?: {
    id: string;
    name: string;
    color: string;
  };
}

export interface MCPTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  planId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MCPAgent {
  id: string;
  name: string;
  description?: string;
  endpoint: string;
  isActive: boolean;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    plans: number;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  color: string;
  status?: ProjectStatus;
  isStarred?: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
  isStarred?: boolean;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  labels?: string[];
  projectId: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  labels?: string[];
  order?: number;
}

// Claude Code Integration Types
export type ClaudeTodoStatus = 'pending' | 'in_progress' | 'completed';
export type ClaudeTodoPriority = 'high' | 'medium' | 'low';

export interface ClaudeTodo {
  id: string;
  content: string;
  status: ClaudeTodoStatus;
  priority: ClaudeTodoPriority;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
  syncedTaskId?: string;
  orderIndex: number;
  createdBy: 'claude' | 'human' | 'system' | 'api';
  project?: {
    name: string;
    color: string;
  };
  syncedTask?: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
  };
  linkedPlan?: {
    id: string;
    title: string;
    status: ClaudeCodePlanStatus;
    capturedAt: string;
  };
}

export interface CreateClaudeTodosRequest {
  projectId: string;
  todos: {
    id: string;
    content: string;
    status: ClaudeTodoStatus;
    priority: ClaudeTodoPriority;
    metadata?: any;
  }[];
}

export interface SyncTodosToTasksRequest {
  projectId: string;
  todoIds?: string[];
}

export interface SyncTasksToTodosRequest {
  projectId: string;
  taskIds?: string[];
}

export interface ClaudeTodosResponse {
  todos: ClaudeTodo[];
  count: number;
}

export interface SyncResponse {
  success: boolean;
  syncedCount: number;
  message: string;
  syncedTasks?: Task[];
  syncedTodos?: ClaudeTodo[];
}

// Claude Code Plan Mode Integration Types
export type ClaudeCodePlanStatus = 'accepted' | 'implemented' | 'archived';

export interface ClaudeCodePlan {
  id: string;
  title: string;
  content: string;
  status: ClaudeCodePlanStatus;
  projectId: string;
  sessionId?: string;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
  project?: {
    id: string;
    name: string;
    color: string;
  };
  linkedTodos?: {
    id: string;
    content: string;
    status: ClaudeTodoStatus;
    priority: ClaudeTodoPriority;
    orderIndex: number;
    createdAt?: string;
    updatedAt?: string;
  }[];
  _count?: {
    linkedTodos: number;
  };
}

export interface ClaudeCodePlansResponse {
  success: boolean;
  plans: ClaudeCodePlan[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface CapturePlanRequest {
  projectId: string;
  title?: string;
  content: string;
  status?: ClaudeCodePlanStatus;
  sessionId?: string;
  capturedAt?: string;
  metadata?: any;
}