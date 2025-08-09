#!/usr/bin/env bun

/**
 * Claude Code Bridge Service
 * 
 * A lightweight HTTP service that executes Claude Code SDK requests
 * on behalf of the Docker backend. This allows the web UI to use
 * Claude Code while keeping the execution on the local machine.
 * 
 * Usage:
 * bun run bridge.ts [--port 8080] [--backend http://localhost:3001]
 */

import { query, type PermissionResult, type SDKUserMessage, type PermissionMode} from "@anthropic-ai/claude-code";
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

class ClaudeCodeBridge {
  private port: number;
  private backendUrl: string;
  private activeRequests = new Map<string, AbortController>();

  constructor(port: number = 8080, backendUrl: string = 'http://localhost:3001') {
    this.port = port;
    this.backendUrl = backendUrl;
  }

  private async handleExecuteRequest(request: Request): Promise<Response> {
    try {
      const body = await request.json() as BridgeRequest;
      const { message, requestId, conversationId, sessionId, allowedTools, workingDirectory, permissionMode = 'default', projectName } = body;

      console.log(`🚀 Bridge executing Claude Code request ${requestId}`);
      console.log(`📝 Message: "${message.substring(0, 100)}..."`);
      console.log(`🔗 Session: ${sessionId || 'new'}`);
      console.log(`🛠️  Tools: ${allowedTools?.join(', ') || 'default'}`);
      console.log(`📁 Working Dir: ${workingDirectory || 'default CWD'}`);
      console.log(`🔐 Permission Mode: ${permissionMode}`);
      console.log(`📦 Conversation: ${conversationId} | Project: ${projectName || 'n/a'}`);

      // Create readable stream for Server-Sent Events
      const stream = new ReadableStream({
        start: async (controller) => {
          let streamClosed = false;
          
          const sendResponse = (response: StreamResponse) => {
            if (streamClosed || controller.desiredSize === null) {
              console.log(`⚠️  Stream already closed, cannot send response for ${requestId}`);
              return;
            }
            try {
              controller.enqueue(`data: ${JSON.stringify(response)}\n\n`);
            } catch (error) {
              console.log(`⚠️  Error sending to stream for ${requestId}:`, error);
              streamClosed = true;
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

            // Configure Claude Code options using the same pattern as working backend
            const claudeOptions: any = {
              abortController,
              executable: process.execPath,
              executableArgs: [],
              pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH || "/home/hassan/.nvm/versions/node/v22.18.0/bin/claude",
              maxTurns: 20,
              mcpServers: {},
              permissionMode: permissionMode,
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
                  return { behavior: 'allow', updatedInput: planReviewResult.updatedInput || parameters };
                  
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

              // Permission handling is now done in canUseTool callback

              // Send stream response
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

            // Send completion
            sendResponse({
              type: "done",
              requestId,
              timestamp: Date.now()
            });

            console.log(`🏁 Bridge execution completed for ${requestId} (${messageCount} messages)`);

          } catch (error) {
            console.error(`❌ Bridge execution error for ${requestId}:`, error);
            if (conversationDone) conversationDone();
            
            if (error instanceof Error && error.name === 'AbortError') {
              sendResponse({
                type: "aborted",
                requestId,
                timestamp: Date.now()
              });
            } else {
              sendResponse({
                type: "error",
                error: error instanceof Error ? error.message : String(error),
                requestId,
                timestamp: Date.now()
              });
            }
          } finally {
            // Clean up
            this.activeRequests.delete(requestId);
            if (!streamClosed && controller.desiredSize !== null) {
              try {
                controller.close();
              } catch (error) {
                console.log(`⚠️  Error closing controller for ${requestId}:`, error);
              }
            }
            streamClosed = true;
          }
        }
      });

      // Return streaming response
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });

    } catch (error) {
      console.error('❌ Execute request error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleAbortRequest(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const requestId = url.pathname.split('/').pop();
      
      if (!requestId) {
        return new Response(JSON.stringify({ error: 'Request ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const abortController = this.activeRequests.get(requestId);
      
      if (abortController) {
        abortController.abort();
        this.activeRequests.delete(requestId);
        console.log(`⏹️ Request ${requestId} aborted`);
        return new Response(JSON.stringify({ success: true, message: 'Request aborted' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        console.warn(`⚠️ No active request found for ${requestId}`);
        return new Response(JSON.stringify({ success: false, message: 'Request not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('❌ Abort request error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
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
      
      // Ensure conversation exists first
      await this.ensureConversationExists(conversationId);
      
      // Check if permission is already granted
      const permissionsResponse = await fetch(
        `${this.backendUrl}/api/chat/conversations/${conversationId}/permissions`
      );
      
      if (permissionsResponse.ok) {
        const permissionsData = await permissionsResponse.json();
        const permissions = permissionsData.permissions || [];
        if (permissions.includes(toolName)) {
          console.log(`✅ Tool ${toolName} already permitted`);
          return { behavior: 'allow', updatedInput: parameters };
        }
      }

      // Create interactive permission prompt
      const promptResponse = await fetch(
        `${this.backendUrl}/api/chat/conversations/${conversationId}/prompts`,
        {
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
        }
      );

      if (!promptResponse.ok) {
        throw new Error('Failed to create permission prompt');
      }

      const promptData = await promptResponse.json();
      if (!promptData.success) {
        throw new Error('Failed to create permission prompt');
      }

      // Use progressive timeout strategy
      const promptId = promptData.prompt.id;
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
      
      // Ensure conversation exists first
      await this.ensureConversationExists(conversationId);
      
      // Create plan review prompt
      const promptResponse = await fetch(
        `${this.backendUrl}/api/chat/conversations/${conversationId}/plan-review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
            }
          })
        }
      );

      if (!promptResponse.ok) {
        throw new Error(`Failed to create plan review prompt: ${promptResponse.status}`);
      }

      const promptData = await promptResponse.json();
      if (!promptData.success) {
        throw new Error('Failed to create plan review prompt');
      }

      // Wait for plan review response with extended timeout for plans
      const promptId = promptData.prompt.id;
      console.log(`🔄 Waiting for plan review response for prompt ${promptId}`);
      
      const response = await this.waitForPlanReviewResponse(promptId);
      
      if (response.value === 'reject') {
        console.log(`❌ User rejected plan`);
        return { 
          behavior: 'deny', 
          message: response.feedback || 'Plan was rejected by user' 
        };
      } else if (response.value === 'edit_plan') {
        console.log(`✏️ User requested plan edit`);
        return { 
          behavior: 'allow', 
          updatedInput: { ...parameters, plan: response.editedPlan || planContent }
        };
      } else if (response.value === 'auto_accept' || response.value === 'review_accept') {
        console.log(`✅ User approved plan: ${response.value}`);
        return { 
          behavior: 'allow', 
          updatedInput: parameters 
        };
      } else {
        // Timeout or other error - deny for safety
        return { 
          behavior: 'deny', 
          message: 'Plan review timeout or system error' 
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
      
      // Check if conversation exists
      const checkResponse = await fetch(
        `${this.backendUrl}/api/chat/conversations/${conversationId}/permissions`
      );
      
      if (checkResponse.ok) {
        console.log(`✅ Conversation ${conversationId} already exists`);
        return;
      }
      
      // If conversation doesn't exist, create it
      // We need to create it with a default project and user
      // For now, use the demo project from seeded data
      const createResponse = await fetch(
        `${this.backendUrl}/api/chat/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Bridge conversation initialized',
            requestId: `init-${conversationId}`,
            conversationId,
            projectId: 'cmdxumi04000k4yhw92fvsqqa', // Use baton project
            userId: 'demo-user-1' // Use demo user from seed data
          })
        }
      );
      
      if (createResponse.ok) {
        console.log(`✅ Created conversation ${conversationId}`);
      } else {
        console.warn(`⚠️ Failed to create conversation ${conversationId}, will try to proceed anyway`);
      }
      
    } catch (error) {
      console.warn(`⚠️ Error ensuring conversation exists:`, error);
      // Continue anyway - maybe the conversation exists but permissions endpoint failed
    }
  }

  private async waitForPlanReviewResponse(promptId: string): Promise<any> {
    // Extended timeout for plan reviews (5 minutes total)
    const timeoutMs = 300000; // 5 minutes
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every 1 second for plan reviews
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    
    console.log(`⏱️  Waiting for plan review response (timeout: ${timeoutMs / 1000}s)`);
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const fetchAbortController = new AbortController();
        const timeoutId = setTimeout(() => fetchAbortController.abort(), 8000); // 8 second timeout per request
        
        const response = await fetch(`${this.backendUrl}/api/chat/plan-review/${promptId}`, {
          signal: fetchAbortController.signal,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          const planReview = data.planReview;
          
          if (planReview && planReview.status === 'completed') {
            console.log(`✅ Received plan review response: ${planReview.decision}`);
            return {
              value: planReview.decision,
              feedback: planReview.feedback,
              editedPlan: planReview.editedPlan
            };
          }
          
          // Reset error count on successful request
          consecutiveErrors = 0;
        } else if (response.status === 404) {
          console.warn(`❓ Plan review ${promptId} not found`);
          return { value: 'reject', feedback: 'Plan review session not found' };
        } else {
          consecutiveErrors++;
          console.warn(`⚠️  HTTP ${response.status} for plan review ${promptId} (errors: ${consecutiveErrors})`);
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        consecutiveErrors++;
        
        if (consecutiveErrors <= 3) {
          console.log(`⏳ Polling for plan review response ${promptId}... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
        } else if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ Too many consecutive errors (${consecutiveErrors}) for plan review ${promptId}`);
          return { value: 'reject', feedback: 'Plan review system error' };
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    // Timeout reached
    console.warn(`⏰ Plan review timeout for ${promptId}`);
    return { value: 'timeout', feedback: 'Plan review timeout' };
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
    const startTime = Date.now();
    const pollInterval = 500; // Poll every 500ms for faster response
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const fetchAbortController = new AbortController();
        const timeoutId = setTimeout(() => fetchAbortController.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${this.backendUrl}/api/chat/prompts/${promptId}`, {
          signal: fetchAbortController.signal,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          const prompt = data.prompt;
          
          if (prompt && prompt.status === 'answered') {
            console.log(`✅ Received response for prompt ${promptId}: ${prompt.selectedOption}`);
            const options = prompt.options as any[];
            const selectedOption = options.find((o: any) => o.id === prompt.selectedOption);
            return selectedOption || { value: 'deny' };
          }
          
          // Reset error count on successful request
          consecutiveErrors = 0;
        } else if (response.status === 404) {
          console.warn(`❓ Prompt ${promptId} not found, may have been removed`);
          return { value: 'deny' };
        } else {
          consecutiveErrors++;
          console.warn(`⚠️  HTTP ${response.status} for prompt ${promptId} (errors: ${consecutiveErrors})`);
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        consecutiveErrors++;
        
        if (consecutiveErrors <= 3) {
          console.log(`⏳ Polling for response to ${promptId}... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
        } else if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ Too many consecutive errors (${consecutiveErrors}) for prompt ${promptId}, giving up`);
          return { value: 'deny' };
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    // Stage timeout
    return { value: 'timeout' };
  }

  private async escalatePermissionNotification(
    promptId: string, 
    toolName: string, 
    riskLevel: string, 
    stage: number
  ): Promise<void> {
    try {
      console.log(`📢 Escalating notification for ${promptId} - Stage ${stage}`);
      
      // Send escalation notification to backend
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
      }).catch(error => {
        console.warn(`⚠️  Failed to send escalation notification:`, error);
      });
      
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

  private async handleFileListRequest(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const workingDir = url.searchParams.get('workingDirectory') || process.cwd();
      const search = url.searchParams.get('search') || '';
      
      console.log(`📁 File list request for directory: ${workingDir}`);
      
      // Check if directory exists and is accessible
      if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
        return new Response(JSON.stringify({
          error: 'Directory not found or not accessible',
          files: []
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const files = await this.scanDirectory(workingDir, search);
      
      return new Response(JSON.stringify({
        files,
        workingDirectory: workingDir,
        count: files.length
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      console.error('❌ File list request error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        files: []
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleFileContentRequest(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      const { filePath, workingDirectory } = body;
      
      if (!filePath) {
        return new Response(JSON.stringify({
          error: 'File path is required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const baseDir = workingDirectory || process.cwd();
      const fullPath = path.resolve(baseDir, filePath);
      
      // Security: Ensure file is within working directory
      if (!fullPath.startsWith(path.resolve(baseDir))) {
        return new Response(JSON.stringify({
          error: 'File path outside working directory'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log(`📄 Reading file: ${fullPath}`);
      
      if (!fs.existsSync(fullPath)) {
        return new Response(JSON.stringify({
          error: 'File not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      
      return new Response(JSON.stringify({
        content,
        path: filePath,
        fullPath,
        size: stats.size,
        lastModified: stats.mtime
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      console.error('❌ File content request error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
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
    const server = (Bun as any).serve({
      port: this.port,
      idleTimeout: 180, // 3 minutes timeout in seconds (max 255)
      async fetch(request) {
        const url = new URL(request.url);
        
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
          });
        }
        
        // Route requests
        if (url.pathname === '/health' && request.method === 'GET') {
          return new Response(JSON.stringify({
            status: 'ok',
            service: 'claude-code-bridge',
            timestamp: Date.now(),
            activeRequests: bridge.activeRequests.size
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (url.pathname === '/execute' && request.method === 'POST') {
          return bridge.handleExecuteRequest(request);
        }
        
        if (url.pathname.startsWith('/abort/') && request.method === 'POST') {
          return bridge.handleAbortRequest(request);
        }
        
        if (url.pathname === '/status' && request.method === 'GET') {
          return new Response(JSON.stringify({
            activeRequests: Array.from(bridge.activeRequests.keys()),
            uptime: process.uptime(),
            memory: process.memoryUsage()
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (url.pathname === '/files/list' && request.method === 'GET') {
          return bridge.handleFileListRequest(request);
        }
        
        if (url.pathname === '/files/content' && request.method === 'POST') {
          return bridge.handleFileContentRequest(request);
        }
        
        return new Response('Not Found', { status: 404 });
      },
    });

    console.log(`🌉 Claude Code Bridge running on port ${this.port}`);
    console.log(`🔗 Backend URL: ${this.backendUrl}`);
    console.log(`🔧 Ready to serve Claude Code requests from Docker backend`);

    return new Promise((resolve) => {
      resolve();
    });
  }

  async stop(): Promise<void> {
    console.log(`⏹️ Aborting ${this.activeRequests.size} active requests...`);
    for (const [requestId, abortController] of Array.from(this.activeRequests)) {
      abortController.abort();
    }
    this.activeRequests.clear();
    console.log('🛑 Claude Code Bridge stopped');
  }
}

// Create bridge instance (needed for the server fetch handler)
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

  // Update bridge instance with parsed args
  (bridge as any).port = port;
  (bridge as any).backendUrl = backendUrl;

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Claude Code Bridge...');
    await bridge.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down Claude Code Bridge...');
    await bridge.stop();
    process.exit(0);
  });

  try {
    await bridge.start();
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