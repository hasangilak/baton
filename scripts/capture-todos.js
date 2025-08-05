#!/usr/bin/env node

/**
 * Claude Code Hook Script for Capturing TodoWrite
 * 
 * This script is triggered by Claude Code's PostToolUse hook when TodoWrite is called.
 * It extracts the todo data and syncs it with Baton's database via MCP tools.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const BATON_API_URL = process.env.BATON_API_URL || 'http://localhost:3001';
const DEBUG = process.env.DEBUG_TODO_CAPTURE === 'true';

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[TODO-CAPTURE] ${message}`);
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Find the .baton-project file to get project context
 */
function findProjectContext(startDir = process.cwd()) {
  let currentDir = startDir;
  
  while (currentDir !== path.dirname(currentDir)) {
    const projectFile = path.join(currentDir, '.baton-project');
    if (fs.existsSync(projectFile)) {
      try {
        const content = fs.readFileSync(projectFile, 'utf8');
        const config = JSON.parse(content);
        return config.projectId;
      } catch (error) {
        debugLog('Error reading .baton-project file:', error);
        return null;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

/**
 * Call Baton MCP TodoWrite tool via Claude Code
 */
function callBatonMCPTodoWrite(todos, projectId) {
  return new Promise((resolve, reject) => {
    const toolCallPayload = {
      tool: 'mcp__baton__TodoWrite',
      arguments: {
        todos: todos,
        projectId: projectId
      }
    };

    debugLog('Calling Baton MCP TodoWrite tool:', toolCallPayload);

    // Call the Claude todos API endpoint
    const url = new URL('/api/claude/todos', BATON_API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify({
      projectId: projectId,
      todos: todos
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Claude-Code-Hook/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          debugLog('Todos successfully synced to Baton');
          resolve({ success: true, data: data });
        } else {
          debugLog(`API request failed with status ${res.statusCode}:`, data);
          reject(new Error(`API request failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      debugLog('Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Extract todos from TodoWrite tool input
 */
function extractTodos(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }
  
  // The todos should be in toolInput.todos
  return toolInput.todos || null;
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Read hook data from stdin
    let inputData = '';
    
    if (process.stdin.isTTY) {
      debugLog('No stdin data available, exiting');
      process.exit(0);
    }
    
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }
    
    if (!inputData.trim()) {
      debugLog('No input data received');
      process.exit(0);
    }
    
    const hookData = JSON.parse(inputData);
    debugLog('Received hook data:', hookData);
    
    // Verify this is a TodoWrite tool use
    if (hookData.tool_name !== 'TodoWrite') {
      debugLog(`Ignoring non-TodoWrite tool: ${hookData.tool_name}`);
      process.exit(0);
    }
    
    // Extract todos
    const todos = extractTodos(hookData.tool_input);
    if (!todos || !Array.isArray(todos) || todos.length === 0) {
      debugLog('No todos found in tool input');
      process.exit(0);
    }
    
    // Find project context
    const projectId = findProjectContext(hookData.cwd || process.cwd());
    if (!projectId) {
      debugLog('No project context found, cannot sync todos');
      console.error('Warning: No .baton-project file found. Todos not captured.');
      process.exit(0);
    }
    
    debugLog(`Found ${todos.length} todos to sync for project ${projectId}`);
    
    // Call Baton MCP TodoWrite tool to sync the todos
    await callBatonMCPTodoWrite(todos, projectId);
    
    debugLog('Todo capture and sync completed successfully');
    
    // Log success message for user visibility
    console.log(`✅ Synced ${todos.length} todos to Baton project`);
    
  } catch (error) {
    debugLog('Error in todo capture:', error);
    console.error('Todo capture failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  extractTodos,
  findProjectContext,
  callBatonMCPTodoWrite
};