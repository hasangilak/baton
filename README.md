# Baton 🥍

AI-powered task management designed for seamless integration with Claude Code. Built with React, Node.js, and PostgreSQL.

## ✨ Features

### 🎯 Core Task Management
- **Projects & Tasks** - Organize work with hierarchical project structure
- **Kanban Board** - Visual task management with drag-and-drop
- **Task Analytics** - Track progress, velocity, and team performance
- **Rich Task Details** - Descriptions, priorities, due dates, and custom fields

### 🤖 Claude Code Integration
- **Native MCP Support** - Built-in Model Context Protocol server
- **Plan Mode Sync** - Claude Code todos automatically sync with Baton
- **Bidirectional Sync** - Convert between Claude todos and Baton tasks
- **Context-Aware** - Automatic project detection based on workspace
- **16 MCP Tools** - Create tasks, manage projects, analytics, and more
- **8 MCP Prompts** - Project planning, task breakdown, retrospectives

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

That's it! Baton is running with a seeded demo project and tasks.

## 🔧 Claude Code Integration

### Prerequisites
- [Claude Code](https://claude.ai/code) installed
- Baton running with Docker (see Quick Start above)

### Setup Steps

1. **Start Baton (Magic One-Command Setup)**
   ```bash
   docker compose up -d
   ```
   That's it! The MCP server is automatically running with Claude Code-compatible transports:
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

## 📝 Claude Code Hooks Configuration

**IMPORTANT**: Add these into your own .claude project folder. grab the scritps from this repo in scripts folder:

````
"hooks": {
   "PostToolUse": [
      {
         "matcher": "TodoWrite",
         "hooks": [
            {
            "type": "command",
            "command": "cd /home/hassan/work/baton && node scripts/capture-todos.js"
            }
         ]
      },
      {
         "matcher": "ExitPlanMode",
         "hooks": [
            {
            "type": "command",
            "command": "cd /home/hassan/work/baton && node scripts/capture-plan.js"
            }
         ]
      }
   ]
}
````

**Simply copy the entire code block above and paste it into your Claude Code memory for seamless integration.**

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
