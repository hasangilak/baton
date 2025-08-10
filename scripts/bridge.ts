#!/usr/bin/env bun

/**
 * Claude Code Bridge Service - WebSocket Version
 * 
 * A WebSocket-based service that executes Claude Code SDK requests
 * on behalf of the Docker backend. This eliminates HTTP overhead and
 * provides true real-time bidirectional communication.
 * 
 * Usage:
 * bun run bridge.ts [--port 8080] [--backend ws://localhost:3001]
 */

import { query, type PermissionResult, type SDKUserMessage, type PermissionMode} from "@anthropic-ai/claude-code";
import { Server } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';
import { createServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';

interface BridgeRequest {
  message: string;
  requestId: string;
  conversationId: string;
  sessionId?: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: PermissionMode;
  projectName?: string;
}

interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted";
  data?: any;
  error?: string;
  requestId: string;
  timestamp: number;
}

interface WebSocketBridgeEvents {
  'claude:execute': (request: BridgeRequest) => void;
  'claude:abort': (requestId: string) => void;
  'permission:response': (data: { promptId: string; response: any }) => void;
  'bridge:health': () => void;
  'files:list': (data: { workingDirectory?: string; search?: string }) => void;
  'files:content': (data: { filePath: string; workingDirectory?: string }) => void;
}

interface WebSocketBridgeEmits {
  'claude:stream': (response: StreamResponse) => void;
  'claude:complete': (data: { requestId: string; sessionId?: string }) => void;
  'claude:error': (data: { requestId: string; error: string }) => void;
  'claude:aborted': (data: { requestId: string }) => void;
  'permission:request': (data: any) => void;
  'bridge:health-response': (data: { status: string; activeRequests: number }) => void;
  'files:list-response': (data: { files: any[]; workingDirectory: string; count: number }) => void;
  'files:content-response': (data: { content: string; path: string; fullPath: string; size: number; lastModified: Date }) => void;
}

class ClaudeCodeBridge {
  private port: number;
  private backendUrl: string;
  private activeRequests = new Map<string, AbortController>();
  private permissionModeCache = new Map<string, { mode: string; timestamp: number }>();
  private io: Server | null = null;
  private backendSocket: Socket | null = null;

  constructor(port: number = 8080, backendUrl: string = 'ws://localhost:3001') {
    this.port = port;
    this.backendUrl = backendUrl;
  }

  /**
   * Check conversation permission mode from backend via WebSocket
   */
  private async getConversationPermissionMode(conversationId: string): Promise<string> {
    try {
      // Use cached value if recent (within 30 seconds)
      const cached = this.permissionModeCache.get(conversationId);
      const now = Date.now();
      if (cached && (now - cached.timestamp) < 30000) {
        return cached.mode;
      }

      if (!this.backendSocket) {
        console.warn(`⚠️  No backend WebSocket connection for conversation ${conversationId}`);
        return 'default';
      }

      // Send WebSocket request for permission mode
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`⚠️  Permission mode request timeout for conversation ${conversationId}`);
          resolve('default');
        }, 5000);

        this.backendSocket.emit('permission:get-mode', { conversationId }, (response: any) => {
          clearTimeout(timeout);
          const mode = response?.permissionMode || 'default';
          
          // Cache the result
          this.permissionModeCache.set(conversationId, { mode, timestamp: now });
          
          resolve(mode);
        });
      });
    } catch (error) {
      console.warn(`⚠️  Error getting permission mode for conversation ${conversationId}:`, error);
      return 'default';
    }
  }

  private async handleExecuteRequest(socket: any, request: BridgeRequest): Promise<void> {
    try {
      const { message, requestId, conversationId, sessionId, allowedTools, workingDirectory, permissionMode = 'default', projectName } = request;

      console.log(`🚀 Bridge executing Claude Code request ${requestId}`);
      console.log(`📝 Message: "${message.substring(0, 100)}..."`);
      console.log(`🔗 Session: ${sessionId || 'new'}`);
      console.log(`🛠️  Tools: ${allowedTools?.join(', ') || 'default'}`);
      console.log(`📁 Working Dir: ${workingDirectory || 'default CWD'}`);
      console.log(`🔐 Permission Mode: ${permissionMode}`);
      console.log(`📦 Conversation: ${conversationId} | Project: ${projectName || 'n/a'}`);

      // WebSocket-based response sending
      let executionCompleted = false;
      let currentSessionId = sessionId; // Track session ID from request and Claude response
      
      const sendResponse = (response: StreamResponse) => {
        if (executionCompleted) {
          console.log(`⚠️  Execution already completed, cannot send response for ${requestId}`);
          return;
        }
        
        try {
          socket.emit('claude:stream', response);
        } catch (error) {
          console.log(`⚠️  Error sending WebSocket response for ${requestId}:`, error);
          executionCompleted = true;
        }
      };

          // Use working generator pattern from ultimate-claude-sdk.ts
          let conversationDone: (() => void) | undefined;
          const conversationComplete = new Promise<void>(resolve => {
            conversationDone = resolve;
          });

          try {
            // Create abort controller for this request
            const abortController = new AbortController();
            this.activeRequests.set(requestId, abortController);

            // Build context message
            let contextMessage = message;
            if (projectName) {
              contextMessage = `Project: ${projectName}\n\n${message}`;
            }

            // Check for updated permission mode from backend (in case plan was approved)
            let effectivePermissionMode = permissionMode;
            if (conversationId) {
              try {
                const backendPermissionMode = await this.getConversationPermissionMode(conversationId);
                if (backendPermissionMode !== permissionMode) {
                  console.log(`🔄 Permission mode updated from backend: ${permissionMode} → ${backendPermissionMode}`);
                  effectivePermissionMode = backendPermissionMode;
                }
              } catch (error) {
                console.warn('⚠️  Failed to check backend permission mode, using original:', permissionMode);
              }
            }

            // Configure Claude Code options using the same pattern as working backend
            const claudeOptions: any = {
              abortController,
              executable: process.execPath,
              executableArgs: [],
              pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH || "/home/hassan/.nvm/versions/node/v22.18.0/bin/claude",
              maxTurns: 20,
              mcpServers: {},
              permissionMode: effectivePermissionMode,
              // Add session resume if provided
              ...(sessionId && sessionId.trim() !== "" ? { resume: sessionId } : {}),
            };

            // Add working directory
            if (workingDirectory) {
              claudeOptions.cwd = workingDirectory;
            }

            // Add allowed tools
            if (allowedTools && allowedTools.length > 0) {
              claudeOptions.allowedTools = allowedTools;
            }

            console.log(`🔧 Claude Code options configured for ${requestId}:`);
            console.log(`   - session: ${sessionId ? 'resuming' : 'new'}`);
            console.log(`   - permissionMode: ${effectivePermissionMode} ${effectivePermissionMode !== permissionMode ? '(updated from backend)' : ''}`);
            console.log(`   - allowedTools: ${claudeOptions.allowedTools || 'default'}`);
            console.log(`   - maxTurns: ${claudeOptions.maxTurns}`);

            const createPromptStream = async function* (): AsyncIterableIterator<SDKUserMessage> {
              yield {
                type: 'user',
                message: { role: 'user', content: contextMessage },
                parent_tool_use_id: null,
                session_id: sessionId || `bridge-${Date.now()}`
              };
              await conversationComplete;
            };

            // Add working canUseTool callback with progressive timeout strategy
            claudeOptions.canUseTool = async (toolName: string, parameters: Record<string, any>) => {
              const riskLevel = this.assessRiskLevel(toolName);
              
              // Special handling for ExitPlanMode
              if (riskLevel === 'PLAN') {
                console.log(`📋 Plan mode detected: ${toolName} - initiating plan review`);
                const planContent = parameters.plan || 'No plan content provided';
                console.log(`   ↳ Plan preview: ${planContent.substring(0, 200)}...`);
                
                try {
                  const planReviewResult = await this.requestPlanReview(
                    toolName,
                    parameters,
                    conversationId,
                    planContent
                  );
                  
                  if (planReviewResult.behavior === 'deny') {
                    console.log(`🚫 Plan rejected by user`);
                    return { behavior: 'deny', message: planReviewResult.message || 'Plan was rejected' };
                  }
                  
                  console.log(`✅ Plan approved: ${planReviewResult.behavior}`);
                  
                  // Include plan review ID in the updated input so it gets forwarded to the frontend
                  const updatedParameters = {
                    ...parameters,
                    planReviewId: planReviewResult.planReviewId // Include the plan review ID
                  };
                  
                  return { behavior: 'allow', updatedInput: updatedParameters };
                  
                } catch (error) {
                  console.error(`❌ Plan review failed:`, error);
                  return { behavior: 'deny', message: 'Plan review system error' };
                }
              }
              
              if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM') {
                const previewParams = (() => {
                  try {
                    const str = JSON.stringify(parameters);
                    return str.length > 300 ? str.slice(0, 300) + '…' : str;
                  } catch {
                    return '[unserializable parameters]';
                  }
                })();
                console.log(`🛡️  ${riskLevel}-risk tool detected: ${toolName} - requesting permission with progressive timeout`);
                console.log(`   ↳ Params preview: ${previewParams}`);
                try {
                  const permissionResult = await this.requestPermissionWithProgressiveTimeout(
                    toolName,
                    parameters,
                    conversationId,
                    riskLevel
                  );
                  
                  if (permissionResult.behavior === 'deny') {
                    console.log(`🚫 Tool ${toolName} denied by user`);
                    return { behavior: 'deny', message: 'User denied permission' };
                  }
                  
                  console.log(`✅ Tool ${toolName} approved: ${permissionResult.behavior}`);
                  return { behavior: 'allow', updatedInput: permissionResult.updatedInput || parameters };
                  
                } catch (error) {
                  console.error(`❌ Permission request failed for ${toolName}:`, error);
                  
                  // Conservative fallback - deny risky tools if permission system fails
                  const fallbackBehavior = riskLevel === 'HIGH' ? 'deny' : 'allow';
                  console.log(`🔄 Fallback decision for ${toolName}: ${fallbackBehavior}`);
                  
                  if (fallbackBehavior === 'deny') {
                    return { behavior: 'deny', message: 'Permission system error - denied for security' };
                  } else {
                    return { behavior: 'allow', updatedInput: parameters };
                  }
                }
              }
              
              // Allow low-risk tools by default
              console.log(`✅ Auto-allowing ${riskLevel}-risk tool: ${toolName}`);
              return { behavior: 'allow', updatedInput: parameters };
            };

            let messageCount = 0;
            let seq = 0;
            
            for await (const sdkMessage of query({
              prompt: createPromptStream(),
              options: claudeOptions
            })) {
              messageCount++;
              seq++;
              
              // SIMPLE AGENT MESSAGE LOGGING - just log each message we get from Claude
              console.log(`🤖 AGENT_MSG [${requestId}] seq=${seq}`, JSON.stringify(sdkMessage, null, 2));
              
              // Log first few messages for debugging
              if (messageCount <= 3) {
                console.log(`📨 Message ${messageCount} type: ${sdkMessage.type || "unknown"} for ${requestId}`);
              }

              // Capture session ID from system messages
              if (sdkMessage.type === "system" && (sdkMessage as any).session_id) {
                currentSessionId = (sdkMessage as any).session_id;
              }

              // Permission handling is now done in canUseTool callback

              // Send stream response via WebSocket
              const streamResponse: StreamResponse = {
                type: "claude_json",
                data: sdkMessage,
                requestId,
                timestamp: Date.now()
              };
              
              sendResponse(streamResponse);

              // Detailed per-message logging (non-invasive)
              try {
                const type = (sdkMessage as any).type;
                const role = (sdkMessage as any).message?.role || 'n/a';
                const content = (sdkMessage as any).message?.content;
                const contentSummary = (() => {
                  if (!content) return 'none';
                  if (typeof content === 'string') return `str(${content.length})`;
                  if (Array.isArray(content)) {
                    const textBlocks = content.filter((c: any) => c?.type === 'text');
                    const toolBlocks = content.filter((c: any) => c?.type === 'tool_use');
                    const textLen = textBlocks.map((t: any) => (t?.text || '').length).reduce((a: number, b: number) => a + b, 0);
                    return `array{text:${textBlocks.length} (${textLen} chars), tools:${toolBlocks.length}}`;
                  }
                  return typeof content;
                })();
                console.log(`🔎 [${requestId}] seq=${seq} type=${type} role=${role} content=${contentSummary}`);
              } catch (e) {
                console.log(`🔎 [${requestId}] seq=${seq} message summary unavailable`);
              }

              // Handle different message types and natural completion
              if (sdkMessage.type === "result") {
                console.log(`✅ Claude Code execution completed for ${requestId}: ${sdkMessage.subtype}`);
                if (conversationDone) conversationDone();
                break;
              }
            }

            // Send completion via WebSocket
            socket.emit('claude:complete', {
              requestId,
              sessionId: currentSessionId,
              timestamp: Date.now()
            });

            console.log(`🏁 Bridge execution completed for ${requestId} (${messageCount} messages)`);

          } catch (error) {
            console.error(`❌ Bridge execution error for ${requestId}:`, error);
            if (conversationDone) conversationDone();
            
            if (error instanceof Error && error.name === 'AbortError') {
              socket.emit('claude:aborted', {
                requestId,
                timestamp: Date.now()
              });
            } else {
              socket.emit('claude:error', {
                requestId,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
              });
            }
          } finally {
            // Clean up
            this.activeRequests.delete(requestId);
            executionCompleted = true;
          }
    } catch (error) {
      console.error('❌ Execute request error:', error);
      socket.emit('claude:error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  private handleAbortRequest(socket: any, requestId: string): void {
    try {
      if (!requestId) {
        socket.emit('claude:error', {
          requestId: 'unknown',
          error: 'Request ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const abortController = this.activeRequests.get(requestId);
      
      if (abortController) {
        abortController.abort();
        this.activeRequests.delete(requestId);
        console.log(`⏹️ Request ${requestId} aborted`);
        socket.emit('claude:aborted', {
          requestId,
          message: 'Request aborted successfully',
          timestamp: Date.now()
        });
      } else {
        console.warn(`⚠️ No active request found for ${requestId}`);
        socket.emit('claude:error', {
          requestId,
          error: 'Request not found or already completed',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('❌ Abort request error:', error);
      socket.emit('claude:error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }

  private async requestPermissionWithProgressiveTimeout(
    toolName: string, 
    parameters: Record<string, any>, 
    conversationId: string,
    riskLevel: string
  ): Promise<PermissionResult> {
    try {
      console.log(`🔐 Requesting permission for ${toolName} (${riskLevel} risk) with progressive timeout`);
      
      if (!this.backendSocket) {
        console.warn(`⚠️  No backend WebSocket connection for permission request`);
        return { behavior: 'deny', message: 'No backend connection' };
      }

      // Check if permission is already granted via WebSocket
      const hasPermission = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000);
        
        this.backendSocket.emit('permission:check', { conversationId, toolName }, (response: any) => {
          clearTimeout(timeout);
          resolve(response?.hasPermission || false);
        });
      });

      if (hasPermission) {
        console.log(`✅ Tool ${toolName} already permitted`);
        return { behavior: 'allow', updatedInput: parameters };
      }

      // Create interactive permission prompt via WebSocket
      const promptData = {
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
        },
        conversationId
      };

      // Emit permission request and wait for response
      const promptId = `tool_${toolName}_${Date.now()}`;
      this.backendSocket.emit('permission:request', { ...promptData, promptId });
      
      console.log(`🔄 Starting progressive timeout for prompt ${promptId}`);
      
      const response = await this.waitForPermissionResponseProgressive(promptId, toolName, riskLevel);
      
      if (response.value === 'deny') {
        console.log(`❌ User denied permission for ${toolName}`);
        return { behavior: 'deny', message: 'User denied permission' };
      } else if (response.value === 'allow_once' || response.value === 'allow_always') {
        console.log(`✅ User granted permission for ${toolName}: ${response.value}`);
        return { behavior: 'allow', updatedInput: parameters };
      } else {
        // Fallback decision from progressive timeout
        const fallbackDecision = this.getFinalTimeoutDecision(toolName, riskLevel);
        if (fallbackDecision === 'allow_once') {
          return { behavior: 'allow', updatedInput: parameters };
        } else {
          return { behavior: 'deny', message: 'Progressive timeout exhausted' };
        }
      }
      
    } catch (error) {
      console.error(`❌ Progressive permission request failed for ${toolName}:`, error);
      // Default decision based on risk level
      const conservativeDecision = riskLevel === 'LOW' ? 'allow' : 'deny';
      return { 
        behavior: conservativeDecision as 'allow' | 'deny',
        message: conservativeDecision === 'deny' ? 'Permission system error' : 'I dont have access',
        updatedInput: parameters
      };
    }
  }

  private async requestPermissionFromBackend(
    toolName: string, 
    parameters: Record<string, any>, 
    conversationId: string
  ): Promise<PermissionResult> {
    // Legacy method - redirect to progressive timeout
    return this.requestPermissionWithProgressiveTimeout(
      toolName, 
      parameters, 
      conversationId, 
      this.assessRiskLevel(toolName)
    );
  }

  private async requestPlanReview(
    toolName: string, 
    parameters: Record<string, any>, 
    conversationId: string,
    planContent: string
  ): Promise<PermissionResult> {
    try {
      console.log(`📋 Requesting plan review for ${toolName} in conversation ${conversationId}`);
      
      if (!this.backendSocket) {
        console.warn(`⚠️  No backend WebSocket connection for plan review`);
        return { behavior: 'deny', message: 'No backend connection' };
      }
      
      // Create plan review prompt via WebSocket
      const promptData = {
        type: 'plan_review',
        title: 'Plan Review Required',
        message: 'Claude Code has generated an implementation plan for your review.',
        planContent: planContent,
        options: [
          { id: 'auto_accept', label: 'Auto Accept', value: 'auto_accept', description: 'Immediately approve and start implementation' },
          { id: 'review_accept', label: 'Review & Accept', value: 'review_accept', description: 'I have reviewed the plan and approve it' },
          { id: 'edit_plan', label: 'Edit Plan', value: 'edit_plan', description: 'Let me modify the plan before proceeding' },
          { id: 'reject', label: 'Reject', value: 'reject', description: 'Decline this plan and provide feedback' }
        ],
        context: {
          toolName,
          parameters: JSON.stringify(parameters),
          planLength: planContent.length,
          timestamp: Date.now()
        },
        conversationId
      };

      // Emit plan review request and wait for response
      const promptId = `plan_${conversationId.slice(-8)}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.backendSocket.emit('plan:review-request', { ...promptData, promptId });
      
      console.log(`🔄 Waiting for plan review response for prompt ${promptId}`);
      
      const response = await this.waitForPlanReviewResponse(promptId);
      
      if (response.value === 'reject') {
        console.log(`❌ User rejected plan`);
        return { 
          behavior: 'deny', 
          message: response.feedback || 'Plan was rejected by user',
          planReviewId: promptId 
        };
      } else if (response.value === 'edit_plan') {
        console.log(`✏️ User requested plan edit`);
        return { 
          behavior: 'allow', 
          updatedInput: { ...parameters, plan: response.editedPlan || planContent },
          planReviewId: promptId
        };
      } else if (response.value === 'auto_accept' || response.value === 'review_accept') {
        console.log(`✅ User approved plan: ${response.value}`);
        return { 
          behavior: 'allow', 
          updatedInput: parameters,
          planReviewId: promptId
        };
      } else {
        // Timeout or other error - deny for safety
        return { 
          behavior: 'deny', 
          message: 'Plan review timeout or system error',
          planReviewId: promptId 
        };
      }
      
    } catch (error) {
      console.error(`❌ Plan review request failed:`, error);
      return { 
        behavior: 'deny', 
        message: 'Plan review system error - please try again',
        updatedInput: parameters
      };
    }
  }

  private assessRiskLevel(toolName: string): string {
    const dangerousTools = ['Bash', 'Write', 'Edit', 'MultiEdit', 'ExitPlanMode', 'MultiEdit'];
    const moderateTools = ['WebFetch', 'NotebookEdit'];
    const planTools = ['ExitPlanMode']; // Special handling for plan mode
    
    if (dangerousTools.includes(toolName)) {
      return 'HIGH';
    } else if (moderateTools.includes(toolName)) {
      return 'MEDIUM';
    } else if (planTools.includes(toolName)) {
      return 'PLAN'; // Special risk category for plan review
    } else {
      return 'LOW';
    }
  }

  private async ensureConversationExists(conversationId: string): Promise<void> {
    try {
      console.log(`🗨️  Ensuring conversation ${conversationId} exists`);
      
      if (!this.backendSocket) {
        console.warn(`⚠️  No backend WebSocket connection to check conversation`);
        return;
      }

      // Check if conversation exists via WebSocket
      const exists = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`⚠️  Conversation check timeout for ${conversationId}`);
          resolve(false);
        }, 5000);

        this.backendSocket.emit('conversation:check', { conversationId }, (response: any) => {
          clearTimeout(timeout);
          resolve(response?.exists || false);
        });
      });
      
      if (exists) {
        console.log(`✅ Conversation ${conversationId} already exists`);
        return;
      }
      
      // If conversation doesn't exist, create it via WebSocket
      const created = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`⚠️  Conversation creation timeout for ${conversationId}`);
          resolve(false);
        }, 5000);

        this.backendSocket.emit('conversation:create', {
          conversationId,
          message: 'Bridge conversation initialized',
          projectId: 'cmdxumi04000k4yhw92fvsqqa', // Use baton project
          userId: 'demo-user-1' // Use demo user from seed data
        }, (response: any) => {
          clearTimeout(timeout);
          resolve(response?.success || false);
        });
      });
      
      if (created) {
        console.log(`✅ Created conversation ${conversationId}`);
      } else {
        console.warn(`⚠️ Failed to create conversation ${conversationId}, will try to proceed anyway`);
      }
      
    } catch (error) {
      console.warn(`⚠️ Error ensuring conversation exists:`, error);
      // Continue anyway - maybe the conversation exists but check failed
    }
  }

  private async waitForPlanReviewResponse(promptId: string): Promise<any> {
    // Extended timeout for plan reviews (5 minutes total)
    const timeoutMs = 300000; // 5 minutes
    const startTime = Date.now();
    
    console.log(`⏱️  Waiting for plan review response (timeout: ${timeoutMs / 1000}s)`);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`⏰ Plan review timeout for ${promptId}`);
        resolve({ value: 'timeout', feedback: 'Plan review timeout' });
      }, timeoutMs);

      // Listen for plan review response via WebSocket
      const responseHandler = (data: any) => {
        if (data.promptId === promptId) {
          clearTimeout(timeout);
          
          if (this.backendSocket) {
            this.backendSocket.off('plan:review-response', responseHandler);
          }
          
          console.log(`✅ Received plan review response: ${data.decision}`);
          resolve({
            value: data.decision,
            feedback: data.feedback,
            editedPlan: data.editedPlan
          });
        }
      };

      if (this.backendSocket) {
        this.backendSocket.on('plan:review-response', responseHandler);
      } else {
        clearTimeout(timeout);
        resolve({ value: 'reject', feedback: 'No backend connection' });
      }
    });
  }

  private async waitForPermissionResponseProgressive(
    promptId: string, 
    toolName: string, 
    riskLevel: string
  ): Promise<any> {
    // Progressive timeout strategy: 30s → 60s → 120s (total: 3.5 minutes)
    const timeoutStages = [
      { duration: 30000, description: 'Initial response window' },
      { duration: 60000, description: 'Extended wait with notification' },  
      { duration: 120000, description: 'Final escalation period' }
    ];
    
    console.log(`🔄 Starting progressive timeout for ${toolName} (${riskLevel} risk) - Total timeout: 3.5 minutes`);
    
    for (let stage = 0; stage < timeoutStages.length; stage++) {
      const { duration, description } = timeoutStages[stage];
      const stageNumber = stage + 1;
      
      console.log(`⏱️  Stage ${stageNumber}/3: ${description} (${duration / 1000}s)`);
      
      try {
        const result = await this.waitForPermissionResponse(promptId, duration);
        
        if (result.value !== 'timeout') {
          console.log(`✅ Permission received in stage ${stageNumber} for ${toolName}: ${result.value}`);
          return result;
        }
        
        // Stage timed out, escalate notification
        await this.escalatePermissionNotification(promptId, toolName, riskLevel, stageNumber);
        
      } catch (error) {
        console.error(`❌ Error in stage ${stageNumber} for ${promptId}:`, error);
      }
    }
    
    // All stages exhausted - final decision based on risk level
    const finalDecision = this.getFinalTimeoutDecision(toolName, riskLevel);
    console.warn(`⏰ Progressive timeout exhausted for ${toolName}. Final decision: ${finalDecision}`);
    
    return { value: finalDecision };
  }

  private async waitForPermissionResponse(promptId: string, timeoutMs: number): Promise<any> {
    console.log(`⏱️  Waiting for permission response (timeout: ${timeoutMs / 1000}s)`);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ value: 'timeout' });
      }, timeoutMs);

      // Listen for permission response via WebSocket
      const responseHandler = (data: any) => {
        if (data.promptId === promptId) {
          clearTimeout(timeout);
          
          if (this.backendSocket) {
            this.backendSocket.off('permission:response', responseHandler);
          }
          
          console.log(`✅ Received response for prompt ${promptId}: ${data.selectedOption}`);
          resolve({
            value: data.selectedOption,
            label: data.label,
            ...data
          });
        }
      };

      if (this.backendSocket) {
        this.backendSocket.on('permission:response', responseHandler);
      } else {
        clearTimeout(timeout);
        resolve({ value: 'deny' });
      }
    });
  }

  private async escalatePermissionNotification(
    promptId: string, 
    toolName: string, 
    riskLevel: string, 
    stage: number
  ): Promise<void> {
    try {
      console.log(`📢 Escalating notification for ${promptId} - Stage ${stage}`);
      
      if (this.backendSocket) {
        // Send escalation notification via WebSocket
        this.backendSocket.emit('permission:escalate', {
          promptId,
          stage,
          toolName,
          riskLevel,
          escalationType: stage === 1 ? 'reminder' : stage === 2 ? 'urgent' : 'critical',
          timestamp: Date.now()
        });
      } else {
        console.warn(`⚠️  No backend WebSocket connection for escalation`);
      }
      
      // Log escalation locally
      const escalationTypes = ['', '🔔 Reminder', '🚨 Urgent', '🚩 Critical'];
      console.log(`${escalationTypes[stage]} Permission still needed for ${toolName} (${riskLevel} risk)`);
      
    } catch (error) {
      console.warn(`⚠️  Error escalating notification:`, error);
    }
  }

  private getFinalTimeoutDecision(toolName: string, riskLevel: string): string {
    // Conservative approach - only auto-allow for very safe operations
    const safeTools = ['Read', 'LS', 'Glob', 'Grep'];
    const lowRiskAutoAllow = riskLevel === 'LOW' && safeTools.includes(toolName);
    
    if (lowRiskAutoAllow) {
      console.log(`✅ Auto-allowing ${toolName} due to LOW risk after timeout`);
      return 'allow_once';
    } else {
      console.log(`🚫 Denying ${toolName} (${riskLevel} risk) after progressive timeout`);
      return 'deny';
    }
  }

  private async handleFileListRequest(socket: any, data: { workingDirectory?: string; search?: string }): Promise<void> {
    try {
      const workingDir = data.workingDirectory || process.cwd();
      const search = data.search || '';
      
      console.log(`📁 File list request for directory: ${workingDir}`);
      
      // Check if directory exists and is accessible
      if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
        socket.emit('files:list-response', {
          error: 'Directory not found or not accessible',
          files: [],
          workingDirectory: workingDir,
          count: 0
        });
        return;
      }

      const files = await this.scanDirectory(workingDir, search);
      
      socket.emit('files:list-response', {
        files,
        workingDirectory: workingDir,
        count: files.length
      });
      
    } catch (error) {
      console.error('❌ File list request error:', error);
      socket.emit('files:list-response', {
        error: error instanceof Error ? error.message : String(error),
        files: [],
        workingDirectory: data.workingDirectory || process.cwd(),
        count: 0
      });
    }
  }

  private async handleFileContentRequest(socket: any, data: { filePath: string; workingDirectory?: string }): Promise<void> {
    try {
      const { filePath, workingDirectory } = data;
      
      if (!filePath) {
        socket.emit('files:content-response', {
          error: 'File path is required'
        });
        return;
      }

      const baseDir = workingDirectory || process.cwd();
      const fullPath = path.resolve(baseDir, filePath);
      
      // Security: Ensure file is within working directory
      if (!fullPath.startsWith(path.resolve(baseDir))) {
        socket.emit('files:content-response', {
          error: 'File path outside working directory'
        });
        return;
      }

      console.log(`📄 Reading file: ${fullPath}`);
      
      if (!fs.existsSync(fullPath)) {
        socket.emit('files:content-response', {
          error: 'File not found'
        });
        return;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      
      socket.emit('files:content-response', {
        content,
        path: filePath,
        fullPath,
        size: stats.size,
        lastModified: stats.mtime
      });
      
    } catch (error) {
      console.error('❌ File content request error:', error);
      socket.emit('files:content-response', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async scanDirectory(dirPath: string, search: string = ''): Promise<Array<{path: string, name: string, type: 'file' | 'directory'}>> {
    const files: Array<{path: string, name: string, type: 'file' | 'directory'}> = [];
    const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.vscode', '.idea'];
    const includeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.yml', '.yaml', '.txt', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h'];
    
    const scanRecursive = (currentPath: string, relativePath: string = '') => {
      try {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          
          try {
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
              // Skip excluded directories
              if (excludeDirs.includes(item) || item.startsWith('.')) {
                continue;
              }
              
              // Recursively scan subdirectories (limit depth to avoid performance issues)
              if (relativePath.split(path.sep).length < 5) {
                scanRecursive(itemPath, relativeItemPath);
              }
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              
              // Filter by extension and search term
              if (includeExtensions.includes(ext)) {
                if (!search || item.toLowerCase().includes(search.toLowerCase())) {
                  files.push({
                    path: relativeItemPath,
                    name: item,
                    type: 'file'
                  });
                }
              }
            }
          } catch (itemError) {
            // Skip files/directories that can't be accessed
            console.warn(`⚠️ Skipping ${itemPath}:`, itemError);
          }
        }
      } catch (dirError) {
        console.warn(`⚠️ Error scanning ${currentPath}:`, dirError);
      }
    };
    
    scanRecursive(dirPath);
    
    // Sort files by name and limit results
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files.slice(0, 100); // Limit to 100 files for performance
  }

  async start(): Promise<void> {
    // Create HTTP server for Socket.IO
    const httpServer = createServer();
    
    // Create Socket.IO server
    this.io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    // Connect to backend WebSocket
    await this.connectToBackend();
    
    // Set up WebSocket event handlers
    this.setupWebSocketHandlers();

    // Start HTTP server
    httpServer.listen(this.port, () => {
      console.log(`🌉 Claude Code Bridge WebSocket server running on port ${this.port}`);
      console.log(`🔗 Backend URL: ${this.backendUrl}`);
      console.log(`🔧 Ready to serve Claude Code requests via WebSocket`);
    });

    return new Promise((resolve) => {
      resolve();
    });
  }

  private async connectToBackend(): Promise<void> {
    try {
      console.log(`🔗 Connecting to backend at ${this.backendUrl}...`);
      
      // Convert WebSocket URL to HTTP URL for socket.io-client
      const httpUrl = this.backendUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      
      // For Docker networking, need to use host.docker.internal if connecting from container
      // But this is running on the host connecting to Docker, so we need to handle the opposite
      // The backend runs in Docker and needs to be accessible from the host
      console.log(`📡 Establishing Socket.IO client connection to: ${httpUrl}`);
      
      this.backendSocket = ioClient(httpUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      this.backendSocket.on('connect', () => {
        console.log('🌉 Connected to backend WebSocket server');
        // Join the claude-bridge room so backend can find this bridge service
        this.backendSocket?.emit('claude-bridge:connect');
        
        // Set up event handlers for backend communication
        this.setupBackendEventHandlers();
      });

      this.backendSocket.on('disconnect', (reason) => {
        console.log('🌉 Disconnected from backend:', reason);
      });

      this.backendSocket.on('connect_error', (error) => {
        console.error('❌ Backend connection error:', error);
      });

      this.backendSocket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Reconnected to backend after', attemptNumber, 'attempts');
        // Re-join the claude-bridge room after reconnection
        this.backendSocket?.emit('claude-bridge:connect');
        this.backendSocket?.emit('join-room', 'claude-bridge');
      });
      
    } catch (error) {
      console.error('❌ Failed to connect to backend:', error);
    }
  }

  private setupBackendEventHandlers(): void {
    if (!this.backendSocket) return;

    // Handle Claude Code execution requests from backend
    this.backendSocket.on('claude:execute', async (request: BridgeRequest) => {
      console.log(`🚀 Received claude:execute from backend:`, request.requestId);
      await this.handleExecuteRequest(this.backendSocket!, request);
    });

    // Handle abort requests from backend
    this.backendSocket.on('claude:abort', (requestId: string) => {
      console.log(`⏹️ Received claude:abort for ${requestId} from backend`);
      this.handleAbortRequest(this.backendSocket!, requestId);
    });

    console.log('✅ Backend event handlers configured');
  }

  private setupWebSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Handle Claude Code execution requests
      socket.on('claude:execute', async (request: BridgeRequest) => {
        console.log(`🚀 Received claude:execute from ${socket.id}`);
        await this.handleExecuteRequest(socket, request);
      });

      // Handle abort requests
      socket.on('claude:abort', (requestId: string) => {
        console.log(`⏹️ Received claude:abort for ${requestId} from ${socket.id}`);
        this.handleAbortRequest(socket, requestId);
      });

      // Handle health checks
      socket.on('bridge:health', () => {
        socket.emit('bridge:health-response', {
          status: 'ok',
          service: 'claude-code-bridge',
          timestamp: Date.now(),
          activeRequests: this.activeRequests.size
        });
      });

      // Handle file operations
      socket.on('files:list', async (data: { workingDirectory?: string; search?: string }) => {
        await this.handleFileListRequest(socket, data);
      });

      socket.on('files:content', async (data: { filePath: string; workingDirectory?: string }) => {
        await this.handleFileContentRequest(socket, data);
      });

      // Handle permission responses from backend
      socket.on('permission:response', (data: { promptId: string; response: any }) => {
        console.log(`🔐 Received permission response for ${data.promptId}`);
        // This will be handled by the waitForPermissionResponse method
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
      });
    });
  }

  async stop(): Promise<void> {
    console.log(`⏹️ Aborting ${this.activeRequests.size} active requests...`);
    for (const [requestId, abortController] of Array.from(this.activeRequests)) {
      abortController.abort();
    }
    this.activeRequests.clear();
    
    if (this.io) {
      this.io.close();
    }
    
    if (this.backendSocket) {
      this.backendSocket.disconnect();
    }
    
    console.log('🛑 Claude Code Bridge stopped');
  }
}

// Create bridge instance
const bridge = new ClaudeCodeBridge();

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let port = 8080;
  let backendUrl = 'http://localhost:3001';

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--backend' && i + 1 < args.length) {
      backendUrl = args[i + 1];
      i++;
    }
  }

  // Create new bridge instance with parsed args
  const bridgeInstance = new ClaudeCodeBridge(port, backendUrl);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Claude Code Bridge...');
    await bridgeInstance.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down Claude Code Bridge...');
    await bridgeInstance.stop();
    process.exit(0);
  });

  try {
    await bridgeInstance.start();
  } catch (error) {
    console.error('❌ Failed to start Claude Code Bridge:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Claude Code Bridge failed:', error);
    process.exit(1);
  });
}

export { ClaudeCodeBridge };