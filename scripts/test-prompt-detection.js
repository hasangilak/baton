#!/usr/bin/env node

/**
 * Test Script for Claude Code Interactive Prompt Detection
 * 
 * Tests the PromptDetector with various prompt patterns including
 * the 3-option selection from the user's screenshot.
 */

const { PromptDetector } = require('./prompt-detector');

// Test cases based on the screenshot and common patterns
const testCases = [
  {
    name: "Tool Usage Prompt (from screenshot)",
    message: `Tool use

exa - web_search_exa (query: "Claude Code SDK headless mode interactive prompts user selection 3 options handling", numResults: 5) (MCP)
Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs. Supports configurable result counts and returns the content from the most relevant websites.

Do you want to proceed?
> 1. Yes
> 2. Yes, and don't ask again for exa - web_search_exa commands in /home/hassan/work/baton/frontend
> 3. No, and tell Claude what to do differently (esc)`,
    expected: {
      type: 'tool_usage',
      optionCount: 3,
      toolName: 'exa - web_search_exa'
    }
  },
  {
    name: "Permission Request",
    message: "Can I edit the file config.json?",
    expected: {
      type: 'permission',
      optionCount: 2
    }
  },
  {
    name: "File Selection",
    message: `Which file would you like me to edit?
1. package.json
2. tsconfig.json  
3. README.md`,
    expected: {
      type: 'file_selection',
      optionCount: 3
    }
  },
  {
    name: "Multiple Choice",
    message: `Choose one approach for implementing this feature:
1. Use a React Hook
2. Create a custom component
3. Implement as a utility function`,
    expected: {
      type: 'multiple_choice',
      optionCount: 3
    }
  },
  {
    name: "Not a prompt",
    message: "Here is the implementation of your function:\n\nfunction test() {\n  return 'Hello World';\n}",
    expected: null
  }
];

function runTests() {
  console.log('🧪 Running Claude Code Interactive Prompt Detection Tests\n');
  
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`📝 Testing: ${testCase.name}`);
    console.log(`Input: "${testCase.message.substring(0, 100)}${testCase.message.length > 100 ? '...' : ''}"`);
    
    const result = PromptDetector.detectPrompt(testCase.message);
    
    if (testCase.expected === null) {
      if (result === null) {
        console.log('✅ PASS: Correctly identified as not a prompt\n');
        passed++;
      } else {
        console.log(`❌ FAIL: Expected no prompt but got: ${result?.type}\n`);
        failed++;
      }
    } else {
      if (!result) {
        console.log(`❌ FAIL: Expected prompt but got null\n`);
        failed++;
        continue;
      }

      let testPassed = true;
      const issues = [];

      // Check type
      if (result.type !== testCase.expected.type) {
        testPassed = false;
        issues.push(`Expected type '${testCase.expected.type}' but got '${result.type}'`);
      }

      // Check option count
      if (testCase.expected.optionCount && result.options?.length !== testCase.expected.optionCount) {
        testPassed = false;
        issues.push(`Expected ${testCase.expected.optionCount} options but got ${result.options?.length}`);
      }

      // Check tool name if specified
      if (testCase.expected.toolName && result.context?.toolName !== testCase.expected.toolName) {
        testPassed = false;
        issues.push(`Expected toolName '${testCase.expected.toolName}' but got '${result.context?.toolName}'`);
      }

      if (testPassed) {
        console.log(`✅ PASS: ${PromptDetector.getPromptSummary(result)}`);
        if (result.options?.length > 0) {
          console.log(`   Options: ${result.options.map(o => `"${o.label}"`).join(', ')}`);
        }
        console.log('');
        passed++;
      } else {
        console.log(`❌ FAIL: ${issues.join(', ')}`);
        console.log(`   Got: ${PromptDetector.getPromptSummary(result)}\n`);
        failed++;
      }
    }
  }

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Prompt detection is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Run the tests
runTests();