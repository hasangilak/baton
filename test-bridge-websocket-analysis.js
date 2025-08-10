#!/usr/bin/env node

/**
 * WebSocket Bridge Message Analysis Script
 * 
 * Comprehensive test script to capture all possible Claude Code message types
 * via WebSocket connection to the bridge service. Analyzes message structure
 * and categorizes different types for optimal component rendering.
 * 
 * Usage: node test-bridge-websocket-analysis.js
 * 
 * Features:
 * - Connects to bridge WebSocket service
 * - Tests various message scenarios to trigger different message types
 * - Captures and categorizes all claude:stream responses
 * - Saves analysis results to JSON files
 * - Provides detailed message type breakdown
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

class WebSocketMessageAnalyzer {
  constructor(bridgeUrl = 'http://localhost:8080', backendUrl = 'http://localhost:3001') {
    this.bridgeUrl = bridgeUrl;
    this.backendUrl = backendUrl;
    this.bridgeSocket = null;
    this.backendSocket = null;
    
    // Message analysis storage
    this.capturedMessages = [];
    this.messageTypes = new Map();
    this.sdkMessageTypes = new Map();
    this.streamResponseTypes = new Map();
    
    // Test scenarios
    this.testScenarios = [
      {
        name: 'basic-chat',
        message: 'Hello, can you help me understand the current project structure?',
        description: 'Basic chat message to trigger assistant response'
      },
      {
        name: 'tool-usage',
        message: 'Please list all files in the current directory and show me the package.json contents',
        description: 'Tool usage to trigger LS, Read, and result messages'
      },
      {
        name: 'code-generation',
        message: 'Write a simple React component for displaying user information',
        description: 'Code generation to see tool usage and system messages'
      },
      {
        name: 'file-operations',
        message: 'Create a test file called example.md with some sample content',
        description: 'File operations to trigger Write tool and completion messages'
      },
      {
        name: 'error-scenario',
        message: 'Please read a file that does not exist: /nonexistent/file.txt',
        description: 'Error scenario to capture error message types'
      },
      {
        name: 'complex-task',
        message: 'Analyze the project structure, identify the main components, and suggest improvements',
        description: 'Complex task to trigger multiple tool uses and system messages'
      },
      {
        name: 'mcp-integration',
        message: 'Show me the current todos and create a new task in the project',
        description: 'MCP integration to test custom tool usage'
      }
    ];
    
    this.currentTestIndex = 0;
    this.testResults = new Map();
  }

  /**
   * Initialize WebSocket connections
   */
  async initialize() {
    console.log('🔌 Initializing WebSocket Message Analyzer...\n');
    
    // Connect to bridge service
    this.bridgeSocket = io(this.bridgeUrl, {
      transports: ['websocket'],
      timeout: 10000,
    });
    
    // Connect to backend service for additional data
    this.backendSocket = io(this.backendUrl, {
      transports: ['websocket'],
      timeout: 10000,
    });
    
    await this.setupEventHandlers();
    
    // Wait for connections
    await new Promise((resolve, reject) => {
      let connections = 0;
      const checkConnections = () => {
        connections++;
        if (connections === 2) resolve();
      };
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 15000);
      
      this.bridgeSocket.on('connect', () => {
        console.log('✅ Connected to bridge service');
        clearTimeout(timeout);
        checkConnections();
      });
      
      this.backendSocket.on('connect', () => {
        console.log('✅ Connected to backend service');
        clearTimeout(timeout);
        checkConnections();
      });
    });
  }

  /**
   * Setup event handlers for message capture
   */
  async setupEventHandlers() {
    // Bridge socket handlers
    this.bridgeSocket.on('claude:stream', (response) => {
      this.captureMessage('claude:stream', response);
    });
    
    this.bridgeSocket.on('claude:complete', (data) => {
      this.captureMessage('claude:complete', data);
    });
    
    this.bridgeSocket.on('claude:error', (data) => {
      this.captureMessage('claude:error', data);
    });
    
    this.bridgeSocket.on('claude:aborted', (data) => {
      this.captureMessage('claude:aborted', data);
    });
    
    this.bridgeSocket.on('permission:request', (data) => {
      this.captureMessage('permission:request', data);
      // Auto-approve permissions for testing
      this.bridgeSocket.emit('permission:response', {
        promptId: data.promptId,
        response: { decision: 'allow', patterns: data.patterns || [] }
      });
    });
    
    // Backend socket handlers
    this.backendSocket.on('message:created', (data) => {
      this.captureMessage('message:created', data);
    });
    
    this.backendSocket.on('message:updated', (data) => {
      this.captureMessage('message:updated', data);
    });
    
    // Error handlers
    this.bridgeSocket.on('connect_error', (error) => {
      console.error('❌ Bridge connection error:', error.message);
    });
    
    this.backendSocket.on('connect_error', (error) => {
      console.error('❌ Backend connection error:', error.message);
    });
  }

  /**
   * Capture and analyze messages
   */
  captureMessage(eventType, data) {
    const timestamp = Date.now();
    const messageEntry = {
      timestamp,
      eventType,
      data: JSON.parse(JSON.stringify(data)), // Deep clone
    };
    
    this.capturedMessages.push(messageEntry);
    
    // Analyze message structure
    this.analyzeMessageType(eventType, data);
    
    console.log(`📨 Captured ${eventType}:`, this.summarizeMessage(data));
  }

  /**
   * Analyze message types for categorization
   */
  analyzeMessageType(eventType, data) {
    // Count event types
    this.messageTypes.set(eventType, (this.messageTypes.get(eventType) || 0) + 1);
    
    // Analyze StreamResponse types
    if (eventType === 'claude:stream' && data.type) {
      this.streamResponseTypes.set(data.type, (this.streamResponseTypes.get(data.type) || 0) + 1);
      
      // Analyze SDK message types
      if (data.type === 'claude_json' && data.data) {
        const sdkType = data.data.type || 'unknown';
        this.sdkMessageTypes.set(sdkType, (this.sdkMessageTypes.get(sdkType) || 0) + 1);
        
        // Detailed SDK message analysis
        this.analyzeSDKMessage(data.data);
      }
    }
  }

  /**
   * Analyze SDK message structure
   */
  analyzeSDKMessage(sdkData) {
    const analysisKey = `${sdkData.type}-${sdkData.subtype || 'default'}`;
    
    if (!this.testResults.has(this.currentScenario)) {
      this.testResults.set(this.currentScenario, {
        messageTypes: new Set(),
        sdkTypes: new Set(),
        uniqueStructures: new Map()
      });
    }
    
    const result = this.testResults.get(this.currentScenario);
    result.sdkTypes.add(analysisKey);
    
    // Store unique message structures
    const structure = this.extractMessageStructure(sdkData);
    result.uniqueStructures.set(analysisKey, structure);
  }

  /**
   * Extract message structure for analysis
   */
  extractMessageStructure(data) {
    const structure = {
      type: data.type,
      hasMessage: !!data.message,
      hasSession: !!(data.session_id || data.sessionId),
      hasUsage: !!(data.message?.usage || data.usage),
      hasContent: !!(data.message?.content || data.content),
      hasResult: !!data.result,
      hasError: !!data.error,
      subtype: data.subtype,
      fields: Object.keys(data).sort()
    };
    
    if (data.message) {
      structure.messageFields = Object.keys(data.message).sort();
      if (data.message.content && Array.isArray(data.message.content)) {
        structure.contentTypes = data.message.content.map(c => c.type);
      }
    }
    
    return structure;
  }

  /**
   * Summarize message for logging
   */
  summarizeMessage(data) {
    if (data.type === 'claude_json' && data.data) {
      const sdk = data.data;
      return `${sdk.type}${sdk.subtype ? `-${sdk.subtype}` : ''} | ${sdk.message?.content?.[0]?.text?.substring(0, 50) || sdk.result?.substring(0, 50) || 'no content'}`;
    }
    return JSON.stringify(data).substring(0, 100) + '...';
  }

  /**
   * Run all test scenarios
   */
  async runAllTests() {
    console.log(`🧪 Starting comprehensive message analysis with ${this.testScenarios.length} scenarios...\n`);
    
    for (let i = 0; i < this.testScenarios.length; i++) {
      const scenario = this.testScenarios[i];
      this.currentScenario = scenario.name;
      this.currentTestIndex = i;
      
      console.log(`\n📋 Test ${i + 1}/${this.testScenarios.length}: ${scenario.name}`);
      console.log(`📝 Description: ${scenario.description}`);
      console.log(`💬 Message: "${scenario.message}"\n`);
      
      await this.runTestScenario(scenario);
      
      // Wait between tests to avoid overwhelming the system
      if (i < this.testScenarios.length - 1) {
        console.log('⏳ Waiting 3 seconds before next test...\n');
        await this.wait(3000);
      }
    }
    
    console.log('\n🎉 All test scenarios completed!');
    await this.generateAnalysisReport();
  }

  /**
   * Run a single test scenario
   */
  async runTestScenario(scenario) {
    const requestId = `test_${scenario.name}_${Date.now()}`;
    const conversationId = 'test-conversation-analysis';
    
    const request = {
      message: scenario.message,
      requestId,
      conversationId,
      allowedTools: ['Read', 'Write', 'Edit', 'LS', 'Glob', 'Grep', 'Bash', 'WebSearch'],
      workingDirectory: process.cwd(),
      permissionMode: 'default'
    };
    
    // Send request to bridge
    this.bridgeSocket.emit('claude:execute', request);
    
    // Wait for completion or timeout
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`⏰ Test scenario ${scenario.name} timed out after 60 seconds`);
        resolve();
      }, 60000);
      
      const completeHandler = (data) => {
        if (data.requestId === requestId) {
          console.log(`✅ Test scenario ${scenario.name} completed`);
          clearTimeout(timeout);
          this.bridgeSocket.off('claude:complete', completeHandler);
          this.bridgeSocket.off('claude:error', errorHandler);
          resolve();
        }
      };
      
      const errorHandler = (data) => {
        if (data.requestId === requestId) {
          console.log(`❌ Test scenario ${scenario.name} failed: ${data.error}`);
          clearTimeout(timeout);
          this.bridgeSocket.off('claude:complete', completeHandler);
          this.bridgeSocket.off('claude:error', errorHandler);
          resolve();
        }
      };
      
      this.bridgeSocket.on('claude:complete', completeHandler);
      this.bridgeSocket.on('claude:error', errorHandler);
    });
  }

  /**
   * Generate comprehensive analysis report
   */
  async generateAnalysisReport() {
    console.log('\n📊 Generating comprehensive message analysis report...');
    
    const report = {
      summary: {
        totalMessages: this.capturedMessages.length,
        testScenarios: this.testScenarios.length,
        analysisTimestamp: new Date().toISOString(),
        testDuration: `${(Date.now() - this.startTime) / 1000}s`
      },
      messageTypeBreakdown: Object.fromEntries(this.messageTypes),
      streamResponseTypes: Object.fromEntries(this.streamResponseTypes),
      sdkMessageTypes: Object.fromEntries(this.sdkMessageTypes),
      testResults: {},
      componentMappingRecommendations: this.generateComponentRecommendations(),
      uniqueMessageStructures: this.extractUniqueStructures(),
      rawMessages: this.capturedMessages
    };
    
    // Convert test results for JSON serialization
    for (const [scenario, result] of this.testResults.entries()) {
      report.testResults[scenario] = {
        messageTypes: Array.from(result.messageTypes),
        sdkTypes: Array.from(result.sdkTypes),
        uniqueStructures: Object.fromEntries(result.uniqueStructures)
      };
    }
    
    // Save reports
    const reportsDir = path.join(process.cwd(), 'websocket-analysis');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `message-analysis-${timestamp}.json`);
    const summaryPath = path.join(reportsDir, `analysis-summary-${timestamp}.txt`);
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(summaryPath, this.generateTextSummary(report));
    
    console.log(`📄 Full report saved to: ${reportPath}`);
    console.log(`📄 Summary saved to: ${summaryPath}`);
    
    // Print summary to console
    console.log('\n' + this.generateTextSummary(report));
  }

  /**
   * Generate component mapping recommendations
   */
  generateComponentRecommendations() {
    return {
      'claude_json-assistant': {
        component: 'AssistantMessage',
        props: ['message', 'isStreaming', 'showMetadata'],
        notes: 'Handle streaming content, usage data, model info'
      },
      'claude_json-system': {
        component: 'SystemMessage',
        props: ['message', 'subtype', 'data'],
        notes: 'Show initialization, config, tool status'
      },
      'claude_json-result': {
        component: 'ResultMessage',
        props: ['message', 'usage', 'cost', 'duration'],
        notes: 'Display execution results, performance metrics'
      },
      'claude_json-user': {
        component: 'UserMessage',
        props: ['message', 'attachments'],
        notes: 'User input with attachment support'
      },
      'error': {
        component: 'ErrorMessage',
        props: ['error', 'requestId', 'timestamp'],
        notes: 'Error display with retry capability'
      },
      'done': {
        component: 'CompletionMessage',
        props: ['sessionId', 'timestamp'],
        notes: 'Session completion indicator'
      },
      'aborted': {
        component: 'AbortMessage',
        props: ['reason', 'timestamp'],
        notes: 'Abort notification with reason'
      }
    };
  }

  /**
   * Extract unique message structures
   */
  extractUniqueStructures() {
    const structures = new Map();
    
    for (const message of this.capturedMessages) {
      if (message.eventType === 'claude:stream' && message.data.type === 'claude_json') {
        const key = `${message.data.data.type}-${message.data.data.subtype || 'default'}`;
        if (!structures.has(key)) {
          structures.set(key, this.extractMessageStructure(message.data.data));
        }
      }
    }
    
    return Object.fromEntries(structures);
  }

  /**
   * Generate text summary
   */
  generateTextSummary(report) {
    return `
WebSocket Message Analysis Report
================================

📊 Summary:
- Total Messages Captured: ${report.summary.totalMessages}
- Test Scenarios: ${report.summary.testScenarios}
- Analysis Duration: ${report.summary.testDuration}

📨 Message Type Breakdown:
${Object.entries(report.messageTypeBreakdown)
  .map(([type, count]) => `  ${type}: ${count} messages`)
  .join('\n')}

🔄 StreamResponse Types:
${Object.entries(report.streamResponseTypes)
  .map(([type, count]) => `  ${type}: ${count} responses`)
  .join('\n')}

🤖 SDK Message Types:
${Object.entries(report.sdkMessageTypes)
  .map(([type, count]) => `  ${type}: ${count} messages`)
  .join('\n')}

🧩 Component Recommendations:
${Object.entries(report.componentMappingRecommendations)
  .map(([type, rec]) => `  ${type} → ${rec.component} (${rec.notes})`)
  .join('\n')}

📋 Test Scenario Results:
${Object.entries(report.testResults)
  .map(([scenario, result]) => `  ${scenario}: ${result.sdkTypes.length} unique message types`)
  .join('\n')}

🏗️ Unique Message Structures: ${Object.keys(report.uniqueMessageStructures).length}

Analysis completed at: ${report.summary.analysisTimestamp}
`;
  }

  /**
   * Utility method to wait
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup connections
   */
  async cleanup() {
    console.log('\n🧹 Cleaning up connections...');
    
    if (this.bridgeSocket) {
      this.bridgeSocket.disconnect();
    }
    
    if (this.backendSocket) {
      this.backendSocket.disconnect();
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const analyzer = new WebSocketMessageAnalyzer();
  
  try {
    analyzer.startTime = Date.now();
    
    console.log('🚀 WebSocket Bridge Message Analysis Starting...');
    console.log('📡 Bridge URL:', analyzer.bridgeUrl);
    console.log('🔗 Backend URL:', analyzer.backendUrl);
    console.log('');
    
    await analyzer.initialize();
    await analyzer.runAllTests();
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await analyzer.cleanup();
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n⏹️  Analysis interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Analysis terminated');
  process.exit(0);
});

// Run the analysis
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WebSocketMessageAnalyzer };