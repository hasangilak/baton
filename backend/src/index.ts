import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import mcpRoutes from './routes/mcp';
import claudeTodosRoutes from './routes/claude-todos';
import plansRoutes from './routes/plans';
import claudeRoutes from './routes/claude';
import chatRoutes from './routes/chat';
import { BatonMCPServer } from './mcp/server/index';
import { chatService } from './services/chat.service';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Initialize MCP server for SSE transport with WebSocket support
const mcpServer = new BatonMCPServer(io);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
  // Expose MCP session header for SSE clients
  exposedHeaders: ['Mcp-Session-Id']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Static files for chat uploads
app.use('/uploads/chat', express.static('uploads/chat'));

// Routes
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/claude-todos', claudeTodosRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/claude', claudeRoutes);
app.use('/api/chat', chatRoutes);

// MCP SSE Transport Routes
app.get('/mcp/sse', async (req, res) => {
  console.log('📡 SSE connection request received');
  try {
    const transport = await mcpServer.createSSETransport(req, res, '/mcp/messages');
    console.log(`✅ SSE connection established with session: ${transport.sessionId}`);
    
    // Set up cleanup on connection close
    req.on('close', async () => {
      console.log(`🔌 SSE connection closed for session: ${transport.sessionId}`);
      await transport.close();
    });
  } catch (error) {
    console.error('❌ Error establishing SSE connection:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to establish SSE connection'
        },
        id: null
      });
    }
  }
});

app.post('/mcp/messages', (req, _res, next) => {
  // Set default Origin header for Claude Code compatibility if missing
  if (!req.headers.origin) {
    req.headers.origin = 'http://localhost:3001';
  }
  next();
}, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  console.log(`📨 MCP message received for session: ${sessionId}`);
  
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Missing sessionId query parameter'
      },
      id: null
    });
    return;
  }

  try {
    await mcpServer.handleSSEMessage(req, res, sessionId, req.body);
  } catch (error) {
    console.error(`❌ Error handling MCP message for session ${sessionId}:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'baton-backend'
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-project', (projectId: string) => {
    socket.join(`project-${projectId}`);
    console.log(`Socket ${socket.id} joined project ${projectId}`);
  });
  
  socket.on('leave-project', (projectId: string) => {
    socket.leave(`project-${projectId}`);
    console.log(`Socket ${socket.id} left project ${projectId}`);
  });
  
  // Chat bridge support
  socket.on('chat-bridge:connect', () => {
    socket.join('chat-bridge');
    console.log(`Chat bridge connected: ${socket.id}`);
    
    // Send any pending requests
    const pendingRequests = chatService.getPendingRequests();
    if (pendingRequests.length > 0) {
      socket.emit('chat:pending', pendingRequests);
    }
  });
  
  socket.on('chat-bridge:response', async (data: any) => {
    const { messageId, content, isComplete, error } = data;
    console.log(`Chat bridge response for message ${messageId}`);
    
    await chatService.processBridgeResponse(
      messageId,
      content,
      isComplete,
      error
    );
    
    // Broadcast to all clients
    io.emit('message:updated', { 
      messageId, 
      content, 
      isComplete,
      error 
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Listen for new chat requests to forward to bridge
chatService.on('bridge_request', (request) => {
  // Send to all connected chat bridges
  io.to('chat-bridge').emit('chat:request', request);
});

// Error handling
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Baton backend server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
});

export { io };