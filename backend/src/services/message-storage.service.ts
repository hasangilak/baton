/**
 * Message Storage Service - Reliable message persistence with hybrid approach
 * 
 * This service ensures every message is stored with proper error handling
 * and immediate feedback to users. No retry mechanisms - errors are shown to user.
 */

import { PrismaClient, Message, Conversation } from '@prisma/client';
import { logger } from '../utils/logger';
import { StreamResponse } from '../types/claude-bridge';

export class MessageStorageService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create user message with immediate persistence (conversationId-first approach)
   * Hybrid approach: optimistic UI + DB confirmation
   */
  async createUserMessage(
    conversationId: string,
    content: string, 
    attachments?: Array<{ filename: string; mimeType: string; size: number; url: string }>,
    sessionId?: string,
    projectId?: string
  ): Promise<Message> {
    logger.storage?.info('Creating user message', { conversationId, contentLength: content.length, projectId });

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          ...(projectId && { projectId }),
          role: 'user',
          content,
          status: 'completed',
          ...(sessionId && { sessionId }),
          ...(attachments && {
            attachments: {
              create: attachments
            }
          }),
        },
        include: {
          attachments: true,
        },
      });

      logger.storage?.info('✅ User message created successfully', { messageId: message.id, conversationId });
      return message;
    } catch (error) {
      logger.storage?.error('❌ Failed to create user message', { error, conversationId, projectId });
      throw new Error(`Failed to save your message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create assistant message placeholder for streaming (conversationId-first approach)
   * Returns immediately for optimistic UI updates
   */
  async createAssistantMessagePlaceholder(conversationId: string, projectId?: string): Promise<Message> {
    logger.storage?.info('Creating assistant message placeholder', { conversationId, projectId });

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          ...(projectId && { projectId }),
          role: 'assistant',
          content: '',
          status: 'sending',
        },
      });

      logger.storage?.info('✅ Assistant placeholder created', { messageId: message.id, conversationId });
      return message;
    } catch (error) {
      logger.storage?.error('❌ Failed to create assistant placeholder', { error, conversationId, projectId });
      throw new Error(`Failed to prepare response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store Claude Code SDK message with rich metadata (conversationId-first approach)
   * Handles the new StreamResponse format with SDKMessage data
   */
  async createClaudeSDKMessage(
    conversationId: string,
    streamResponse: StreamResponse,
    projectId?: string
  ): Promise<Message> {
    // Extract sessionId from data.session_id since StreamResponse doesn't have sessionId field
    const sessionId = (streamResponse.data as any)?.session_id;
    
    logger.storage?.info('Creating Claude Code SDK message', { 
      conversationId,
      type: streamResponse.data?.type,
      sessionId,
      requestId: streamResponse.requestId,
      messageModel: (streamResponse.data as any)?.message?.model,
      projectId
    });

    try {
      let content = '';
      let role = 'assistant'; // Default role

      // Extract content based on SDKMessage type (with null checks)
      if (streamResponse.data && streamResponse.data.type === 'assistant') {
        // SDKAssistantMessage
        const assistantData = streamResponse.data as any;
        if (assistantData.message?.content) {
          if (Array.isArray(assistantData.message.content)) {
            content = assistantData.message.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
          } else if (typeof assistantData.message.content === 'string') {
            content = assistantData.message.content;
          }
        }
        role = 'assistant';
      } else if (streamResponse.data && streamResponse.data.type === 'user') {
        // SDKUserMessage
        const userData = streamResponse.data as any;
        if (userData.message?.content) {
          content = Array.isArray(userData.message.content) 
            ? JSON.stringify(userData.message.content)
            : String(userData.message.content);
        }
        role = 'user';
      } else if (streamResponse.data && streamResponse.data.type === 'result') {
        // SDKResultMessage
        const resultData = streamResponse.data as any;
        if (resultData.subtype === 'success') {
          content = resultData.result || `Execution completed successfully`;
        } else {
          content = `Execution ${resultData.subtype}: ${resultData.result || 'No details'}`;
        }
        role = 'system';
      } else if (streamResponse.data && streamResponse.data.type === 'system') {
        // SDKSystemMessage
        const systemData = streamResponse.data as any;
        content = `Claude Code initialized - Model: ${systemData.model}, Tools: ${systemData.tools?.length || 0}, MCP: ${systemData.mcp_servers?.length || 0}`;
        role = 'system';
      }

      // Classify message for smart display
      const classification = this.classifyMessage(streamResponse, content);

      const message = await this.prisma.message.create({
        data: {
          conversationId,
          ...(projectId && { projectId }),
          role,
          content,
          type: streamResponse.type,
          claudeData: streamResponse as any, // Store full StreamResponse
          claudeMessageId: (streamResponse.data as any)?.message?.id,
          model: (streamResponse.data as any)?.message?.model,
          sessionId, // Use the extracted sessionId with fallback logic
          usage: (streamResponse.data as any)?.message?.usage || (streamResponse.data as any)?.usage,
          timestamp: BigInt(streamResponse.timestamp),
          status: 'completed',
          
          // New classification fields
          messageClass: classification.class,
          isTransient: classification.isTransient,
          displayPriority: classification.priority,
        },
      });

      logger.storage?.info('✅ Claude Code SDK message created successfully', { 
        messageId: message.id,
        claudeMessageId: message.claudeMessageId,
        model: message.model,
        contentLength: content.length,
        role,
        conversationId
      });

      return message;
    } catch (error) {
      logger.storage?.error('❌ Failed to create Claude Code SDK message', { error, conversationId, projectId });
      throw new Error(`Failed to save Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update assistant message during streaming
   * Hybrid approach: immediate DB update + optimistic UI
   * ENHANCED WITH COMPREHENSIVE DEBUGGING
   */
  async updateAssistantMessageStreaming(
    messageId: string, 
    content: string, 
    isComplete: boolean = false,
    sessionId?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    
    logger.storage?.info('🔄 STARTING updateAssistantMessageStreaming', { 
      messageId, 
      contentLength: content.length, 
      isComplete,
      hasSessionId: !!sessionId,
      sessionId,
      timestamp
    });

    // Check if message exists before updating
    try {
      const existingMessage = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, conversationId: true, content: true, status: true }
      });
      
      if (!existingMessage) {
        logger.storage?.error('❌ MESSAGE NOT FOUND - Cannot update non-existent message', { messageId });
        return;
      }
      
      logger.storage?.info('✅ Message exists, proceeding with update', { 
        messageId,
        currentStatus: existingMessage.status,
        currentContentLength: existingMessage.content.length,
        newContentLength: content.length
      });
    } catch (error) {
      logger.storage?.error('❌ Error checking message existence', { error, messageId });
      return;
    }

    try {
      logger.storage?.info('🏗️ Starting database transaction', { messageId });
      
      await this.prisma.$transaction(async (tx) => {
        logger.storage?.info('📝 Updating message content in transaction', { 
          messageId, 
          contentPreview: content.substring(0, 100),
          isComplete,
          status: isComplete ? 'completed' : 'sending'
        });
        
        // Update message content and status and get conversation ID
        const updatedMessage = await tx.message.update({
          where: { id: messageId },
          data: {
            content,
            status: isComplete ? 'completed' : 'sending',
            updatedAt: new Date(),
          },
          select: {
            conversationId: true,
            content: true,
            status: true
          },
        });

        logger.storage?.info('✅ Message updated successfully in transaction', { 
          messageId,
          conversationId: updatedMessage.conversationId,
          newStatus: updatedMessage.status,
          newContentLength: updatedMessage.content.length
        });

        // Update conversation timestamp and session ID if provided
        const conversationUpdateData: any = {
          updatedAt: new Date(),
        };

        if (sessionId) {
          conversationUpdateData.claudeSessionId = sessionId;
          logger.storage?.info('🆔 Adding session ID to conversation update', { 
            sessionId,
            conversationId: updatedMessage.conversationId
          });
        }

        logger.storage?.info('💬 Updating conversation in transaction', { 
          conversationId: updatedMessage.conversationId,
          updateData: conversationUpdateData
        });

        // Fix: Use conversation ID (unique identifier) instead of relation query
        const updatedConversation = await tx.conversation.update({
          where: { id: updatedMessage.conversationId }, // Use unique ID
          data: conversationUpdateData,
          select: { claudeSessionId: true, updatedAt: true }
        });

        logger.storage?.info('✅ Conversation updated successfully in transaction', { 
          conversationId: updatedMessage.conversationId,
          newSessionId: updatedConversation.claudeSessionId,
          newUpdatedAt: updatedConversation.updatedAt
        });
      });

      logger.storage?.info('✅ TRANSACTION COMPLETED SUCCESSFULLY', { messageId, isComplete });

      if (isComplete) {
        logger.storage?.info('🎯 Assistant message marked as COMPLETED', { 
          messageId, 
          finalLength: content.length,
          sessionId 
        });
      } else {
        logger.storage?.debug('📊 Assistant message updated (still streaming)', { 
          messageId, 
          currentLength: content.length 
        });
      }
    } catch (error) {
      logger.storage?.error('❌ CRITICAL: Transaction failed in updateAssistantMessageStreaming', { 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        messageId, 
        isComplete,
        contentLength: content.length,
        sessionId
      });
      
      // Don't throw during streaming - mark message as failed instead
      logger.storage?.info('🚨 Marking message as failed due to transaction error', { messageId });
      await this.markMessageFailed(messageId, error instanceof Error ? error.message : 'Storage error');
    }
  }

  /**
   * Mark message as failed with error details
   * Shows error to user without retry
   */
  async markMessageFailed(messageId: string, errorMessage: string): Promise<void> {
    logger.storage?.error('Marking message as failed', { messageId, errorMessage });

    try {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'failed',
          error: errorMessage,
          updatedAt: new Date(),
        },
      });

      logger.storage?.info('✅ Message marked as failed', { messageId });
    } catch (error) {
      logger.storage?.error('❌ Failed to mark message as failed', { error, messageId });
      // This is critical - if we can't even mark as failed, log extensively
      console.error('CRITICAL: Cannot mark message as failed', { messageId, originalError: errorMessage, markError: error });
    }
  }

  /**
   * Get conversation for context (used by streaming endpoints)
   */
  async getConversationWithProject(conversationId: string): Promise<(Conversation & { project: any }) | null> {
    try {
      return await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { project: true },
      });
    } catch (error) {
      logger.storage?.error('❌ Failed to get conversation', { error, conversationId });
      throw new Error(`Conversation not found: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update conversation session ID for context preservation
   */
  async updateConversationSession(conversationId: string, sessionId: string): Promise<void> {
    logger.storage?.info('Updating conversation session', { conversationId, sessionId });

    try {
      // Update the conversation directly by conversationId
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { 
          claudeSessionId: sessionId,
          updatedAt: new Date(),
        },
        });

        logger.storage?.info('✅ Session ID updated', { conversationId, sessionId });
    } catch (error) {
      logger.storage?.error('❌ Failed to update session ID', { error, conversationId, sessionId });
      // Don't throw - session update failures shouldn't break the stream
    }
  }

  /**
   * Update message with session ID
   */
  async updateMessageSessionId(messageId: string, sessionId: string): Promise<void> {
    logger.storage?.info('Updating message with session ID', { messageId, sessionId });

    try {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { 
          sessionId: sessionId,
          updatedAt: new Date(),
        },
      });

      logger.storage?.info('✅ Message updated with session ID', { messageId, sessionId });
    } catch (error) {
      logger.storage?.error('❌ Failed to update message with session ID', { error, messageId, sessionId });
      // Don't throw - session update failures shouldn't break the stream
    }
  }

  /**
   * Extract and store code blocks from message content
   * Enhanced version from stream-webui patterns
   */
  async extractAndSaveCodeBlocks(messageId: string, content: string): Promise<void> {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'plaintext';
      const code = String(match[2]).trim();
      
      codeBlocks.push({
        messageId,
        language,
        code,
      });
    }

    if (codeBlocks.length > 0) {
      try {
        await this.prisma.codeBlock.createMany({
          data: codeBlocks,
        });
        
        logger.storage?.info('✅ Code blocks extracted', { messageId, count: codeBlocks.length });
      } catch (error) {
        logger.storage?.error('❌ Failed to save code blocks', { error, messageId });
        // Don't throw - code block extraction is secondary
      }
    }
  }

  /**
   * Get all messages for a conversation (used by frontend Zustand store)
   */
  async getConversationMessages(conversationId: string): Promise<Message[]> {
    logger.storage?.info('Fetching conversation messages', { conversationId });

    try {
      const messages = await this.prisma.message.findMany({
        where: { 
          conversationId,
          // Only fetch completed or failed messages, exclude placeholders/sending
          status: { in: ['completed', 'failed'] }
        },
        include: {
          attachments: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      logger.storage?.info('✅ Conversation messages retrieved', { 
        conversationId, 
        messageCount: messages.length 
      });

      return messages;
    } catch (error) {
      logger.storage?.error('❌ Failed to get conversation messages', { error, conversationId });
      throw new Error(`Failed to fetch messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage health status for monitoring
   */
  async getStorageHealth(): Promise<{ healthy: boolean; details: string }> {
    try {
      // Simple health check - try to query the database
      await this.prisma.conversation.count({ take: 1 });
      return { healthy: true, details: 'Database connection healthy' };
    } catch (error) {
      return { 
        healthy: false, 
        details: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Classify message for smart display handling
   * Determines if a message is transient (status/thinking) or persistent content
   */
  private classifyMessage(streamResponse: StreamResponse, content: string): {
    class: string;
    isTransient: boolean;
    priority: string;
  } {
    // Check for status patterns in content
    const statusPatterns = [
      /^Currently\s+\w+ing/i,    // Currently reading/writing/searching
      /^Thinking\.?\.\./i,       // Thinking...
      /^Processing\b/i,          // Processing...
      /^Analyzing\b/i,           // Analyzing...
      /^Loading\b/i,             // Loading...
      /^Searching\b/i,           // Searching...
      /^Reading\s+files?\b/i,    // Reading files
      /^Writing\s+to\b/i,        // Writing to...
    ];

    const isStatusMessage = statusPatterns.some(pattern => pattern.test(content.trim()));

    // Check if this is a tool execution message
    const assistantData = streamResponse.data as any;
    const hasToolUse = assistantData?.message?.content?.some?.((block: any) => block.type === 'tool_use');

    if (isStatusMessage) {
      return {
        class: 'status',
        isTransient: true,
        priority: 'ephemeral'
      };
    }

    if (hasToolUse) {
      return {
        class: 'tool',
        isTransient: false,
        priority: 'secondary'
      };
    }

    if (streamResponse.data?.type === 'result') {
      return {
        class: 'result',
        isTransient: false,
        priority: 'secondary'
      };
    }

    // Default to content
    return {
      class: 'content',
      isTransient: false,
      priority: 'primary'
    };
  }
}

// Create singleton instance for reuse
let messageStorageService: MessageStorageService | null = null;

export function getMessageStorageService(prisma: PrismaClient): MessageStorageService {
  if (!messageStorageService) {
    messageStorageService = new MessageStorageService(prisma);
  }
  return messageStorageService;
}