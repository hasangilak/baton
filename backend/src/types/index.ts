export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
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
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  order: number;
  labels: string[];
  commentCount: number;
}

export interface Comment {
  id: string;
  content: string;
  taskId: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  planId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPAgent {
  id: string;
  name: string;
  description?: string;
  endpoint: string;
  isActive: boolean;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
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