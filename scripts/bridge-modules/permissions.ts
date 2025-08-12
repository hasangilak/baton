/**
 * Permission Management System for Claude Code Bridge
 */

import { config } from './config';
import { logger, ContextualLogger } from './logger';
import type { PermissionResult } from "@anthropic-ai/claude-code";

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM', 
  HIGH = 'HIGH',
  PLAN = 'PLAN'
}

export interface PermissionCache {
  projectId: string;
  mode: string;
  timestamp: number;
}

export interface PermissionRequest {
  toolName: string;
  parameters: Record<string, any>;
  projectId: string;
  riskLevel: RiskLevel;
  requestId?: string;
  conversationId?: string;
}

export interface PlanReviewRequest {
  toolName: string;
  parameters: Record<string, any>;
  projectId: string;
  planContent: string;
  requestId?: string;
  conversationId?: string;
}

export interface ProgressiveTimeoutRequest {
  toolName: string;
  parameters: Record<string, any>;
  projectId: string;
  conversationId: string;
  riskLevel: RiskLevel;
  requestId?: string;
}

export class PermissionManager {
  private permissionCache = new Map<string, PermissionCache>();
  private backendSocket: any; // Socket.IO client socket
  private logger: ContextualLogger;
  private responseHandlers = new Map<string, { resolve: Function; reject: Function; timeout?: NodeJS.Timeout }>();

  constructor() {
    this.logger = new ContextualLogger(logger, 'PermissionManager');
    
    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 60000); // Every minute
  }

  setBackendSocket(socket: any): void {
    this.backendSocket = socket;
    this.setupWebSocketHandlers();
  }

  /**
   * Setup WebSocket event handlers for permission responses
   */
  private setupWebSocketHandlers(): void {
    if (!this.backendSocket) return;

    // Handle permission responses from backend
    this.backendSocket.on('permission:response', (data: any) => {
      this.logger.info('Received permission response', { promptId: data.promptId });
      this.handlePermissionResponse(data.promptId, data);
    });

    // Handle plan review responses from backend
    this.backendSocket.on('plan:review-response', (data: any) => {
      this.logger.info('Received plan review response', { promptId: data.promptId });
      this.handlePlanReviewResponse(data.promptId, data);
    });

    this.logger.info('WebSocket permission handlers configured');
  }

  /**
   * Handle permission response from WebSocket
   */
  private handlePermissionResponse(promptId: string, data: any): void {
    const handler = this.responseHandlers.get(promptId);
    if (handler) {
      if (handler.timeout) {
        clearTimeout(handler.timeout);
      }
      this.responseHandlers.delete(promptId);
      
      // Process the response
      const result = {
        value: data.selectedOption || data.decision || 'deny',
        label: data.label,
        metadata: data.metadata
      };
      
      handler.resolve(result);
    }
  }

  /**
   * Handle plan review response from WebSocket
   */
  private handlePlanReviewResponse(promptId: string, data: any): void {
    const handler = this.responseHandlers.get(promptId);
    if (handler) {
      if (handler.timeout) {
        clearTimeout(handler.timeout);
      }
      this.responseHandlers.delete(promptId);
      
      const result = {
        value: data.decision || 'reject',
        feedback: data.feedback,
        editedPlan: data.editedPlan
      };
      
      handler.resolve(result);
    }
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
    const { toolName, parameters, projectId, riskLevel, requestId } = request;
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
    const { toolName, parameters, projectId, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Processing plan review`, { toolName });
    
    const planContent = parameters.plan || 'No plan content provided';
    // Use projectId as conversationId if no specific conversationId provided
    const conversationId = (request as any).conversationId || projectId;
    
    try {
      const planReview = await this.requestPlanReview({
        toolName,
        parameters,
        projectId,
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
    const { toolName, parameters, projectId, riskLevel, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    // Check if already permitted
    if (await this.isToolAlreadyPermitted(toolName, projectId)) {
      contextLogger.info(`Tool already permitted`, { toolName });
      return { behavior: 'allow', updatedInput: parameters };
    }

    // Use projectId as conversationId if no specific conversationId provided
    const conversationId = (request as any).conversationId || projectId;

    // Request permission with progressive timeout
    try {
      const permissionResult = await this.requestPermissionWithProgressiveTimeout({
        toolName,
        parameters,
        projectId,
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
   * Check project permission mode from backend with caching
   */
  async getProjectPermissionMode(projectId: string): Promise<string> {
    try {
      // Check cache first
      const cached = this.permissionCache.get(projectId);
      const now = Date.now();
      const cacheDuration = config.getConfig().permissionCacheDuration;
      
      if (cached && (now - cached.timestamp) < cacheDuration) {
        return cached.mode;
      }

      if (!this.backendSocket) {
        this.logger.warn(`No backend WebSocket connection for project ${projectId}`);
        return 'default';
      }

      // Send WebSocket request for permission mode
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn(`Permission mode request timeout for project ${projectId}`);
          resolve('default');
        }, 10000);

        this.backendSocket.emit('permission:get-mode', { projectId }, (response: any) => {
          clearTimeout(timeout);
          const mode = response?.permissionMode || 'default';
          
          // Cache the result
          this.permissionCache.set(projectId, { 
            projectId, 
            mode, 
            timestamp: now 
          });
          
          resolve(mode);
        });
      });
    } catch (error) {
      this.logger.error(`Error getting permission mode`, { projectId }, error);
      return 'default';
    }
  }

  /**
   * Check if tool is already permitted
   */
  private async isToolAlreadyPermitted(toolName: string, projectId: string): Promise<boolean> {
    try {
      if (!this.backendSocket) {
        return false;
      }

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000);
        
        this.backendSocket.emit('permission:check', { projectId, toolName }, (response: any) => {
          clearTimeout(timeout);
          resolve(response?.hasPermission || false);
        });
      });
    } catch (error) {
      this.logger.warn(`Failed to check existing permissions`, { toolName, projectId }, error);
      return false;
    }
  }

  /**
   * Request permission with progressive timeout strategy
   */
  private async requestPermissionWithProgressiveTimeout(request: ProgressiveTimeoutRequest): Promise<PermissionResult> {
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
   * Request plan review via WebSocket
   */
  private async requestPlanReview(request: PlanReviewRequest): Promise<PermissionResult> {
    const { toolName, parameters, conversationId, planContent, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Requesting plan review via WebSocket`, { planLength: planContent.length });
    
    if (!this.backendSocket) {
      throw new Error('No backend WebSocket connection for plan review');
    }

    const promptId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Send plan review request via WebSocket
    this.backendSocket.emit('plan:review-request', {
      promptId,
      conversationId,
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
    });

    contextLogger.info('Plan review request sent via WebSocket', { promptId });

    // Wait for plan review response
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
   * Create permission prompt via WebSocket
   */
  private async createPermissionPrompt(request: PermissionRequest): Promise<string | null> {
    const { toolName, parameters, conversationId, riskLevel } = request;
    
    if (!this.backendSocket) {
      this.logger.error('No backend WebSocket connection for permission prompt');
      return null;
    }

    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Send permission request via WebSocket
    this.backendSocket.emit('permission:request', {
      promptId,
      conversationId,
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
        progressiveTimeout: true,
        requestTime: Date.now()
      },
      toolName,
      riskLevel
    });

    this.logger.info('Permission prompt created via WebSocket', { promptId, toolName });
    return promptId;
  }

  /**
   * Wait for permission response via WebSocket with timeout
   */
  private async waitForPermissionResponse(promptId: string, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(promptId);
        this.logger.warn(`Permission response timeout for prompt ${promptId}`);
        resolve({ value: 'timeout' });
      }, timeoutMs);

      // Store the promise handlers
      this.responseHandlers.set(promptId, {
        resolve,
        reject,
        timeout
      });

      this.logger.info(`Waiting for permission response via WebSocket`, { 
        promptId, 
        timeoutMs: timeoutMs / 1000 
      });
    });
  }

  /**
   * Wait for plan review response via WebSocket
   */
  private async waitForPlanReviewResponse(promptId: string): Promise<any> {
    const timeoutMs = 300000; // 5 minutes for plan reviews
    
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(promptId);
        this.logger.warn(`Plan review response timeout for prompt ${promptId}`);
        resolve({ value: 'timeout', feedback: 'Plan review timeout' });
      }, timeoutMs);

      // Store the promise handlers
      this.responseHandlers.set(promptId, {
        resolve,
        reject,
        timeout
      });

      this.logger.info(`Waiting for plan review response via WebSocket`, { 
        promptId, 
        timeoutMs: timeoutMs / 1000 
      });
    });
  }

  /**
   * Escalate permission notification via WebSocket
   */
  private async escalatePermissionNotification(promptId: string, toolName: string, riskLevel: RiskLevel, stage: number): Promise<void> {
    try {
      if (!this.backendSocket) {
        this.logger.warn('No backend WebSocket connection for escalation');
        return;
      }

      this.backendSocket.emit('permission:escalate', {
        promptId,
        stage,
        toolName,
        riskLevel,
        escalationType: stage === 1 ? 'reminder' : stage === 2 ? 'urgent' : 'critical',
        timestamp: Date.now()
      });

      this.logger.info('Permission escalation sent via WebSocket', { promptId, stage, toolName });
    } catch (error) {
      this.logger.warn(`Failed to send escalation notification via WebSocket`, { promptId, stage }, error);
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
   * Check if conversation exists via WebSocket
   */
  private async ensureConversationExists(conversationId: string): Promise<void> {
    if (!this.backendSocket) {
      this.logger.warn('No backend WebSocket connection to check conversation');
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn(`Conversation check timeout for ${conversationId}`);
        resolve(); // Continue anyway
      }, 5000);

      this.backendSocket.emit('conversation:check', { conversationId }, (response: any) => {
        clearTimeout(timeout);
        
        if (!response?.exists) {
          this.logger.info(`Conversation ${conversationId} may not exist, continuing with permission request`);
        }
        
        resolve();
      });
    });
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