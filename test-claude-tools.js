#!/usr/bin/env node

/**
 * Test script to examine Claude Code message structure with tool usage
 */

const { query } = require('@anthropic-ai/claude-code');

async function testToolUsage() {
  console.log('Testing Claude Code tool usage...\n');
  
  const messages = [];
  const prompt = 'Search the web and tell me the current price of NVIDIA stock. Show me which tools you use.';
  
  console.log('Prompt:', prompt);
  console.log('\n--- Starting query ---\n');
  
  const abortController = new AbortController();
  
  try {
    for await (const message of query({
      prompt,
      abortController,
      options: {
        maxTurns: 1,
      },
    })) {
      messages.push(message);
      
      console.log('\n=== Message ===');
      console.log('Type:', message.type);
      
      // Log different message structures
      if (message.type === 'user') {
        console.log('User message structure:');
        console.log(JSON.stringify(message, null, 2));
      }
      
      if (message.toolUses) {
        console.log('Tool uses found:');
        console.log(JSON.stringify(message.toolUses, null, 2));
      }
      
      if (message.type === 'assistant' && message.message) {
        const content = message.message.content;
        if (Array.isArray(content)) {
          const textContent = content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('');
          console.log('Assistant says:', textContent.substring(0, 100) + '...');
        }
      }
      
      if (message.type === 'result') {
        console.log('Result received:');
        if (message.result) {
          console.log(message.result.substring(0, 500) + '...');
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n--- Query complete ---\n');
  console.log('Total messages received:', messages.length);
}

testToolUsage();