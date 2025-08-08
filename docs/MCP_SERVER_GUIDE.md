# Baton MCP Server Guide

Complete guide to Baton's Model Context Protocol (MCP) server implementation for AI agents and tools like Claude Desktop.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [MCP Server Features](#mcp-server-features)
4. [Connection Configuration](#connection-configuration)
5. [Available Resources](#available-resources)
6. [Available Tools](#available-tools)
7. [Available Prompts](#available-prompts)
8. [Usage Examples](#usage-examples)
9. [Advanced Configuration](#advanced-configuration)
10. [Troubleshooting](#troubleshooting)

## 🎉 Overview

Baton includes a **fully compliant** Model Context Protocol (MCP) server implementation with:

- ✅ **JSON-RPC 2.0 messaging** - Standard protocol communication
- ✅ **WebSocket & STDIO transport** - Multiple connection methods
- ✅ **20 Tools** - Comprehensive task and project management actions
- ✅ **12 Prompts** - AI-powered workflow templates
- ✅ **Resource Access** - Read-only access to projects and tasks
- ✅ **Workspace Context** - Automatic project detection
- ✅ **Official MCP SDK** - Built with `@modelcontextprotocol/sdk`

### Architecture

```
┌─────────────────┐   JSON-RPC 2.0   ┌──────────────────┐
│   AI Agents     │ ◀──────────────▶ │   MCP Server     │
│  Claude Desktop │  WebSocket/STDIO │   (Port 3002)    │
│  Claude Code    │                  └──────────────────┘
└─────────────────┘                           │
                                              ▼
                                    ┌──────────────────┐
                                    │   PostgreSQL     │
                                    │   Database       │
                                    └──────────────────┘
```

## 🚀 Quick Start

### Prerequisites

Ensure Baton is running with Docker:

```bash
# Start all services including MCP server
docker compose up -d

# Verify MCP server is running
curl http://localhost:3002 || echo "MCP WebSocket server running"
```

### Basic Connection Test

```bash
# Test WebSocket connection
wscat -c ws://localhost:3002

# Check server health
curl http://localhost:3001/health
```

## 🔧 MCP Server Features

### Transport Methods

#### **WebSocket** (Default, Recommended)
- **URL**: `ws://localhost:3002`
- **Best for**: Web applications, Claude Desktop
- **Features**: Real-time bidirectional communication

#### **STDIO** (For Local Scripts)
- **Command**: `node backend/dist/mcp-server.js`
- **Best for**: Local automation, command-line tools
- **Features**: Standard input/output communication

### Compliance Features

- **Full MCP Specification**: 100% compliant with MCP protocol
- **Lifecycle Management**: Proper initialization and shutdown
- **Error Handling**: Comprehensive error responses with codes
- **Request Validation**: Input validation with Zod schemas
- **Session Management**: Stateless design with database persistence

## 🔌 Connection Configuration

### For Claude Desktop

Add to your Claude Desktop MCP configuration file:

```json
{
  "mcpServers": {
    "baton": {
      "transport": {
        "type": "websocket",
        "url": "ws://localhost:3002"
      },
      "capabilities": {
        "resources": true,
        "tools": true,
        "prompts": true
      },
      "description": "Baton task manager with MCP integration"
    }
  }
}
```

### For Claude Code

Add to your Claude Code MCP configuration:

```json
{
  "name": "baton",
  "transport": {
    "type": "websocket", 
    "url": "ws://localhost:3002"
  }
}
```

### STDIO Configuration (Alternative)

```json
{
  "mcpServers": {
    "baton": {
      "command": "node",
      "args": ["/path/to/baton/backend/dist/mcp-server.js"],
      "env": {
        "DATABASE_URL": "postgresql://baton_user:baton_password@localhost:5432/baton_dev"
      }
    }
  }
}
```

## 📚 Available Resources

Access read-only project and task data through standardized URIs:

### Project Resources
- `baton://projects` - All projects with status and task counts
- `baton://projects/active` - Active projects only
- `baton://projects/{id}` - Specific project details
- `baton://projects/{id}/tasks` - All tasks in a project
- `baton://projects/{id}/tasks/kanban` - Kanban board view of tasks

### Task Resources  
- `baton://tasks` - All tasks across projects
- `baton://tasks/pending` - Tasks with status "todo" or "in_progress"

### Workspace Resources
- `baton://workspace/current` - Current workspace project (auto-detected)
- `baton://workspace/tasks` - Tasks in current workspace

### AI-Generated Content
- `baton://mcp-plans` - AI-generated plans
- `baton://mcp-agents` - Registered AI agents

## 🛠️ Available Tools (20 Tools)

### Project Management (2 tools)
- **`create_project`** - Create new projects with name, description, color
- **`update_project`** - Update existing project details

### Task Management (3 tools)
- **`create_task`** - Create tasks with title, description, priority, assignee
- **`update_task`** - Modify existing task properties
- **`move_task`** - Move tasks between columns (todo, in_progress, done)

### Claude Code Integration (6 tools)
- **`PlanRead`** - Read AI-generated plans
- **`PlanWrite`** - Create or update plans
- **`TodoRead`** - Read Claude Code todos for current project
- **`TodoWrite`** - Write/update Claude Code todos
- **`sync_todos_to_tasks`** - Convert Claude todos to Baton tasks
- **`sync_tasks_to_todos`** - Convert Baton tasks to Claude todos

### MCP Plan Management (2 tools)
- **`create_legacy_mcp_plan`** - Create AI-generated task plans
- **`convert_legacy_mcp_plan`** - Convert plans to regular tasks

### Analytics & Reporting (2 tools)
- **`get_project_analytics`** - Project insights and metrics
- **`get_team_productivity`** - Team performance analysis

### Workspace Management (3 tools)
- **`associate_workspace_project`** - Link workspace to project
- **`get_workspace_info`** - Get current workspace information
- **`detect_workspace_project`** - Auto-detect project from file location

### System Tools (2 tools)
- **`LinkTodosToplan`** - Link todos to specific plans
- **`permission_prompt`** - Handle interactive permission prompts

## 💬 Available Prompts (12 Prompts)

### Project Planning (4 prompts)
- **`create_project_plan`** - Generate comprehensive project plans
- **`analyze_project_status`** - Analyze project health and progress
- **`risk_assessment`** - Project risk analysis and mitigation
- **`sprint_planning`** - Generate sprint plans and capacity planning

### Task Management (2 prompts)
- **`generate_task_breakdown`** - Break complex tasks into subtasks
- **`standup_summary`** - Daily standup summaries and updates

### Team Collaboration (2 prompts)
- **`retrospective_analysis`** - Team retrospective insights
- **`code_review_checklist`** - Code review guidelines and checklists

### AI Integration (4 prompts)
- **`detect_baton_project`** - Detect Baton projects in workspace
- **`analyze_claude_plans`** - Analyze AI-generated plans
- **`plan_implementation_guide`** - Implementation guides for plans
- **`plan_retrospective`** - Retrospective analysis of completed plans

## 📖 Usage Examples

### Reading Project Data

```
@baton://projects
```

Response: JSON data with all projects, their status, and task counts.

### Creating a New Task

```
Use the create_task tool:
{
  "projectId": "project-123",
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication system",
  "priority": "high",
  "status": "todo"
}
```

### Generating a Project Plan

```
Use the create_project_plan prompt:
{
  "project_name": "E-commerce Platform",
  "project_description": "Modern e-commerce platform with React and Node.js",
  "timeline": "3 months",
  "team_size": "5",
  "priority_level": "high"
}
```

### Getting Project Analytics

```
Use the get_project_analytics tool:
{
  "projectId": "project-123",
  "timeframe": "month"
}
```

### Todo Integration with Claude Code

```
# Read todos from current project
Use the TodoRead tool (no parameters needed)

# Write todos for current project
Use the TodoWrite tool:
{
  "todos": [
    {
      "id": "todo-1",
      "content": "Set up project structure",
      "status": "pending",
      "priority": "high"
    }
  ]
}

# Convert todos to tasks
Use the sync_todos_to_tasks tool (optional todoIds filter)
```

## ⚙️ Advanced Configuration

### Environment Variables

```bash
# MCP Server Configuration
MCP_TRANSPORT_MODE=websocket  # or 'stdio'
MCP_SERVER_PORT=3002

# Database Connection
DATABASE_URL=postgresql://baton_user:baton_password@localhost:5432/baton_dev
```

### Custom Port Configuration

```bash
# Start MCP server on custom port
MCP_SERVER_PORT=9002 npm run mcp:websocket

# Update client configuration accordingly
ws://localhost:9002
```

### Development Mode

```bash
# Development with auto-reload
npm run mcp:dev:websocket

# Debug mode with verbose logging
DEBUG=1 npm run mcp:dev:websocket
```

### Workspace Context Configuration

Create `.baton-project` file in your workspace:

```json
{
  "projectId": "your-project-id",
  "projectName": "Your Project Name",
  "autoDetected": false
}
```

The MCP server automatically detects which project you're working on through:
1. `.baton-project` configuration files
2. Folder name matching against project names
3. WebSocket query parameters (`?projectName=My Project`)

## 🔧 Troubleshooting

### Common Issues

#### **MCP Server Not Starting**

```bash
# Check Docker services
docker compose ps

# Check MCP server logs
docker compose logs mcp-server

# Check port availability
lsof -i :3002

# Manual startup for debugging
cd backend && npm run mcp:dev:websocket
```

#### **Connection Refused**

```bash
# Verify server is running
curl http://localhost:3002 || echo "WebSocket server should respond with upgrade error"

# Test WebSocket connection
wscat -c ws://localhost:3002

# Check firewall/proxy settings
telnet localhost 3002
```

#### **Resource Not Found**

```bash
# Check database connection
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev -c "SELECT COUNT(*) FROM projects;"

# Verify project exists
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev -c "SELECT id, name FROM projects LIMIT 5;"

# Test resource access
curl "ws://localhost:3002" # Should return WebSocket upgrade error
```

#### **Tool Execution Failures**

```bash
# Check tool input validation
# Ensure all required parameters are provided
# Verify parameter formats (dates, IDs, enums)

# Check database constraints
# Ensure referenced projects/tasks exist
# Verify user permissions

# Check server logs for detailed errors
docker compose logs mcp-server | grep -i error
```

### Debug Mode

Enable debug logging for detailed information:

```bash
# Backend with debug logs
DEBUG=mcp:* npm run mcp:dev:websocket

# Check specific debug categories
DEBUG=mcp:server,mcp:tools npm run mcp:dev:websocket
```

### Performance Issues

#### **Slow Tool Responses**

- Check database query performance
- Verify connection pool settings
- Monitor resource usage in Docker

#### **Memory Usage**

- Monitor container memory limits
- Check for connection leaks
- Review database connection pooling

### Validation Errors

All tools use Zod schemas for input validation. Common validation errors:

- **Missing required fields**: Ensure all required parameters are provided
- **Invalid formats**: Check date formats, enum values, regex patterns
- **Type mismatches**: Ensure strings, numbers, booleans match expected types

## 📊 Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:3001/health

# MCP server status
curl http://localhost:3002 2>&1 | grep -q "upgrade" && echo "MCP server running"

# Database connectivity
docker exec baton-postgres-dev pg_isready -U baton_user -d baton_dev
```

### Usage Metrics

Monitor MCP server usage through:
- Database query logs
- Container resource usage
- WebSocket connection counts
- Tool usage statistics

### Performance Monitoring

```bash
# Container resource usage
docker stats baton-mcp-server-dev

# Database performance
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables;"

# Log analysis
docker compose logs mcp-server | grep -E "(ERROR|WARN|performance)"
```

## 🔗 Integration with Other Components

### WebUI Integration

The MCP server works alongside the WebUI bridge service:
- **MCP Server**: Programmatic access for AI agents
- **Bridge Service**: Interactive chat interface via `scripts/bridge.ts`
- **Shared Database**: Both systems use the same PostgreSQL database

### Hook System Integration

MCP tools complement the hook system:
- **Hooks**: Capture plans/todos automatically from Claude Code
- **MCP Tools**: Manually manage todos and tasks programmatically
- **Data Flow**: Hooks → Database ← MCP Tools

### API Integration

MCP server shares data with REST API:
- **REST API**: Web frontend and mobile access
- **MCP Server**: AI agent and tool access
- **Database**: Single source of truth

## 📚 Related Documentation

- **[Getting Started](./GETTING_STARTED.md)** - Quick setup guide
- **[Claude Code Integration](./CLAUDE_CODE_INTEGRATION.md)** - Complete integration guide
- **[Technical Reference](./TECHNICAL_REFERENCE.md)** - API and architecture details

## 🎯 Summary

Baton's MCP server provides:

- ✅ **Full MCP Compliance** with 20 tools and 12 prompts
- ✅ **Flexible Transport** via WebSocket and STDIO
- ✅ **Rich Data Access** through standardized resource URIs
- ✅ **Workspace Context** with automatic project detection
- ✅ **Claude Code Integration** with todo and plan management
- ✅ **Enterprise Features** with validation, error handling, and monitoring
- ✅ **Easy Setup** with Docker and automatic service discovery

The MCP server enables AI agents to seamlessly integrate with Baton's task management system while maintaining data consistency and security.