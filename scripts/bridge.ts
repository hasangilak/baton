#!/usr/bin/env bun

/**
 * Claude Code Bridge Service - Modular WebSocket Version
 * 
 * A WebSocket-based service that executes Claude Code SDK requests
 * using a modular architecture with separated concerns.
 * 
 * Usage:
 * bun run bridge.ts [--port 8080] [--backend ws://localhost:3001]
 */

import { ModularClaudeCodeBridge } from './bridge-modules/index';

// Legacy type definitions for backward compatibility
export interface BridgeRequest {
  message: string;
  requestId: string;
  projectId: string;
  sessionId?: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: any;
  projectName?: string;
}

export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted";
  data?: any;
  error?: string;
  requestId: string;
  timestamp: number;
}

// Legacy class wrapper for backward compatibility
class ClaudeCodeBridge {
  private bridge: ModularClaudeCodeBridge;

  constructor(port: number = 8080, backendUrl: string = 'ws://localhost:3001') {
    this.bridge = new ModularClaudeCodeBridge(port, backendUrl);
  }

  /**
   * Start the bridge service
   */
  async start(): Promise<void> {
    return this.bridge.start();
  }

  /**
   * Stop the bridge service
   */
  async stop(): Promise<void> {
    return this.bridge.stop();
  }

  /**
   * Get bridge status
   */
  getStatus() {
    return this.bridge.getStatus();
  }
}

// Main bridge will be created in main() function

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
    console.log('🚀 Starting Modular Claude Code Bridge...');
    console.log(`📊 Status: ${JSON.stringify(bridgeInstance.getStatus(), null, 2)}`);
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