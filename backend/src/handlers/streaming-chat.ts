/**
 * Streaming Chat Handler - Based on Claude Code WebUI Architecture
 * 
 * This implements the AsyncGenerator streaming pattern from the comprehensive guide,
 * providing NDJSON streaming responses with proper session management and abort support.
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { StreamResponse, StreamingContext, SDKMessage, AbortError } from '../types/streaming';
import { logger } from '../utils/logger';

// Shared abort controller management
const requestAbortControllers = new Map<string, AbortController>();

/**
 * Core streaming function using AsyncGenerator pattern
 * This is the heart of the streaming system, following WebUI architecture exactly
 */
async function* executeClaudeCommand(
  message: string,
  context: StreamingContext,
  cwd?: string,
  allowedTools?: string[],
  permissionMode: string = 'default'
): AsyncGenerator<StreamResponse> {
  const { requestId, messageId, conversationId, sessionId, abortController } = context;
  
  try {
    // Store abort controller for request tracking
    requestAbortControllers.set(requestId, abortController);
    
    logger.streaming.info(`Delegating Claude Code execution to local handler via Socket.IO`, {
      requestId,
      sessionId,
      messageLength: message.length,
      cwd,
      allowedTools: allowedTools?.length || 0
    });

    // Import Socket.IO instance to emit to local handler
    const { io } = await import('../index');
    
    // Emit request to local handler via Socket.IO bridge
    const request = {
      message,
      requestId,
      conversationId,
      messageId,
      sessionId,
      allowedTools,
      workingDirectory: cwd,
      permissionMode,
      timestamp: Date.now()
    };
    
    logger.streaming.info(`Emitting chat:request to bridge for ${requestId}`);
    io.to('chat-bridge').emit('chat:request', request);
    
    // Yield confirmation that request was delegated to local handler
    yield {
      type: "claude_json", 
      data: {
        type: "system",
        message: {
          content: [
            {
              type: "text",
              text: `🔗 Request ${requestId} delegated to local Claude Code handler. Processing...`
            }
          ]
        }
      }
    };

    // The actual streaming responses will come through the Socket.IO bridge
    // and be handled by the existing chat-bridge:response mechanism
    yield { type: "delegated", requestId };
    
  } catch (error) {
    logger.streaming.error('Claude Code delegation error', { error, requestId });
    
    if (error instanceof AbortError || (error as any).name === 'AbortError') {
      yield { type: "aborted" };
    } else {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } finally {
    // Clean up abort controller
    if (requestAbortControllers.has(requestId)) {
      requestAbortControllers.delete(requestId);
    }
  }
}

/**
 * Express handler for streaming chat requests
 * Follows the exact pattern from the WebUI guide
 */
export async function handleStreamingChat(req: Request, res: Response): Promise<void> {
  const prisma = new PrismaClient();
  
  try {
    const { message, requestId, conversationId, sessionId, allowedTools, workingDirectory, permissionMode } = req.body;
    
    // Validate required parameters
    if (!message || !requestId || !conversationId) {
      res.status(400).json({
        error: 'message, requestId, and conversationId are required'
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

    // Store user message
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: message,
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

    // Set up NDJSON streaming headers (following WebUI exactly)
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Create abort controller for this request
    const abortController = new AbortController();
    
    // Build context prompt with project information
    let contextPrompt = message;
    if (conversation.project) {
      contextPrompt = `Project: ${conversation.project.name}\n\n${message}`;
    }

    // Create streaming context
    const streamingContext: StreamingContext = {
      requestId,
      messageId: assistantMessage.id,
      conversationId,
      sessionId: sessionId || conversation.claudeSessionId || undefined,
      abortController,
    };

    logger.handlers.info('Starting streaming chat', {
      requestId,
      conversationId,
      messageId: assistantMessage.id,
      sessionId: streamingContext.sessionId,
      projectName: conversation.project?.name
    });

    // Process streaming responses with Socket.IO bridge integration
    let fullContent = '';
    let currentSessionId = streamingContext.sessionId;
    let delegatedToHandler = false;

    // Set up listener for responses from local handler
    const { io } = await import('../index');
    let responseHandler: ((data: any) => void) | null = null;
    let streamCompleted = false;

    // Execute streaming with AsyncGenerator (which will delegate to local handler)
    for await (const streamResponse of executeClaudeCommand(
      contextPrompt,
      streamingContext,
      workingDirectory,
      allowedTools,
      permissionMode
    )) {
      // Add message ID to response for frontend reference
      const response: StreamResponse = {
        ...streamResponse,
        messageId: assistantMessage.id,
      };

      // Write initial delegation confirmation
      const chunk = JSON.stringify(response) + '\n';
      res.write(chunk);

      // If this is a delegation response, set up Socket.IO listener
      if (streamResponse.type === 'delegated' && !delegatedToHandler) {
        delegatedToHandler = true;
        logger.handlers.info('Setting up Socket.IO listener for delegated request', { requestId });
        
        // Set up response handler for this specific request
        responseHandler = (data: any) => {
          logger.handlers.info('Received Socket.IO response', { 
            hasRequestId: !!data.requestId,
            targetRequestId: requestId,
            matches: data.requestId === requestId,
            responseType: data.streamResponse?.type,
            isComplete: data.isComplete 
          });
          
          if (data.requestId === requestId) {
            logger.handlers.info('Processing response from local handler', { 
              requestId, 
              responseType: data.streamResponse?.type,
              isComplete: data.isComplete,
              hasContent: !!data.content,
              hasSessionId: !!data.sessionId
            });
            
            // Update content and session ID from local handler
            if (data.content && data.content !== fullContent) {
              fullContent = data.content;
              logger.handlers.info('Updated content from local handler', { requestId, contentLength: data.content.length });
            }
            
            if (data.sessionId && !currentSessionId) {
              currentSessionId = data.sessionId;
              logger.handlers.info('Captured session ID from local handler', { sessionId: data.sessionId, requestId });
            }
            
            // Forward the stream response to frontend
            if (data.streamResponse) {
              const forwardedResponse: StreamResponse = {
                ...data.streamResponse,
                messageId: assistantMessage.id,
              };
              
              const forwardChunk = JSON.stringify(forwardedResponse) + '\n';
              res.write(forwardChunk);
              logger.handlers.info('Forwarded stream response to frontend', { 
                requestId, 
                responseType: data.streamResponse.type 
              });
            }
            
            // Handle completion
            if (data.isComplete) {
              streamCompleted = true;
              logger.handlers.info('🎯 Stream completion detected via local handler', { requestId });
              
              // Send final done response
              const doneResponse: StreamResponse = {
                type: 'done',
                messageId: assistantMessage.id,
              };
              res.write(JSON.stringify(doneResponse) + '\n');
              logger.handlers.info('Sent final done response', { requestId });
            }
          } else {
            logger.handlers.debug('Ignoring response for different request', { 
              receivedRequestId: data.requestId, 
              expectedRequestId: requestId 
            });
          }
        };
        
        io.on('chat-bridge:response', responseHandler);
        
        // Wait for local handler responses (with timeout)
        const waitForCompletion = new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (!streamCompleted) {
              logger.handlers.warn('Local handler response timeout', { requestId });
              streamCompleted = true;
              resolve();
            }
          }, 10000); // 10 second timeout for testing
          
          const checkCompletion = setInterval(() => {
            if (streamCompleted) {
              clearTimeout(timeout);
              clearInterval(checkCompletion);
              resolve();
            }
          }, 100);
        });
        
        await waitForCompletion;
        break;
      }

      // Handle other response types (system messages, errors, etc.)
      if (streamResponse.type === 'done' || streamResponse.type === 'error' || streamResponse.type === 'aborted') {
        break;
      }
    }

    // Clean up Socket.IO listener
    if (responseHandler) {
      io.off('chat-bridge:response', responseHandler);
    }

    // Update message in database
    const messageStatus = fullContent ? 'completed' : 'failed';
    await prisma.message.update({
      where: { id: assistantMessage.id },
      data: {
        content: fullContent,
        status: messageStatus,
      },
    });

    // Store session ID if captured
    if (currentSessionId && currentSessionId !== conversation.claudeSessionId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { claudeSessionId: currentSessionId },
      });
      logger.handlers.info('Stored session ID', { sessionId: currentSessionId, conversationId });
    }

    // Send final completion response
    const finalResponse: StreamResponse = {
      type: 'done',
      messageId: assistantMessage.id,
    };
    res.write(JSON.stringify(finalResponse) + '\n');
    
    logger.handlers.info('Streaming chat completed', { requestId, messageId: assistantMessage.id });

  } catch (error) {
    logger.handlers.error('Stream setup error', { error });
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to set up streaming response',
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    } else {
      // Send error via stream
      const errorResponse: StreamResponse = {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      res.write(JSON.stringify(errorResponse) + '\n');
    }
  } finally {
    res.end();
    await prisma.$disconnect();
  }
}

/**
 * Abort handler following WebUI pattern exactly
 */
export function handleAbortRequest(req: Request, res: Response): Response {
  const requestId = req.params.requestId;
  
  if (!requestId) {
    return res.status(400).json({ error: "Request ID is required" });
  }

  const abortController = requestAbortControllers.get(requestId);
  if (abortController) {
    abortController.abort();
    requestAbortControllers.delete(requestId);
    
    logger.handlers.info('Request aborted', { requestId });
    return res.json({ success: true, message: "Request aborted" });
  }

  logger.handlers.warn('Abort request for unknown requestId', { requestId });
  return res.status(404).json({ error: "Request not found or already completed" });
}