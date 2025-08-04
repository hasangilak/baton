#!/usr/bin/env node

/**
 * Test script for Claude Code integration with Baton MCP server
 * This script tests the TodoRead, TodoWrite, and sync functionality
 */

const WebSocket = require('ws');

class ClaudeIntegrationTester {
  constructor() {
    this.ws = null;
    this.requestId = 1;
    this.responses = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to MCP server...');
      this.ws = new WebSocket('ws://localhost:3002');
      
      this.ws.on('open', () => {
        console.log('✅ Connected to MCP server');
        resolve();
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.id && this.responses.has(message.id)) {
            this.responses.get(message.id)(message);
            this.responses.delete(message.id);
          }
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      });
    });
  }

  async sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = this.requestId++;
      const message = {
        jsonrpc: '2.0',
        id: requestId,
        method,
        params
      };

      this.responses.set(requestId, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      this.ws.send(JSON.stringify(message));
      
      // Set timeout for request
      setTimeout(() => {
        if (this.responses.has(requestId)) {
          this.responses.delete(requestId);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 10000);
    });
  }

  async initialize() {
    console.log('🚀 Initializing MCP client...');
    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-integration-tester',
          version: '1.0.0'
        }
      });
      console.log('✅ MCP client initialized');
      return result;
    } catch (error) {
      console.error('❌ Failed to initialize:', error.message);
      throw error;
    }
  }

  async listTools() {
    console.log('🔧 Listing available tools...');
    try {
      const result = await this.sendRequest('tools/list');
      const toolNames = result.tools.map(t => t.name);
      console.log(`✅ Found ${result.tools.length} tools:`, toolNames);
      
      // Check for Claude Code integration tools
      const claudeTools = ['TodoRead', 'TodoWrite', 'sync_todos_to_tasks', 'sync_tasks_to_todos'];
      const foundClaudeTools = claudeTools.filter(tool => toolNames.includes(tool));
      console.log(`📋 Claude Code integration tools: ${foundClaudeTools.join(', ')}`);
      
      return result.tools;
    } catch (error) {
      console.error('❌ Failed to list tools:', error.message);
      throw error;
    }
  }

  async testTodoRead() {
    console.log('📖 Testing TodoRead...');
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'TodoRead',
        arguments: {}
      });
      
      const response = JSON.parse(result.content[0].text);
      console.log(`✅ TodoRead successful. Found ${response.todos?.length || 0} todos`);
      
      if (response.todos && response.todos.length > 0) {
        console.log('📋 Sample todos:', response.todos.slice(0, 2));
      }
      
      return response;
    } catch (error) {
      console.error('❌ TodoRead failed:', error.message);
      throw error;
    }
  }

  async testTodoWrite() {
    console.log('✍️ Testing TodoWrite...');
    
    const sampleTodos = [
      {
        id: 'test-todo-1',
        content: 'Test Claude Code integration with Baton',
        status: 'in_progress',
        priority: 'high'
      },
      {
        id: 'test-todo-2', 
        content: 'Verify bidirectional sync functionality',
        status: 'pending',
        priority: 'medium'
      }
    ];

    try {
      const result = await this.sendRequest('tools/call', {
        name: 'TodoWrite',
        arguments: { todos: sampleTodos }
      });
      
      const response = JSON.parse(result.content[0].text);
      console.log(`✅ TodoWrite successful. Processed ${response.count} todos`);
      
      return response;
    } catch (error) {
      console.error('❌ TodoWrite failed:', error.message);
      throw error;
    }
  }

  async testSyncTodosToTasks() {
    console.log('🔄 Testing sync_todos_to_tasks...');
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'sync_todos_to_tasks',
        arguments: {}
      });
      
      const response = JSON.parse(result.content[0].text);
      console.log(`✅ Sync todos to tasks: ${response.syncedCount} items synced`);
      
      return response;
    } catch (error) {
      console.error('❌ Sync todos to tasks failed:', error.message);
      throw error;
    }
  }

  async runTests() {
    try {
      await this.connect();
      await this.initialize();
      
      console.log('\n=== Running Claude Code Integration Tests ===\n');
      
      // Test 1: List tools
      await this.listTools();
      
      // Test 2: TodoRead (should be empty initially)
      await this.testTodoRead();
      
      // Test 3: TodoWrite (create sample todos)
      await this.testTodoWrite();
      
      // Test 4: TodoRead again (should show our todos)
      await this.testTodoRead();
      
      // Test 5: Sync todos to tasks
      await this.testSyncTodosToTasks();
      
      console.log('\n🎉 All tests completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }
}

// Run the tests
const tester = new ClaudeIntegrationTester();
tester.runTests().catch(console.error);