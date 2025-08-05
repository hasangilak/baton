#!/usr/bin/env node

/**
 * Comprehensive Claude Code Hooks Test Suite
 * 
 * Validates all aspects of the Claude Code integration including:
 * - Hook script functionality
 * - Plan capture API
 * - Error handling
 * - Edge cases
 * - Database storage
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');

// Test configuration
const TEST_CONFIG = {
    projectRoot: path.dirname(__dirname),
    hookScript: path.join(__dirname, 'capture-plan.js'),
    testTimeout: 30000,
    apiUrl: process.env.BATON_API_URL || 'http://localhost:3001',
    projectId: null, // Will be auto-detected
    verbose: process.argv.includes('--verbose')
};

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bright: '\x1b[1m'
};

// Test results tracking
let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
};

/**
 * Logging utilities
 */
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const colorMap = {
        SUCCESS: colors.green,
        ERROR: colors.red,
        WARNING: colors.yellow,
        INFO: colors.blue,
        DEBUG: colors.magenta
    };

    const color = colorMap[level] || colors.reset;
    const emoji = {
        SUCCESS: '✅',
        ERROR: '❌',
        WARNING: '⚠️',
        INFO: 'ℹ️',
        DEBUG: '🔍'
    }[level] || '';

    console.log(`${color}${emoji} [${timestamp}] ${message}${colors.reset}`);
    
    if (data && (TEST_CONFIG.verbose || level === 'ERROR')) {
        console.log(`${colors.cyan}   Data: ${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
}

/**
 * Execute a command and return result
 */
function executeCommand(command, options = {}) {
    return new Promise((resolve) => {
        const [cmd, ...args] = command.split(' ');
        const proc = spawn(cmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: options.cwd || TEST_CONFIG.projectRoot,
            env: { ...process.env, ...options.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());

        proc.on('close', (code) => {
            resolve({
                success: code === 0,
                code: code,
                stdout: stdout,
                stderr: stderr
            });
        });

        proc.on('error', (error) => {
            resolve({
                success: false,
                error: error.message,
                stdout: stdout,
                stderr: stderr
            });
        });

        if (options.stdin) {
            proc.stdin.write(options.stdin);
            proc.stdin.end();
        }

        // Set timeout
        setTimeout(() => {
            proc.kill();
            resolve({
                success: false,
                error: 'Test timeout',
                stdout: stdout,
                stderr: stderr
            });
        }, TEST_CONFIG.testTimeout);
    });
}

/**
 * Run a single test
 */
async function runTest(testName, testFunction) {
    testResults.total++;
    log('INFO', `Running test: ${testName}`);
    
    try {
        const result = await testFunction();
        if (result.success) {
            testResults.passed++;
            log('SUCCESS', `✓ ${testName}`);
            testResults.details.push({ name: testName, status: 'PASSED', message: result.message });
        } else {
            testResults.failed++;
            log('ERROR', `✗ ${testName}`, result);
            testResults.details.push({ name: testName, status: 'FAILED', error: result.error || result.message });
        }
        return result;
    } catch (error) {
        testResults.failed++;
        log('ERROR', `✗ ${testName} (Exception)`, error);
        testResults.details.push({ name: testName, status: 'CRASHED', error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Load project context
 */
async function loadProjectContext() {
    const batonProjectPath = path.join(TEST_CONFIG.projectRoot, '.baton-project');
    
    if (!fs.existsSync(batonProjectPath)) {
        throw new Error('.baton-project file not found');
    }
    
    const config = JSON.parse(fs.readFileSync(batonProjectPath, 'utf8'));
    TEST_CONFIG.projectId = config.projectId;
    log('INFO', `Loaded project context: ${config.projectName} (${config.projectId})`);
}

/**
 * Test hook script exists and is executable
 */
async function testHookScriptSetup() {
    return new Promise((resolve) => {
        if (!fs.existsSync(TEST_CONFIG.hookScript)) {
            resolve({ success: false, error: 'Hook script not found' });
            return;
        }
        
        const stats = fs.statSync(TEST_CONFIG.hookScript);
        if (!(stats.mode & parseInt('100', 8))) {
            resolve({ success: false, error: 'Hook script not executable' });
            return;
        }
        
        resolve({ success: true, message: 'Hook script exists and is executable' });
    });
}

/**
 * Test basic plan capture
 */
async function testBasicPlanCapture() {
    const testPlan = {
        tool_name: 'ExitPlanMode',
        tool_input: {
            plan: '# Automated Test Plan\\n\\nThis is a test plan generated by the automated test suite.\\n\\n## Purpose\\nVerify basic plan capture functionality works correctly.'
        },
        session_id: `test-${Date.now()}`,
        cwd: TEST_CONFIG.projectRoot,
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { DEBUG_PLAN_CAPTURE: 'false' }
    });
    
    if (result.success && result.stderr.includes('Plan capture completed successfully')) {
        return { success: true, message: 'Basic plan capture successful' };
    } else {
        return { success: false, error: result.stderr || result.error };
    }
}

/**
 * Test Unicode and special characters
 */
async function testUnicodeHandling() {
    const testPlan = {
        tool_name: 'ExitPlanMode',
        tool_input: {
            plan: '# Unicode Test 🚀\\n\\n## Special Characters\\n- Emoji: 🎯 ✅ ❌\\n- Accents: café, naïve\\n- Math: ∑ ∞ ≠\\n- Chinese: 中文测试\\n- Russian: Русский текст\\n- Arabic: العربية'
        },
        session_id: `unicode-test-${Date.now()}`,
        cwd: TEST_CONFIG.projectRoot,
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { DEBUG_PLAN_CAPTURE: 'false' }
    });
    
    if (result.success && result.stderr.includes('Plan capture completed successfully')) {
        return { success: true, message: 'Unicode handling successful' };
    } else {
        return { success: false, error: result.stderr || result.error };
    }
}

/**
 * Test error handling - invalid project
 */
async function testInvalidProjectHandling() {
    const testPlan = {
        tool_name: 'ExitPlanMode',
        tool_input: {
            plan: '# Test Plan\\nThis should fail due to invalid project context'
        },
        session_id: `invalid-project-${Date.now()}`,
        cwd: '/tmp/nonexistent',
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { DEBUG_PLAN_CAPTURE: 'false' }
    });
    
    // This should fail gracefully
    if (!result.success && result.stderr.includes('No .baton-project file found')) {
        return { success: true, message: 'Invalid project handled correctly' };
    } else {
        return { success: false, error: 'Should have failed with project error' };
    }
}

/**
 * Test empty plan handling
 */
async function testEmptyPlanHandling() {
    const testPlan = {
        tool_name: 'ExitPlanMode',
        tool_input: {
            plan: ''
        },
        session_id: `empty-plan-${Date.now()}`,
        cwd: TEST_CONFIG.projectRoot,
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { DEBUG_PLAN_CAPTURE: 'false' }
    });
    
    // Should fail gracefully
    if (!result.success && result.stderr.includes('No plan content found')) {
        return { success: true, message: 'Empty plan handled correctly' };
    } else {
        return { success: false, error: 'Should have failed with empty plan error' };
    }
}

/**
 * Test non-ExitPlanMode tool filtering
 */
async function testToolFiltering() {
    const testPlan = {
        tool_name: 'SomeOtherTool',
        tool_input: {
            data: 'This should be ignored'
        },
        session_id: `filter-test-${Date.now()}`,
        cwd: TEST_CONFIG.projectRoot,
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { DEBUG_PLAN_CAPTURE: 'false' }
    });
    
    // Should ignore non-ExitPlanMode tools
    if (result.success && result.stderr.includes('Ignoring non-ExitPlanMode tool')) {
        return { success: true, message: 'Tool filtering works correctly' };
    } else {
        return { success: false, error: 'Should have ignored non-ExitPlanMode tool' };
    }
}

/**
 * Test API connectivity failure
 */
async function testAPIFailureHandling() {
    const testPlan = {
        tool_name: 'ExitPlanMode',
        tool_input: {
            plan: '# Test Plan\\nThis should fail due to wrong API URL'
        },
        session_id: `api-fail-${Date.now()}`,
        cwd: TEST_CONFIG.projectRoot,
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { 
            DEBUG_PLAN_CAPTURE: 'false',
            BATON_API_URL: 'http://localhost:9999'
        }
    });
    
    // Should fail with connection error
    if (!result.success && result.stderr.includes('ECONNREFUSED')) {
        return { success: true, message: 'API failure handled correctly' };
    } else {
        return { success: false, error: 'Should have failed with connection error' };
    }
}

/**
 * Test large plan handling
 */
async function testLargePlanHandling() {
    const largePlan = '# Large Test Plan\\n\\n' + 'This is a very long line that repeats many times. '.repeat(1000);
    
    const testPlan = {
        tool_name: 'ExitPlanMode',
        tool_input: {
            plan: largePlan
        },
        session_id: `large-plan-${Date.now()}`,
        cwd: TEST_CONFIG.projectRoot,
        hook_event_name: 'post_tool_use'
    };
    
    const result = await executeCommand(TEST_CONFIG.hookScript, {
        stdin: JSON.stringify(testPlan),
        env: { DEBUG_PLAN_CAPTURE: 'false' }
    });
    
    if (result.success && result.stderr.includes('Plan capture completed successfully')) {
        return { success: true, message: 'Large plan handled successfully' };
    } else {
        return { success: false, error: result.stderr || result.error };
    }
}

/**
 * Generate test report
 */
function generateReport() {
    const reportPath = path.join(TEST_CONFIG.projectRoot, '_debug', `claude-hooks-test-${Date.now()}.json`);
    
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: testResults.total,
            passed: testResults.passed,
            failed: testResults.failed,
            passRate: ((testResults.passed / testResults.total) * 100).toFixed(2) + '%'
        },
        config: TEST_CONFIG,
        details: testResults.details
    };
    
    // Ensure debug directory exists
    const debugDir = path.dirname(reportPath);
    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log('INFO', `Test report saved to: ${reportPath}`);
    
    return report;
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`\n${colors.bright}${colors.white}=== Claude Code Hooks Test Suite ===${colors.reset}\n`);
    
    try {
        // Load project context
        await loadProjectContext();
        
        // Run all tests
        await runTest('Hook Script Setup', testHookScriptSetup);
        await runTest('Basic Plan Capture', testBasicPlanCapture);
        await runTest('Unicode Handling', testUnicodeHandling);
        await runTest('Invalid Project Handling', testInvalidProjectHandling);
        await runTest('Empty Plan Handling', testEmptyPlanHandling);
        await runTest('Tool Filtering', testToolFiltering);
        await runTest('API Failure Handling', testAPIFailureHandling);
        await runTest('Large Plan Handling', testLargePlanHandling);
        
        // Generate report
        const report = generateReport();
        
        // Print summary
        console.log(`\n${colors.bright}${colors.white}=== TEST SUMMARY ===${colors.reset}`);
        console.log(`Total Tests: ${testResults.total}`);
        console.log(`Passed: ${colors.green}${testResults.passed}${colors.reset}`);
        console.log(`Failed: ${colors.red}${testResults.failed}${colors.reset}`);
        console.log(`Pass Rate: ${testResults.passed === testResults.total ? colors.green : colors.yellow}${report.summary.passRate}${colors.reset}`);
        
        if (testResults.failed > 0) {
            console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
            testResults.details.filter(t => t.status === 'FAILED' || t.status === 'CRASHED').forEach(test => {
                console.log(`  ${colors.red}❌ ${test.name}${colors.reset}: ${test.error}`);
            });
        }
        
        const overallSuccess = testResults.failed === 0;
        console.log(`\nOverall Status: ${overallSuccess ? colors.green + '✅ ALL TESTS PASSED' : colors.red + '❌ SOME TESTS FAILED'}${colors.reset}\n`);
        
        process.exit(overallSuccess ? 0 : 1);
        
    } catch (error) {
        log('ERROR', 'Test suite failed to initialize', error);
        process.exit(1);
    }
}

// Handle CLI arguments
if (process.argv.includes('--help')) {
    console.log(`
Claude Code Hooks Test Suite

Usage: node test-claude-hooks.js [OPTIONS]

OPTIONS:
    --verbose       Enable verbose debug output
    --help          Show this help message

EXAMPLES:
    node test-claude-hooks.js              # Run all tests
    node test-claude-hooks.js --verbose    # Run with detailed output
`);
    process.exit(0);
}

// Run tests
if (require.main === module) {
    runAllTests();
}

module.exports = {
    runAllTests,
    runTest,
    testResults
};