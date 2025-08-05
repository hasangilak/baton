# Troubleshooting Claude Code + Baton Integration

## 🔍 Common Issues and Solutions

### 1. **Hook Scripts Not Executing**

**Symptoms:**
- Hooks appear configured but don't run
- No log entries in `.claude/baton-session.log`
- Manual project detection still required

**Solutions:**
```bash
# Check hook permissions
ls -la .claude/hooks/
chmod +x .claude/hooks/*.sh

# Test hooks manually
./.claude/hooks/sessionStart.sh
./.claude/hooks/preToolUse.sh mcp__baton__TodoRead "{}"

# Check Claude Code debug output
claude --debug
```

### 2. **Project Context Not Detected**

**Symptoms:**
- `.baton-project` file missing or empty
- Manual `detect_workspace_project` calls still needed
- Error: "projectId is required"

**Solutions:**
```bash
# Manually create project context
echo '{"projectId":"your-project-id"}' > .baton-project

# Check if Baton server is running
curl http://localhost:3001/api/health

# Run SessionStart hook manually
./.claude/hooks/sessionStart.sh

# Check hook logs
tail -f .claude/baton-session.log
```

### 3. **Baton MCP Server Connection Issues**

**Symptoms:**
- MCP tools not available in Claude Code
- Connection timeout errors
- "Server not responding" messages

**Solutions:**
```bash
# Check if Baton MCP server is running
curl http://localhost:3002
docker compose logs mcp-server

# Restart Baton services
docker compose restart

# Check MCP server configuration
cat .claude/settings.json | jq '.mcpServers.baton'

# Test MCP connection directly
cd backend && npm run test:mcp
```

### 4. **Settings Configuration Problems**

**Symptoms:**
- Claude Code doesn't recognize settings
- Hooks not triggering
- MCP server not loading

**Solutions:**
```bash
# Validate settings JSON
jq empty .claude/settings.json

# Check settings location
ls -la .claude/settings.json

# Reset to template
cp claude-code-integration/settings.json .claude/settings.json

# Check Claude Code settings precedence
claude config list
```

### 5. **Permission and Path Issues**

**Symptoms:**
- "Permission denied" errors
- Scripts can't find required tools
- Path-related failures

**Solutions:**
```bash
# Fix permissions
chmod +x .claude/hooks/*.sh
chmod +w .claude/

# Install missing tools
sudo apt-get install jq curl  # Ubuntu/Debian
brew install jq curl          # macOS

# Check PATH
which jq curl node npm

# Use absolute paths in hooks if needed
sed -i 's/jq/\/usr\/bin\/jq/g' .claude/hooks/*.sh
```

### 6. **Synchronization Issues**

**Symptoms:**
- Todos not syncing to Baton
- Plan status not updating
- Missing notifications

**Solutions:**
```bash
# Check PostToolUse hook execution
tail -f .claude/baton-session.log | grep PostToolUse

# Test sync manually
curl -X POST http://localhost:3001/api/claude/sync-todos-to-tasks \
  -H "Content-Type: application/json" \
  -d '{"projectId":"your-project-id"}'

# Verify WebSocket connection
docker compose logs backend | grep WebSocket

# Check sync cache
cat .claude/baton-sync-cache.json | jq '.'
```

### 7. **Database and Backend Issues**

**Symptoms:**
- "Project not found" errors
- Database connection failures
- API endpoints not responding

**Solutions:**
```bash
# Check database status
docker compose ps
docker compose logs postgres

# Reset database
cd backend && npm run db:reset

# Verify API endpoints
curl http://localhost:3001/api/projects
curl http://localhost:3001/api/health

# Check backend logs
docker compose logs backend
```

## 🔧 Debugging Commands

### Check Overall Status
```bash
# System health check
./claude-code-integration/debug/health-check.sh

# View all logs
tail -f .claude/baton-session.log

# Test complete workflow
./claude-code-integration/debug/test-workflow.sh
```

### Hook Debugging
```bash
# Test each hook individually
./.claude/hooks/sessionStart.sh
./.claude/hooks/preToolUse.sh mcp__baton__TodoRead "{}"
./.claude/hooks/postToolUse.sh mcp__baton__TodoWrite '{"success":true}'
./.claude/hooks/userPromptSubmit.sh "Create a plan to implement feature X"

# Check hook execution order
grep -E "(sessionStart|preToolUse|postToolUse)" .claude/baton-session.log
```

### MCP Server Debugging
```bash
# Test MCP server directly
cd backend && node test-claude-integration.js

# Check MCP server logs
docker compose logs mcp-server -f

# List available MCP tools
claude mcp list-tools
```

## 📊 Log Analysis

### Understanding Log Entries

**SessionStart logs:**
```
[2024-01-01 10:00:00] SessionStart: 🚀 Initializing Baton context
[2024-01-01 10:00:01] SessionStart: ✅ Auto-linked to existing project: My Project (proj_123)
```

**PreToolUse logs:**
```
[2024-01-01 10:00:05] PreToolUse: 🔧 Processing Baton tool: mcp__baton__TodoWrite
[2024-01-01 10:00:05] PreToolUse: ✅ Injected projectId 'proj_123' into mcp__baton__TodoWrite
```

**PostToolUse logs:**
```
[2024-01-01 10:00:10] PostToolUse: 📝 Processing TodoWrite operation
[2024-01-01 10:00:10] PostToolUse: ✅ Todo operation successful: 3 todo(s) processed
```

### Common Error Patterns

**Project ID missing:**
```
[ERROR] PreToolUse: ⚠️ No valid projectId in .baton-project
[ERROR] PostToolUse: ⚠️ Cannot get project ID for post-processing
```

**Server connection issues:**
```
[ERROR] SessionStart: ⚠️ Baton server not accessible at http://localhost:3001
[ERROR] curl: (7) Failed to connect to localhost port 3001: Connection refused
```

**Permission issues:**
```
[ERROR] bash: ./.claude/hooks/sessionStart.sh: Permission denied
[ERROR] jq: command not found
```

## 🛠️ Advanced Configuration

### Custom Project Settings
```json
{
  "projectId": "your-project-id",
  "projectName": "My Project",
  "autoSyncTodosToTasks": true,
  "notificationLevel": "verbose",
  "webhookUrl": "https://your-webhook.com/baton",
  "customSettings": {
    "hookTimeout": 15000,
    "retryAttempts": 3,
    "debugMode": true
  }
}
```

### Environment Variable Overrides
```bash
export BATON_API_URL="http://your-custom-host:3001"
export BATON_MCP_PORT="3002"
export CLAUDE_PROJECT_DIR="/path/to/your/project"
export MCP_TIMEOUT=60000
```

### Hook Customization
```bash
# Disable specific hooks
mv .claude/hooks/userPromptSubmit.sh .claude/hooks/userPromptSubmit.sh.disabled

# Custom hook timeout
# Edit .claude/settings.json and modify timeout values

# Custom tool patterns
# Edit hook scripts and modify TOOLS_REQUIRING_PROJECT_ID arrays
```

## 🆘 Getting Help

### Log Collection for Support
```bash
# Collect all relevant logs
tar -czf baton-claude-debug.tar.gz \
  .claude/baton-session.log \
  .claude/settings.json \
  .baton-project \
  .claude/baton-sync-cache.json \
  docker-compose.yml

# Share debug information (remove sensitive data first)
```

### Useful Support Information
- Operating system and version
- Claude Code version
- Node.js and npm versions
- Docker and docker-compose versions
- Exact error messages and log entries
- Steps to reproduce the issue

### Community and Documentation
- Baton GitHub Issues: [Create an issue](https://github.com/your-org/baton/issues)
- Claude Code Documentation: [docs.anthropic.com/claude-code](https://docs.anthropic.com/claude-code)
- MCP Protocol Specification: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## 🔄 Recovery Procedures

### Complete Reset
```bash
# Backup current setup
cp -r .claude .claude.backup

# Remove all integration files
rm -rf .claude/hooks .claude/settings.json .baton-project

# Reinstall from scratch
./claude-code-integration/setup.sh
```

### Partial Reset
```bash
# Reset hooks only
rm -rf .claude/hooks
cp -r claude-code-integration/hooks .claude/
chmod +x .claude/hooks/*.sh

# Reset settings only
cp claude-code-integration/settings.json .claude/settings.json

# Reset project context only
rm .baton-project
./.claude/hooks/sessionStart.sh
```