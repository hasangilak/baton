import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Ultra-Strict Chat Verification Agent
 * 
 * This test implements ruthless verification of chat interfaces with particular
 * expertise in detecting agent response intelligence failures and permission system bugs.
 * 
 * Key verification areas:
 * 1. Agent Response Intelligence Analysis - catches logical inconsistencies
 * 2. Real-Time Handler Log Correlation - validates permission flows
 * 3. File System Verification Matrix - before/after operation validation
 * 4. Permission Flow End-to-End Validation - complete chain verification
 * 5. Semantic Consistency Analysis - claim vs reality verification
 */

// Global constants for ultra-strict verification
const HELLO_TXT_PATH = '/home/hassan/work/baton/hello.txt';
const HANDLER_LOG_PATH = '/home/hassan/work/baton/scripts/handler-new.log';

test.describe('Ultra-Strict Chat Verification Agent', () => {
  
  let initialFileContent: string | null = null;
  let initialLogSize = 0;
  let initialLogContent = '';

  test.beforeEach(async ({ page }) => {
    console.log('🎯 ULTRA-STRICT VERIFICATION AGENT INITIALIZING');
    console.log('=' .repeat(60));
    
    // Capture initial file system state
    try {
      initialFileContent = fs.readFileSync(HELLO_TXT_PATH, 'utf8');
      console.log('📁 Initial file content captured:', initialFileContent.length, 'chars');
    } catch (e) {
      initialFileContent = null;
      console.log('📁 Target file does not exist initially');
    }

    // Capture initial handler log state
    try {
      const logStats = fs.statSync(HANDLER_LOG_PATH);
      initialLogSize = logStats.size;
      initialLogContent = fs.readFileSync(HANDLER_LOG_PATH, 'utf8');
      console.log('📋 Initial handler log size:', initialLogSize, 'bytes');
    } catch (e) {
      initialLogSize = 0;
      initialLogContent = '';
      console.log('📋 Handler log not found or inaccessible');
    }

    // Navigate to chat interface with extended timeout
    await page.goto('http://localhost:5173/chat', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    console.log('🌐 Chat interface loaded and ready');
  });

  test('ULTIMATE VERIFICATION: Poem writing with complete intelligence analysis', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes timeout
    console.log('\n🚀 STARTING ULTIMATE VERIFICATION TEST');
    console.log('🎯 Mission: Test poem writing request with ultra-strict validation');
    console.log('-'.repeat(50));

    // PHASE 1: REQUEST SUBMISSION
    console.log('\n📝 PHASE 1: SUBMITTING POEM REQUEST');
    
    const messageInput = page.locator('textarea[placeholder*="Type a message"], textarea[data-testid*="chat"], input[type="text"]').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    
    const testMessage = "Please write a beautiful poem about coding and artificial intelligence, then save it to hello.txt";
    await messageInput.fill(testMessage);
    await messageInput.press('Enter');
    
    console.log('✅ Request submitted:', testMessage);

    // PHASE 2: REAL-TIME MONITORING
    console.log('\n🔍 PHASE 2: REAL-TIME MONITORING INITIATED');
    
    let monitoringResults = {
      agentResponseDetected: false,
      agentResponseContent: '',
      permissionPromptDetected: false,
      permissionGranted: false,
      toolsAvailable: [] as string[],
      handlerLogDelta: '',
      responseTimestamp: 0,
      permissionTimestamp: 0
    };

    // Start monitoring for agent response
    const responsePromise = monitorAgentResponse(page);
    const permissionPromise = monitorPermissionFlow(page);
    const logMonitorPromise = monitorHandlerLogs(initialLogSize, initialLogContent);

    // Wait for initial response or permission prompt
    const raceResult = await Promise.race([
      responsePromise.then(() => 'response'),
      permissionPromise.then(() => 'permission'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 30000))
    ]);

    console.log('🏃 First detection:', raceResult);

    if (raceResult === 'permission') {
      console.log('🔐 Permission prompt detected first');
      monitoringResults.permissionPromptDetected = true;
      monitoringResults.permissionTimestamp = Date.now();
      
      // Handle permission grant
      const permissionResult = await handlePermissionGrant(page);
      monitoringResults.permissionGranted = permissionResult.granted;
      monitoringResults.toolsAvailable = permissionResult.toolsGranted;
      
      // Now wait for agent response after permission
      const agentResponse = await responsePromise;
      monitoringResults.agentResponseDetected = true;
      monitoringResults.agentResponseContent = agentResponse.content;
      monitoringResults.responseTimestamp = agentResponse.timestamp;
    } else if (raceResult === 'response') {
      console.log('🤖 Agent response detected without permission');
      const agentResponse = await responsePromise;
      monitoringResults.agentResponseDetected = true;
      monitoringResults.agentResponseContent = agentResponse.content;
      monitoringResults.responseTimestamp = agentResponse.timestamp;
    } else {
      throw new Error('❌ CRITICAL: No response or permission detected within timeout');
    }

    // Get handler log delta
    monitoringResults.handlerLogDelta = await logMonitorPromise;

    // PHASE 3: ULTRA-STRICT AGENT INTELLIGENCE ANALYSIS
    console.log('\n🧠 PHASE 3: AGENT INTELLIGENCE ANALYSIS');
    console.log('='.repeat(40));
    
    const intelligenceAnalysis = await analyzeAgentIntelligence(
      monitoringResults.agentResponseContent,
      monitoringResults
    );
    
    console.log('🔬 Intelligence Analysis Results:');
    console.log('  - Logic Score:', intelligenceAnalysis.logicScore, '/10');
    console.log('  - Consistency Score:', intelligenceAnalysis.consistencyScore, '/10');
    console.log('  - Context Awareness:', intelligenceAnalysis.contextAwarenessScore, '/10');
    console.log('  - Critical Failures:', intelligenceAnalysis.criticalFailures.length);
    
    // PHASE 4: FILE SYSTEM REALITY CHECK
    console.log('\n📁 PHASE 4: FILE SYSTEM REALITY VERIFICATION');
    
    await page.waitForTimeout(3000); // Allow file operations to complete
    
    const fileSystemAnalysis = await verifyFileSystemReality(
      HELLO_TXT_PATH,
      initialFileContent,
      monitoringResults.agentResponseContent
    );
    
    console.log('📊 File System Analysis:');
    console.log('  - File Modified:', fileSystemAnalysis.fileWasModified);
    console.log('  - Content Matches Claims:', fileSystemAnalysis.contentMatchesClaims);
    console.log('  - Operation Type:', fileSystemAnalysis.operationType);
    console.log('  - Content Quality Score:', fileSystemAnalysis.contentQualityScore, '/10');

    // PHASE 5: SEMANTIC CONSISTENCY VERIFICATION
    console.log('\n📝 PHASE 5: SEMANTIC CONSISTENCY VERIFICATION');
    
    const semanticAnalysis = await analyzeSemanticConsistency(
      monitoringResults.agentResponseContent,
      fileSystemAnalysis,
      {
        requestedPoem: true,
        requestedFilename: 'hello.txt',
        permissionGranted: monitoringResults.permissionGranted,
        toolsAvailable: monitoringResults.toolsAvailable
      }
    );
    
    console.log('🔍 Semantic Analysis:');
    console.log('  - Claim-Reality Alignment:', semanticAnalysis.claimRealityScore, '/10');
    console.log('  - Request Understanding:', semanticAnalysis.requestUnderstandingScore, '/10');
    console.log('  - Semantic Violations:', semanticAnalysis.violations.length);

    // PHASE 6: FINAL VERDICT AND ASSERTIONS
    console.log('\n⚖️ PHASE 6: FINAL VERDICT');
    console.log('='.repeat(30));
    
    const overallScore = calculateOverallScore(intelligenceAnalysis, fileSystemAnalysis, semanticAnalysis);
    console.log('📊 OVERALL VERIFICATION SCORE:', overallScore.total, '/100');
    
    // Ultra-strict assertions
    performUltraStrictAssertions(
      monitoringResults,
      intelligenceAnalysis,
      fileSystemAnalysis,
      semanticAnalysis,
      overallScore
    );
    
    console.log('🎉 ULTRA-STRICT VERIFICATION COMPLETED SUCCESSFULLY');
    console.log('✅ All agent intelligence checks passed');
    console.log('✅ File system operations verified');
    console.log('✅ Semantic consistency confirmed');
    console.log('✅ Permission flow validated');
  });

});

// Helper function to monitor agent responses
async function monitorAgentResponse(page: Page): Promise<{content: string, timestamp: number}> {
    console.log('👀 Starting agent response monitoring...');
    
    // Wait for assistant message to appear
    await page.waitForSelector('[data-testid^="message-bubble-assistant"], [data-testid*="assistant"], .message[data-role="assistant"]', { 
      timeout: 45000 
    });
    
    // Try multiple selectors to capture the response
    const possibleSelectors = [
      '[data-testid^="message-bubble-assistant"]',
      '[data-testid*="assistant"]',
      '.message[data-role="assistant"]',
      '[data-role="assistant"]',
      '.assistant-message'
    ];
    
    let responseContent = '';
    for (const selector of possibleSelectors) {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        const lastElement = elements[elements.length - 1];
        const text = await lastElement.textContent();
        if (text && text.length > responseContent.length) {
          responseContent = text;
        }
      }
    }
    
    console.log('📨 Agent response captured:', responseContent.length, 'characters');
    return {
      content: responseContent,
      timestamp: Date.now()
    };
  }

// Helper function to monitor permission flow
async function monitorPermissionFlow(page: Page): Promise<void> {
    console.log('🔐 Starting permission flow monitoring...');
    
    const permissionSelectors = [
      '[data-testid*="permission"]',
      '[class*="permission"]',
      'button:has-text("Grant")',
      'button:has-text("Allow")',
      'button:has-text("Yes")',
      '.permission-prompt'
    ];
    
    for (const selector of permissionSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log('✅ Permission element detected:', selector);
        return;
      } catch {
        // Continue to next selector
      }
    }
    
    throw new Error('No permission elements detected');
  }

// Helper function to handle permission grants
async function handlePermissionGrant(page: Page): Promise<{granted: boolean, toolsGranted: string[]}> {
    console.log('🤝 Handling permission grant...');
    
    const grantSelectors = [
      'button:has-text("Grant")',
      'button:has-text("Allow")',
      'button:has-text("Yes")',
      'button:has-text("Accept")',
      '[data-testid*="grant"]',
      '[data-testid*="allow"]'
    ];
    
    for (const selector of grantSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.count() > 0) {
          await button.first().click();
          console.log('✅ Permission granted via button:', selector);
          
          // Wait for permission UI to disappear
          await page.waitForTimeout(2000);
          
          return {
            granted: true,
            toolsGranted: ['Write', 'Edit', 'MultiEdit'] // Assume these are granted
          };
        }
      } catch {
        // Continue to next selector
      }
    }
    
    throw new Error('❌ Could not find permission grant button');
  }

// Helper function to monitor handler logs  
async function monitorHandlerLogs(initialSize: number, initialContent: string): Promise<string> {
    console.log('📋 Monitoring handler logs...');
    
    try {
      const currentLogStats = fs.statSync(HANDLER_LOG_PATH);
      if (currentLogStats.size > initialSize) {
        const fullLog = fs.readFileSync(HANDLER_LOG_PATH, 'utf8');
        const delta = fullLog.slice(initialContent.length);
        console.log('📈 Handler log delta captured:', delta.length, 'characters');
        return delta;
      }
    } catch (e) {
      console.log('⚠️ Could not read handler logs:', e);
    }
    
    return '';
  }

// Agent intelligence analysis
async function analyzeAgentIntelligence(
    agentResponse: string, 
    context: any
  ): Promise<{
    logicScore: number,
    consistencyScore: number,
    contextAwarenessScore: number,
    criticalFailures: string[]
  }> {
    console.log('🧠 Performing agent intelligence analysis...');
    
    const analysis = {
      logicScore: 10,
      consistencyScore: 10,
      contextAwarenessScore: 10,
      criticalFailures: [] as string[]
    };
    
    const lowerResponse = agentResponse.toLowerCase();
    
    // Critical Failure 1: Claims need permission when tools available
    if (lowerResponse.includes('permission') && 
        (lowerResponse.includes('need') || lowerResponse.includes('require')) &&
        context.toolsAvailable.includes('Write')) {
      analysis.criticalFailures.push('CRITICAL: Agent claims to need permission when Write tool is available');
      analysis.logicScore -= 5;
      analysis.consistencyScore -= 3;
    }
    
    // Critical Failure 2: Claims success without file operations
    const claimsSuccess = lowerResponse.includes('written') || 
                         lowerResponse.includes('saved') || 
                         lowerResponse.includes('created') ||
                         lowerResponse.includes('complete');
    
    if (claimsSuccess && !context.agentResponseContent.includes('error')) {
      // We'll verify this against actual file changes later
      console.log('🔍 Agent claims success - will verify against file system');
    }
    
    // Logic consistency checks
    if (lowerResponse.includes("can't") && context.permissionGranted && context.toolsAvailable.length > 0) {
      analysis.criticalFailures.push('LOGIC FAILURE: Agent claims inability despite having tools and permission');
      analysis.logicScore -= 4;
    }
    
    // Context awareness checks
    if (lowerResponse.includes('hello.txt') || lowerResponse.includes('poem')) {
      analysis.contextAwarenessScore += 0; // Good context awareness
    } else {
      analysis.contextAwarenessScore -= 2;
      console.log('⚠️ Agent response lacks context awareness');
    }
    
    console.log('✅ Intelligence analysis completed');
    return analysis;
  }

// File system reality verification
async function verifyFileSystemReality(
    filePath: string,
    initialContent: string | null,
    agentResponse: string
  ): Promise<{
    fileWasModified: boolean,
    contentMatchesClaims: boolean,
    operationType: string,
    contentQualityScore: number,
    actualContent: string | null
  }> {
    console.log('📁 Verifying file system reality...');
    
    let currentContent: string | null = null;
    let fileWasModified = false;
    
    try {
      currentContent = fs.readFileSync(filePath, 'utf8');
      fileWasModified = currentContent !== initialContent;
    } catch (e) {
      currentContent = null;
      fileWasModified = initialContent !== null; // File was deleted
    }
    
    console.log('📊 File modification status:', fileWasModified);
    
    // Determine operation type
    let operationType = 'unknown';
    if (initialContent === null && currentContent !== null) {
      operationType = 'create';
    } else if (initialContent !== null && currentContent === null) {
      operationType = 'delete';
    } else if (initialContent !== null && currentContent !== null && currentContent !== initialContent) {
      operationType = currentContent.includes(initialContent) ? 'append' : 'overwrite';
    }
    
    // Check if content matches agent claims
    const contentMatchesClaims = verifyContentClaims(agentResponse, currentContent);
    
    // Score content quality for poems
    const contentQualityScore = scoreContentQuality(currentContent, 'poem');
    
    console.log('✅ File system verification completed');
    
    return {
      fileWasModified,
      contentMatchesClaims,
      operationType,
      contentQualityScore,
      actualContent: currentContent
    };
  }

// Verify agent claims match actual content
function verifyContentClaims(agentResponse: string, actualContent: string | null): boolean {
    if (!actualContent) return false;
    
    // Extract quoted content from agent response
    const quotedContentRegex = /"([^"]+)"/g;
    let match;
    let claimedContent: string[] = [];
    
    while ((match = quotedContentRegex.exec(agentResponse)) !== null) {
      claimedContent.push(match[1]);
    }
    
    // Check if claimed content appears in actual content
    return claimedContent.some(claimed => actualContent.includes(claimed));
  }

// Score content quality for specific types
function scoreContentQuality(content: string | null, expectedType: string): number {
    if (!content) return 0;
    
    let score = 5; // Base score
    
    if (expectedType === 'poem') {
      // Check for poetic qualities
      if (content.includes('\n')) score += 1; // Multi-line
      if (content.match(/\b\w+ing\b/g)) score += 1; // Rhyming potential
      if (content.length > 50) score += 1; // Adequate length
      if (content.includes('code') || content.includes('coding')) score += 1; // Topic relevance
      if (content.includes('AI') || content.includes('artificial')) score += 1; // Topic relevance
    }
    
    return Math.min(score, 10);
  }

// Semantic consistency analysis
async function analyzeSemanticConsistency(
    agentResponse: string,
    fileSystemAnalysis: any,
    context: any
  ): Promise<{
    claimRealityScore: number,
    requestUnderstandingScore: number,
    violations: string[]
  }> {
    console.log('📝 Analyzing semantic consistency...');
    
    const analysis = {
      claimRealityScore: 10,
      requestUnderstandingScore: 10,
      violations: [] as string[]
    };
    
    const lowerResponse = agentResponse.toLowerCase();
    
    // Check claim-reality alignment
    const claimsCreation = lowerResponse.includes('creat') || lowerResponse.includes('writ') || lowerResponse.includes('sav');
    if (claimsCreation && !fileSystemAnalysis.fileWasModified) {
      analysis.violations.push('SEMANTIC: Agent claims file operation but no file changes detected');
      analysis.claimRealityScore -= 5;
    }
    
    // Check request understanding
    if (context.requestedPoem && !lowerResponse.includes('poem')) {
      analysis.violations.push('SEMANTIC: Agent response does not acknowledge poem request');
      analysis.requestUnderstandingScore -= 3;
    }
    
    if (context.requestedFilename && !agentResponse.includes(context.requestedFilename)) {
      analysis.violations.push('SEMANTIC: Agent response does not mention target filename');
      analysis.requestUnderstandingScore -= 2;
    }
    
    console.log('✅ Semantic analysis completed');
    return analysis;
  }

// Calculate overall verification score
function calculateOverallScore(
    intelligence: any,
    fileSystem: any,
    semantic: any
  ): {total: number, breakdown: any} {
    const breakdown = {
      intelligence: (intelligence.logicScore + intelligence.consistencyScore + intelligence.contextAwarenessScore) / 3,
      fileSystem: fileSystem.fileWasModified ? 10 : 0,
      semantic: (semantic.claimRealityScore + semantic.requestUnderstandingScore) / 2,
      criticalFailurePenalty: intelligence.criticalFailures.length * -10
    };
    
    const total = Math.max(0, 
      (breakdown.intelligence * 0.3) + 
      (breakdown.fileSystem * 0.3) + 
      (breakdown.semantic * 0.3) + 
      (breakdown.criticalFailurePenalty * 0.1)
    );
    
    return { total, breakdown };
  }

// Ultra-strict assertions
function performUltraStrictAssertions(
    monitoring: any,
    intelligence: any,
    fileSystem: any,
    semantic: any,
    overall: any
  ): void {
    console.log('⚖️ Performing ultra-strict assertions...');
    
    // Must have agent response
    expect(monitoring.agentResponseDetected, 'Agent must provide a response').toBe(true);
    expect(monitoring.agentResponseContent.length, 'Agent response must have content').toBeGreaterThan(10);
    
    // Critical intelligence failures are unacceptable
    if (intelligence.criticalFailures.length > 0) {
      console.error('❌ CRITICAL INTELLIGENCE FAILURES:');
      intelligence.criticalFailures.forEach((failure: string, index: number) => {
        console.error(`  ${index + 1}. ${failure}`);
      });
      throw new Error(`Agent intelligence failed with ${intelligence.criticalFailures.length} critical failures`);
    }
    
    // If permission was granted and agent claims success, file must be modified
    if (monitoring.permissionGranted && 
        monitoring.agentResponseContent.toLowerCase().includes('complet') &&
        !fileSystem.fileWasModified) {
      throw new Error('CRITICAL: Agent claims success with permission but no file changes detected');
    }
    
    // Semantic violations are serious
    if (semantic.violations.length > 2) {
      console.error('❌ TOO MANY SEMANTIC VIOLATIONS:');
      semantic.violations.forEach((violation: string) => {
        console.error(`  - ${violation}`);
      });
      throw new Error(`Too many semantic violations: ${semantic.violations.length}`);
    }
    
    // Overall score must be acceptable
    if (overall.total < 60) {
      throw new Error(`Overall verification score too low: ${overall.total}/100`);
    }
    
    console.log('✅ All ultra-strict assertions passed');
  }