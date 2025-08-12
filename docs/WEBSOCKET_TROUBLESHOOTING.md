# WebSocket & Message Storage Troubleshooting Guide

This guide helps diagnose and resolve common issues with Baton's WebSocket communication and MongoDB message storage system.

## Quick Diagnostics

### Check All Services Status
```bash
# Verify all Docker containers are running
docker ps

# Check service logs for errors
make logs

# Verify MongoDB connection
make db-check

# Test WebSocket connectivity
curl -f http://localhost:3001/health
```

### Expected Output
```
✅ Frontend: http://localhost:5173
✅ Backend:  http://localhost:3001  
✅ MongoDB:  mongodb://localhost:27017
✅ Bridge:   ws://localhost:8080
```

## Common Issues & Solutions

### 1. Bridge Service Not Connecting

**Symptoms:**
- Chat messages hang in "sending" state
- No Claude responses received
- Frontend shows "No bridge service connected" error

**Diagnosis:**
```bash
# Check if bridge service is running
ps aux | grep bridge

# Check bridge logs
tail -f /tmp/bridge-service.log

# Test bridge WebSocket connection
nc -zv localhost 8080
```

**Solutions:**
```bash
# Start bridge service
bun run scripts/bridge.ts

# If port conflict, use different port
bun run scripts/bridge.ts --port 8081 --backend http://localhost:3001

# Check bridge status from backend logs
docker logs baton-backend-1 -f | grep -i bridge
```

### 2. Messages Not Storing in MongoDB

**Symptoms:**
- Messages appear in UI but not in database
- Conversation history lost on refresh
- Missing message metadata

**Diagnosis:**
```bash
# Check MongoDB connection
docker exec -it baton-mongodb-1 mongosh baton_dev

# Verify messages collection
db.messages.countDocuments()
db.conversations.find().count()

# Check recent messages
db.messages.find().sort({createdAt: -1}).limit(5)
```

**Database Queries:**
```javascript
// Check for failed messages
db.messages.find({status: "failed"})

// Verify message storage pipeline
db.messages.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])

// Check conversation linkage
db.messages.find({conversationId: {$exists: false}})
```

**Solutions:**
```bash
# Restart message storage service
docker restart baton-backend-1

# Check Prisma client sync
make prisma-sync

# Verify MongoDB permissions
docker exec -it baton-mongodb-1 mongosh --eval "db.runCommand({connectionStatus: 1})"
```

### 3. WebSocket Connection Issues

**Symptoms:**
- Frontend shows "Disconnected" status
- Real-time updates not working
- Connection errors in console

**Frontend Diagnostics:**
```javascript
// Open browser console and check:
window.performance.getEntriesByType('navigation')

// Test WebSocket connection manually
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('Connected:', socket.id));
socket.on('disconnect', reason => console.log('Disconnected:', reason));
```

**Backend Diagnostics:**
```bash
# Check WebSocket connections
docker logs baton-backend-1 -f | grep -E "(connected|disconnected)"

# Monitor active connections
curl -s http://localhost:3001/health | jq '.connections'

# Test Socket.IO endpoint
curl -X GET "http://localhost:3001/socket.io/?EIO=4&transport=polling"
```

**Solutions:**
```bash
# Restart frontend dev server
cd frontend && npm run dev

# Clear browser cache and localStorage
# Chrome DevTools: Application > Storage > Clear Storage

# Check CORS configuration
docker logs baton-backend-1 | grep -i cors

# Verify ports are not blocked
netstat -tlnp | grep -E ":3001|:5173|:8080"
```

### 4. Session ID Management Issues

**Symptoms:**
- Context lost between messages
- Session ID not appearing in URL
- Claude doesn't remember conversation history

**Diagnosis:**
```bash
# Check session ID storage
cd backend && npx prisma studio
# Navigate to: conversations table → claudeSessionId field

# Verify session updates in real-time
docker logs baton-backend-1 -f | grep -i "session"
```

**Database Queries:**
```javascript
// Find conversations with session IDs
db.conversations.find({claudeSessionId: {$ne: null}})

// Check session ID updates
db.conversations.find({}, {claudeSessionId: 1, updatedAt: 1}).sort({updatedAt: -1})

// Verify message-session linkage
db.messages.find({sessionId: {$exists: true}}, {sessionId: 1, createdAt: 1})
```

**Solutions:**
```bash
# Restart bridge service to regenerate sessions
pkill -f bridge.ts
bun run scripts/bridge.ts

# Clear conversation state
# In browser: Clear localStorage for localhost:5173

# Force session regeneration
curl -X DELETE http://localhost:3001/api/chat/sessions/clear
```

### 5. Message Streaming Interruptions

**Symptoms:**
- Messages cut off mid-response
- Streaming stops without completion
- Partial content stored

**Diagnosis:**
```bash
# Monitor streaming events
docker logs baton-backend-1 -f | grep -E "(stream|chunk|complete)"

# Check for network timeouts
docker logs baton-bridge-1 -f | grep -i timeout

# Verify request mappings
docker exec -it baton-backend-1 node -e "console.log(Object.keys(global.activeRequests || {}))"
```

**Solutions:**
```bash
# Increase timeout values
# Edit: scripts/bridge-modules/config.ts
export const config = {
  websocketTimeout: 30000,  // Increase from default
  reconnectionDelay: 2000,
  reconnectionAttempts: 10
}

# Clear stuck requests
docker restart baton-backend-1

# Check Claude Code SDK limits
bun run scripts/bridge.ts --debug
```

### 6. Permission System Malfunctions

**Symptoms:**
- Permission prompts not appearing
- Auto-decisions not working correctly
- Tool execution blocked indefinitely

**Diagnosis:**
```bash
# Check interactive prompts
docker logs baton-backend-1 -f | grep -E "(permission|prompt)"

# Verify permission tables
cd backend && npx prisma studio
# Check: interactive_prompts, conversation_permissions
```

**Database Queries:**
```javascript
// Check pending permissions
db.interactive_prompts.find({status: "pending"})

// Verify permission grants
db.conversation_permissions.find({status: "granted"})

// Check timeout patterns
db.interactive_prompts.find({status: "timeout"})
```

**Solutions:**
```bash
# Clear stuck permissions
db.interactive_prompts.updateMany(
  {status: "pending"},
  {$set: {status: "timeout", autoHandler: "cleanup"}}
)

# Reset permission mode
curl -X POST http://localhost:3001/api/chat/conversations/{id}/permission-mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "interactive"}'

# Restart prompt delivery service
docker restart baton-backend-1
```

## Debugging Tools & Commands

### Real-time Monitoring

```bash
# Watch all WebSocket events
docker logs baton-backend-1 -f | grep -E "🔌|💬|📡|🌉"

# Monitor message creation
docker logs baton-backend-1 -f | grep -E "💾|✅|❌"

# Track request flow
docker logs baton-backend-1 -f | grep -E "requestId|claude:execute|claude:stream"

# Bridge service debugging
tail -f /tmp/bridge-service.log | grep -E "ERROR|WARN|execute|stream"
```

### Database Inspection

```bash
# Open MongoDB shell
docker exec -it baton-mongodb-1 mongosh baton_dev

# Message storage health check
db.runCommand({collStats: "messages"})

# Find problematic conversations
db.conversations.find({
  $or: [
    {messages: {$size: 0}},
    {claudeSessionId: null},
    {updatedAt: {$lt: new Date(Date.now() - 24*60*60*1000)}}
  ]
})

# Check message integrity
db.messages.find({
  $or: [
    {content: ""},
    {claudeData: null},
    {conversationId: {$exists: false}}
  ]
})
```

### Performance Analysis

```bash
# WebSocket latency test
time curl -X POST http://localhost:3001/api/chat/test-latency

# Database query performance
db.messages.explain("executionStats").find({conversationId: ObjectId("...")})

# Memory usage monitoring
docker stats baton-backend-1 baton-mongodb-1 --no-stream

# Connection pool status
db.serverStatus().connections
```

## Configuration Tuning

### MongoDB Optimization

```javascript
// Add indexes for better query performance
db.messages.createIndex({conversationId: 1, createdAt: -1})
db.messages.createIndex({sessionId: 1})
db.conversations.createIndex({claudeSessionId: 1})
```

### WebSocket Performance

```typescript
// In backend/src/index.ts
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173" },
  transports: ['websocket'],  // Disable polling for better performance
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 10e6    // 10MB for large messages
});
```

### Bridge Service Tuning

```typescript
// In scripts/bridge-modules/config.ts
export const config = {
  port: 8080,
  backendUrl: 'http://localhost:3001',
  websocketTimeout: 30000,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
  maxConcurrentRequests: 5,
  messageBufferSize: 1024 * 1024  // 1MB buffer
};
```

## Recovery Procedures

### Complete System Reset

```bash
# Stop all services
make docker-down

# Clear persistent data (DANGER: Data loss!)
docker volume rm baton_mongodb-data

# Restart with fresh database
make docker-up
make db-migrate
make db-seed
```

### Selective Recovery

```bash
# Reset WebSocket connections only
docker restart baton-backend-1

# Clear message cache
redis-cli FLUSHDB  # If using Redis for caching

# Regenerate Prisma client
make prisma-sync

# Reset conversation state
curl -X POST http://localhost:3001/api/chat/conversations/reset-active
```

### Data Recovery

```bash
# Export conversations before reset
cd backend && npx prisma db pull
npx prisma db export --file backup.json

# Restore specific conversation
mongoimport --db baton_dev --collection messages --file messages_backup.json

# Verify data integrity after recovery
make db-check
```

## Preventive Measures

### Health Monitoring

```bash
# Set up automated health checks
#!/bin/bash
# health-check.sh
for service in frontend backend mongodb bridge; do
  if ! curl -f http://localhost:3001/health >/dev/null 2>&1; then
    echo "Service $service is down! Restarting..."
    docker restart baton-$service-1
  fi
done
```

### Log Rotation

```bash
# Prevent log files from growing too large
docker run --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 ...
```

### Backup Strategy

```bash
# Daily MongoDB backup
#!/bin/bash
docker exec baton-mongodb-1 mongodump --db baton_dev --out /backup/$(date +%Y%m%d)
```

## Getting Help

If issues persist after following this guide:

1. **Check GitHub Issues**: [Baton Issues](https://github.com/your-org/baton/issues)
2. **Enable Debug Logging**: Set `LOG_LEVEL=DEBUG` in `.env`  
3. **Collect Debug Info**: 
   ```bash
   bash scripts/collect-debug-info.sh > debug-output.txt
   ```
4. **Share Logs**: Provide relevant logs (remove sensitive data)

## Related Documentation

- [WebSocket Architecture](./WEBSOCKET_ARCHITECTURE.md) - Technical deep dive
- [CLAUDE.md](../CLAUDE.md) - Complete development guide
- [MCP Integration](./MCP_INTEGRATION.md) - Model Context Protocol setup