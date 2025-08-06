# Claude Code Integration with Baton

This document provides a comprehensive guide to integrating Claude Code with Baton, including the AI chat agent, interactive prompt handling, and automated permission management.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Permission Management](#permission-management)
5. [Interactive Prompt System](#interactive-prompt-system)
6. [Session Management](#session-management)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Configuration](#advanced-configuration)

## 🎯 Overview

Baton's Claude Code integration provides:

- **AI Chat Agent**: Full conversation interface with Claude using your local Claude Code installation
- **Automated Permissions**: Smart permission handling that allows trusted operations without prompts
- **Interactive Prompts**: User-friendly inline prompts for potentially dangerous operations
- **Session Continuity**: Maintain conversation context across multiple interactions
- **File Operations**: Seamless file creation, editing, and management
- **Project Context**: Automatic project detection and scoping

## 🏗️ Architecture

### System Components

```mermaid
graph TB
    UI[Baton Frontend] --> API[Backend API]
    API --> Handler[Chat Handler]
    Handler --> Claude[Claude Code SDK]
    
    API --> Socket[Socket.IO Events]
    Socket --> UI
    Socket --> Handler
    
    Handler --> PermissionEngine[Permission Engine]
    PermissionEngine --> Allowlist[Allowlist Strategy]
    PermissionEngine --> Denylist[Denylist Strategy] 
    PermissionEngine --> UserPrompt[User Delegation]
    
    UserPrompt --> PromptDB[(Interactive Prompts DB)]
    API --> PromptDB
    UI --> PromptDB
    
    Handler --> SessionDB[(Session Storage)]
```

### Key Files

- **`scripts/chat-handler.js`**: Main Claude Code integration bridge
- **`scripts/decision-engine.js`**: Permission handling and user delegation
- **`scripts/prompt-detector.js`**: Interactive prompt detection patterns
- **`backend/src/routes/chat.ts`**: Chat API endpoints and session management
- **`frontend/src/components/InteractivePrompt.tsx`**: UI for user prompts
- **`Makefile`**: Process management and development commands

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### 2. Start Baton Services

```bash
# Complete setup (first time)
make dev-full

# Or if already set up
make dev
```

### 3. Test Integration

```bash
# Check all services are running
make status

# Test basic connectivity
make test-integration

# Test permission handling
make test-claude-permissions
```

### 4. Access Chat Interface

Visit `http://localhost:5173/chat` and start chatting with Claude!

## 🔐 Permission Management

### Automated Permission Modes

Baton configures Claude Code with smart permission handling:

```javascript
const baseOptions = {
  permissionMode: 'acceptEdits', // Auto-accept file operations
  allowedTools: [
    'Write', 'Edit', 'MultiEdit',     // File operations
    'Read', 'Glob', 'Grep', 'LS',     // File reading/searching
    'Bash(npm:*)', 'Bash(git:*)',     // Safe commands
    'mcp__*',                         // MCP tools
    'WebFetch', 'WebSearch'           // Web tools
  ]
};
```

### Permission Strategies

#### 1. Allowlist Strategy
Automatically allows common, safe operations:
- File operations: Write, Edit, Read
- Development commands: npm, git, node
- Search tools: Grep, Glob, WebSearch
- MCP tools: All MCP-prefixed tools

#### 2. Denylist Strategy
Blocks potentially dangerous operations:
- System commands: `rm -rf`, `sudo`, `format`
- Database operations: `DROP TABLE`, `TRUNCATE`
- Network security risks

#### 3. User Delegation Strategy
For operations not covered by allowlist/denylist:
- Shows interactive prompts in chat UI
- Stores decisions in database
- Supports session continuation after approval

### Permission Flow

```
1. Claude Code attempts operation
   ↓
2. Permission Engine evaluates:
   - Is it allowlisted? → Auto-approve
   - Is it denylisted? → Auto-block
   - Neither? → Ask user via prompt
   ↓
3. If user prompt needed:
   - Store prompt in database
   - Show in chat UI
   - Wait for user response
   - Continue Claude session with response
```

## 🤝 Interactive Prompt System

### Prompt Detection

The system detects various Claude Code prompts:

```javascript
// Permission requests
CLAUDE_PERMISSION: /Claude requested permissions to (.+?), but you haven't granted it yet\./i

// Tool usage confirmations
TOOL_USAGE: /Do you want to use the (.+?) tool\?/i

// Command confirmations
BASH_COMMAND: /Do you want me to run (.+?)\?/i
```

### Database Schema

Interactive prompts are stored with:

```sql
CREATE TABLE interactive_prompts (
  id VARCHAR PRIMARY KEY,
  conversationId VARCHAR NOT NULL,
  sessionId VARCHAR,        -- Claude Code session ID
  type VARCHAR NOT NULL,    -- 'permission', 'tool_usage', etc.
  title VARCHAR,
  message TEXT NOT NULL,
  options JSON NOT NULL,    -- Array of response options
  context JSON,             -- Additional context data
  status VARCHAR DEFAULT 'pending',
  selectedOption VARCHAR,
  autoHandler VARCHAR,      -- Which strategy handled it
  timeoutAt TIMESTAMP,
  createdAt TIMESTAMP,
  respondedAt TIMESTAMP
);
```

### UI Components

Interactive prompts appear inline in chat:

```tsx
<InteractivePrompt
  prompt={prompt}
  onResponse={(option) => handleResponse(prompt.id, option)}
/>
```

Options are rendered as clickable buttons:
- **Yes** / **No** for simple confirmations
- **Yes, don't ask again** for repeated operations
- Custom options based on prompt type

## 🔄 Session Management

### Session Continuity

Baton maintains Claude Code session state:

1. **Session ID Capture**: Extract session IDs from Claude Code messages
2. **Database Storage**: Link sessions to conversations
3. **Resume Capability**: Use `--resume <session-id>` for continuity
4. **Context Preservation**: Maintain conversation history across interactions

### Session Flow

```
User Message → Chat Handler → Claude Code SDK
                     ↓
              Capture Session ID
                     ↓
              Store in Database
                     ↓
            Next Message Uses --resume
```

### Token Management

- **Monitoring**: Track token usage per conversation
- **Compaction**: Automatic context compression when approaching limits
- **Optimization**: Smart session reuse vs. fresh starts

## 🛠️ Troubleshooting

### Common Issues

#### 1. Chat Not Responding

```bash
# Check service status
make status

# View real-time logs
make logs

# Restart services
make restart
```

**Symptoms**: No response in chat interface
**Causes**: Handler process stopped, backend connection lost
**Solution**: Restart chat handler with `make restart`

#### 2. Permission Prompts Not Showing

```bash
# Test permission detection
make test-claude-permissions

# Check handler configuration
grep -A 10 "permissionMode" scripts/chat-handler.js

# View prompt detection logs
make logs-handler | grep "Interactive prompt detected"
```

**Symptoms**: No prompts appear for blocked operations
**Causes**: Permission mode too permissive, prompt detection failure
**Solution**: Verify allowlist configuration, check prompt patterns

#### 3. Files Not Created After Approval

```bash
# Check session continuation
make logs-handler | grep "session continuation"

# Verify session IDs are stored
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "SELECT id, \"sessionId\" FROM interactive_prompts WHERE status = 'answered';"
```

**Symptoms**: User clicks "Yes" but file isn't created
**Causes**: Session ID not captured, continuation failed
**Solution**: Verify session ID storage, check continuation logs

#### 4. Claude Code Not Found

```bash
# Verify installation
which claude
claude --version

# Check PATH
echo $PATH | grep -o '[^:]*node[^:]*'

# Reinstall if needed
npm install -g @anthropic-ai/claude-code
```

### Diagnostic Commands

```bash
# Complete health check
make status
make test-integration
make test-claude-permissions

# Service-specific logs
make logs-handler    # Chat handler only
make logs-bridge     # WebSocket bridge only
make logs-docker     # Docker containers only

# Database inspection
docker exec -i baton-postgres-dev psql -U baton_user -d baton_dev \
  -c "SELECT COUNT(*) FROM interactive_prompts;"
```

## ⚙️ Advanced Configuration

### Custom Permission Rules

Modify `scripts/chat-handler.js` to customize permissions:

```javascript
const baseOptions = {
  permissionMode: 'acceptEdits',
  allowedTools: [
    // Add your custom tools here
    'YourCustomTool',
    'Bash(your-command:*)',
  ],
  // For completely automated workflows:
  // permissionMode: 'bypassPermissions'
};
```

### Environment Variables

```bash
# Chat handler configuration
export BACKEND_URL=http://localhost:3001
export POLLING_INTERVAL=1000

# Claude Code paths
export CLAUDE_PATH=/usr/local/bin/claude
export CLAUDE_CONFIG_DIR=~/.claude
```

### Database Configuration

```bash
# Custom database connection
export DATABASE_URL="postgresql://user:pass@host:port/db"

# Migration and seeding
cd backend
npm run db:migrate
npm run db:seed
```

### Logging Configuration

```bash
# Custom log locations
export CHAT_HANDLER_LOG=/custom/path/handler.log
export BRIDGE_LOG=/custom/path/bridge.log

# Log levels (in handler code)
console.log = process.env.NODE_ENV === 'development' ? console.log : () => {};
```

## 🔍 Monitoring and Analytics

### Metrics to Track

- **Response Times**: Handler processing speed
- **Session Success Rate**: Successful continuations
- **Permission Decisions**: Auto vs. user delegated
- **Error Rates**: Failed operations and causes

### Log Analysis

```bash
# Count permission types
grep "Interactive prompt detected" /tmp/baton-chat-handler.log | \
  grep -o "permission\|tool_usage\|command" | sort | uniq -c

# Session continuation success rate  
grep -c "Session continued successfully" /tmp/baton-chat-handler.log

# Error analysis
grep -i error /tmp/baton-chat-handler.log | \
  grep -v "Error.*resolved" | tail -20
```

### Database Queries

```sql
-- Prompt response statistics
SELECT 
  type,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (respondedAt - createdAt))) as avg_response_time_seconds
FROM interactive_prompts 
GROUP BY type, status;

-- Session usage patterns
SELECT 
  DATE(createdAt) as date,
  COUNT(DISTINCT sessionId) as unique_sessions,
  COUNT(*) as total_prompts
FROM interactive_prompts 
GROUP BY DATE(createdAt)
ORDER BY date DESC;
```

## 📚 Related Documentation

- [Interactive Prompts Setup](./CLAUDE_CODE_INTERACTIVE_PROMPTS.md)
- [Claude Code Hooks Integration](./CLAUDE_CODE_HOOKS_QUICKSTART.md)
- [MCP Server Documentation](../README.md#mcp-integration)
- [Main README](../README.md)

## 🤝 Contributing

To contribute to the Claude Code integration:

1. **Test Changes**: Use `make test-integration` to verify functionality
2. **Update Documentation**: Keep this document current with any changes
3. **Add Tests**: Include tests for new permission patterns or prompt types
4. **Monitor Performance**: Check impact on response times and resource usage

## 📝 Changelog

### v1.3.0 - Automated Permission Management
- Added `permissionMode: 'acceptEdits'` configuration
- Implemented allowlist/denylist strategies
- Added session continuation for user responses
- Created comprehensive Makefile for process management

### v1.2.0 - Interactive Prompt System  
- Built prompt detection engine with regex patterns
- Added database storage for interactive prompts
- Created inline prompt UI components
- Implemented multi-strategy decision engine

### v1.1.0 - Session Management
- Added session ID capture and storage
- Implemented conversation continuity
- Added token usage monitoring
- Created context compaction system

### v1.0.0 - Initial Integration
- Basic Claude Code SDK integration
- Chat interface with streaming responses
- Project context awareness
- WebSocket real-time communication