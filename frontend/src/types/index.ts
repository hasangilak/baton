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
  rootDirectory?: string;
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
  // Support for specific property names used by chat API
  conversation?: any;
  conversations?: any[];
  messages?: any[];
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
  rootDirectory?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
  isStarred?: boolean;
  rootDirectory?: string;
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

// Chat types
export interface Conversation {
  id: string;
  title?: string | null;
  projectId: string;
  userId: string;
  model: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  metadata?: any;
  project?: Project;
  user?: User;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string | null;
  tokenCount?: number | null;
  status: 'sending' | 'completed' | 'failed';
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
  conversation?: Conversation;
  attachments?: MessageAttachment[];
  codeBlocks?: CodeBlock[];
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface CodeBlock {
  id: string;
  messageId: string;
  language: string;
  code: string;
  filename?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  createdAt: string;
}

export interface CreateConversationRequest {
  projectId: string;
  title?: string;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  sessionId?: string; // Claude Code session ID for context continuity
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
}

export interface StreamingResponse {
  id: string;
  content: string;
  isComplete: boolean;
  error?: string;
}

// Interactive Prompt Types
export interface PromptOption {
  id: string;
  label: string;
  value: string;
  isDefault?: boolean;
  isRecommended?: boolean;
}

export interface PromptContext {
  toolName?: string;
  toolType?: string;
  action?: string;
  command?: string;
  filePath?: string;
  projectPath?: string;
  fullMessage?: string;
  originalContext?: string;
}

export type PromptType = 'permission' | 'tool_usage' | 'tool_permission' | 'multiple_choice' | 'three_option' | 'file_selection';
export type PromptStatus = 'pending' | 'answered' | 'timeout' | 'auto_handled';

export interface InteractivePrompt {
  id: string;
  projectId: string;
  sessionId?: string;
  type: PromptType;
  title?: string;
  message: string;
  options: PromptOption[];
  context?: PromptContext;
  status: PromptStatus;
  selectedOption?: string;
  autoHandler?: string;
  timeoutAt: string;
  createdAt: string;
  respondedAt?: string;
}

// Re-export streaming types for compatibility
export type {
  StreamResponse,
  ChatRequest,
  SDKMessage,
  ChatMessage,
  SystemMessage as StreamingSystemMessage,
  ToolMessage as StreamingToolMessage,
  ToolResultMessage,
  AbortMessage,
  AllMessage,
  StreamingContext,
  PermissionRequest,
  ChatStateOptions
} from './streaming';