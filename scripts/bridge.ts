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

import { query, type PermissionResult, type SDKUserMessage } from "@anthropic-ai/claude-code";

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
              permissionMode: 'default' as const,
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

            // Add working canUseTool callback with backend integration and fallback
            claudeOptions.canUseTool = async (toolName: string, parameters: Record<string, any>) => {
              const riskLevel = this.assessRiskLevel(toolName);
              
              if (riskLevel === 'HIGH') {
                console.log(`🛡️  High-risk tool detected: ${toolName} - trying backend permission`);
                try {
                  // Try backend permission system with timeout
                  const permissionPromise = this.requestPermissionFromBackend(
                    toolName,
                    parameters,
                    conversationId
                  );
                  
                  // Race against timeout to prevent deadlock
                  const timeoutPromise = new Promise<PermissionResult>((resolve) => {
                    setTimeout(() => {
                      console.log(`⏰ Backend permission timed out for ${toolName} - falling back to auto-allow`);
                      resolve({ behavior: 'allow', updatedInput: parameters });
                    }, 60000); // 60 second timeout
                  });
                  
                  const permissionResult = await Promise.race([permissionPromise, timeoutPromise]);
                  
                  if (permissionResult.behavior === 'deny') {
                    console.log(`🚫 Tool ${toolName} denied by user`);
                    return { behavior: 'deny', message: 'User denied permission' };
                  }
                  
                  console.log(`✅ Tool ${toolName} approved by user/fallback`);
                  return { behavior: 'allow', updatedInput: permissionResult.updatedInput || parameters };
                } catch (error) {
                  console.error(`❌ Permission request failed for ${toolName}, falling back to auto-allow:`, error);
                  return { behavior: 'allow', updatedInput: parameters };
                }
              }
              
              // Allow non-dangerous tools by default
              return { behavior: 'allow', updatedInput: parameters };
            };

            let messageCount = 0;
            
            for await (const sdkMessage of query({
              prompt: createPromptStream(),
              options: claudeOptions
            })) {
              messageCount++;
              
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
    
    // Timeout - default to deny
    console.warn(`⏰ Permission request ${promptId} timed out after ${timeoutMs}ms`);
    return { value: 'deny' };
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