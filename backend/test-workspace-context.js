const WebSocket = require('ws');

async function testWorkspaceContext() {
  console.log('🧪 Testing MCP Server with Workspace Context');
  console.log('===============================================');
  
  const ws = new WebSocket('ws://localhost:3006');
  let messageId = 0;

  ws.on('open', () => {
    console.log('✅ Connected to MCP server');
    
    // Initialize
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: ++messageId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { resources: { subscribe: true }, tools: {}, prompts: {} },
        clientInfo: { name: 'workspace-test-client', version: '1.0.0' }
      }
    }));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    if (message.id === 1 && message.result) {
      console.log('🚀 Initialized. Testing resource listing...');
      
      // List resources
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: ++messageId,
        method: 'resources/list'
      }));
      
    } else if (message.id === 2 && message.result) {
      console.log('📋 Resources found:', message.result.resources.length);
      
      // Look for workspace resources
      const workspaceResources = message.result.resources.filter(r => r.uri.startsWith('baton://workspace'));
      console.log('🏠 Workspace-specific resources:', workspaceResources.length);
      
      workspaceResources.forEach(resource => {
        console.log(`  - ${resource.name}: ${resource.uri}`);
      });
      
      if (workspaceResources.length > 0) {
        // Test reading workspace current project
        console.log('\\n🔍 Testing workspace resource reading...');
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: ++messageId,
          method: 'resources/read',
          params: { uri: 'baton://workspace/current' }
        }));
      }
      
    } else if (message.id === 3) {
      if (message.result) {
        console.log('✅ Workspace resource read successful!');
        const content = JSON.parse(message.result.contents[0].text);
        console.log('📋 Current project:', content.name);
        console.log('📊 Task count:', content.tasks?.length || 'N/A');
        
        // Test workspace info tool
        console.log('\\n🔧 Testing workspace info tool...');
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: ++messageId,
          method: 'tools/call',
          params: {
            name: 'get_workspace_info',
            arguments: {}
          }
        }));
      } else {
        console.log('❌ Workspace resource read failed:', message.error);
      }
      
    } else if (message.id === 4) {
      if (message.result) {
        console.log('✅ Workspace info tool successful!');
        const result = JSON.parse(message.result.content[0].text);
        console.log('🏠 Has project:', result.hasProject);
        console.log('📁 Current project:', result.currentProject?.name);
        console.log('📍 Workspace path:', result.workspacePath);
      } else {
        console.log('❌ Workspace info tool failed:', message.error);
      }
      
      ws.close();
    }
  });

  ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('\\n🎯 Test completed!');
  });
}

// Give server time to start
setTimeout(testWorkspaceContext, 2000);