# Claude Code Bridge Service

A lightweight bridge service that connects the Docker backend with local Claude Code SDK execution.

## Architecture

```
Frontend (/chat UI)
    ↓ HTTP requests
Docker Backend (port 3001)
    ↓ HTTP requests  
Bridge Service (port 8080) ← Runs on local machine
    ↓ executes
Claude Code SDK ← Local machine execution
```

## Quick Start

### 1. Start Docker Backend
```bash
# From project root
docker compose up -d
```

### 2. Start Bridge Service
```bash
# From scripts directory
./start-bridge.sh

# Or manually:
bun run bridge.ts --port 8080 --backend http://localhost:3001
```

### 3. Use Frontend
Open `http://localhost:5173/chat` and send messages - they'll be executed via the bridge!

## How It Works

### Request Flow
1. **Frontend** sends message to `/api/chat/messages/stream-bridge`
2. **Backend** forwards request to bridge at `http://localhost:8080/execute`  
3. **Bridge** executes Claude Code SDK locally
4. **Bridge** streams responses back to backend via Server-Sent Events
5. **Backend** forwards responses to frontend
6. **Frontend** displays Claude responses in real-time

### Permission System
- Bridge requests permissions from backend when Claude needs tools
- Backend creates interactive prompts in database
- Frontend shows permission UI to user
- User response is stored and bridge receives permission result
- Bridge allows/denies Claude tool usage based on user response

### Session Management  
- Bridge preserves Claude session IDs between requests
- Sessions stored in backend database for conversation continuity
- Context preserved across multiple messages in same conversation

## API Endpoints

### Bridge Service (port 8080)
- `GET /health` - Health check
- `POST /execute` - Execute Claude Code request (Server-Sent Events)
- `POST /abort/:requestId` - Abort active request
- `GET /status` - Get active request status

### Backend Integration (port 3001)
- `POST /api/chat/messages/stream-bridge` - New streaming endpoint
- `POST /api/chat/messages/abort-bridge/:requestId` - Abort bridge request
- `GET /api/chat/prompts/:promptId` - Check prompt status (for polling)

## Configuration

### Bridge Service
```bash
bun run bridge.ts --port 8080 --backend http://localhost:3001
```

### Backend Environment
Set `BRIDGE_URL` environment variable (defaults to `http://localhost:8080`)

### Frontend Configuration
The frontend automatically uses the new bridge endpoint when sending messages.

## Comparison with Terminal Usage

| Feature | Terminal (`ultimate.ts`) | Web UI (Bridge) |
|---------|--------------------------|------------------|
| Claude Execution | ✅ Direct local | ✅ Via bridge |
| Permissions | ✅ Terminal prompts | ✅ Web UI prompts |
| Sessions | ✅ File-based | ✅ Database-based |
| File Upload | ❌ | ✅ |
| Collaboration | ❌ | ✅ Team access |
| Analytics | ✅ Basic | ✅ Full dashboard |

## Troubleshooting

### Bridge Not Starting
- Ensure Bun is installed: `bun --version`
- Check if port 8080 is available: `lsof -i :8080`
- Check Claude Code SDK is installed: `claude --version`

### Backend Connection Issues
- Verify Docker backend is running: `docker compose ps`
- Check backend logs: `docker compose logs backend`
- Ensure bridge URL is correct in backend environment

### Permission Prompts Not Working
- Check WebSocket connection in browser dev tools
- Verify interactive prompts in database: Check `interactive_prompts` table
- Check backend permission endpoints are responding

### Session Continuity Issues
- Check `conversations` table for `claudeSessionId` values
- Bridge logs show session capture: Look for "🆔 New session ID captured"
- Backend stores sessions: Check database for session updates

## Development

### Bridge Development
```bash
# Watch mode for development
bun --watch bridge.ts

# Debug logging
DEBUG=1 bun run bridge.ts
```

### Testing
```bash
# Test bridge health
curl http://localhost:8080/health

# Test bridge execution (manual)
curl -X POST http://localhost:8080/execute \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","requestId":"test","conversationId":"test"}'
```

## Security

- Bridge runs locally with same permissions as user
- All tool permissions require explicit user approval
- No automatic tool allowances for dangerous operations
- Session data encrypted in database
- Bridge-to-backend communication over localhost only

## Benefits

✅ **Separation of Concerns**: Terminal users keep `ultimate.ts`, web users get bridge  
✅ **Local Performance**: Claude Code runs on local machine (fast)  
✅ **Rich Web UI**: File uploads, permission management, team collaboration  
✅ **Session Persistence**: Database-backed conversation history  
✅ **Real-time Permissions**: Interactive prompts via WebSocket  
✅ **Scalability**: Bridge can handle multiple concurrent requests  

This bridge architecture gives you the best of both worlds: the power of local Claude Code execution with the convenience and features of a modern web interface.