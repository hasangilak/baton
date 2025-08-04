#!/usr/bin/env node

import dotenv from 'dotenv';
import { BatonMCPServer } from './mcp/server/index';

// Load environment variables
dotenv.config();

async function main() {
  const mcpServer = new BatonMCPServer();

  // Handle process signals for graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down MCP server gracefully...`);
    try {
      await mcpServer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  try {
    // Check if we should run in STDIO mode (default for MCP)
    const mode = process.env.MCP_TRANSPORT_MODE || 'stdio';

    if (mode === 'websocket') {
      const port = parseInt(process.env.MCP_SERVER_PORT || '3002');
      console.log(`🎯 Starting Baton MCP Server in WebSocket mode on port ${port}`);
      await mcpServer.startWebSocket(port);
      console.log(`✅ Baton MCP Server is running on ws://localhost:${port}`);
      
      // Keep the process alive
      process.stdin.resume();
    } else {
      console.log('🎯 Starting Baton MCP Server in STDIO mode');
      await mcpServer.startStdio();
      console.log('✅ Baton MCP Server is running with STDIO transport');
    }
  } catch (error) {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ MCP Server startup failed:', error);
    process.exit(1);
  });
}