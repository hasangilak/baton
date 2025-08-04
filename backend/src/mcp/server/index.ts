import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { WebSocketServer } from 'ws';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from '@prisma/client';
import { BatonResourceProvider } from '../resources/index';
import { BatonToolProvider } from '../tools/index';
import { BatonPromptProvider } from '../prompts/index';
import { BatonWorkspaceManager } from '../workspace/index';
import { IncomingMessage, ServerResponse } from 'node:http';

export class BatonMCPServer {
  private server: Server;
  private prisma: PrismaClient;
  private resourceProvider: BatonResourceProvider;
  private toolProvider: BatonToolProvider;
  private promptProvider: BatonPromptProvider;
  private workspaceManager: BatonWorkspaceManager;
  private sseTransports: Map<string, SSEServerTransport> = new Map();
  private connectionProjects: Map<string, string | null> = new Map(); // sessionId -> projectId

  constructor() {
    this.server = new Server(
      {
        name: "baton-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {
            subscribe: true,
            listChanged: true,
          },
          tools: {
            listChanged: true,
          },
          prompts: {
            listChanged: true,
          },
        },
      }
    );

    this.prisma = new PrismaClient();
    this.workspaceManager = new BatonWorkspaceManager(this.prisma);
    this.resourceProvider = new BatonResourceProvider(this.prisma);
    this.toolProvider = new BatonToolProvider(this.prisma, this.workspaceManager);
    this.promptProvider = new BatonPromptProvider(this.prisma);

    this.setupHandlers();
  }

  private setupHandlers() {
    // Add general message logging
    this.server.onerror = (error) => {
      console.error('❌ MCP Server Error:', error);
    };
    
    // List Resources Handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async (_, { sessionId }) => {
      console.log('📜 Processing resources/list request...');
      try {
        // Detect project context for this request
        const projectId = await this.detectProjectContext(sessionId);
        console.log(`🎯 Project context: ${projectId || 'none'}`);
        
        const resources = await this.resourceProvider.listResources(projectId);
        console.log(`✅ Found ${resources.length} resources`);
        return { resources };
      } catch (error) {
        console.error('❌ Error in resources/list:', error);
        throw error;
      }
    });

    // Read Resource Handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request, { sessionId }) => {
      const { uri } = request.params;
      try {
        // Detect project context for this request
        const projectId = await this.detectProjectContext(sessionId);
        
        const content = await this.resourceProvider.readResource(uri, projectId);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(content, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Failed to read resource: ${uri}`
        );
      }
    });

    // List Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log('🔧 Processing tools/list request...');
      try {
        const tools = await this.toolProvider.listTools();
        console.log(`✅ Found ${tools.length} tools`);
        return { tools };
      } catch (error) {
        console.error('❌ Error in tools/list:', error);
        throw error;
      }
    });

    // Call Tool Handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request, { sessionId }) => {
      const { name, arguments: args } = request.params;
      try {
        // Detect project context for this request
        const projectId = await this.detectProjectContext(sessionId);
        console.log(`🔧 Tool '${name}' called with project context: ${projectId || 'none'}`);
        
        const result = await this.toolProvider.callTool(name, args, projectId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // List Prompts Handler
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const prompts = await this.promptProvider.listPrompts();
      return { prompts };
    });

    // Get Prompt Handler
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const prompt = await this.promptProvider.getPrompt(name, args);
        return {
          messages: prompt.messages,
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Failed to get prompt: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Detect project context for a given session/request
   */
  private async detectProjectContext(sessionId?: string): Promise<string | null> {
    // For SSE connections, check if we have stored project context
    if (sessionId && this.connectionProjects.has(sessionId)) {
      const storedProjectId = this.connectionProjects.get(sessionId);
      if (storedProjectId) {
        return storedProjectId;
      }
    }

    // Fall back to workspace detection
    try {
      const detectedProjectId = await this.workspaceManager.detectCurrentProject();
      
      // Store the detected project for this session if we have one
      if (sessionId && detectedProjectId) {
        this.connectionProjects.set(sessionId, detectedProjectId);
      }
      
      return detectedProjectId;
    } catch (error) {
      console.warn('Failed to detect project context:', error);
      return null;
    }
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("🎯 Baton MCP Server started with STDIO transport");
  }

  /**
   * Create SSE transport for HTTP-based MCP communication
   */
  async createSSETransport(req: IncomingMessage, res: ServerResponse, endpoint: string = '/mcp/messages'): Promise<SSEServerTransport> {
    // Extract project context from query parameters
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const projectId = url.searchParams.get('project');
    const projectName = url.searchParams.get('projectName');
    
    console.log(`🔌 Creating SSE transport${projectId ? ` (project: ${projectId})` : ''}${projectName ? ` (projectName: ${projectName})` : ''}`);
    
    // Create SSE transport first to get session ID
    const transport = new SSEServerTransport(endpoint, res, {
      allowedOrigins: ['http://localhost:3001', 'http://localhost:5173'],
      allowedHosts: ['localhost', '127.0.0.1'],
      enableDnsRebindingProtection: true
    });

    // Store project context for this session if provided
    try {
      let resolvedProjectId: string | null = null;
      
      if (projectId) {
        resolvedProjectId = projectId;
        console.log(`🎯 Direct project context set: ${projectId}`);
      } else if (projectName) {
        // Look up project by name
        console.log(`🔍 Looking up project: ${projectName}`);
        const project = await this.prisma.project.findFirst({
          where: { name: { contains: projectName, mode: 'insensitive' } }
        });
        if (project) {
          resolvedProjectId = project.id;
          console.log(`📁 Found project: ${project.name} (${project.id})`);
        } else {
          console.log(`⚠️ Project not found: ${projectName}`);
        }
      }
      
      // Store project context for this session
      if (resolvedProjectId) {
        this.connectionProjects.set(transport.sessionId, resolvedProjectId);
      }
    } catch (error) {
      console.error('❌ Error setting project context:', error);
      // Continue without project context
    }


    // Store transport by session ID
    this.sseTransports.set(transport.sessionId, transport);
    console.log(`✅ SSE transport created with session ID: ${transport.sessionId}`);

    // Set up cleanup on transport close
    const originalClose = transport.close.bind(transport);
    transport.close = async () => {
      console.log(`🔌 Cleaning up SSE transport: ${transport.sessionId}`);
      this.sseTransports.delete(transport.sessionId);
      this.connectionProjects.delete(transport.sessionId);
      await originalClose();
    };

    // Connect to MCP server (this automatically calls transport.start())
    await this.server.connect(transport);
    console.log(`✅ SSE transport connected to MCP server`);

    return transport;
  }

  /**
   * Handle SSE POST messages by routing to appropriate transport
   */
  async handleSSEMessage(req: IncomingMessage, res: ServerResponse, sessionId: string, body?: unknown): Promise<void> {
    const transport = this.sseTransports.get(sessionId);
    if (!transport) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: `No SSE transport found for session: ${sessionId}`
        },
        id: null
      }));
      return;
    }

    try {
      await transport.handlePostMessage(req, res, body);
    } catch (error) {
      console.error(`❌ Error handling SSE message for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        }));
      }
    }
  }

  /**
   * Get all active SSE session IDs
   */
  getActiveSSESessions(): string[] {
    return Array.from(this.sseTransports.keys());
  }

  async startWebSocket(port: number = 3002): Promise<void> {
    const wss = new WebSocketServer({ port });
    
    wss.on('connection', async (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const projectId = url.searchParams.get('project');
      const projectName = url.searchParams.get('projectName');
      
      console.log(`🔌 New MCP client connected via WebSocket${projectId ? ` (project: ${projectId})` : ''}${projectName ? ` (projectName: ${projectName})` : ''}`);
      
      // Store project context for this WebSocket connection if provided
      let sessionId: string | undefined;
      try {
        let resolvedProjectId: string | null = null;
        
        if (projectId) {
          resolvedProjectId = projectId;
          console.log(`🎯 Direct project context set: ${projectId}`);
        } else if (projectName) {
          // Look up project by name
          console.log(`🔍 Looking up project: ${projectName}`);
          const project = await this.prisma.project.findFirst({
            where: { name: { contains: projectName, mode: 'insensitive' } }
          });
          if (project) {
            resolvedProjectId = project.id;
            console.log(`📁 Found project: ${project.name} (${project.id})`);
          } else {
            console.log(`⚠️ Project not found: ${projectName}`);
          }
        }
        
        // We'll store project context after we have a session ID from the transport
        if (resolvedProjectId) {
          // Generate a temporary session ID for WebSocket (will be replaced if transport provides one)
          sessionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          this.connectionProjects.set(sessionId, resolvedProjectId);
        }
        console.log('✅ Project context setup completed');
      } catch (error) {
        console.error('❌ Error setting project context:', error);
        // Continue without project context
      }
      
      const transport = {
        async start() {},
        async send(message: any) {
          if (ws.readyState === ws.OPEN) {
            console.log(`📤 Sending WebSocket message: ${message.method || message.id || 'response'}`);
            ws.send(JSON.stringify(message));
          } else {
            console.log(`⚠️ Cannot send message - WebSocket not open (state: ${ws.readyState})`);
          }
        },
        async close() {
          ws.close();
        },
        onmessage: (() => {}) as ((message: any) => void),
        onclose: (() => {}) as (() => void),
        onerror: (() => {}) as ((error: Error) => void),
      };

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`📨 Received WebSocket message: ${message.method || message.id}`);
          if (transport.onmessage) {
            transport.onmessage(message);
          }
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error);
        }
      });

      ws.on('close', () => {
        console.log("📤 MCP client disconnected");
        if (transport.onclose) {
          transport.onclose();
        }
      });

      ws.on('error', (error) => {
        console.error("WebSocket error:", error);
        if (transport.onerror) {
          transport.onerror(error);
        }
      });

      try {
        console.log('🔗 Attempting to connect MCP transport...');
        await this.server.connect(transport);
        console.log('✅ MCP transport connected successfully');
      } catch (error) {
        console.error("❌ Failed to connect MCP server:", error);
        ws.close();
      }
    });

    console.log(`🎯 Baton MCP Server started on WebSocket port ${port}`);
    return new Promise((resolve) => {
      wss.on('listening', () => resolve());
    });
  }


  /**
   * Associate current workspace with a project
   */
  async associateWorkspaceProject(projectId: string): Promise<boolean> {
    try {
      const success = await this.workspaceManager.associateWorkspaceWithProject(projectId);
      // Note: No longer setting global project state - each request detects its own context
      return success;
    } catch (error) {
      console.error("Failed to associate workspace project:", error);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    await this.server.close();
    await this.prisma.$disconnect();
    console.log("🛑 Baton MCP Server shut down");
  }
}

// Export for use in other modules
export * from '../resources/index';
export * from '../tools/index';
export * from '../prompts/index';