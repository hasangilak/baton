#!/usr/bin/env node

/**
 * Simplified UX Test - Focuses on testing the new UX features without rapid connection switching
 */

const WebSocket = require('ws');
const http = require('http');

async function httpRequest(url) {
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

async function testWebSocketBasic() {
  console.log('🔌 Testing basic WebSocket connection...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3002');
    let messageId = 0;
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      
      // Send initialize message
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: ++messageId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { resources: { subscribe: true }, tools: {}, prompts: {} },
          clientInfo: { name: 'simple-test-client', version: '1.0.0' }
        }
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.id === 1 && message.result) {
        console.log('✅ MCP initialization successful');
        
        // Test resource listing
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: ++messageId,
          method: 'resources/list'
        }));
      } else if (message.id === 2 && message.result) {
        console.log(`✅ Found ${message.result.resources.length} resources`);
        ws.close();
        resolve(true);
      }
    });
    
    ws.on('error', reject);
    
    // Timeout after 10 seconds
    setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket test timeout'));
    }, 10000);
  });
}

async function testWebSocketWithProjectQuery() {
  console.log('🎯 Testing WebSocket with project query parameter...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3002?projectName=Demo%20Project');
    let messageId = 0;
    
    ws.on('open', () => {
      console.log('✅ WebSocket with project query connected');
      
      // Wait for server to complete project setup (async database lookup)
      setTimeout(() => {
        console.log('📫 Sending initialize after server setup...');
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: ++messageId,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { resources: { subscribe: true }, tools: {}, prompts: {} },
            clientInfo: { name: 'project-test-client', version: '1.0.0' }
          }
        }));
      }, 2000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.id === 1 && message.result) {
        console.log('✅ MCP initialization with project context successful');
        ws.close();
        resolve(true);
      }
    });
    
    ws.on('error', reject);
    
    // Timeout after 15 seconds (to account for 2s delay + server setup)
    setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket project query test timeout'));
    }, 15000);
  });
}

async function runSimpleTests() {
  console.log('🧪 Starting Simple UX Tests\n');
  console.log('='.repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  const tests = [
    {
      name: 'Connection API Endpoint',
      fn: async () => {
        console.log('🔗 Testing connection API...');
        const response = await httpRequest('http://localhost:3001/api/mcp/connection');
        if (!response.success || !response.data.websocket.url.includes('ws://localhost:3002')) {
          throw new Error('Connection API failed');
        }
        console.log('✅ Connection API works');
        
        // Test with project parameter
        const projectResponse = await httpRequest('http://localhost:3001/api/mcp/connection?projectName=Test%20Project');
        if (!projectResponse.success || !projectResponse.data.websocket.url.includes('projectName=Test%20Project')) {
          throw new Error('Project parameter API failed');
        }
        console.log('✅ Project parameter API works');
        return true;
      }
    },
    {
      name: 'Basic WebSocket MCP',
      fn: testWebSocketBasic
    },
    {
      name: 'Project Query Parameter',
      fn: testWebSocketWithProjectQuery
    }
  ];
  
  for (const test of tests) {
    try {
      console.log(`\n${'='.repeat(30)}`);
      console.log(`🧪 Running: ${test.name}`);
      console.log(`${'='.repeat(30)}`);
      
      await test.fn();
      console.log(`✅ ${test.name} PASSED`);
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name} FAILED:`, error.message);
      failed++;
    }
    
    // Add delay between tests to avoid connection issues
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 SIMPLE UX TEST RESULTS');
  console.log(`${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log(`📈 Success Rate: ${Math.round((passed / tests.length) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL SIMPLE UX TESTS PASSED! The new integration features are working.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the implementation.');
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
  runSimpleTests().catch(error => {
    console.error('\n💥 Simple test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { runSimpleTests };