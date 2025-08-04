import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

export class BatonMCPServer {
  private server: Server;
  private prisma: PrismaClient;
  private resourceProvider: BatonResourceProvider;
  private toolProvider: BatonToolProvider;
  private promptProvider: BatonPromptProvider;
  private workspaceManager: BatonWorkspaceManager;
  private currentProjectId: string | null = null;

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
    this.resourceProvider = new BatonResourceProvider(this.prisma, () => this.currentProjectId);
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
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      console.log('📜 Processing resources/list request...');
      try {
        const resources = await this.resourceProvider.listResources();
        console.log(`✅ Found ${resources.length} resources`);
        return { resources };
      } catch (error) {
        console.error('❌ Error in resources/list:', error);
        throw error;
      }
    });

    // Read Resource Handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      try {
        const content = await this.resourceProvider.readResource(uri);
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.toolProvider.callTool(name, args);
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

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("🎯 Baton MCP Server started with STDIO transport");
  }

  async startWebSocket(port: number = 3002): Promise<void> {
    // Detect workspace project after Prisma client is ready
    await this.detectWorkspaceProject();
    
    const wss = new WebSocketServer({ port });
    
    wss.on('connection', async (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const projectId = url.searchParams.get('project');
      const projectName = url.searchParams.get('projectName');
      
      console.log(`🔌 New MCP client connected via WebSocket${projectId ? ` (project: ${projectId})` : ''}${projectName ? ` (projectName: ${projectName})` : ''}`);
      
      // Set project context if provided (MUST complete before transport setup)
      try {
        if (projectId) {
          this.currentProjectId = projectId;
          this.workspaceManager?.setCurrentProject(projectId);
          console.log(`🎯 Direct project context set: ${projectId}`);
        } else if (projectName) {
          // Look up project by name
          console.log(`🔍 Looking up project: ${projectName}`);
          const project = await this.prisma.project.findFirst({
            where: { name: { contains: projectName, mode: 'insensitive' } }
          });
          if (project) {
            this.currentProjectId = project.id;
            this.workspaceManager?.setCurrentProject(project.id);
            console.log(`📁 Found project: ${project.name} (${project.id})`);
          } else {
            console.log(`⚠️ Project not found: ${projectName}`);
          }
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
   * Detect current workspace project and update context
   */
  private async detectWorkspaceProject(): Promise<void> {
    try {
      const projectId = await this.workspaceManager.detectCurrentProject();
      if (projectId) {
        this.currentProjectId = projectId;
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true }
        });
        console.log(`🎯 Detected workspace project: ${project?.name} (${projectId})`);
      } else {
        console.log("📁 No workspace project detected - using global context");
      }
    } catch (error) {
      console.warn("Failed to detect workspace project:", error);
    }
  }

  /**
   * Get current project context
   */
  getCurrentProject(): string | null {
    return this.currentProjectId;
  }

  /**
   * Associate current workspace with a project
   */
  async associateWorkspaceProject(projectId: string): Promise<boolean> {
    try {
      const success = await this.workspaceManager.associateWorkspaceWithProject(projectId);
      if (success) {
        this.currentProjectId = projectId;
        // Notify clients that resources have changed
        // TODO: Implement resource change notification
      }
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