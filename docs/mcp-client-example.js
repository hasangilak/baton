#!/usr/bin/env node

/**
 * Example MCP client for connecting to Baton MCP Server
 * This demonstrates how to connect and interact with the Baton MCP server
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

async function main() {
  // Create transport - connect to Baton MCP server via STDIO
  const serverProcess = spawn("npm", ["run", "mcp"], {
    cwd: "../backend",
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://baton_user:baton_password@localhost:5432/baton_dev"
    }
  });

  const transport = new StdioClientTransport({
    stdin: serverProcess.stdin,
    stdout: serverProcess.stdout
  });

  // Create MCP client
  const client = new Client(
    {
      name: "baton-example-client",
      version: "1.0.0"
    },
    {
      capabilities: {
        roots: {
          listChanged: true
        },
        sampling: {}
      }
    }
  );

  // Connect to server
  console.log("🔌 Connecting to Baton MCP Server...");
  await client.connect(transport);
  console.log("✅ Connected to Baton MCP Server");

  try {
    // List available resources
    console.log("\n📚 Listing available resources...");
    const resources = await client.request({
      method: "resources/list"
    }, {});
    
    console.log(`Found ${resources.resources.length} resources:`);
    resources.resources.forEach(resource => {
      console.log(`  - ${resource.name}: ${resource.uri}`);
      console.log(`    ${resource.description}`);
    });

    // List available tools
    console.log("\n🛠️  Listing available tools...");
    const tools = await client.request({
      method: "tools/list"
    }, {});
    
    console.log(`Found ${tools.tools.length} tools:`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // List available prompts
    console.log("\n💬 Listing available prompts...");
    const prompts = await client.request({
      method: "prompts/list"
    }, {});
    
    console.log(`Found ${prompts.prompts.length} prompts:`);
    prompts.prompts.forEach(prompt => {
      console.log(`  - ${prompt.name}: ${prompt.description}`);
    });

    // Example: Read a resource
    console.log("\n📖 Reading projects resource...");
    const projectsData = await client.request({
      method: "resources/read",
      params: {
        uri: "baton://projects"
      }
    }, {});
    
    console.log("Projects data:", JSON.parse(projectsData.contents[0].text));

    // Example: Use a tool to create a project
    console.log("\n🚀 Creating a new project using MCP tool...");
    const newProject = await client.request({
      method: "tools/call",
      params: {
        name: "create_project",
        arguments: {
          name: "MCP Demo Project",
          description: "A project created via MCP client",
          color: "#10b981"
        }
      }
    }, {});
    
    console.log("New project created:", JSON.parse(newProject.content[0].text));

    // Example: Use a prompt
    console.log("\n📝 Getting project plan prompt...");
    const prompt = await client.request({
      method: "prompts/get",
      params: {
        name: "create_project_plan",
        arguments: {
          project_name: "MCP Integration",
          project_description: "Integrate MCP with existing systems",
          timeline: "2 weeks",
          team_size: "3",
          priority_level: "high"
        }
      }
    }, {});
    
    console.log("Project plan prompt generated:");
    prompt.messages.forEach((message, index) => {
      console.log(`Message ${index + 1} (${message.role}):`);
      console.log(message.content);
      console.log("---");
    });

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    // Clean up
    console.log("\n🔌 Disconnecting...");
    await client.close();
    serverProcess.kill();
    console.log("✅ Disconnected");
  }
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Run the example
main().catch(console.error);