/**
 * Message Storage Service - Reliable message persistence with hybrid approach
 * 
 * This service ensures every message is stored with proper error handling
 * and immediate feedback to users. No retry mechanisms - errors are shown to user.
 */

import { PrismaClient, Message, Conversation } from '@prisma/client';
import { logger } from '../utils/logger';

export class MessageStorageService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create user message with immediate persistence
   * Hybrid approach: optimistic UI + DB confirmation
   */
  async createUserMessage(
    conversationId: string, 
    content: string, 
    attachments?: Array<{ filename: string; mimeType: string; size: number; url: string }>
  ): Promise<Message> {
    logger.storage?.info('Creating user message', { conversationId, contentLength: content.length });

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content,
          status: 'completed',
          attachments: attachments ? {
            create: attachments
          } : undefined,
        },
        include: {
          attachments: true,
        },
      });

      logger.storage?.info('✅ User message created successfully', { messageId: message.id });
      return message;
    } catch (error) {
      logger.storage?.error('❌ Failed to create user message', { error, conversationId });
      throw new Error(`Failed to save your message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create assistant message placeholder for streaming
   * Returns immediately for optimistic UI updates
   */
  async createAssistantMessagePlaceholder(conversationId: string): Promise<Message> {
    logger.storage?.info('Creating assistant message placeholder', { conversationId });

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: '',
          status: 'sending',
        },
      });

      logger.storage?.info('✅ Assistant placeholder created', { messageId: message.id });
      return message;
    } catch (error) {
      logger.storage?.error('❌ Failed to create assistant placeholder', { error, conversationId });
      throw new Error(`Failed to prepare response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update assistant message during streaming
   * Hybrid approach: immediate DB update + optimistic UI
   */
  async updateAssistantMessageStreaming(
    messageId: string, 
    content: string, 
    isComplete: boolean = false,
    sessionId?: string
  ): Promise<void> {
    logger.storage?.debug('Updating streaming message', { 
      messageId, 
      contentLength: content.length, 
      isComplete,
      hasSessionId: !!sessionId 
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        // Update message content and status and get conversation ID
        const updatedMessage = await tx.message.update({
          where: { id: messageId },
          data: {
            content,
            status: isComplete ? 'completed' : 'sending',
            updatedAt: new Date(),
          },
          select: {
            conversationId: true, // Get conversation ID for next update
          },
        });

        // Update conversation timestamp and session ID if provided
        const conversationUpdateData: any = {
          updatedAt: new Date(),
        };

        if (sessionId) {
          conversationUpdateData.claudeSessionId = sessionId;
        }

        // Fix: Use conversation ID (unique identifier) instead of relation query
        await tx.conversation.update({
          where: { id: updatedMessage.conversationId }, // Use unique ID
          data: conversationUpdateData,
        });
      });

      if (isComplete) {
        logger.storage?.info('✅ Assistant message completed', { messageId, finalLength: content.length });
      }
    } catch (error) {
      logger.storage?.error('❌ Failed to update streaming message', { 
        error, 
        messageId, 
        isComplete 
      });
      
      // Don't throw during streaming - mark message as failed instead
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
   * Update conversation session ID immediately upon capture
   */
  async updateConversationSession(conversationId: string, sessionId: string): Promise<void> {
    logger.storage?.info('Updating conversation session', { conversationId, sessionId });

    try {
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
}

// Create singleton instance for reuse
let messageStorageService: MessageStorageService | null = null;

export function getMessageStorageService(prisma: PrismaClient): MessageStorageService {
  if (!messageStorageService) {
    messageStorageService = new MessageStorageService(prisma);
  }
  return messageStorageService;
}