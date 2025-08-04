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

## Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript + Prisma
- **Database**: PostgreSQL with automatic Docker setup
- **Real-time**: Socket.IO for collaborative features
- **Containerization**: Docker with multi-stage builds

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
- Node.js 18+
- npm or yarn

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
│   │   ├── components/       # React components
│   │   │   ├── layout/       # Layout components (Sidebar, Header)
│   │   │   ├── kanban/       # Kanban board components
│   │   │   └── ui/           # Reusable UI components
│   │   ├── services/         # API services
│   │   ├── types/            # TypeScript type definitions
│   │   ├── hooks/            # Custom React hooks
│   │   └── utils/            # Utility functions
│   ├── Dockerfile            # Production frontend container
│   ├── Dockerfile.dev        # Development frontend container
│   └── nginx.conf            # Nginx configuration
├── backend/                  # Node.js backend application
│   ├── src/
│   │   ├── routes/           # API route handlers
│   │   ├── middleware/       # Express middleware
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

## 🤖 AI Editor Integration

Baton includes a **fully compliant Model Context Protocol (MCP) server** with workspace context detection, enabling seamless integration with AI-powered editors and tools.

### 🎯 Key Features

- ✅ **Workspace Context Detection** - Automatically detects which project you're working on
- ✅ **True MCP Compliance** - JSON-RPC 2.0 with WebSocket & STDIO transport
- ✅ **9 Resources** - Projects, tasks, kanban boards, analytics, and workspace context
- ✅ **11 Tools** - Create tasks, manage projects, get analytics, workspace management
- ✅ **8 Prompts** - Project planning, task breakdown, retrospectives, risk assessment

### 🔧 Editor Integration

<details>
<summary><strong>📝 Claude Code</strong></summary>

#### Prerequisites
- [Claude Code](https://claude.ai/code) installed
- Baton running locally (see Quick Start above)

#### Setup Steps

1. **Start Baton MCP Server**
   ```bash
   cd backend
   npm run build
   npm run mcp:stdio
   ```

2. **Add MCP Server to Claude Code**
   ```bash
   claude mcp add baton --scope project -- node /absolute/path/to/baton/backend/dist/mcp-server.js
   ```
   
   Or with environment variables:
   ```bash
   claude mcp add baton --scope project -e DATABASE_URL="postgresql://baton_user:baton_password@localhost:5432/baton_dev" -- node /absolute/path/to/baton/backend/dist/mcp-server.js
   ```

3. **Verify Integration**
   ```bash
   claude mcp list
   ```

4. **Create Workspace Context**
   Create a `.baton-project` file in your workspace root:
   ```json
   {
     "projectId": "your-project-id",
     "workspacePath": "/path/to/your/workspace",
     "createdAt": "2025-01-01T00:00:00.000Z",
     "version": "1.0.0"
   }
   ```

#### Usage
- **View Tasks**: Ask Claude "Show me my current tasks"
- **Create Tasks**: "Add a task to implement user authentication"
- **Project Analytics**: "What's the status of my current project?"
- **Planning**: "Create a project plan for a new feature"

</details>

<details>
<summary><strong>🎨 Cursor IDE</strong></summary>

#### Prerequisites
- [Cursor IDE](https://cursor.sh/) installed
- Baton running locally

#### Setup Steps

1. **Install MCP Extension** (if available)
   - Check Cursor marketplace for MCP support

2. **Alternative: WebSocket Integration**
   ```bash
   # Start Baton in WebSocket mode
   npm run mcp:websocket
   ```

3. **Configure Cursor Settings**
   Add to your Cursor settings:
   ```json
   {
     "mcp.servers": {
       "baton": {
         "transport": "websocket",
         "url": "ws://localhost:3002"
       }
     }
   }
   ```

4. **Workspace Context**
   Ensure `.baton-project` exists in your workspace root.

#### Usage
- Access Baton resources through Cursor's MCP interface
- Use @ mentions to reference Baton resources
- Create tasks directly from code comments

</details>

<details>
<summary><strong>🌊 Windsurf</strong></summary>

#### Prerequisites
- [Windsurf](https://codeium.com/windsurf) installed
- Baton running locally

#### Setup Steps

1. **Start MCP Server**
   ```bash
   npm run mcp:stdio
   ```

2. **Configure Windsurf**
   Add MCP server configuration to Windsurf settings:
   ```json
   {
     "mcp": {
       "servers": {
         "baton": {
           "command": "node",
           "args": ["/absolute/path/to/baton/backend/dist/mcp-server.js"],
           "env": {
             "DATABASE_URL": "postgresql://baton_user:baton_password@localhost:5432/baton_dev"
           }
         }
       }
     }
   }
   ```

3. **Workspace Association**
   Create `.baton-project` in your project root.

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

- [ ] User authentication and authorization
- [ ] Advanced MCP integrations
- [ ] Mobile application
- [ ] Advanced reporting and analytics
- [ ] Third-party integrations (GitHub, Slack, etc.)
- [ ] Plugin system for custom extensions