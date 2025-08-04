#!/usr/bin/env node

/**
 * Claude Code Hook Script for Capturing ExitPlanMode
 * 
 * This script is triggered by Claude Code's PostToolUse hook when ExitPlanMode is called.
 * It extracts the plan content and sends it to Baton's API for storage.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const BATON_API_URL = process.env.BATON_API_URL || 'http://localhost:3001';
const DEBUG = process.env.DEBUG_PLAN_CAPTURE === 'true';

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[PLAN-CAPTURE] ${message}`);
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
 * Send plan data to Baton API
 */
function sendPlanToBaton(planData) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/plans/capture', BATON_API_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(planData);
    
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
          debugLog('Plan successfully sent to Baton API');
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
 * Extract plan content from ExitPlanMode tool input
 */
function extractPlanContent(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }
  
  // The plan content should be in toolInput.plan
  return toolInput.plan || null;
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
    
    // Verify this is an ExitPlanMode tool use
    if (hookData.tool_name !== 'ExitPlanMode') {
      debugLog(`Ignoring non-ExitPlanMode tool: ${hookData.tool_name}`);
      process.exit(0);
    }
    
    // Extract plan content
    const planContent = extractPlanContent(hookData.tool_input);
    if (!planContent) {
      debugLog('No plan content found in tool input');
      process.exit(0);
    }
    
    // Find project context
    const projectId = findProjectContext(hookData.cwd);
    if (!projectId) {
      debugLog('No project context found, cannot store plan');
      console.error('Warning: No .baton-project file found. Plan not captured.');
      process.exit(0);
    }
    
    // Prepare plan data for API
    const planData = {
      projectId: projectId,
      title: `Plan captured on ${new Date().toISOString()}`,
      content: planContent,
      status: 'accepted',
      sessionId: hookData.session_id,
      capturedAt: new Date().toISOString(),
      metadata: {
        cwd: hookData.cwd,
        transcriptPath: hookData.transcript_path,
        hookEventName: hookData.hook_event_name
      }
    };
    
    // Send to Baton API
    await sendPlanToBaton(planData);
    
    debugLog('Plan capture completed successfully');
    
  } catch (error) {
    debugLog('Error in plan capture:', error);
    console.error('Plan capture failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  extractPlanContent,
  findProjectContext,
  sendPlanToBaton
};