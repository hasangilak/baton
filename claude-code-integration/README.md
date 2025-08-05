# Claude Code + Baton Integration

This directory contains enhanced Claude Code hooks and configuration templates to provide seamless integration between Claude Code and Baton's task management system.

## 🚀 Quick Setup

1. **Copy hooks to your project:**
   ```bash
   cp -r claude-code-integration/hooks .claude/
   chmod +x .claude/hooks/*.sh
   ```

2. **Copy settings template:**
   ```bash
   cp claude-code-integration/settings.json .claude/settings.json
   ```

3. **Run setup script:**
   ```bash
   ./claude-code-integration/setup.sh
   ```

## 🔧 What's Included

### Hooks
- `sessionStart.sh` - Auto-detects workspace and initializes Baton context
- `preToolUse.sh` - Automatically injects project ID into Baton MCP tool calls
- `postToolUse.sh` - Triggers synchronization after plan/todo operations
- `userPromptSubmit.sh` - Detects plan intent and prepares context

### Configuration
- `settings.json` - Optimized Claude Code settings for Baton integration
- `setup.sh` - Automated setup script
- Examples and documentation

## 🎯 Benefits

- **Zero Configuration**: Automatic project detection and context management
- **Seamless Integration**: No manual `detect_workspace_project` calls needed
- **Real-time Sync**: Immediate UI updates after operations
- **Enhanced Workflow**: Proactive plan mode detection and preparation

## 📋 Enhanced Workflow

Instead of:
```
1. Call detect_workspace_project manually
2. Call PlanWrite with projectId
3. Call TodoWrite with projectId
4. Manual synchronization
```

You get:
```
1. ✅ Auto-detected on session start
2. ✅ Auto-injected project context
3. ✅ Auto-synchronized with UI
4. ✅ Real-time updates everywhere
```

## 🔍 Troubleshooting

See `TROUBLESHOOTING.md` for common issues and solutions.