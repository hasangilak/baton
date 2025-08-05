# Claude Code Hooks Configuration Guide

This guide will help you set up Claude Code hooks to automatically capture plans and todos from Claude Code into your Baton project management system.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Project Setup](#step-1-project-setup)
- [Step 2: Configure Claude Code Hooks](#step-2-configure-claude-code-hooks)
- [Step 3: Verify Hook Scripts](#step-3-verify-hook-scripts)
- [Step 4: Test the Integration](#step-4-test-the-integration)
- [Troubleshooting](#troubleshooting)
- [How It Works](#how-it-works)

## Overview

Claude Code hooks enable automatic synchronization between Claude Code and Baton:
- **Plan Capture**: When you exit plan mode in Claude Code, the plan is automatically stored in Baton
- **Todo Sync**: When Claude Code manages todos, they're automatically synced to your Baton project
- **Project Context**: Hooks automatically detect which Baton project you're working on

## Prerequisites

Before setting up hooks, ensure you have:

1. **Baton Backend Running**
   ```bash
   docker-compose up -d
   # or
   cd backend && npm run dev
   ```

2. **Claude Code Installed**
   ```bash
   claude --version
   ```

3. **Project Configuration**
   Your project must have a `.baton-project` file:
   ```json
   {
     "projectId": "your-project-id-here",
     "projectName": "Your Project Name"
   }
   ```

## Step 1: Project Setup

### 1.1 Create the `.baton-project` File

If you don't have a `.baton-project` file in your project root:

```bash
# Get your project ID from Baton UI or database
echo '{
  "projectId": "YOUR_PROJECT_ID",
  "projectName": "Your Project Name",
  "autoDetected": false
}' > .baton-project
```

### 1.2 Verify Hook Scripts Exist

Check that the capture scripts are in place:

```bash
ls -la scripts/capture-*.js
# Should show:
# - scripts/capture-plan.js
# - scripts/capture-todos.js
```

If missing, copy them from the Baton repository.

### 1.3 Make Scripts Executable

```bash
chmod +x scripts/capture-plan.js
chmod +x scripts/capture-todos.js
```

## Step 2: Configure Claude Code Hooks

### 2.1 Locate Your Claude Configuration

Find your global Claude configuration file:

```bash
# Usually located at:
~/.claude.json
```

### 2.2 Add Hook Configuration

Edit `~/.claude.json` and add the hook configuration for your project:

```bash
# Open the file in your editor
nano ~/.claude.json
# or
code ~/.claude.json
```

### 2.3 Add Project Hooks

Find or create the `projects` section and add your project configuration:

```json
{
  "projects": {
    "/path/to/your/project": {
      "post_tool_use_hooks": [
        {
          "pattern": "ExitPlanMode",
          "command": "node scripts/capture-plan.js"
        },
        {
          "pattern": "TodoWrite",
          "command": "cd /path/to/your/project && node scripts/capture-todos.js"
        }
      ]
    }
  }
}
```

**Important**: Replace `/path/to/your/project` with the absolute path to your project directory.

### 2.4 Example Complete Configuration

Here's an example of what the relevant section should look like:

```json
{
  "projects": {
    "/home/username/work/my-app": {
      "post_tool_use_hooks": [
        {
          "pattern": "ExitPlanMode",
          "command": "node scripts/capture-plan.js"
        },
        {
          "pattern": "TodoWrite",
          "command": "cd /home/username/work/my-app && node scripts/capture-todos.js"
        }
      ]
    }
  }
}
```

## Step 3: Verify Hook Scripts

### 3.1 Check API Configuration

Ensure the scripts point to the correct API URL. Edit `scripts/capture-plan.js` and `scripts/capture-todos.js`:

```javascript
// Default configuration (usually correct)
const BATON_API_URL = process.env.BATON_API_URL || 'http://localhost:3001';
```

### 3.2 Enable Debug Mode (Optional)

For troubleshooting, you can enable debug logging:

```bash
# For plan capture debugging
export DEBUG_PLAN_CAPTURE=true

# For todo capture debugging  
export DEBUG_TODO_CAPTURE=true
```

## Step 4: Test the Integration

### 4.1 Run the Integration Test

Baton provides a test script to verify everything is configured correctly:

```bash
cd /path/to/your/project
./scripts/test-hook-integration.sh
```

You should see output like:
```
✅ ExitPlanMode hook is configured
✅ TodoWrite hook is configured
✅ capture-plan.js exists and is executable
✅ capture-todos.js exists and is executable
✅ Hook status endpoint is working
✅ 🎉 Hook integration is properly configured!
```

### 4.2 Test with Claude Code

1. Open Claude Code in your project directory:
   ```bash
   cd /path/to/your/project
   claude -p
   ```

2. Create a test plan:
   ```
   Help me plan a new feature for user authentication
   ```

3. When Claude enters plan mode and you accept the plan, you should see:
   ```
   ✅ Plan "Your Plan Title" captured and stored in Baton
   ```

4. Create some todos and verify they sync:
   ```
   ✅ Synced 3 todos to Baton project
   ```

### 4.3 Verify in Baton UI

Open the Baton web interface and check:
- Your plans appear in the Plans section
- Todos are visible in the project
- Real-time updates work (you see notifications)

## Troubleshooting

### Hooks Not Triggering

1. **Check Claude Configuration**
   ```bash
   # Verify hooks are registered
   jq '.projects["/path/to/your/project"].post_tool_use_hooks' ~/.claude.json
   ```

2. **Check Project Path**
   - Ensure the path in `~/.claude.json` matches exactly
   - Use absolute paths, not relative paths
   - No trailing slashes

### API Connection Issues

1. **Verify Backend is Running**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Check API Endpoints**
   ```bash
   # Test hook status
   curl "http://localhost:3001/api/claude/hook-status?projectId=YOUR_PROJECT_ID"
   ```

### Permission Issues

1. **Make Scripts Executable**
   ```bash
   chmod +x scripts/*.js
   ```

2. **Check File Permissions**
   ```bash
   ls -la scripts/capture-*.js
   ```

### Debug Mode

Enable debug output to see what's happening:

```bash
# In your shell before running Claude Code
export DEBUG_PLAN_CAPTURE=true
export DEBUG_TODO_CAPTURE=true

# Run Claude Code
claude -p
```

### Common Issues

1. **"No .baton-project file found"**
   - Create the `.baton-project` file with your project ID
   - Ensure it's in the project root directory

2. **"Project not found"**
   - Verify the project ID in `.baton-project` is correct
   - Check that the project exists in Baton database

3. **Hooks not executing**
   - Restart Claude Code after configuration changes
   - Verify the exact project path matches in `~/.claude.json`

## How It Works

### Architecture Overview

```
Claude Code
    ↓
PostToolUse Hook Triggered
    ↓
capture-plan.js / capture-todos.js
    ↓
Baton API (/api/claude/*)
    ↓
PostgreSQL Database
    ↓
WebSocket Notifications
    ↓
Baton UI Updates
```

### Hook Flow

1. **ExitPlanMode Hook**
   - Triggered when you accept a plan in Claude Code
   - Extracts plan content and metadata
   - Sends to `/api/claude/plans`
   - Stores in `claude_code_plans` table

2. **TodoWrite Hook**
   - Triggered when Claude Code updates todos
   - Captures all todos with their status
   - Sends to `/api/claude/todos`
   - Syncs with `claude_todos` table

### Data Storage

Plans are stored with:
- Unique ID
- Title (extracted from first line)
- Full content
- Status (accepted/implemented/archived)
- Session ID
- Timestamp

Todos are stored with:
- Unique ID
- Content
- Status (pending/in_progress/completed)
- Priority (high/medium/low)
- Order index

## Advanced Configuration

### Custom API URL

If Baton is running on a different host:

```bash
# Set environment variable
export BATON_API_URL=http://your-server:3001

# Or modify the scripts directly
```

### Multiple Projects

Add hooks for each project in `~/.claude.json`:

```json
{
  "projects": {
    "/home/user/project1": {
      "post_tool_use_hooks": [...]
    },
    "/home/user/project2": {
      "post_tool_use_hooks": [...]
    }
  }
}
```

### Webhook Integration

To send notifications to external services, add webhook configuration to `.baton-project`:

```json
{
  "projectId": "your-project-id",
  "projectName": "Your Project",
  "webhookUrl": "https://your-webhook-endpoint.com/notify"
}
```

## Security Considerations

1. **Hook Scripts Run with Your Permissions**
   - Only use trusted scripts
   - Review script contents before enabling

2. **API Security**
   - Hooks communicate with local API by default
   - For remote APIs, use HTTPS and authentication

3. **Data Privacy**
   - Plans and todos are stored in your Baton database
   - No data is sent to external services unless configured

## Support

If you encounter issues:

1. Check the [troubleshooting](#troubleshooting) section
2. Run the integration test script
3. Enable debug mode for detailed logs
4. Check Baton backend logs: `docker logs baton-backend-dev`

For more help, refer to the main Baton documentation or create an issue in the repository.