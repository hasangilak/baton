# Claude Code Integration Test

This document provides step-by-step instructions to test Baton's MCP integration with Claude Code.

## Prerequisites

1. Start Baton stack:
   ```bash
   docker compose up -d
   ```

2. Verify services are running:
   ```bash
   curl http://localhost:3001/health
   curl -I http://localhost:3001/mcp/sse
   ```

## Test STDIO Transport (Recommended)

1. Add Baton MCP server to Claude Code:
   ```bash
   claude mcp add baton -- docker exec -i baton-backend npm run mcp:stdio
   ```

2. Verify the server is registered:
   ```bash
   claude mcp list
   claude mcp get baton
   ```

3. Test the integration in Claude Code:
   - Open Claude Code in a project directory
   - Type: "Show me my current tasks using Baton"
   - The AI should auto-detect your project and retrieve tasks

## Test SSE Transport (Alternative)

1. Add Baton SSE server to Claude Code:
   ```bash
   claude mcp add baton --transport sse http://localhost:3001/mcp/sse
   ```

2. Verify the server is registered:
   ```bash
   claude mcp list
   claude mcp get baton
   ```

3. Test the integration in Claude Code:
   - Open Claude Code in a project directory
   - Type: "Create a new task in Baton for testing the integration"
   - The AI should auto-detect your project and create the task

## Multi-Project Testing

Test that one MCP server instance handles multiple projects:

1. **Setup multiple project workspaces:**
   ```bash
   # Project A
   mkdir ~/project-a && cd ~/project-a
   echo '{"projectId": "project-a-id"}' > .baton-project
   
   # Project B  
   mkdir ~/project-b && cd ~/project-b
   echo '{"projectId": "project-b-id"}' > .baton-project
   ```

2. **Test context switching:**
   ```bash
   # In project A directory
   cd ~/project-a
   # Ask Claude Code: "What project am I in? Show my tasks."
   
   # In project B directory  
   cd ~/project-b
   # Ask Claude Code: "What project am I in? Show my tasks."
   ```

3. **Verify separate task scopes:**
   - Tasks created in Project A should only appear in Project A
   - Tasks created in Project B should only appear in Project B
   - The same MCP server handles both contexts automatically

## Troubleshooting

If you encounter issues:

1. Check Docker containers are running:
   ```bash
   docker ps
   ```

2. Check backend logs:
   ```bash
   docker logs baton-backend
   ```

3. Test transports directly:
   ```bash
   # Test STDIO
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | docker exec -i baton-backend npm run mcp:stdio
   
   # Test SSE
   curl -N -H "Accept: text/event-stream" http://localhost:3001/mcp/sse
   ```

4. Remove and re-add MCP servers:
   ```bash
   claude mcp remove baton-stdio
   claude mcp remove baton-sse
   # Then re-add using commands above
   ```

## Expected Behavior

When working correctly, you should be able to:

- ✅ View all projects and tasks in Baton
- ✅ Create new tasks via Claude Code  
- ✅ Update task statuses and descriptions
- ✅ Use Claude Code's TodoRead/TodoWrite features with Baton persistence
- ✅ Switch between projects by name
- ✅ Access all MCP tools, resources, and prompts

The integration bridges Claude Code's planning capabilities with Baton's persistent task management and team collaboration features.