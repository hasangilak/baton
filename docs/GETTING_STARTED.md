# Getting Started with Baton

Welcome to Baton! This guide will get you up and running with Baton's AI-powered task management system and Claude Code integration in just a few minutes.

## 🚀 Quick Setup (One Command)

Baton uses Docker for the fastest, most reliable setup experience:

```bash
# Clone and start everything
git clone <repository-url>
cd baton
docker compose up -d
```

**That's it!** Baton is now running with:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001  
- **MCP Server**: http://localhost:3002 (WebSocket)
- **Database**: PostgreSQL on port 5432

## 📱 Access Baton

### Web Interface
- **Main App**: http://localhost:5173
- **Chat Interface**: http://localhost:5173/chat (Claude Code WebUI)
- **Health Check**: http://localhost:3001/health

### First Look
The system starts with a demo project and sample tasks so you can explore immediately.

## 🤖 Claude Code Integration

Baton offers two powerful ways to integrate with Claude Code:

### Option 1: WebUI Chat Interface (Recommended)

**Prerequisites**: [Claude Code](https://claude.ai/code) installed locally

**Setup Steps:**

1. **Ensure Baton is Running**
   ```bash
   # Check all services are up
   docker compose ps
   ```

2. **Start the Bridge Handler**
   ```bash
   # This runs outside Docker and connects to your local Claude Code
   cd baton
   bun run scripts/bridge.ts
   ```

3. **Open Chat Interface**
   ```bash
   open http://localhost:5173/chat
   ```

**Features:**
- 🎨 Beautiful Claude-style dark theme
- 📎 File upload support (code, images, documents - up to 25MB)
- 💬 Real-time streaming responses
- 🛡️ Interactive permission system
- 📊 Usage analytics and session persistence

### Option 2: MCP Server Integration

**Prerequisites**: [Claude Code](https://claude.ai/code) with MCP support

**Connection URL**: The MCP server is automatically available at:
- **WebSocket**: `ws://localhost:3002`
- **STDIO**: Available via Docker exec

See [MCP_SERVER_GUIDE.md](./MCP_SERVER_GUIDE.md) for detailed MCP configuration.

## 🔧 Verify Installation

### Check Services
```bash
# All services should show "Up" status
docker compose ps

# Check service health
curl http://localhost:3001/health
curl http://localhost:5173
```

### Test Chat Integration
1. Start bridge: `bun run scripts/bridge.ts`
2. Open http://localhost:5173/chat  
3. Send a message like "Hello, can you help me create a task?"

### Test MCP Server
```bash
# Test MCP server connection
curl -s http://localhost:3002 || echo "MCP WebSocket server running"
```

## 🛠️ Development Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services  
docker compose down

# Reset database (careful!)
docker compose down -v && docker compose up -d
```

## 📚 Next Steps

**For Basic Usage:**
- Explore the web interface at http://localhost:5173
- Create your first project and tasks
- Try the chat interface for AI assistance

**For Claude Code Integration:**
- Read [CLAUDE_CODE_INTEGRATION.md](./CLAUDE_CODE_INTEGRATION.md) for complete setup
- Configure MCP server with [MCP_SERVER_GUIDE.md](./MCP_SERVER_GUIDE.md)  
- Check [TECHNICAL_REFERENCE.md](./TECHNICAL_REFERENCE.md) for advanced topics

**For Development:**
- See [TECHNICAL_REFERENCE.md](./TECHNICAL_REFERENCE.md) for API documentation
- Check `backend/prisma/schema.prisma` for database structure
- Explore `frontend/src/components/` for UI components

## ❓ Troubleshooting

### Common Issues

**Services won't start:**
```bash
# Check Docker is running
docker --version

# Check ports aren't in use
netstat -tulpn | grep -E "(3001|3002|5173|5432)"

# Restart services
docker compose restart
```

**Chat interface not responding:**
```bash
# Check bridge is running
ps aux | grep bridge.ts

# Restart bridge
bun run scripts/bridge.ts
```

**Claude Code not found:**
```bash
# Verify Claude Code installation
claude --version

# Install if missing
npm install -g @anthropic-ai/claude-code
```

### Get Help

- Check service logs: `docker compose logs [service-name]`  
- View bridge logs: Bridge outputs to console
- Ensure all prerequisites are installed
- Verify ports aren't blocked by firewall

## 🎯 Summary

You now have Baton running with:
- ✅ Task management system (web interface)
- ✅ AI chat interface (if you ran bridge.ts)  
- ✅ MCP server (for programmatic AI integration)
- ✅ Complete development environment

**Start creating projects, managing tasks, and integrating with Claude Code!**