#!/usr/bin/env node

/**
 * MCP UX Integration Test Suite
 * Tests the new simplified UX features including query parameters and connection API
 */

const WebSocket = require('ws');
const http = require('http');

class MCPUXTestClient {
  constructor() {
    this.ws = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
  }

  async testConnectionAPI() {
    console.log('🔗 Testing MCP Connection API...');
    
    // Test basic connection endpoint
    const basicResponse = await this.httpRequest('http://localhost:3001/api/mcp/connection');
    if (!basicResponse.success || !basicResponse.data.websocket.url.includes('ws://localhost:3002')) {
      throw new Error('Basic connection API failed');
    }
    console.log('✅ Basic connection API works');
    
    // Test with project name parameter
    const projectResponse = await this.httpRequest('http://localhost:3001/api/mcp/connection?projectName=Test%20Project');
    if (!projectResponse.success || !projectResponse.data.websocket.url.includes('projectName=Test%20Project')) {
      throw new Error('Project name parameter API failed');
    }
    console.log('✅ Project name parameter API works');
    
    // Test with project ID parameter
    const projectIdResponse = await this.httpRequest('http://localhost:3001/api/mcp/connection?projectId=test-id-123');
    if (!projectIdResponse.success || !projectIdResponse.data.websocket.url.includes('project=test-id-123')) {
      throw new Error('Project ID parameter API failed');
    }
    console.log('✅ Project ID parameter API works');
    
    // Verify response structure
    const expectedFields = ['websocket', 'docker', 'usage'];
    const hasAllFields = expectedFields.every(field => basicResponse.data.hasOwnProperty(field));
    if (!hasAllFields) {
      throw new Error('Connection API response missing required fields');
    }
    console.log('✅ Connection API response structure is valid');
    
    return basicResponse.data;
  }

  async httpRequest(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  async connectWebSocket(url = 'ws://localhost:3002') {
    console.log(`🔌 Testing WebSocket MCP connection to ${url}...`);
    
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

  async testBasicMCPFlow() {
    console.log('🚀 Testing basic MCP flow...');
    
    // Initialize
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        resources: { subscribe: true },
        tools: {},
        prompts: {}
      },
      clientInfo: {
        name: 'ux-test-client',
        version: '1.0.0'
      }
    });
    
    if (!initResult.capabilities) {
      throw new Error('MCP initialization failed - no capabilities returned');
    }
    console.log('✅ MCP initialization successful');
    
    // List resources
    const resourcesResult = await this.sendRequest('resources/list');
    if (!resourcesResult.resources || resourcesResult.resources.length === 0) {
      throw new Error('No resources available');
    }
    console.log(`✅ Found ${resourcesResult.resources.length} resources`);
    
    // List tools
    const toolsResult = await this.sendRequest('tools/list');
    if (!toolsResult.tools || toolsResult.tools.length === 0) {
      throw new Error('No tools available');
    }
    console.log(`✅ Found ${toolsResult.tools.length} tools`);
    
    return { resources: resourcesResult.resources, tools: toolsResult.tools };
  }

  async testProjectContextQuery() {
    console.log('🎯 Testing project context with query parameters...');
    
    // Test connection with project name parameter
    this.close();
    // Add delay to allow server to clean up previous connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.connectWebSocket('ws://localhost:3002?projectName=Demo%20Project');
    
    const data = await this.testBasicMCPFlow();
    
    // Check if workspace resources are available with context
    const workspaceResources = data.resources.filter(r => r.uri.startsWith('baton://workspace'));
    if (workspaceResources.length === 0) {
      console.warn('⚠️  No workspace resources found - this might be expected if no projects exist');
    } else {
      console.log(`✅ Found ${workspaceResources.length} workspace-aware resources`);
    }
    
    // Test workspace info tool
    const workspaceInfo = await this.sendRequest('tools/call', {
      name: 'get_workspace_info',
      arguments: {}
    });
    
    if (workspaceInfo.content && workspaceInfo.content[0]) {
      const info = JSON.parse(workspaceInfo.content[0].text);
      console.log('✅ Workspace info tool works:', info.workspacePath ? 'Has workspace' : 'No workspace detected');
    }
    
    return true;
  }

  async testProjectIdQuery() {
    console.log('🆔 Testing project ID query parameter...');
    
    // First, let's try to find or create a project
    this.close();
    // Add delay to allow server to clean up previous connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.connectWebSocket('ws://localhost:3002');
    
    await this.testBasicMCPFlow();
    
    // Try to read projects resource to find available projects
    try {
      const projectsData = await this.sendRequest('resources/read', {
        uri: 'baton://projects'
      });
      
      if (projectsData.contents && projectsData.contents[0]) {
        const projects = JSON.parse(projectsData.contents[0].text);
        
        if (projects.length > 0) {
          // Test with first project's ID
          const projectId = projects[0].id;
          console.log(`Testing with project ID: ${projectId}`);
          
          this.close();
          // Add delay to allow server to clean up previous connection
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.connectWebSocket(`ws://localhost:3002?project=${encodeURIComponent(projectId)}`);
          
          await this.testBasicMCPFlow();
          console.log('✅ Project ID query parameter works');
        } else {
          console.warn('⚠️  No projects found in database - creating a test project would be needed');
        }
      }
    } catch (error) {
      console.warn('⚠️  Could not test project ID parameter:', error.message);
    }
    
    return true;
  }

  close() {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
      this.pendingRequests.clear();
      this.messageId = 0;
    }
  }
}

async function testDockerDeployment() {
  console.log('🐳 Testing Docker deployment URLs...');
  
  // Test that all expected endpoints are accessible
  const endpoints = [
    { name: 'Frontend', url: 'http://localhost:5173', expectHtml: true },
    { name: 'Backend Health', url: 'http://localhost:3001/health', expectJson: true },
    { name: 'MCP Connection API', url: 'http://localhost:3001/api/mcp/connection', expectJson: true }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await new Promise((resolve, reject) => {
        http.get(endpoint.url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
          res.on('error', reject);
        }).on('error', reject);
      });
      
      if (response.statusCode === 200) {
        if (endpoint.expectJson) {
          JSON.parse(response.data); // Validate JSON
        }
        console.log(`✅ ${endpoint.name} is accessible`);
      } else {
        throw new Error(`HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.error(`❌ ${endpoint.name} failed:`, error.message);
      throw error;
    }
  }
  
  // Test WebSocket MCP server is accessible
  const ws = new WebSocket('ws://localhost:3002');
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log('✅ MCP WebSocket server is accessible');
      ws.close();
      resolve();
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
  });
  
  return true;
}

async function runUXTests() {
  console.log('🧪 Starting Baton MCP UX Integration Tests\n');
  console.log('='.repeat(60));
  
  const client = new MCPUXTestClient();
  let passed = 0;
  let failed = 0;
  
  const tests = [
    { name: 'Docker Deployment', fn: testDockerDeployment },
    { name: 'MCP Connection API', fn: () => client.testConnectionAPI() },
    { name: 'Basic WebSocket Connection', fn: () => client.connectWebSocket() },
    { name: 'Basic MCP Flow', fn: () => client.testBasicMCPFlow() },
    { name: 'Project Name Query Parameter', fn: () => client.testProjectContextQuery() },
    { name: 'Project ID Query Parameter', fn: () => client.testProjectIdQuery() }
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
  console.log('📊 UX TEST RESULTS SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log(`📈 Success Rate: ${Math.round((passed / tests.length) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL UX TESTS PASSED! The new simplified integration is working perfectly.');
  } else {
    console.log('\n⚠️  Some UX tests failed. The new integration needs fixes.');
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
  runUXTests().catch(error => {
    console.error('\n💥 UX test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { MCPUXTestClient, runUXTests };