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
          const sendResponse = (response: StreamResponse) => {
            controller.enqueue(`data: ${JSON.stringify(response)}\n\n`);
          };

          try {
            // Create abort controller for this request
            const abortController = new AbortController();
            this.activeRequests.set(requestId, abortController);

            // Build context message
            let contextMessage = message;
            if (projectName) {
              contextMessage = `Project: ${projectName}\n\n${message}`;
            }

            // Configure Claude Code options
            const claudeOptions: any = {
              abortController,
              maxTurns: 20,
              permissionMode: permissionMode || 'default',
              canUseTool: async (toolName: string, parameters: Record<string, any>) => {
                return await this.requestPermissionFromBackend(toolName, parameters, conversationId);
              }
            };

            // Add session resume if available
            if (sessionId && sessionId.trim() !== "") {
              claudeOptions.resume = sessionId;
              console.log(`✅ Resuming session: ${sessionId}`);
            }

            // Add working directory
            if (workingDirectory) {
              claudeOptions.cwd = workingDirectory;
            }

            // Add allowed tools
            if (allowedTools && allowedTools.length > 0) {
              claudeOptions.allowedTools = allowedTools;
            }

            console.log(`🔧 Claude Code options configured for ${requestId}`);

            // Execute Claude Code query
            let messageCount = 0;
            for await (const sdkMessage of query({ prompt: contextMessage, options: claudeOptions })) {
              messageCount++;
              
              // Log first few messages for debugging
              if (messageCount <= 3) {
                console.log(`📨 Message ${messageCount} type: ${sdkMessage.type || "unknown"} for ${requestId}`);
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
            controller.close();
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

  private async waitForPermissionResponse(promptId: string, timeoutMs: number = 60000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every second
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.backendUrl}/api/chat/prompts/${promptId}`);
        
        if (response.ok) {
          const data = await response.json();
          const prompt = data.prompt;
          if (prompt && prompt.status === 'answered') {
            const options = prompt.options as any[];
            const selectedOption = options.find((o: any) => o.id === prompt.selectedOption);
            return selectedOption || { value: 'deny' };
          }
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.log(`⏳ Polling for response to ${promptId}...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    // Timeout - default to deny
    console.warn(`⏰ Permission request ${promptId} timed out`);
    return { value: 'deny' };
  }

  async start(): Promise<void> {
    const server = Bun.serve({
      port: this.port,
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