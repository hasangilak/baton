import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { chatService } from '../services/chat.service';
import { io } from '../index';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { handleStreamingChat, handleAbortRequest } from '../handlers/streaming-chat';

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
 * POST /api/chat/prompts/:promptId/respond
 * Respond to an interactive prompt
 */
router.post('/prompts/:promptId/respond', async (req: Request, res: Response) => {
  try {
    const promptId = req.params.promptId;
    const { selectedOption } = req.body;

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

    // Update the prompt
    const prompt = await prisma.interactivePrompt.update({
      where: { id: promptId },
      data: {
        status: 'answered',
        selectedOption,
        respondedAt: new Date(),
        autoHandler: 'user_selection'
      }
    });

    // Emit response via WebSocket
    io.emit('prompt:response', {
      promptId,
      selectedOption,
      timestamp: Date.now()
    });

    console.log(`📝 User responded to prompt ${promptId} with option ${selectedOption}`);

    // If the prompt has a session ID, trigger session continuation
    if (prompt.sessionId) {
      console.log(`🔄 Triggering session continuation for ${prompt.sessionId}`);
      
      // Map the selected option to the appropriate response
      const options = prompt.options as any[];
      const option = options.find((o: any) => o.id === selectedOption);
      let response = 'yes'; // Default
      
      if (option) {
        if (option.value === 'no' || option.label.toLowerCase().includes('no')) {
          response = 'no';
        } else if (option.value === 'yes_dont_ask' || option.label.toLowerCase().includes("don't ask")) {
          response = 'yes and don\'t ask again';
        }
      }
      
      // Emit session continuation event
      io.emit('session:continue', {
        sessionId: prompt.sessionId,
        response: response,
        timestamp: Date.now()
      });
      
      console.log(`📡 Session continuation event emitted for ${prompt.sessionId} with response: ${response}`);
    }

    return res.json({
      success: true,
      prompt,
    });
  } catch (error) {
    console.error('Error responding to prompt:', error);
    return res.status(500).json({
      error: 'Failed to respond to prompt',
    });
  }
});

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
    io.emit('interactive_prompt', {
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
    io.emit('session:continue', {
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
          pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH || "/home/hassan/.claude/local/node_modules/.bin/claude",
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
 * POST /api/chat/messages/abort/:requestId
 * Abort a streaming request using WebUI shared abort controller pattern
 */
router.post('/messages/abort/:requestId', handleAbortRequest);

export default router;