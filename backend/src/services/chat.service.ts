import { PrismaClient, Conversation, Message } from '@prisma/client';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();

interface ChatServiceConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

interface StreamingResponse {
  id: string;
  content: string;
  isComplete: boolean;
  error?: string;
}

export class ChatService extends EventEmitter {
  private anthropic: Anthropic;
  private defaultModel: string;
  private maxTokens: number;

  constructor(config: ChatServiceConfig = {}) {
    super();
    
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.anthropic = new Anthropic({ apiKey });
    this.defaultModel = config.model || 'claude-3-sonnet-20240229';
    this.maxTokens = config.maxTokens || 4096;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    projectId: string,
    userId: string,
    title?: string
  ): Promise<Conversation> {
    return prisma.conversation.create({
      data: {
        projectId,
        userId,
        title: title || 'New Conversation',
        model: this.defaultModel,
      },
      include: {
        project: true,
        user: true,
      },
    });
  }

  /**
   * Get conversations for a project
   */
  async getConversations(projectId: string, userId: string) {
    return prisma.conversation.findMany({
      where: {
        projectId,
        userId,
        status: 'active',
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string) {
    return prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        attachments: true,
        codeBlocks: true,
      },
    });
  }

  /**
   * Send a message and get streaming response
   */
  async sendMessage(
    conversationId: string,
    content: string,
    attachments?: Array<{ filename: string; mimeType: string; size: number; url: string }>
  ): Promise<Message> {
    // Create user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content,
        attachments: {
          create: attachments || [],
        },
      },
      include: {
        attachments: true,
      },
    });

    // Get conversation history for context
    const messages = await this.getMessages(conversationId);
    
    // Prepare messages for Claude API
    const claudeMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Create assistant message placeholder
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        status: 'sending',
        model: this.defaultModel,
      },
    });

    // Start streaming response
    this.streamResponse(assistantMessage.id, claudeMessages);

    return assistantMessage;
  }

  /**
   * Stream response from Claude
   */
  private async streamResponse(
    messageId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ) {
    try {
      const stream = await this.anthropic.messages.create({
        model: this.defaultModel,
        max_tokens: this.maxTokens,
        messages,
        stream: true,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullContent += chunk.delta.text;
          
          // Emit streaming update
          this.emit('stream', {
            id: messageId,
            content: fullContent,
            isComplete: false,
          } as StreamingResponse);
        }
      }

      // Update message with complete content
      await prisma.message.update({
        where: { id: messageId },
        data: {
          content: fullContent,
          status: 'completed',
          tokenCount: this.estimateTokens(fullContent),
        },
      });

      // Extract and save code blocks
      await this.extractAndSaveCodeBlocks(messageId, fullContent);

      // Emit completion
      this.emit('stream', {
        id: messageId,
        content: fullContent,
        isComplete: true,
      } as StreamingResponse);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update message with error
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      });

      // Emit error
      this.emit('stream', {
        id: messageId,
        content: '',
        isComplete: true,
        error: errorMessage,
      } as StreamingResponse);
    }
  }

  /**
   * Extract code blocks from message content
   */
  private async extractAndSaveCodeBlocks(messageId: string, content: string) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'plaintext';
      const code = match[2].trim();
      
      codeBlocks.push({
        messageId,
        language,
        code,
      });
    }

    if (codeBlocks.length > 0) {
      await prisma.codeBlock.createMany({
        data: codeBlocks,
      });
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Update conversation title based on first message
   */
  async updateConversationTitle(conversationId: string) {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        role: 'user',
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 1,
    });

    if (messages.length > 0) {
      const firstMessage = messages[0];
      const title = firstMessage.content.substring(0, 100) + 
                   (firstMessage.content.length > 100 ? '...' : '');

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'archived' },
    });
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string) {
    return prisma.conversation.delete({
      where: { id: conversationId },
    });
  }

  /**
   * Search conversations
   */
  async searchConversations(projectId: string, userId: string, query: string) {
    return prisma.conversation.findMany({
      where: {
        projectId,
        userId,
        status: 'active',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          {
            messages: {
              some: {
                content: { contains: query, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        messages: {
          where: {
            content: { contains: query, mode: 'insensitive' },
          },
          take: 3,
        },
      },
    });
  }
}

// Export singleton instance
export const chatService = new ChatService();