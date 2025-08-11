/**
 * Streaming Chat Handler - WebSocket Version
 * 
 * This has been refactored to work with WebSocket communication instead of HTTP streaming.
 * The core streaming logic is preserved but adapted for WebSocket event-based communication.
 * 
 * NOTE: This file is now primarily used for WebSocket-based streaming via Socket.IO events.
 * HTTP endpoints have been deprecated in favor of WebSocket communication.
 */

import { PrismaClient } from '@prisma/client';
import { StreamResponse, StreamingContext, AbortError } from '../types/streaming';
import { logger } from '../utils/logger';
import type { Socket } from 'socket.io';

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
 * WebSocket handler for streaming chat requests
 * Refactored from HTTP SSE to WebSocket event-based streaming
 */
export async function handleWebSocketChat(
  socket: Socket,
  data: {
    message: string;
    requestId: string;
    conversationId: string;
    sessionId?: string;
    allowedTools?: string[];
    workingDirectory?: string;
    permissionMode?: string;
  }
): Promise<void> {
  const prisma = new PrismaClient();
  
  try {
    const { message, requestId, conversationId, sessionId, allowedTools, workingDirectory, permissionMode } = data;
    
    // Validate required parameters
    if (!message || !requestId || !conversationId) {
      socket.emit('chat:error', {
        requestId: requestId || 'unknown',
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
      socket.emit('chat:error', {
        requestId,
        error: 'Conversation not found'
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

    // Process streaming responses via WebSocket integration
    let fullContent = '';
    let currentSessionId = streamingContext.sessionId;
    let delegatedToHandler = false;

    // Set up listener for responses from bridge service
    const { io } = await import('../index');
    let responseHandler: ((data: any) => void) | null = null;
    let streamCompleted = false;

    // Execute streaming with AsyncGenerator (which will delegate to bridge service)
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

      // Send initial delegation confirmation via WebSocket
      socket.emit('chat:stream-response', response);

      // If this is a delegation response, set up WebSocket listener
      if (streamResponse.type === 'delegated' && !delegatedToHandler) {
        delegatedToHandler = true;
        logger.handlers.info('Setting up WebSocket listener for delegated request', { requestId });
        
        // Set up response handler for this specific request
        responseHandler = (data: any) => {
          logger.handlers.info('Received WebSocket response from bridge', { 
            hasRequestId: !!data.requestId,
            targetRequestId: requestId,
            matches: data.requestId === requestId,
            responseType: data.type
          });
          
          if (data.requestId === requestId) {
            logger.handlers.info('Processing response from bridge service', { 
              requestId, 
              responseType: data.type
            });
            
            // Check for session ID and emit session:available event
            if (data.sessionId && !currentSessionId) {
              currentSessionId = data.sessionId;
              logger.handlers.info('Session ID received, emitting session:available', { 
                sessionId: currentSessionId, 
                conversationId 
              });
              
              // Emit session:available event to frontend
              socket.emit('session:available', {
                conversationId,
                sessionId: currentSessionId
              });
              
              // Also emit the WebSocket-specific event
              socket.emit('chat:session-id-available', {
                conversationId,
                sessionId: currentSessionId
              });
            }
            
            // Extract content from Claude stream data
            if (data.type === 'claude_json' && data.data) {
              let newContent = '';
              if (data.data.type === 'assistant' && data.data.message) {
                if (Array.isArray(data.data.message.content)) {
                  newContent = data.data.message.content
                    .filter((block: any) => block.type === 'text')
                    .map((block: any) => block.text)
                    .join('');
                } else if (typeof data.data.message.content === 'string') {
                  newContent = data.data.message.content;
                }
              }
              
              if (newContent && newContent !== fullContent) {
                fullContent = newContent;
              }
            }
            
            // Forward the stream response to frontend via WebSocket
            socket.emit('chat:stream-response', {
              requestId,
              type: data.type,
              data: data.data,
              messageId: assistantMessage.id,
              timestamp: data.timestamp
            });
            
            logger.handlers.info('Forwarded stream response to frontend via WebSocket', { 
              requestId, 
              responseType: data.type 
            });
          }
        };
        
        // Listen for bridge responses
        socket.on('claude:stream', responseHandler);
        
        // Listen for completion
        socket.once('claude:complete', (data: any) => {
          if (data.requestId === requestId) {
            streamCompleted = true;
            currentSessionId = data.sessionId || currentSessionId;
            logger.handlers.info('🎯 Stream completion detected via bridge service', { requestId });
            
            // Send final done response
            socket.emit('chat:message-complete', {
              requestId,
              messageId: assistantMessage.id,
              sessionId: currentSessionId,
              timestamp: data.timestamp
            });
            logger.handlers.info('Sent final completion response', { requestId });
          }
        });
        
        // Listen for errors
        socket.once('claude:error', (data: any) => {
          if (data.requestId === requestId) {
            streamCompleted = true;
            logger.handlers.error('Received error from bridge service', { requestId, error: data.error });
            
            socket.emit('chat:error', {
              requestId,
              messageId: assistantMessage.id,
              error: data.error,
              timestamp: data.timestamp
            });
          }
        });
        
        // Wait for completion with timeout
        const waitForCompletion = new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (!streamCompleted) {
              logger.handlers.warn('Bridge service response timeout', { requestId });
              streamCompleted = true;
              socket.emit('chat:error', {
                requestId,
                messageId: assistantMessage.id,
                error: 'Bridge service timeout'
              });
              resolve();
            }
          }, 30000); // 30 second timeout
          
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

    // Clean up WebSocket listeners
    if (responseHandler) {
      socket.off('claude:stream', responseHandler);
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
    
    logger.handlers.info('WebSocket streaming chat completed', { requestId, messageId: assistantMessage.id });

  } catch (error) {
    logger.handlers.error('WebSocket stream setup error', { error });
    
    socket.emit('chat:error', {
      requestId: data.requestId,
      error: 'Failed to set up streaming response',
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * WebSocket abort handler
 */
export function handleWebSocketAbort(
  socket: Socket,
  requestId: string
): void {
  if (!requestId) {
    socket.emit('chat:error', {
      requestId: 'unknown',
      error: 'Request ID is required for abort'
    });
    return;
  }

  const abortController = requestAbortControllers.get(requestId);
  if (abortController) {
    abortController.abort();
    requestAbortControllers.delete(requestId);
    
    logger.handlers.info('Request aborted via WebSocket', { requestId });
    socket.emit('chat:aborted', {
      requestId,
      message: 'Request aborted successfully',
      timestamp: Date.now()
    });
  } else {
    logger.handlers.warn('Abort request for unknown requestId', { requestId });
    socket.emit('chat:error', {
      requestId,
      error: 'Request not found or already completed'
    });
  }
}