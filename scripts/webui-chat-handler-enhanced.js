#!/usr/bin/env node

/**
 * Enhanced WebUI Chat Handler with Comprehensive Logging System
 * Version 2.1.0
 * 
 * This version integrates the enhanced permission system from ultimate.ts
 * with comprehensive logging, statistics tracking, and performance monitoring.
 * It maintains full compatibility with the WebUI streaming endpoints while
 * providing enterprise-grade monitoring and analysis capabilities.
 * 
 * ============================================================================
 * 🚀 COMPREHENSIVE FEATURES:
 * ============================================================================
 * 
 * 📊 LOGGING & MONITORING:
 * - Detailed message type tracking with frequency analysis
 * - Real-time performance metrics (response times, throughput)  
 * - Session management logging (creation, resume, storage)
 * - Tool execution details with risk analysis
 * - Cost tracking per session and cumulative
 * - Visual separators and formatted console output
 * - File-based logging with structured JSON details
 * - Auto-save/restore statistics across sessions
 * - Comprehensive statistics reporting
 * 
 * 🛡️ ENHANCED PERMISSIONS:
 * - Risk-based tool analysis (LOW/MEDIUM/HIGH/CRITICAL)
 * - Interactive frontend permission prompts
 * - Per-conversation permission tracking
 * - Database permission persistence
 * - Tool usage statistics and patterns
 * - Auto-allow for safe tools, interactive for dangerous ones
 * - Fallback console permissions when UI unavailable
 * 
 * 🔧 CLAUDE CODE INTEGRATION:
 * - AsyncIterables with canUseTool callback support
 * - Session resume and continuation
 * - Abort handling for long-running requests
 * - MCP server integration with security warnings
 * - WebSocket bridge for real-time communication
 * - Polling fallback for reliability
 * 
 * ============================================================================
 * 📁 FILES GENERATED:
 * ============================================================================
 * - webui-chat-handler.log: Detailed execution logs with timestamps
 * - webui-chat-stats.json: Persistent statistics (auto-saved)
 * 
 * ============================================================================
 * 🎯 STATISTICS TRACKED:
 * ============================================================================
 * - Request metrics: total, completed, failed, aborted
 * - Performance: avg/min/max response times, uptime
 * - Cost analysis: total cost, per-request averages, token usage
 * - Message types: frequency breakdown of Claude SDK message types
 * - Tool usage: detailed tool call statistics with risk levels
 * - Session events: creation, resume, storage, completion events
 * - Permission decisions: grant/deny patterns and risk analysis
 * 
 * ============================================================================
 * 🔍 USAGE:
 * ============================================================================
 * 
 * Start Handler:
 * node webui-chat-handler-enhanced.js
 * 
 * View Statistics:
 * node webui-chat-handler-enhanced.js --stats
 * 
 * Reset All Data:
 * node webui-chat-handler-enhanced.js --reset
 * 
 * Environment Variables:
 * - BACKEND_URL: Backend server URL (default: http://localhost:3001)
 * - POLLING_INTERVAL: Fallback polling interval (default: 2000ms)
 * 
 * ============================================================================
 * 🧪 MONITORING & DEBUGGING:
 * ============================================================================
 * 
 * The handler provides extensive logging for debugging and monitoring:
 * - All requests are tracked from start to completion
 * - Permission decisions are logged with full context
 * - Performance bottlenecks are identified with timing data
 * - Cost tracking helps optimize usage patterns
 * - Session management issues are clearly logged
 * - Tool execution details help troubleshoot permissions
 * 
 * Log files can be analyzed for patterns, performance issues,
 * and usage optimization. Statistics are automatically saved
 * and restored across handler restarts.
 */

const { query } = require("@anthropic-ai/claude-code");
const axios = require("axios");
const { io } = require("socket.io-client");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 2000;

// Token management constants
const COMPACTION_THRESHOLD = 150000;
const TOKEN_ESTIMATE_PER_MESSAGE = 500;

// Request tracking
const requestAbortControllers = new Map();

// Permission tracking
const pendingPermissionRequests = new Map();

// ============================================================================
// COMPREHENSIVE LOGGING SYSTEM
// ============================================================================

class EnhancedLogger {
  constructor() {
    this.startTime = Date.now();
    this.logFile = path.join(process.cwd(), 'webui-chat-handler.log');
    this.statsFile = path.join(process.cwd(), 'webui-chat-stats.json');
    
    // Statistics tracking
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      abortedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      totalDuration: 0,
      messageTypes: new Map(),
      toolUsage: new Map(),
      sessionEvents: new Map(),
      performanceMetrics: {
        averageResponseTime: 0,
        minResponseTime: Number.MAX_SAFE_INTEGER,
        maxResponseTime: 0
      }
    };
    
    this.loadStats();
    this.initializeLogFile();
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = fs.readFileSync(this.statsFile, 'utf8');
        const savedStats = JSON.parse(data);
        
        // Convert Maps from saved data
        this.stats.messageTypes = new Map(savedStats.messageTypes || []);
        this.stats.toolUsage = new Map(savedStats.toolUsage || []);
        this.stats.sessionEvents = new Map(savedStats.sessionEvents || []);
        
        // Copy other stats
        Object.keys(savedStats).forEach(key => {
          if (!['messageTypes', 'toolUsage', 'sessionEvents'].includes(key)) {
            this.stats[key] = savedStats[key];
          }
        });
        
        this.log('📊 STATS LOADED', `Restored statistics from ${this.statsFile}`);
      }
    } catch (error) {
      this.log('⚠️ STATS LOAD FAILED', `Could not load stats: ${error.message}`);
    }
  }

  saveStats() {
    try {
      const statsToSave = {
        ...this.stats,
        messageTypes: Array.from(this.stats.messageTypes.entries()),
        toolUsage: Array.from(this.stats.toolUsage.entries()),
        sessionEvents: Array.from(this.stats.sessionEvents.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.statsFile, JSON.stringify(statsToSave, null, 2));
    } catch (error) {
      this.log('⚠️ STATS SAVE FAILED', `Could not save stats: ${error.message}`);
    }
  }

  initializeLogFile() {
    const separator = '='.repeat(80);
    const timestamp = new Date().toISOString();
    const header = `\n${separator}\n🚀 ENHANCED WEBUI CHAT HANDLER LOG SESSION\n📅 Started: ${timestamp}\n${separator}\n`;
    
    try {
      fs.appendFileSync(this.logFile, header);
      this.log('📝 LOGGING INITIALIZED', `Log file: ${this.logFile}`);
    } catch (error) {
      console.error('❌ Failed to initialize log file:', error);
    }
  }

  log(type, message, details = null) {
    const timestamp = new Date().toISOString();
    const uptime = Math.round((Date.now() - this.startTime) / 1000);
    
    // Format console message
    const consoleMessage = `[${timestamp}] [${uptime}s] ${type}: ${message}`;
    console.log(consoleMessage);
    
    if (details) {
      if (typeof details === 'object') {
        console.log('   Details:', JSON.stringify(details, null, 2));
      } else {
        console.log('   Details:', details);
      }
    }

    // Format file message
    let fileMessage = `${consoleMessage}\n`;
    if (details) {
      if (typeof details === 'object') {
        fileMessage += `   Details: ${JSON.stringify(details, null, 2)}\n`;
      } else {
        fileMessage += `   Details: ${details}\n`;
      }
    }

    try {
      fs.appendFileSync(this.logFile, fileMessage);
    } catch (error) {
      console.error('❌ Failed to write to log file:', error);
    }
  }

  logSeparator(title, length = 60) {
    const separator = '='.repeat(length);
    const message = title ? `${separator}\n${title}\n${separator}` : separator;
    
    console.log(message);
    try {
      fs.appendFileSync(this.logFile, `${message}\n`);
    } catch (error) {
      console.error('❌ Failed to write separator to log file:', error);
    }
  }

  logMessageType(type, sessionId, additionalInfo = {}) {
    const count = this.stats.messageTypes.get(type) || 0;
    this.stats.messageTypes.set(type, count + 1);
    
    this.log('📨 MESSAGE TYPE', `Type: ${type} | Session: ${sessionId?.substring(0, 8)}...`, {
      totalCount: count + 1,
      ...additionalInfo
    });
    
    this.saveStats();
  }

  logToolExecution(toolName, riskLevel, parameters, result) {
    const count = this.stats.toolUsage.get(toolName) || 0;
    this.stats.toolUsage.set(toolName, count + 1);
    
    this.log('🔧 TOOL EXECUTION', `Tool: ${toolName} | Risk: ${riskLevel}`, {
      usage: count + 1,
      parametersCount: Object.keys(parameters).length,
      result: result?.behavior || 'unknown'
    });
    
    this.saveStats();
  }

  logSessionEvent(event, sessionId, details = {}) {
    const count = this.stats.sessionEvents.get(event) || 0;
    this.stats.sessionEvents.set(event, count + 1);
    
    this.log('🔗 SESSION EVENT', `Event: ${event} | Session: ${sessionId?.substring(0, 8)}...`, {
      eventCount: count + 1,
      ...details
    });
    
    this.saveStats();
  }

  logPerformanceMetrics(requestId, duration, cost, tokens, turns) {
    // Update performance stats
    this.stats.totalDuration += duration;
    this.stats.totalCost += cost || 0;
    this.stats.totalTokens += tokens || 0;
    
    if (duration < this.stats.performanceMetrics.minResponseTime) {
      this.stats.performanceMetrics.minResponseTime = duration;
    }
    if (duration > this.stats.performanceMetrics.maxResponseTime) {
      this.stats.performanceMetrics.maxResponseTime = duration;
    }
    
    const totalCompleted = this.stats.completedRequests;
    if (totalCompleted > 0) {
      this.stats.performanceMetrics.averageResponseTime = this.stats.totalDuration / totalCompleted;
    }

    this.log('⏱️ PERFORMANCE', `Request: ${requestId}`, {
      duration: `${Math.round(duration/1000)}s`,
      cost: `$${(cost || 0).toFixed(6)}`,
      tokens: tokens || 0,
      turns: turns || 0,
      averageResponseTime: `${Math.round(this.stats.performanceMetrics.averageResponseTime/1000)}s`
    });
    
    this.saveStats();
  }

  logCostTracking(cost, sessionId, operation = 'query') {
    this.stats.totalCost += cost || 0;
    
    this.log('💰 COST TRACKING', `Operation: ${operation} | Session: ${sessionId?.substring(0, 8)}...`, {
      operationCost: `$${(cost || 0).toFixed(6)}`,
      totalCost: `$${this.stats.totalCost.toFixed(6)}`,
      averageCostPerRequest: `$${(this.stats.totalCost / Math.max(this.stats.totalRequests, 1)).toFixed(6)}`
    });
    
    this.saveStats();
  }

  logRequestStart(requestId, conversationId, message) {
    this.stats.totalRequests++;
    const startTime = Date.now();
    
    this.logSeparator(`🚀 REQUEST START: ${requestId}`, 70);
    
    this.log('📤 REQUEST INITIATED', `ID: ${requestId} | Conv: ${conversationId}`, {
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      totalRequests: this.stats.totalRequests,
      timestamp: new Date().toISOString()
    });
    
    this.saveStats();
    return startTime;
  }

  logRequestEnd(requestId, startTime, result, error = null) {
    const duration = Date.now() - startTime;
    
    if (error) {
      this.stats.failedRequests++;
      this.log('❌ REQUEST FAILED', `ID: ${requestId} | Duration: ${Math.round(duration/1000)}s`, {
        error: error.message || String(error),
        totalFailed: this.stats.failedRequests
      });
    } else if (result === 'aborted') {
      this.stats.abortedRequests++;
      this.log('⏹️ REQUEST ABORTED', `ID: ${requestId} | Duration: ${Math.round(duration/1000)}s`, {
        totalAborted: this.stats.abortedRequests
      });
    } else {
      this.stats.completedRequests++;
      this.log('✅ REQUEST COMPLETED', `ID: ${requestId} | Duration: ${Math.round(duration/1000)}s`, {
        totalCompleted: this.stats.completedRequests
      });
    }
    
    this.logSeparator(`📊 REQUEST END: ${requestId}`, 70);
    this.saveStats();
    return duration;
  }

  showComprehensiveStats() {
    const uptime = Math.round((Date.now() - this.startTime) / 1000);
    
    this.logSeparator('📊 COMPREHENSIVE STATISTICS REPORT', 80);
    
    console.log('🎯 REQUEST STATISTICS:');
    console.log(`   Total Requests: ${this.stats.totalRequests}`);
    console.log(`   ✅ Completed: ${this.stats.completedRequests} (${((this.stats.completedRequests/Math.max(this.stats.totalRequests,1))*100).toFixed(1)}%)`);
    console.log(`   ❌ Failed: ${this.stats.failedRequests} (${((this.stats.failedRequests/Math.max(this.stats.totalRequests,1))*100).toFixed(1)}%)`);
    console.log(`   ⏹️ Aborted: ${this.stats.abortedRequests} (${((this.stats.abortedRequests/Math.max(this.stats.totalRequests,1))*100).toFixed(1)}%)`);
    
    console.log('\n⏱️ PERFORMANCE METRICS:');
    console.log(`   Average Response Time: ${Math.round(this.stats.performanceMetrics.averageResponseTime/1000)}s`);
    console.log(`   Fastest Response: ${Math.round(this.stats.performanceMetrics.minResponseTime/1000)}s`);
    console.log(`   Slowest Response: ${Math.round(this.stats.performanceMetrics.maxResponseTime/1000)}s`);
    console.log(`   Total Processing Time: ${Math.round(this.stats.totalDuration/1000)}s`);
    console.log(`   Handler Uptime: ${Math.round(uptime/60)}m ${uptime%60}s`);
    
    console.log('\n💰 COST ANALYSIS:');
    console.log(`   Total Cost: $${this.stats.totalCost.toFixed(6)}`);
    console.log(`   Average Cost per Request: $${(this.stats.totalCost / Math.max(this.stats.totalRequests, 1)).toFixed(6)}`);
    console.log(`   Total Tokens: ${this.stats.totalTokens.toLocaleString()}`);
    console.log(`   Average Tokens per Request: ${Math.round(this.stats.totalTokens / Math.max(this.stats.totalRequests, 1))}`);
    
    if (this.stats.messageTypes.size > 0) {
      console.log('\n📨 MESSAGE TYPE BREAKDOWN:');
      Array.from(this.stats.messageTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          console.log(`   ${type}: ${count} times`);
        });
    }
    
    if (this.stats.toolUsage.size > 0) {
      console.log('\n🔧 TOOL USAGE STATISTICS:');
      Array.from(this.stats.toolUsage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10) // Top 10 most used tools
        .forEach(([tool, count]) => {
          console.log(`   ${tool}: ${count} times`);
        });
        
      if (this.stats.toolUsage.size > 10) {
        console.log(`   ... and ${this.stats.toolUsage.size - 10} more tools`);
      }
    }
    
    if (this.stats.sessionEvents.size > 0) {
      console.log('\n🔗 SESSION EVENT SUMMARY:');
      Array.from(this.stats.sessionEvents.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([event, count]) => {
          console.log(`   ${event}: ${count} times`);
        });
    }
    
    console.log('\n📁 FILES:');
    console.log(`   Log File: ${this.logFile}`);
    console.log(`   Stats File: ${this.statsFile}`);
    
    this.logSeparator('', 80);
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      abortedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      totalDuration: 0,
      messageTypes: new Map(),
      toolUsage: new Map(),
      sessionEvents: new Map(),
      performanceMetrics: {
        averageResponseTime: 0,
        minResponseTime: Number.MAX_SAFE_INTEGER,
        maxResponseTime: 0
      }
    };
    
    try {
      if (fs.existsSync(this.statsFile)) {
        fs.unlinkSync(this.statsFile);
      }
    } catch (error) {
      console.error('❌ Failed to delete stats file:', error);
    }
    
    this.log('🔄 STATS RESET', 'All statistics have been reset');
  }
}

// Global logger instance
const logger = new EnhancedLogger();

// Tool risk analysis
class EnhancedPermissionSystem {
  constructor() {
    this.autoAllow = false;
    this.allowedTools = new Set();
    this.deniedTools = new Set();
    this.toolUsageStats = new Map();
    this.conversationPermissions = new Map(); // Per-conversation permissions
  }

  analyzeToolRisk(toolName, parameters) {
    // Update usage stats
    this.toolUsageStats.set(toolName, (this.toolUsageStats.get(toolName) || 0) + 1);

    const risks = {
      // Safe tools
      'Read': 'LOW',
      'LS': 'LOW', 
      'Glob': 'LOW',
      'Grep': 'LOW',
      'WebSearch': 'LOW',
      'TodoRead': 'LOW',
      
      // Medium risk
      'WebFetch': 'MEDIUM',
      'TodoWrite': 'MEDIUM',
      
      // High risk
      'Write': 'HIGH',
      'Edit': 'HIGH',
      'MultiEdit': 'HIGH',
      'NotebookEdit': 'HIGH',
      
      // Critical risk
      'Bash': 'CRITICAL'
    };

    // Check for MCP tools
    if (toolName.includes('mcp_') || toolName.includes('__')) {
      return 'HIGH'; // External MCP tools are high risk
    }

    // Check Bash commands for dangerous patterns
    if (toolName === 'Bash' && parameters.command) {
      const dangerousPatterns = /rm|sudo|chmod|chown|dd|mkfs|format|del/i;
      if (dangerousPatterns.test(parameters.command)) {
        return 'CRITICAL';
      }
    }

    return risks[toolName] || 'MEDIUM';
  }

  getRiskIcon(risk) {
    const icons = {
      'LOW': '🟢',
      'MEDIUM': '🟡', 
      'HIGH': '🟠',
      'CRITICAL': '🔴'
    };
    return icons[risk] || '⚪';
  }

  async getUserPermission(toolName, parameters, context) {
    const conversationId = context.conversationId;
    const riskLevel = this.analyzeToolRisk(toolName, parameters);
    
    // Log the permission request
    logger.logToolExecution(toolName, riskLevel, parameters, null);
    
    // Check if tool is in safe list
    const safeTools = ["Read", "LS", "Glob", "Grep", "WebFetch", "WebSearch", "TodoRead", "TodoWrite", "ExitPlanMode"];
    if (safeTools.includes(toolName)) {
      logger.log('✅ PERMISSION AUTO-GRANTED', `Safe tool: ${toolName}`, { riskLevel });
      const result = { behavior: 'allow', updatedInput: parameters };
      logger.logToolExecution(toolName, riskLevel, parameters, result);
      return result;
    }

    // Check conversation-specific permissions
    const convPerms = this.conversationPermissions.get(conversationId) || {};
    if (convPerms.autoAllow) {
      logger.log('🚀 PERMISSION AUTO-GRANTED', `Conversation auto-allow: ${toolName}`, { 
        conversationId, 
        riskLevel 
      });
      const result = { behavior: 'allow', updatedInput: parameters };
      logger.logToolExecution(toolName, riskLevel, parameters, result);
      return result;
    }

    if (convPerms.deniedTools?.has(toolName)) {
      logger.log('🚫 PERMISSION AUTO-DENIED', `Previously denied tool: ${toolName}`, { 
        conversationId, 
        riskLevel 
      });
      const result = { behavior: 'deny', message: 'Tool previously denied by user' };
      logger.logToolExecution(toolName, riskLevel, parameters, result);
      return result;
    }

    // Check database permissions
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`,
        { timeout: 5000 }
      );
      
      const permissions = response.data.permissions || [];
      if (permissions.includes(toolName)) {
        logger.log('✅ PERMISSION DATABASE-GRANTED', `Tool pre-approved: ${toolName}`, { 
          conversationId, 
          riskLevel 
        });
        const result = { behavior: 'allow', updatedInput: parameters };
        logger.logToolExecution(toolName, riskLevel, parameters, result);
        return result;
      }
    } catch (error) {
      logger.log('⚠️ PERMISSION DATABASE ERROR', `Could not check permissions: ${error.message}`, {
        toolName,
        conversationId
      });
    }

    // Analyze risk and show to user
    const riskIcon = this.getRiskIcon(riskLevel);

    console.log('\n' + '='.repeat(60));
    console.log(`🔧 PERMISSION REQUEST ${riskIcon} ${riskLevel} RISK`);
    console.log('='.repeat(60));
    console.log(`📋 Tool: ${toolName}`);
    console.log(`🔒 Risk Level: ${riskLevel}`);
    console.log(`📊 Usage Count: ${this.toolUsageStats.get(toolName)} times`);
    
    // Show parameters
    console.log('\n🔧 Parameters:');
    Object.entries(parameters).forEach(([key, value]) => {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      const truncated = valueStr.length > 100 ? valueStr.substring(0, 100) + '...' : valueStr;
      console.log(`   ${key}: ${truncated}`);
    });

    // Special handling for file operations
    if (['Write', 'Edit', 'MultiEdit'].includes(toolName) && parameters.file_path) {
      const filePath = parameters.file_path;
      const exists = fs.existsSync(filePath);
      console.log(`\n📁 File: ${filePath}`);
      console.log(`   ${exists ? '⚠️ Will OVERWRITE existing file' : '✨ Will create NEW file'}`);
    }

    // Special handling for Bash
    if (toolName === 'Bash' && parameters.command) {
      console.log(`\n💻 Command: ${parameters.command}`);
      if (/rm|sudo|chmod|chown|dd|mkfs|format|del/i.test(parameters.command)) {
        console.log('   🚨 WARNING: Potentially destructive command!');
      }
    }

    console.log('='.repeat(60));

    // Create interactive prompt in the frontend
    try {
      const promptData = {
        type: 'tool_permission',
        title: `Tool Permission: ${toolName}`,
        message: `Claude Code wants to use the ${toolName} tool. Risk level: ${riskLevel}`,
        options: [
          {
            id: '1',
            label: 'Allow Once',
            value: 'allow_once',
            isRecommended: riskLevel === 'LOW'
          },
          {
            id: '2',
            label: 'Allow All Tools (This Session)',
            value: 'allow_all',
            isRecommended: false
          },
          {
            id: '3',
            label: 'Always Allow This Tool',
            value: 'allow_always',
            isRecommended: riskLevel === 'LOW' || riskLevel === 'MEDIUM'
          },
          {
            id: '4',
            label: 'Deny',
            value: 'deny',
            isRecommended: riskLevel === 'CRITICAL'
          }
        ],
        context: {
          toolName,
          riskLevel,
          parameters: JSON.stringify(parameters).substring(0, 500),
          usageCount: this.toolUsageStats.get(toolName)
        }
      };

      const response = await axios.post(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/prompts`,
        promptData,
        { timeout: 10000 }
      );

      if (response.data.success) {
        const prompt = response.data.prompt;
        console.log(`🔐 Created permission prompt: ${prompt.id}`);
        
        // Wait for user response
        const userResponse = await this.waitForPermissionResponse(prompt.id);
        
        // Handle response
        let result;
        switch (userResponse.value) {
          case 'allow_once':
            logger.log('✅ PERMISSION USER-GRANTED', `User allowed once: ${toolName}`, { 
              conversationId, 
              riskLevel, 
              scope: 'once' 
            });
            result = { behavior: 'allow', updatedInput: parameters };
            logger.logToolExecution(toolName, riskLevel, parameters, result);
            return result;
            
          case 'allow_all':
            logger.log('🔓 PERMISSION USER-GRANTED', `User allowing all tools for session: ${toolName}`, { 
              conversationId, 
              riskLevel, 
              scope: 'session' 
            });
            if (!this.conversationPermissions.has(conversationId)) {
              this.conversationPermissions.set(conversationId, {});
            }
            this.conversationPermissions.get(conversationId).autoAllow = true;
            result = { behavior: 'allow', updatedInput: parameters };
            logger.logToolExecution(toolName, riskLevel, parameters, result);
            return result;
            
          case 'allow_always':
            logger.log('✅ PERMISSION USER-GRANTED', `User always allowing: ${toolName}`, { 
              conversationId, 
              riskLevel, 
              scope: 'always' 
            });
            // Store in database
            await this.storePermissionInDatabase(toolName, conversationId);
            result = { behavior: 'allow', updatedInput: parameters };
            logger.logToolExecution(toolName, riskLevel, parameters, result);
            return result;
            
          case 'deny':
          default:
            logger.log('❌ PERMISSION USER-DENIED', `User denied: ${toolName}`, { 
              conversationId, 
              riskLevel 
            });
            if (!this.conversationPermissions.has(conversationId)) {
              this.conversationPermissions.set(conversationId, { deniedTools: new Set() });
            }
            this.conversationPermissions.get(conversationId).deniedTools.add(toolName);
            result = { behavior: 'deny', message: 'User denied permission' };
            logger.logToolExecution(toolName, riskLevel, parameters, result);
            return result;
        }
      }
    } catch (error) {
      console.error(`❌ Permission prompt failed:`, error.message);
      // Fall back to console prompt
      return await this.getConsolePermission(toolName, parameters, riskLevel);
    }
  }

  async getConsolePermission(toolName, parameters, riskLevel) {
    console.log(`\n❓ Allow "${toolName}"? (y=yes, n=no, a=allow all): `);
    
    // Simple console fallback
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('', (answer) => {
        rl.close();
        const response = answer.toLowerCase().trim();
        
        if (response === 'a') {
          console.log('🔓 Allowing all tools');
          this.autoAllow = true;
          resolve({ behavior: 'allow', updatedInput: parameters });
        } else if (response === 'y' || response === 'yes') {
          console.log(`✅ Allowed: ${toolName}`);
          resolve({ behavior: 'allow', updatedInput: parameters });
        } else {
          console.log(`❌ Denied: ${toolName}`);
          resolve({ behavior: 'deny', message: 'User denied permission' });
        }
      });
    });
  }

  async waitForPermissionResponse(promptId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingPermissionRequests.delete(promptId);
        reject(new Error('Permission request timed out'));
      }, timeoutMs);

      pendingPermissionRequests.set(promptId, {
        resolve: (response) => {
          clearTimeout(timeoutId);
          pendingPermissionRequests.delete(promptId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          pendingPermissionRequests.delete(promptId);
          reject(error);
        }
      });
    });
  }

  handlePermissionResponse(promptId, response) {
    const pendingRequest = pendingPermissionRequests.get(promptId);
    if (pendingRequest) {
      console.log(`📨 Received permission response for prompt ${promptId}:`, response);
      pendingRequest.resolve(response);
    }
  }

  async storePermissionInDatabase(toolName, conversationId) {
    try {
      await axios.post(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/permissions`,
        {
          toolName,
          status: 'granted',
          grantedBy: 'user'
        },
        { timeout: 5000 }
      );
      console.log(`💾 Stored permanent permission for ${toolName}`);
    } catch (error) {
      console.error(`⚠️ Failed to store permission:`, error.message);
    }
  }

  getStats() {
    return {
      autoAllow: this.autoAllow,
      allowedTools: Array.from(this.allowedTools),
      deniedTools: Array.from(this.deniedTools),
      usageStats: Object.fromEntries(this.toolUsageStats),
      conversationStats: Array.from(this.conversationPermissions.entries()).map(([id, perms]) => ({
        conversationId: id,
        autoAllow: perms.autoAllow,
        deniedTools: perms.deniedTools ? Array.from(perms.deniedTools) : []
      }))
    };
  }

  reset(conversationId) {
    if (conversationId) {
      this.conversationPermissions.delete(conversationId);
    } else {
      this.conversationPermissions.clear();
      this.autoAllow = false;
      this.allowedTools.clear();
      this.deniedTools.clear();
      this.toolUsageStats.clear();
    }
  }
}

class EnhancedWebUIChatHandler {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.permissionSystem = new EnhancedPermissionSystem();
  }

  /**
   * Execute Claude command with canUseTool support
   */
  async *executeClaudeCommandWithAsyncIterable(message, requestId, sessionId, context) {
    let abortController;
    let conversationDone;
    const startTime = Date.now();
    let currentSessionId = sessionId;
    let totalCost = 0;
    let totalTokens = 0;
    let turns = 0;

    try {
      abortController = new AbortController();
      requestAbortControllers.set(requestId, abortController);

      logger.logSeparator(`🚀 CLAUDE EXECUTION START: ${requestId}`, 70);
      logger.log('🚀 CLAUDE EXECUTION START', `Enhanced Claude Code execution initiated`, {
        requestId,
        sessionId: sessionId || 'new',
        messageLength: message.length,
        messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        conversationId: context.conversationId,
        workingDirectory: context.workingDirectory
      });
      
      if (sessionId) {
        logger.logSessionEvent('resume', sessionId, { requestId });
      } else {
        logger.logSessionEvent('new', 'pending', { requestId });
      }

      // Create async iterable for user messages
      const conversationComplete = new Promise((resolve) => {
        conversationDone = resolve;
      });

      async function* createPromptStream() {
        yield {
          type: 'user',
          message: { role: 'user', content: message },
          parent_tool_use_id: null,
          session_id: sessionId || `webui-${Date.now()}`
        };
        await conversationComplete;
      }

      // Build options with canUseTool
      const options = {
        abortController,
        maxTurns: 20,
        canUseTool: async (toolName, parameters) => {
          console.log(`🔧 Tool request: ${toolName}`);
          return await this.permissionSystem.getUserPermission(toolName, parameters, context);
        }
      };

      // Add session resume if available
      if (sessionId && sessionId.trim() !== "") {
        options.resume = sessionId;
        console.log(`✅ Resuming session with canUseTool: ${sessionId}`);
      }

      // Add working directory
      if (context.workingDirectory) {
        options.cwd = context.workingDirectory;
      }

      console.log(`🔧 Query options (enhanced):`, {
        hasAbortController: !!options.abortController,
        maxTurns: options.maxTurns,
        resume: options.resume || "none",
        cwd: options.cwd || "default",
        hasCanUseTool: !!options.canUseTool
      });

      // Execute query with async iterable and canUseTool
      let messageCount = 0;
      let fullContent = "";

      logger.log('📤 QUERY EXECUTION', `Starting query with ${options.maxTurns} max turns`, {
        hasAbortController: !!options.abortController,
        resume: options.resume || 'none',
        cwd: options.cwd || 'default',
        hasCanUseTool: !!options.canUseTool
      });

      for await (const sdkMessage of query({
        prompt: createPromptStream(),
        abortController,
        options
      })) {
        messageCount++;
        
        // Log message types with comprehensive details
        logger.logMessageType(sdkMessage.type || 'unknown', currentSessionId, {
          messageCount,
          messageSize: JSON.stringify(sdkMessage).length,
          hasContent: !!(sdkMessage.message?.content),
          requestId
        });

        // Extract session ID
        if (sdkMessage.type === 'system' && sdkMessage.session_id) {
          const previousSessionId = currentSessionId;
          currentSessionId = sdkMessage.session_id;
          
          logger.logSessionEvent('id_captured', currentSessionId, { 
            requestId, 
            previousSessionId,
            tools: sdkMessage.tools?.length || 0,
            mcpServers: sdkMessage.mcp_servers?.length || 0
          });

          // Log available tools
          if (sdkMessage.tools && sdkMessage.tools.length > 0) {
            logger.log('🔧 TOOLS AVAILABLE', `${sdkMessage.tools.length} tools detected`, {
              tools: sdkMessage.tools,
              sessionId: currentSessionId
            });
          }

          // Log MCP servers
          if (sdkMessage.mcp_servers && sdkMessage.mcp_servers.length > 0) {
            logger.log('🔌 MCP SERVERS', `${sdkMessage.mcp_servers.length} servers connected`, {
              servers: sdkMessage.mcp_servers.map(s => s.name),
              sessionId: currentSessionId
            });
          }
        }

        // Extract content with detailed logging
        if (sdkMessage.type === 'assistant' && sdkMessage.message) {
          let textContent = "";
          
          if (typeof sdkMessage.message.content === "string") {
            textContent = sdkMessage.message.content;
          } else if (Array.isArray(sdkMessage.message.content)) {
            const textBlocks = sdkMessage.message.content.filter(block => block?.type === "text");
            textContent = textBlocks.map(block => block.text || "").join("");
            
            // Log content structure
            logger.log('📝 ASSISTANT CONTENT', `Content blocks processed`, {
              totalBlocks: sdkMessage.message.content.length,
              textBlocks: textBlocks.length,
              contentLength: textContent.length,
              sessionId: currentSessionId
            });
          }
          
          if (textContent) {
            fullContent = textContent;
            totalTokens = Math.ceil(textContent.length / 4); // Rough token estimate
          }
        } else if (sdkMessage.type === 'result') {
          if (conversationDone) conversationDone();
          
          // Extract final metrics
          totalCost = sdkMessage.total_cost_usd || 0;
          turns = sdkMessage.num_turns || 0;
          const duration = Date.now() - startTime;
          
          logger.logSessionEvent('completed', currentSessionId, {
            subtype: sdkMessage.subtype,
            cost: totalCost,
            turns,
            duration: Math.round(duration / 1000)
          });

          logger.logCostTracking(totalCost, currentSessionId, 'claude_query');
          
          // Show permission stats
          const stats = this.permissionSystem.getStats();
          logger.log('🛡️ PERMISSION SUMMARY', `Session permission usage`, {
            toolsUsed: Object.keys(stats.usageStats).length,
            totalToolCalls: Object.values(stats.usageStats).reduce((a, b) => a + b, 0),
            autoAllow: stats.autoAllow,
            sessionId: currentSessionId
          });
        }

        yield {
          type: "claude_json",
          data: sdkMessage,
          sessionId: currentSessionId,
          content: fullContent
        };

        // Check if complete
        if (sdkMessage.type === 'result') {
          const finalDuration = Date.now() - startTime;
          
          logger.logPerformanceMetrics(requestId, finalDuration, totalCost, totalTokens, turns);
          logger.logSeparator(`✅ CLAUDE EXECUTION COMPLETE: ${requestId}`, 70);
          
          yield { type: "done", sessionId: currentSessionId };
          break;
        }
      }

    } catch (error) {
      if (conversationDone) conversationDone();
      
      const duration = Date.now() - startTime;
      logger.log("❌ CLAUDE EXECUTION ERROR", `Enhanced execution failed: ${error.message}`, {
        requestId,
        sessionId: currentSessionId,
        duration: Math.round(duration / 1000),
        errorType: error.name,
        conversationId: context.conversationId
      });
      
      if (error.name === "AbortError") {
        logger.logSessionEvent('aborted', currentSessionId, { requestId, duration });
        yield { type: "aborted" };
      } else {
        logger.logSessionEvent('error', currentSessionId, { 
          requestId, 
          duration, 
          error: error.message 
        });
        yield {
          type: "error",
          error: error.message || String(error),
        };
      }
    } finally {
      if (requestAbortControllers.has(requestId)) {
        requestAbortControllers.delete(requestId);
      }
      
      logger.logSeparator(`🏁 CLAUDE EXECUTION END: ${requestId}`, 70);
    }
  }

  /**
   * Process streaming request with enhanced permissions
   */
  async processStreamingRequest(request) {
    const {
      message,
      requestId,
      conversationId,
      messageId,
      sessionId,
      workingDirectory,
    } = request;

    const requestStartTime = logger.logRequestStart(requestId, conversationId, message);

    try {
      // Load conversation
      const conversation = await this.loadConversation(conversationId);
      
      // Build context
      const context = {
        conversationId,
        requestId,
        messageId,
        workingDirectory: workingDirectory || process.cwd()
      };

      // Determine session ID
      const effectiveSessionId = conversation?.claudeSessionId || sessionId;
      
      logger.log('🔍 REQUEST CONTEXT', `Building request context`, {
        conversationLoaded: !!conversation,
        effectiveSessionId: effectiveSessionId || 'new',
        workingDirectory: context.workingDirectory,
        hasProjectName: !!request.projectName
      });

      // Add project context if provided
      let contextMessage = message;
      if (request.projectName) {
        contextMessage = `Project: ${request.projectName}\n\n${message}`;
        logger.log('📁 PROJECT CONTEXT', `Added project context: ${request.projectName}`);
      }

      // Execute with enhanced permission system
      let fullContent = "";
      let currentSessionId = effectiveSessionId;
      let hasStoredSession = false;

      for await (const streamResponse of this.executeClaudeCommandWithAsyncIterable(
        contextMessage,
        requestId,
        effectiveSessionId,
        context
      )) {
        // Update session ID if changed
        if (streamResponse.sessionId && streamResponse.sessionId !== currentSessionId) {
          currentSessionId = streamResponse.sessionId;
          
          if (!hasStoredSession) {
            hasStoredSession = true;
            this.storeSessionId(conversationId, currentSessionId).catch(err => {
              console.error(`⚠️ Failed to store session:`, err.message);
            });
          }
        }

        // Update content
        if (streamResponse.content) {
          fullContent = streamResponse.content;
        }

        // Send response to backend
        if (this.socket?.connected) {
          this.socket.emit("chat-bridge:response", {
            messageId,
            requestId,
            streamResponse,
            content: fullContent,
            isComplete: ["done", "error", "aborted"].includes(streamResponse.type),
            sessionId: currentSessionId,
          });
        }

        // Check if complete
        if (["done", "error", "aborted"].includes(streamResponse.type)) {
          const requestDuration = logger.logRequestEnd(requestId, requestStartTime, streamResponse.type);
          
          // Update token usage
          if (fullContent) {
            const estimatedTokens = Math.ceil(fullContent.length / 4) + TOKEN_ESTIMATE_PER_MESSAGE;
            logger.log('📈 TOKEN UPDATE', `Updating token usage`, {
              estimatedTokens,
              contentLength: fullContent.length,
              conversationId
            });
            
            this.updateTokenUsage(conversationId, estimatedTokens).catch(err => {
              logger.log('⚠️ TOKEN UPDATE FAILED', `Failed to update tokens: ${err.message}`, {
                conversationId,
                estimatedTokens
              });
            });
          }
          
          // Log final request metrics
          logger.log('🎯 REQUEST METRICS', `Request processing complete`, {
            type: streamResponse.type,
            duration: Math.round(requestDuration / 1000),
            contentLength: fullContent.length,
            sessionStored: hasStoredSession
          });
          
          break;
        }
      }

    } catch (error) {
      const requestDuration = logger.logRequestEnd(requestId, requestStartTime, 'failed', error);
      
      logger.log("❌ REQUEST PROCESSING ERROR", `Error processing request: ${error.message}`, {
        requestId,
        conversationId,
        duration: Math.round(requestDuration / 1000),
        errorType: error.name
      });

      if (this.socket?.connected) {
        this.socket.emit("chat-bridge:response", {
          messageId,
          requestId,
          content: "",
          isComplete: true,
          error: error.message || String(error),
        });
      }
    }
  }

  /**
   * Load conversation details
   */
  async loadConversation(conversationId) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/conversation/${conversationId}`,
        { timeout: 5000 }
      );
      return response.data.conversation;
    } catch (error) {
      console.error(`❌ Failed to load conversation:`, error.message);
      return null;
    }
  }

  /**
   * Store session ID
   */
  async storeSessionId(conversationId, sessionId) {
    try {
      await axios.put(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/session`,
        { claudeSessionId: sessionId },
        { timeout: 5000 }
      );
      
      logger.log('💾 SESSION STORED', `Session ID stored successfully`, {
        conversationId,
        sessionId: sessionId.substring(0, 12) + '...',
        fullSessionId: sessionId
      });
      
      logger.logSessionEvent('stored', sessionId, { conversationId });
      
    } catch (error) {
      logger.log('❌ SESSION STORE FAILED', `Failed to store session ID: ${error.message}`, {
        conversationId,
        sessionId: sessionId?.substring(0, 12) + '...',
        errorType: error.name
      });
    }
  }

  /**
   * Update token usage
   */
  async updateTokenUsage(conversationId, additionalTokens) {
    try {
      await axios.put(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/tokens`,
        { additionalTokens },
        { timeout: 5000 }
      );
      console.log(`📈 Updated tokens: +${additionalTokens}`);
    } catch (error) {
      console.error(`❌ Failed to update token usage:`, error.message);
    }
  }

  /**
   * Handle abort request
   */
  handleAbortRequest(requestId) {
    const abortController = requestAbortControllers.get(requestId);
    if (abortController) {
      abortController.abort();
      requestAbortControllers.delete(requestId);
      console.log(`⏹️ Request ${requestId} aborted`);
      return true;
    }
    console.warn(`⚠️ No abort controller found for request ${requestId}`);
    return false;
  }

  /**
   * Connect to backend
   */
  connectSocket() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      logger.log("🔌 SOCKET CONNECTED", "Connected to backend via Socket.IO", {
        backendUrl: BACKEND_URL,
        transportType: this.socket.io.engine.transport.name
      });
      
      this.isConnected = true;
      
      const connectionData = {
        version: "2.1.0",
        features: [
          "comprehensive-logging",
          "async-iterable", 
          "canUseTool", 
          "session-resume", 
          "abort", 
          "enhanced-permissions",
          "cost-tracking",
          "performance-metrics"
        ],
      };
      
      this.socket.emit("chat-bridge:connect", connectionData);
      
      logger.log("📡 BRIDGE CONNECTED", "Sent connection handshake to backend", {
        version: connectionData.version,
        featuresCount: connectionData.features.length
      });
    });

    this.socket.on("chat:request", async (request) => {
      logger.log("📬 CHAT REQUEST", `Received chat request`, {
        requestId: request.requestId,
        messageId: request.messageId,
        conversationId: request.conversationId,
        messageLength: request.message?.length || 0,
        hasSessionId: !!request.sessionId,
        hasProjectName: !!request.projectName
      });
      
      await this.processStreamingRequest(request);
    });

    this.socket.on("chat:pending", async (requests) => {
      logger.log("📬 PENDING REQUESTS", `Received pending requests batch`, {
        count: requests.length,
        requestIds: requests.map(r => r.requestId).slice(0, 5)
      });
      
      for (const request of requests) {
        await this.processStreamingRequest(request);
      }
    });

    this.socket.on("abort:request", (data) => {
      logger.log("⏹️ ABORT REQUEST", `Received abort request`, {
        requestId: data.requestId,
        reason: data.reason || 'user_requested'
      });
      
      const aborted = this.handleAbortRequest(data.requestId);
      
      if (aborted) {
        logger.log("⏹️ ABORT SUCCESS", `Request successfully aborted`, { requestId: data.requestId });
      } else {
        logger.log("⚠️ ABORT FAILED", `No active request found to abort`, { requestId: data.requestId });
      }
    });

    this.socket.on("permission:response", (data) => {
      logger.log("🔐 PERMISSION RESPONSE", `Received permission response`, {
        promptId: data.promptId,
        response: data.response?.value,
        responseTime: Date.now()
      });
      
      this.permissionSystem.handlePermissionResponse(data.promptId, data.response);
    });

    this.socket.on("disconnect", (reason) => {
      logger.log("🔌 SOCKET DISCONNECTED", `Disconnected from backend`, {
        reason,
        wasConnected: this.isConnected,
        willReconnect: this.socket.io._reconnection
      });
      
      this.isConnected = false;
    });

    this.socket.on("error", (error) => {
      logger.log("❌ SOCKET ERROR", `Socket.IO error occurred`, {
        errorMessage: error.message,
        errorType: error.type,
        isConnected: this.isConnected
      });
    });

    this.socket.on("reconnect", (attemptNumber) => {
      logger.log("🔄 SOCKET RECONNECTED", `Successfully reconnected to backend`, {
        attemptNumber,
        backendUrl: BACKEND_URL,
        transportType: this.socket.io.engine.transport.name
      });
    });
  }

  /**
   * Poll for requests (fallback)
   */
  async pollForRequests() {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/chat/pending`,
        { timeout: 5000 }
      );
      const { requests } = response.data;

      if (requests?.length > 0) {
        console.log(`📥 Polled ${requests.length} pending requests`);
        for (const request of requests) {
          await this.processStreamingRequest(request);
        }
      }
    } catch (error) {
      if (error.code !== "ECONNRESET" && error.code !== "ENOTFOUND") {
        console.error("❌ Polling error:", error.message);
      }
    }
  }

  /**
   * Start the handler
   */
  async start() {
    logger.logSeparator("🚀 ENHANCED WEBUI CHAT HANDLER STARTUP", 80);
    
    logger.log("🚀 HANDLER STARTUP", "Starting Enhanced WebUI Chat Handler", {
      backendUrl: BACKEND_URL,
      pollingInterval: POLLING_INTERVAL,
      version: "2.1.0",
      features: [
        "comprehensive-logging",
        "async-iterable", 
        "canUseTool", 
        "session-resume", 
        "abort", 
        "enhanced-permissions",
        "cost-tracking",
        "performance-metrics",
        "file-based-logging",
        "statistics-reporting"
      ]
    });

    logger.log("✨ FEATURE OVERVIEW", "Enhanced features active", {
      permissions: "Risk-based permission analysis with UI prompts",
      tracking: "Per-conversation permission and tool usage tracking", 
      logging: "File-based logging with comprehensive metrics",
      persistence: "Database permission and session persistence",
      performance: "Real-time performance monitoring and cost tracking",
      statistics: "Detailed statistics with auto-save/restore"
    });

    // Connect Socket.IO
    this.connectSocket();

    // Polling fallback
    setInterval(() => {
      if (!this.isConnected) {
        this.pollForRequests();
      }
    }, POLLING_INTERVAL);

    // Show stats periodically
    setInterval(() => {
      const stats = this.permissionSystem.getStats();
      if (Object.keys(stats.usageStats).length > 0) {
        logger.log("📊 PERIODIC STATS", `${Object.keys(stats.usageStats).length} tools used`, {
          totalCalls: Object.values(stats.usageStats).reduce((a, b) => a + b, 0),
          conversations: stats.conversationStats?.length || 0
        });
      }
    }, 60000); // Every minute

    // Show comprehensive stats every 10 minutes
    setInterval(() => {
      if (logger.stats.totalRequests > 0) {
        logger.showComprehensiveStats();
      }
    }, 600000); // Every 10 minutes

    logger.log("✅ HANDLER READY", "Enhanced WebUI Chat Handler is ready to process requests", {
      logFile: logger.logFile,
      statsFile: logger.statsFile
    });

    logger.logSeparator("", 80);
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    logger.logSeparator("🛑 ENHANCED WEBUI CHAT HANDLER SHUTDOWN", 80);
    
    logger.log("🛑 HANDLER SHUTDOWN", "Starting graceful shutdown process");

    // Show comprehensive final stats
    logger.showComprehensiveStats();

    // Show permission system stats
    const stats = this.permissionSystem.getStats();
    logger.log("🔐 PERMISSION FINAL STATS", "Final permission system statistics", {
      toolsUsed: Object.keys(stats.usageStats).length,
      totalToolCalls: Object.values(stats.usageStats).reduce((a, b) => a + b, 0),
      conversations: stats.conversationStats?.length || 0,
      autoAllowEnabled: stats.autoAllow
    });

    // Abort all pending requests
    const pendingCount = requestAbortControllers.size;
    for (const [requestId, abortController] of requestAbortControllers) {
      logger.log("⏹️ ABORTING REQUEST", `Aborting pending request: ${requestId}`);
      abortController.abort();
    }
    requestAbortControllers.clear();

    if (pendingCount > 0) {
      logger.log("📊 CLEANUP SUMMARY", `Aborted ${pendingCount} pending requests`);
    }

    // Disconnect Socket.IO
    if (this.socket) {
      logger.log("🔌 SOCKET DISCONNECT", "Disconnecting from backend");
      this.socket.disconnect();
    }

    // Final log entry
    const uptime = Math.round((Date.now() - logger.startTime) / 1000);
    logger.log("✅ SHUTDOWN COMPLETE", "Enhanced WebUI Chat Handler shutdown complete", {
      uptime: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
      finalStats: {
        totalRequests: logger.stats.totalRequests,
        completed: logger.stats.completedRequests,
        failed: logger.stats.failedRequests,
        aborted: logger.stats.abortedRequests,
        totalCost: logger.stats.totalCost
      }
    });

    logger.logSeparator("🏁 SESSION END", 80);
    
    process.exit(0);
  }
}

// ============================================================================
// COMMAND LINE INTERFACE
// ============================================================================

async function handleCommandLine() {
  const args = process.argv.slice(2);
  
  if (args.includes('--stats') || args.includes('-s')) {
    // Show statistics without starting the handler
    console.log('📊 Enhanced WebUI Chat Handler - Statistics Viewer\n');
    logger.showComprehensiveStats();
    process.exit(0);
  }
  
  if (args.includes('--reset') || args.includes('-r')) {
    // Reset all statistics and logs
    console.log('🔄 Enhanced WebUI Chat Handler - Resetting All Data\n');
    logger.reset();
    console.log('✅ All statistics and logs have been reset');
    process.exit(0);
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📚 Enhanced WebUI Chat Handler v2.1.0 - Command Line Options

🚀 USAGE:
   node webui-chat-handler-enhanced.js          Start the handler (default)
   node webui-chat-handler-enhanced.js --stats  View comprehensive statistics
   node webui-chat-handler-enhanced.js --reset  Reset all data and statistics
   node webui-chat-handler-enhanced.js --help   Show this help message

🔧 OPTIONS:
   --stats, -s    Display comprehensive statistics report
   --reset, -r    Reset all logs, statistics, and persistent data  
   --help, -h     Show this help message

📁 FILES:
   webui-chat-handler.log       Detailed execution logs
   webui-chat-stats.json        Persistent statistics data

🌐 ENVIRONMENT VARIABLES:
   BACKEND_URL                  Backend server URL (default: http://localhost:3001)
   POLLING_INTERVAL             Fallback polling interval in ms (default: 2000)

📊 FEATURES:
   ✨ Comprehensive logging and statistics tracking
   🛡️ Enhanced permission system with risk analysis  
   🔧 Claude Code integration with canUseTool support
   💰 Cost tracking and performance monitoring
   📈 Real-time metrics and periodic reporting
   🔌 WebSocket communication with polling fallback

For more information, check the comprehensive documentation at the top of this file.
`);
    process.exit(0);
  }
  
  // Default: start the handler
  await startHandler();
}

async function startHandler() {
  // Create and start handler
  const handler = new EnhancedWebUIChatHandler();

  // Start the handler
  handler.start().catch((error) => {
    logger.log("❌ FATAL ERROR", `Fatal error starting Enhanced WebUI Chat Handler: ${error.message}`, {
      errorType: error.name,
      stack: error.stack
    });
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => handler.shutdown());
  process.on("SIGTERM", () => handler.shutdown());

  // Periodic status updates
  setInterval(() => {
    if (handler.isConnected && logger.stats.totalRequests > 0) {
      const uptime = Math.round((Date.now() - logger.startTime) / 1000);
      logger.log("💓 STATUS UPDATE", `Handler is running and processing requests`, {
        uptime: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
        totalRequests: logger.stats.totalRequests,
        isConnected: handler.isConnected,
        totalCost: logger.stats.totalCost.toFixed(6)
      });
    }
  }, 300000); // Every 5 minutes
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

// Handle command line arguments or start the handler
if (require.main === module) {
  handleCommandLine().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}

// Export for testing
module.exports = { 
  EnhancedWebUIChatHandler, 
  EnhancedPermissionSystem, 
  EnhancedLogger,
  logger 
};