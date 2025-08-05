#!/usr/bin/env node

/**
 * Claude Code Hook Script for Chat Context Enhancement
 * 
 * This script enhances chat prompts with Baton project context,
 * recent tasks, todos, and other relevant information to provide
 * more contextual responses.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const BATON_API_URL = process.env.BATON_API_URL || 'http://localhost:3001';
const DEBUG = process.env.DEBUG_CHAT_CONTEXT === 'true';

/**
 * Log debug information
 */
function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[CHAT-CONTEXT] ${message}`);
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Find project context
 */
function findProjectContext(startDir = process.cwd()) {
  let currentDir = startDir;
  
  while (currentDir !== path.dirname(currentDir)) {
    const projectFile = path.join(currentDir, '.baton-project');
    if (fs.existsSync(projectFile)) {
      try {
        const content = fs.readFileSync(projectFile, 'utf8');
        const config = JSON.parse(content);
        return config;
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
 * Fetch recent tasks from Baton
 */
async function fetchRecentTasks(projectId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/tasks?projectId=${projectId}&limit=5`, BATON_API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
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
          try {
            const response = JSON.parse(data);
            resolve(response.data || []);
          } catch (error) {
            resolve([]);
          }
        } else {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.end();
  });
}

/**
 * Fetch recent Claude todos
 */
async function fetchRecentTodos(projectId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/claude-todos?projectId=${projectId}&limit=5`, BATON_API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
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
          try {
            const response = JSON.parse(data);
            resolve(response.todos || []);
          } catch (error) {
            resolve([]);
          }
        } else {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.end();
  });
}

/**
 * Detect chat intent from user prompt
 */
function detectChatIntent(prompt) {
  const promptLower = prompt.toLowerCase();
  
  // Task-related intents
  if (promptLower.match(/\b(task|todo|work|project)\b/)) {
    return 'task_related';
  }
  
  // Code-related intents
  if (promptLower.match(/\b(code|implement|build|create|fix|debug)\b/)) {
    return 'code_related';
  }
  
  // Planning intents
  if (promptLower.match(/\b(plan|organize|structure|design)\b/)) {
    return 'planning';
  }
  
  // Help/documentation intents
  if (promptLower.match(/\b(help|how|what|explain|documentation)\b/)) {
    return 'help';
  }
  
  return 'general';
}

/**
 * Build context enhancement based on intent
 */
async function buildContextEnhancement(intent, projectContext, originalPrompt) {
  if (!projectContext || !projectContext.projectId) {
    return '';
  }
  
  const projectId = projectContext.projectId;
  const projectName = projectContext.projectName || 'Current Project';
  
  let contextParts = [];
  
  // Add project context
  contextParts.push(`📁 Project: ${projectName}`);
  
  // Add relevant context based on intent
  switch (intent) {
    case 'task_related':
    case 'planning':
      // Fetch recent tasks and todos
      const [tasks, todos] = await Promise.all([
        fetchRecentTasks(projectId),
        fetchRecentTodos(projectId)
      ]);
      
      if (tasks.length > 0) {
        contextParts.push('\n📋 Recent Tasks:');
        tasks.forEach(task => {
          contextParts.push(`- [${task.status}] ${task.title}`);
        });
      }
      
      if (todos.length > 0) {
        contextParts.push('\n✅ Active Todos:');
        todos.forEach(todo => {
          contextParts.push(`- [${todo.status}] ${todo.content}`);
        });
      }
      break;
      
    case 'code_related':
      // Add code-specific context
      contextParts.push('💻 Code Context: Working in Baton project with MCP integration');
      contextParts.push('🔧 Available tools: TodoWrite, PlanWrite, task management');
      break;
      
    case 'help':
      // Add helpful context
      contextParts.push('ℹ️ Baton Features: Task management, Claude integration, real-time sync');
      break;
  }
  
  // Build final context
  if (contextParts.length > 1) {
    return `[Context: ${contextParts.join('\n')}]\n\n`;
  }
  
  return '';
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Read user prompt from stdin
    let userPrompt = '';
    
    if (process.stdin.isTTY) {
      // No stdin, return empty
      console.log('');
      process.exit(0);
    }
    
    for await (const chunk of process.stdin) {
      userPrompt += chunk;
    }
    
    userPrompt = userPrompt.trim();
    
    if (!userPrompt) {
      console.log('');
      process.exit(0);
    }
    
    debugLog('Original prompt:', userPrompt);
    
    // Find project context
    const projectContext = findProjectContext();
    
    // Detect intent
    const intent = detectChatIntent(userPrompt);
    debugLog('Detected intent:', intent);
    
    // Build context enhancement
    const contextEnhancement = await buildContextEnhancement(
      intent,
      projectContext,
      userPrompt
    );
    
    // Return enhanced prompt
    const enhancedPrompt = contextEnhancement + userPrompt;
    
    if (contextEnhancement) {
      debugLog('Context added:', contextEnhancement);
    }
    
    console.log(enhancedPrompt);
    
  } catch (error) {
    debugLog('Error in context enhancement:', error);
    // On error, return original prompt
    console.log(process.argv[2] || '');
    process.exit(0);
  }
}

// Error handling - return original prompt if hook fails
process.on('uncaughtException', (error) => {
  debugLog('Uncaught exception:', error);
  console.log(process.argv[2] || '');
  process.exit(0);
});

// Execute main function
if (require.main === module) {
  main();
}

module.exports = {
  detectChatIntent,
  buildContextEnhancement,
  findProjectContext
};