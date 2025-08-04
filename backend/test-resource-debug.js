const WebSocket = require('ws');

// Simple test to debug resource reading issue
async function testResourceReading() {
  console.log('🔍 Starting focused resource reading test...');
  
  // Start WebSocket connection
  const ws = new WebSocket('ws://localhost:3003');
  let messageId = 0;
  
  ws.on('open', async () => {
    console.log('✅ WebSocket connected');
    
    // Initialize MCP
    const initMessage = {
      jsonrpc: '2.0',
      id: ++messageId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { resources: { subscribe: true }, tools: {}, prompts: {} },
        clientInfo: { name: 'debug-client', version: '1.0.0' }
      }
    };
    
    ws.send(JSON.stringify(initMessage));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', JSON.stringify(message, null, 2));
    
    if (message.id === 1 && message.result) {
      // Initialization successful, now test resource reading
      console.log('🚀 Initialization successful, testing resource read...');
      
      const resourceMessage = {
        jsonrpc: '2.0',
        id: ++messageId,
        method: 'resources/read',
        params: { uri: 'baton://projects' }
      };
      
      ws.send(JSON.stringify(resourceMessage));
    } else if (message.id === 2) {
      // Resource read result
      if (message.error) {
        console.log('❌ Resource read failed:', message.error);
      } else {
        console.log('✅ Resource read successful!');
      }
      ws.close();
    }
  });
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
  });
}

// Give the server time to start
setTimeout(testResourceReading, 1000);