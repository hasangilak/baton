import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { chatService } from '../services/chat.service';
import { io } from '../index';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/chat/');
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/json',
      'application/javascript',
      'text/javascript',
      'text/typescript',
      'text/html',
      'text/css',
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

/**
 * POST /api/chat/conversations
 * Create a new conversation
 */
router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const { projectId, title } = req.body;
    // For now, use a default user ID - in production, get from auth
    const userId = 'user_default';

    if (!projectId) {
      return res.status(400).json({
        error: 'Project ID is required',
      });
    }

    const conversation = await chatService.createConversation(
      projectId,
      userId,
      title
    );

    // Emit WebSocket event
    io.to(`project-${projectId}`).emit('conversation:created', conversation);

    return res.status(201).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return res.status(500).json({
      error: 'Failed to create conversation',
    });
  }
});

/**
 * GET /api/chat/conversations/:projectId
 * Get conversations for a project
 */
router.get('/conversations/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    // For now, use a default user ID - in production, get from auth
    const userId = 'user_default';

    if (!projectId) {
      return res.status(400).json({
        error: 'Project ID is required',
      });
    }

    const conversations = await chatService.getConversations(projectId, userId);

    return res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({
      error: 'Failed to fetch conversations',
    });
  }
});

/**
 * GET /api/chat/conversation/:conversationId
 * Get a specific conversation with session and context details
 */
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        title: true,
        claudeSessionId: true,
        contextTokens: true,
        lastCompacted: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
      });
    }

    return res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json({
      error: 'Failed to fetch conversation',
    });
  }
});

/**
 * GET /api/chat/messages/:conversationId
 * Get messages for a conversation
 */
router.get('/messages/:conversationId', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    const messages = await chatService.getMessages(conversationId);

    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({
      error: 'Failed to fetch messages',
    });
  }
});

/**
 * POST /api/chat/messages
 * Send a message and stream the response
 */
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const { conversationId, content, attachments } = req.body;

    if (!conversationId || !content) {
      return res.status(400).json({
        error: 'Conversation ID and content are required',
      });
    }

    // Get conversation to verify it exists and get project ID
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { project: true },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
      });
    }

    // Send message and get assistant message placeholder
    const assistantMessage = await chatService.sendMessage(
      conversationId,
      content,
      attachments
    );

    // Update conversation's updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Update conversation title if it's the first message
    const messageCount = await prisma.message.count({
      where: { conversationId, role: 'user' },
    });
    if (messageCount === 1) {
      await chatService.updateConversationTitle(conversationId);
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Listen for streaming updates
    const streamHandler = (data: any) => {
      if (data.id === assistantMessage.id) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        
        if (data.isComplete) {
          // Clean up listener and close connection
          chatService.removeListener('stream', streamHandler);
          res.end();

          // Emit WebSocket event for message complete
          io.to(`project-${conversation.projectId}`).emit('message:complete', {
            conversationId,
            messageId: assistantMessage.id,
          });
        }
      }
    };

    chatService.on('stream', streamHandler);

    // Clean up on client disconnect
    req.on('close', () => {
      chatService.removeListener('stream', streamHandler);
    });

    // Note: Response is handled via SSE streaming above
    
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({
      error: 'Failed to send message',
    });
  }
});

/**
 * POST /api/chat/upload
 * Upload file attachment
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    const fileUrl = `/uploads/chat/${req.file.filename}`;

    return res.json({
      success: true,
      file: {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
      },
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({
      error: 'Failed to upload file',
    });
  }
});

/**
 * PUT /api/chat/conversations/:conversationId/archive
 * Archive a conversation
 */
router.put('/conversations/:conversationId/archive', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    const conversation = await chatService.archiveConversation(conversationId);

    // Emit WebSocket event
    io.emit('conversation:archived', { conversationId });

    return res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    return res.status(500).json({
      error: 'Failed to archive conversation',
    });
  }
});

/**
 * DELETE /api/chat/conversations/:conversationId
 * Delete a conversation
 */
router.delete('/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    await chatService.deleteConversation(conversationId);

    // Emit WebSocket event
    io.emit('conversation:deleted', { conversationId });

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return res.status(500).json({
      error: 'Failed to delete conversation',
    });
  }
});

/**
 * GET /api/chat/search
 * Search conversations
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { projectId, query } = req.query;
    // For now, use a default user ID - in production, get from auth
    const userId = 'user_default';

    if (!projectId || !query) {
      return res.status(400).json({
        error: 'Project ID and query are required',
      });
    }

    const conversations = await chatService.searchConversations(
      projectId as string,
      userId,
      query as string
    );

    return res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error('Error searching conversations:', error);
    return res.status(500).json({
      error: 'Failed to search conversations',
    });
  }
});

/**
 * GET /api/chat/pending
 * Get pending chat requests for Claude Code bridge
 */
router.get('/pending', async (_req: Request, res: Response) => {
  try {
    const requests = chatService.getPendingRequests();
    
    return res.json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error('Error getting pending requests:', error);
    return res.status(500).json({
      error: 'Failed to get pending requests',
    });
  }
});

/**
 * POST /api/chat/response
 * Receive response from Claude Code bridge
 */
router.post('/response', async (req: Request, res: Response) => {
  try {
    const { messageId, content, isComplete, error } = req.body;

    if (!messageId) {
      return res.status(400).json({
        error: 'Message ID is required',
      });
    }

    await chatService.processBridgeResponse(
      messageId,
      content,
      isComplete,
      error
    );

    // Emit WebSocket event for real-time updates
    io.emit('message:updated', { 
      messageId, 
      content, 
      isComplete,
      error 
    });

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error('Error processing bridge response:', error);
    return res.status(500).json({
      error: 'Failed to process bridge response',
    });
  }
});

/**
 * PUT /api/chat/conversations/:conversationId/session
 * Store Claude Code session ID for context preservation
 */
router.put('/conversations/:conversationId/session', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const { claudeSessionId } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    if (!claudeSessionId) {
      return res.status(400).json({
        error: 'Claude session ID is required',
      });
    }

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { claudeSessionId },
    });

    console.log(`💾 Stored session ID ${claudeSessionId} for conversation ${conversationId}`);

    return res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('Error storing session ID:', error);
    return res.status(500).json({
      error: 'Failed to store session ID',
    });
  }
});

/**
 * PUT /api/chat/conversations/:conversationId/tokens
 * Update token usage for conversation
 */
router.put('/conversations/:conversationId/tokens', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const { additionalTokens } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    if (typeof additionalTokens !== 'number') {
      return res.status(400).json({
        error: 'Additional tokens must be a number',
      });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { contextTokens: true },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
      });
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { 
        contextTokens: conversation.contextTokens + additionalTokens,
        updatedAt: new Date(),
      },
    });

    console.log(`📈 Updated token usage: +${additionalTokens} tokens for conversation ${conversationId} (total: ${updatedConversation.contextTokens})`);

    return res.json({
      success: true,
      conversation: updatedConversation,
    });
  } catch (error) {
    console.error('Error updating token usage:', error);
    return res.status(500).json({
      error: 'Failed to update token usage',
    });
  }
});

/**
 * PUT /api/chat/conversations/:conversationId/compact
 * Update compaction status after context compression
 */
router.put('/conversations/:conversationId/compact', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const { compactedAt, tokenReductionEstimate } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { contextTokens: true },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
      });
    }

    // Estimate token reduction (default 70% reduction)
    const reductionFactor = tokenReductionEstimate || 0.7;
    const newTokenCount = Math.floor(conversation.contextTokens * (1 - reductionFactor));

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { 
        lastCompacted: new Date(compactedAt || Date.now()),
        contextTokens: Math.max(newTokenCount, 0),
        updatedAt: new Date(),
      },
    });

    console.log(`🗜️  Context compacted for conversation ${conversationId}: ${conversation.contextTokens} → ${updatedConversation.contextTokens} tokens`);

    return res.json({
      success: true,
      conversation: updatedConversation,
    });
  } catch (error) {
    console.error('Error updating compaction status:', error);
    return res.status(500).json({
      error: 'Failed to update compaction status',
    });
  }
});

export default router;