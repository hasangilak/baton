# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Baton is an AI-powered task management system built for seamless integration with AI code agents via Model Context Protocol (MCP). It combines a React frontend with a Node.js backend and includes a fully compliant MCP server for AI agent interaction.

**Important**: This project includes a comprehensive solution for Prisma client sync issues in Docker development. All database operations automatically handle Prisma client synchronization. See the enhanced Makefile commands below.

## Key Architecture Components

### Model Context Protocol (MCP) Server
The MCP server is the core feature that enables AI agents to interact with Baton. It provides:
- **Resources**: Access to projects, tasks, and workspace context
- **Tools**: Actions like creating tasks, moving items, getting analytics
- **Prompts**: Pre-built prompts for project planning and task management
- **Workspace Context**: Automatic project detection based on file location
- **Claude Code Integration**: TodoRead/TodoWrite tools with bidirectional sync
- **Plan Mode Support**: Seamless integration with Claude Code plan mode and todo lists

The MCP server (`src/mcp/server/index.ts`) supports both WebSocket and STDIO transports and implements JSON-RPC 2.0 protocol. It includes workspace context detection through `.baton-project` files and folder name matching.

#### Claude Code Todo Integration
Baton now includes full Claude Code integration with persistent todo management:
- **TodoRead Tool**: Reads all todos for current project in Claude Code format
- **TodoWrite Tool**: Writes/updates todos with full CRUD operations
- **Bidirectional Sync**: Convert between Claude todos and Baton tasks
- **Project Context**: All todos are automatically scoped to current workspace project
- **Database Storage**: Persistent todo storage in `claude_todos` table with metadata

### TypeScript 2025 Best Practices
The codebase implements enterprise-grade TypeScript with:
- `exactOptionalPropertyTypes` - Prevents undefined vs missing property bugs
- `noUncheckedIndexedAccess` - Ensures safe array/object access
- `strict: true` with all strict flags enabled
- Zero compilation errors policy (no bypassing with `// @ts-ignore`)

### Database & State Management
- **Backend**: Prisma ORM with MongoDB, type-safe database operations
- **Frontend**: TanStack Query for server state management with optimistic updates
- **Real-time**: Socket.IO for collaborative features

### Claude Code WebUI Integration
Baton includes a complete Claude Code WebUI integration with professional chat interface and enterprise-grade permission system:
- **WebUI Streaming**: Real-time streaming chat with Claude Code SDK via WebSocket bridge
- **Claude-Style UI**: Gorgeous dark theme with time-based greetings and action buttons
- **File Upload System**: Comprehensive file attachment support (25MB, 5 files, multiple formats)
- **Session Management**: Persistent Claude sessions with ID tracking and token counting
- **Safe Content Parsing**: Robust streaming content rendering with whitespace preservation
- **Interactive Permission System**: Multi-channel prompt delivery with progressive timeout strategy
- **WebSocket Reliability**: 37ms average delivery with fallback to SSE and polling
- **Progressive Timeouts**: 30s → 60s → 120s escalation with smart auto-decisions
- **Professional UI Components**: Risk-based color coding and usage analytics
- **Socket.IO Bridge**: Local handler execution with backend streaming endpoints
- **Tool Permissions**: Automatic Write/Edit/MultiEdit/Bash tool permissions for file operations

## WebSocket Communication & Message Storage Architecture

Baton implements a sophisticated WebSocket-based architecture that ensures every message from Claude Code is reliably captured and stored in MongoDB. This system provides real-time communication between the frontend, backend, and bridge services with comprehensive message persistence.

### Architecture Overview

```
Frontend (React)     Backend (Express)     Bridge Service
Port: 5173    ←──────→ Port: 3001    ←──────→ Port: 8080
     │                      │                     │
     │                      ▼                     │
     │               MongoDB Storage              │
     │               Port: 27017                  │
     └──────────── Real-time Updates ────────────┘
```

### Claude Code Session ID Management Flow

**Critical Flow**: Every conversation MUST have a Claude Code session ID for proper context continuity. The system implements a sophisticated session management flow that ensures perfect UX while maintaining Claude Code context across all messages.

#### Session Initialization Flow
```
User sends first message (no sessionId) 
    ↓
Backend validates (first message allowed)
    ↓
Forward to Claude Code SDK via Bridge
    ↓
Claude responds with session_id in first response
    ↓
Backend captures & stores session_id in conversation
    ↓
Backend broadcasts 'chat:session-id-available' to conversation room
    ↓
Frontend updates session state & URL with sessionId
    ↓
All subsequent messages REQUIRE matching sessionId
    ↓
Perfect Claude Code context continuity! 🎯
```

#### Session Validation Rules
- **First Message**: Allowed WITHOUT session ID (session initialization)
- **Subsequent Messages**: REQUIRE session ID that matches conversation's stored session
- **Session Mismatch**: Blocked with clear error message and recovery instructions
- **Missing Session**: Auto-recovery attempts with existing session ID

### Message Flow Sequence

1. **User Message**: `Frontend → Backend → Session Validation → MongoDB (immediate storage)`
2. **Bridge Request**: `Backend → Bridge Service (claude:execute with sessionId)`
3. **Claude Streaming**: `Bridge → Backend → Session Capture → MongoDB (each chunk stored)`
4. **Real-time Updates**: `Backend → Frontend (WebSocket events + session broadcasting)`

### Key Components

#### Bridge Service (`scripts/bridge.ts`)
- **Modular Architecture**: Uses `ModularClaudeCodeBridge` with separated concerns
- **Claude Code SDK Integration**: Executes queries and streams responses
- **Event-Driven**: Listens for `claude:execute`, responds with `claude:stream`
- **Error Handling**: Comprehensive error capture and user-friendly messaging

#### Backend WebSocket Server (`backend/src/index.ts`)
**Message Sending Flow with Session Validation** (`lines 182-242`):
```typescript
socket.on('chat:send-message', async (data) => {
  // 1. Session validation for existing conversations
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { claudeSessionId: true }
  });

  // If conversation has session ID, require it in message
  if (conversation.claudeSessionId && !sessionId) {
    socket.emit('chat:error', {
      error: 'Session ID required. Please refresh.',
      sessionRequired: true,
      existingSessionId: conversation.claudeSessionId
    });
    return;
  }

  // 2. Store user message immediately in MongoDB
  const userMessage = await messageStorage.createUserMessage(conversationId, content, attachments);
  
  // 3. Create assistant placeholder for streaming updates
  const assistantMessage = await messageStorage.createAssistantMessagePlaceholder(conversationId);
  
  // 4. Map request for streaming correlation
  (global as any).activeRequests.set(requestId, {
    assistantMessageId: assistantMessage.id,
    conversationId,
    userMessageId: userMessage.id
  });
  
  // 5. Forward to bridge service with session context
  bridgeSockets[0].emit('claude:execute', {
    ...request,
    sessionId // Include session ID for Claude Code continuity
  });
});
```

**Message Streaming Handler with Session Broadcasting** (`lines 467-478`):
```typescript
socket.on('claude:stream', async (data) => {
  // Store every Claude SDK message chunk in MongoDB
  if (data.type === 'claude_json' && data.data) {
    await messageStorage.createClaudeSDKMessage(conversationId, data);
    
    // Capture and broadcast session ID from Claude's first response
    if (data.data.session_id) {
      await messageStorage.updateConversationSession(conversationId, data.data.session_id);
      
      // Broadcast to conversation room for targeted delivery
      io.to(`conversation-${conversationId}`).emit('chat:session-id-available', {
        conversationId: conversationId,
        sessionId: data.data.session_id,
        timestamp: Date.now()
      });
    }
  }
  
  // Forward to frontend for real-time UI updates
  io.emit('chat:stream-response', data);
});
```

#### Message Storage Service (`backend/src/services/message-storage.service.ts`)
**Comprehensive Data Capture** (`lines 82-170`):
- **Every Message Stored**: User messages, assistant chunks, system messages, results
- **Rich Metadata**: Session IDs, token usage, model information, timestamps
- **Full Claude SDK Data**: Complete `StreamResponse` objects preserved as JSON
- **Error Resilience**: Failed messages marked with error details, no data loss

### MongoDB Schema Design

#### Messages Collection
```prisma
model Message {
  id             String    @id @map("_id") @db.ObjectId
  conversationId String   @db.ObjectId
  role           String    // user, assistant, system
  content        String    // Extracted text content
  
  // Claude WebSocket format fields
  type           String?   // "claude_json", etc.
  claudeData     Json?     // Complete StreamResponse object
  claudeMessageId String?  // Claude's message ID
  model          String?   // "claude-3-5-sonnet-20241022"
  sessionId      String?   // Claude SDK session ID
  usage          Json?     // Token usage statistics
  
  // Status and error handling
  status         String    @default("completed") // sending, completed, failed
  error          String?   // Error message if failed
  timestamp      BigInt?   // Original WebSocket timestamp
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

#### Conversations Collection
```prisma
model Conversation {
  id               String    @id @map("_id") @db.ObjectId
  title            String?
  projectId        String    // Links to Baton projects
  userId           String   @db.ObjectId
  model            String    @default("claude-3-sonnet")
  status           String    @default("active")
  claudeSessionId  String?   // For context preservation
  contextTokens    Int       @default(0)
  lastCompacted    DateTime? // Context window management
  
  messages          Message[]
  interactivePrompts InteractivePrompt[]
  permissions       ConversationPermission[]
}
```

### Data Persistence Guarantees

- **No Message Loss**: Every bridge response captured in MongoDB
- **Atomic Operations**: Database transactions ensure consistency  
- **Immediate Storage**: User messages stored before forwarding to bridge
- **Error Recovery**: Failed streams marked with detailed error information
- **Session Continuity**: Claude session IDs preserved for context

### Real-time Synchronization

#### Frontend WebSocket Client with Session Management (`frontend/src/hooks/useUnifiedWebSocket.ts`)
```typescript
// Real-time message streaming
socket.on('chat:stream-response', (data) => {
  window.dispatchEvent(new CustomEvent('chat:stream-response', { detail: data }));
});

// Session ID management with state tracking
socket.on('chat:session-id-available', async (data) => {
  // Update local session state immediately
  setSessionState(prev => ({
    ...prev,
    [data.conversationId]: {
      sessionId: data.sessionId,
      initialized: true,
      pending: false
    }
  }));

  // Update conversation in database
  await fetch(`/api/chat/conversations/${data.conversationId}/session`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claudeSessionId: data.sessionId })
  });
  
  // Update browser URL for direct session access
  const url = new URL(window.location.href);
  url.searchParams.set('sessionId', data.sessionId);
  window.history.replaceState({}, '', url.toString());
});

// Session error handling with recovery
socket.on('chat:error', (data) => {
  // Handle session-related errors
  if (data.sessionRequired && data.existingSessionId) {
    setSessionState(prev => ({
      ...prev,
      [data.conversationId]: {
        sessionId: data.existingSessionId,
        initialized: true,
        pending: false
      }
    }));
  }
});

// Enhanced sendMessage with session validation
const sendMessage = useCallback((data) => {
  const currentSession = sessionState[data.conversationId];
  const sessionId = data.sessionId || currentSession?.sessionId;

  // Mark as pending if first message
  if (!currentSession?.initialized) {
    setSessionState(prev => ({
      ...prev,
      [data.conversationId]: {
        sessionId: sessionId,
        initialized: false,
        pending: true
      }
    }));
  }

  emit('chat:send-message', { ...data, sessionId });
}, [sessionState]);
```

#### Session State Management
Frontend maintains session state for each conversation:
```typescript
interface SessionState {
  [conversationId: string]: {
    sessionId?: string;
    initialized: boolean; // Has session ID from Claude
    pending: boolean;     // Waiting for first response
  };
}

// Session utilities available to components
const { 
  isSessionReady,     // (conversationId) => boolean
  isSessionPending,   // (conversationId) => boolean  
  initializeSession,  // (conversationId) => Promise<string|null>
  checkSessionHealth, // (conversationId) => Promise<boolean>
  getSessionState     // (conversationId) => SessionState
} = useUnifiedWebSocket();
```

#### Global Request Tracking
The backend maintains request correlation using a global map:
```typescript
// Maps requestId → { assistantMessageId, conversationId, userMessageId }
(global as any).activeRequests = new Map();
```

### Bridge Service Modules (`scripts/bridge-modules/`)

**Modular Components**:
- **`config.ts`**: Configuration and validation
- **`logger.ts`**: Contextual logging with request tracing
- **`permissions.ts`**: Tool permission handling
- **`claude-sdk.ts`**: Claude Code SDK integration
- **`streams.ts`**: Stream processing and management
- **`resources.ts`**: File system and resource operations
- **`errors.ts`**: User-friendly error handling

### Example Stored Message Data

```json
{
  "id": "674b8c9f8e1234567890abcd",
  "conversationId": "674b8c9e8e1234567890abce", 
  "role": "assistant",
  "content": "I'll help you create a new feature...",
  "type": "claude_json",
  "claudeData": {
    "type": "claude_json",
    "data": {
      "type": "assistant",
      "message": {
        "id": "msg_01ABC123DEF456", 
        "model": "claude-3-5-sonnet-20241022",
        "content": [{"type": "text", "text": "I'll help you..."}],
        "usage": {"input_tokens": 150, "output_tokens": 75}
      },
      "session_id": "session_abc123"
    },
    "requestId": "req_12345",
    "timestamp": 1699123456789
  },
  "claudeMessageId": "msg_01ABC123DEF456",
  "model": "claude-3-5-sonnet-20241022", 
  "sessionId": "session_abc123",
  "usage": {"input_tokens": 150, "output_tokens": 75},
  "timestamp": 1699123456789,
  "status": "completed"
}
```

### Debugging & Monitoring

**WebSocket Event Tracing**:
```bash
# Monitor bridge service logs
tail -f /tmp/bridge-service.log

# Check backend WebSocket events  
docker logs baton-backend-1 -f | grep "WebSocket"

# Test WebSocket connectivity
curl -X POST http://localhost:3001/api/chat/messages/stream-webui \
  -H "Content-Type: application/json" \
  -d '{"message":"test","requestId":"test","conversationId":"test"}'
```

**Database Inspection**:
```bash
# Open database GUI
cd backend && npx prisma studio

# Check message storage
db.messages.find().sort({createdAt: -1}).limit(10)

# Verify conversation context
db.conversations.find({claudeSessionId: {$ne: null}})
```

For detailed technical documentation, see: [`docs/WEBSOCKET_ARCHITECTURE.md`](./docs/WEBSOCKET_ARCHITECTURE.md)

## Common Commands

### Development Setup
```bash
# Quick Docker setup (recommended) - includes automatic Prisma sync
make docker-up

# Full development environment with all services
make dev-full

# Alternative: Manual Docker setup
docker compose -f docker-compose.dev.yml up -d
```

### Prisma Client Management
```bash
# Fix Prisma client sync issues (most common usage)
make prisma-sync

# Generate Prisma client only
make prisma-generate

# Check database connection and schema status
make db-check
```

### Database Operations
```bash
# Run migrations with automatic Prisma sync
make db-migrate

# Reset and reseed database with sync
make db-reset

# Seed database with sample data
make db-seed

# Manual database operations (if needed)
cd backend
npx prisma studio          # Database GUI
```

### Claude Code WebUI Testing
```bash
# Start the WebUI chat handler (required for Claude Code integration)
bun run scripts/bridge.ts  # Local bridge service with Claude Code integration
tail -f /tmp/bridge-service.log  # Monitor bridge service activity

# Start the bridge service (for permission system)
bun run scripts/bridge.ts  # Claude Code bridge with progressive timeout strategy

# WebUI streaming endpoints
curl -X POST http://localhost:3001/api/chat/messages/stream-webui \
  -H "Content-Type: application/json" \
  -d '{"message":"test","requestId":"test","conversationId":"test"}'

# Test permission system
curl -X POST http://localhost:3001/api/chat/conversations/{id}/prompts \
  -H "Content-Type: application/json" \
  -d '{"type":"tool_permission","message":"Test prompt"}'
```

### MCP Server Testing
```bash
cd backend
npm run test:mcp           # Full MCP server test suite
npm run test:ux:simple     # Test new UX features
npm run test:workspace     # Test workspace detection
npm run mcp:dev:websocket  # Run MCP server in development
node test-claude-integration.js  # Test Claude Code integration
```

### Build & Quality
```bash
cd backend
npm run build              # TypeScript compilation
npm run lint               # ESLint checking

cd frontend  
npm run build              # Vite production build
npm run lint               # ESLint checking
```

### Docker Operations
```bash
# Enhanced Docker management with automatic Prisma sync
make docker-up          # Start development containers with Prisma sync
make docker-down        # Stop Docker containers
make docker-restart     # Restart containers with automatic Prisma sync
make docker-rebuild     # Complete rebuild when needed

# Service management and monitoring
make status             # Check status of all services  
make logs               # View real-time logs from all services
make logs-backend       # View backend Docker logs only
make logs-bridge        # View chat bridge logs only
make clean              # Stop services and clean up temporary files

# Manual Docker operations (if needed)
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs -f
```

## MCP Integration Architecture

### Project Context System
The MCP server automatically detects which project you're working on through:
1. `.baton-project` configuration files in workspace root
2. Folder name matching against project names in database  
3. Database-stored workspace mappings
4. WebSocket query parameters (`?projectName=My Project`)

### Resource URIs
- `baton://workspace/current` - Current workspace project
- `baton://workspace/tasks` - Tasks in current workspace
- `baton://projects` - All projects
- `baton://projects/{id}/tasks/kanban` - Kanban board view

### WebSocket Connection with Project Context
When connecting via WebSocket, the server supports project context through query parameters:
```javascript
// Auto-detect project
ws://localhost:3002

// Specify project by name  
ws://localhost:3002?projectName=My Project

// Specify project by ID
ws://localhost:3002?project=project-id-123
```

### Connection API
The `/api/mcp/connection` endpoint provides ready-to-use connection URLs:
```bash
curl "http://localhost:3001/api/mcp/connection?projectName=My Project"
```

## Code Patterns

### TypeScript Strict Mode Compliance
- Use null coalescing for optional properties: `data.field ?? null`
- Prefix unused parameters with underscore: `_unused`
- Handle array access safely: `array[index]` requires null checks when `noUncheckedIndexedAccess` is enabled
- No `// @ts-ignore` - fix type issues properly

### Prisma Integration
All database operations use Prisma with full type safety. When making schema changes:
1. Modify `prisma/schema.prisma`
2. Run `make db-migrate` (includes automatic Prisma client sync)
3. Or use manual commands: `npx prisma migrate dev --name descriptive-name` then `make prisma-sync`

**Important**: Prisma client sync issues are automatically resolved in Docker development through:
- Automatic client regeneration on container startup
- `make prisma-sync` command for instant fixes
- Enhanced Makefile commands that include sync operations

### API Route Pattern
Routes follow RESTful patterns with comprehensive error handling:
```typescript
// Always use proper error handling
const result = await prisma.model.findUnique({ where: { id } });
if (!result) {
  throw createError('Resource not found', 404);
}
```

### MCP Server Components
- **Resources** (`src/mcp/resources/`): Provide data access
- **Tools** (`src/mcp/tools/`): Enable actions including Claude Code integration
- **Prompts** (`src/mcp/prompts/`): Offer AI interaction templates
- **Workspace** (`src/mcp/workspace/`): Handle project context detection

#### Claude Code Integration Tools
The following tools are available for Claude Code integration:
- **TodoRead**: Read all todos for current project (no parameters required)
- **TodoWrite**: Write/update todos with full CRUD operations (requires `todos` array)
- **sync_todos_to_tasks**: Convert Claude todos to Baton tasks (optional `todoIds` filter)
- **sync_tasks_to_todos**: Convert Baton tasks to Claude todos (optional `taskIds` filter)

## Testing Considerations

### MCP Server Testing
MCP server tests require timing considerations due to async project context setup. When testing WebSocket connections with project parameters, allow 2-second delay for database lookups to complete before sending messages.

### Claude Code Integration Testing
The Claude Code integration can be tested using the provided test script:
```bash
node test-claude-integration.js
```
This script tests:
1. Connection to MCP server
2. Tool listing (verifies Claude Code tools are available)
3. TodoRead functionality (should be empty initially)
4. TodoWrite functionality (creates sample todos)
5. TodoRead again (verifies todos were stored)
6. Bidirectional sync functionality

### Database Testing
Test database operations should use the seeded data from `npm run db:seed` which creates:
- Baton project with ID `cmdxumi04000k4yhw92fvsqqa`
- Sample tasks in different statuses
- Default user account

## Environment Configuration

### Backend (.env)
```
DATABASE_URL="mongodb://localhost:27017/baton_dev"
PORT=3001
MCP_SERVER_PORT=3002
CLIENT_URL="http://localhost:5173"
```

### Service Ports
- Frontend: 5173 (Vite dev server)
- Backend API: 3001 (Express server)
- MCP Server: 3002 (WebSocket & STDIO)
- MongoDB: 27017 (Docker container)

## AI Agent Integration

When integrating with AI agents via MCP:
1. Use WebSocket transport for best performance: `ws://localhost:3002`
2. Include project context via query parameters when possible
3. Leverage workspace resources (`baton://workspace/*`) for context-aware operations
4. Use the connection API to get properly formatted URLs for different editors
5. **Claude Code Users**: TodoRead/TodoWrite tools automatically sync with your plan mode
6. **Bidirectional Sync**: Use sync tools to convert between Claude todos and Baton tasks

The MCP server implements full JSON-RPC 2.0 compliance and supports the official MCP protocol specification.

## Claude Code Hooks Integration

Baton now supports automatic capture of plans and todos from Claude Code through PostToolUse hooks:

### Quick Setup
1. Create `.baton-project` file with your project ID
2. Configure hooks in `~/.claude.json` (see [Quick Start Guide](./docs/CLAUDE_CODE_HOOKS_QUICKSTART.md))
3. Plans are captured when you exit plan mode
4. Todos sync automatically when Claude Code updates them

### Documentation
- [Quick Start Guide](./docs/CLAUDE_CODE_HOOKS_QUICKSTART.md) - Get running in 5 minutes
- [Full Setup Guide](./docs/CLAUDE_CODE_HOOKS_SETUP.md) - Detailed configuration and troubleshooting

### How It Works
- **ExitPlanMode Hook**: Captures accepted plans → `/api/claude/plans`
- **TodoWrite Hook**: Syncs todos → `/api/claude/todos`
- **Automatic Project Detection**: Uses `.baton-project` file
- **Real-time Updates**: WebSocket notifications to Baton UI

## Claude Code Integration Usage

Baton offers two powerful ways to integrate with Claude Code:

### WebUI Integration (Recommended for Interactive Use)
1. **Start Services**: Ensure Docker services are running (`docker compose up -d`)
2. **Start Bridge**: Run `bun run scripts/bridge.ts` for local Claude Code execution
3. **Open Chat**: Navigate to `/chat` in the Baton frontend for gorgeous Claude-style interface
4. **Upload Files**: Use paperclip buttons to attach files (supports code, images, documents)
5. **Stream Responses**: Real-time streaming with session persistence and tool usage
6. **Interactive Experience**: Professional chat UI with collapsible sidebar and welcome screen

### MCP Server Integration (Recommended for Programmatic Use)  
1. **Setup**: Connect Claude Code to Baton MCP server via WebSocket
2. **Project Context**: Use project query parameters or workspace detection
3. **Plan Mode**: Use Claude Code's plan mode - todos are automatically stored in Baton
4. **Sync**: Use `sync_todos_to_tasks` to convert todos into actionable Baton tasks
5. **Collaboration**: Teams can see both Claude todos and converted tasks in Baton UI
6. **Updates**: Use `sync_tasks_to_todos` to sync task status changes back to Claude

### Database Schema
The `claude_todos` table stores Claude Code todos with:
- `id`: Unique todo identifier (provided by Claude Code)
- `content`: Todo description/content
- `status`: pending, in_progress, completed
- `priority`: high, medium, low
- `projectId`: Links todo to Baton project
- `syncedTaskId`: Optional link to converted Baton task
- `orderIndex`: Display order for todos
- `metadata`: JSON field for additional todo data

### Interactive Permission System
The permission system includes comprehensive tables for enterprise-grade security:
- `interactive_prompt`: Stores tool permission requests with context and analytics
- `conversation_permission`: Persistent "allow always" permissions with expiration
- **Multi-Channel Delivery**: WebSocket (37ms) → SSE → HTTP Polling (500ms intervals)
- **Progressive Timeouts**: 30s → 60s → 120s with escalation notifications
- **Risk-Based Auto-Decisions**: Conservative approach based on tool danger level
- **Real-time Analytics**: Comprehensive tracking of permission patterns and response times

### System Architecture
```
Bridge Service (Port 8080) → Backend API (Port 3001) → Socket.IO → Frontend (Port 5173)
       ↓                           ↓                      ↓              ↓
Claude Code SDK              PromptDeliveryService    WebSocket       Interactive UI
   ↓                              ↓                      ↓              ↓
Progressive Timeout         Multi-Channel Delivery   Acknowledgment   User Response
```