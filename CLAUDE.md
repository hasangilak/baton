# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Baton is an AI-powered task management system built for seamless integration with AI code agents via Model Context Protocol (MCP). It combines a React frontend with a Node.js backend and includes a fully compliant MCP server for AI agent interaction.

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
- **Backend**: Prisma ORM with PostgreSQL, type-safe database operations
- **Frontend**: TanStack Query for server state management with optimistic updates
- **Real-time**: Socket.IO for collaborative features

### Claude Code WebUI Integration
Baton includes a complete Claude Code WebUI integration with professional chat interface:
- **WebUI Streaming**: Real-time streaming chat with Claude Code SDK via WebSocket bridge
- **Claude-Style UI**: Gorgeous dark theme with time-based greetings and action buttons
- **File Upload System**: Comprehensive file attachment support (25MB, 5 files, multiple formats)
- **Session Management**: Persistent Claude sessions with ID tracking and token counting
- **Safe Content Parsing**: Robust streaming content rendering with whitespace preservation
- **Interactive Prompts**: Permission handling and tool usage confirmations  
- **Socket.IO Bridge**: Local handler execution with backend streaming endpoints
- **Tool Permissions**: Automatic Write/Edit/MultiEdit/Bash tool permissions for file operations

## Common Commands

### Development Setup
```bash
# Quick Docker setup (recommended)
docker compose up -d

# Local development
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

### Database Operations
```bash
cd backend
npm run db:migrate          # Run migrations
npm run db:seed            # Seed with sample data
npm run db:reset           # Reset and reseed database
npx prisma studio          # Database GUI
npx prisma generate        # Regenerate client after schema changes
```

### Claude Code WebUI Testing
```bash
# Start the WebUI chat handler (required for Claude Code integration)
node scripts/webui-chat-handler.js  # Local handler with Claude Code executable path
tail -f scripts/webui-chat-handler.log  # Monitor handler activity

# WebUI streaming endpoints
curl -X POST http://localhost:3001/api/chat/messages/stream-webui \
  -H "Content-Type: application/json" \
  -d '{"message":"test","requestId":"test","conversationId":"test"}'
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
docker-compose build                    # Build all images
docker-compose up -d                    # Production mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up  # Development mode
docker-compose logs -f mcp-server       # View MCP server logs
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
2. Run `npx prisma migrate dev --name descriptive-name`
3. Run `npx prisma generate` to update types

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
- Demo project with ID `demo-project-1`
- Sample tasks in different statuses
- Default user account

## Environment Configuration

### Backend (.env)
```
DATABASE_URL="postgresql://baton_user:baton_password@localhost:5432/baton_dev"
PORT=3001
MCP_SERVER_PORT=3002
CLIENT_URL="http://localhost:5173"
```

### Service Ports
- Frontend: 5173 (Vite dev server)
- Backend API: 3001 (Express server)
- MCP Server: 3002 (WebSocket & STDIO)
- PostgreSQL: 5432 (Docker container)

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
2. **Start Handler**: Run `node scripts/webui-chat-handler.js` for local Claude Code execution
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