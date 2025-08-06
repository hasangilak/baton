/**
 * Claude Code Interactive Prompt Decision Engine
 * 
 * Handles interactive prompts using multiple strategies:
 * 1. Allowlist/Denylist for common tools and actions
 * 2. User delegation via WebSocket
 * 3. LLM-based decision making for complex cases
 */

const path = require('path');
const backendPath = path.join(__dirname, '../backend');
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

// Use native fetch (Node.js 18+)

class PromptDecisionEngine {
  constructor(io) {
    this.io = io;
    this.prisma = new PrismaClient();
    this.strategies = [
      new AllowlistStrategy(),
      new DenylistStrategy(),
      new UserDelegationStrategy(io, this.prisma)
    ];
  }

  /**
   * Main entry point for handling interactive prompts
   */
  async handlePrompt(prompt, conversationId, sessionId) {
    console.log(`🤔 Processing interactive prompt: ${prompt.title || prompt.type}`);
    
    // Store prompt in database
    const storedPrompt = await this.storePrompt(prompt, conversationId, sessionId);
    
    // Try each strategy in order
    for (const strategy of this.strategies) {
      if (strategy.canHandle(prompt)) {
        console.log(`🔄 Trying strategy: ${strategy.constructor.name}`);
        
        const decision = await strategy.decide(prompt, storedPrompt);
        if (decision) {
          console.log(`✅ Decision made by ${strategy.constructor.name}: ${decision.action}`);
          return await this.executeDecision(storedPrompt, decision);
        }
      }
    }
    
    console.log(`❌ No strategy could handle prompt: ${prompt.type}`);
    return null;
  }

  /**
   * Store the prompt in the database
   */
  async storePrompt(prompt, conversationId, sessionId) {
    try {
      return await this.prisma.interactivePrompt.create({
        data: {
          conversationId,
          sessionId,
          type: prompt.type,
          title: prompt.title,
          message: prompt.message,
          options: prompt.options,
          context: prompt.context,
          timeoutAt: new Date(Date.now() + 30000) // 30 second timeout
        }
      });
    } catch (error) {
      console.error('❌ Error storing prompt:', error);
      throw error;
    }
  }

  /**
   * Execute a decision and update the database
   */
  async executeDecision(storedPrompt, decision) {
    try {
      // For timeout decisions, keep the prompt pending for user interaction
      if (decision.action === 'timeout') {
        console.log(`⏰ Prompt ${storedPrompt.id} timed out but staying pending for user interaction`);
        return {
          promptId: storedPrompt.id,
          action: decision.action,
          selectedOption: decision.selectedOption,
          response: decision.response,
          automatic: false,
          pending: true // Flag to indicate it's still pending
        };
      }

      // For actual decisions, update the database
      await this.prisma.interactivePrompt.update({
        where: { id: storedPrompt.id },
        data: {
          status: decision.automatic ? 'auto_handled' : 'answered',
          selectedOption: decision.selectedOption,
          autoHandler: decision.handler,
          respondedAt: new Date()
        }
      });

      console.log(`📝 Prompt ${storedPrompt.id} resolved: ${decision.action} (${decision.reason})`);
      
      return {
        promptId: storedPrompt.id,
        action: decision.action,
        selectedOption: decision.selectedOption,
        response: decision.response,
        automatic: decision.automatic
      };
      
    } catch (error) {
      console.error('❌ Error executing decision:', error);
      throw error;
    }
  }

  /**
   * Get pending prompts for a conversation
   */
  async getPendingPrompts(conversationId) {
    return await this.prisma.interactivePrompt.findMany({
      where: {
        conversationId,
        status: 'pending',
        timeoutAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Handle timeout for pending prompts
   */
  async handleTimeouts() {
    const expiredPrompts = await this.prisma.interactivePrompt.findMany({
      where: {
        status: 'pending',
        timeoutAt: {
          lte: new Date()
        }
      }
    });

    for (const prompt of expiredPrompts) {
      console.log(`⏰ Prompt ${prompt.id} timed out, using default option`);
      
      const options = prompt.options;
      const defaultOption = options.find(o => o.isRecommended) 
        || options.find(o => o.isDefault) 
        || options[0];

      await this.prisma.interactivePrompt.update({
        where: { id: prompt.id },
        data: {
          status: 'timeout',
          selectedOption: defaultOption?.id,
          autoHandler: 'timeout',
          respondedAt: new Date()
        }
      });
    }
  }
}

/**
 * Strategy for handling common tools and actions automatically
 */
class AllowlistStrategy {
  constructor() {
    // Based on screenshot and common Claude Code tools
    this.toolAllowlist = {
      'exa - web_search_exa': { action: 'yes_dont_ask', confidence: 0.95 },
      'mcp__exa__web_search_exa': { action: 'yes_dont_ask', confidence: 0.95 },
      'web_search_exa': { action: 'yes_dont_ask', confidence: 0.95 },
      'Read': { action: 'yes_dont_ask', confidence: 0.9 },
      'Glob': { action: 'yes_dont_ask', confidence: 0.9 },
      'LS': { action: 'yes_dont_ask', confidence: 0.9 },
      'Grep': { action: 'yes_dont_ask', confidence: 0.9 },
      'Write': { action: 'yes', confidence: 0.8 }, // More cautious with writes
      'Edit': { action: 'yes', confidence: 0.8 },
      'MultiEdit': { action: 'yes', confidence: 0.8 },
      'Bash': { action: 'conditional', confidence: 0.7 }
    };
    
    this.commandAllowlist = [
      /^npm (install|run|start|build|test|lint)/i,
      /^git (status|add|commit|push|pull|diff|log)/i,
      /^ls|cat|grep|find|head|tail/i,
      /^node|python|go run/i,
      /^mkdir|touch/i,
      /^curl.*localhost/i
    ];

    this.commandDenylist = [
      /rm -rf.*\/(?!node_modules|dist|build|\.git)/i,
      /sudo/i,
      /chmod.*777/i,
      /kill.*-9/i,
      /dd.*if=/i,
      /format|fdisk/i
    ];
  }

  canHandle(prompt) {
    return prompt.type === 'tool_usage' || prompt.type === 'permission';
  }

  async decide(prompt) {
    if (prompt.type === 'tool_usage' && prompt.context?.toolName) {
      const toolName = prompt.context.toolName.trim();
      const toolConfig = this.toolAllowlist[toolName];
      
      if (toolConfig) {
        const selectedOption = this.mapActionToOption(toolConfig.action, prompt.options);
        
        return {
          action: toolConfig.action,
          selectedOption,
          confidence: toolConfig.confidence,
          handler: 'allowlist',
          reason: `Tool ${toolName} is pre-approved`,
          automatic: true,
          response: this.getResponseForAction(toolConfig.action)
        };
      }
    }

    // Handle bash commands
    if (prompt.context?.toolName === 'Bash' && prompt.context?.command) {
      const command = prompt.context.command;
      
      // Check denylist first (safety)
      if (this.commandDenylist.some(pattern => pattern.test(command))) {
        return {
          action: 'no_explain',
          selectedOption: this.mapActionToOption('no_explain', prompt.options),
          confidence: 0.95,
          handler: 'denylist',
          reason: `Command "${command}" is potentially dangerous`,
          automatic: true,
          response: 'This command could be dangerous and has been blocked automatically.'
        };
      }
      
      // Check allowlist
      if (this.commandAllowlist.some(pattern => pattern.test(command))) {
        return {
          action: 'yes',
          selectedOption: this.mapActionToOption('yes', prompt.options),
          confidence: 0.8,
          handler: 'allowlist',
          reason: `Command "${command}" is safe and pre-approved`,
          automatic: true,
          response: 'Command approved automatically.'
        };
      }
    }
    
    return null; // Cannot decide
  }

  mapActionToOption(action, options) {
    const mapping = {
      'yes': o => o.value === 'yes',
      'yes_dont_ask': o => o.value === 'yes_dont_ask' || o.isRecommended,
      'no_explain': o => o.value === 'no_explain' || o.label.toLowerCase().includes('no'),
      'no': o => o.value === 'no'
    };
    
    const finder = mapping[action] || (() => false);
    const option = options.find(finder) || options[0];
    return option?.id;
  }

  getResponseForAction(action) {
    const responses = {
      'yes': 'Proceeding with the action.',
      'yes_dont_ask': 'Proceeding with the action and remembering this choice.',
      'no': 'Action declined.',
      'no_explain': 'Action declined for safety reasons.'
    };
    
    return responses[action] || 'Action processed.';
  }
}

/**
 * Explicit denylist for dangerous operations
 */
class DenylistStrategy {
  constructor() {
    this.dangerousPatterns = [
      /delete.*production/i,
      /drop.*table/i,
      /truncate.*table/i,
      /rm -rf.*\/(?!node_modules|dist|build)/i,
      /sudo.*rm/i,
      /format.*disk/i
    ];
  }

  canHandle(prompt) {
    return true; // Can check any prompt for dangerous patterns
  }

  async decide(prompt) {
    const message = prompt.message + ' ' + (prompt.context?.fullMessage || '');
    
    if (this.dangerousPatterns.some(pattern => pattern.test(message))) {
      return {
        action: 'no_explain',
        selectedOption: this.mapActionToOption('no_explain', prompt.options),
        confidence: 0.99,
        handler: 'denylist',
        reason: 'Potentially dangerous operation detected',
        automatic: true,
        response: 'This operation has been blocked for safety reasons.'
      };
    }
    
    return null;
  }

  mapActionToOption(action, options) {
    return options.find(o => o.value === 'no_explain' || o.label.toLowerCase().includes('no'))?.id || options[0]?.id;
  }
}

/**
 * Strategy for delegating decisions to users via WebSocket
 */
class UserDelegationStrategy {
  constructor(io, prisma) {
    this.io = io;
    this.prisma = prisma;
    this.pendingResponses = new Map();
  }

  canHandle(prompt) {
    return true; // Can handle any prompt as fallback
  }

  async decide(prompt, storedPrompt) {
    console.log(`👤 Delegating prompt to user: ${storedPrompt.id}`);
    
    // Send prompt directly via WebSocket (like successful implementations do)
    try {
      this.io.emit('interactive_prompt', {
        promptId: storedPrompt.id,
        conversationId: storedPrompt.conversationId,
        type: prompt.type,
        title: prompt.title || 'Permission Request',
        message: prompt.message,
        options: prompt.options,
        context: prompt.context,
        sessionId: storedPrompt.sessionId,
        timeout: 30000
      });
      
      console.log(`📡 Prompt sent directly via WebSocket: ${storedPrompt.id}`);
    } catch (error) {
      console.error(`❌ Error sending prompt via WebSocket:`, error);
    }

    // Wait for user response with timeout (keeping prompt pending)
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(storedPrompt.id);
        // Don't resolve to null - let the prompt stay pending for user interaction
        console.log(`⏰ Prompt ${storedPrompt.id} timed out, but keeping it pending for manual interaction`);
        resolve({
          action: 'timeout',
          selectedOption: null,
          confidence: 0,
          handler: 'user_delegation_timeout',
          reason: 'Timed out waiting for user response, prompt remains available',
          automatic: false,
          response: 'Waiting for user response...'
        });
      }, 300000); // 5 minutes instead of 30 seconds

      this.pendingResponses.set(storedPrompt.id, { resolve, timeoutId });
    });
  }

  /**
   * Handle user response from WebSocket
   */
  async handleUserResponse(promptId, selectedOptionId) {
    const pending = this.pendingResponses.get(promptId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingResponses.delete(promptId);
      
      // Get the prompt from database to access session info
      const storedPrompt = await this.prisma.interactivePrompt.findUnique({
        where: { id: promptId }
      });
      
      if (storedPrompt && storedPrompt.sessionId) {
        console.log(`🔄 Attempting to continue Claude Code session ${storedPrompt.sessionId} with user response`);
        
        // Send the user's response to Claude Code via session continuation
        await this.continueClaudeSession(storedPrompt, selectedOptionId);
      }
      
      pending.resolve({
        action: 'user_selected',
        selectedOption: selectedOptionId,
        confidence: 1.0,
        handler: 'user_delegation',
        reason: 'User made the decision',
        automatic: false,
        response: 'User selection received.'
      });
    }
  }
  
  /**
   * Continue Claude Code session with user's response
   */
  async continueClaudeSession(storedPrompt, selectedOptionId) {
    try {
      // Map the selected option to the appropriate response
      const option = storedPrompt.options.find(o => o.id === selectedOptionId);
      let response = 'yes'; // Default
      
      if (option) {
        if (option.value === 'no' || option.label.toLowerCase().includes('no')) {
          response = 'no';
        } else if (option.value === 'yes_dont_ask' || option.label.toLowerCase().includes("don't ask")) {
          response = 'yes and don\'t ask again';
        }
      }
      
      console.log(`📤 Sending response "${response}" to Claude Code session ${storedPrompt.sessionId}`);
      
      // Notify the chat handler about the user response for session continuation
      // We'll use a simpler approach: emit to Socket.IO to trigger continuation
      try {
        await fetch('http://localhost:3001/api/chat/prompts/continue-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: storedPrompt.sessionId,
            response: response
          })
        });
        console.log(`✅ Session continuation request sent for ${storedPrompt.sessionId}`);
      } catch (error) {
        console.error('❌ Error sending session continuation request:', error);
      }
      
    } catch (error) {
      console.error('❌ Error continuing Claude Code session:', error);
    }
  }
}

module.exports = { PromptDecisionEngine, AllowlistStrategy, DenylistStrategy, UserDelegationStrategy };