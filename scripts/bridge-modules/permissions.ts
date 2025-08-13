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
  sessionId: string;
  riskLevel: RiskLevel;
  requestId?: string;
}

export interface PlanReviewRequest {
  toolName: string;
  parameters: Record<string, any>;
  projectId: string;
  planContent: string;
  requestId?: string;
}

export interface ProgressiveTimeoutRequest {
  toolName: string;
  parameters: Record<string, any>;
  projectId: string;
  riskLevel: RiskLevel;
  requestId?: string;
  sessionId?: string;
}

// Unified Permission System Types
export interface UnifiedPermissionRequest {
  // Core identification
  promptId: string;
  sessionId?: string;
  
  // Permission type and context
  permissionType: 'tool_permission' | 'plan_review' | 'file_permission' | 'api_permission' | 'custom';
  subtype?: string; // For extensibility (e.g., 'escalation')
  
  // Display information
  title: string;
  message: string;
  
  // Options for user to choose from
  options: Array<{
    id: string;
    label: string;
    value: string;
    style?: 'default' | 'primary' | 'danger';
  }>;
  
  // Context and metadata
  context: {
    toolName?: string;
    riskLevel?: RiskLevel;
    parameters?: any;
    planContent?: string; // For plan reviews
    escalationType?: 'reminder' | 'urgent' | 'critical';
    timeout?: number;
    allowAutoDecision?: boolean;
    stage?: number; // For escalations
  };
  
  // Tracking
  timestamp: number;
  requestId?: string;
}

export interface UnifiedPermissionResponse {
  promptId: string;
  projectId: string;
  sessionId?: string;
  
  // User decision
  selectedOption: string;
  selectedValue: string;
  
  // Additional data based on permission type
  data?: {
    feedback?: string; // For plan reviews
    editedPlan?: string; // For plan edits
    metadata?: any;
  };
  
  // Response tracking
  responseTime: number;
  timestamp: number;
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
    if (this.backendSocket === socket) {
      // Already configured with this socket, skip duplicate setup
      return;
    }
    
    this.backendSocket = socket;
    this.setupWebSocketHandlers();
  }

  /**
   * Setup WebSocket event handlers for unified permission responses
   */
  private setupWebSocketHandlers(): void {
    if (!this.backendSocket) return;

    // Handle unified permission responses from backend
    this.backendSocket.on('permission:response', (data: UnifiedPermissionResponse) => {
      this.logger.info('Received unified permission response', { 
        promptId: data.promptId, 
        selectedOption: data.selectedOption,
        permissionType: (data as any).permissionType 
      });
      this.handleUnifiedPermissionResponse(data);
    });

    // Keep legacy handlers for backward compatibility during transition
    this.backendSocket.on('plan:review-response', (data: any) => {
      this.logger.info('Received legacy plan review response', { promptId: data.promptId });
      this.handlePlanReviewResponse(data.promptId, data);
    });

    this.logger.info('WebSocket unified permission handlers configured');
  }

  /**
   * Handle unified permission response from WebSocket
   */
  private handleUnifiedPermissionResponse(data: UnifiedPermissionResponse): void {
    const handler = this.responseHandlers.get(data.promptId);
    if (handler) {
      if (handler.timeout) {
        clearTimeout(handler.timeout);
      }
      this.responseHandlers.delete(data.promptId);
      
      // Process the unified response
      const result = {
        value: data.selectedValue || data.selectedOption || 'deny',
        label: data.selectedOption,
        metadata: data.data?.metadata,
        feedback: data.data?.feedback,
        editedPlan: data.data?.editedPlan,
        responseTime: data.responseTime
      };
      
      handler.resolve(result);
    }
  }

  /**
   * Handle legacy permission response from WebSocket (for backward compatibility)
   */
  private handlePermissionResponse(promptId: string, data: any): void {
    const handler = this.responseHandlers.get(promptId);
    if (handler) {
      if (handler.timeout) {
        clearTimeout(handler.timeout);
      }
      this.responseHandlers.delete(promptId);
      
      // Process the legacy response
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
   * Create a unified permission request from legacy request types
   */
  private createUnifiedPermissionRequest(
    type: 'tool_permission' | 'plan_review',
    promptId: string,
    projectId: string,
    sessionId?: string,
    data: {
      toolName?: string;
      riskLevel?: RiskLevel;
      parameters?: any;
      planContent?: string;
      sessionId?: string;
      requestId?: string;
      title?: string;
      message?: string;
      escalationType?: 'reminder' | 'urgent' | 'critical';
      stage?: number;
    }
  ): UnifiedPermissionRequest {
    const baseRequest: UnifiedPermissionRequest = {
      promptId,
      projectId: data.projectId,
      sessionId: data.sessionId,
      permissionType: type,
      title: data.title || '',
      message: data.message || '',
      options: [],
      context: {
        toolName: data.toolName,
        riskLevel: data.riskLevel,
        parameters: data.parameters,
        planContent: data.planContent,
        escalationType: data.escalationType,
        stage: data.stage,
      },
      timestamp: Date.now(),
      requestId: data.requestId,
    };

    // Configure options based on permission type
    if (type === 'tool_permission') {
      baseRequest.title = data.title || 'Tool Permission Required';
      baseRequest.message = data.message || `Claude Code wants to use the ${data.toolName} tool.`;
      baseRequest.options = [
        { id: 'allow_once', label: 'Allow Once', value: 'allow_once', style: 'primary' },
        { id: 'allow_always', label: 'Allow Always', value: 'allow_always' },
        { id: 'deny', label: 'Deny', value: 'deny', style: 'danger' }
      ];
    } else if (type === 'plan_review') {
      baseRequest.title = data.title || 'Plan Review Required';
      baseRequest.message = data.message || 'Claude Code has generated an implementation plan for your review.';
      baseRequest.options = [
        { id: 'auto_accept', label: 'Auto Accept', value: 'auto_accept', style: 'primary' },
        { id: 'review_accept', label: 'Review & Accept', value: 'review_accept' },
        { id: 'edit_plan', label: 'Edit Plan', value: 'edit_plan' },
        { id: 'reject', label: 'Reject', value: 'reject', style: 'danger' }
      ];
    }

    return baseRequest;
  }

  /**
   * Send unified permission request via WebSocket
   */
  private async sendUnifiedPermissionRequest(request: UnifiedPermissionRequest): Promise<any> {
    if (!this.backendSocket) {
      throw new Error('No backend WebSocket connection for permission request');
    }

    this.logger.info(`Sending unified permission request`, {
      promptId: request.promptId,
      permissionType: request.permissionType,
      toolName: request.context.toolName
    });

    // Send unified permission request
    this.backendSocket.emit('permission:request', request);

    // Wait for response using existing handler system
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(request.promptId);
        reject(new Error(`Permission request timeout for ${request.promptId}`));
      }, 120000); // 2 minute timeout

      this.responseHandlers.set(request.promptId, {
        resolve,
        reject,
        timeout
      });
    });
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
    
    contextLogger.info(`🛠️ Claude wants to use tool - checking permissions`, { 
      toolName, 
      riskLevel, 
      projectId,
      parametersCount: Object.keys(parameters).length 
    });

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
    // Use projectId as projectId if no specific projectId provided
    
    try {
      const planReview = await this.requestPlanReview({
        toolName,
        parameters,
        projectId,
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

    // Request permission with progressive timeout
    try {
      const permissionResult = await this.requestPermissionWithProgressiveTimeout({
        toolName,
        parameters,
        projectId,
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
    const { toolName, parameters, projectId, riskLevel, requestId, sessionId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Requesting permission with progressive timeout`, { toolName, riskLevel });
    
    // Ensure conversation exists
    await this.ensureConversationExists(projectId, sessionId);
    
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
   * Request plan review via unified permission system
   */
  private async requestPlanReview(request: PlanReviewRequest): Promise<PermissionResult> {
    const { toolName, parameters, sessionId, projectId, planContent, requestId } = request;
    const contextLogger = new ContextualLogger(logger, 'PermissionManager', requestId);
    
    contextLogger.info(`Requesting plan review via unified permission system`, { planLength: planContent.length });
    
    const promptId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create unified permission request for plan review
    const unifiedRequest = this.createUnifiedPermissionRequest(
      'plan_review',
      promptId,
      sessionId,
      projectId,
      {
        toolName,
        parameters,
        planContent,
        requestId,
        title: 'Plan Review Required',
        message: 'Claude Code has generated an implementation plan for your review.'
      }
    );

    contextLogger.info('Sending unified plan review request', { promptId });

    // Send via unified permission system
    const response = await this.sendUnifiedPermissionRequest(unifiedRequest);
    
    return this.processPlanReviewResponse(response, parameters, planContent);
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
   * Create permission prompt via unified permission system
   */
  private async createPermissionPrompt(request: PermissionRequest): Promise<string | null> {
    const { toolName, parameters, projectId, sessionId, riskLevel, requestId } = request;
    
    if (!this.backendSocket) {
      this.logger.error('No backend WebSocket connection for permission prompt');
      return null;
    }

    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create unified permission request for tool permission
    const unifiedRequest = this.createUnifiedPermissionRequest(
      'tool_permission',
      promptId,
      projectId,
      sessionId,
      {
        toolName,
        parameters,
        riskLevel,
        requestId,
        title: 'Tool Permission Required',
        message: `Claude Code wants to use the ${toolName} tool.`
      }
    );

    this.logger.info('Sending unified tool permission request', { promptId, toolName });
    
    // Send via unified permission system (fire and forget for this method)
    this.sendUnifiedPermissionRequest(unifiedRequest).catch(error => {
      this.logger.error('Failed to send unified permission request', { promptId, toolName }, error);
    });
    
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
   * Escalate permission notification via unified permission system
   */
  private async escalatePermissionNotification(promptId: string, toolName: string, riskLevel: RiskLevel, stage: number): Promise<void> {
    try {
      if (!this.backendSocket) {
        this.logger.warn('No backend WebSocket connection for escalation');
        return;
      }

      // Create escalation as a unified permission request
      const escalationType = stage === 1 ? 'reminder' : stage === 2 ? 'urgent' : 'critical';
      const escalationPromptId = `${promptId}-escalation-${stage}`;
      
      const escalationRequest: UnifiedPermissionRequest = {
        promptId: escalationPromptId,
        projectId,
        sessionId,
        permissionType: 'custom',
        subtype: 'escalation',
        title: `Permission Request ${escalationType.charAt(0).toUpperCase() + escalationType.slice(1)}`,
        message: `Claude Code is still waiting for permission to use the ${toolName} tool. Stage ${stage} of timeout escalation.`,
        options: [
          { id: 'allow_once', label: 'Allow Once', value: 'allow_once', style: 'primary' },
          { id: 'allow_always', label: 'Allow Always', value: 'allow_always' },
          { id: 'deny', label: 'Deny', value: 'deny', style: 'danger' }
        ],
        context: {
          toolName,
          riskLevel,
          escalationType,
          stage,
          originalPromptId: promptId,
          timeout: 30000 * stage // Increasing timeout per stage
        },
        timestamp: Date.now()
      };

      // Send unified escalation request
      this.backendSocket.emit('permission:request', escalationRequest);

      this.logger.info('Permission escalation sent via unified system', { promptId, stage, toolName, escalationType });
    } catch (error) {
      this.logger.warn(`Failed to send escalation notification via unified system`, { promptId, stage }, error);
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
  private async ensureConversationExists(sessionId: string): Promise<void> {
    if (!this.backendSocket) {
      this.logger.warn('No backend WebSocket connection to check conversation');
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn(`Conversation check timeout for ${sessionId}`);
        resolve(); // Continue anyway
      }, 5000);

      this.backendSocket.emit('conversation:check', { sessionId }, (response: any) => {
        clearTimeout(timeout);
        
        if (!response?.exists) {
          this.logger.info(`Conversation ${sessionId} may not exist, continuing with permission request`);
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
    
    for (const [sessionId, cached] of this.permissionCache) {
      if (now - cached.timestamp > cacheDuration) {
        this.permissionCache.delete(sessionId);
      }
    }
  }
}