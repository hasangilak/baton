#!/usr/bin/env bun

/**
 * 👑 ULTIMATE CLAUDE CODE SDK - "One Script to Rule Them All"
 * 
 * This is the most comprehensive Claude Code SDK integration ever created,
 * combining ALL enhanced features into a single, powerful script. It provides
 * enterprise-grade functionality with maximum security, context preservation,
 * and user control.
 * 
 * 🎯 FUNCTIONALITY:
 * - Ultimate permission system with 4-level risk analysis
 * - Advanced context preservation and session management
 * - Comprehensive MCP integration with security warnings
 * - Complete tool testing framework with detailed analytics
 * - Cost tracking and optimization across sessions
 * - Interactive and command-line interfaces
 * 
 * 🔧 FEATURES INCLUDED:
 * ✨ Enhanced permission system with detailed risk analysis
 * 🧠 Context preservation with continue/resume options
 * 🔌 MCP server integration with security warnings
 * 🧪 Comprehensive tool testing and validation
 * 📊 Advanced analytics and cost tracking
 * 🛡️ Enterprise-grade security analysis
 * 🎵 Hooks integration (completion sounds)
 * 📁 Complete file operation previews with security scanning
 * 🌐 Web operations with domain analysis
 * 💾 Session data persistence and management
 * 
 * 🧪 HOW TO TEST:
 * 
 * Interactive Mode (Recommended):
 * 1. Run: `bun run ultimate-claude-sdk.ts`
 * 2. Use commands: query, test, stats, clear, help, exit
 * 3. Type 'help' for complete command reference
 * 
 * Direct Commands:
 * - `bun run ultimate-claude-sdk.ts query "your prompt"`
 * - `bun run ultimate-claude-sdk.ts test` (run test suite)
 * - `bun run ultimate-claude-sdk.ts demo` (quick demonstration)
 * - `bun run ultimate-claude-sdk.ts stats` (show statistics)
 * 
 * 📋 INTERACTIVE COMMANDS:
 * - query [prompt] - Run ultimate query with all features
 * - test - Execute comprehensive test suite
 * - stats - Show detailed usage statistics
 * - clear - Reset all data and start fresh
 * - help - Show complete help information
 * - exit - Exit interactive mode
 * 
 * 🛡️ SECURITY FEATURES:
 * - 4-level risk assessment (LOW/MEDIUM/HIGH/CRITICAL)
 * - File content scanning for sensitive data
 * - System file protection warnings
 * - MCP tool security analysis
 * - Dangerous command detection
 * - Network operation warnings
 * 
 * 📊 ANALYTICS INCLUDED:
 * - Tool usage statistics and patterns
 * - Permission decision tracking
 * - Cost analysis per session and cumulative
 * - Performance metrics and optimization
 * - Session management and history
 * 
 * ⚠️  TROUBLESHOOTING:
 * - Dependency errors: Ensure all related files are present
 * - Permission issues: Check .claude/settings.local.json
 * - Session errors: Delete .ultimate-claude-session.json to reset
 * - Performance: Use 'a' to allow all tools for faster execution
 * 
 * 💡 WHEN TO USE:
 * - As your primary Claude Code SDK interface
 * - For production applications requiring maximum features
 * - When you need comprehensive security and analytics
 * - For complex workflows requiring context preservation
 * - As a learning tool for advanced SDK features
 * 
 * 🏆 THE ULTIMATE EXPERIENCE:
 * This single script provides everything needed for professional
 * Claude Code SDK integration with maximum security, features,
 * and user control. It's the culmination of all our enhancements.
 */

import { query, type SDKMessage, type SDKUserMessage, type PermissionResult } from "@anthropic-ai/claude-code";
import { createInterface } from 'readline';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// ENHANCED PERMISSION SYSTEM
// ============================================================================

interface DetailedToolInfo {
  toolName: string;
  parameters: Record<string, any>;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  explanation: string;
  impacts: string[];
  recommendations: string[];
}

class UltimatePermissionSystem {
  private autoAllow = false;
  private allowedTools = new Set<string>();
  private deniedTools = new Set<string>();
  private toolUsageStats = new Map<string, number>();

  private analyzeToolRequest(toolName: string, parameters: Record<string, any>): DetailedToolInfo {
    // Update usage stats
    this.toolUsageStats.set(toolName, (this.toolUsageStats.get(toolName) || 0) + 1);

    const baseInfo = {
      toolName,
      parameters,
      description: `Execute ${toolName} tool`,
      riskLevel: 'MEDIUM' as const,
      explanation: '',
      impacts: [] as string[],
      recommendations: [] as string[]
    };

    switch (toolName) {
      case 'Write':
        const filePath = parameters.file_path as string;
        const content = parameters.content as string;
        const isExistingFile = fs.existsSync(filePath);
        const fileSize = content ? content.length : 0;
        const isSystemPath = filePath.includes('/etc/') || filePath.includes('/usr/') || filePath.includes('/sys/');
        const isConfigFile = /\.(config|conf|env|json|yaml|yml)$/i.test(filePath);
        
        return {
          ...baseInfo,
          riskLevel: isSystemPath ? 'CRITICAL' : (isExistingFile && isConfigFile ? 'HIGH' : (isExistingFile ? 'MEDIUM' : 'LOW')),
          explanation: `Create or modify file at: ${filePath}`,
          impacts: [
            `📁 Target: ${filePath}`,
            `📄 Content size: ${fileSize} characters (${Math.ceil(fileSize/1024)}KB)`,
            `${isExistingFile ? '⚠️  Will OVERWRITE existing file' : '✨ Will create NEW file'}`,
            `📂 Directory: ${path.dirname(filePath)}`,
            `📊 Usage count: ${this.toolUsageStats.get(toolName)} times`,
            ...(isSystemPath ? ['🚨 CRITICAL: System directory detected!'] : []),
            ...(isConfigFile ? ['⚙️  Configuration file detected'] : [])
          ],
          recommendations: [
            'Review the file path and content carefully',
            isExistingFile ? '💾 Consider backing up existing file first' : '📂 Verify directory permissions',
            'Check content preview below for sensitive data',
            ...(isSystemPath ? ['❌ AVOID: System files can break your system'] : []),
            ...(isConfigFile ? ['🔒 Config files may contain sensitive settings'] : [])
          ]
        };

      case 'Edit':
      case 'MultiEdit':
        const editPath = parameters.file_path as string;
        const oldString = parameters.old_string || (parameters.edits?.[0]?.old_string);
        const newString = parameters.new_string || (parameters.edits?.[0]?.new_string);
        const isCodeFile = /\.(ts|js|py|java|cpp|c|rs|go)$/i.test(editPath);
        
        return {
          ...baseInfo,
          riskLevel: isCodeFile ? 'MEDIUM' : 'LOW',
          explanation: `Modify existing file: ${editPath}`,
          impacts: [
            `📁 File: ${editPath}`,
            `🔄 Changes: ${toolName === 'MultiEdit' ? 'Multiple edits' : 'Single edit'}`,
            `📝 Find: "${(oldString || '').substring(0, 50)}${(oldString || '').length > 50 ? '...' : ''}"`,
            `✏️  Replace: "${(newString || '').substring(0, 50)}${(newString || '').length > 50 ? '...' : ''}"`,
            `📊 Usage count: ${this.toolUsageStats.get(toolName)} times`,
            ...(isCodeFile ? ['💻 Code file modification detected'] : [])
          ],
          recommendations: [
            'Verify find/replace strings are correct',
            'Consider code formatting after changes',
            ...(isCodeFile ? ['🧪 Run tests after modification'] : [])
          ]
        };

      case 'Bash':
        const command = parameters.command as string;
        const isDangerous = /rm|sudo|chmod|chown|dd|mkfs|format|del/i.test(command);
        const isNetworking = /curl|wget|nc|ssh|scp|ftp/i.test(command);
        const isInstall = /apt|yum|brew|npm install|pip install|gem install/i.test(command);
        const isGit = /git\s+(push|pull|merge|rebase|reset)/i.test(command);
        
        return {
          ...baseInfo,
          riskLevel: isDangerous ? 'CRITICAL' : (isNetworking || isInstall ? 'HIGH' : (isGit ? 'MEDIUM' : 'LOW')),
          explanation: `Execute shell command: ${command}`,
          impacts: [
            `💻 Command: ${command}`,
            `📂 Working directory: ${process.cwd()}`,
            `👤 User: ${process.env.USER || 'unknown'}`,
            `📊 Bash usage: ${this.toolUsageStats.get(toolName)} times`,
            ...(isDangerous ? ['🚨 DANGEROUS: Command can delete/modify system files'] : []),
            ...(isNetworking ? ['🌐 NETWORK: External network access'] : []),
            ...(isInstall ? ['📦 INSTALL: Software installation'] : []),
            ...(isGit ? ['🔀 GIT: Repository modification'] : [])
          ],
          recommendations: [
            'Double-check command syntax and parameters',
            ...(isDangerous ? ['❌ EXTREME CAUTION: Potentially destructive command'] : []),
            ...(isNetworking ? ['🔒 Verify external destinations are trusted'] : []),
            ...(isInstall ? ['📋 Review what software will be installed'] : []),
            ...(isGit ? ['🔄 Ensure git repository is in clean state'] : [])
          ]
        };

      // MCP Tools Detection
      default:
        const isMCP = toolName.includes('mcp_') || toolName.includes('@') || 
                     !['Write', 'Read', 'Edit', 'Bash', 'LS', 'Grep', 'WebFetch', 'TodoWrite', 'MultiEdit', 'Glob', 'NotebookEdit', 'WebSearch'].includes(toolName);
        
        if (isMCP) {
          return {
            ...baseInfo,
            riskLevel: 'HIGH',
            explanation: `🔌 MCP TOOL: ${toolName} - External Integration`,
            impacts: [
              `🔌 MCP Server Tool: ${toolName}`,
              `🌐 External service integration`,
              `📡 Data transmission to third-party server`,
              `⚠️  Unknown external capabilities`,
              `📊 MCP usage: ${this.toolUsageStats.get(toolName)} times`,
              `🔄 May modify external resources or services`,
              `💾 May store data externally`
            ],
            recommendations: [
              '🔒 VERIFY: MCP server source is trusted',
              '📋 REVIEW: All parameters being sent externally',
              '⚠️  CAUTION: External tools have unknown side effects',
              '💡 CHECK: MCP server documentation and privacy policy',
              '🛡️  CONSIDER: What data exposure is acceptable'
            ]
          };
        }

        // Standard tools with enhanced analysis
        const standardTools: Record<string, any> = {
          'Read': { risk: 'LOW', desc: 'Read file contents', impacts: ['👁️  File contents visible to Claude'] },
          'LS': { risk: 'LOW', desc: 'List directory', impacts: ['📂 Directory structure revealed'] },
          'Grep': { risk: 'LOW', desc: 'Search files', impacts: ['🔍 Matching content visible'] },
          'WebFetch': { risk: 'MEDIUM', desc: 'Fetch web content', impacts: ['🌐 HTTP request to external server'] },
          'TodoWrite': { risk: 'LOW', desc: 'Update todos', impacts: ['📝 Task tracking only'] },
          'Glob': { risk: 'LOW', desc: 'Find files by pattern', impacts: ['📁 File paths revealed'] }
        };

        const toolInfo = standardTools[toolName] || { risk: 'MEDIUM', desc: 'Unknown tool', impacts: ['❓ Unknown capabilities'] };
        
        return {
          ...baseInfo,
          riskLevel: toolInfo.risk,
          explanation: toolInfo.desc,
          impacts: [
            ...toolInfo.impacts,
            `📊 ${toolName} usage: ${this.toolUsageStats.get(toolName)} times`
          ],
          recommendations: toolInfo.risk === 'LOW' ? ['✅ Safe operation'] : ['⚠️  Review parameters carefully']
        };
    }
  }

  private getRiskIcon(risk: string): string {
    switch (risk) {
      case 'LOW': return '🟢';
      case 'MEDIUM': return '🟡';
      case 'HIGH': return '🟠';
      case 'CRITICAL': return '🔴';
      default: return '⚪';
    }
  }

  private showContentPreview(parameters: Record<string, any>): void {
    if (parameters.content && typeof parameters.content === 'string') {
      const content = parameters.content;
      const lines = content.split('\n');
      const previewLines = lines.slice(0, 8);
      const hasMore = lines.length > 8;

      console.log('\n📄 CONTENT PREVIEW:');
      console.log('─'.repeat(60));
      previewLines.forEach((line, index) => {
        const lineNum = (index + 1).toString().padStart(2);
        const truncated = line.length > 100 ? line.substring(0, 100) + '...' : line;
        console.log(`${lineNum}: ${truncated}`);
      });
      if (hasMore) {
        console.log(`   ... and ${lines.length - 8} more lines (${content.length} total chars)`);
      }
      console.log('─'.repeat(60));

      // Security scanning
      const sensitivePatterns = [
        { pattern: /password|passwd|pwd/i, warning: '🔒 Potential password detected' },
        { pattern: /api[_-]?key|apikey/i, warning: '🔑 Potential API key detected' },
        { pattern: /token|bearer/i, warning: '🎫 Potential token detected' },
        { pattern: /secret|private/i, warning: '🤐 Potential secret detected' },
        { pattern: /localhost|127\.0\.0\.1/i, warning: '🏠 Local server reference detected' },
        { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/i, warning: '🌐 IP address detected' }
      ];

      const warnings: string[] = [];
      sensitivePatterns.forEach(({ pattern, warning }) => {
        if (pattern.test(content)) warnings.push(warning);
      });

      if (warnings.length > 0) {
        console.log('\n⚠️  SECURITY WARNINGS:');
        warnings.forEach(w => console.log(`   ${w}`));
      }
    }
  }

  async getUserPermission(toolName: string, parameters: Record<string, any>): Promise<PermissionResult> {
    // Handle auto-allow/deny states
    if (this.autoAllow) {
      console.log(`\n🚀 Auto-allowing: ${toolName}`);
      return { behavior: 'allow', updatedInput: parameters };
    }

    if (this.deniedTools.has(toolName)) {
      console.log(`\n🚫 Auto-denying: ${toolName} (previously denied)`);
      return { behavior: 'deny', message: 'Tool previously denied by user' };
    }

    const toolInfo = this.analyzeToolRequest(toolName, parameters);
    const riskIcon = this.getRiskIcon(toolInfo.riskLevel);

    console.log('\n' + '='.repeat(70));
    console.log(`🔧 ULTIMATE PERMISSION REQUEST ${riskIcon} ${toolInfo.riskLevel} RISK`);
    console.log('='.repeat(70));
    console.log(`📋 ${toolInfo.explanation}`);
    
    console.log('\n📊 IMPACT ANALYSIS:');
    toolInfo.impacts.forEach(impact => console.log(`   ${impact}`));
    
    console.log('\n💡 SECURITY RECOMMENDATIONS:');
    toolInfo.recommendations.forEach(rec => console.log(`   ${rec}`));
    
    // Show enhanced content preview for file operations
    if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
      this.showContentPreview(parameters);
    }

    // Show parameter analysis
    console.log('\n🔧 PARAMETER DETAILS:');
    Object.entries(parameters).forEach(([key, value]) => {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      const truncated = valueStr.length > 150 ? valueStr.substring(0, 150) + '...' : valueStr;
      console.log(`   📝 ${key}: ${truncated}`);
    });

    console.log('='.repeat(70));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const options = [
        'y=allow once',
        'n=deny once', 
        'a=allow all tools',
        'd=deny all ' + toolName,
        'i=more info',
        's=show stats'
      ];
      
      const prompt = `\n❓ "${toolName}" (${options.join(' | ')}): `;
      
      rl.question(prompt, (answer) => {
        rl.close();
        const response = answer.toLowerCase().trim();
        
        switch (response) {
          case 'a':
            console.log('🔓 ALLOWING ALL future tools automatically...');
            this.autoAllow = true;
            resolve({ behavior: 'allow', updatedInput: parameters });
            break;
            
          case 'd':
            console.log(`🚫 DENYING ALL future "${toolName}" requests...`);
            this.deniedTools.add(toolName);
            resolve({ behavior: 'deny', message: `User denied all ${toolName} requests` });
            break;
            
          case 's':
            console.log('\n📊 TOOL USAGE STATISTICS:');
            this.toolUsageStats.forEach((count, tool) => {
              console.log(`   🔧 ${tool}: ${count} times`);
            });
            console.log(`   🔓 Auto-allow: ${this.autoAllow}`);
            console.log(`   ✅ Allowed tools: ${this.allowedTools.size}`);
            console.log(`   ❌ Denied tools: ${this.deniedTools.size}`);
            // Ask again after showing stats
            this.getUserPermission(toolName, parameters).then(resolve);
            return;
            
          case 'i':
            console.log('\n📚 ADDITIONAL SECURITY INFORMATION:');
            console.log(`   🛡️  Risk Level: ${toolInfo.riskLevel} - Based on tool capabilities and parameters`);
            console.log(`   📋 Tool Category: ${toolInfo.toolName.includes('mcp_') ? 'External MCP Integration' : 'Standard Claude Tool'}`);
            console.log(`   🔒 Security Advice: Always verify parameters and understand tool actions`);
            console.log(`   📖 Documentation: https://docs.anthropic.com/claude-code`);
            console.log(`   💡 Your Data: Consider what information this tool can access or modify`);
            // Ask again after showing info
            this.getUserPermission(toolName, parameters).then(resolve);
            return;
            
          case 'y':
          case 'yes':
            console.log(`✅ PERMISSION GRANTED: ${toolName}`);
            resolve({ behavior: 'allow', updatedInput: parameters });
            break;
            
          default:
            console.log(`❌ PERMISSION DENIED: ${toolName}`);
            resolve({ behavior: 'deny', message: 'User denied permission' });
            break;
        }
      });
    });
  }

  getStats() {
    return {
      autoAllow: this.autoAllow,
      allowedTools: Array.from(this.allowedTools),
      deniedTools: Array.from(this.deniedTools),
      usageStats: Object.fromEntries(this.toolUsageStats)
    };
  }

  reset(): void {
    this.autoAllow = false;
    this.allowedTools.clear();
    this.deniedTools.clear();
    this.toolUsageStats.clear();
    console.log('🔄 Ultimate permission system reset');
  }
}

// ============================================================================
// SESSION MANAGEMENT & CONTEXT PRESERVATION  
// ============================================================================

interface UltimateSessionContext {
  sessionId: string | null;
  lastInteraction: Date;
  messageCount: number;
  totalCost: number;
  conversationSummary: string;
  toolsUsed: string[];
  permissionStats: any;
}

class UltimateSessionManager {
  private sessionFile = path.join(process.cwd(), '.ultimate-claude-session.json');
  private currentContext: UltimateSessionContext | null = null;

  constructor() {
    this.loadSession();
  }

  private loadSession(): void {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = fs.readFileSync(this.sessionFile, 'utf8');
        this.currentContext = JSON.parse(data);
        console.log('📂 Session loaded');
        console.log(`   🆔 ID: ${this.currentContext?.sessionId?.substring(0, 8)}...`);
        console.log(`   📅 Last: ${new Date(this.currentContext?.lastInteraction || '').toLocaleString()}`);
        console.log(`   💬 Messages: ${this.currentContext?.messageCount || 0}`);
        console.log(`   💰 Cost: $${this.currentContext?.totalCost || 0}`);
        console.log(`   🔧 Tools: ${this.currentContext?.toolsUsed?.length || 0} different`);
      }
    } catch (error) {
      console.log('📝 Starting fresh session');
    }
  }

  saveSession(sessionId: string, messageCount: number, cost: number, toolsUsed: string[], summary?: string, permissionStats?: any): void {
    const allTools = new Set([...(this.currentContext?.toolsUsed || []), ...toolsUsed]);
    
    this.currentContext = {
      sessionId,
      lastInteraction: new Date(),
      messageCount,
      totalCost: (this.currentContext?.totalCost || 0) + cost,
      conversationSummary: summary || this.currentContext?.conversationSummary || '',
      toolsUsed: Array.from(allTools),
      permissionStats
    };

    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify(this.currentContext, null, 2));
      console.log('💾 Session saved');
    } catch (error) {
      console.log('⚠️  Session save failed:', error);
    }
  }

  async askContextStrategy(): Promise<'new' | 'continue' | 'resume'> {
    if (!this.currentContext?.sessionId) return 'new';

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      console.log('\n🔄 ULTIMATE CONTEXT MANAGEMENT:');
      console.log(`   📋 Previous session: ${this.currentContext?.sessionId?.substring(0, 12)}...`);
      console.log(`   📅 Last used: ${new Date(this.currentContext?.lastInteraction || '').toLocaleString()}`);
      console.log(`   💬 Messages: ${this.currentContext?.messageCount}`);
      console.log(`   💰 Total cost: $${this.currentContext?.totalCost?.toFixed(6)}`);
      console.log(`   🔧 Tools used: ${this.currentContext?.toolsUsed?.join(', ') || 'None'}`);
      
      if (this.currentContext?.conversationSummary) {
        console.log(`   📝 Last activity: ${this.currentContext.conversationSummary}`);
      }

      const prompt = '\n❓ Context strategy? (c=continue | r=resume | n=new | s=stats): ';
      
      rl.question(prompt, (answer) => {
        rl.close();
        const response = answer.toLowerCase().trim();
        
        switch (response) {
          case 'c':
          case 'continue':
            console.log('🔄 Continuing from most recent...');
            resolve('continue');
            break;
          case 'r': 
          case 'resume':
            console.log('📋 Resuming specific session...');
            resolve('resume');
            break;
          case 's':
          case 'stats':
            this.showDetailedStats();
            this.askContextStrategy().then(resolve);
            return;
          default:
            console.log('🆕 Starting new session...');
            resolve('new');
            break;
        }
      });
    });
  }

  showDetailedStats(): void {
    console.log('\n📊 ULTIMATE SESSION STATISTICS:');
    console.log('='.repeat(50));
    
    if (this.currentContext) {
      console.log(`🆔 Session ID: ${this.currentContext.sessionId}`);
      console.log(`📅 Last interaction: ${new Date(this.currentContext.lastInteraction).toLocaleString()}`);
      console.log(`💬 Total messages: ${this.currentContext.messageCount}`);
      console.log(`💰 Total cost: $${this.currentContext.totalCost?.toFixed(6)}`);
      console.log(`🔧 Tools used: ${this.currentContext.toolsUsed?.length || 0} different`);
      
      if (this.currentContext.toolsUsed?.length) {
        console.log(`   ${this.currentContext.toolsUsed.join(', ')}`);
      }
      
      if (this.currentContext.permissionStats) {
        console.log('\n🛡️  Permission Statistics:');
        const stats = this.currentContext.permissionStats;
        console.log(`   Auto-allow: ${stats.autoAllow ? 'ON' : 'OFF'}`);
        console.log(`   Allowed tools: ${stats.allowedTools?.length || 0}`);
        console.log(`   Denied tools: ${stats.deniedTools?.length || 0}`);
        
        if (stats.usageStats) {
          console.log('   Usage counts:');
          Object.entries(stats.usageStats).forEach(([tool, count]) => {
            console.log(`     ${tool}: ${count}`);
          });
        }
      }
    }
    console.log('='.repeat(50));
  }

  getContext(): UltimateSessionContext | null {
    return this.currentContext;
  }

  clearSession(): void {
    try {
      if (fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile);
      }
      this.currentContext = null;
      console.log('🗑️  Session cleared');
    } catch (error) {
      console.log('⚠️  Clear failed:', error);
    }
  }
}

// ============================================================================
// ULTIMATE CLAUDE SDK - THE ONE SCRIPT TO RULE THEM ALL
// ============================================================================

class UltimateClaudeSDK {
  private permissionSystem = new UltimatePermissionSystem();
  private sessionManager = new UltimateSessionManager();

  async runUltimateQuery(
    prompt: string,
    options: {
      maxTurns?: number;
      contextStrategy?: 'auto' | 'new' | 'continue' | 'resume';
      sessionId?: string;
      mcpServers?: Record<string, any>;
      testMode?: boolean;
    } = {}
  ) {
    console.log('🚀 ULTIMATE CLAUDE CODE SDK');
    console.log('='.repeat(60));
    console.log('✨ Features Active:');
    console.log('   🔒 Enhanced permission system with risk analysis');
    console.log('   🧠 Context preservation and session management');
    console.log('   🔌 MCP integration with security warnings');
    console.log('   📊 Complete usage tracking and statistics');
    console.log('   🎵 Hooks integration (completion sounds)');
    console.log('   📁 Advanced file operation analysis');
    console.log('='.repeat(60));
    
    // Determine context strategy
    let contextStrategy = options.contextStrategy || 'auto';
    if (contextStrategy === 'auto') {
      contextStrategy = await this.sessionManager.askContextStrategy();
    }

    let conversationDone: (() => void) | undefined;
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    
    try {
      const messages: SDKMessage[] = [];
      const abortController = new AbortController();

      const conversationComplete = new Promise<void>(resolve => {
        conversationDone = resolve;
      });

      async function* createPromptStream(): AsyncIterableIterator<SDKUserMessage> {
        yield {
          type: 'user',
          message: { role: 'user', content: prompt },
          parent_tool_use_id: null,
          session_id: options.sessionId || `ultimate-${Date.now()}`
        };
        await conversationComplete;
      }

      // Configure ultimate SDK options
      const sdkOptions: any = {
        maxTurns: options.maxTurns || 8,
        mcpServers: options.mcpServers || {},
        canUseTool: async (toolName: string, parameters: Record<string, any>) => {
          if (!toolsUsed.includes(toolName)) {
            toolsUsed.push(toolName);
          }
          
          return await this.permissionSystem.getUserPermission(toolName, parameters);
        }
      };

      // Apply context strategy
      if (contextStrategy === 'continue') {
        sdkOptions.continue = true;
        console.log('🔄 Context: CONTINUE mode activated');
      } else if (contextStrategy === 'resume') {
        const context = this.sessionManager.getContext();
        sdkOptions.resume = options.sessionId || context?.sessionId;
        console.log(`📋 Context: RESUME mode (${sdkOptions.resume?.substring(0, 8)}...)`);
      } else {
        console.log('🆕 Context: NEW session mode');
      }

      console.log('\n📤 Ultimate query initiated...');
      console.log(`   🎯 Max turns: ${sdkOptions.maxTurns}`);
      console.log(`   🔌 MCP servers: ${Object.keys(sdkOptions.mcpServers || {}).length}`);
      console.log(`   📝 Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      console.log('\n' + '='.repeat(60));

      let finalSessionId: string | undefined;
      let finalCost = 0;

      for await (const message of query({
        prompt: createPromptStream(),
        abortController,
        options: sdkOptions
      })) {
        messages.push(message);
        
        if (message.type === 'assistant') {
          if (!options.testMode) {
            console.log('📥 Claude is processing...');
          }
        } else if (message.type === 'system') {
          finalSessionId = message.session_id;
          console.log(`🔧 System initialized (Session: ${finalSessionId?.substring(0, 8)}...)`);
          
          if (message.tools && message.tools.length > 0) {
            console.log(`   Available tools: ${message.tools.join(', ')}`);
          }
          
          if (message.mcp_servers && message.mcp_servers.length > 0) {
            console.log(`   🔌 MCP servers: ${message.mcp_servers.map(s => s.name).join(', ')}`);
          }
          
        } else if (message.type === 'result') {
          const duration = Date.now() - startTime;
          finalCost = message.total_cost_usd;
          
          if (conversationDone) conversationDone();
          
          // Save comprehensive session data
          if (finalSessionId && message.subtype === 'success') {
            const summary = typeof message.result === 'string' ? 
              message.result.substring(0, 200) + (message.result.length > 200 ? '...' : '') : 
              'Successful operation';
            
            this.sessionManager.saveSession(
              finalSessionId, 
              message.num_turns, 
              finalCost, 
              toolsUsed, 
              summary,
              this.permissionSystem.getStats()
            );
          }
          
          console.log('\n' + '='.repeat(60));
          console.log('🎯 ULTIMATE QUERY COMPLETE!');
          console.log('='.repeat(60));
          console.log(`${message.subtype === 'success' ? '✅ SUCCESS' : '❌ FAILED'}`);
          console.log(`⏱️  Duration: ${Math.round(duration/1000)} seconds`);
          console.log(`💰 Cost: $${finalCost.toFixed(6)}`);
          console.log(`🔄 Turns: ${message.num_turns}`);
          console.log(`📊 Messages: ${messages.length}`);
          console.log(`🆔 Session: ${finalSessionId?.substring(0, 8)}...`);
          console.log(`🔧 Tools used: ${toolsUsed.length} (${toolsUsed.join(', ') || 'None'})`);
          
          // Show permission statistics
          const stats = this.permissionSystem.getStats();
          console.log(`🛡️  Permissions: ${stats.autoAllow ? 'Auto-allow ON' : 'Interactive'}`);
          
          if (message.subtype === 'success') {
            console.log('\n🎵 Listen for completion sound (hooks)');
            console.log('💾 Session data saved for future context');
          }
          
          console.log('='.repeat(60));
          
          return {
            success: message.subtype === 'success',
            sessionId: finalSessionId,
            cost: finalCost,
            duration,
            toolsUsed,
            messages: messages.length,
            turns: message.num_turns,
            result: message.result
          };
        }
      }

      throw new Error('Query completed without result');
      
    } catch (error) {
      if (conversationDone) conversationDone();
      
      console.error('\n💥 ULTIMATE QUERY FAILED:', error);
      return {
        success: false,
        error: String(error),
        duration: Date.now() - startTime,
        toolsUsed,
        cost: 0
      };
    }
  }

  // Predefined test scenarios
  async runTestSuite() {
    console.log('🧪 ULTIMATE TEST SUITE');
    console.log('='.repeat(40));
    
    const tests = [
      {
        name: 'File Operations & Context',
        prompt: 'Create a file called "ultimate-test.md" with a comprehensive summary of Claude Code SDK capabilities. Include sections for permissions, context preservation, and MCP integration.',
        maxTurns: 4
      },
      {
        name: 'Multi-tool Workflow',
        prompt: 'List current directory, search for any markdown files, and create a project structure with directories for docs, tests, and examples.',
        maxTurns: 5
      },
      {
        name: 'Context Memory Test',
        prompt: 'Remember our previous interactions and add a section to the ultimate-test.md file about what we\'ve accomplished together.',
        maxTurns: 3,
        contextStrategy: 'continue' as const
      }
    ];

    for (const test of tests) {
      console.log(`\n🔵 Test: ${test.name}`);
      console.log('─'.repeat(30));
      
      const result = await this.runUltimateQuery(test.prompt, {
        maxTurns: test.maxTurns,
        contextStrategy: test.contextStrategy || 'auto',
        testMode: true
      });

      console.log(`Result: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      if (!result.success && result.error) {
        console.log(`Error: ${result.error}`);
      }
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Management commands
  showStats() {
    console.log('\n📊 ULTIMATE SDK STATISTICS');
    console.log('='.repeat(50));
    
    const permStats = this.permissionSystem.getStats();
    const session = this.sessionManager.getContext();
    
    console.log('🛡️  Permission System:');
    console.log(`   Auto-allow: ${permStats.autoAllow ? 'ON' : 'OFF'}`);
    console.log(`   Tools allowed: ${permStats.allowedTools.length}`);
    console.log(`   Tools denied: ${permStats.deniedTools.length}`);
    console.log(`   Usage tracking: ${Object.keys(permStats.usageStats).length} tools`);
    
    if (session) {
      console.log('\n🧠 Session Context:');
      console.log(`   Session ID: ${session.sessionId?.substring(0, 12)}...`);
      console.log(`   Messages: ${session.messageCount}`);
      console.log(`   Total cost: $${session.totalCost?.toFixed(6)}`);
      console.log(`   Tools used: ${session.toolsUsed?.length} different`);
      console.log(`   Last interaction: ${new Date(session.lastInteraction).toLocaleString()}`);
    }
    
    console.log('='.repeat(50));
  }

  clearAll() {
    this.permissionSystem.reset();
    this.sessionManager.clearSession();
    console.log('🗑️  All data cleared - fresh start ready');
  }

  async interactiveMode() {
    console.log('🎮 ULTIMATE INTERACTIVE MODE');
    console.log('Commands: query, test, stats, clear, help, exit');
    console.log('='.repeat(50));
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askCommand = (): Promise<string> => {
      return new Promise(resolve => {
        rl.question('\n🚀 Ultimate> ', resolve);
      });
    };

    try {
      while (true) {
        const command = await askCommand();
        const [cmd, ...args] = command.trim().split(' ');

        switch (cmd.toLowerCase()) {
          case 'query':
          case 'q':
            const prompt = args.join(' ') || 'Hello! Please demonstrate your capabilities.';
            await this.runUltimateQuery(prompt);
            break;
            
          case 'test':
          case 't':
            await this.runTestSuite();
            break;
            
          case 'stats':
          case 's':
            this.showStats();
            break;
            
          case 'clear':
          case 'c':
            this.clearAll();
            break;
            
          case 'help':
          case 'h':
            console.log('\n📋 ULTIMATE COMMANDS:');
            console.log('   query [prompt] - Run ultimate query');
            console.log('   test - Run comprehensive test suite');
            console.log('   stats - Show detailed statistics');
            console.log('   clear - Clear all data and reset');
            console.log('   help - Show this help');
            console.log('   exit - Exit interactive mode');
            break;
            
          case 'exit':
          case 'quit':
          case 'q':
            console.log('👋 Ultimate SDK session ended');
            rl.close();
            return;
            
          default:
            console.log(`❓ Unknown command: ${cmd}. Type 'help' for commands.`);
        }
      }
    } catch (error) {
      console.error('💥 Interactive mode error:', error);
    } finally {
      rl.close();
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const sdk = new UltimateClaudeSDK();

  console.log('👑 ULTIMATE CLAUDE CODE SDK - "ONE SCRIPT TO RULE THEM ALL"');
  console.log('='.repeat(80));
  console.log('🎯 The most comprehensive Claude Code SDK integration ever built!');
  console.log('='.repeat(80));

  if (args.length === 0) {
    // Interactive mode by default
    await sdk.interactiveMode();
  } else {
    const command = args[0].toLowerCase();
    
    switch (command) {
      case 'query':
      case 'q':
        const prompt = args.slice(1).join(' ');
        if (!prompt) {
          console.log('❌ Usage: bun run ultimate-claude-sdk.ts query "your prompt here"');
          process.exit(1);
        }
        await sdk.runUltimateQuery(prompt);
        break;
        
      case 'test':
      case 't':
        await sdk.runTestSuite();
        break;
        
      case 'demo':
      case 'd':
        await sdk.runUltimateQuery(
          'Hello! I\'m testing the Ultimate Claude Code SDK. Please create a welcome file, show me the current directory, and demonstrate the enhanced permission system by using multiple tools.',
          { maxTurns: 6 }
        );
        break;
        
      case 'stats':
      case 's':
        sdk.showStats();
        break;
        
      case 'clear':
      case 'c':
        sdk.clearAll();
        break;
        
      case 'interactive':
      case 'i':
        await sdk.interactiveMode();
        break;
        
      default:
        console.log('❓ Unknown command. Available commands:');
        console.log('   query "prompt" - Run single query');
        console.log('   test - Run test suite');
        console.log('   demo - Run demonstration');
        console.log('   stats - Show statistics');
        console.log('   clear - Clear all data');
        console.log('   interactive - Start interactive mode');
        console.log('   (no args) - Start interactive mode');
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Ultimate Claude SDK failed:', error);
    process.exit(1);
  });
}