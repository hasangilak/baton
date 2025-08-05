# Claude Code Hooks - Quick Start Guide

Get Claude Code + Baton integration working in 5 minutes!

## 🚀 Quick Setup

### 1. Add Project Configuration

Create `.baton-project` in your project root:

```bash
echo '{
  "projectId": "YOUR_PROJECT_ID_HERE",
  "projectName": "Your Project Name"
}' > .baton-project
```

> **Note**: Get your project ID from Baton UI or database

### 2. Configure Claude Code Hooks

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

> **Important**: Use the absolute path to your project!

### 3. Make Scripts Executable

```bash
chmod +x scripts/capture-*.js
```

### 4. Test It!

```bash
# Run the test script
./scripts/test-hook-integration.sh

# Or test manually
claude -p
# Create a plan and some todos
```

## ✅ That's It!

Now when you:
- **Accept a plan** in Claude Code → Automatically saved to Baton
- **Create todos** in Claude Code → Automatically synced to Baton

## 🔍 Verify It's Working

Check the Baton UI or run:

```bash
curl "http://localhost:3001/api/claude/hook-status?projectId=YOUR_PROJECT_ID" | jq .
```

## ❓ Troubleshooting

**Hooks not working?**
1. Check path in `~/.claude.json` matches exactly (no trailing slash!)
2. Ensure `.baton-project` exists with correct project ID
3. Scripts must be executable: `chmod +x scripts/*.js`
4. Backend must be running: `docker-compose up -d`

**Need more details?** See the [full setup guide](./CLAUDE_CODE_HOOKS_SETUP.md)