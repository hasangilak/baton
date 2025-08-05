/**
 * Plan Context Manager
 * 
 * Tracks active Claude Code plans per project/session to enable
 * automatic linking of generated todos to their associated plans.
 */

interface PlanContext {
  planId: string;
  projectId: string;
  sessionId?: string;
  activatedAt: Date;
  expiresAt: Date;
}

export class PlanContextManager {
  private activeContexts = new Map<string, PlanContext>();
  private readonly DEFAULT_CONTEXT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  /**
   * Get the context key for a project/session combination
   */
  private getContextKey(projectId: string, sessionId?: string): string {
    return sessionId ? `${projectId}:${sessionId}` : projectId;
  }

  /**
   * Set the active plan for a project/session
   */
  setActivePlan(
    planId: string, 
    projectId: string, 
    sessionId?: string,
    timeoutMs: number = this.DEFAULT_CONTEXT_TIMEOUT
  ): void {
    const contextKey = this.getContextKey(projectId, sessionId);
    const now = new Date();
    
    const context: PlanContext = {
      planId,
      projectId,
      activatedAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
      ...(sessionId && { sessionId })
    };

    this.activeContexts.set(contextKey, context);
    
    console.log(`🎯 Active plan set: ${planId} for project ${projectId}${sessionId ? ` (session: ${sessionId})` : ''}`);
  }

  /**
   * Get the active plan for a project/session
   */
  getActivePlan(projectId: string, sessionId?: string): string | null {
    const contextKey = this.getContextKey(projectId, sessionId);
    const context = this.activeContexts.get(contextKey);
    
    if (!context) {
      return null;
    }

    // Check if context has expired
    if (new Date() > context.expiresAt) {
      this.activeContexts.delete(contextKey);
      console.log(`⏰ Plan context expired for project ${projectId}`);
      return null;
    }

    return context.planId;
  }

  /**
   * Clear the active plan for a project/session
   */
  clearActivePlan(projectId: string, sessionId?: string): void {
    const contextKey = this.getContextKey(projectId, sessionId);
    const context = this.activeContexts.get(contextKey);
    
    if (context) {
      this.activeContexts.delete(contextKey);
      console.log(`🗑️ Cleared active plan ${context.planId} for project ${projectId}`);
    }
  }

  /**
   * Get all active contexts (for debugging)
   */
  getActiveContexts(): Array<PlanContext & { contextKey: string }> {
    const now = new Date();
    const activeContexts: Array<PlanContext & { contextKey: string }> = [];
    
    for (const [contextKey, context] of this.activeContexts.entries()) {
      if (now <= context.expiresAt) {
        activeContexts.push({ ...context, contextKey });
      } else {
        // Clean up expired contexts
        this.activeContexts.delete(contextKey);
      }
    }
    
    return activeContexts;
  }

  /**
   * Extend the timeout for an active plan context
   */
  extendContext(
    projectId: string, 
    sessionId?: string,
    additionalTimeMs: number = this.DEFAULT_CONTEXT_TIMEOUT
  ): boolean {
    const contextKey = this.getContextKey(projectId, sessionId);
    const context = this.activeContexts.get(contextKey);
    
    if (!context) {
      return false;
    }

    context.expiresAt = new Date(Date.now() + additionalTimeMs);
    console.log(`⏰ Extended plan context for project ${projectId} until ${context.expiresAt.toISOString()}`);
    return true;
  }

  /**
   * Clean up expired contexts (should be called periodically)
   */
  cleanupExpiredContexts(): number {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [contextKey, context] of this.activeContexts.entries()) {
      if (now > context.expiresAt) {
        this.activeContexts.delete(contextKey);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired plan contexts`);
    }
    
    return cleanedCount;
  }
}

// Export singleton instance
export const planContextManager = new PlanContextManager();

// Set up periodic cleanup (every 5 minutes)
setInterval(() => {
  planContextManager.cleanupExpiredContexts();
}, 5 * 60 * 1000);