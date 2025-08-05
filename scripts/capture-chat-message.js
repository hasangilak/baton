#!/usr/bin/env node

/**
 * Claude Code Hook Script for Capturing Chat Messages
 * 
 * This script captures chat messages sent through Claude Code and syncs them
 * with Baton's chat system, enabling seamless integration between Claude Code
 * and the Baton chat interface.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const BATON_API_URL = process.env.BATON_API_URL || 'http://localhost:3001';
const DEBUG = process.env.DEBUG_CHAT_CAPTURE === 'true';

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[CHAT-CAPTURE] ${message}`);
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
 * Get or create conversation for the current session
 */
async function getOrCreateConversation(projectId, sessionId) {
  // For now, we'll create a new conversation for each session
  // In the future, we could track sessions and reuse conversations
  
  const url = new URL('/api/chat/conversations', BATON_API_URL);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const postData = JSON.stringify({
    projectId,
    title: `Claude Code Session - ${new Date().toLocaleString()}`
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

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(data);
            resolve(response.conversation);
          } catch (error) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          reject(new Error(`API request failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Send chat message to Baton API
 */
async function sendChatMessage(conversationId, content, role = 'user') {
  const url = new URL('/api/chat/messages', BATON_API_URL);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const postData = JSON.stringify({
    conversationId,
    content,
    // We'll handle role mapping in the backend if needed
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

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          reject(new Error(`API request failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Extract message content from hook data
 */
function extractMessageContent(hookData) {
  // This will depend on the actual hook data structure
  // For now, we'll handle basic cases
  
  if (hookData.type === 'user_message' && hookData.content) {
    return {
      content: hookData.content,
      role: 'user'
    };
  }
  
  if (hookData.type === 'assistant_message' && hookData.content) {
    return {
      content: hookData.content,
      role: 'assistant'
    };
  }
  
  // Handle tool use cases
  if (hookData.tool_name === 'ChatMessage' && hookData.tool_input) {
    return {
      content: hookData.tool_input.message || hookData.tool_input.content,
      role: hookData.tool_input.role || 'user'
    };
  }
  
  return null;
}

/**
 * Store conversation ID for session
 */
function storeConversationId(sessionId, conversationId) {
  const cacheDir = path.join(process.cwd(), '.claude');
  const cacheFile = path.join(cacheDir, 'chat-sessions.json');
  
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    let sessions = {};
    if (fs.existsSync(cacheFile)) {
      sessions = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    
    sessions[sessionId] = {
      conversationId,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(cacheFile, JSON.stringify(sessions, null, 2));
  } catch (error) {
    debugLog('Error storing conversation ID:', error);
  }
}

/**
 * Retrieve conversation ID for session
 */
function getConversationId(sessionId) {
  const cacheFile = path.join(process.cwd(), '.claude', 'chat-sessions.json');
  
  try {
    if (fs.existsSync(cacheFile)) {
      const sessions = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return sessions[sessionId]?.conversationId;
    }
  } catch (error) {
    debugLog('Error retrieving conversation ID:', error);
  }
  
  return null;
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
    
    // Extract message content
    const messageData = extractMessageContent(hookData);
    if (!messageData) {
      debugLog('No message content found in hook data');
      process.exit(0);
    }
    
    // Find project context
    const projectContext = findProjectContext(hookData.cwd || process.cwd());
    if (!projectContext || !projectContext.projectId) {
      debugLog('No project context found, cannot capture chat message');
      console.error('Warning: No .baton-project file found. Chat message not captured.');
      process.exit(0);
    }
    
    const projectId = projectContext.projectId;
    const sessionId = hookData.session_id || 'default';
    
    // Get or create conversation
    let conversationId = getConversationId(sessionId);
    
    if (!conversationId) {
      debugLog('Creating new conversation for session:', sessionId);
      const conversation = await getOrCreateConversation(projectId, sessionId);
      conversationId = conversation.id;
      storeConversationId(sessionId, conversationId);
    }
    
    // Send message to Baton
    debugLog(`Sending message to conversation ${conversationId}`);
    await sendChatMessage(conversationId, messageData.content, messageData.role);
    
    debugLog('Chat message captured successfully');
    
    // Log success message for user visibility
    console.log(`💬 Chat message synced to Baton conversation`);
    
  } catch (error) {
    debugLog('Error in chat capture:', error);
    console.error('Chat capture failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  extractMessageContent,
  findProjectContext,
  getOrCreateConversation,
  sendChatMessage
};