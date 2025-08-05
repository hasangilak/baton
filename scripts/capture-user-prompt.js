#!/usr/bin/env node

/**
 * Claude Code Hook Script for Capturing User Prompts
 * 
 * This script is triggered by Claude Code's UserPromptSubmit hook to capture 
 * user prompts and logs them to the prompts directory for analysis and debugging.
 * 
 * Inspired by: https://gist.github.com/ljw1004/34b58090c16ee6d5e6f13fce07463a31
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DEBUG = process.env.DEBUG_PROMPT_CAPTURE === 'true';
const PROMPTS_DIR = path.join(__dirname, 'prompts');

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(message, data = null) {
  if (DEBUG) {
    console.error(`[PROMPT-CAPTURE] ${message}`);
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Ensure the prompts directory exists
 */
function ensurePromptsDirectory() {
  if (!fs.existsSync(PROMPTS_DIR)) {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    debugLog('Created prompts directory:', PROMPTS_DIR);
  }
}

/**
 * Generate a unique filename for the prompt log
 */
function generatePromptFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomId = Math.random().toString(36).substring(2, 8);
  return `prompt-${timestamp}-${randomId}.json`;
}

/**
 * Save prompt data to file
 */
function savePromptToFile(promptData, filename) {
  const filePath = path.join(PROMPTS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(promptData, null, 2), 'utf8');
  debugLog('Prompt saved to:', filePath);
  return filePath;
}

/**
 * Extract and analyze prompt content
 */
function analyzePrompt(content) {
  const analysis = {
    length: content.length,
    wordCount: content.split(/\s+/).length,
    hasCodeBlock: /```/.test(content),
    hasQuestion: /\?/.test(content),
    hasCommand: /^(run|execute|create|build|test|fix)/i.test(content.trim()),
    containsMentions: /@\w+/.test(content),
    isMultiline: content.includes('\n'),
    urgencyKeywords: ['urgent', 'asap', 'quickly', 'immediately'].filter(word => 
      content.toLowerCase().includes(word)
    ),
    taskKeywords: ['todo', 'task', 'implement', 'add', 'fix', 'update', 'create'].filter(word =>
      content.toLowerCase().includes(word)
    )
  };
  
  return analysis;
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
 * Extract user prompt from hook input data
 */
function extractUserPrompt(hookData) {
  // For UserPromptSubmit hooks, the user prompt is typically in:
  // - hookData.user_input (direct user input)
  // - hookData.prompt (processed prompt)
  // - hookData.content (alternative content field)
  
  return hookData.user_input || 
         hookData.prompt || 
         hookData.content || 
         hookData.message ||
         null;
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Ensure prompts directory exists
    ensurePromptsDirectory();
    
    // Read hook data from stdin
    let inputData = '';
    
    if (process.stdin.isTTY) {
      debugLog('No stdin data available, exiting');
      process.exit(0);
    }
    
    // Read all input from stdin
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }
    
    if (!inputData.trim()) {
      debugLog('No input data received');
      process.exit(0);
    }
    
    const hookData = JSON.parse(inputData);
    debugLog('Received hook data:', hookData);
    
    // Verify this is a UserPromptSubmit hook or extract user prompt
    const userPrompt = extractUserPrompt(hookData);
    if (!userPrompt || typeof userPrompt !== 'string') {
      debugLog('No user prompt found in hook data');
      
      // If we can't find a user prompt, still log the raw hook data for debugging
      const filename = generatePromptFilename();
      const promptData = {
        timestamp: new Date().toISOString(),
        hookEventName: hookData.hook_event_name || 'Unknown',
        sessionId: hookData.session_id || 'unknown',
        cwd: hookData.cwd || process.cwd(),
        transcriptPath: hookData.transcript_path,
        rawHookData: hookData,
        error: 'No user prompt found in hook data'
      };
      
      savePromptToFile(promptData, filename);
      console.log(`⚠️  Hook data captured but no user prompt found: ${filename}`);
      process.exit(0);
    }
    
    // Find project context
    const projectId = findProjectContext(hookData.cwd || process.cwd());
    
    // Analyze the prompt
    const analysis = analyzePrompt(userPrompt);
    
    // Generate filename and prepare prompt data
    const filename = generatePromptFilename();
    const promptData = {
      timestamp: new Date().toISOString(),
      hookEventName: hookData.hook_event_name || 'UserPromptSubmit',
      sessionId: hookData.session_id || 'unknown',
      projectId: projectId,
      userPrompt: userPrompt,
      analysis: analysis,
      metadata: {
        cwd: hookData.cwd || process.cwd(),
        transcriptPath: hookData.transcript_path,
        capturedBy: 'capture-user-prompt.js'
      },
      rawHookData: DEBUG ? hookData : null // Only include raw data in debug mode
    };
    
    // Save to file
    const filePath = savePromptToFile(promptData, filename);
    
    debugLog('Prompt capture completed successfully');
    
    // Log success message for user visibility
    const summary = `${analysis.wordCount} words, ${analysis.taskKeywords.length} task keywords`;
    console.log(`📝 User prompt captured: ${filename} (${summary})`);
    
    // If project context found, mention it
    if (projectId) {
      console.log(`🎯 Project context: ${projectId}`);
    }
    
  } catch (error) {
    debugLog('Error in prompt capture:', error);
    console.error('Prompt capture failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  extractUserPrompt,
  analyzePrompt,
  findProjectContext,
  savePromptToFile
};