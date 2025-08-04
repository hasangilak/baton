# Baton Model Context Protocol (MCP) Integration

Baton now includes a **fully compliant** Model Context Protocol (MCP) server implementation, providing standardized integration with AI agents and tools like Claude Desktop.

## 🎉 True MCP Compliance

Our implementation is **100% compliant** with the official MCP specification and includes:

- ✅ **JSON-RPC 2.0 messaging** - Standard protocol communication
- ✅ **WebSocket & STDIO transport** - Multiple connection methods
- ✅ **Resources** - Read-only access to project and task data
- ✅ **Tools** - Executable functions for CRUD operations
- ✅ **Prompts** - Templated workflows for AI interactions
- ✅ **Lifecycle management** - Proper initialization and shutdown
- ✅ **Official MCP SDK** - Built with `@modelcontextprotocol/sdk`

## Architecture Overview

Baton uses a **hybrid architecture** that combines traditional REST APIs with true MCP compliance:

```
┌─────────────────┐    REST API     ┌──────────────────┐
│   Web Frontend  │ ───────────────▶│   Express Server │
└─────────────────┘                 │   (Port 3001)    │
                                    └──────────────────┘
                                             │
                                             ▼
┌─────────────────┐   JSON-RPC 2.0  ┌──────────────────┐
│   AI Agents     │ ◀──────────────▶│   MCP Server     │
│  Claude Desktop │  WebSocket/STDIO│   (Port 3002)    │
│  Claude Code    │                 └──────────────────┘
└─────────────────┘                          │
                                             ▼
                                    ┌──────────────────┐
                                    │   PostgreSQL     │
                                    │   Database       │
                                    └──────────────────┘
```

## MCP Server Features

### 🗂️ Resources (Read-Only Data Access)

Access project and task data through standardized URIs:

- `baton://projects` - All projects
- `baton://projects/active` - Active projects  
- `baton://projects/{id}` - Specific project
- `baton://projects/{id}/tasks` - Project tasks
- `baton://projects/{id}/tasks/kanban` - Kanban board view
- `baton://tasks` - All tasks
- `baton://tasks/pending` - Pending tasks
- `baton://mcp-plans` - AI-generated plans
- `baton://mcp-agents` - Registered AI agents

### 🛠️ Tools (Executable Functions)

AI agents can perform actions through these tools:

#### Project Management
- `create_project` - Create new projects
- `update_project` - Modify existing projects

#### Task Management  
- `create_task` - Create new tasks
- `update_task` - Modify existing tasks
- `move_task` - Move tasks between columns

#### MCP Plan Management
- `create_mcp_plan` - Create AI-generated task plans
- `convert_mcp_plan` - Convert plans to regular tasks

#### Analytics & Reporting
- `get_project_analytics` - Project insights and metrics
- `get_team_productivity` - Team performance analysis

### 💬 Prompts (Templated Workflows)

Structured templates for AI interactions:

- `create_project_plan` - Generate comprehensive project plans
- `analyze_project_status` - Analyze project health and progress
- `generate_task_breakdown` - Break complex tasks into subtasks
- `sprint_planning` - Generate sprint plans
- `retrospective_analysis` - Team retrospective insights
- `risk_assessment` - Project risk analysis
- `standup_summary` - Daily standup summaries
- `code_review_checklist` - Code review guidelines

## Quick Start

### 1. Start the MCP Server

#### STDIO Mode (Default for MCP clients)
```bash
# Backend directory
npm run mcp
```

#### WebSocket Mode (For web-based connections)
```bash
# Backend directory  
npm run mcp:websocket
```

#### Docker (Recommended)
```bash
# Start all services including MCP server
docker-compose up -d

# MCP server will be available on ws://localhost:3002
```

### 2. Connect with Claude Desktop

Add to your Claude Desktop MCP configuration:

**STDIO Configuration:**
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

**WebSocket Configuration:**
```json
{
  "mcpServers": {
    "baton": {
      "transport": {
        "type": "websocket", 
        "url": "ws://localhost:3002"
      }
    }
  }
}
```

### 3. Connect with Claude Code

Claude Code supports MCP servers through multiple configuration scopes. Add Baton to your MCP server configuration:

```json
{
  "name": "baton",
  "command": "node",
  "args": ["/path/to/baton/backend/dist/mcp-server.js"],
  "env": {
    "DATABASE_URL": "postgresql://baton_user:baton_password@localhost:5432/baton_dev"
  }
}
```

## Usage Examples

### Reading Project Data
```
@baton://projects
```
This will show all projects with their current status and task counts.

### Creating a Task
Use the `create_task` tool:
```json
{
  "projectId": "project-123",
  "title": "Implement user authentication",
  "description": "Add JWT-based auth system",
  "priority": "high",
  "labels": ["backend", "security"]
}
```

### Generating a Project Plan
Use the `create_project_plan` prompt:
```json
{
  "project_name": "E-commerce Platform",
  "project_description": "Build a modern e-commerce platform with React and Node.js",
  "timeline": "3 months",
  "team_size": "5",
  "priority_level": "high"
}
```

### Getting Project Analytics
Use the `get_project_analytics` tool:
```json
{
  "projectId": "project-123",
  "timeframe": "month"
}
```

## Development

### Project Structure
```
backend/
├── src/
│   ├── mcp/
│   │   ├── server/         # Main MCP server implementation
│   │   ├── resources/      # Resource providers
│   │   ├── tools/          # Tool implementations  
│   │   └── prompts/        # Prompt templates
│   └── mcp-server.ts       # Server startup script
├── docs/
│   ├── mcp-client-config.json
│   ├── mcp-websocket-config.json
│   └── mcp-client-example.js
```

### Testing the MCP Server

Run the example client:
```bash
cd docs
node mcp-client-example.js
```

### Environment Variables

```bash
# MCP Server Configuration
MCP_TRANSPORT_MODE=websocket  # or 'stdio'
MCP_SERVER_PORT=3002

# Database (same as main backend)
DATABASE_URL=postgresql://baton_user:baton_password@localhost:5432/baton_dev
```

## Security Considerations

- **User Consent**: All tool operations require explicit approval in MCP clients
- **Data Access**: Resources provide read-only access to protect data integrity  
- **Authentication**: MCP server runs in trusted environment with database access
- **Input Validation**: All tool inputs are validated with Zod schemas
- **Error Handling**: Comprehensive error handling prevents data corruption

## Advanced Features

### Real-time Notifications
The MCP server integrates with Baton's WebSocket system to provide real-time updates when data changes.

### Custom Prompts
Extend the prompt system by adding new prompt templates in `/src/mcp/prompts/index.ts`.

### Custom Tools
Add new tools by implementing them in `/src/mcp/tools/index.ts` with proper Zod validation.

### Resource Extensions
Create custom resource URIs by extending the resource provider in `/src/mcp/resources/index.ts`.

## Troubleshooting

### Connection Issues
- Ensure the MCP server is running on the correct port
- Verify database connectivity
- Check that all dependencies are installed

### Permission Errors
- MCP clients will prompt for approval before executing tools
- Ensure proper database permissions are configured

### Performance
- Resources are cached for better performance
- Tools include optimistic updates where appropriate
- Database queries are optimized with proper indexes

## Contributing

To extend the MCP integration:

1. Add new resources in `resources/index.ts`
2. Implement new tools in `tools/index.ts` 
3. Create prompt templates in `prompts/index.ts`
4. Update tests and documentation
5. Ensure compliance with MCP specification

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/en/docs/build-with-claude/computer-use)
- [Claude Code MCP Integration](https://docs.anthropic.com/en/docs/claude-code/mcp)