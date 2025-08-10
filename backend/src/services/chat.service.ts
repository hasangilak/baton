import { PrismaClient, Conversation, Message } from '@prisma/client';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

interface ChatServiceConfig {
  useBridge?: boolean;  // Use external Claude Code bridge
  bridgeTimeout?: number; // Timeout for bridge responses
}

interface StreamingResponse {
  id: string;
  content: string;
  isComplete: boolean;
  error?: string;
}

export class ChatService extends EventEmitter {
  private useBridge: boolean;
  private bridgeTimeout: number;
  private pendingRequests: Map<string, any>;

  constructor(config: ChatServiceConfig = {}) {
    super();
    
    this.useBridge = config.useBridge !== false; // Default to true
    this.bridgeTimeout = config.bridgeTimeout || 60000; // 60 seconds
    this.pendingRequests = new Map();
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
        model: 'claude-code-headless',
      },
      include: {
        project: true,
        user: true,
      },
    });
  }

  /**
   * Get conversations for a project, grouped by session ID
   */
  async getConversations(projectId: string, userId: string) {
    const conversations = await prisma.conversation.findMany({
      where: {
        projectId,
        userId,
        status: 'active',
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        userId: true,
        claudeSessionId: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    // Group conversations by session ID
    const grouped = conversations.reduce((acc, conversation) => {
      const sessionId = conversation.claudeSessionId || 'no-session';
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(conversation);
      return acc;
    }, {} as Record<string, typeof conversations>);

    // Flatten back to array, but maintain session grouping order
    return Object.entries(grouped)
      .sort(([, a], [, b]) => {
        // Sort by most recent conversation in each session
        const aLatest = Math.max(...a.map(c => new Date(c.updatedAt).getTime()));
        const bLatest = Math.max(...b.map(c => new Date(c.updatedAt).getTime()));
        return bLatest - aLatest;
      })
      .flatMap(([, sessionConversations]) => 
        sessionConversations.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      );
  }

  /**
   * Get messages for a conversation with optional session ID validation
   */
  async getMessages(conversationId: string, sessionId?: string) {
    // If sessionId is provided, validate that the conversation belongs to that session
    if (sessionId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { claudeSessionId: true, title: true },
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (conversation.claudeSessionId !== sessionId) {
        throw new Error(`Conversation does not belong to session ${sessionId}. Expected: ${conversation.claudeSessionId}`);
      }
    }

    const messages = await prisma.message.findMany({
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

    // Convert BigInt timestamp to number for JSON serialization
    return messages.map(message => ({
      ...message,
      timestamp: message.timestamp ? Number(message.timestamp) : null,
    }));
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
    await prisma.message.create({
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

    // Create assistant message placeholder
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        status: 'sending',
        model: 'claude-code-headless',
      },
    });

    // Start processing based on mode
    if (this.useBridge) {
      // Queue request for external Claude Code processing
      await this.queueForBridge(assistantMessage.id, content, conversationId);
    } else {
      // Fallback to mock response
      await this.generateMockResponse(assistantMessage.id, content);
    }

    return assistantMessage;
  }

  /**
   * Queue request for external Claude Code bridge processing
   */
  private async queueForBridge(
    messageId: string,
    prompt: string,
    conversationId: string
  ) {
    try {
      // Get conversation context
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          project: {
            include: {
              tasks: {
                where: { status: { not: 'archived' } },
                orderBy: { updatedAt: 'desc' },
              },
            },
          },
        },
      });

      // Store request for bridge to pick up
      const request = {
        messageId,
        conversationId,
        prompt,
        projectContext: conversation?.project ? {
          name: conversation.project.name,
          tasks: conversation.project.tasks.map(t => ({
            title: t.title,
            status: t.status
          }))
        } : null,
        timestamp: new Date(),
        status: 'pending'
      };

      this.pendingRequests.set(messageId, request);
      
      // Emit event for bridge to pick up
      this.emit('bridge_request', request);

      // Set timeout for response
      setTimeout(async () => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          
          // Timeout - generate fallback response
          await this.generateMockResponse(messageId, prompt);
        }
      }, this.bridgeTimeout);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.handleError(messageId, errorMessage);
    }
  }

  /**
   * Process response from Claude Code bridge
   */
  async processBridgeResponse(
    messageId: string,
    content: string,
    isComplete: boolean,
    error?: string,
    toolUsages?: any[]
  ): Promise<{ conversationId?: string }> {
    // Get conversation ID from message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true }
    });

    const conversationId = message?.conversationId;

    // Remove from pending if complete
    if (isComplete) {
      this.pendingRequests.delete(messageId);
    }

    if (error) {
      await this.handleError(messageId, error);
      return conversationId ? { conversationId } : {};
    }

    // Emit streaming update with tool usage
    this.emit('stream', {
      id: messageId,
      content,
      isComplete,
      toolUsages,
    } as StreamingResponse);

    if (isComplete) {
      // Store tool usage in metadata if present
      const metadata: any = {};
      if (toolUsages && toolUsages.length > 0) {
        metadata.toolUsages = toolUsages;
      }

      // Update message with complete content and tool usage
      await prisma.message.update({
        where: { id: messageId },
        data: {
          content: content || 'No response generated',
          status: 'completed',
          tokenCount: this.estimateTokens(content),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      });

      // Extract and save code blocks
      await this.extractAndSaveCodeBlocks(messageId, content);
    }
    
    return conversationId ? { conversationId } : {};
  }

  /**
   * Generate mock response when bridge is not available
   */
  private async generateMockResponse(
    messageId: string,
    prompt: string
  ) {
    const mockResponse = `I'm currently running in bridge mode, waiting for Claude Code to be connected.

To enable Claude Code chat:
1. Make sure Claude Code is installed locally: npm install -g @anthropic-ai/claude-code
2. Run the chat handler: node scripts/chat-handler.js
3. The handler will process your messages using your local Claude Code

Your prompt was: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" `;

    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: mockResponse,
        status: 'completed',
        tokenCount: this.estimateTokens(mockResponse),
      },
    });

    this.emit('stream', {
      id: messageId,
      content: mockResponse,
      isComplete: true,
    } as StreamingResponse);
  }

  /**
   * Handle errors
   */
  private async handleError(messageId: string, errorMessage: string) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'failed',
        error: errorMessage,
      },
    });

    this.emit('stream', {
      id: messageId,
      content: '',
      isComplete: true,
      error: errorMessage,
    } as StreamingResponse);
  }

  /**
   * Get pending chat requests for bridge
   */
  getPendingRequests() {
    return Array.from(this.pendingRequests.values())
      .filter(r => r.status === 'pending');
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
      const code = String(match[2]).trim();
      
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
      if (firstMessage) {
        const title = firstMessage.content.substring(0, 100) + 
                     (firstMessage.content.length > 100 ? '...' : '');

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title },
        });
      }
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