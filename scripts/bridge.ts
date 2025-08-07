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

import { query, type PermissionResult } from "@anthropic-ai/claude-code";

interface BridgeRequest {
  message: string;
  requestId: string;
  conversationId: string;
  sessionId?: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: string;
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
      const { message, requestId, conversationId, sessionId, allowedTools, workingDirectory, permissionMode, projectName } = body;

      console.log(`🚀 Bridge executing Claude Code request ${requestId}`);
      console.log(`📝 Message: "${message.substring(0, 100)}..."`);
      console.log(`🔗 Session: ${sessionId || 'new'}`);
      console.log(`🛠️  Tools: ${allowedTools?.join(', ') || 'default'}`);

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

          // Set up conversation completion pattern like ultimate.ts (must be outside try block)
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

            // Configure Claude Code options without canUseTool due to SDK bug #4775
            // The canUseTool callback is completely broken on Linux - even ultimate.ts fails
            const claudeOptions: any = {
              maxTurns: 20,
              mcpServers: {},
              // Temporarily remove canUseTool to test if basic functionality works
            };

            // Resume session if provided to preserve context
            if (sessionId && sessionId.trim() !== "") {
              claudeOptions.resume = sessionId;
              console.log(`✅ Resuming session: ${sessionId}`);
            } else {
              console.log(`🆕 Starting new session for request ${requestId}`);
            }

            // Add working directory
            if (workingDirectory) {
              claudeOptions.cwd = workingDirectory;
            }

            // Add allowed tools
            if (allowedTools && allowedTools.length > 0) {
              claudeOptions.allowedTools = allowedTools;
            }

            console.log(`🔧 Claude Code options configured for ${requestId}:`);
            console.log(`   - permissionMode: ${claudeOptions.permissionMode}`);
            console.log(`   - canUseTool: ${typeof claudeOptions.canUseTool}`);
            console.log(`   - allowedTools: ${claudeOptions.allowedTools || 'default'}`);
            console.log(`   - maxTurns: ${claudeOptions.maxTurns}`);

            // Execute Claude Code query using ultimate.ts conversation completion pattern
            // This prevents stream closure errors while implementing our own permission system
            let messageCount = 0;
            
            // Use exact pattern from ultimate.ts that prevents stream closure
            async function* createPromptStream() {
              yield {
                type: 'user' as const,
                message: {
                  role: 'user' as const,
                  content: contextMessage
                },
                parent_tool_use_id: null,
                session_id: sessionId || `bridge-${Date.now()}`
              };
              // CRITICAL: Wait for conversation to complete - this prevents stream closure errors
              await conversationComplete;
            }
            
            for await (const sdkMessage of query({
              prompt: createPromptStream(),
              options: {
                abortController,
                ...claudeOptions
              }
            })) {
              messageCount++;
              
              // Log first few messages for debugging
              if (messageCount <= 3) {
                console.log(`📨 Message ${messageCount} type: ${sdkMessage.type || "unknown"} for ${requestId}`);
              }

              // PERMISSION INTERCEPTION: Check for dangerous tool usage before streaming
              if (sdkMessage.type === "assistant" && sdkMessage.message?.content) {
                const content = sdkMessage.message.content;
                
                // Check if this message contains tool usage
                if (Array.isArray(content)) {
                  for (const contentItem of content) {
                    if (contentItem.type === "tool_use") {
                      const toolName = contentItem.name;
                      const toolParams = contentItem.input || {};
                      const riskLevel = this.assessRiskLevel(toolName);
                      
                      // Only require permission for dangerous tools
                      if (riskLevel === 'HIGH') {
                        console.log(`🛡️  Dangerous tool detected: ${toolName} - requesting permission`);
                        
                        try {
                          // Request permission from backend with timeout handling
                          const permissionResult = await this.requestPermissionFromBackend(
                            toolName,
                            toolParams,
                            conversationId
                          );
                          
                          if (permissionResult.behavior === 'deny') {
                            console.log(`🚫 Tool ${toolName} denied by user`);
                            
                            // Send denial response instead of tool usage
                            const denialResponse: StreamResponse = {
                              type: "claude_json",
                              data: {
                                type: "assistant",
                                message: {
                                  role: "assistant",
                                  content: [{
                                    type: "text",
                                    text: `I cannot use the ${toolName} tool because permission was denied. ${permissionResult.message || ''}`
                                  }]
                                }
                              },
                              requestId,
                              timestamp: Date.now()
                            };
                            
                            sendResponse(denialResponse);
                            
                            // Send completion and finish
                            sendResponse({
                              type: "done",
                              requestId,
                              timestamp: Date.now()
                            });
                            
                            // Complete the conversation
                            if (conversationDone) conversationDone();
                            return;
                          }
                          
                          console.log(`✅ Tool ${toolName} approved by user`);
                        } catch (permissionError) {
                          console.error(`❌ Permission request failed for ${toolName}:`, permissionError);
                          
                          // Send error response and continue
                          const errorResponse: StreamResponse = {
                            type: "claude_json",
                            data: {
                              type: "assistant",
                              message: {
                                role: "assistant",
                                content: [{
                                  type: "text",
                                  text: `Permission request failed for ${toolName}. Proceeding with default behavior.`
                                }]
                              }
                            },
                            requestId,
                            timestamp: Date.now()
                          };
                          
                          sendResponse(errorResponse);
                          // Continue processing normally
                        }
                      }
                    }
                  }
                }
              }

              // Send stream response
              const streamResponse: StreamResponse = {
                type: "claude_json",
                data: sdkMessage,
                requestId,
                timestamp: Date.now()
              };
              
              sendResponse(streamResponse);

              // Handle different message types
              if (sdkMessage.type === "result") {
                console.log(`✅ Claude Code execution completed for ${requestId}: ${sdkMessage.subtype}`);
                
                // Complete the conversation to prevent stream closure
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
            
            // Complete the conversation on error to prevent hanging
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

  private async getBasicPermission(toolName: string, parameters: Record<string, any>): Promise<PermissionResult> {
    try {
      console.log('\n' + '='.repeat(60));
      console.log(`🔧 PERMISSION REQUEST - ${toolName}`);
      console.log('='.repeat(60));
      
      // Show tool details
      console.log(`📋 Tool: ${toolName}`);
      console.log(`📝 Parameters:`);
      Object.entries(parameters).forEach(([key, value]) => {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        const truncated = valueStr.length > 100 ? valueStr.substring(0, 100) + '...' : valueStr;
        console.log(`   ${key}: ${truncated}`);
      });
      
      // Risk assessment
      const riskLevel = this.assessRiskLevel(toolName);
      const riskIcon = riskLevel === 'HIGH' ? '🔴' : riskLevel === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`\n🛡️  Risk Level: ${riskIcon} ${riskLevel}`);
      
      console.log('='.repeat(60));
      console.log('Options: y=allow, n=deny, a=allow all');
      
      // This function should not be called anymore since we use requestPermissionFromBackend
      console.warn('⚠️  getBasicPermission called - should use requestPermissionFromBackend instead');
      
      return { behavior: 'deny', message: 'Use interactive permission system instead' };
      
    } catch (error) {
      console.error(`❌ Permission error for ${toolName}:`, error);
      return { behavior: 'deny', message: 'Permission system error' };
    }
  }

  private async requestPermissionFromBackend(
    toolName: string, 
    parameters: Record<string, any>, 
    conversationId: string
  ): Promise<PermissionResult> {
    try {
      console.log(`🔐 Requesting permission for ${toolName} from backend`);
      
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
              riskLevel: this.assessRiskLevel(toolName)
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

      // Wait for user response (polling approach)
      const promptId = promptData.prompt.id;
      console.log(`⏳ Waiting for user response to prompt ${promptId}`);
      
      const response = await this.waitForPermissionResponse(promptId);
      
      if (response.value === 'deny') {
        console.log(`❌ User denied permission for ${toolName}`);
        return { behavior: 'deny', message: 'User denied permission' };
      } else {
        console.log(`✅ User granted permission for ${toolName}`);
        return { behavior: 'allow', updatedInput: parameters };
      }
      
    } catch (error) {
      console.error(`❌ Permission request failed for ${toolName}:`, error);
      // Default to deny for security
      return { behavior: 'deny', message: 'Permission request failed' };
    }
  }

  private assessRiskLevel(toolName: string): string {
    const dangerousTools = ['Bash', 'Write', 'Edit', 'MultiEdit'];
    const moderateTools = ['WebFetch', 'NotebookEdit'];
    
    if (dangerousTools.includes(toolName)) {
      return 'HIGH';
    } else if (moderateTools.includes(toolName)) {
      return 'MEDIUM';
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
            projectId: 'demo-project-1', // Use demo project from seed data
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

  private async waitForPermissionResponse(promptId: string, timeoutMs: number = 120000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 500; // Poll every 500ms for faster response
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    
    console.log(`⏳ Waiting for user response to prompt ${promptId} (timeout: ${timeoutMs}ms)`);
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.backendUrl}/api/chat/prompts/${promptId}`, {
          timeout: 5000, // 5 second timeout per request
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
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
    
    // Timeout - default to deny
    console.warn(`⏰ Permission request ${promptId} timed out after ${timeoutMs}ms`);
    return { value: 'deny' };
  }

  async start(): Promise<void> {
    const server = Bun.serve({
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
    for (const [requestId, abortController] of this.activeRequests) {
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