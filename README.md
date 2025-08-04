# Baton - AI-Powered Task Manager

Baton is a modern task management system designed to work seamlessly with AI code agents via Model Context Protocol (MCP). It allows AI agents to create plans, generate todo lists, and manage tasks in a collaborative kanban-style interface.

## Features

- 🎯 **Kanban Board**: Visual task management with drag-and-drop functionality
- 🤖 **MCP Integration**: Direct integration with AI code agents
- 🔄 **Real-time Updates**: Collaborative features with WebSocket support
- 📊 **Project Management**: Support for multiple projects
- 🏷️ **Task Organization**: Labels, priorities, due dates, and assignees
- 📱 **Modern UI**: Clean, responsive design built with React and Tailwind CSS
- 🐳 **Docker Support**: Easy deployment with Docker containers

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

## MCP Integration

Baton is designed to work with AI code agents through the Model Context Protocol. AI agents can:

1. **Register themselves** with the system
2. **Submit task plans** with structured todo lists
3. **Update plan status** as work progresses
4. **Convert plans to tasks** for team collaboration

### Example MCP Plan Submission

```json
{
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication system",
  "agentName": "CodeAssistant",
  "projectId": "project-123",
  "tasks": [
    {
      "title": "Set up JWT middleware",
      "description": "Configure JWT authentication middleware",
      "priority": "high",
      "order": 0
    },
    {
      "title": "Create login endpoint",
      "description": "Implement user login with JWT tokens",
      "priority": "high",
      "order": 1
    }
  ]
}
```

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