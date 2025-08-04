#!/usr/bin/env node

/**
 * Baton MCP Connection Tester
 * 
 * Provides detailed testing of MCP protocol compliance and Claude Code integration
 * This script performs comprehensive testing of the MCP server connectivity,
 * protocol adherence, and specific Claude Code integration features.
 */

const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const EventSource = require('eventsource');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    backend: {
        url: 'http://localhost:3001',
        health: '/health',
        sse: '/mcp/sse',
        messages: '/mcp/messages'
    },
    websocket: {
        url: 'ws://localhost:3002'
    },
    timeouts: {
        connection: 5000,
        response: 10000,
        sse: 15000
    },
    docker: {
        backend: 'baton-backend-dev',
        mcp: 'baton-mcp-server-dev'
    }
};

// Colors for console output
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

// Logging utilities
class Logger {
    constructor(verbose = false) {
        this.verbose = verbose;
        this.logs = [];
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, data };
        this.logs.push(logEntry);

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
        
        if (data && (this.verbose || level === 'ERROR')) {
            console.log(`${colors.cyan}   Data: ${JSON.stringify(data, null, 2)}${colors.reset}`);
        }
    }

    success(message, data) { this.log('SUCCESS', message, data); }
    error(message, data) { this.log('ERROR', message, data); }
    warning(message, data) { this.log('WARNING', message, data); }
    info(message, data) { this.log('INFO', message, data); }
    debug(message, data) { this.log('DEBUG', message, data); }

    exportLogs(filename) {
        fs.writeFileSync(filename, JSON.stringify(this.logs, null, 2));
        this.info(`Logs exported to ${filename}`);
    }
}

// MCP Protocol Testing
class MCPTester {
    constructor(logger) {
        this.logger = logger;
    }

    // Create standard MCP initialize request
    createInitializeRequest(id = 1) {
        return {
            jsonrpc: '2.0',
            id: id,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                },
                clientInfo: {
                    name: 'baton-connection-tester',
                    version: '1.0.0'
                }
            }
        };
    }

    // Test HTTP/HTTPS endpoint
    async testHttpEndpoint(url, options = {}) {
        return new Promise((resolve) => {
            const { timeout = CONFIG.timeouts.connection } = options;
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.request(url, {
                method: options.method || 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                timeout: timeout
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        success: true,
                        status: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout'
                });
            });

            if (options.data) {
                req.write(JSON.stringify(options.data));
            }

            req.end();
        });
    }

    // Test SSE endpoint
    async testSSEConnection(url) {
        return new Promise((resolve) => {
            this.logger.info('Testing SSE connection...');
            
            const eventSource = new EventSource(url);
            const messages = [];
            let connected = false;

            const timeout = setTimeout(() => {
                eventSource.close();
                resolve({
                    success: connected,
                    messages: messages,
                    error: connected ? null : 'Connection timeout'
                });
            }, CONFIG.timeouts.sse);

            eventSource.onopen = () => {
                this.logger.success('SSE connection established');
                connected = true;
            };

            eventSource.onmessage = (event) => {
                messages.push({
                    data: event.data,
                    timestamp: new Date().toISOString()
                });
                this.logger.debug('SSE message received', { data: event.data });
            };

            eventSource.onerror = (error) => {
                this.logger.error('SSE connection error', error);
                clearTimeout(timeout);
                eventSource.close();
                resolve({
                    success: false,
                    messages: messages,
                    error: error.message || 'SSE connection failed'
                });
            };

            // Allow some time for initial connection
            setTimeout(() => {
                if (connected) {
                    clearTimeout(timeout);
                    eventSource.close();
                    resolve({
                        success: true,
                        messages: messages,
                        error: null
                    });
                }
            }, 3000);
        });
    }

    // Test WebSocket connection
    async testWebSocketConnection(url) {
        return new Promise((resolve) => {
            this.logger.info('Testing WebSocket connection...');
            
            const ws = new WebSocket(url);
            const messages = [];
            let connected = false;

            const timeout = setTimeout(() => {
                ws.close();
                resolve({
                    success: connected,
                    messages: messages,
                    error: connected ? null : 'Connection timeout'
                });
            }, CONFIG.timeouts.connection);

            ws.on('open', () => {
                this.logger.success('WebSocket connection established');
                connected = true;
                
                // Send initialize request
                const initRequest = this.createInitializeRequest();
                ws.send(JSON.stringify(initRequest));
                this.logger.debug('Sent initialize request', initRequest);
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    messages.push({
                        message: message,
                        timestamp: new Date().toISOString()
                    });
                    this.logger.debug('WebSocket message received', message);
                } catch (error) {
                    this.logger.warning('Invalid JSON in WebSocket message', { data: data.toString() });
                }
            });

            ws.on('error', (error) => {
                this.logger.error('WebSocket connection error', error);
                clearTimeout(timeout);
                resolve({
                    success: false,
                    messages: messages,
                    error: error.message
                });
            });

            ws.on('close', () => {
                clearTimeout(timeout);
                resolve({
                    success: connected,
                    messages: messages,
                    error: connected ? null : 'Connection closed unexpectedly'
                });
            });
        });
    }

    // Test STDIO transport
    async testStdioTransport() {
        return new Promise((resolve) => {
            this.logger.info('Testing STDIO transport...');
            
            const initRequest = this.createInitializeRequest();
            const dockerCmd = `docker exec -i ${CONFIG.docker.backend} npm run mcp:stdio`;
            
            const process = spawn('bash', ['-c', dockerCmd], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                let response = null;
                let success = false;

                try {
                    // Try to parse the JSON response
                    const lines = stdout.split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.jsonrpc === '2.0' && parsed.id === 1) {
                                response = parsed;
                                success = !parsed.error;
                                break;
                            }
                        } catch (e) {
                            // Ignore non-JSON lines
                        }
                    }
                } catch (error) {
                    this.logger.error('Failed to parse STDIO response', { stdout, stderr });
                }

                resolve({
                    success: success,
                    response: response,
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: code
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    stdout: stdout,
                    stderr: stderr
                });
            });

            // Send the initialize request
            process.stdin.write(JSON.stringify(initRequest) + '\n');
            process.stdin.end();

            // Set timeout
            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    error: 'STDIO test timeout',
                    stdout: stdout,
                    stderr: stderr
                });
            }, CONFIG.timeouts.response);
        });
    }

    // Test MCP Tools (TodoRead, TodoWrite, etc.)
    async testMCPTools() {
        this.logger.info('Testing MCP tools via STDIO...');
        
        const tests = [
            {
                name: 'list_tools',
                request: {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/list'
                }
            },
            {
                name: 'todo_read',
                request: {
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'tools/call',
                    params: {
                        name: 'TodoRead'
                    }
                }
            }
        ];

        const results = [];

        for (const test of tests) {
            const result = await this.runMCPRequest(test.request);
            results.push({
                name: test.name,
                success: result.success,
                response: result.response,
                error: result.error
            });
            
            if (result.success) {
                this.logger.success(`MCP tool test '${test.name}' passed`);
            } else {
                this.logger.error(`MCP tool test '${test.name}' failed`, result.error);
            }
        }

        return results;
    }

    // Run a single MCP request via STDIO
    async runMCPRequest(request) {
        return new Promise((resolve) => {
            const dockerCmd = `docker exec -i ${CONFIG.docker.backend} npm run mcp:stdio`;
            const process = spawn('bash', ['-c', dockerCmd], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                let response = null;
                let success = false;

                try {
                    const lines = stdout.split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.jsonrpc === '2.0' && parsed.id === request.id) {
                                response = parsed;
                                success = !parsed.error;
                                break;
                            }
                        } catch (e) {
                            // Ignore non-JSON lines
                        }
                    }
                } catch (error) {
                    // Failed to parse
                }

                resolve({
                    success: success,
                    response: response,
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: code
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            // Send initialize first, then the actual request
            const initRequest = this.createInitializeRequest();
            process.stdin.write(JSON.stringify(initRequest) + '\n');
            process.stdin.write(JSON.stringify(request) + '\n');
            process.stdin.end();

            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    error: 'Request timeout'
                });
            }, CONFIG.timeouts.response);
        });
    }
}

// Main test runner
class TestRunner {
    constructor(options = {}) {
        this.logger = new Logger(options.verbose);
        this.mcpTester = new MCPTester(this.logger);
        this.options = options;
    }

    async runAllTests() {
        this.logger.info('Starting comprehensive MCP connection tests...');
        
        const results = {
            health: await this.testHealth(),
            sse: await this.testSSE(),
            websocket: await this.testWebSocket(),
            stdio: await this.testStdio(),
            tools: await this.testTools()
        };

        await this.generateReport(results);
        return results;
    }

    async testHealth() {
        this.logger.info('Testing backend health endpoint...');
        const result = await this.mcpTester.testHttpEndpoint(CONFIG.backend.url + CONFIG.backend.health);
        
        if (result.success && result.status === 200) {
            this.logger.success('Backend health check passed');
            return { success: true, status: result.status };
        } else {
            this.logger.error('Backend health check failed', result);
            return { success: false, error: result.error || `HTTP ${result.status}` };
        }
    }

    async testSSE() {
        this.logger.info('Testing SSE transport...');
        const result = await this.mcpTester.testSSEConnection(CONFIG.backend.url + CONFIG.backend.sse);
        
        if (result.success) {
            this.logger.success(`SSE transport working (${result.messages.length} messages)`);
        } else {
            this.logger.error('SSE transport failed', result.error);
        }
        
        return result;
    }

    async testWebSocket() {
        this.logger.info('Testing WebSocket transport...');
        const result = await this.mcpTester.testWebSocketConnection(CONFIG.websocket.url);
        
        if (result.success) {
            this.logger.success(`WebSocket transport working (${result.messages.length} messages)`);
        } else {
            this.logger.error('WebSocket transport failed', result.error);
        }
        
        return result;
    }

    async testStdio() {
        this.logger.info('Testing STDIO transport...');
        const result = await this.mcpTester.testStdioTransport();
        
        if (result.success) {
            this.logger.success('STDIO transport working');
        } else {
            this.logger.error('STDIO transport failed', result.error);
        }
        
        return result;
    }

    async testTools() {
        this.logger.info('Testing MCP tools...');
        const result = await this.mcpTester.testMCPTools();
        
        const successCount = result.filter(r => r.success).length;
        this.logger.info(`MCP tools test completed: ${successCount}/${result.length} passed`);
        
        return {
            success: successCount > 0,
            results: result,
            summary: `${successCount}/${result.length} tools working`
        };
    }

    async generateReport(results) {
        this.logger.info('Generating test report...');
        
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: {
                health: results.health.success,
                sse: results.sse.success,
                websocket: results.websocket.success,
                stdio: results.stdio.success,
                tools: results.tools.success
            },
            details: results,
            logs: this.logger.logs
        };

        const reportPath = path.join(__dirname, '..', '_debug', `mcp-connection-test-${Date.now()}.json`);
        
        try {
            fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
            this.logger.success(`Test report saved to ${reportPath}`);
        } catch (error) {
            this.logger.error('Failed to save test report', error);
        }

        // Print summary
        console.log(`\n${colors.bright}${colors.white}=== TEST SUMMARY ===${colors.reset}`);
        console.log(`Health Endpoint: ${results.health.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
        console.log(`SSE Transport: ${results.sse.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
        console.log(`WebSocket Transport: ${results.websocket.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
        console.log(`STDIO Transport: ${results.stdio.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset}`);
        console.log(`MCP Tools: ${results.tools.success ? colors.green + '✅ PASS' : colors.red + '❌ FAIL'}${colors.reset} (${results.tools.summary})`);
        
        const overallSuccess = Object.values(results).some(r => r.success);
        console.log(`\nOverall Status: ${overallSuccess ? colors.green + '✅ Some tests passing' : colors.red + '❌ All tests failed'}${colors.reset}\n`);
    }
}

// CLI handling
function showUsage() {
    console.log(`
Usage: node test-mcp-connection.js [OPTIONS]

OPTIONS:
    --verbose       Enable verbose debug output
    --export        Export detailed logs to file
    --test TEST     Run specific test (health|sse|websocket|stdio|tools|all)
    --help          Show this help message

EXAMPLES:
    node test-mcp-connection.js                    # Run all tests
    node test-mcp-connection.js --verbose          # Run with detailed output
    node test-mcp-connection.js --test sse         # Test only SSE transport
    node test-mcp-connection.js --export           # Export logs to file
`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose'),
        export: args.includes('--export'),
        test: null
    };

    if (args.includes('--help')) {
        showUsage();
        process.exit(0);
    }

    const testIndex = args.indexOf('--test');
    if (testIndex !== -1 && testIndex + 1 < args.length) {
        options.test = args[testIndex + 1];
    }

    const runner = new TestRunner(options);

    try {
        if (options.test && options.test !== 'all') {
            // Run specific test
            switch (options.test) {
                case 'health':
                    await runner.testHealth();
                    break;
                case 'sse':
                    await runner.testSSE();
                    break;
                case 'websocket':
                    await runner.testWebSocket();
                    break;
                case 'stdio':
                    await runner.testStdio();
                    break;
                case 'tools':
                    await runner.testTools();
                    break;
                default:
                    console.error(`Unknown test: ${options.test}`);
                    showUsage();
                    process.exit(1);
            }
        } else {
            // Run all tests
            await runner.runAllTests();
        }

        if (options.export) {
            const logPath = path.join(__dirname, '..', '_debug', `mcp-logs-${Date.now()}.json`);
            runner.logger.exportLogs(logPath);
        }

    } catch (error) {
        console.error(`${colors.red}❌ Test execution failed: ${error.message}${colors.reset}`);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

if (require.main === module) {
    main();
}

module.exports = { TestRunner, MCPTester, Logger };