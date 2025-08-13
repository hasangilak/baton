import { PrismaClient } from '@prisma/client';

// Use singleton pattern to avoid multiple Prisma instances
let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!(global as any).__prisma) {
    (global as any).__prisma = new PrismaClient();
  }
  prisma = (global as any).__prisma;
}

export interface ConversationPermission {
  id: string;
  conversationId: string | null;
  toolName: string;
  status: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: any;
}

export class ConversationPermissionsService {
  /**
   * Get all granted permissions for a conversation
   */
  static async getGrantedPermissions(conversationId: string): Promise<string[]> {
    const permissions = await prisma.conversationPermission.findMany({
      where: {
        conversationId,
        status: 'granted',
        // Check for expired permissions
        OR: [
          { expiresAt: null }, // Never expires
          { expiresAt: { gt: new Date() } } // Not yet expired
        ]
      },
      select: {
        toolName: true
      }
    });

    return permissions.map(p => p.toolName);
  }

  /**
   * Grant permission for a tool in a conversation (conversationId-first approach)
   */
  static async grantPermission(
    conversationId: string, 
    toolName: string, 
    grantedBy: string = 'user',
    expiresAt?: Date
  ): Promise<ConversationPermission> {
    // Get projectId from conversationId for database compatibility
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { projectId: true }
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Use upsert to handle the case where permission already exists
    const permission = await prisma.conversationPermission.upsert({
      where: {
        conversationId_toolName: {
          conversationId,
          toolName
        }
      },
      update: {
        status: 'granted',
        grantedBy,
        grantedAt: new Date(),
        expiresAt: expiresAt ?? null,
        updatedAt: new Date()
      },
      create: {
        conversationId,
        projectId: conversation.projectId,
        toolName,
        status: 'granted',
        grantedBy,
        grantedAt: new Date(),
        expiresAt: expiresAt ?? null
      }
    });

    return permission;
  }

  /**
   * Deny permission for a tool in a conversation (conversationId-first approach)
   */
  static async denyPermission(
    conversationId: string, 
    toolName: string, 
    grantedBy: string = 'user'
  ): Promise<ConversationPermission> {
    // Get projectId from conversationId for database compatibility
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { projectId: true }
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const permission = await prisma.conversationPermission.upsert({
      where: {
        conversationId_toolName: {
          conversationId,
          toolName
        }
      },
      update: {
        status: 'denied',
        grantedBy,
        grantedAt: new Date(),
        updatedAt: new Date()
      },
      create: {
        conversationId,
        projectId: conversation.projectId,
        toolName,
        status: 'denied',
        grantedBy,
        grantedAt: new Date()
      }
    });

    return permission;
  }

  /**
   * Check if a tool is permitted for a conversation
   */
  static async isToolPermitted(conversationId: string, toolName: string): Promise<boolean> {
    const permission = await prisma.conversationPermission.findUnique({
      where: {
        conversationId_toolName: {
          conversationId,
          toolName
        }
      }
    });

    if (!permission) return false;
    if (permission.status !== 'granted') return false;
    if (permission.expiresAt && permission.expiresAt < new Date()) return false;

    return true;
  }

  /**
   * Revoke permission for a tool in a conversation
   */
  static async revokePermission(conversationId: string, toolName: string): Promise<void> {
    await prisma.conversationPermission.deleteMany({
      where: {
        conversationId,
        toolName
      }
    });
  }

  /**
   * Get all permissions for a conversation (for UI display)
   */
  static async getConversationPermissions(conversationId: string): Promise<ConversationPermission[]> {
    return await prisma.conversationPermission.findMany({
      where: {
        conversationId
      },
      orderBy: {
        grantedAt: 'desc'
      }
    });
  }

  /**
   * Clear expired permissions for a conversation
   */
  static async clearExpiredPermissions(conversationId: string): Promise<void> {
    await prisma.conversationPermission.deleteMany({
      where: {
        conversationId,
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }
}

export default ConversationPermissionsService;