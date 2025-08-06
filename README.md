# Baton 🥍

AI-powered task management designed for seamless integration with Claude Code. Built with React, Node.js, and PostgreSQL.

## ✨ Features

### 🎯 Core Task Management
- **Projects & Tasks** - Organize work with hierarchical project structure
- **Kanban Board** - Visual task management with drag-and-drop
- **Task Analytics** - Track progress, velocity, and team performance
- **Rich Task Details** - Descriptions, priorities, due dates, and custom fields

### 🤖 Claude Code Integration
- **WebUI Chat Interface** - Gorgeous Claude-style chat with file upload support
- **Native MCP Support** - Built-in Model Context Protocol server
- **Real-time Streaming** - Claude Code SDK integration with Socket.IO bridge
- **Plan Mode Sync** - Claude Code todos automatically sync with Baton
- **Bidirectional Sync** - Convert between Claude todos and Baton tasks
- **Context-Aware** - Automatic project detection based on workspace
- **16 MCP Tools** - Create tasks, manage projects, analytics, and more
- **8 MCP Prompts** - Project planning, task breakdown, retrospectives
- **File Attachments** - Upload code, images, documents (25MB, multiple formats)

### 🏗️ Technical Features
- **Docker Compose** - One-command setup with PostgreSQL
- **Real-time Updates** - Socket.IO for collaborative features
- **TypeScript 2025** - Enterprise-grade type safety and modern patterns
- **Prisma ORM** - Type-safe database operations
- **RESTful API** - Comprehensive backend API

## 🚀 Quick Start

1. **Clone and Start**
   ```bash
   git clone <repository-url>
   cd baton
   docker compose up -d
   ```

2. **Access Baton**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - Health Check: http://localhost:3001/health
   - Chat Interface: http://localhost:5173/chat

That's it! Baton is running with a seeded demo project and tasks.

## 🔧 Claude Code Integration

Baton offers two powerful ways to integrate with Claude Code:

### 🎨 WebUI Chat Interface (Recommended for Interactive Use)

**Prerequisites**: [Claude Code](https://claude.ai/code) installed, Docker services running

**Setup Steps:**

1. **Start All Services**
   ```bash
   docker compose up -d
   ```

2. **Start WebUI Handler**
   ```bash
   # Start the local Claude Code handler (runs outside Docker)
   node scripts/webui-chat-handler.js
   ```

3. **Open Chat Interface**
   ```bash
   open http://localhost:5173/chat
   ```

**Features:**
- 🎨 Gorgeous Claude-style dark theme with time-based greetings
- 📎 File upload support (code, images, documents - up to 25MB)
- 💬 Real-time streaming responses with session persistence
- 🔧 Tool usage visualization and interactive prompts
- 📱 Collapsible sidebar with conversation history
- ✨ Professional chat bubbles with avatars and streaming indicators

### 🔌 MCP Server Integration (Recommended for Programmatic Use)

**Prerequisites**: [Claude Code](https://claude.ai/code) installed, Baton running with Docker

**Setup Steps:**

1. **Start Baton (Magic One-Command Setup)**
   ```bash
   docker compose up -d
   ```
   The MCP server is automatically running with Claude Code-compatible transports:
   - SSE: http://localhost:3001/mcp/sse (HTTP-based)
   - STDIO: Available via docker exec (Most reliable)

2. **Get Your Project Connection URL**
   ```bash
   # Visit the Baton frontend to see your projects
   open http://localhost:5173
   
   # Or get connection info via API (replace "My Project" with your project name)
   curl "http://localhost:3001/api/mcp/connection?projectName=My Project"
   ```

3. **Add MCP Server to Claude Code**
   
   Choose your preferred transport method:
   
   **Option A: STDIO Transport (Recommended - Most Reliable)**
   ```bash
   # Single MCP server instance that handles all projects
   claude mcp add baton -- docker exec -i baton-backend npm run mcp:stdio
   ```
   
   **Option B: SSE Transport (HTTP-based)**
   ```bash
   # Single MCP server instance that handles all projects
   claude mcp add baton --transport sse http://localhost:3001/mcp/sse
   ```
   
   **Note**: The MCP server automatically detects which project you're working on based on your current workspace. No need for separate connections per project!

4. **Verify Integration**
   ```bash
   claude mcp list
   claude mcp get baton
   ```

### Usage
- **View Tasks**: "Show me my current tasks"
- **Create Tasks**: "Add a task to implement user authentication"  
- **Project Analytics**: "What's the status of my current project?"
- **Planning**: "Create a project plan for a new feature"
- **Todo Lists**: Claude Code plan mode automatically syncs with Baton
- **Bidirectional Sync**: "Sync my current todos to Baton tasks"

## 💬 AI Chat Agent with Claude Code Integration

Baton includes a powerful AI chat assistant that uses your local Claude Code installation to provide intelligent responses about your projects, tasks, and general development questions. **Now with automated permission handling for seamless file operations!**

### 🎯 Chat Agent Features
- **Project Context Awareness** - Automatically includes current project context in conversations
- **Streaming Responses** - Real-time streaming of Claude's responses as they're generated
- **Claude.ai-style Interface** - Familiar dark theme chat UI similar to Claude.ai
- **Persistent Conversations** - All chat history is saved and searchable
- **Interactive Prompt Handling** - Automatic UI prompts for user approval when needed
- **Permission Mode Support** - Automated file operations without manual approval for trusted tools
- **Session Continuation** - Maintain context across multiple interactions
- **Tool Integration** - Full access to Write, Edit, Read, Web Search, and MCP tools

### 🚀 Quick Setup with Makefile

#### Prerequisites
- Claude Code installed: `npm install -g @anthropic-ai/claude-code`
- Baton running (see Quick Start above)

#### One-Command Setup
```bash
# Start everything (database, backend, frontend, chat bridge, and handler)
make dev-full

# Or if you already have Baton running:
make dev
```

#### Manual Setup Steps

1. **Start the Chat Handler**
   ```bash
   # Automated permission handling - no prompts for trusted tools
   make handler
   
   # Or manually:
   node scripts/chat-handler.js > /tmp/chat-handler.log 2>&1 &
   ```

2. **Start the Chat Bridge** (Optional - for WebSocket connections)
   ```bash
   make bridge
   
   # Or manually:
   node scripts/chat-bridge.js > /tmp/chat-bridge.log 2>&1 &
   ```

3. **Access the Chat Interface**
   ```bash
   open http://localhost:5173/chat
   ```

#### Check Status
```bash
# View status of all services
make status

# View real-time logs
make logs

# Test integration
make test-integration
```

### 📝 Using the Chat Agent

1. **Start a Conversation**
   - Navigate to the Chat section in Baton
   - Type your message in the input field
   - Press Enter or click Send

2. **File Operations (Automated!)**
   ```
   💬 You: "Create a README.md file for this project with setup instructions"
   🤖 Claude: I'll create a comprehensive README file for you.
   ✅ File created automatically at: /home/user/project/README.md
   ```
   
   **No permission prompts needed!** The system automatically allows:
   - File creation and editing (Write, Edit, MultiEdit)
   - File reading and searching (Read, Glob, Grep, LS) 
   - Safe commands (npm, git, node, python basics)
   - Web searches and MCP tool access

3. **Interactive Prompts (When Needed)**
   For potentially dangerous operations, you'll see inline prompts:
   ```
   🤖 Claude wants to run: rm -rf old-folder/
   [Yes] [No] [Yes, don't ask again]
   ```

4. **Example Queries**
   - **File Operations**: "Create a config.json file with database settings"
   - **Code Generation**: "Write a Python script to analyze CSV data"
   - **Project Tasks**: "What tasks are currently in progress?"
   - **Planning**: "Create a project plan for user authentication feature"
   - **Analysis**: "Review the current codebase and suggest improvements"
   - **Research**: "Explain how to implement JWT authentication in Node.js"

5. **Project Context**
   - The chat agent automatically includes your current project context
   - Responses are tailored to your specific project and tasks
   - File operations are scoped to your project directory

### 🔧 Technical Architecture

The chat agent uses an advanced bridge architecture with permission management:

```
[Baton UI] ← WebSocket → [Baton Backend] ← Socket.IO → [Chat Handler] → [Claude Code]
                                     ↑                      ↓
                              [Interactive Prompts] ← [Permission Engine]
```

1. **Frontend** - React-based chat UI with streaming support and inline prompt handling
2. **Backend** - Queues messages, manages conversation state, and handles prompt responses
3. **Chat Handler** - Node.js bridge with automated permission modes and session continuation
4. **Permission Engine** - Multi-strategy decision engine (allowlist, denylist, user delegation)
5. **Claude Code** - Processes messages with `permissionMode: 'acceptEdits'` for trusted operations

### 🐛 Troubleshooting Chat Agent

#### Quick Diagnosis
```bash
# Check status of all services
make status

# View real-time logs from all services
make logs

# Test integration
make test-integration

# Test permission handling specifically
make test-claude-permissions
```

#### Chat not responding?
```bash
# Restart chat services
make restart

# Or manually check processes
ps aux | grep chat-handler

# View handler logs specifically
make logs-handler

# View bridge logs specifically
make logs-bridge
```

#### Permission prompts not working?
```bash
# Check if permission mode is configured
grep -A 10 "permissionMode" scripts/chat-handler.js

# Test file creation (should work without prompts)
make test-claude-permissions

# Check for errors in handler logs
tail -f /tmp/baton-chat-handler.log | grep -i error
```

#### Claude Code not found?
```bash
# Verify Claude Code installation
which claude

# Install if missing
npm install -g @anthropic-ai/claude-code

# Test Claude Code directly
claude --help | grep permission-mode
```

#### Connection issues?
```bash
# Check all services are running
make status

# Check backend health
curl http://localhost:3001/health

# View Docker container logs
make logs-docker

# Restart everything
make stop && make dev
```

## 🪝 Claude Code Hooks Integration

Baton now supports **automatic capture** of your Claude Code plans and todos through PostToolUse hooks!

### ✨ What It Does
- 📝 **Auto-capture Plans**: When you exit plan mode in Claude Code, plans are automatically saved to Baton
- ✅ **Todo Sync**: Claude Code todos are automatically synced to Baton in real-time
- 🎯 **Project Detection**: Uses `.baton-project` files to associate todos with correct projects
- 🔄 **Real-time Updates**: WebSocket notifications keep your Baton UI in sync

### 🚀 Quick Setup

1. **Create Project Context File**
   ```bash
   # In your project root directory
   echo '{"projectId": "your-project-id-from-baton"}' > .baton-project
   ```

2. **Configure Claude Code Hooks**
   
   Add this to your `~/.claude/settings.json` or `.claude/settings.local.json`:
   
   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "TodoWrite",
           "hooks": [
             {
               "type": "command",
               "command": "cd /path/to/your/baton && node scripts/capture-todos.js"
             }
           ]
         },
         {
           "matcher": "ExitPlanMode",
           "hooks": [
             {
               "type": "command",
               "command": "cd /path/to/your/baton && node scripts/capture-plan.js"
             }
           ]
         }
       ]
     }
   }
   ```
   
   **Replace `/path/to/your/baton`** with your actual Baton installation path.

3. **Ensure Baton is Running**
   ```bash
   docker compose up -d
   ```

### 🎯 How to Use
1. Work in Claude Code plan mode as usual
2. Accept plans - they're automatically captured in Baton
3. Create todos in Claude Code - they sync automatically to Baton
4. View everything in the Baton UI at http://localhost:5173

### 📚 Full Documentation
- [Quick Start Guide](./docs/CLAUDE_CODE_HOOKS_QUICKSTART.md) - Get running in 5 minutes
- [Full Setup Guide](./docs/CLAUDE_CODE_HOOKS_SETUP.md) - Detailed configuration and troubleshooting

## 🏗️ Multi-Project Workspace System

Baton uses a **single MCP server instance** that automatically detects which project you're working on:

### 🎯 How Project Detection Works

1. **Automatic Detection (No Setup Required)**
   - Reads `.baton-project` configuration files in your workspace
   - Matches current folder names to project names in Baton
   - Stores workspace mappings in database for faster lookup

2. **Context-Aware Operations**
   - All MCP requests detect project context per-request
   - Task creation automatically uses detected project
   - Resource URIs like `baton://workspace/tasks` show current project only
   - Claude Code todos are automatically scoped to current project

3. **Manual Project Association**
   ```bash
   # In Claude Code, ask: "Associate this workspace with project X"
   # This uses the associate_workspace_project MCP tool
   ```

### 📁 Setting Up Project Workspaces

**Option 1: Create `.baton-project` file**
```bash
# In your project root directory
echo '{"projectId": "your-project-id-from-baton"}' > .baton-project
```

**Option 2: Match folder names**
- Name your project folder to match a project name in Baton
- The MCP server will automatically detect the connection

**Option 3: Use MCP tool**
- Ask Claude Code: "Associate this workspace with [Project Name]"
- The tool will create the necessary mappings

## 🔧 Complete MCP Tools Reference

Baton provides **16 powerful MCP tools** for comprehensive task and project management from Claude Code:

### 📋 Project Management Tools
- **`create_project`** - Create new projects with name, description, and color
- **`update_project`** - Update existing project details and settings

### ✅ Task Management Tools  
- **`create_task`** - Create tasks with titles, descriptions, priorities, due dates, and labels
- **`update_task`** - Update any task properties including status and assignments
- **`move_task`** - Move tasks between columns (todo, in_progress, done) with ordering

### 🤖 Claude Code Integration Tools
- **`TodoRead`** - Read all Claude Code todos for current project
- **`TodoWrite`** - Write/update Claude Code todos with full CRUD operations
- **`sync_todos_to_tasks`** - Convert Claude Code todos into Baton tasks
- **`sync_tasks_to_todos`** - Sync Baton task updates back to Claude Code todos

### 🎯 MCP Plan Management Tools
- **`create_mcp_plan`** - Create structured plans with tasks from AI agents
- **`convert_mcp_plan`** - Convert MCP plans into actionable project tasks

### 📊 Analytics & Reporting Tools
- **`get_project_analytics`** - Get detailed project insights, completion rates, and metrics
- **`get_team_productivity`** - Analyze team performance and productivity trends

### 🗂️ Workspace Management Tools
- **`detect_workspace_project`** - Find and read .baton-project files for project context
- **`associate_workspace_project`** - Link current workspace to a Baton project
- **`get_workspace_info`** - Get current workspace and project information

### Usage Examples
```bash
# In Claude Code, you can use natural language:
"Create a new project called 'Mobile App'"
"Add a high-priority task to implement user authentication"
"Show me analytics for my current project"
"Sync my current todos to Baton tasks"
"What's my team's productivity this month?"
```

## 🛠️ Development

### Local Development

#### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 15+
- Git

#### Setup Steps

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd baton
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   
   # Set up environment
   cp .env.example .env
   # Edit .env with your database credentials
   
   # Database setup
   npm run db:migrate
   npm run db:seed
   
   # Start backend
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **MCP Server Development**
   ```bash
   cd backend
   # STDIO mode
   npm run mcp:dev
   
   # WebSocket mode
   npm run mcp:dev:websocket
   ```

### Testing

```bash
cd backend

# Run all tests
npm test

# MCP server tests
npm run test:mcp

# Database tests
npm run test:mcp:db

# Workspace context tests
npm run test:workspace
```

### Build

```bash
# Backend
cd backend
npm run build
npm run lint

# Frontend
cd frontend
npm run build
npm run lint
```

## 📊 MCP Resources & Tools

### MCP Resources (9 available)
- `baton://projects` - All projects
- `baton://projects/{id}/tasks/kanban` - Project kanban board
- `baton://workspace/current` - Current workspace project
- `baton://workspace/tasks` - Current workspace tasks
- `baton://projects/{id}/analytics` - Project analytics

### MCP Tools (15 available)
- `create_task` - Create new task
- `update_task` - Update existing task  
- `get_project_analytics` - Get project metrics
- `move_task` - Change task status/position
- `associate_workspace_project` - Link workspace to project
- `TodoRead` - Read Claude Code todos for current project
- `TodoWrite` - Write/update Claude Code todos
- `sync_todos_to_tasks` - Convert Claude todos to Baton tasks
- `sync_tasks_to_todos` - Convert Baton tasks to Claude todos

### MCP Prompts (8 available)
- `project_planning` - Create comprehensive project plans
- `task_breakdown` - Break down large tasks into subtasks
- `retrospective` - Generate project retrospectives
- `risk_assessment` - Analyze project risks

## 🔧 Configuration

### Environment Variables

#### Backend (.env)
```bash
DATABASE_URL="postgresql://baton_user:baton_password@localhost:5432/baton_dev"
PORT=3001
MCP_SERVER_PORT=3002
CLIENT_URL="http://localhost:5173"
```

#### Frontend (.env)
```bash
VITE_API_URL=http://localhost:3001
```

### Database Configuration

```bash
# Reset database
npm run db:reset

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed

# Open Prisma Studio
npx prisma studio
```

## 🔍 Troubleshooting

### Common Issues

#### Docker Issues
```bash
# Check container status
docker ps

# Check logs
docker logs baton-backend
docker logs baton-postgres

# Restart services
docker compose restart
```

#### Database Connection Errors
```bash
# Reset database
cd backend
npm run db:reset

# Check PostgreSQL is running
docker logs baton-postgres
```

#### Claude Code Integration Issues
```bash
# Verify MCP server is registered
claude mcp list

# Check server status
claude mcp get baton

# Test STDIO connection directly
docker exec -i baton-backend npm run mcp:stdio

# Test SSE connection directly
curl http://localhost:3001/mcp/sse

# Check backend logs for MCP errors
docker logs baton-backend

# Test project detection
# In your project folder, ask Claude Code: "What project am I in?"
```

#### Port Conflicts
If you encounter port conflicts, update these ports in `docker-compose.yml`:
- Frontend: 5173 → your preferred port
- Backend: 3001 → your preferred port
- MCP Server: 3002 → your preferred port
- PostgreSQL: 5432 → your preferred port

### Getting Help

1. Check the logs: `docker logs baton-backend`
2. Verify all services are running: `docker ps`
3. Test the health endpoint: `curl http://localhost:3001/health`
4. Check Claude Code MCP connection: `claude mcp get baton`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -m "Add amazing feature"`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Powered by [Claude Code](https://claude.ai/code)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide React](https://lucide.dev/)
