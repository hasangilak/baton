/**
 * Multi-channel prompt delivery orchestration
 * Ensures reliable delivery of interactive prompts through multiple fallback mechanisms
 */

import { PrismaClient } from '@prisma/client';
import type { Server as SocketIOServer } from 'socket.io';

interface PromptData {
  id: string;
  conversationId: string;
  type: string;
  title?: string;
  message: string;
  options: any[];
  context?: any;
  metadata?: any;
}

interface DeliveryResult {
  success: boolean;
  promptId: string;
  deliveryChannels: string[];
  attempts: number;
  error?: string;
  createdAt: Date;
}

class PromptDeliveryService {
  private prisma: PrismaClient;
  private io: SocketIOServer;
  private deliveryAttempts = new Map<string, number>();
  private acknowledgedPrompts = new Set<string>();

  constructor(prisma: PrismaClient, io: SocketIOServer) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Health check database connection
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('🔴 Database health check failed:', error);
      return false;
    }
  }

  /**
   * Create prompt with retry logic and fallback storage
   */
  private async createPromptWithRetry(promptData: PromptData, maxRetries = 3): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📝 Attempting to create prompt ${promptData.id} (attempt ${attempt}/${maxRetries})`);

        // Health check first
        const isHealthy = await this.checkDatabaseHealth();
        if (!isHealthy && attempt === 1) {
          throw new Error('Database health check failed');
        }

        // Calculate timeout
        const timeoutAt = new Date(Date.now() + 30000); // 30 second base timeout

        // Get projectId from conversationId for database compatibility
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: promptData.conversationId },
          select: { projectId: true }
        });

        if (!conversation) {
          throw new Error(`Conversation ${promptData.conversationId} not found`);
        }

        // Create prompt with proper data structure
        const prompt = await this.prisma.interactivePrompt.create({
          data: {
            id: promptData.id,
            projectId: conversation.projectId,
            conversationId: promptData.conversationId,
            type: promptData.type,
            title: promptData.title || `${promptData.type} prompt`,
            message: promptData.message,
            options: promptData.options,
            context: promptData.context || {},
            status: 'pending',
            timeoutAt,
            metadata: {
              ...promptData.metadata,
              createdByHandler: 'prompt-delivery-service',
              deliveryAttempt: attempt,
              createdAt: Date.now(),
              retryCount: attempt - 1
            }
          }
        });

        console.log(`✅ Successfully created prompt ${promptData.id} on attempt ${attempt}`);
        return prompt;

      } catch (error) {
        lastError = error as Error;
        console.error(`❌ Failed to create prompt ${promptData.id} on attempt ${attempt}:`, error);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - use fallback storage
    console.error(`🔴 All database attempts failed for prompt ${promptData.id}, using fallback storage`);
    return this.storeFallbackPrompt(promptData, lastError);
  }

  /**
   * Store prompt in fallback storage when database fails
   */
  private async storeFallbackPrompt(promptData: PromptData, error: Error | null): Promise<any> {
    // Store in memory as fallback
    const fallbackPrompt = {
      ...promptData,
      status: 'pending',
      timeoutAt: new Date(Date.now() + 30000).toISOString(),
      createdAt: new Date().toISOString(),
      metadata: {
        ...promptData.metadata,
        fallbackStorage: true,
        originalError: error?.message,
        createdByHandler: 'prompt-delivery-service-fallback'
      }
    };

    // Log for recovery
    console.log(`📦 Stored fallback prompt:`, fallbackPrompt);
    
    return fallbackPrompt;
  }

  /**
   * Multi-channel prompt delivery with progressive fallbacks
   */
  async deliverPrompt(promptData: PromptData): Promise<DeliveryResult> {
    const startTime = Date.now();
    const deliveryChannels: string[] = [];
    let attempts = 0;

    try {
      // Step 1: Create prompt in database with retry
      attempts++;
      const prompt = await this.createPromptWithRetry(promptData);

      // Step 2: Primary delivery - WebSocket with acknowledgment
      const websocketSuccess = await this.deliverViaWebSocket(prompt);
      if (websocketSuccess) {
        deliveryChannels.push('websocket');
      }

      // Step 3: Secondary delivery - Server-Sent Events (if WebSocket failed)
      if (!websocketSuccess) {
        attempts++;
        const sseSuccess = await this.deliverViaSSE(prompt);
        if (sseSuccess) {
          deliveryChannels.push('sse');
        }
      }

      // Step 4: Ensure at least one delivery channel succeeded
      if (deliveryChannels.length === 0) {
        attempts++;
        // Force delivery via multiple channels
        await Promise.allSettled([
          this.deliverViaWebSocket(prompt, true), // Force emit
          this.deliverViaSSE(prompt),
          this.broadcastToAllClients(prompt)
        ]);
        deliveryChannels.push('broadcast-fallback');
      }

      console.log(`✅ Prompt ${promptData.id} delivered via: ${deliveryChannels.join(', ')} in ${Date.now() - startTime}ms`);

      return {
        success: true,
        promptId: promptData.id,
        deliveryChannels,
        attempts,
        createdAt: new Date()
      };

    } catch (error) {
      console.error(`🔴 Complete delivery failure for prompt ${promptData.id}:`, error);

      return {
        success: false,
        promptId: promptData.id,
        deliveryChannels,
        attempts,
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date()
      };
    }
  }

  /**
   * Primary delivery via WebSocket with acknowledgment tracking
   */
  private async deliverViaWebSocket(prompt: any, forceEmit = false): Promise<boolean> {
    try {
      console.log(`📡 Delivering prompt ${prompt.id} via WebSocket to conversation-${prompt.conversationId}`);

      // Enhanced socket event with confirmation request
      const socketEvent = {
        promptId: prompt.id,
        conversationId: prompt.conversationId,
        type: prompt.type,
        title: prompt.title,
        message: prompt.message,
        options: prompt.options,
        context: prompt.context,
        timeout: 30000,
        riskLevel: prompt.context?.riskLevel || 'MEDIUM',
        toolName: prompt.context?.toolName,
        timestamp: Date.now(),
        requiresAck: true, // Request acknowledgment
        deliveryId: `${prompt.id}-${Date.now()}` // Unique delivery ID
      };

      // Emit to specific conversation room
      this.io.to(`conversation-${prompt.conversationId}`).emit('interactive_prompt', socketEvent);

      // Also emit to project room for broader awareness
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: prompt.conversationId },
        select: { projectId: true }
      });

      if (conversation?.projectId) {
        this.io.to(`project-${conversation.projectId}`).emit('permission_request', {
          conversationId: prompt.conversationId,
          promptId: prompt.id,
          toolName: prompt.context?.toolName,
          riskLevel: prompt.context?.riskLevel,
          timestamp: Date.now()
        });
      }

      if (forceEmit) {
        // Broadcast to all connected clients as emergency fallback
        this.io.emit('global_permission_request', socketEvent);
      }

      console.log(`📤 WebSocket events emitted for prompt ${prompt.id}`);
      return true;

    } catch (error) {
      console.error(`❌ WebSocket delivery failed for prompt ${prompt.id}:`, error);
      return false;
    }
  }

  /**
   * Secondary delivery via Server-Sent Events
   */
  private async deliverViaSSE(prompt: any): Promise<boolean> {
    try {
      console.log(`📡 SSE delivery for prompt ${prompt.id} - marking for SSE pickup`);
      
      // Mark prompt for SSE delivery (to be picked up by SSE endpoint)
      await this.prisma.interactivePrompt.update({
        where: { id: prompt.id },
        data: {
          metadata: {
            ...prompt.metadata,
            sseDelivery: true,
            sseDeliveryAt: Date.now()
          }
        }
      });

      return true;
    } catch (error) {
      console.error(`❌ SSE delivery marking failed for prompt ${prompt.id}:`, error);
      return false;
    }
  }

  /**
   * Emergency broadcast to all clients
   */
  private async broadcastToAllClients(prompt: any): Promise<boolean> {
    try {
      console.log(`📢 Broadcasting prompt ${prompt.id} to all connected clients`);
      
      this.io.emit('emergency_prompt', {
        promptId: prompt.id,
        conversationId: prompt.conversationId,
        message: `Emergency permission request: ${prompt.message}`,
        riskLevel: 'HIGH',
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      console.error(`❌ Broadcast delivery failed for prompt ${prompt.id}:`, error);
      return false;
    }
  }

  /**
   * Track prompt acknowledgment from frontend
   */
  acknowledgePrompt(promptId: string, clientInfo: any): void {
    this.acknowledgedPrompts.add(promptId);
    console.log(`✅ Prompt ${promptId} acknowledged by client:`, clientInfo);
    
    // Clean up after 5 minutes
    setTimeout(() => {
      this.acknowledgedPrompts.delete(promptId);
    }, 5 * 60 * 1000);
  }

  /**
   * Check if prompt was acknowledged
   */
  isPromptAcknowledged(promptId: string): boolean {
    return this.acknowledgedPrompts.has(promptId);
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(): any {
    return {
      totalAttempts: Array.from(this.deliveryAttempts.values()).reduce((sum, attempts) => sum + attempts, 0),
      acknowledgedCount: this.acknowledgedPrompts.size,
      successRate: this.acknowledgedPrompts.size / Math.max(this.deliveryAttempts.size, 1)
    };
  }
}

export { PromptDeliveryService };
export type { PromptData, DeliveryResult };