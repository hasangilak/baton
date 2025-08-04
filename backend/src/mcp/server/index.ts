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

export class BatonMCPServer {
  private server: Server;
  private prisma: PrismaClient;
  private resourceProvider: BatonResourceProvider;
  private toolProvider: BatonToolProvider;
  private promptProvider: BatonPromptProvider;

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
    this.resourceProvider = new BatonResourceProvider(this.prisma);
    this.toolProvider = new BatonToolProvider(this.prisma);
    this.promptProvider = new BatonPromptProvider(this.prisma);

    this.setupHandlers();
  }

  private setupHandlers() {
    // List Resources Handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await this.resourceProvider.listResources();
      return { resources };
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
      const tools = await this.toolProvider.listTools();
      return { tools };
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
    const wss = new WebSocketServer({ port });
    
    wss.on('connection', async (ws) => {
      console.log("🔌 New MCP client connected via WebSocket");
      
      const transport = {
        async start() {},
        async send(message: any) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
          }
        },
        async close() {
          ws.close();
        },
        onmessage: undefined as ((message: any) => void) | undefined,
        onclose: undefined as (() => void) | undefined,
        onerror: undefined as ((error: Error) => void) | undefined,
      };

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (transport.onmessage) {
            transport.onmessage(message);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
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
        await this.server.connect(transport);
      } catch (error) {
        console.error("Failed to connect MCP server:", error);
        ws.close();
      }
    });

    console.log(`🎯 Baton MCP Server started on WebSocket port ${port}`);
    return new Promise((resolve) => {
      wss.on('listening', () => resolve());
    });
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