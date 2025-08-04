export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
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
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  color?: string;
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