Plan: Implementing Slash Commands with Claude Code SDK in Baton
Overview
Based on my research, I'll implement a slash command system that integrates with Baton's existing Claude Code WebUI and MCP server architecture. This will allow users to create custom slash commands that can interact with Baton's task management features.

Implementation Components
1. Slash Command Registry Service
Create a service to discover and manage custom slash commands from:
Project-specific commands (.claude/commands/ directory)
User-global commands (~/.claude/commands/ directory)
Built-in Baton commands for task management
Parse command definitions and extract metadata (name, description, arguments)
2. Command Execution Engine
Implement command parsing to handle the /<prefix>:<command-name> [arguments] syntax
Support for $ARGUMENTS placeholder substitution in command templates
Integration with existing Claude Code SDK execution pipeline
Error handling for invalid commands or missing arguments
3. Built-in Baton Slash Commands
Create pre-built commands for common Baton operations:

/baton:create-task "Task description" - Create new task
/baton:move-task 123 "In Progress" - Move task to different status
/baton:search-tasks "keyword" - Search tasks
/baton:daily-standup - Generate daily standup summary
/baton:project-analytics - Show project metrics
4. WebUI Integration
Add slash command autocomplete in the chat interface
Command suggestion dropdown with descriptions
Visual indicators for available commands
Command history and favorites
5. MCP Server Enhancement
Extend existing MCP server with slash command tools
Add command discovery resource (baton://commands)
Support for dynamic command registration
Integration with workspace context for project-specific commands
6. Database Schema
Add tables for storing custom commands and usage analytics
Track command execution history and performance metrics
Store user preferences for command aliases and shortcuts
Technical Architecture
Frontend Components
SlashCommandParser - Parse input for slash commands
CommandAutocomplete - Provide command suggestions
CommandRegistry - Manage available commands
Enhanced chat input component with command support
Backend Services
SlashCommandService - Core command execution logic
CommandDiscoveryService - Find and load commands from filesystem
Enhanced MCP server with command tools
WebSocket integration for real-time command results
File Structure
src/
├── services/
│   ├── slash-commands/
│   │   ├── SlashCommandService.ts
│   │   ├── CommandRegistry.ts
│   │   ├── CommandParser.ts
│   │   └── built-in/
│   │       ├── BatonCommands.ts
│   │       └── TaskManagementCommands.ts
├── components/
│   ├── chat/
│   │   ├── SlashCommandInput.tsx
│   │   └── CommandAutocomplete.tsx
└── mcp/
    └── tools/
        └── slash-commands.ts
This implementation will leverage Claude Code SDK's fluent API for command execution while providing a seamless integration with Baton's existing task management features.