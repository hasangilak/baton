# Baton - AI-Powered Task Manager

Baton is a modern task management system designed to work seamlessly with AI code agents via Model Context Protocol (MCP). It allows AI agents to create plans, generate todo lists, and manage tasks in a collaborative kanban-style interface.

## Features

- 🎯 **Kanban Board**: Visual task management with drag-and-drop functionality
- 🤖 **True MCP Compliance**: Official Model Context Protocol server with JSON-RPC 2.0
- 🔄 **Real-time Updates**: Collaborative features with WebSocket support
- 📊 **Project Management**: Support for multiple projects
- 🏷️ **Task Organization**: Labels, priorities, due dates, and assignees
- 📱 **Modern UI**: Clean, responsive design built with React and Tailwind CSS
- 🐳 **Docker Support**: Easy deployment with Docker containers
- 🤝 **AI Agent Integration**: Resources, Tools, and Prompts for AI interactions
- ⚡ **Enterprise TypeScript**: 2025 best practices with strict mode and advanced type checking
- 🔧 **Developer Experience**: Hot reload, type safety, and comprehensive error handling

## Architecture

- **Frontend**: React 18 + TypeScript (2025 Standards) + TanStack Query + Vite + Tailwind CSS 4
- **Backend**: Node.js 22 + Express + TypeScript (Strict Mode) + Prisma ORM
- **Database**: PostgreSQL 15 with automatic Docker setup and migrations
- **Real-time**: Socket.IO for collaborative features + WebSocket MCP transport
- **Containerization**: Docker with multi-stage builds and health checks
- **Type Safety**: Enterprise-grade TypeScript with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`

## Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd baton
   ```

2. **Run with Docker Compose**
   ```bash
   # Production mode
   docker-compose up -d

   # Development mode with hot reload
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

3. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - MCP Server: ws://localhost:3002 (WebSocket) or STDIO
   - API Health Check: http://localhost:3001/health

### Local Development

#### Prerequisites
- Node.js 22+ (for TypeScript 2025 features)
- npm or yarn
- PostgreSQL 15+ (or use Docker)

#### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
baton/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/       # React components (TypeScript strict mode)
│   │   │   ├── layout/       # Layout components (Sidebar, Header)
│   │   │   ├── kanban/       # Kanban board components with drag-and-drop
│   │   │   └── ui/           # Reusable UI components
│   │   ├── services/         # API services with type safety
│   │   ├── types/            # TypeScript type definitions (2025 standards)
│   │   ├── hooks/            # Custom React hooks with TanStack Query
│   │   ├── lib/              # Query client and utility libraries
│   │   └── utils/            # Utility functions
│   ├── Dockerfile            # Production frontend container
│   ├── Dockerfile.dev        # Development frontend container
│   └── nginx.conf            # Nginx configuration
├── backend/                  # Node.js backend application
│   ├── src/
│   │   ├── routes/           # API route handlers (strict TypeScript)
│   │   ├── middleware/       # Express middleware
│   │   ├── mcp/              # Model Context Protocol server
│   │   │   ├── server/       # MCP server implementation
│   │   │   ├── resources/    # MCP resource providers
│   │   │   ├── tools/        # MCP tools for AI agents
│   │   │   ├── prompts/      # MCP prompts for AI interactions
│   │   │   └── workspace/    # Workspace context detection
│   │   ├── services/         # Business logic services
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utility functions
│   ├── prisma/               # Database schema and migrations
│   ├── Dockerfile            # Production backend container
│   └── Dockerfile.dev        # Development backend container
├── docker/                   # Docker-related configurations
├── docs/                     # Documentation
├── docker-compose.yml        # Production Docker Compose
├── docker-compose.dev.yml    # Development Docker Compose
└── README.md
```

## API Endpoints

### Projects
- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get project by ID
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks?projectId=:id` - Get tasks for a project
- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:id` - Get task by ID
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/reorder` - Reorder task (drag & drop)

### MCP Integration
- `GET /api/mcp/agents` - Get registered AI agents
- `POST /api/mcp/agents` - Register a new AI agent
- `GET /api/mcp/plans` - Get AI-generated plans
- `POST /api/mcp/plans` - Create a plan from AI agent
- `POST /api/mcp/plans/:id/convert` - Convert plan to tasks  
- `GET /api/mcp/connection` - Get MCP WebSocket connection URLs with project context

### Claude Code Integration
- `GET /api/claude-todos?projectId=:id` - Get Claude Code todos for a project
- `POST /api/claude-todos` - Create or update Claude Code todos
- `DELETE /api/claude-todos/:id` - Delete a specific Claude Code todo
- `POST /api/claude-todos/sync-to-tasks` - Sync Claude Code todos to Baton tasks
- `POST /api/claude-todos/sync-from-tasks` - Sync Baton tasks to Claude Code todos

## 🤖 AI Editor Integration

Baton includes a **fully compliant Model Context Protocol (MCP) server** with workspace context detection, enabling seamless integration with AI-powered editors and tools.

### 🎯 Key Features

- ✅ **Workspace Context Detection** - Automatically detects which project you're working on
- ✅ **True MCP Compliance** - JSON-RPC 2.0 with WebSocket & STDIO transport
- ✅ **Claude Code Integration** - TodoRead/TodoWrite tools with bidirectional sync
- ✅ **Plan Mode Support** - Seamless integration with Claude Code plan mode and todo lists
- ✅ **9 Resources** - Projects, tasks, kanban boards, analytics, and workspace context
- ✅ **15 Tools** - Create tasks, manage projects, Claude Code todos, bidirectional sync
- ✅ **8 Prompts** - Project planning, task breakdown, retrospectives, risk assessment

### 🔧 Editor Integration

<details>
<summary><strong>📝 Claude Code</strong></summary>

#### Prerequisites
- [Claude Code](https://claude.ai/code) installed
- Baton running with Docker (see Quick Start above)

#### Setup Steps

1. **Start Baton (Magic One-Command Setup)**
   ```bash
   docker compose up -d
   ```
   That's it! The MCP server is automatically running on WebSocket port 3002.

2. **Get Your Project Connection URL**
   ```bash
   # Visit the Baton frontend to see your projects
   open http://localhost:5173
   
   # Or get connection info via API (replace "My Project" with your project name)
   curl "http://localhost:3001/api/mcp/connection?projectName=My Project"
   ```

3. **Add MCP Server to Claude Code (WebSocket)**
   ```bash
   # Simple connection (auto-detects project)
   claude mcp add baton-websocket --transport websocket --url ws://localhost:3002
   
   # Project-specific connection
   claude mcp add baton-myproject --transport websocket --url "ws://localhost:3002?projectName=My Project"
   ```

4. **Verify Integration**
   ```bash
   claude mcp list
   claude mcp get baton-websocket
   ```

#### Usage
- **View Tasks**: "Show me my current tasks"
- **Create Tasks**: "Add a task to implement user authentication"
- **Project Analytics**: "What's the status of my current project?"
- **Planning**: "Create a project plan for a new feature"
- **Todo Lists**: Claude Code plan mode automatically syncs with Baton
- **Bidirectional Sync**: "Sync my current todos to Baton tasks"

</details>

<details>
<summary><strong>🎨 Cursor IDE</strong></summary>

#### Prerequisites
- [Cursor IDE](https://cursor.sh/) installed
- Baton running with Docker

#### Setup Steps

1. **Start Baton**
   ```bash
   docker compose up -d
   ```

2. **Configure Cursor Settings**
   Add to your Cursor settings (`.cursor/settings.json`):
   ```json
   {
     "mcp.servers": {
       "baton": {
         "transport": "websocket",
         "url": "ws://localhost:3002"
       },
       "baton-myproject": {
         "transport": "websocket", 
         "url": "ws://localhost:3002?projectName=My Project"
       }
     }
   }
   ```

3. **Get Project Connection URL**
   ```bash
   # Get connection info for your specific project
   curl "http://localhost:3001/api/mcp/connection?projectName=My Project"
   ```

#### Usage
- Access Baton resources through Cursor's MCP interface
- Use @ mentions to reference Baton resources
- Create tasks directly from code comments

</details>

<details>
<summary><strong>🌊 Windsurf</strong></summary>

#### Prerequisites
- [Windsurf](https://codeium.com/windsurf) installed
- Baton running with Docker

#### Setup Steps

1. **Start Baton**
   ```bash
   docker compose up -d
   ```

2. **Configure Windsurf**
   Add MCP server configuration to Windsurf settings:
   ```json
   {
     "mcp": {
       "servers": {
         "baton": {
           "transport": "websocket",
           "url": "ws://localhost:3002"
         },
         "baton-myproject": {
           "transport": "websocket",
           "url": "ws://localhost:3002?projectName=My Project"
         }
       }
     }
   }
   ```

3. **Get Connection URL**
   ```bash
   # Get your project-specific connection URL
   curl "http://localhost:3001/api/mcp/connection?projectName=My Project"
   ```

#### Usage
- Leverage Windsurf's AI features with Baton context
- Generate tasks from code analysis  
- Project planning and management through AI chat

</details>

<details>
<summary><strong>🔧 Custom MCP Integration</strong></summary>

#### WebSocket Transport
```javascript
const WebSocket = require('ws');

// Connect to Baton MCP server
const ws = new WebSocket('ws://localhost:3002');

// Initialize MCP connection
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {
      resources: { subscribe: true },
      tools: {},
      prompts: {}
    },
    clientInfo: {
      name: 'custom-client',
      version: '1.0.0'
    }
  }
}));
```

#### STDIO Transport
```bash
# Direct STDIO communication
echo '{"jsonrpc":"2.0","id":1,"method":"resources/list"}' | node dist/mcp-server.js
```

#### Available Resources
- `baton://workspace/current` - Current workspace project
- `baton://workspace/tasks` - Tasks in current workspace
- `baton://workspace/tasks/kanban` - Kanban board view
- `baton://projects` - All projects
- `baton://tasks/pending` - All pending tasks
- `baton://mcp-plans` - AI-generated plans
- `baton://mcp-agents` - Registered AI agents

#### Available Tools
- `create_project` - Create new projects
- `create_task` - Add tasks to projects  
- `move_task` - Move tasks between columns
- `get_project_analytics` - Project insights
- `get_workspace_info` - Current workspace context
- `associate_workspace_project` - Link workspace to project
- `TodoRead` - Read Claude Code todos for current project
- `TodoWrite` - Write/update Claude Code todos
- `sync_todos_to_tasks` - Convert Claude todos to Baton tasks
- `sync_tasks_to_todos` - Convert Baton tasks to Claude todos

</details>

### 🏗️ Workspace Context System

Baton automatically detects which project you're working on based on your workspace:

1. **Automatic Detection**
   - Reads `.baton-project` configuration files
   - Matches folder names to project names
   - Stores workspace mappings in database

2. **Context-Aware Operations**
   - All task creation defaults to current workspace project
   - Resource URIs like `baton://workspace/tasks` show current project only
   - Analytics and reports focus on relevant project

3. **Multi-Project Support**
   - Different workspaces → different Baton projects
   - Seamless switching between projects
   - Persistent workspace associations

### 🧪 Testing Your Integration

```bash
# Test MCP server functionality
cd backend
npm run test:mcp

# Test workspace detection
npm run test:workspace

# Test database integration
npm run test:mcp:db
```

### 🔧 Troubleshooting

<details>
<summary><strong>Common Issues</strong></summary>

#### MCP Server Not Starting
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Verify database connection
npm run db:migrate

# Check environment variables
cat .env
```

#### Workspace Not Detected
```bash
# Check .baton-project file exists
ls -la .baton-project

# Test workspace detection
npm run test:workspace

# Manually associate workspace
npm run mcp:dev:websocket
# Then use the associate_workspace_project tool
```

#### Claude Code Integration Issues
```bash
# Verify MCP server is registered
claude mcp list

# Check server status
claude mcp get baton

# Test direct connection
npm run mcp:stdio
```

#### Database Connection Errors
```bash
# Reset database
npm run db:reset

# Check PostgreSQL logs
docker logs baton-postgres

# Verify connection string in .env
```

</details>

## TypeScript Excellence

Baton implements **enterprise-grade TypeScript 2025 best practices** across the entire codebase:

### 🎯 Type Safety Features

- ✅ **Strict Mode**: Full strict type checking enabled
- ✅ **Exact Optional Properties**: `exactOptionalPropertyTypes` prevents undefined vs missing property bugs
- ✅ **Index Access Safety**: `noUncheckedIndexedAccess` ensures array/object access safety
- ✅ **No Implicit Any**: All variables have explicit types
- ✅ **Unused Code Detection**: `noUnusedLocals` and `noUnusedParameters` for clean code
- ✅ **Advanced Checking**: `noImplicitOverride`, `noFallthroughCasesInSwitch`

### 🏗️ Configuration Highlights

**Backend TypeScript Config:**
```json
{
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "target": "ES2022",
  "moduleResolution": "node"
}
```

**Frontend TypeScript Config:**
```json
{
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "moduleResolution": "bundler",
  "jsx": "react-jsx"
}
```

### 🛠️ Code Quality Standards

- **Zero TypeScript Errors**: All code compiles without warnings or bypasses
- **Proper Null Handling**: Consistent use of null coalescing (`?? null`)
- **Type-Safe API Calls**: Prisma integration with strict type checking
- **Modern Patterns**: Optional chaining, nullish coalescing, and type guards

### 📦 Dependencies

- **Node.js 22**: Latest LTS with enhanced TypeScript support
- **TypeScript 5.x**: Latest compiler with advanced features
- **TSLib**: Runtime helpers for modern TypeScript features
- **Prisma**: Type-safe database client with generated types

## Development

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Database Management

Baton uses PostgreSQL as its primary database. When running with Docker, PostgreSQL is automatically set up and configured.

```bash
# Create new migration
npx prisma migrate dev --name <migration-name>

# Reset database
npx prisma migrate reset

# View database
npx prisma studio

# Connect to PostgreSQL directly (when running with Docker)
docker exec -it baton-postgres psql -U baton_user -d baton

# Generate Prisma client after schema changes
npx prisma generate
```

#### Database Configuration
- **Production**: `postgresql://baton_user:baton_password@postgres:5432/baton`
- **Development**: `postgresql://baton_user:baton_password@postgres:5432/baton_dev`
- **Local**: `postgresql://baton_user:baton_password@localhost:5432/baton_dev`

### Environment Variables

#### Backend (.env)
```
DATABASE_URL="postgresql://baton_user:baton_password@localhost:5432/baton_dev"
PORT=3001
NODE_ENV=development
CLIENT_URL="http://localhost:5173"
MCP_SERVER_PORT=3002
```

#### Frontend (.env)
```
VITE_API_URL="http://localhost:3001"
```

## Docker Commands

```bash
# Build images
docker-compose build

# Run in development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Run in production mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Clean up
docker-compose down -v --rmi all
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `docs/` directory
- Review the API documentation at `/api/docs` (when running)

## Roadmap

- [x] **TypeScript 2025 Best Practices** - Enterprise-grade type safety
- [x] **TanStack Query Integration** - Modern state management with caching
- [x] **Docker Production Deployment** - One-command deployment with health checks
- [x] **MCP Server Compliance** - Full Model Context Protocol implementation
- [x] **Claude Code Integration** - TodoRead/TodoWrite tools with plan mode support
- [x] **Bidirectional Sync** - Claude todos ↔ Baton tasks synchronization
- [ ] User authentication and authorization
- [ ] Advanced MCP integrations with more AI editors
- [ ] Mobile application with React Native
- [ ] Advanced reporting and analytics dashboard
- [ ] Third-party integrations (GitHub, Slack, Jira, etc.)
- [ ] Plugin system for custom extensions
- [ ] Real-time collaboration features
- [ ] Performance monitoring and observability