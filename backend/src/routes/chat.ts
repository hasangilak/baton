import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { chatService } from '../services/chat.service';
import { ConversationPermissionsService } from '../services/conversation-permissions.service';
import type { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { handleStreamingChat, handleAbortRequest } from '../handlers/streaming-chat';
import axios from 'axios';
import { PromptDeliveryService } from '../utils/promptDelivery';
import { getMessageStorageService } from '../services/message-storage.service';

const router = Router();
const prisma = new PrismaClient();

// Global io instance - will be set by index.ts
let ioInstance: SocketIOServer | null = null;

// Initialize the robust prompt delivery service lazily
let promptDeliveryService: PromptDeliveryService | null = null;

function getPromptDeliveryService(): PromptDeliveryService {
  if (!ioInstance) {
    throw new Error('Socket.IO instance not initialized. Call setSocketIOInstance first.');
  }
  if (!promptDeliveryService) {
    promptDeliveryService = new PromptDeliveryService(prisma, ioInstance);
  }
  return promptDeliveryService;
}

// Function to set the Socket.IO instance from index.ts
export function setSocketIOInstance(io: SocketIOServer) {
  ioInstance = io;
}

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
    ioInstance?.to(`project-${projectId}`).emit('conversation:created', conversation);

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
router.post('/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId, content, attachments } = req.body;

    if (!conversationId || !content) {
      res.status(400).json({
        error: 'Conversation ID and content are required',
      });
      return;
    }

    // Get conversation to verify it exists and get project ID
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { project: true },
    });

    if (!conversation) {
      res.status(404).json({
        error: 'Conversation not found',
      });
      return;
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
          ioInstance?.to(`project-${conversation.projectId}`).emit('message:complete', {
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
    // No explicit return needed as response is handled by streaming
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      error: 'Failed to send message',
    });
    return;
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
    ioInstance?.emit('conversation:archived', { conversationId });

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
    ioInstance?.emit('conversation:deleted', { conversationId });

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

    const result = await chatService.processBridgeResponse(
      messageId,
      content,
      isComplete,
      error
    );

    // Emit WebSocket event for real-time updates
    ioInstance?.emit('message:updated', { 
      messageId, 
      content, 
      isComplete,
      error,
      conversationId: result.conversationId
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

/**
 * GET /api/chat/conversations/:conversationId/prompts/pending
 * Get pending interactive prompts for a conversation
 */
router.get('/conversations/:conversationId/prompts/pending', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    const prompts = await prisma.interactivePrompt.findMany({
      where: {
        conversationId,
        status: 'pending',
        // Note: Removed timeoutAt filter to show all pending prompts (including timed out ones)
        // This supports our new approach where prompts remain available for user interaction
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json({
      success: true,
      prompts,
    });
  } catch (error) {
    console.error('Error fetching pending prompts:', error);
    return res.status(500).json({
      error: 'Failed to fetch pending prompts',
    });
  }
});

/**
 * POST /api/chat/conversations/:conversationId/prompts
 * Create interactive prompt using robust multi-channel delivery system
 */
router.post('/conversations/:conversationId/prompts', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const { type, title, message, options, context, metadata } = req.body;

    if (!conversationId || !type || !message || !options) {
      return res.status(400).json({
        error: 'Conversation ID, type, message, and options are required',
      });
    }

    // Generate unique prompt ID with better format
    const promptId = `${type}_${conversationId.slice(-8)}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Enhanced context with risk analysis and statistics
    const enhancedContext = {
      ...context,
      toolName: context?.toolName,
      riskLevel: context?.riskLevel || 'MEDIUM',
      parameters: context?.parameters,
      usageCount: context?.usageCount || 0,
      requestTime: new Date().toISOString(),
      conversationId,
      userAgent: req.headers['user-agent'],
      ...metadata
    };

    // Enhanced metadata for the delivery service
    const enhancedMetadata = {
      createdByHandler: 'webui-chat-handler-enhanced',
      riskAnalysis: {
        level: context?.riskLevel || 'MEDIUM',
        toolType: type,
        parametersCount: context?.parameters ? Object.keys(JSON.parse(context.parameters || '{}')).length : 0
      },
      analytics: {
        requestedAt: Date.now(),
        conversationContext: conversationId,
        userSession: req.headers['x-session-id'] || 'unknown'
      },
      usageStatistics: {
        previousUsage: context?.usageCount || 0,
        riskAssessment: context?.riskLevel || 'MEDIUM',
        recommendedAction: context?.riskLevel === 'LOW' ? 'auto_allow' : 'user_review'
      }
    };

    // Use the robust multi-channel delivery service
    console.log(`🔧 Creating robust prompt delivery for: ${promptId} (${type}) Risk: ${context?.riskLevel || 'MEDIUM'}`);
    
    const deliveryResult = await getPromptDeliveryService().deliverPrompt({
      id: promptId,
      conversationId,
      type,
      title: title || `${type} prompt`,
      message,
      options,
      context: enhancedContext,
      metadata: enhancedMetadata
    });

    if (!deliveryResult.success) {
      console.error(`❌ Prompt delivery failed for ${promptId}:`, deliveryResult.error);
      return res.status(500).json({
        error: 'Failed to deliver interactive prompt',
        details: deliveryResult.error,
        attempts: deliveryResult.attempts,
        deliveryChannels: deliveryResult.deliveryChannels
      });
    }

    console.log(`✅ Prompt ${promptId} successfully delivered via: ${deliveryResult.deliveryChannels.join(', ')}`);

    return res.json({
      success: true,
      prompt: {
        id: promptId,
        conversationId,
        type,
        title: title || `${type} prompt`,
        message,
        options,
        context: enhancedContext,
        status: 'pending'
      },
      delivery: {
        success: deliveryResult.success,
        channels: deliveryResult.deliveryChannels,
        attempts: deliveryResult.attempts,
        createdAt: deliveryResult.createdAt
      },
      analytics: {
        promptId,
        riskLevel: context?.riskLevel || 'MEDIUM',
        deliveryChannels: deliveryResult.deliveryChannels,
        deliveryTime: Date.now()
      }
    });

  } catch (error) {
    console.error('Error in robust prompt creation:', error);
    return res.status(500).json({
      error: 'Failed to create interactive prompt',
      details: error instanceof Error ? error.message : String(error),
      promptDeliveryService: 'error'
    });
  }
});

/**
 * POST /api/chat/prompts/:promptId/acknowledge
 * Handle frontend acknowledgment of prompt delivery
 */
router.post('/prompts/:promptId/acknowledge', async (req: Request, res: Response) => {
  try {
    const promptId = req.params.promptId;
    const { clientInfo, timestamp } = req.body;

    if (!promptId) {
      return res.status(400).json({
        error: 'Prompt ID is required',
      });
    }

    // Track acknowledgment in the delivery service
    getPromptDeliveryService().acknowledgePrompt(promptId, {
      ...clientInfo,
      acknowledgedAt: timestamp || Date.now(),
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });

    console.log(`✅ Prompt ${promptId} acknowledged by frontend`);

    return res.json({
      success: true,
      promptId,
      acknowledgedAt: Date.now()
    });

  } catch (error) {
    console.error('Error acknowledging prompt:', error);
    return res.status(500).json({
      error: 'Failed to acknowledge prompt',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/chat/delivery-stats
 * Get prompt delivery statistics
 */
router.get('/delivery-stats', async (_req: Request, res: Response) => {
  try {
    const stats = getPromptDeliveryService().getDeliveryStats();
    
    return res.json({
      success: true,
      stats,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error getting delivery stats:', error);
    return res.status(500).json({
      error: 'Failed to get delivery stats',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/chat/prompts/:promptId/escalate
 * Handle progressive timeout escalation notifications from bridge
 */
router.post('/prompts/:promptId/escalate', async (req: Request, res: Response) => {
  try {
    const promptId = req.params.promptId;
    const { stage, toolName, riskLevel, escalationType, timestamp } = req.body;

    if (!promptId || !stage || !toolName) {
      return res.status(400).json({
        error: 'Prompt ID, stage, and toolName are required',
      });
    }

    console.log(`📢 Escalation received for prompt ${promptId}: Stage ${stage} - ${escalationType} (${toolName})`);

    // Update prompt with escalation metadata
    const updatedPrompt = await prisma.interactivePrompt.update({
      where: { id: promptId },
      data: {
        metadata: {
          escalationStage: stage,
          escalationType,
          toolName,
          riskLevel,
          escalatedAt: timestamp || Date.now(),
          progressiveTimeout: true
        }
      }
    }).catch(error => {
      console.warn(`⚠️ Failed to update prompt escalation metadata:`, error);
      return null;
    });

    // Emit escalated notification to frontend
    const escalationEvent = {
      promptId,
      stage,
      toolName,
      riskLevel,
      escalationType,
      message: `${escalationType.toUpperCase()}: Permission still needed for ${toolName}`,
      timestamp: timestamp || Date.now(),
      urgencyLevel: stage
    };

    // Send to specific conversation
    if (updatedPrompt) {
      ioInstance?.to(`conversation-${updatedPrompt.conversationId}`).emit('permission_escalation', escalationEvent);
      
      // Also send to project room for broader awareness
      const conversation = await prisma.conversation.findUnique({
        where: { id: updatedPrompt.conversationId },
        select: { projectId: true }
      });
      
      if (conversation?.projectId) {
        ioInstance?.to(`project-${conversation.projectId}`).emit('permission_escalation_project', escalationEvent);
      }
    } else {
      // Fallback broadcast if we can't find the conversation
      ioInstance?.emit('permission_escalation_global', escalationEvent);
    }

    return res.json({
      success: true,
      promptId,
      escalation: {
        stage,
        escalationType,
        toolName,
        riskLevel,
        timestamp: timestamp || Date.now()
      }
    });

  } catch (error) {
    console.error('Error handling permission escalation:', error);
    return res.status(500).json({
      error: 'Failed to handle escalation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/chat/prompts/:promptId/respond
 * Enhanced prompt response with analytics and permission tracking
 */
router.post('/prompts/:promptId/respond', async (req: Request, res: Response) => {
  try {
    const promptId = req.params.promptId;
    const { selectedOption, metadata } = req.body;

    if (!promptId) {
      return res.status(400).json({
        error: 'Prompt ID is required',
      });
    }

    if (!selectedOption) {
      return res.status(400).json({
        error: 'Selected option is required',
      });
    }

    const responseTime = Date.now();

    // Get the original prompt for context
    const originalPrompt = await prisma.interactivePrompt.findUnique({
      where: { id: promptId },
      include: { conversation: true }
    });

    if (!originalPrompt) {
      return res.status(404).json({
        error: 'Prompt not found',
      });
    }

    // Calculate response time
    const promptCreatedTime = originalPrompt.createdAt.getTime();
    const responseTimeMs = responseTime - promptCreatedTime;

    // Update the prompt with enhanced analytics
    const prompt = await prisma.interactivePrompt.update({
      where: { id: promptId },
      data: {
        status: 'answered',
        selectedOption,
        respondedAt: new Date(responseTime),
        autoHandler: 'user_selection',
        metadata: {
          ...(originalPrompt.metadata as object || {}),
          responseAnalytics: {
            responseTimeMs,
            selectedOptionId: selectedOption,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            sessionId: req.headers['x-session-id'] || 'unknown',
            ...metadata
          }
        }
      }
    });

    // Find the selected option details
    const options = prompt.options as any[];
    const selectedOptionData = options.find((o: any) => o.id === selectedOption);

    // Enhanced response object with full context
    const enhancedResponse = {
      id: selectedOption,
      label: selectedOptionData?.label || selectedOption,
      value: selectedOptionData?.value || selectedOption,
      timestamp: responseTime,
      responseTimeMs,
      riskLevel: (originalPrompt.context as any)?.riskLevel,
      toolName: (originalPrompt.context as any)?.toolName,
      conversationId: originalPrompt.conversationId
    };

    // Handle permission persistence based on response
    if (originalPrompt.type === 'tool_permission' && (originalPrompt.context as any)?.toolName) {
      const toolName = (originalPrompt.context as any).toolName as string;
      const conversationId = originalPrompt.conversationId;
      
      try {
        if (selectedOptionData?.value === 'allow_always') {
          await ConversationPermissionsService.grantPermission(
            conversationId,
            toolName,
            'user',
            undefined // No expiration for "always allow"
          );
          console.log(`💾 Granted permanent permission for ${toolName} in conversation ${conversationId}`);
        } else if (selectedOptionData?.value === 'allow_all') {
          // Store temporary session-wide permission (1 hour expiration)
          const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
          await ConversationPermissionsService.grantPermission(
            conversationId,
            'ALL_TOOLS_SESSION',
            'user',
            oneHourFromNow
          );
          console.log(`🕐 Granted session-wide permissions for conversation ${conversationId}`);
        } else if (selectedOptionData?.value === 'deny') {
          await ConversationPermissionsService.denyPermission(
            conversationId,
            toolName,
            'user'
          );
          console.log(`🚫 Denied permission for ${toolName} in conversation ${conversationId}`);
        }
      } catch (permissionError) {
        console.error('Error managing permission:', permissionError);
      }
    }

    // Enhanced WebSocket events with comprehensive data
    const primaryEvent = {
      promptId,
      response: enhancedResponse,
      timestamp: responseTime,
      analytics: {
        responseTime: responseTimeMs,
        promptType: originalPrompt.type,
        riskLevel: (originalPrompt.context as any)?.riskLevel
      }
    };

    // Emit to conversation room
    ioInstance?.to(`conversation-${originalPrompt.conversationId}`).emit('permission:response', primaryEvent);

    // Emit analytics event to project room
    if (originalPrompt.conversation?.projectId) {
      ioInstance?.to(`project-${originalPrompt.conversation.projectId}`).emit('permission_analytics', {
        conversationId: originalPrompt.conversationId,
        toolName: (originalPrompt.context as any)?.toolName,
        decision: selectedOptionData?.value,
        responseTime: responseTimeMs,
        riskLevel: (originalPrompt.context as any)?.riskLevel,
        timestamp: responseTime
      });
    }

    // Global analytics for dashboard
    ioInstance?.emit('permission_statistics', {
      totalResponses: await prisma.interactivePrompt.count({ where: { status: 'answered' }}),
      averageResponseTime: responseTimeMs, // Could be computed properly with aggregation
      decision: selectedOptionData?.value,
      riskLevel: (originalPrompt.context as any)?.riskLevel
    });

    console.log(`📝 Enhanced response: ${promptId} → ${selectedOption} (${responseTimeMs}ms)`);

    // Handle session continuation if needed
    if (prompt.sessionId) {
      const sessionResponse = mapOptionToSessionResponse(selectedOptionData);
      ioInstance?.emit('session:continue', {
        sessionId: prompt.sessionId,
        response: sessionResponse,
        timestamp: responseTime
      });
      console.log(`🔄 Session ${prompt.sessionId} continued with: ${sessionResponse}`);
    }

    return res.json({
      success: true,
      prompt,
      response: enhancedResponse,
      analytics: {
        responseTime: responseTimeMs,
        permissionStored: selectedOptionData?.value === 'allow_always',
        eventsEmitted: [
          `conversation-${originalPrompt.conversationId}`,
          `project-${originalPrompt.conversation?.projectId}`,
          'global'
        ]
      }
    });
  } catch (error) {
    console.error('Error processing enhanced prompt response:', error);
    return res.status(500).json({
      error: 'Failed to process prompt response',
      details: error instanceof Error ? error.message : String(error)
    });
  }

});

// Helper function for session response mapping
function mapOptionToSessionResponse(option: any): string {
  if (!option) return 'yes';
  
  if (option.value === 'deny' || option.value === 'no') return 'no';
  if (option.value === 'allow_always' || option.label?.toLowerCase().includes("don't ask")) {
    return 'yes and don\'t ask again';
  }
  return 'yes';
}

/**
 * POST /api/chat/prompts/notify
 * Notify frontend about a new interactive prompt via WebSocket
 */
router.post('/prompts/notify', async (req: Request, res: Response) => {
  try {
    const { promptId, conversationId, type, title, message, options, context, timeout } = req.body;

    if (!promptId || !conversationId) {
      return res.status(400).json({
        error: 'Prompt ID and conversation ID are required',
      });
    }

    // Emit interactive prompt event to all connected clients
    ioInstance?.emit('interactive_prompt', {
      promptId,
      conversationId,
      type,
      title,
      message,
      options,
      context,
      timeout
    });

    console.log(`📡 Emitted interactive_prompt event for prompt ${promptId} to all clients`);

    return res.json({
      success: true,
      message: 'Prompt notification sent',
    });
  } catch (error) {
    console.error('Error sending prompt notification:', error);
    return res.status(500).json({
      error: 'Failed to send prompt notification',
    });
  }
});

/**
 * POST /api/chat/prompts/continue-session
 * Continue Claude Code session with user response
 */
router.post('/prompts/continue-session', async (req: Request, res: Response) => {
  try {
    const { sessionId, response } = req.body;
    
    if (!sessionId || !response) {
      return res.status(400).json({
        error: 'Session ID and response are required'
      });
    }
    
    // Emit to Socket.IO to trigger session continuation in chat handler
    ioInstance?.emit('session:continue', {
      sessionId,
      response,
      timestamp: Date.now()
    });
    
    console.log(`📡 Session continuation event emitted for ${sessionId}`);
    
    return res.json({
      success: true,
      sessionId,
      response
    });
    
  } catch (error) {
    console.error('Error continuing session:', error);
    return res.status(500).json({
      error: 'Failed to continue session'
    });
  }
});

/**
 * POST /api/chat/prompts/tool-permission
 * Create an interactive prompt for tool permission request
 */
router.post('/prompts/tool-permission', async (req: Request, res: Response) => {
  try {
    const { conversationId, toolName, context, sessionId } = req.body;
    
    if (!conversationId || !toolName) {
      return res.status(400).json({
        error: 'Conversation ID and tool name are required'
      });
    }
    
    // Create interactive prompt in database
    const promptId = `tool_${toolName}_${Date.now()}`;
    const prompt = await prisma.interactivePrompt.create({
      data: {
        id: promptId,
        conversationId,
        sessionId,
        type: 'tool_permission',
        title: `${toolName} Tool Permission`,
        message: `Claude Code wants to use the ${toolName} tool: ${context || 'Modify files'}`,
        options: [
          { id: 'yes', label: 'Yes', value: 'yes' },
          { id: 'no', label: 'No', value: 'no' },
          { id: 'yes_dont_ask', label: "Yes, don't ask again", value: 'yes_dont_ask' }
        ],
        context: { toolName, originalContext: context },
        timeoutAt: new Date(Date.now() + 30000),
        status: 'pending'
      }
    });

    // Emit interactive prompt event to frontend
    ioInstance?.emit('interactive_prompt', {
      promptId: prompt.id,
      conversationId,
      type: 'tool_permission',
      title: prompt.title,
      message: prompt.message,
      options: prompt.options,
      context: prompt.context,
      timeout: 30000
    });

    console.log(`🔧 Created tool permission prompt for ${toolName}: ${promptId}`);

    return res.json({
      success: true,
      promptId: prompt.id,
      prompt
    });
    
  } catch (error) {
    console.error('Error creating tool permission prompt:', error);
    return res.status(500).json({
      error: 'Failed to create tool permission prompt'
    });
  }
});

/**
 * GET /api/chat/prompts/:promptId
 * Get a specific prompt status (used by bridge for polling)
 */
router.get('/prompts/:promptId', async (req: Request, res: Response) => {
  try {
    const promptId = req.params.promptId;

    if (!promptId) {
      return res.status(400).json({
        error: 'Prompt ID is required',
      });
    }

    const prompt = await prisma.interactivePrompt.findUnique({
      where: { id: promptId }
    });

    if (!prompt) {
      return res.status(404).json({
        error: 'Prompt not found',
      });
    }

    return res.json({
      success: true,
      prompt,
    });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return res.status(500).json({
      error: 'Failed to fetch prompt',
    });
  }
});

/**
 * PUT /api/chat/prompts/:promptId/timeout
 * Mark a prompt as timed out
 */
router.put('/prompts/:promptId/timeout', async (req: Request, res: Response) => {
  try {
    const promptId = req.params.promptId;

    if (!promptId) {
      return res.status(400).json({
        error: 'Prompt ID is required',
      });
    }

    const prompt = await prisma.interactivePrompt.update({
      where: { id: promptId },
      data: {
        status: 'timeout',
        respondedAt: new Date(),
        autoHandler: 'timeout'
      }
    });

    console.log(`⏰ Prompt ${promptId} timed out`);

    return res.json({
      success: true,
      prompt,
    });
  } catch (error) {
    console.error('Error timing out prompt:', error);
    return res.status(500).json({
      error: 'Failed to timeout prompt',
    });
  }
});

/**
 * POST /api/chat/messages/stream
 * New Claude Code streaming implementation based on WebUI patterns
 */
router.post('/messages/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId, content, requestId } = req.body;

    if (!conversationId || !content || !requestId) {
      res.status(400).json({
        error: 'Conversation ID, content, and requestId are required',
      });
      return;
    }

    // Get conversation to verify it exists and get project context
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { project: true },
    });

    if (!conversation) {
      res.status(404).json({
        error: 'Conversation not found',
      });
      return;
    }

    // Store user message first
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content,
        status: 'completed',
      },
    });

    // Create assistant message placeholder
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        status: 'sending',
      },
    });

    // Set up streaming headers
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    let fullContent = '';
    let currentSessionId = null;

    try {
      // Import Claude Code SDK
      const { query } = require('@anthropic-ai/claude-code');
      
      // Build context prompt
      let contextPrompt = content;
      if (conversation.project) {
        contextPrompt = `Project: ${conversation.project.name}\n\n${content}`;
      }

      console.log(`🎬 Starting Claude Code stream for message ${assistantMessage.id}`);
      console.log(`📡 Context: "${contextPrompt.substring(0, 150)}..."`);

      // Create abort controller (TODO: implement shared abort controller management)
      const abortController = new AbortController();

      // Stream Claude Code responses directly
      for await (const sdkMessage of query({
        prompt: contextPrompt,
        options: {
          abortController,
          executable: "/usr/local/bin/node" as const,
          executableArgs: [],
          pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH || "/home/hassan/.nvm/versions/node/v22.18.0/bin/claude",
          maxTurns: 1,
          cwd: "/home/hassan/work/baton",
          // Use simple options - avoid canUseTool complexity
          permissionMode: 'default' as const,
          ...(conversation.claudeSessionId ? { resume: conversation.claudeSessionId } : {}),
        },
      })) {
        // Capture session ID early
        const sessionId = sdkMessage.sessionId || sdkMessage.session_id || 
                         (sdkMessage.message && (sdkMessage.message.sessionId || sdkMessage.message.session_id));
        
        if (sessionId && !currentSessionId) {
          currentSessionId = sessionId;
          console.log(`🆔 Captured session ID: ${currentSessionId}`);
        }

        // Extract content for database storage
        if (sdkMessage.type === 'assistant' && sdkMessage.message) {
          let textContent = '';
          if (Array.isArray(sdkMessage.message.content)) {
            textContent = sdkMessage.message.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
          } else if (typeof sdkMessage.message.content === 'string') {
            textContent = sdkMessage.message.content;
          }
          
          if (textContent && textContent !== fullContent) {
            fullContent = textContent;
          }
        } else if (sdkMessage.type === 'result' && sdkMessage.result) {
          fullContent = sdkMessage.result;
        }

        // Forward raw SDK message to frontend
        const streamResponse = {
          type: 'claude_json',
          data: sdkMessage,
          messageId: assistantMessage.id, // Include message ID for frontend reference
        };
        
        const chunk = JSON.stringify(streamResponse) + '\n';
        res.write(chunk);
      }

      // Update message in database with final content
      await prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          content: fullContent,
          status: 'completed',
        },
      });

      // Store session ID if captured
      if (currentSessionId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { claudeSessionId: currentSessionId },
        });
        console.log(`💾 Stored session ID ${currentSessionId}`);
      }

      // Send completion signal
      const doneResponse = { 
        type: 'done',
        messageId: assistantMessage.id,
        finalContent: fullContent 
      };
      res.write(JSON.stringify(doneResponse) + '\n');

      console.log(`✅ Stream completed for message ${assistantMessage.id}`);

    } catch (error) {
      console.error('❌ Claude Code streaming error:', error);
      
      // Update message status to failed
      await prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Send error to frontend
      const errorResponse = {
        type: 'error',
        messageId: assistantMessage.id,
        error: error instanceof Error ? error.message : String(error),
      };
      res.write(JSON.stringify(errorResponse) + '\n');
    } finally {
      res.end();
    }
    // Response handled by streaming above

  } catch (error) {
    console.error('❌ Stream setup error:', error);
    res.status(500).json({
      error: 'Failed to set up streaming response',
      details: error instanceof Error ? error.message : String(error),
    });
    return;
  }
});

/**
 * POST /api/chat/messages/stream-webui
 * New streaming endpoint following Claude Code WebUI architecture exactly
 * Uses AsyncGenerator pattern with NDJSON streaming and shared abort controllers
 */
router.post('/messages/stream-webui', handleStreamingChat);

/**
 * POST /api/chat/messages/stream-bridge
 * Enhanced stream Claude Code responses via local bridge service
 * Now with reliable message storage and hybrid persistence approach
 */
router.post('/messages/stream-bridge', async (req: Request, res: Response): Promise<void> => {
  const messageStorage = getMessageStorageService(prisma);
  
  try {
    const { conversationId, content, requestId } = req.body;

    if (!conversationId || !content || !requestId) {
      res.status(400).json({
        error: 'Conversation ID, content, and requestId are required',
      });
      return;
    }

    // Get conversation with enhanced error handling
    const conversation = await messageStorage.getConversationWithProject(conversationId);
    if (!conversation) {
      res.status(404).json({
        error: 'Conversation not found',
      });
      return;
    }

    // Use enhanced message storage with hybrid approach
    const userMessage = await messageStorage.createUserMessage(conversationId, content);
    const assistantMessage = await messageStorage.createAssistantMessagePlaceholder(conversationId);
    
    console.log(`📝 Created messages: user=${userMessage.id}, assistant=${assistantMessage.id}`);

    // Get allowed tools for this conversation
    const permissions = await ConversationPermissionsService.getGrantedPermissions(conversationId);
    const safeTools = ["Read", "LS", "Glob", "Grep", "WebFetch", "WebSearch"];
    const allowedTools = [...new Set([...safeTools, ...permissions])];

    // Set up streaming headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    let fullContent = '';
    let currentSessionId = conversation.claudeSessionId;
    let hasReceivedFirstContent = false;

    try {
      // Forward request to bridge service
      const bridgeUrl = process.env.BRIDGE_URL || 'http://192.168.2.39:8080';
      const bridgeRequest = {
        message: content,
        requestId,
        conversationId,
        sessionId: currentSessionId,
        allowedTools,
        workingDirectory: process.env.WORKING_DIRECTORY || '/home/hassan/work/baton',
        permissionMode: 'interactive',
        projectName: conversation.project?.name
      };

      console.log(`🌉 Forwarding request ${requestId} to bridge at ${bridgeUrl}`);
      
      const response = await axios.post(`${bridgeUrl}/execute`, bridgeRequest, {
        responseType: 'stream',
        timeout: 0 // No timeout for streaming
      });

      // Enhanced bridge response processing with real-time DB updates
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              // Extract content for database storage
              if (data.type === 'claude_json' && data.data) {
                const sdkMessage = data.data;
                
                // Enhanced session ID handling
                const sessionId = sdkMessage.sessionId || sdkMessage.session_id ||
                               (sdkMessage.type === 'system' && sdkMessage.session?.id);
                
                if (sessionId && sessionId !== currentSessionId) {
                  currentSessionId = sessionId;
                  console.log(`🆔 New session ID captured: ${currentSessionId}`);
                  
                  // Use enhanced session storage
                  messageStorage.updateConversationSession(conversationId, currentSessionId);
                }

                // Enhanced content extraction and immediate DB updates
                let textContent = '';
                if (sdkMessage.type === 'assistant' && sdkMessage.message) {
                  if (Array.isArray(sdkMessage.message.content)) {
                    textContent = sdkMessage.message.content
                      .filter((block: any) => block.type === 'text')
                      .map((block: any) => block.text)
                      .join('');
                  } else if (typeof sdkMessage.message.content === 'string') {
                    textContent = sdkMessage.message.content;
                  }
                  
                  if (textContent && textContent !== fullContent) {
                    fullContent = textContent;
                    hasReceivedFirstContent = true;
                    
                    // Hybrid approach: immediate DB update for streaming content
                    messageStorage.updateAssistantMessageStreaming(
                      assistantMessage.id, 
                      fullContent, 
                      false, // not complete yet
                      currentSessionId
                    );
                  }
                } else if (sdkMessage.type === 'result' && sdkMessage.result) {
                  fullContent = sdkMessage.result;
                  hasReceivedFirstContent = true;
                  
                  // Update with result content
                  messageStorage.updateAssistantMessageStreaming(
                    assistantMessage.id, 
                    fullContent, 
                    false,
                    currentSessionId
                  );
                }
              }
              
              // Forward response to frontend (include messageId for reference)
              const streamResponse = {
                ...data,
                messageId: assistantMessage.id
              };
              
              res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
              
              // Enhanced completion handling
              if (data.type === 'done' || data.type === 'error' || data.type === 'aborted') {
                console.log(`✅ Bridge request ${requestId} completed: ${data.type}`);
                
                // Final message update with completion status
                if (data.type === 'done') {
                  messageStorage.updateAssistantMessageStreaming(
                    assistantMessage.id, 
                    fullContent, 
                    true, // complete
                    currentSessionId
                  );
                  
                  // Extract code blocks from final content
                  if (fullContent) {
                    messageStorage.extractAndSaveCodeBlocks(assistantMessage.id, fullContent);
                  }
                } else {
                  // Handle error cases with user-visible error
                  const errorMessage = data.error || `Request ${data.type}: ${data.type === 'aborted' ? 'Request was cancelled' : 'Unknown error'}`;
                  messageStorage.markMessageFailed(assistantMessage.id, errorMessage);
                }

                return;
              }
              
            } catch (parseError) {
              console.error('Error parsing bridge response:', parseError);
              // Don't break the stream for parsing errors - continue processing
            }
          }
        }
      });

      response.data.on('end', () => {
        console.log(`🏁 Bridge stream ended for request ${requestId}`);
        res.end();
      });

      response.data.on('error', (error: any) => {
        console.error(`❌ Bridge stream error for ${requestId}:`, error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message,
          requestId,
          messageId: assistantMessage.id
        })}\n\n`);
        res.end();
      });

    } catch (error) {
      console.error('❌ Bridge request failed:', error);
      
      // Enhanced error handling with user-visible messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      const userFriendlyError = `Connection to Claude Code bridge failed: ${errorMessage}. Please ensure the bridge service is running.`;
      
      // Use enhanced error marking
      await messageStorage.markMessageFailed(assistantMessage.id, userFriendlyError);

      // Send user-friendly error to frontend
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: userFriendlyError,
        requestId,
        messageId: assistantMessage.id,
        canRetry: true // User can manually retry
      })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('❌ Stream bridge setup error:', error);
    
    // Enhanced setup error handling with user-friendly messages
    const errorMessage = error instanceof Error ? error.message : String(error);
    let userFriendlyError = 'Failed to start chat session';
    
    if (errorMessage.includes('Conversation not found')) {
      userFriendlyError = 'Chat conversation not found. Please start a new conversation.';
    } else if (errorMessage.includes('save your message')) {
      userFriendlyError = errorMessage; // Already user-friendly from MessageStorageService
    } else if (errorMessage.includes('prepare response')) {
      userFriendlyError = errorMessage; // Already user-friendly from MessageStorageService
    } else {
      userFriendlyError = `Chat setup failed: ${errorMessage}`;
    }
    
    res.status(500).json({
      error: userFriendlyError,
      canRetry: true,
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/chat/messages/abort/:requestId
 * Abort a streaming request using WebUI shared abort controller pattern
 */
router.post('/messages/abort/:requestId', handleAbortRequest);

/**
 * POST /api/chat/messages/abort-bridge/:requestId
 * Abort a bridge streaming request
 */
router.post('/messages/abort-bridge/:requestId', async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    
    if (!requestId) {
      return res.status(400).json({
        error: 'Request ID is required',
      });
    }

    // Forward abort request to bridge service
    const bridgeUrl = process.env.BRIDGE_URL || 'http://192.168.2.39:8080';
    
    try {
      await axios.post(`${bridgeUrl}/abort/${requestId}`, {}, { timeout: 5000 });
      console.log(`⏹️ Abort request sent to bridge for ${requestId}`);
      
      return res.json({
        success: true,
        message: 'Abort request sent to bridge'
      });
    } catch (bridgeError) {
      console.error(`❌ Failed to abort bridge request ${requestId}:`, bridgeError);
      return res.status(500).json({
        error: 'Failed to abort bridge request',
        details: bridgeError instanceof Error ? bridgeError.message : String(bridgeError)
      });
    }

  } catch (error) {
    console.error('❌ Abort bridge request error:', error);
    return res.status(500).json({
      error: 'Failed to process abort request',
    });
  }
});

/**
 * GET /api/chat/conversations/:conversationId/permissions
 * Get granted permissions for a conversation
 */
router.get('/conversations/:conversationId/permissions', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    const permissions = await ConversationPermissionsService.getGrantedPermissions(conversationId);

    return res.json({
      success: true,
      permissions,
    });
  } catch (error) {
    console.error('Error fetching conversation permissions:', error);
    return res.status(500).json({
      error: 'Failed to fetch conversation permissions',
    });
  }
});

/**
 * POST /api/chat/conversations/:conversationId/permissions
 * Grant permission for a tool in a conversation
 */
router.post('/conversations/:conversationId/permissions', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const { toolName, status, grantedBy, expiresAt } = req.body;

    if (!conversationId || !toolName) {
      return res.status(400).json({
        error: 'Conversation ID and tool name are required',
      });
    }

    const permission = status === 'denied' 
      ? await ConversationPermissionsService.denyPermission(conversationId, toolName, grantedBy)
      : await ConversationPermissionsService.grantPermission(
          conversationId, 
          toolName, 
          grantedBy || 'user', 
          expiresAt ? new Date(expiresAt) : undefined
        );

    console.log(`🔐 ${status === 'denied' ? 'Denied' : 'Granted'} permission for ${toolName} in conversation ${conversationId}`);

    return res.json({
      success: true,
      permission,
    });
  } catch (error) {
    console.error('Error managing conversation permission:', error);
    return res.status(500).json({
      error: 'Failed to manage conversation permission',
    });
  }
});

/**
 * DELETE /api/chat/conversations/:conversationId/permissions/:toolName
 * Revoke permission for a tool in a conversation
 */
router.delete('/conversations/:conversationId/permissions/:toolName', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;
    const toolName = req.params.toolName;

    if (!conversationId || !toolName) {
      return res.status(400).json({
        error: 'Conversation ID and tool name are required',
      });
    }

    await ConversationPermissionsService.revokePermission(conversationId, toolName);

    console.log(`🗑️ Revoked permission for ${toolName} in conversation ${conversationId}`);

    return res.status(204).send();
  } catch (error) {
    console.error('Error revoking conversation permission:', error);
    return res.status(500).json({
      error: 'Failed to revoke conversation permission',
    });
  }
});

/**
 * GET /api/chat/analytics/permissions
 * Get comprehensive permission analytics
 */
router.get('/analytics/permissions', async (req: Request, res: Response) => {
  try {
    const { conversationId, projectId, timeframe = '24h' } = req.query;

    // Calculate time range
    const now = new Date();
    let since: Date;
    switch (timeframe) {
      case '1h': since = new Date(now.getTime() - 60 * 60 * 1000); break;
      case '24h': since = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
      case '7d': since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      default: since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const whereClause: any = {
      createdAt: { gte: since }
    };

    if (conversationId) {
      whereClause.conversationId = conversationId as string;
    } else if (projectId) {
      whereClause.conversation = {
        projectId: projectId as string
      };
    }

    // Get permission prompts with analytics
    const prompts = await prisma.interactivePrompt.findMany({
      where: {
        ...whereClause,
        type: 'tool_permission',
        status: { not: 'pending' }
      },
      include: {
        conversation: {
          select: { projectId: true, title: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate analytics
    const analytics = {
      totalPrompts: prompts.length,
      responsesByDecision: {} as Record<string, number>,
      averageResponseTime: 0,
      toolsRequested: {} as Record<string, number>,
      riskLevelDistribution: {} as Record<string, number>,
      conversationActivity: {} as Record<string, number>,
      timelineBuckets: [] as any[]
    };

    let totalResponseTime = 0;
    let responsesWithTime = 0;

    prompts.forEach(prompt => {
      // Decision tracking
      if (prompt.selectedOption) {
        const options = prompt.options as any[];
        const selectedOption = options.find((o: any) => o.id === prompt.selectedOption);
        const decision = selectedOption?.value || 'unknown';
        analytics.responsesByDecision[decision] = (analytics.responsesByDecision[decision] || 0) + 1;
      }

      // Response time tracking
      if (prompt.respondedAt) {
        const responseTime = prompt.respondedAt.getTime() - prompt.createdAt.getTime();
        totalResponseTime += responseTime;
        responsesWithTime++;
      }

      // Tool tracking
      const toolName = (prompt.context as any)?.toolName as string;
      if (toolName) {
        analytics.toolsRequested[toolName] = (analytics.toolsRequested[toolName] || 0) + 1;
      }

      // Risk level tracking
      const riskLevel = (prompt.context as any)?.riskLevel as string || 'UNKNOWN';
      analytics.riskLevelDistribution[riskLevel] = (analytics.riskLevelDistribution[riskLevel] || 0) + 1;

      // Conversation activity
      analytics.conversationActivity[prompt.conversationId] = (analytics.conversationActivity[prompt.conversationId] || 0) + 1;
    });

    analytics.averageResponseTime = responsesWithTime > 0 ? totalResponseTime / responsesWithTime : 0;

    // Top 5 most requested tools
    const topTools = Object.entries(analytics.toolsRequested)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count }));

    return res.json({
      success: true,
      timeframe: timeframe as string,
      since: since.toISOString(),
      analytics,
      topTools,
      summary: {
        totalRequests: analytics.totalPrompts,
        mostCommonDecision: Object.keys(analytics.responsesByDecision).length > 0
          ? Object.keys(analytics.responsesByDecision).reduce((a, b) => 
              (analytics.responsesByDecision[a] || 0) > (analytics.responsesByDecision[b] || 0) ? a : b
            )
          : 'unknown',
        averageResponseSeconds: Math.round(analytics.averageResponseTime / 1000),
        mostRequestedTool: topTools[0]?.tool || 'none'
      }
    });

  } catch (error) {
    console.error('Error fetching permission analytics:', error);
    return res.status(500).json({
      error: 'Failed to fetch permission analytics',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/chat/analytics/track-event
 * Track custom permission events for analytics
 */
router.post('/analytics/track-event', async (req: Request, res: Response) => {
  try {
    const { eventType, conversationId, toolName, metadata } = req.body;

    if (!eventType || !conversationId) {
      return res.status(400).json({
        error: 'Event type and conversation ID are required'
      });
    }

    // Create analytics event (could be stored in a separate analytics table)
    const event = {
      id: `analytics_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      eventType,
      conversationId,
      toolName: toolName || null,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        source: 'webui-chat-handler-enhanced'
      }
    };

    // For now, emit as WebSocket event for real-time analytics
    ioInstance?.emit('analytics_event', event);

    console.log(`📊 Analytics event tracked: ${eventType} for ${toolName || 'general'}`);

    return res.json({
      success: true,
      event,
      message: 'Analytics event tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking analytics event:', error);
    return res.status(500).json({
      error: 'Failed to track analytics event',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/chat/conversations/:conversationId/permissions/live
 * Get live permission status with caching
 */
router.get('/conversations/:conversationId/permissions/live', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Conversation ID is required',
      });
    }

    // Get all permissions with expiry check
    const permissions = await ConversationPermissionsService.getConversationPermissions(conversationId);
    const activePermissions = await ConversationPermissionsService.getGrantedPermissions(conversationId);

    // Get recent permission requests (last 1 hour)
    const recentPrompts = await prisma.interactivePrompt.findMany({
      where: {
        conversationId,
        type: 'tool_permission',
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Calculate permission statistics for this conversation
    const stats = {
      totalPermissions: permissions.length,
      activePermissions: activePermissions.length,
      expiredPermissions: permissions.filter(p => 
        p.expiresAt && p.expiresAt < new Date()
      ).length,
      recentRequests: recentPrompts.length,
      pendingRequests: recentPrompts.filter(p => p.status === 'pending').length
    };

    const liveStatus = {
      conversationId,
      activePermissions,
      allPermissions: permissions.map(p => ({
        toolName: p.toolName,
        status: p.status,
        grantedAt: p.grantedAt,
        grantedBy: p.grantedBy,
        expiresAt: p.expiresAt,
        isExpired: p.expiresAt ? p.expiresAt < new Date() : false
      })),
      recentActivity: recentPrompts.map(p => ({
        promptId: p.id,
        toolName: (p.context as any)?.toolName,
        status: p.status,
        selectedOption: p.selectedOption,
        createdAt: p.createdAt,
        respondedAt: p.respondedAt,
        responseTime: p.respondedAt ? p.respondedAt.getTime() - p.createdAt.getTime() : null
      })),
      statistics: stats,
      timestamp: Date.now()
    };

    return res.json({
      success: true,
      liveStatus,
      cacheInfo: {
        generatedAt: new Date().toISOString(),
        ttl: 300, // 5 minutes cache recommendation
        conversationId
      }
    });

  } catch (error) {
    console.error('Error fetching live permission status:', error);
    return res.status(500).json({
      error: 'Failed to fetch live permission status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
export { promptDeliveryService };