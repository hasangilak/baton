/**
 * Permission Management System for Claude Code Bridge
 */

import { config } from './config.js';
import { logger, ContextualLogger } from './logger.js';
import type { PermissionResult } from "@anthropic-ai/claude-code";

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM', 
  HIGH = 'HIGH',
  PLAN = 'PLAN'
}

export interface PermissionCache {
  conversationId: string;
  mode: string;
  timestamp: number;
}

export interface PermissionRequest {
  toolName: string;
  parameters: Record<string, any>;
  conversationId: string;
  riskLevel: RiskLevel;
  requestId?: string;
}

export interface PlanReviewRequest {
  toolName: string;
  parameters: Record<string, any>;
  conversationId: string;
  planContent: string;
  requestId?: string;
}

export class PermissionManager {
  private permissionCache = new Map<string, PermissionCache>();
  private backendUrl: string;
  private logger: ContextualLogger;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl;
    this.logger = new ContextualLogger(logger, 'PermissionManager');
    
    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 60000); // Every minute
  }

  /**
   * Assess the risk level of a tool
   */
  assessRiskLevel(toolName: string): RiskLevel {
    const dangerousTools = ['Bash', 'Write', 'Edit', 'MultiEdit'];
    const moderateTools = ['WebFetch', 'NotebookEdit'];
    const planTools = ['ExitPlanMode'];
    
    if (planTools.includes(toolName)) {
      return RiskLevel.PLAN;
    } else if (dangerousTools.includes(toolName)) {
      return RiskLevel.HIGH;
    } else if (moderateTools.includes(toolName)) {
      return RiskLevel.MEDIUM;
    } else {
      return RiskLevel.LOW;
    }
  }

  /**
   * Check if a tool can be used based on permissions
   */
  async canUseTool(request: PermissionRequest): Promise<PermissionResult> {
    const { toolName, parameters, conversationId, riskLevel, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Checking permissions for tool`, { toolName, riskLevel });

    try {
      // Special handling for plan mode
      if (riskLevel === RiskLevel.PLAN) {
        return await this.handlePlanPermission(request);
      }

      // Check if tool requires permission
      if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.MEDIUM) {
        return await this.handleRiskyToolPermission(request);
      }

      // Auto-allow low-risk tools
      contextLogger.info(`Auto-allowing low-risk tool`, { toolName });
      return { behavior: 'allow', updatedInput: parameters };

    } catch (error) {
      contextLogger.error(`Permission check failed`, { toolName }, error);
      return this.getConservativeFallback(toolName, riskLevel);
    }
  }

  /**
   * Handle plan mode permissions (ExitPlanMode tool)
   */
  private async handlePlanPermission(request: PermissionRequest): Promise<PermissionResult> {
    const { toolName, parameters, conversationId, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Processing plan review`, { toolName });
    
    const planContent = parameters.plan || 'No plan content provided';
    
    try {
      const planReview = await this.requestPlanReview({
        toolName,
        parameters,
        conversationId,
        planContent,
        requestId
      });
      
      if (planReview.behavior === 'deny') {
        contextLogger.warn(`Plan rejected by user`);
        return { behavior: 'deny', message: planReview.message || 'Plan was rejected' };
      }
      
      contextLogger.info(`Plan approved`, { decision: planReview.behavior });
      return { behavior: 'allow', updatedInput: planReview.updatedInput || parameters };
      
    } catch (error) {
      contextLogger.error(`Plan review failed`, {}, error);
      return { behavior: 'deny', message: 'Plan review system error' };
    }
  }

  /**
   * Handle permissions for risky tools
   */
  private async handleRiskyToolPermission(request: PermissionRequest): Promise<PermissionResult> {
    const { toolName, parameters, conversationId, riskLevel, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    // Check if already permitted
    if (await this.isToolAlreadyPermitted(toolName, conversationId)) {
      contextLogger.info(`Tool already permitted`, { toolName });
      return { behavior: 'allow', updatedInput: parameters };
    }

    // Request permission with progressive timeout
    try {
      const permissionResult = await this.requestPermissionWithProgressiveTimeout({
        toolName,
        parameters,
        conversationId,
        riskLevel,
        requestId
      });
      
      if (permissionResult.behavior === 'deny') {
        contextLogger.warn(`Tool denied by user`, { toolName });
        return { behavior: 'deny', message: 'User denied permission' };
      }
      
      contextLogger.info(`Tool approved by user`, { toolName, decision: permissionResult.behavior });
      return { behavior: 'allow', updatedInput: permissionResult.updatedInput || parameters };
      
    } catch (error) {
      contextLogger.error(`Permission request failed`, { toolName }, error);
      return this.getConservativeFallback(toolName, riskLevel);
    }
  }

  /**
   * Check conversation permission mode from backend with caching
   */
  async getConversationPermissionMode(conversationId: string): Promise<string> {
    try {
      // Check cache first
      const cached = this.permissionCache.get(conversationId);
      const now = Date.now();
      const cacheDuration = config.getConfig().permissionCacheDuration;
      
      if (cached && (now - cached.timestamp) < cacheDuration) {
        return cached.mode;
      }

      const response = await fetch(`${this.backendUrl}/api/chat/conversations/${conversationId}/permission-mode`);
      
      if (response.ok) {
        const data = await response.json();
        const mode = data.permissionMode || 'default';
        
        // Update cache
        this.permissionCache.set(conversationId, { 
          conversationId, 
          mode, 
          timestamp: now 
        });
        
        return mode;
      } else {
        this.logger.warn(`Failed to get permission mode`, { 
          conversationId, 
          status: response.status 
        });
        return 'default';
      }
    } catch (error) {
      this.logger.error(`Error getting permission mode`, { conversationId }, error);
      return 'default';
    }
  }

  /**
   * Check if tool is already permitted
   */
  private async isToolAlreadyPermitted(toolName: string, conversationId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/chat/conversations/${conversationId}/permissions`);
      
      if (response.ok) {
        const data = await response.json();
        const permissions = data.permissions || [];
        return permissions.includes(toolName);
      }
      
      return false;
    } catch (error) {
      this.logger.warn(`Failed to check existing permissions`, { toolName, conversationId }, error);
      return false;
    }
  }

  /**
   * Request permission with progressive timeout strategy
   */
  private async requestPermissionWithProgressiveTimeout(request: PermissionRequest): Promise<PermissionResult> {
    const { toolName, parameters, conversationId, riskLevel, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Requesting permission with progressive timeout`, { toolName, riskLevel });
    
    // Ensure conversation exists
    await this.ensureConversationExists(conversationId);
    
    // Create permission prompt
    const promptId = await this.createPermissionPrompt(request);
    if (!promptId) {
      throw new Error('Failed to create permission prompt');
    }
    
    // Use progressive timeout strategy
    const timeoutStages = config.getConfig().progressiveTimeoutStages;
    
    for (let stage = 0; stage < timeoutStages.length; stage++) {
      const { duration, description } = timeoutStages[stage];
      const stageNumber = stage + 1;
      
      contextLogger.info(`Permission timeout stage ${stageNumber}`, { 
        duration: duration / 1000, 
        description 
      });
      
      try {
        const result = await this.waitForPermissionResponse(promptId, duration);
        
        if (result.value !== 'timeout') {
          contextLogger.info(`Permission received in stage ${stageNumber}`, { 
            decision: result.value 
          });
          return this.processPermissionResponse(result, parameters);
        }
        
        // Escalate notification for next stage
        if (stage < timeoutStages.length - 1) {
          await this.escalatePermissionNotification(promptId, toolName, riskLevel, stageNumber);
        }
        
      } catch (error) {
        contextLogger.error(`Error in permission stage ${stageNumber}`, {}, error);
      }
    }
    
    // All stages exhausted - final decision
    const finalDecision = this.getFinalTimeoutDecision(toolName, riskLevel);
    contextLogger.warn(`Progressive timeout exhausted`, { 
      toolName, 
      finalDecision 
    });
    
    return finalDecision === 'allow_once' 
      ? { behavior: 'allow', updatedInput: parameters }
      : { behavior: 'deny', message: 'Progressive timeout exhausted' };
  }

  /**
   * Request plan review
   */
  private async requestPlanReview(request: PlanReviewRequest): Promise<PermissionResult> {
    const { toolName, parameters, conversationId, planContent, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Requesting plan review`, { planLength: planContent.length });
    
    // Ensure conversation exists
    await this.ensureConversationExists(conversationId);
    
    // Create plan review prompt
    const response = await fetch(`${this.backendUrl}/api/chat/conversations/${conversationId}/plan-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'plan_review',
        title: 'Plan Review Required',
        message: 'Claude Code has generated an implementation plan for your review.',
        planContent: planContent,
        options: [
          { id: 'auto_accept', label: 'Auto Accept', value: 'auto_accept' },
          { id: 'review_accept', label: 'Review & Accept', value: 'review_accept' },
          { id: 'edit_plan', label: 'Edit Plan', value: 'edit_plan' },
          { id: 'reject', label: 'Reject', value: 'reject' }
        ],
        context: {
          toolName,
          parameters: JSON.stringify(parameters),
          planLength: planContent.length,
          timestamp: Date.now()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create plan review prompt: ${response.status}`);
    }

    const promptData = await response.json();
    if (!promptData.success) {
      throw new Error('Failed to create plan review prompt');
    }

    // Wait for plan review response
    const promptId = promptData.prompt.id;
    const reviewResponse = await this.waitForPlanReviewResponse(promptId);
    
    return this.processPlanReviewResponse(reviewResponse, parameters, planContent);
  }

  /**
   * Process permission response
   */
  private processPermissionResponse(response: any, parameters: Record<string, any>): PermissionResult {
    if (response.value === 'deny') {
      return { behavior: 'deny', message: 'User denied permission' };
    } else if (response.value === 'allow_once' || response.value === 'allow_always') {
      return { behavior: 'allow', updatedInput: parameters };
    } else {
      return { behavior: 'deny', message: 'Invalid permission response' };
    }
  }

  /**
   * Process plan review response
   */
  private processPlanReviewResponse(response: any, parameters: Record<string, any>, planContent: string): PermissionResult {
    switch (response.value) {
      case 'reject':
        return { 
          behavior: 'deny', 
          message: response.feedback || 'Plan was rejected by user' 
        };
      case 'edit_plan':
        return { 
          behavior: 'allow', 
          updatedInput: { ...parameters, plan: response.editedPlan || planContent }
        };
      case 'auto_accept':
      case 'review_accept':
        return { 
          behavior: 'allow', 
          updatedInput: parameters 
        };
      default:
        return { 
          behavior: 'deny', 
          message: 'Plan review timeout or system error' 
        };
    }
  }

  /**
   * Create permission prompt
   */
  private async createPermissionPrompt(request: PermissionRequest): Promise<string | null> {
    const { toolName, parameters, conversationId, riskLevel } = request;
    
    const response = await fetch(`${this.backendUrl}/api/chat/conversations/${conversationId}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'tool_permission',
        title: 'Tool Permission Required',
        message: `Claude Code wants to use the ${toolName} tool.`,
        options: [
          { id: 'allow_once', label: 'Allow Once', value: 'allow_once' },
          { id: 'allow_always', label: 'Allow Always', value: 'allow_always' },
          { id: 'deny', label: 'Deny', value: 'deny' }
        ],
        context: {
          toolName,
          parameters: JSON.stringify(parameters),
          riskLevel,
          usageCount: 0,
          progressiveTimeout: true
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.success ? data.prompt.id : null;
    }
    
    return null;
  }

  /**
   * Wait for permission response with timeout
   */
  private async waitForPermissionResponse(promptId: string, timeoutMs: number): Promise<any> {
    const startTime = Date.now();
    const pollInterval = config.getConfig().pollInterval;
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.backendUrl}/api/chat/prompts/${promptId}`, {
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
          const data = await response.json();
          const prompt = data.prompt;
          
          if (prompt && prompt.status === 'answered') {
            const options = prompt.options as any[];
            const selectedOption = options.find((o: any) => o.id === prompt.selectedOption);
            return selectedOption || { value: 'deny' };
          }
        } else if (response.status === 404) {
          return { value: 'deny' };
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        this.logger.warn(`Polling error for prompt ${promptId}`, {}, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    return { value: 'timeout' };
  }

  /**
   * Wait for plan review response
   */
  private async waitForPlanReviewResponse(promptId: string): Promise<any> {
    const timeoutMs = 300000; // 5 minutes for plan reviews
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second for plan reviews
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.backendUrl}/api/chat/plan-review/${promptId}`);
        
        if (response.ok) {
          const data = await response.json();
          const planReview = data.planReview;
          
          if (planReview && planReview.status === 'completed') {
            return {
              value: planReview.decision,
              feedback: planReview.feedback,
              editedPlan: planReview.editedPlan
            };
          }
        } else if (response.status === 404) {
          return { value: 'reject', feedback: 'Plan review session not found' };
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        this.logger.warn(`Plan review polling error`, { promptId }, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    return { value: 'timeout', feedback: 'Plan review timeout' };
  }

  /**
   * Escalate permission notification
   */
  private async escalatePermissionNotification(promptId: string, toolName: string, riskLevel: RiskLevel, stage: number): Promise<void> {
    try {
      await fetch(`${this.backendUrl}/api/chat/prompts/${promptId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          toolName,
          riskLevel,
          escalationType: stage === 1 ? 'reminder' : stage === 2 ? 'urgent' : 'critical',
          timestamp: Date.now()
        })
      });
    } catch (error) {
      this.logger.warn(`Failed to send escalation notification`, { promptId, stage }, error);
    }
  }

  /**
   * Get final timeout decision for a tool
   */
  private getFinalTimeoutDecision(toolName: string, riskLevel: RiskLevel): string {
    const safeTools = ['Read', 'LS', 'Glob', 'Grep'];
    const lowRiskAutoAllow = riskLevel === RiskLevel.LOW && safeTools.includes(toolName);
    
    return lowRiskAutoAllow ? 'allow_once' : 'deny';
  }

  /**
   * Get conservative fallback decision
   */
  private getConservativeFallback(toolName: string, riskLevel: RiskLevel): PermissionResult {
    const conservativeDecision = riskLevel === RiskLevel.LOW ? 'allow' : 'deny';
    return { 
      behavior: conservativeDecision as 'allow' | 'deny',
      message: conservativeDecision === 'deny' ? 'Permission system error' : undefined
    };
  }

  /**
   * Ensure conversation exists in backend
   */
  private async ensureConversationExists(conversationId: string): Promise<void> {
    try {
      // Check if conversation exists
      const checkResponse = await fetch(`${this.backendUrl}/api/chat/conversations/${conversationId}/permissions`);
      
      if (checkResponse.ok) {
        return;
      }
      
      // Create conversation if it doesn't exist
      const createResponse = await fetch(`${this.backendUrl}/api/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Bridge conversation initialized',
          requestId: `init-${conversationId}`,
          conversationId,
          projectId: 'cmdxumi04000k4yhw92fvsqqa', // Default Baton project
          userId: 'demo-user-1' // Default demo user
        })
      });
      
      if (!createResponse.ok) {
        this.logger.warn(`Failed to create conversation`, { conversationId });
      }
      
    } catch (error) {
      this.logger.warn(`Error ensuring conversation exists`, { conversationId }, error);
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const cacheDuration = config.getConfig().permissionCacheDuration;
    
    for (const [conversationId, cached] of this.permissionCache) {
      if (now - cached.timestamp > cacheDuration) {
        this.permissionCache.delete(conversationId);
      }
    }
  }
}