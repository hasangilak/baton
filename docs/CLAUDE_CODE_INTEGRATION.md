# Claude Code Integration with Baton

Complete guide to integrating Claude Code with Baton's task management system. This document consolidates all integration approaches and provides accurate, tested setup instructions.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [WebUI Integration (Recommended)](#webui-integration-recommended)
4. [MCP Server Integration](#mcp-server-integration)
5. [Hook System Integration](#hook-system-integration)
6. [Permission Management](#permission-management)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Configuration](#advanced-configuration)

## 🎯 Overview

Baton provides three ways to integrate with Claude Code:

### **🌟 WebUI Integration** (Best for Interactive Use)
- **Handler**: `scripts/bridge.ts` (the current, working solution)
- **Interface**: Beautiful web chat at `/chat`
- **Features**: File uploads, real-time streaming, permission management
- **Best for**: Daily development workflow, team collaboration

### **🔌 MCP Server Integration** (Best for Programmatic Use)
- **Protocol**: Model Context Protocol via WebSocket/STDIO
- **Features**: 16 tools, 8 prompts, project context awareness
- **Best for**: Claude Desktop, automated workflows, AI agents

### **🪝 Hook System** (Best for Automation)
- **Scripts**: `capture-plan.js`, `capture-todos.js`
- **Features**: Automatic plan/todo capture from Claude Code
- **Best for**: Background integration, workflow automation

## 🏗️ Architecture

### Current System Architecture

```mermaid
graph TB
    A[Claude Code] --> B[Bridge Service<br/>scripts/bridge.ts]
    B --> C[Backend API<br/>Port 3001]
    C --> D[WebSocket Events]
    D --> E[Frontend Chat UI<br/>Port 5173]
    
    F[Claude Desktop] --> G[MCP Server<br/>Port 3002]
    G --> C
    
    H[Claude Code Hooks] --> I[Capture Scripts]
    I --> J[Backend APIs]
    J --> C
    
    C --> K[PostgreSQL Database]
    C --> L[File Storage]
```

## 🌟 WebUI Integration (Recommended)

The **bridge.ts** service provides the most robust and feature-rich integration.

### Prerequisites

```bash
# Ensure Claude Code is installed
claude --version

# Ensure Bun runtime is available
bun --version

# Ensure Docker services are running
docker compose ps
```

### Setup Steps

#### 1. Start Baton Services
```bash
# From project root
docker compose up -d

# Verify all services are running
docker compose ps
```

#### 2. Start Bridge Service
```bash
# Method 1: Using the start script (recommended)
./scripts/start-bridge.sh

# Method 2: Direct execution
bun run scripts/bridge.ts

# Method 3: Custom configuration
bun run scripts/bridge.ts --port 8080 --backend http://localhost:3001
```

#### 3. Access Chat Interface
```bash
# Open in browser
open http://localhost:5173/chat
```

### Architecture Details

#### Request Flow
```
1. User sends message in chat UI
2. Frontend → Backend API (/api/chat/messages/stream-bridge)
3. Backend → Bridge Service (localhost:8080/execute)
4. Bridge → Claude Code SDK (local execution)
5. Claude Code responses → Bridge → Backend → Frontend (Server-Sent Events)
6. Real-time chat updates displayed to user
```

#### Permission System Flow
```
1. Claude Code requests tool usage (e.g., Write, Edit, Bash)
2. Bridge detects high-risk operation → Backend permission API
3. Backend creates interactive_prompt record → WebSocket event
4. Frontend displays permission UI with risk indicators
5. User clicks Allow/Deny → Backend stores decision
6. Bridge polls backend for response → Continues/aborts Claude execution
```

### Features

#### 🎨 **Professional Chat Interface**
- Claude-style dark theme with time-based greetings
- Streaming response rendering with typewriter effect
- Message history and conversation management
- Professional avatars and status indicators

#### 📎 **File Upload System**
- Support for code files (.js, .ts, .py, etc.)
- Image uploads (.png, .jpg, .gif, .webp)
- Document uploads (.pdf, .txt, .md)
- Up to 25MB per file, 5 files per message
- Automatic file type detection and validation

#### 🛡️ **Interactive Permission Management**
- Real-time permission prompts for tool usage
- Risk-based color coding (LOW/MEDIUM/HIGH/CRITICAL)
- "Allow Once" vs "Allow Always" options
- Session-based permission persistence
- Comprehensive audit logs

#### 📊 **Analytics & Monitoring**
- Token usage tracking and context management
- Session persistence with automatic resume
- Response time monitoring
- Permission decision analytics
- Real-time connection status

### Configuration Options

#### Bridge Service Configuration
```bash
# Default configuration
bun run scripts/bridge.ts

# Custom port and backend
bun run scripts/bridge.ts --port 9000 --backend http://localhost:3001

# Debug mode
DEBUG=1 bun run scripts/bridge.ts

# Development mode with auto-restart
bun --watch scripts/bridge.ts
```

#### Backend Environment Variables
```bash
# In docker-compose.dev.yml or .env
BRIDGE_URL=http://localhost:8080    # Bridge service URL
CLIENT_URL=http://localhost:5173    # Frontend URL for CORS
```

#### Permission Modes
The bridge automatically handles permissions, but you can configure behavior:

```typescript
// In bridge.ts, you can modify permission settings:
const permissionConfig = {
  autoAllow: ['Read', 'LS', 'Glob', 'Grep'],  // Safe read operations
  alwaysPrompt: ['Write', 'Edit', 'MultiEdit'], // File modifications
  critical: ['Bash']  // System commands - always prompt
};
```

## 🔌 MCP Server Integration

For programmatic integration and Claude Desktop usage.

### Prerequisites
```bash
# Ensure MCP server is running (included in docker compose)
curl http://localhost:3002 || echo "MCP WebSocket server running"
```

### Connection Configuration

#### For Claude Desktop
Add to your Claude Desktop MCP configuration:

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

#### For Claude Code
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

### Available MCP Features

#### 📚 **Resources** (Read-Only Data Access)
- `baton://projects` - All projects
- `baton://projects/{id}` - Specific project  
- `baton://projects/{id}/tasks` - Project tasks
- `baton://projects/{id}/tasks/kanban` - Kanban view
- `baton://workspace/current` - Current workspace project

#### 🛠️ **Tools** (Actions)
- **Project Management**: `create_project`, `update_project`
- **Task Management**: `create_task`, `update_task`, `move_task`
- **Todo Integration**: `sync_todos_to_tasks`, `sync_tasks_to_todos`
- **Analytics**: `get_project_analytics`, `get_team_productivity`

#### 💬 **Prompts** (Templates)
- `create_project_plan` - Generate comprehensive project plans
- `analyze_project_status` - Project health analysis
- `generate_task_breakdown` - Break complex tasks into subtasks
- `sprint_planning` - Sprint planning assistance

### Usage Examples

#### Reading Project Data
```
@baton://projects
```
Shows all projects with status and task counts.

#### Creating Tasks
```
Use the create_task tool to add "Implement user authentication" to project "web-app"
```

#### Project Planning
```
Use the create_project_plan prompt for a "E-commerce Platform" with React and Node.js, 3 month timeline, team of 5
```

For complete MCP documentation, see [MCP_SERVER_GUIDE.md](./MCP_SERVER_GUIDE.md).

## 🪝 Hook System Integration

Automatically capture plans and todos from Claude Code plan mode.

### Prerequisites
```bash
# Ensure hook scripts exist and are executable
ls -la scripts/capture-*.js
chmod +x scripts/capture-*.js
```

### Setup Steps

#### 1. Create Project Configuration
Create `.baton-project` in your workspace root:

```json
{
  "projectId": "your-project-id",
  "projectName": "Your Project Name"
}
```

#### 2. Configure Claude Code Hooks
Edit `~/.claude.json` and add:

```json
{
  "projects": {
    "/absolute/path/to/your/project": {
      "post_tool_use_hooks": [
        {
          "pattern": "ExitPlanMode",
          "command": "node scripts/capture-plan.js"
        },
        {
          "pattern": "TodoWrite", 
          "command": "cd /absolute/path/to/your/project && node scripts/capture-todos.js"
        }
      ]
    }
  }
}
```

#### 3. Test Integration
```bash
# Run the test script
./scripts/test-hook-integration.sh

# Or test manually with Claude Code
claude -p
# Create a plan and some todos
```

### How Hooks Work

#### Plan Capture Flow
1. User accepts plan in Claude Code plan mode
2. Claude Code calls `ExitPlanMode` tool
3. `capture-plan.js` hook executes
4. Plan content extracted and sent to `/api/claude/plans`
5. Plan stored in database with project context
6. Real-time WebSocket notification to frontend

#### Todo Sync Flow
1. Claude Code updates todos via `TodoWrite` tool
2. `capture-todos.js` hook executes
3. Todos extracted and sent to `/api/claude/todos`
4. Todos stored in `claude_todos` table
5. Optional: Use `sync_todos_to_tasks` to convert to Baton tasks

### Hook Configuration

#### Environment Variables
```bash
export BATON_API_URL="http://localhost:3001"  # Backend URL
export DEBUG_PLAN_CAPTURE=true               # Enable debug logging
export DEBUG_TODO_CAPTURE=true               # Enable todo debug logging
```

#### Custom Hook Paths
If running from different locations, update hook commands:
```json
{
  "pattern": "ExitPlanMode",
  "command": "/full/path/to/baton/scripts/capture-plan.js"
}
```

## 🛡️ Permission Management

Baton implements a comprehensive permission system for safe Claude Code integration.

### Permission Levels

#### **Automatic Approval** (No Prompt)
- `Read`, `LS`, `Glob`, `Grep` - Safe file reading operations
- `WebFetch`, `WebSearch` - External data access (read-only)

#### **User Prompt Required** (Interactive)
- `Write`, `Edit`, `MultiEdit` - File modification operations
- `Bash` - System command execution
- Custom tools and commands

### Permission Flow

#### 1. Tool Request Detection
```
Claude Code: "I need to use the Write tool to create config.json"
Bridge: "🛡️ High-risk tool detected: Write - requesting permission"
```

#### 2. Interactive Prompt Creation
```javascript
// Backend creates interactive prompt
{
  type: 'tool_permission',
  title: 'Write Tool Permission',
  message: 'Allow Claude Code to create/modify files?',
  options: [
    { id: 'allow_once', label: 'Allow Once' },
    { id: 'allow_always', label: 'Allow Always' }, 
    { id: 'deny', label: 'Deny' }
  ],
  context: {
    toolName: 'Write',
    riskLevel: 'HIGH',
    parameters: 'filename: config.json'
  }
}
```

#### 3. User Interface Display
- Permission prompt appears in chat interface
- Risk level shown with color coding:
  - 🟢 **LOW**: Green background, informational
  - 🟡 **MEDIUM**: Yellow background, caution
  - 🟠 **HIGH**: Orange background, warning
  - 🔴 **CRITICAL**: Red background, danger
- Context information displayed (file paths, command details)

#### 4. Permission Persistence
- **"Allow Once"**: Permission valid for current request only
- **"Allow Always"**: Permission stored in `conversation_permissions` table
- Session-based permissions expire with conversation
- Global permissions can be managed via UI

### Risk Assessment

#### Tool Risk Levels
```javascript
const riskLevels = {
  // Safe operations
  'Read': 'LOW',
  'LS': 'LOW', 
  'Glob': 'LOW',
  'Grep': 'LOW',
  
  // External access
  'WebFetch': 'MEDIUM',
  'WebSearch': 'MEDIUM',
  
  // File modifications
  'Write': 'HIGH',
  'Edit': 'HIGH',
  'MultiEdit': 'HIGH',
  
  // System commands
  'Bash': 'CRITICAL'
};
```

#### Context-Based Risk Assessment
- File path analysis (system files vs project files)
- Command content analysis (destructive vs safe commands)
- Parameter inspection (file sizes, destinations)
- Historical usage patterns

### Permission Analytics

#### Dashboard Metrics
- Total permission requests
- Approval/denial rates by tool
- Average response times
- Risk level distribution
- Most requested tools
- User decision patterns

#### Audit Trail
All permission decisions are logged with:
- Timestamp and user context
- Tool name and parameters
- Risk assessment details
- User decision and response time
- Session and conversation context

## 🔧 Troubleshooting

### Common Issues

#### **Bridge Service Not Starting**
```bash
# Check Bun installation
bun --version

# Check port availability
lsof -i :8080

# Check Claude Code installation
claude --version

# Try manual startup with debug
DEBUG=1 bun run scripts/bridge.ts
```

#### **Chat Interface Not Responding**
```bash
# Check bridge is running
ps aux | grep bridge.ts

# Check backend connection
curl http://localhost:3001/health

# Check WebSocket connection in browser dev tools
# Look for WebSocket connection errors
```

#### **Permission Prompts Not Appearing**
```bash
# Check WebSocket connection
# Browser Dev Tools → Network → WS tab

# Check interactive_prompts table
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "SELECT * FROM interactive_prompts ORDER BY created_at DESC LIMIT 5;"

# Check backend logs
docker compose logs backend | grep -i prompt
```

#### **MCP Server Connection Issues**
```bash
# Check MCP server status
curl http://localhost:3002 || echo "WebSocket server running"

# Check MCP server logs  
docker compose logs mcp-server

# Test WebSocket connection
wscat -c ws://localhost:3002
```

#### **Hook Integration Not Working**
```bash
# Check hook configuration
jq '.projects' ~/.claude.json

# Verify .baton-project file
cat .baton-project

# Test hook scripts manually
echo '{"tool_name": "ExitPlanMode", "tool_input": {"plan": "Test"}}' | \
  node scripts/capture-plan.js

# Check hook execution in Claude Code logs
DEBUG_PLAN_CAPTURE=true claude -p
```

### Performance Issues

#### **Slow Response Times**
- Check bridge service CPU/memory usage
- Verify Docker container resources
- Monitor token usage and context window
- Check database connection pool settings

#### **Memory Usage**
- Monitor Claude Code session management
- Check for context window bloat
- Review conversation cleanup policies
- Monitor file upload storage usage

### Debug Information

#### Bridge Service Logs
```bash
# Bridge outputs to console with timestamps
bun run scripts/bridge.ts
# Look for:
# - "🚀 Bridge executing Claude Code request"
# - "🔧 Creating robust prompt delivery"
# - "✅ Prompt delivered via: websocket"
```

#### Backend API Logs
```bash
docker compose logs backend | grep -E "(chat|prompt|permission)"
```

#### Database Inspection
```bash
# Check recent conversations
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "SELECT id, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;"

# Check interactive prompts
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "SELECT id, type, status, created_at FROM interactive_prompts ORDER BY created_at DESC LIMIT 5;"
```

## ⚙️ Advanced Configuration

### Custom Permission Rules

Modify permission behavior in `scripts/bridge.ts`:

```typescript
// Custom allowlist configuration
const customPermissions = {
  autoAllow: [
    'Read', 'LS', 'Glob', 'Grep',  // Default safe operations
    'YourCustomTool',              // Add custom tools
  ],
  requirePrompt: [
    'Write', 'Edit', 'MultiEdit',  // File operations
    'Bash(git:*)',                 // Git commands only
  ],
  alwaysDeny: [
    'Bash(rm:*)',                  // Dangerous deletions
    'Bash(sudo:*)',                // System administration
  ]
};
```

### Environment Configuration

#### Bridge Service Environment
```bash
# Custom bridge configuration
export BRIDGE_PORT=9000                    # Custom port
export BRIDGE_BACKEND_URL=http://localhost:3001
export BRIDGE_DEBUG=true                   # Enable debug logging
export BRIDGE_TIMEOUT=60000               # Request timeout (ms)
```

#### Backend Environment
```bash
# In docker-compose.dev.yml
environment:
  - BRIDGE_URL=http://localhost:8080       # Bridge service URL
  - CLAUDE_TIMEOUT=120000                  # Claude request timeout
  - PERMISSION_TIMEOUT=30000               # Permission prompt timeout
  - MAX_FILE_SIZE=26214400                 # 25MB file upload limit
```

### Database Configuration

#### Custom Database Connection
```bash
# Override default database URL
export DATABASE_URL="postgresql://custom_user:password@host:port/db"
```

#### Permission Table Management
```sql
-- Clean up old permissions
DELETE FROM conversation_permissions 
WHERE created_at < NOW() - INTERVAL '7 days' 
AND expires_at IS NULL;

-- View permission statistics
SELECT 
  tool_name, 
  permission, 
  COUNT(*) as count
FROM conversation_permissions 
GROUP BY tool_name, permission;
```

### Performance Tuning

#### Context Management
```typescript
// In bridge.ts, configure context management
const contextConfig = {
  maxTokens: 150000,           // 75% of 200k limit
  compactionThreshold: 0.75,   // Compact at 75%
  messageRetention: 50,        // Keep last 50 messages
  summaryLength: 1000          // Summary token limit
};
```

#### Session Management
```typescript
// Configure session persistence
const sessionConfig = {
  maxSessions: 100,            // Maximum concurrent sessions
  sessionTimeout: 3600000,     // 1 hour timeout
  cleanupInterval: 300000,     // 5 minute cleanup
  persistenceEnabled: true     // Database persistence
};
```

## 🔍 Monitoring and Analytics

### Real-Time Metrics

#### Permission Analytics
- Request volume and patterns
- Response times by tool type
- Approval/denial rates
- Risk level distributions
- User behavior patterns

#### System Health
- Bridge service uptime and performance
- MCP server connection status
- Database query performance
- WebSocket connection stability
- File upload success rates

### Usage Analytics

#### Dashboard Views
- Active conversations and sessions
- Tool usage statistics
- Permission decision trends
- File upload analytics
- Error rates and types

#### Export and Reporting
```bash
# Export permission data
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "COPY (SELECT * FROM interactive_prompts WHERE created_at > NOW() - INTERVAL '30 days') TO STDOUT WITH CSV HEADER;" > permissions_report.csv
```

## 📚 Related Documentation

- **[Getting Started](./GETTING_STARTED.md)** - Quick setup guide
- **[MCP Server Guide](./MCP_SERVER_GUIDE.md)** - Complete MCP documentation
- **[Technical Reference](./TECHNICAL_REFERENCE.md)** - API documentation and architecture
- **[Bridge Service README](../scripts/BRIDGE_README.md)** - Bridge-specific documentation

## 🎯 Summary

Baton's Claude Code integration provides:

- ✅ **Robust WebUI Integration** via `bridge.ts` service
- ✅ **Professional Chat Interface** with file uploads and permissions
- ✅ **MCP Server Protocol** for programmatic access
- ✅ **Automatic Hook Integration** for plan and todo capture
- ✅ **Comprehensive Permission System** with risk assessment
- ✅ **Real-time Analytics** and monitoring
- ✅ **Enterprise-grade Security** with audit trails

Choose the integration method that best fits your workflow, or use multiple methods together for maximum flexibility.