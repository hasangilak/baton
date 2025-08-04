#!/usr/bin/env node

/**
 * Test with delay to allow server setup to complete
 */

const WebSocket = require('ws');

async function testWithProjectDelay() {
  console.log('🔍 Testing WebSocket with project query and delay...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3002?projectName=Demo%20Project');
    let messageId = 0;
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected with project query');
      
      // Wait 2 seconds to allow server project setup to complete
      setTimeout(() => {
        console.log('📤 Sending initialize after delay...');
        
        const initMessage = {
          jsonrpc: '2.0',
          id: ++messageId,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { resources: { subscribe: true }, tools: {}, prompts: {} },
            clientInfo: { name: 'delay-test-client', version: '1.0.0' }
          }
        };
        
        ws.send(JSON.stringify(initMessage));
      }, 2000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 RECEIVED RESPONSE:', JSON.stringify(message, null, 2));
      
      if (message.id === 1) {
        if (message.result) {
          console.log('✅ Initialize with project context successful!');
          
          // Test resources list to verify project context
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: ++messageId,
            method: 'resources/list'
          }));
        } else {
          console.log('❌ Initialize failed');
          ws.close();
          reject(new Error('Initialize failed'));
        }
      } else if (message.id === 2) {
        if (message.result) {
          const workspaceResources = message.result.resources.filter(r => r.uri.startsWith('baton://workspace'));
          console.log(`✅ Found ${workspaceResources.length} workspace resources (project context working!)`);
          ws.close();
          resolve(true);
        } else {
          console.log('❌ Resources list failed');
          ws.close();
          reject(new Error('Resources list failed'));
        }
      }
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`📤 WebSocket closed: ${code} ${reason}`);
    });
    
    // Extended timeout
    setTimeout(() => {
      ws.close();
      reject(new Error('Test timeout'));
    }, 20000);
  });
}

testWithProjectDelay().then(() => {
  console.log('🎉 SUCCESS: Project query parameter working!');
}).catch(error => {
  console.error('💥 FAILED:', error.message);
});