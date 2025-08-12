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
import chatRoutes, { setSocketIOInstance } from './routes/chat';
import { BatonMCPServer } from './mcp/server/index';
import { chatService } from './services/chat.service';
import { PrismaClient } from '@prisma/client';
import { getMessageStorageService } from './services/message-storage.service';

// Initialize Prisma client and message storage service
const prisma = new PrismaClient();
const messageStorage = getMessageStorageService(prisma);

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Initialize the Socket.IO instance for chat routes
setSocketIOInstance(io);

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

  // Conversation room management for prompt targeting
  socket.on('join-conversation', (conversationId: string) => {
    socket.join(`conversation-${conversationId}`);
    console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
  });
  
  socket.on('leave-conversation', (conversationId: string) => {
    socket.leave(`conversation-${conversationId}`);
    console.log(`Socket ${socket.id} left conversation ${conversationId}`);
  });

  // New WebSocket handlers for bridge communication
  // Chat message handling with database persistence
  socket.on('chat:send-message', async (data) => {
    console.log(`💬 Received chat:send-message from ${socket.id}:`, data.requestId);
    try {
      const { conversationId, content, requestId, sessionId, allowedTools, workingDirectory, permissionMode, attachments } = data;
      
      if (!conversationId || !content || !requestId) {
        socket.emit('chat:error', {
          requestId: requestId || 'unknown',
          error: 'Missing required fields: conversationId, content, requestId'
        });
        return;
      }

      // 1. Check session validation for existing conversations
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { claudeSessionId: true, id: true }
      });

      if (!conversation) {
        socket.emit('chat:error', {
          requestId,
          error: 'Conversation not found'
        });
        return;
      }

      // If conversation has a session ID, require it in the message
      if (conversation.claudeSessionId && !sessionId) {
        console.log(`🚫 Session validation failed - conversation ${conversationId} has session ${conversation.claudeSessionId} but message has no sessionId`);
        socket.emit('chat:error', {
          requestId,
          error: 'Session ID required for this conversation. Please refresh the page.',
          sessionRequired: true,
          existingSessionId: conversation.claudeSessionId
        });
        return;
      }

      // If conversation has a session ID, validate it matches
      if (conversation.claudeSessionId && sessionId && conversation.claudeSessionId !== sessionId) {
        console.log(`🚫 Session mismatch - expected ${conversation.claudeSessionId} but got ${sessionId}`);
        socket.emit('chat:error', {
          requestId,
          error: 'Session ID mismatch. Please refresh the page.',
          sessionRequired: true,
          existingSessionId: conversation.claudeSessionId
        });
        return;
      }

      console.log(`✅ Session validation passed for conversation ${conversationId}${sessionId ? ` with session ${sessionId}` : ' (first message)'}`);

      // 2. Store user message in database
      console.log(`💾 Storing user message for conversation ${conversationId}`);
      const userMessage = await messageStorage.createUserMessage(conversationId, content, attachments, sessionId);
      console.log(`✅ User message stored with ID: ${userMessage.id}`);

      // 3. Create assistant message placeholder
      console.log(`💾 Creating assistant message placeholder for conversation ${conversationId}`);
      const assistantMessage = await messageStorage.createAssistantMessagePlaceholder(conversationId);
      console.log(`✅ Assistant placeholder created with ID: ${assistantMessage.id}`);

      // 4. Store request mapping for streaming updates
      if (!(global as any).activeRequests) {
        (global as any).activeRequests = new Map();
      }
      (global as any).activeRequests.set(requestId, {
        assistantMessageId: assistantMessage.id,
        conversationId,
        userMessageId: userMessage.id
      });

      // 5. Forward to bridge service if connected
      const bridgeSockets = await io.in('claude-bridge').fetchSockets();
      if (bridgeSockets && bridgeSockets.length > 0) {
        // Forward to bridge service
        bridgeSockets[0].emit('claude:execute', {
          message: content,
          requestId,
          conversationId,
          sessionId,
          allowedTools,
          workingDirectory,
          permissionMode: permissionMode || 'default'
        });
        console.log(`📤 Forwarded chat request ${requestId} to bridge service`);
      } else {
        socket.emit('chat:error', {
          requestId,
          error: 'No bridge service connected'
        });
      }
    } catch (error) {
      console.error('❌ Error handling chat:send-message:', error);
      socket.emit('chat:error', {
        requestId: data?.requestId || 'unknown',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Permission handling
  socket.on('permission:get-mode', async (data, callback) => {
    try {
      const { conversationId } = data;
      // Get conversation permission mode from database
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true }
      });
      
      const metadata = conversation?.metadata as any || {};
      const permissionMode = metadata.permissionMode || 'default';
      
      callback({ permissionMode });
    } catch (error) {
      console.error('❌ Error getting permission mode:', error);
      callback({ permissionMode: 'default' });
    }
  });

  socket.on('permission:check', async (data, callback) => {
    try {
      const { conversationId, toolName } = data;
      // Check if permission exists in database
      const permission = await prisma.conversationPermission.findFirst({
        where: {
          conversationId,
          toolName,
          status: 'granted',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      });
      
      callback({ hasPermission: !!permission });
    } catch (error) {
      console.error('❌ Error checking permission:', error);
      callback({ hasPermission: false });
    }
  });

  socket.on('permission:request', async (data) => {
    console.log(`🔐 Received permission request from bridge:`, data.promptId, 'with session ID:', data.sessionId);
    // Emit to frontend clients in the conversation room with session ID
    io.to(`conversation-${data.conversationId}`).emit('interactive_prompt', {
      promptId: data.promptId,
      conversationId: data.conversationId,
      sessionId: data.sessionId, // Forward session ID to frontend
      type: data.type,
      title: data.title,
      message: data.message,
      options: data.options,
      context: data.context,
      toolName: data.toolName,
      riskLevel: data.riskLevel,
      timestamp: Date.now()
    });
  });

  socket.on('plan:review-request', async (data) => {
    console.log(`📋 Received plan review request from bridge:`, data.promptId);
    // Emit to frontend clients in the conversation room
    io.to(`conversation-${data.conversationId}`).emit('plan_review', {
      planReviewId: data.promptId,
      conversationId: data.conversationId,
      type: data.type,
      title: data.title,
      message: data.message,
      planContent: data.planContent,
      options: data.options,
      context: data.context,
      timestamp: Date.now()
    });
  });

  socket.on('permission:escalate', async (data) => {
    console.log(`📢 Received permission escalation from bridge:`, data.promptId);
    // Forward escalation to frontend clients
    io.to(`conversation-${data.conversationId || 'unknown'}`).emit('permission_escalation', {
      promptId: data.promptId,
      stage: data.stage,
      toolName: data.toolName,
      riskLevel: data.riskLevel,
      escalationType: data.escalationType,
      message: `${data.escalationType.toUpperCase()}: Permission still needed for ${data.toolName}`,
      timestamp: data.timestamp
    });
  });

  // Handle responses from frontend back to bridge
  socket.on('permission:respond', async (data) => {
    console.log(`📝 Received permission response from frontend:`, data.promptId);
    // Forward to bridge service
    const bridgeSockets = await io.in('claude-bridge').fetchSockets();
    if (bridgeSockets && bridgeSockets.length > 0) {
      bridgeSockets[0]?.emit('permission:response', {
        promptId: data.promptId,
        selectedOption: data.selectedOption,
        label: data.label,
        ...data
      });
    }
  });

  socket.on('plan:review-respond', async (data) => {
    console.log(`📋 Received plan review response from frontend:`, data.promptId);
    // Forward to bridge service  
    const bridgeSockets = await io.in('claude-bridge').fetchSockets();
    if (bridgeSockets && bridgeSockets.length > 0) {
      bridgeSockets[0]?.emit('plan:review-response', {
        promptId: data.promptId,
        decision: data.decision,
        feedback: data.feedback,
        editedPlan: data.editedPlan,
        ...data
      });
    }
  });

  socket.on('conversation:check', async (data, callback) => {
    try {
      const { conversationId } = data;
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      
      callback({ exists: !!conversation });
    } catch (error) {
      console.error('❌ Error checking conversation:', error);
      callback({ exists: false });
    }
  });

  socket.on('conversation:create', async (data, callback) => {
    try {
      const { projectId, userId, title } = data;
      
      if (!projectId) {
        callback({ success: false, error: 'Project ID is required' });
        return;
      }
      
      const conversation = await prisma.conversation.create({
        data: {
          projectId,
          userId: userId || 'user_default',
          title: title || 'New Conversation',
          model: 'claude-code-headless',
        },
        include: {
          project: true,
        },
      });
      
      // Emit event for real-time updates
      socket.to(`project-${projectId}`).emit('conversation:created', conversation);
      
      console.log(`✅ Created conversation ${conversation.id} for project ${projectId} via WebSocket`);
      callback({ success: true, conversation });
    } catch (error) {
      console.error('❌ Error creating conversation via WebSocket:', error);
      callback({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Handle prompt acknowledgments from frontend
  socket.on('prompt_received_confirmation', (data: any) => {
    const { promptId, deliveryId, conversationId, timestamp, clientInfo } = data;
    
    console.log(`✅ Received prompt acknowledgment from ${socket.id}:`, {
      promptId,
      deliveryId,
      conversationId,
      clientInfo: clientInfo?.userAgent ? clientInfo.userAgent.substring(0, 50) + '...' : 'unknown'
    });
    
    // Forward acknowledgment to prompt delivery service
    try {
      const { promptDeliveryService } = require('./routes/chat');
      if (promptDeliveryService && promptDeliveryService.acknowledgePrompt) {
        promptDeliveryService.acknowledgePrompt(promptId, {
          ...clientInfo,
          socketId: socket.id,
          deliveryId,
          method: 'websocket',
          timestamp
        });
      }
    } catch (error) {
      console.warn('⚠️ Failed to forward acknowledgment to delivery service:', error);
    }
    
    // Send confirmation back to client
    socket.emit('acknowledgment_confirmed', { 
      promptId, 
      deliveryId, 
      confirmed: true, 
      timestamp: Date.now() 
    });
  });
  
  // Bridge service connection
  socket.on('claude-bridge:connect', () => {
    socket.join('claude-bridge');
    console.log(`🌉 Claude Code bridge connected: ${socket.id}`);
    
    // Send any pending requests
    const pendingRequests = chatService.getPendingRequests();
    if (pendingRequests.length > 0) {
      socket.emit('chat:pending', pendingRequests);
    }
  });

  // Handle bridge responses with database persistence
  socket.on('claude:stream', async (data) => {
    console.log(`📡 Received claude:stream from bridge for ${data.requestId}`);
    
    try {
      // Get request mapping to find conversation
      const requestInfo = (global as any).activeRequests?.get(data.requestId);
      if (!requestInfo) {
        console.warn(`⚠️ No request mapping found for ${data.requestId} - likely late-arriving event after completion`);
        // Still forward to frontend even without database storage
        io.emit('chat:stream-response', data);
        return;
      }

      // Check if request is already completed (but still in grace period)
      if (requestInfo.completed) {
        console.log(`📦 Received late stream event for completed request ${data.requestId} - forwarding to frontend`);
        // Still forward to frontend but skip database operations
        io.emit('chat:stream-response', { 
          ...data, 
          conversationId: requestInfo?.conversationId 
        });
        return;
      }

      // Store Claude Code SDK message directly in database with new format
      if (data.type === 'claude_json' && data.data) {
        // For assistant messages, handle both new messages and streaming updates
        if (data.data.type === 'assistant') {
          const assistantMessageId = data.data.message?.id;
          
          if (assistantMessageId && requestInfo.assistantMessageId) {
            // This is a streaming update to existing assistant message
            console.log(`🔄 Updating streaming assistant message for conversation ${requestInfo.conversationId}`);
            
            // Extract content from Claude SDK message
            let content = '';
            if (data.data.message?.content) {
              if (Array.isArray(data.data.message.content)) {
                content = data.data.message.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text)
                  .join('');
              } else if (typeof data.data.message.content === 'string') {
                content = data.data.message.content;
              }
            }
            
            // Update existing assistant message with streaming content
            const isComplete = data.data.message?.usage !== undefined; // Message is complete when usage is provided
            await messageStorage.updateAssistantMessageStreaming(
              requestInfo.assistantMessageId,
              content,
              isComplete,
              data.data.session_id
            );
            console.log(`✅ Streaming assistant message updated (complete: ${isComplete})`);
          } else {
            // Create new message with Claude SDK format
            console.log(`💾 Creating new Claude assistant message for conversation ${requestInfo.conversationId}`);
            const newMessage = await messageStorage.createClaudeSDKMessage(requestInfo.conversationId, data);
            
            // Update request mapping to track this message for future streaming updates
            if (newMessage && (global as any).activeRequests.has(data.requestId)) {
              const requestMapping = (global as any).activeRequests.get(data.requestId);
              requestMapping.assistantMessageId = newMessage.id;
              (global as any).activeRequests.set(data.requestId, requestMapping);
            }
            
            console.log(`✅ Claude assistant message created successfully`);
          }
          
          // Update conversation session ID if provided and broadcast to frontend
          if (data.data.session_id) {
            await messageStorage.updateConversationSession(requestInfo.conversationId, data.data.session_id);
            
            // Broadcast session ID availability to frontend clients in conversation room
            console.log(`🔗 Broadcasting session ID ${data.data.session_id} for conversation ${requestInfo.conversationId}`);
            io.to(`conversation-${requestInfo.conversationId}`).emit('chat:session-id-available', {
              conversationId: requestInfo.conversationId,
              sessionId: data.data.session_id,
              timestamp: Date.now()
            });
          }
        }
        // For result messages, also store them for completeness
        else if (data.data.type === 'result') {
          console.log(`💾 Storing Claude result message for conversation ${requestInfo.conversationId}`);
          await messageStorage.createClaudeSDKMessage(requestInfo.conversationId, data);
          console.log(`✅ Claude result message stored successfully`);
        }
      }

      // Always forward to frontend for real-time updates with conversation ID
      const frontendMessage = { 
        ...data, 
        conversationId: requestInfo?.conversationId 
      };
      io.emit('chat:stream-response', frontendMessage);
      console.log(`📤 Forwarded claude:stream to frontend clients`);

    } catch (error) {
      console.error(`❌ Error in claude:stream handler for ${data.requestId}:`, error);
      
      // Forward error to frontend
      io.emit('chat:error', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : 'Stream processing error'
      });
    }
  });

  socket.on('claude:complete', async (data) => {
    console.log(`✅ Received claude:complete from bridge for ${data.requestId}`);
    
    try {
      // Get request mapping but delay cleanup to handle late-arriving stream events
      const requestInfo = (global as any).activeRequests?.get(data.requestId);
      if (requestInfo) {
        console.log(`🏁 Marking request ${data.requestId} as completed, will cleanup in 5 seconds`);
        
        // Mark as completed but don't delete yet
        requestInfo.completed = true;
        requestInfo.completedAt = Date.now();
        
        // Schedule delayed cleanup to handle late-arriving claude:stream events
        setTimeout(() => {
          if ((global as any).activeRequests?.has(data.requestId)) {
            console.log(`🧹 Delayed cleanup of request mapping for ${data.requestId}`);
            (global as any).activeRequests.delete(data.requestId);
          }
        }, 5000); // 5 second grace period for late events
        
        console.log(`✅ Request ${data.requestId} completed successfully`);
      }
    } catch (error) {
      console.error(`❌ Error in claude:complete handler for ${data.requestId}:`, error);
    }

    // Forward completion event to frontend clients
    io.emit('chat:message-complete', {
      requestId: data.requestId,
      sessionId: data.sessionId || data.data?.session_id,
      timestamp: data.timestamp || Date.now()
    });
  });

  socket.on('claude:error', async (data) => {
    console.log(`❌ Received claude:error from bridge for ${data.requestId}`);
    
    try {
      // Clean up request mapping and mark message as failed
      const requestInfo = (global as any).activeRequests?.get(data.requestId);
      if (requestInfo) {
        console.log(`🧹 Cleaning up failed request mapping for ${data.requestId}`);
        (global as any).activeRequests.delete(data.requestId);
        
        // Mark assistant message as failed
        await messageStorage.markMessageFailed(requestInfo.assistantMessageId, data.error);
        console.log(`❌ Assistant message ${requestInfo.assistantMessageId} marked as failed`);
      }
    } catch (error) {
      console.error(`❌ Error in claude:error handler for ${data.requestId}:`, error);
    }

    // Forward to frontend clients
    io.emit('chat:error', {
      requestId: data.requestId,
      error: data.error,
      timestamp: data.timestamp
    });
  });

  socket.on('claude:aborted', async (data) => {
    console.log(`⏹️ Received claude:aborted from bridge for ${data.requestId}`);
    
    try {
      // Clean up request mapping and mark message as failed
      const requestInfo = (global as any).activeRequests?.get(data.requestId);
      if (requestInfo) {
        console.log(`🧹 Cleaning up aborted request mapping for ${data.requestId}`);
        (global as any).activeRequests.delete(data.requestId);
        
        // Mark assistant message as failed due to abort
        await messageStorage.markMessageFailed(requestInfo.assistantMessageId, 'Request was aborted');
        console.log(`⏹️ Assistant message ${requestInfo.assistantMessageId} marked as aborted`);
      }
    } catch (error) {
      console.error(`❌ Error in claude:aborted handler for ${data.requestId}:`, error);
    }

    // Forward to frontend clients  
    io.emit('chat:aborted', {
      requestId: data.requestId,
      timestamp: data.timestamp
    });
  });

  // Legacy chat bridge support for backward compatibility
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
    const { messageId, content, isComplete, error, toolUsages } = data;
    console.log(`Chat bridge response for message ${messageId}`);
    
    // Log tool usage if present
    if (toolUsages && toolUsages.length > 0) {
      console.log(`Tool usages for message ${messageId}:`, toolUsages.map((t: any) => t.name));
    }
    
    const result = await chatService.processBridgeResponse(
      messageId,
      content,
      isComplete,
      error,
      toolUsages
    );
    
    // Broadcast to all clients including tool usage and conversationId
    io.emit('message:updated', { 
      messageId, 
      content, 
      isComplete,
      error,
      toolUsages,
      conversationId: result.conversationId
    });
  });
  
  // Handle interactive prompts from chat bridge
  socket.on('interactive_prompt', (data: any) => {
    console.log(`📡 Received interactive prompt from chat bridge: ${data.promptId}`);
    console.log(`🔔 Broadcasting to all frontend clients`);
    
    // Broadcast to all frontend clients
    io.emit('interactive_prompt', data);
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