# Baton MCP Server - Claude Code Integration Troubleshooting Guide

This guide provides comprehensive troubleshooting steps for resolving connectivity issues between Claude Code and the Baton MCP server.

## Quick Diagnostic Commands

Before diving into detailed troubleshooting, run these quick diagnostic commands:

```bash
# Check if services are running
docker ps

# Run comprehensive diagnostics
./scripts/monitor-mcp.sh --verbose

# Test specific MCP connection
node scripts/test-mcp-connection.js --verbose

# Check Claude Code MCP status
claude mcp list
```

## Common Issues and Solutions

### 1. Claude Code Shows "Failed to Connect" for Baton MCP

**Symptoms:**
```
baton: http://localhost:3001/mcp/sse (SSE) - ✗ Failed to connect
```

**Troubleshooting Steps:**

#### Step 1: Verify Docker Services
```bash
# Check if all containers are running
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Expected output should show:
# baton-backend-dev     Up X minutes     0.0.0.0:3001->3001/tcp
# baton-mcp-server-dev  Up X minutes     0.0.0.0:3002->3002/tcp
# baton-postgres-dev    Up X minutes     0.0.0.0:5432->5432/tcp
```

**If containers are not running:**
```bash
# Start the development stack
docker compose -f docker-compose.dev.yml up -d

# Check logs for startup errors
docker logs baton-backend-dev
docker logs baton-mcp-server-dev
```

#### Step 2: Test Backend Health
```bash
# Test backend health endpoint
curl -v http://localhost:3001/health

# Expected: HTTP 200 OK with JSON response
```

**If health check fails:**
- Check if port 3001 is available: `lsof -i :3001`
- Check backend logs: `docker logs baton-backend-dev`
- Restart backend: `docker restart baton-backend-dev`

#### Step 3: Test MCP SSE Endpoint
```bash
# Test SSE endpoint directly
curl -v -H "Accept: text/event-stream" http://localhost:3001/mcp/sse

# Expected: HTTP 200 OK with SSE headers
```

**If SSE endpoint fails:**
- Check for CORS issues in backend logs
- Verify SSE endpoint is registered in backend routes
- Test with browser developer tools

#### Step 4: Re-register MCP Server
```bash
# Remove existing registration
claude mcp remove baton

# Re-add with SSE transport
claude mcp add baton --transport sse http://localhost:3001/mcp/sse

# Alternatively, try STDIO transport
claude mcp add baton-stdio -- docker exec -i baton-backend-dev npm run mcp:stdio

# Verify registration
claude mcp list
```

### 2. Docker Services Won't Start

**Symptoms:**
- Containers exit immediately
- Port binding errors
- Database connection failures

#### Solution 1: Port Conflicts
```bash
# Check for port conflicts
lsof -i :3001  # Backend
lsof -i :3002  # MCP Server
lsof -i :5432  # PostgreSQL
lsof -i :5173  # Frontend

# Kill conflicting processes if necessary
sudo kill -9 <PID>
```

#### Solution 2: Docker Network Issues
```bash
# Clean up Docker networks
docker network prune

# Rebuild containers
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up -d
```

#### Solution 3: Database Issues
```bash
# Reset database
docker exec baton-backend-dev npm run db:reset

# Check database connection
docker exec baton-postgres-dev psql -U baton_user -d baton_dev -c "SELECT 1;"
```

### 3. MCP Protocol Errors

**Symptoms:**
- JSON-RPC errors
- Invalid method responses
- Tool execution failures

#### Diagnostic Commands
```bash
# Test STDIO transport directly
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | docker exec -i baton-backend-dev npm run mcp:stdio

# Test specific tools
node scripts/test-mcp-connection.js --test tools --verbose
```

#### Common Fixes
1. **Protocol Version Mismatch**: Ensure MCP protocol version is `2024-11-05`
2. **Missing Capabilities**: Check that client capabilities are properly declared
3. **Tool Registration**: Verify all tools are properly registered in the MCP server

### 4. Claude Code Todo Integration Issues

**Symptoms:**
- TodoRead returns empty results
- TodoWrite doesn't persist todos
- Sync operations fail

#### Troubleshooting Steps

1. **Check Database Schema**
```bash
# Verify claude_todos table exists
docker exec baton-postgres-dev psql -U baton_user -d baton_dev -c "\d claude_todos"

# Check for todos
docker exec baton-postgres-dev psql -U baton_user -d baton_dev -c "SELECT * FROM claude_todos LIMIT 5;"
```

2. **Test MCP Tools Directly**
```bash
# Test TodoRead tool
node scripts/test-mcp-connection.js --test tools

# Check backend logs for tool execution
docker logs baton-backend-dev | grep -i todo
```

3. **Verify Project Context**
```bash
# Check project detection
ls -la .baton-project

# Test workspace context
node scripts/test-mcp-connection.js --verbose | grep -i workspace
```

### 5. Real-time WebSocket Issues

**Symptoms:**
- No real-time updates in frontend
- WebSocket connection failures
- HMR conflicts

#### Solutions

1. **Check WebSocket Connections**
```bash
# Monitor WebSocket connections
./scripts/monitor-mcp.sh --mode continuous

# Check for port conflicts
lsof -i :3001  # Socket.io
lsof -i :5174  # Vite HMR
```

2. **Fix HMR Conflicts**
Ensure `vite.config.ts` has proper HMR configuration:
```typescript
server: {
  hmr: {
    port: 5174,
    host: '0.0.0.0',
    clientPort: 5176,
  }
}
```

## Advanced Debugging

### Enable Debug Logging

1. **Backend Debug Mode**
```bash
# Set debug environment variables
docker exec baton-backend-dev sh -c 'export DEBUG=mcp:* && npm run dev'
```

2. **MCP Server Debug Mode**
```bash
# Enable MCP server debug logging
docker exec baton-mcp-server-dev sh -c 'export DEBUG=mcp:* && npm run mcp:dev:websocket'
```

### Network Debugging

1. **Capture Network Traffic**
```bash
# Monitor HTTP requests to backend
sudo tcpdump -i any -A port 3001

# Monitor WebSocket traffic
sudo tcpdump -i any -A port 3002
```

2. **Test with Different Clients**
```bash
# Test with curl
curl -N -H "Accept: text/event-stream" http://localhost:3001/mcp/sse

# Test with wscat (WebSocket)
npm install -g wscat
wscat -c ws://localhost:3002
```

### Database Debugging

1. **Check Database Logs**
```bash
# PostgreSQL logs
docker logs baton-postgres-dev

# Check slow queries
docker exec baton-postgres-dev psql -U baton_user -d baton_dev -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

2. **Verify Migrations**
```bash
# Check migration status
docker exec baton-backend-dev npx prisma migrate status

# Reset and re-run migrations if needed
docker exec baton-backend-dev npm run db:reset
```

## Performance Optimization

### 1. Database Performance
```bash
# Analyze query performance
docker exec baton-postgres-dev psql -U baton_user -d baton_dev -c "ANALYZE;"

# Check index usage
docker exec baton-postgres-dev psql -U baton_user -d baton_dev -c "SELECT * FROM pg_stat_user_indexes;"
```

### 2. Memory Usage
```bash
# Check container memory usage
docker stats --no-stream

# Optimize Node.js memory settings
docker exec baton-backend-dev sh -c 'export NODE_OPTIONS="--max-old-space-size=2048" && npm run dev'
```

## Monitoring and Alerts

### Continuous Monitoring
```bash
# Run continuous monitoring
./scripts/monitor-mcp.sh --mode continuous --export-logs

# Set up log rotation
logrotate -d /etc/logrotate.d/baton-mcp
```

### Health Checks
```bash
# Create health check script
cat > health-check.sh << 'EOF'
#!/bin/bash
curl -f http://localhost:3001/health || exit 1
curl -f http://localhost:3001/mcp/sse -H "Accept: text/event-stream" || exit 1
EOF

chmod +x health-check.sh
```

## Recovery Procedures

### 1. Complete System Reset
```bash
# Stop all services
docker compose -f docker-compose.dev.yml down

# Remove all containers and volumes
docker compose -f docker-compose.dev.yml down -v

# Clean up Docker system
docker system prune -f

# Rebuild and restart
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up -d

# Reset database
docker exec baton-backend-dev npm run db:reset
```

### 2. Claude Code MCP Reset
```bash
# Remove all MCP servers
claude mcp remove baton
claude mcp remove baton-stdio

# Clear Claude Code cache (if available)
# Location varies by system - check Claude Code documentation

# Re-register MCP server
claude mcp add baton --transport sse http://localhost:3001/mcp/sse
```

## Getting Help

### Collecting Debug Information
Before seeking help, collect this information:

1. **System Information**
```bash
# System details
uname -a
docker --version
node --version

# Container status
docker ps -a
docker logs baton-backend-dev > backend.log
docker logs baton-mcp-server-dev > mcp.log
```

2. **Test Results**
```bash
# Run comprehensive tests
./scripts/monitor-mcp.sh --verbose --export-logs
node scripts/test-mcp-connection.js --verbose --export
```

3. **MCP Configuration**
```bash
# Claude Code MCP status
claude mcp list > claude-mcp-status.txt
claude mcp get baton >> claude-mcp-status.txt
```

### Support Channels
- GitHub Issues: Create issue with debug logs and system information
- Documentation: Check official MCP and Claude Code documentation
- Community: Search existing issues and discussions

## Common Error Messages

| Error Message | Likely Cause | Solution |
|---------------|--------------|----------|
| `Failed to connect` | Service not running | Check Docker containers |
| `Connection timeout` | Network/firewall issue | Check port accessibility |
| `JSON-RPC error` | Protocol mismatch | Verify MCP version compatibility |
| `Database connection failed` | PostgreSQL issue | Check database container |
| `Tool not found` | MCP tool registration issue | Verify tool registration |
| `WebSocket connection failed` | Port conflict | Check WebSocket port availability |

## Preventive Measures

1. **Regular Health Checks**: Set up automated monitoring
2. **Log Rotation**: Prevent disk space issues
3. **Database Maintenance**: Regular VACUUM and ANALYZE
4. **Container Updates**: Keep Docker images updated
5. **Backup Strategy**: Regular database backups

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| MCP Protocol | 2024-11-05 | Latest stable version |
| Node.js | 18+ | LTS recommended |
| Docker | 20+ | For compose v3.8 support |
| PostgreSQL | 15+ | For JSON features |

This troubleshooting guide should resolve most common issues. For complex problems, use the monitoring scripts and collect detailed debug information before seeking additional help.