#!/usr/bin/env node

/**
 * MCP Server Validation Test Suite
 * Tests our Baton MCP server implementation for real-world compatibility
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');

class MCPTestClient {
  constructor() {
    this.ws = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
  }

  async connectWebSocket(url = 'ws://localhost:3002') {
    console.log('🔌 Testing WebSocket MCP connection...');
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        console.log('✅ WebSocket connected successfully');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket connection failed:', error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('📤 WebSocket connection closed');
      });
    });
  }

  handleMessage(message) {
    console.log('📨 Received:', JSON.stringify(message, null, 2));
    
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  }

  async sendRequest(method, params = {}) {
    const id = ++this.messageId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    console.log('📤 Sending:', JSON.stringify(message, null, 2));

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  async testInitialization() {
    console.log('\n🚀 Testing MCP Initialization...');
    
    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true },
          tools: {},
          prompts: {}
        },
        clientInfo: {
          name: 'baton-test-client',
          version: '1.0.0'
        }
      });
      
      console.log('✅ MCP Initialization successful');
      console.log('Server capabilities:', JSON.stringify(result.capabilities, null, 2));
      return result;
    } catch (error) {
      console.error('❌ MCP Initialization failed:', error.message);
      throw error;
    }
  }

  async testResourceListing() {
    console.log('\n📋 Testing Resource Listing...');
    
    try {
      const result = await this.sendRequest('resources/list');
      console.log('✅ Resource listing successful');
      console.log(`Found ${result.resources?.length || 0} resources`);
      result.resources?.forEach(resource => {
        console.log(`  - ${resource.name}: ${resource.uri}`);
      });
      return result;
    } catch (error) {
      console.error('❌ Resource listing failed:', error.message);
      throw error;
    }
  }

  async testResourceReading() {
    console.log('\n📖 Testing Resource Reading...');
    
    try {
      const result = await this.sendRequest('resources/read', {
        uri: 'baton://projects'
      });
      console.log('✅ Resource reading successful');
      console.log(`Content length: ${JSON.stringify(result.contents).length} chars`);
      return result;
    } catch (error) {
      console.error('❌ Resource reading failed:', error.message);
      throw error;
    }
  }

  async testToolListing() {
    console.log('\n🔧 Testing Tool Listing...');
    
    try {
      const result = await this.sendRequest('tools/list');
      console.log('✅ Tool listing successful');
      console.log(`Found ${result.tools?.length || 0} tools`);
      result.tools?.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      return result;
    } catch (error) {
      console.error('❌ Tool listing failed:', error.message);
      throw error;
    }
  }

  async testToolExecution() {
    console.log('\n⚙️ Testing Tool Execution...');
    
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'get_project_analytics',
        arguments: {
          projectId: 'demo-project-1'
        }
      });
      console.log('✅ Tool execution successful');
      console.log('Tool result:', JSON.stringify(result.content, null, 2));
      return result;
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
      throw error;
    }
  }

  async testPromptListing() {
    console.log('\n💬 Testing Prompt Listing...');
    
    try {
      const result = await this.sendRequest('prompts/list');
      console.log('✅ Prompt listing successful');
      console.log(`Found ${result.prompts?.length || 0} prompts`);
      result.prompts?.forEach(prompt => {
        console.log(`  - ${prompt.name}: ${prompt.description}`);
      });
      return result;
    } catch (error) {
      console.error('❌ Prompt listing failed:', error.message);
      throw error;
    }
  }

  async testPromptExecution() {
    console.log('\n🎯 Testing Prompt Execution...');
    
    try {
      const result = await this.sendRequest('prompts/get', {
        name: 'create_project_plan',
        arguments: {
          projectName: 'Test Project',
          description: 'A test project for MCP validation'
        }
      });
      console.log('✅ Prompt execution successful');
      console.log(`Generated ${result.messages?.length || 0} messages`);
      return result;
    } catch (error) {
      console.error('❌ Prompt execution failed:', error.message);
      throw error;
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function testSTDIOTransport() {
  console.log('\n📡 Testing STDIO Transport...');
  
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('node', ['dist/mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MCP_TRANSPORT_MODE: 'stdio' }
    });

    let output = '';
    
    mcpProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      console.error('MCP Server stderr:', data.toString());
    });

    // Send initialize message
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { resources: {}, tools: {}, prompts: {} },
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    };

    mcpProcess.stdin.write(JSON.stringify(initMessage) + '\n');

    setTimeout(() => {
      mcpProcess.kill();
      if (output.includes('capabilities')) {
        console.log('✅ STDIO transport working');
        resolve(true);
      } else {
        console.error('❌ STDIO transport failed - no proper response');
        reject(new Error('STDIO transport test failed'));
      }
    }, 3000);
  });
}

async function runAllTests() {
  console.log('🧪 Starting Baton MCP Server Validation Tests\n');
  
  const client = new MCPTestClient();
  let passed = 0;
  let failed = 0;
  
  const tests = [
    { name: 'WebSocket Connection', fn: () => client.connectWebSocket() },
    { name: 'MCP Initialization', fn: () => client.testInitialization() },
    { name: 'Resource Listing', fn: () => client.testResourceListing() },
    { name: 'Resource Reading', fn: () => client.testResourceReading() },
    { name: 'Tool Listing', fn: () => client.testToolListing() },
    { name: 'Tool Execution', fn: () => client.testToolExecution() },
    { name: 'Prompt Listing', fn: () => client.testPromptListing() },
    { name: 'Prompt Execution', fn: () => client.testPromptExecution() },
    { name: 'STDIO Transport', fn: testSTDIOTransport }
  ];

  for (const test of tests) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🧪 Running: ${test.name}`);
      console.log(`${'='.repeat(50)}`);
      
      await test.fn();
      console.log(`✅ ${test.name} PASSED`);
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name} FAILED:`, error.message);
      failed++;
    }
  }

  client.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST RESULTS SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log(`📈 Success Rate: ${Math.round((passed / tests.length) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! MCP server is ready for Claude Code integration.');
  } else {
    console.log('\n⚠️  Some tests failed. MCP server needs fixes before Claude Code integration.');
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Test interrupted by user');
  process.exit(0);
});

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('\n💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { MCPTestClient, runAllTests };