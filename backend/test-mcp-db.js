#!/usr/bin/env node

/**
 * MCP Database Integration Test
 * Verifies that MCP server can access database properly
 */

const { PrismaClient } = require('@prisma/client');
const { BatonMCPServer } = require('./dist/mcp/server/index.js');

async function testDatabaseConnectivity() {
  console.log('🗄️  Testing MCP Server Database Connectivity...\n');

  // Test direct Prisma connection
  console.log('1️⃣ Testing direct Prisma connection...');
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Direct Prisma connection successful');
    
    const projectCount = await prisma.project.count();
    console.log(`📊 Found ${projectCount} projects in database`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Direct Prisma connection failed:', error.message);
    return false;
  }

  // Test MCP server database integration
  console.log('\n2️⃣ Testing MCP server database integration...');
  
  try {
    const mcpServer = new BatonMCPServer();
    
    // Test resource provider
    console.log('  Testing Resource Provider...');
    const resourceProvider = mcpServer.resourceProvider || 
      (mcpServer.resourceProvider = new (require('./dist/mcp/resources/index.js').BatonResourceProvider)(new PrismaClient()));
    
    const resources = await resourceProvider.listResources();
    console.log(`  ✅ Resource provider works - ${resources.length} resources available`);
    
    // Test reading a resource
    const projectsData = await resourceProvider.readResource('baton://projects');
    console.log(`  ✅ Resource reading works - ${projectsData.length || 0} projects loaded`);
    
    // Test tool provider
    console.log('  Testing Tool Provider...');
    const toolProvider = mcpServer.toolProvider || 
      (mcpServer.toolProvider = new (require('./dist/mcp/tools/index.js').BatonToolProvider)(new PrismaClient()));
    
    const tools = await toolProvider.listTools();
    console.log(`  ✅ Tool provider works - ${tools.length} tools available`);
    
    // Test a tool execution
    const analytics = await toolProvider.callTool('get_project_analytics', { 
      projectId: '689b0107dec8469824f3f4f7' 
    });
    console.log(`  ✅ Tool execution works - analytics generated`);
    
    // Test prompt provider
    console.log('  Testing Prompt Provider...');
    const promptProvider = mcpServer.promptProvider || 
      (mcpServer.promptProvider = new (require('./dist/mcp/prompts/index.js').BatonPromptProvider)(new PrismaClient()));
    
    const prompts = await promptProvider.listPrompts();
    console.log(`  ✅ Prompt provider works - ${prompts.length} prompts available`);
    
    await mcpServer.shutdown();
    console.log('✅ MCP server database integration successful');
    
    return true;
  } catch (error) {
    console.error('❌ MCP server database integration failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
}

async function testMCPMessageFormats() {
  console.log('\n📋 Testing MCP Message Formats...\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Test Resource format
    console.log('1️⃣ Testing Resource message format...');
    const { BatonResourceProvider } = require('./dist/mcp/resources/index.js');
    const resourceProvider = new BatonResourceProvider(prisma);
    
    const resources = await resourceProvider.listResources();
    const resource = resources[0];
    
    // Validate resource structure
    const requiredResourceFields = ['uri', 'name', 'description', 'mimeType'];
    const hasAllFields = requiredResourceFields.every(field => resource.hasOwnProperty(field));
    
    if (hasAllFields) {
      console.log('✅ Resource format is valid');
      console.log(`   Sample: ${resource.name} (${resource.uri})`);
    } else {
      console.error('❌ Resource format is invalid - missing fields');
      return false;
    }
    
    // Test Tool format
    console.log('\n2️⃣ Testing Tool message format...');
    const { BatonToolProvider } = require('./dist/mcp/tools/index.js');
    const toolProvider = new BatonToolProvider(prisma);
    
    const tools = await toolProvider.listTools();
    const tool = tools[0];
    
    const requiredToolFields = ['name', 'description', 'inputSchema'];
    const hasAllToolFields = requiredToolFields.every(field => tool.hasOwnProperty(field));
    
    if (hasAllToolFields && tool.inputSchema.type === 'object') {
      console.log('✅ Tool format is valid');
      console.log(`   Sample: ${tool.name} - ${tool.description}`);
    } else {
      console.error('❌ Tool format is invalid');
      return false;
    }
    
    // Test Prompt format
    console.log('\n3️⃣ Testing Prompt message format...');
    const { BatonPromptProvider } = require('./dist/mcp/prompts/index.js');
    const promptProvider = new BatonPromptProvider(prisma);
    
    const prompts = await promptProvider.listPrompts();
    const prompt = prompts[0];
    
    const requiredPromptFields = ['name', 'description'];
    const hasAllPromptFields = requiredPromptFields.every(field => prompt.hasOwnProperty(field));
    
    if (hasAllPromptFields) {
      console.log('✅ Prompt format is valid');
      console.log(`   Sample: ${prompt.name} - ${prompt.description}`);
    } else {
      console.error('❌ Prompt format is invalid');
      return false;
    }
    
    await prisma.$disconnect();
    console.log('\n✅ All MCP message formats are valid');
    return true;
    
  } catch (error) {
    console.error('❌ MCP message format test failed:', error.message);
    await prisma.$disconnect();
    return false;
  }
}

async function runDatabaseTests() {
  console.log('🧪 Starting MCP Database Integration Tests\n');
  console.log('=' .repeat(60));
  
  const tests = [
    { name: 'Database Connectivity', fn: testDatabaseConnectivity },
    { name: 'Message Formats', fn: testMCPMessageFormats }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(`\n🔍 Testing: ${test.name}`);
      console.log('-'.repeat(40));
      
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name} PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name} FAILED`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name} CRASHED:`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 DATABASE TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log(`📈 Success Rate: ${Math.round((passed / tests.length) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All database tests passed! MCP server can access data properly.');
  } else {
    console.log('\n⚠️  Database integration has issues that need fixing.');
    process.exit(1);
  }
}

if (require.main === module) {
  runDatabaseTests().catch(error => {
    console.error('\n💥 Database test suite crashed:', error);
    process.exit(1);
  });
}