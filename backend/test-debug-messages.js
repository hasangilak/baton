#!/usr/bin/env node

/**
 * Debug Message Exchange Test
 * Shows exactly what messages are being sent and received
 */

const WebSocket = require('ws');

async function testDetailedMessageExchange() {
  console.log('🔍 Testing detailed message exchange with project query...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3002?projectName=Demo%20Project');
    let messageId = 0;
    let receivedMessages = [];
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected with project query');
      
      // Send initialize message
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
      
      console.log('📤 SENDING INITIALIZE:', JSON.stringify(initMessage, null, 2));
      ws.send(JSON.stringify(initMessage));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      receivedMessages.push(message);
      
      console.log('📨 RECEIVED MESSAGE:', JSON.stringify(message, null, 2));
      
      if (message.id === 1) {
        if (message.result) {
          console.log('✅ Initialize response received');
          resolve({ success: true, messages: receivedMessages });
        } else if (message.error) {
          console.log('❌ Initialize error received');
          reject(new Error(message.error.message || 'Initialize failed'));
        }
        ws.close();
      }
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`📤 WebSocket closed: ${code} ${reason}`);
      if (receivedMessages.length === 0) {
        reject(new Error('WebSocket closed without receiving any messages'));
      }
    });
    
    // Extended timeout for debugging
    setTimeout(() => {
      console.log('⏰ Test timeout - received messages:', receivedMessages.length);
      ws.close();
      if (receivedMessages.length === 0) {
        reject(new Error('No messages received within timeout'));
      } else {
        resolve({ success: false, messages: receivedMessages });
      }
    }, 15000);
  });
}

async function testBasicConnection() {
  console.log('🔍 Testing basic connection (no project query)...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3002');
    let messageId = 0;
    
    ws.on('open', () => {
      console.log('✅ Basic WebSocket connected');
      
      // Send initialize message
      const initMessage = {
        jsonrpc: '2.0',
        id: ++messageId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { resources: { subscribe: true }, tools: {}, prompts: {} },
          clientInfo: { name: 'debug-basic-client', version: '1.0.0' }
        }
      };
      
      console.log('📤 SENDING BASIC INITIALIZE');
      ws.send(JSON.stringify(initMessage));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 BASIC RECEIVED:', message.result ? 'SUCCESS' : 'ERROR');
      
      if (message.id === 1) {
        ws.close();
        resolve(message.result ? true : false);
      }
    });
    
    ws.on('error', (error) => {
      reject(error);
    });
    
    setTimeout(() => {
      ws.close();
      reject(new Error('Basic connection timeout'));
    }, 10000);
  });
}

async function runDebugTests() {
  console.log('🧪 Starting Debug Message Tests\n');
  
  try {
    console.log('='.repeat(60));
    console.log('1️⃣ TESTING BASIC CONNECTION');
    console.log('='.repeat(60));
    
    const basicResult = await testBasicConnection();
    console.log(basicResult ? '✅ Basic connection works' : '❌ Basic connection failed');
    
    console.log('\n' + '='.repeat(60));
    console.log('2️⃣ TESTING PROJECT QUERY CONNECTION');
    console.log('='.repeat(60));
    
    const projectResult = await testDetailedMessageExchange();
    
    if (projectResult.success) {
      console.log('✅ Project query connection works!');
    } else {
      console.log('❌ Project query connection has issues');
      console.log('Messages received:', projectResult.messages.length);
    }
    
  } catch (error) {
    console.error('💥 Debug test failed:', error.message);
  }
}

runDebugTests();