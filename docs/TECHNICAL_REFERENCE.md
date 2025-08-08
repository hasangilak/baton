# Baton Technical Reference

Comprehensive technical documentation for developers working with Baton's architecture, APIs, and integration systems.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Bridge Service Architecture](#bridge-service-architecture)
3. [API Documentation](#api-documentation)
4. [Database Schema](#database-schema)
5. [WebSocket Events](#websocket-events)
6. [Permission System](#permission-system)
7. [File Upload System](#file-upload-system)
8. [Development Setup](#development-setup)
9. [Testing](#testing)
10. [Performance Considerations](#performance-considerations)

## 🏗️ Architecture Overview

### System Components

```mermaid
graph TB
    A[Frontend React App<br/>Port 5173] --> B[Backend Express API<br/>Port 3001]
    B --> C[PostgreSQL Database<br/>Port 5432]
    B --> D[WebSocket Events<br/>Socket.IO]
    D --> A
    
    E[Bridge Service<br/>scripts/bridge.ts<br/>Port 8080] --> B
    E --> F[Claude Code SDK<br/>Local Execution]
    
    G[MCP Server<br/>Port 3002] --> C
    H[Claude Desktop/Code] --> G
    H --> E
    
    I[Hook Scripts] --> B
    J[Claude Code Hooks] --> I
```

### Technology Stack

#### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 
- **State Management**: TanStack Query (React Query)
- **UI Components**: Custom components + Lucide icons
- **Styling**: Tailwind CSS
- **Real-time**: Socket.IO Client

#### Backend  
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **ORM**: Prisma with PostgreSQL
- **Validation**: Zod schemas
- **Real-time**: Socket.IO Server
- **File Upload**: Multer middleware

#### Infrastructure
- **Database**: PostgreSQL 15 (Docker container)
- **Containerization**: Docker & Docker Compose
- **Process Management**: PM2 (production)
- **Build System**: TypeScript compiler + esbuild

## 🌉 Bridge Service Architecture

The **`scripts/bridge.ts`** service is the core component enabling Claude Code WebUI integration.

### Bridge Components

```typescript
class ClaudeCodeBridge {
  private port: number;                              // Default: 8080
  private backendUrl: string;                        // Default: http://localhost:3001
  private activeRequests: Map<string, AbortController>; // Request tracking
}

interface BridgeRequest {
  message: string;                    // User message
  requestId: string;                  // Unique request identifier
  conversationId: string;             // Conversation context
  sessionId?: string;                 // Claude session ID (for continuity)
  allowedTools?: string[];            // Permitted tools
  workingDirectory?: string;          // Working directory context
  permissionMode?: string;            // Permission handling mode
  projectName?: string;               // Project context
}
```

### Request Flow Architecture

```
1. Frontend Chat UI
   ↓ POST /api/chat/messages/stream-bridge
2. Backend API Server
   ↓ HTTP POST /execute
3. Bridge Service (Port 8080)
   ↓ Claude Code SDK Query
4. Local Claude Code Execution
   ↓ Server-Sent Events Stream
5. Bridge → Backend → Frontend
   ↓ Real-time UI Updates
6. Chat Interface Display
```

### Permission Integration

```typescript
// Permission request flow in bridge.ts
const requestPermissionFromBackend = async (
  toolName: string,
  context: any,
  requestId: string,
  conversationId: string
): Promise<PermissionResult> => {
  // 1. Create interactive prompt in backend
  const response = await fetch(`${backendUrl}/api/chat/conversations/${conversationId}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'tool_permission',
      title: `${toolName} Tool Permission`,
      message: `Allow Claude Code to use the ${toolName} tool?`,
      options: [
        { id: 'allow_once', label: 'Allow Once', value: 'yes' },
        { id: 'allow_always', label: 'Allow Always', value: 'yes_dont_ask' },
        { id: 'deny', label: 'Deny', value: 'no' }
      ],
      context: { toolName, ...context }
    })
  });

  // 2. Poll for user response with progressive timeouts
  return waitForPermissionResponseProgressive(promptId, 120000);
};
```

### Session Management

```typescript
// Session continuity handling
if (sessionId) {
  claudeOptions.sessionId = sessionId;
  console.log(`🔄 Resuming Claude session: ${sessionId}`);
} else {
  console.log(`🆕 Starting new Claude session for conversation ${conversationId}`);
}

// Capture new session IDs
const onMessage = (message) => {
  if (message.sessionId && message.sessionId !== sessionId) {
    console.log(`🆔 New session ID captured: ${message.sessionId}`);
    // Send to backend for storage
    updateConversationSession(conversationId, message.sessionId);
  }
};
```

## 📡 API Documentation

### REST API Endpoints

#### Project Management

```typescript
// GET /api/projects - Get all projects
interface ProjectResponse {
  id: string;
  name: string;
  description?: string;
  color: string;
  status: 'active' | 'archived' | 'completed';
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
  owner: UserSummary;
  taskCounts: {
    todo: number;
    in_progress: number;
    done: number;
  };
}

// POST /api/projects - Create project
interface CreateProjectRequest {
  name: string;              // 1-100 characters
  description?: string;      // Optional description
  color?: string;            // Hex color (#RRGGBB), default: #3b82f6
}

// PUT /api/projects/:id - Update project
interface UpdateProjectRequest {
  name?: string;
  description?: string;
  color?: string;
}

// DELETE /api/projects/:id - Delete project (cascade)
```

#### Task Management

```typescript
// GET /api/projects/:projectId/tasks - Get project tasks
interface TaskResponse {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  order: number;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  assignee?: UserSummary;
  createdBy: UserSummary;
  labels: string[];
  commentCount: number;
}

// POST /api/projects/:projectId/tasks - Create task
interface CreateTaskRequest {
  title: string;                                    // 1-200 characters
  description?: string;
  status?: 'todo' | 'in_progress' | 'done';       // Default: 'todo'
  priority?: 'low' | 'medium' | 'high';           // Default: 'medium'
  assigneeId?: string;
  dueDate?: string;                                // ISO 8601 datetime
  labels?: string[];                               // Default: []
}

// PUT /api/projects/:projectId/tasks/:taskId - Update task
// PATCH /api/projects/:projectId/tasks/:taskId/move - Move task (status change)
interface MoveTaskRequest {
  status: 'todo' | 'in_progress' | 'done';
  order: number;
}
```

#### Chat & Streaming

```typescript
// POST /api/chat/messages/stream-bridge - Bridge-based streaming
interface BridgeStreamRequest {
  message: string;
  conversationId: string;
  sessionId?: string;
  projectName?: string;
  allowedTools?: string[];
  workingDirectory?: string;
  files?: FileUpload[];
}

// POST /api/chat/conversations - Create conversation
interface CreateConversationRequest {
  title?: string;
  projectId?: string;
}

// GET /api/chat/conversations/:id/messages - Get messages
interface MessageResponse {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: string;
  fileAttachments?: FileAttachment[];
}
```

#### Permission Management

```typescript
// POST /api/chat/conversations/:conversationId/prompts - Create interactive prompt
interface CreatePromptRequest {
  type: 'tool_permission' | 'confirmation' | 'selection';
  title: string;
  message: string;
  options: Array<{
    id: string;
    label: string;
    value: string;
    isRecommended?: boolean;
  }>;
  context?: Record<string, any>;
  timeoutAt?: string;
}

// POST /api/chat/prompts/:promptId/respond - Respond to prompt
interface PromptResponseRequest {
  selectedOption: string;
  responseTime?: number;
}

// GET /api/chat/analytics/permissions - Permission analytics
interface PermissionAnalyticsResponse {
  totalPrompts: number;
  responsesByDecision: Record<string, number>;
  averageResponseTime: number;
  toolsRequested: Record<string, number>;
  riskLevelDistribution: Record<string, number>;
}
```

#### Claude Code Integration

```typescript
// POST /api/claude/plans - Store captured plan
interface StorePlanRequest {
  title: string;
  content: string;          // Markdown content
  sessionId: string;
  workspacePath: string;
  metadata?: Record<string, any>;
}

// POST /api/claude/todos - Store/update todos
interface StoretodosRequest {
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'high' | 'medium' | 'low';
    orderIndex?: number;
    metadata?: Record<string, any>;
  }>;
}

// GET /api/claude/hook-status - Verify hook integration
interface HookStatusResponse {
  projectId: string;
  isConfigured: boolean;
  lastPlanCapture?: string;
  lastTodoSync?: string;
  totalPlans: number;
  totalTodos: number;
}
```

### Response Formats

All API responses follow this structure:

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
  };
}
```

### Error Codes

```typescript
// HTTP Status Codes used
200 // Success
201 // Created
400 // Bad Request (validation errors)
401 // Unauthorized
403 // Forbidden
404 // Not Found
409 // Conflict (duplicate resources)
422 // Unprocessable Entity (business logic errors)
500 // Internal Server Error

// Custom Error Codes
'VALIDATION_ERROR'     // Zod validation failed
'RESOURCE_NOT_FOUND'   // Database resource missing
'PERMISSION_DENIED'    // User lacks permissions
'DUPLICATE_RESOURCE'   // Resource already exists
'EXTERNAL_API_ERROR'   // Claude Code SDK errors
'DATABASE_ERROR'       // Prisma/PostgreSQL errors
```

## 🗄️ Database Schema

### Core Tables

#### Users
```sql
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  avatar VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Projects
```sql
CREATE TABLE projects (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  color VARCHAR DEFAULT '#3b82f6',
  status VARCHAR DEFAULT 'active', -- 'active', 'archived', 'completed'
  is_starred BOOLEAN DEFAULT FALSE,
  owner_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tasks
```sql
CREATE TABLE tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  title VARCHAR NOT NULL,
  description TEXT,
  status VARCHAR DEFAULT 'todo', -- 'todo', 'in_progress', 'done'
  priority VARCHAR DEFAULT 'medium', -- 'low', 'medium', 'high'
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id VARCHAR REFERENCES users(id),
  created_by_id VARCHAR NOT NULL REFERENCES users(id),
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  order_index INTEGER DEFAULT 0,
  labels JSONB DEFAULT '[]',
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Chat System Tables

#### Conversations
```sql
CREATE TABLE conversations (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  title VARCHAR,
  project_id VARCHAR REFERENCES projects(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  claude_session_id VARCHAR, -- For session continuity
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Messages
```sql
CREATE TABLE messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role VARCHAR NOT NULL, -- 'user', 'assistant'
  file_attachments JSONB DEFAULT '[]',
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Interactive Prompts
```sql
CREATE TABLE interactive_prompts (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id VARCHAR,
  type VARCHAR NOT NULL, -- 'tool_permission', 'confirmation', 'selection'
  title VARCHAR,
  message TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of {id, label, value, isRecommended}
  context JSONB, -- Tool context, parameters, etc.
  metadata JSONB, -- Analytics, response times, etc.
  status VARCHAR DEFAULT 'pending', -- 'pending', 'answered', 'timeout'
  selected_option VARCHAR,
  auto_handler VARCHAR, -- Which strategy handled it
  timeout_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 seconds'),
  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP
);
```

#### Conversation Permissions
```sql
CREATE TABLE conversation_permissions (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tool_name VARCHAR NOT NULL,
  permission VARCHAR NOT NULL, -- 'allow', 'deny'
  expires_at TIMESTAMP, -- NULL for permanent permissions
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Claude Code Integration Tables

#### Claude Todos
```sql
CREATE TABLE claude_todos (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status VARCHAR DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  priority VARCHAR DEFAULT 'medium', -- 'high', 'medium', 'low'
  order_index INTEGER DEFAULT 0,
  synced_task_id VARCHAR REFERENCES tasks(id), -- Linked Baton task
  metadata JSONB, -- Additional data from Claude Code
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Claude Code Plans
```sql
CREATE TABLE claude_code_plans (
  id VARCHAR PRIMARY KEY DEFAULT gen_cuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  content TEXT NOT NULL, -- Markdown content
  status VARCHAR DEFAULT 'accepted', -- 'accepted', 'implemented', 'archived'
  session_id VARCHAR,
  workspace_path VARCHAR,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_interactive_prompts_conversation ON interactive_prompts(conversation_id);
CREATE INDEX idx_interactive_prompts_status ON interactive_prompts(status);
CREATE INDEX idx_claude_todos_project ON claude_todos(project_id);
CREATE INDEX idx_conversation_permissions_lookup ON conversation_permissions(conversation_id, tool_name);
```

## 🔌 WebSocket Events

### Event Categories

#### Chat Events
```typescript
// Client → Server
interface ChatEvents {
  'join_conversation': { conversationId: string };
  'leave_conversation': { conversationId: string };
  'typing': { conversationId: string; isTyping: boolean };
}

// Server → Client  
interface ChatEventsFromServer {
  'message:new': MessageResponse;
  'message:update': { messageId: string; content: string };
  'typing:update': { userId: string; isTyping: boolean };
}
```

#### Permission Events
```typescript
// Server → Client
interface PermissionEvents {
  'interactive_prompt': {
    promptId: string;
    conversationId: string;
    type: string;
    title: string;
    message: string;
    options: PromptOption[];
    context: Record<string, any>;
    timestamp: number;
    requiresAck?: boolean;
    deliveryId?: string;
  };
  
  'permission:response': {
    promptId: string;
    response: PromptResponse;
    timestamp: number;
    analytics: Record<string, any>;
  };
  
  'permission_analytics': {
    conversationId: string;
    toolName: string;
    decision: string;
    responseTime: number;
    riskLevel: string;
  };
}

// Client → Server
interface PermissionEventsFromClient {
  'prompt_received_confirmation': {
    promptId: string;
    deliveryId: string;
    conversationId: string;
    timestamp: number;
    clientInfo: Record<string, any>;
  };
}
```

#### Project Events
```typescript
// Server → Client (Broadcast)
interface ProjectEvents {
  'project:created': ProjectResponse;
  'project:updated': { projectId: string; changes: Partial<ProjectResponse> };
  'project:deleted': { projectId: string };
  
  'task:created': TaskResponse;
  'task:updated': { taskId: string; changes: Partial<TaskResponse> };
  'task:moved': { taskId: string; fromStatus: string; toStatus: string; order: number };
  'task:deleted': { taskId: string };
}
```

### Room Management

```typescript
// Room structure
interface SocketRooms {
  'conversation-{conversationId}': string[];     // Chat participants
  'project-{projectId}': string[];               // Project team members
  'user-{userId}': string[];                     // User-specific events
  'global': string[];                            // System-wide events
}

// Join/leave room helpers
socket.join(`conversation-${conversationId}`);
socket.join(`project-${projectId}`);

// Broadcast to specific rooms
io.to(`conversation-${conversationId}`).emit('interactive_prompt', promptData);
io.to(`project-${projectId}`).emit('task:created', taskData);
```

## 🛡️ Permission System

### Architecture Components

```typescript
// Permission evaluation flow
class PermissionEvaluator {
  async evaluateToolRequest(
    toolName: string,
    context: ToolContext,
    conversationId: string
  ): Promise<PermissionResult> {
    
    // 1. Check automatic allowlist
    if (this.isAutoAllowed(toolName)) {
      return { allowed: true, reason: 'allowlist' };
    }
    
    // 2. Check existing permissions
    const existingPermission = await this.checkExistingPermission(
      conversationId, 
      toolName
    );
    if (existingPermission) {
      return { allowed: existingPermission.permission === 'allow', reason: 'cached' };
    }
    
    // 3. Risk assessment
    const riskLevel = this.assessRiskLevel(toolName, context);
    
    // 4. Create interactive prompt
    const prompt = await this.createInteractivePrompt({
      conversationId,
      toolName,
      riskLevel,
      context
    });
    
    // 5. Wait for user response
    return this.waitForUserResponse(prompt.id);
  }
}
```

### Risk Assessment

```typescript
interface RiskAssessment {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  autoDecision?: 'allow' | 'deny';
}

const riskAssessment = {
  'Read': { level: 'LOW', factors: ['read-only', 'safe'] },
  'LS': { level: 'LOW', factors: ['read-only', 'directory-listing'] },
  'Glob': { level: 'LOW', factors: ['read-only', 'file-search'] },
  'Grep': { level: 'LOW', factors: ['read-only', 'content-search'] },
  
  'WebFetch': { level: 'MEDIUM', factors: ['network-access', 'external-data'] },
  'WebSearch': { level: 'MEDIUM', factors: ['network-access', 'search'] },
  
  'Write': { level: 'HIGH', factors: ['file-modification', 'data-creation'] },
  'Edit': { level: 'HIGH', factors: ['file-modification', 'data-change'] },
  'MultiEdit': { level: 'HIGH', factors: ['bulk-file-modification'] },
  
  'Bash': { level: 'CRITICAL', factors: ['system-access', 'command-execution'] }
};
```

### Progressive Timeout Strategy

```typescript
// Multi-stage timeout handling
class ProgressiveTimeoutHandler {
  async waitForResponse(promptId: string): Promise<PermissionResult> {
    const timeouts = [
      { duration: 30000, action: 'escalate', urgency: 1 },    // 30s warning
      { duration: 60000, action: 'escalate', urgency: 2 },    // 60s urgent
      { duration: 120000, action: 'fallback', urgency: 3 }    // 120s fallback
    ];
    
    for (const timeout of timeouts) {
      const result = await this.waitWithTimeout(promptId, timeout.duration);
      
      if (result) {
        return result; // User responded
      }
      
      if (timeout.action === 'escalate') {
        await this.sendEscalationNotification(promptId, timeout.urgency);
      } else {
        return this.handleFallback(promptId);
      }
    }
  }
  
  private async handleFallback(promptId: string): Promise<PermissionResult> {
    const prompt = await this.getPrompt(promptId);
    const riskLevel = prompt.context?.riskLevel;
    
    // Conservative fallback based on risk
    if (riskLevel === 'LOW') {
      return { allowed: true, reason: 'auto-fallback-safe' };
    } else {
      return { allowed: false, reason: 'auto-fallback-denied' };
    }
  }
}
```

## 📁 File Upload System

### Architecture

```typescript
// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/chat');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    // Code files
    'text/plain', 'text/javascript', 'text/typescript', 'text/python',
    'application/json', 'text/markdown', 'text/yaml', 'text/xml',
    
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    
    // Documents
    'application/pdf', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
    files: 5 // Maximum 5 files per request
  }
});
```

### File Processing

```typescript
// File attachment processing
interface FileAttachment {
  id: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  uploadedAt: string;
}

class FileProcessor {
  async processUploadedFiles(files: Express.Multer.File[]): Promise<FileAttachment[]> {
    return Promise.all(files.map(async (file) => {
      const attachment: FileAttachment = {
        id: uuidv4(),
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/uploads/chat/${file.filename}`,
        uploadedAt: new Date().toISOString()
      };
      
      // Process specific file types
      if (file.mimetype.startsWith('image/')) {
        await this.processImage(file.path);
      } else if (file.mimetype === 'application/pdf') {
        await this.processPDF(file.path);
      }
      
      return attachment;
    }));
  }
  
  private async processImage(filePath: string): Promise<void> {
    // Image optimization, thumbnail generation
    // Implementation depends on requirements
  }
  
  private async processPDF(filePath: string): Promise<void> {
    // PDF text extraction for search
    // Implementation depends on requirements  
  }
}
```

## 🚀 Development Setup

### Local Development Environment

```bash
# Prerequisites
node --version    # >= 18.x
bun --version     # >= 1.0
docker --version  # >= 20.x

# Setup steps
git clone <repository>
cd baton

# Start database and services
docker compose up -d

# Backend development
cd backend
npm install
npm run dev

# Frontend development  
cd frontend
npm install
npm run dev

# Bridge service
bun run scripts/bridge.ts

# MCP server (separate terminal)
cd backend
npm run mcp:dev:websocket
```

### Environment Configuration

```bash
# Backend (.env)
DATABASE_URL="postgresql://baton_user:baton_password@localhost:5432/baton_dev"
PORT=3001
CLIENT_URL="http://localhost:5173"
MCP_SERVER_PORT=3002
BRIDGE_URL="http://localhost:8080"

# Frontend (.env)
VITE_API_URL=http://localhost:3001

# Bridge service
CLAUDE_CODE_PATH="/path/to/claude"    # Optional, auto-detected
DEBUG=1                               # Enable debug logging
```

### Database Management

```bash
# Database operations
cd backend

# Run migrations
npx prisma migrate dev

# Reset database (development)
npx prisma migrate reset --force

# Seed with sample data
npx prisma db seed

# Open database GUI
npx prisma studio

# Generate client after schema changes  
npx prisma generate
```

## 🧪 Testing

### Testing Strategy

#### Unit Tests
```bash
# Backend unit tests
cd backend
npm test

# Frontend unit tests
cd frontend  
npm test
```

#### Integration Tests
```bash
# MCP server integration
cd backend
npm run test:mcp

# Bridge service integration
bun test scripts/bridge.test.ts

# API integration tests
npm run test:integration
```

#### End-to-End Tests
```bash
# Playwright E2E tests
cd frontend
npx playwright test

# Chat flow tests
npx playwright test tests/chat-flow.spec.ts

# Permission system tests
npx playwright test tests/permission-flow.spec.ts
```

### Test Examples

```typescript
// API endpoint test
describe('POST /api/projects', () => {
  it('creates project with valid data', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test Project',
        description: 'Test Description',
        color: '#ff0000'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Test Project');
  });
});

// Bridge service test
describe('ClaudeCodeBridge', () => {
  it('handles execute request', async () => {
    const bridge = new ClaudeCodeBridge(8080, 'http://localhost:3001');
    
    const request = new Request('http://localhost:8080/execute', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Hello',
        requestId: 'test-123',
        conversationId: 'conv-456'
      })
    });
    
    const response = await bridge.handleExecuteRequest(request);
    expect(response.ok).toBe(true);
  });
});
```

## ⚡ Performance Considerations

### Database Optimization

```sql
-- Query performance indexes
CREATE INDEX CONCURRENTLY idx_tasks_project_status_order 
ON tasks(project_id, status, order_index);

CREATE INDEX CONCURRENTLY idx_messages_conversation_time 
ON messages(conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_interactive_prompts_timeout 
ON interactive_prompts(timeout_at) WHERE status = 'pending';
```

### Caching Strategy

```typescript
// Redis caching for frequently accessed data
class CacheService {
  async getProjectTaskCounts(projectId: string): Promise<TaskCounts> {
    const cacheKey = `project_task_counts:${projectId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    const counts = await this.calculateTaskCounts(projectId);
    await redis.setex(cacheKey, 300, JSON.stringify(counts)); // 5 minute cache
    
    return counts;
  }
}
```

### WebSocket Optimization

```typescript
// Room-based broadcasting to reduce overhead
class OptimizedSocketService {
  broadcastToConversation(conversationId: string, event: string, data: any) {
    // Only send to users in specific conversation room
    this.io.to(`conversation-${conversationId}`).emit(event, data);
  }
  
  broadcastToProject(projectId: string, event: string, data: any) {
    // Only send to users working on specific project
    this.io.to(`project-${projectId}`).emit(event, data);
  }
}
```

### File Upload Optimization

```typescript
// Streaming file uploads for large files
class StreamingUploadHandler {
  async handleLargeFile(req: Request): Promise<void> {
    const busboy = new Busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB for large files
        files: 1
      }
    });
    
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      const writeStream = fs.createWriteStream(path.join(uploadDir, filename));
      file.pipe(writeStream);
      
      file.on('end', () => {
        this.processFileInBackground(filename);
      });
    });
  }
}
```

### Memory Management

```typescript
// Connection cleanup and resource management
class ResourceManager {
  private activeConnections = new Map<string, AbortController>();
  
  createConnection(id: string): AbortController {
    const controller = new AbortController();
    this.activeConnections.set(id, controller);
    
    // Auto-cleanup after timeout
    setTimeout(() => {
      this.cleanup(id);
    }, 5 * 60 * 1000); // 5 minutes
    
    return controller;
  }
  
  cleanup(id: string): void {
    const controller = this.activeConnections.get(id);
    if (controller) {
      controller.abort();
      this.activeConnections.delete(id);
    }
  }
}
```

## 📚 Related Documentation

- **[Getting Started](./GETTING_STARTED.md)** - Quick setup guide
- **[Claude Code Integration](./CLAUDE_CODE_INTEGRATION.md)** - Integration guide
- **[MCP Server Guide](./MCP_SERVER_GUIDE.md)** - MCP server documentation

## 🎯 Summary

This technical reference covers:

- ✅ **Complete Architecture** - Bridge service, API, database, WebSocket systems
- ✅ **API Documentation** - All endpoints, request/response formats, error handling
- ✅ **Database Schema** - Complete table structures, relationships, indexes
- ✅ **Integration Details** - Permission system, file uploads, real-time events
- ✅ **Development Setup** - Local environment, testing, debugging
- ✅ **Performance Guidelines** - Optimization strategies, caching, resource management

Use this reference for development, debugging, and extending Baton's functionality.