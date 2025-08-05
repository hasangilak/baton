# Claude Code Chat Integration

This document explains how to integrate Claude Code's chat functionality with Baton's chat system.

## Overview

The chat integration allows you to:
- Sync chat conversations between Claude Code and Baton
- Enhance chat prompts with project context
- Track code snippets and tasks from chat
- Maintain conversation history across sessions

## Setup

### 1. Configure Hooks

Add the following hooks to your `~/.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "ChatMessage",
        "hooks": [
          {
            "type": "command",
            "command": "cd /home/hassan/work/baton && node scripts/capture-chat-message.js"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "cd /home/hassan/work/baton && node scripts/chat-context-enhancer.js"
      }
    ]
  }
}
```

### 2. Create Project Configuration

Ensure you have a `.baton-project` file in your workspace:

```json
{
  "projectId": "your-project-id",
  "projectName": "Your Project Name"
}
```

## How It Works

### Chat Message Capture

The `capture-chat-message.js` hook:
1. Intercepts chat messages from Claude Code
2. Creates or reuses conversations in Baton
3. Syncs messages to the Baton database
4. Maintains session continuity

### Context Enhancement

The `chat-context-enhancer.js` hook:
1. Analyzes user prompts for intent
2. Fetches relevant project context
3. Includes recent tasks and todos
4. Enhances prompts with contextual information

## Features

### Conversation Management
- Automatic conversation creation
- Session-based conversation tracking
- Conversation history persistence
- Real-time sync via WebSocket

### Message Features
- User and assistant message capture
- Code block extraction
- File attachment support
- Streaming response handling

### Context Awareness
- Project-specific context
- Recent task integration
- Todo list awareness
- Intent-based enhancement

## Usage Examples

### Basic Chat
Simply start chatting in Claude Code - messages are automatically synced:

```
User: How do I implement the new feature?
Assistant: [Response with project context]
```

### Task Creation from Chat
Discuss tasks and convert them to Baton tasks:

```
User: I need to add user authentication
Assistant: I'll help you plan that. Let me create a task...
```

### Code Review
Share code and get contextual feedback:

```
User: Review this function for performance
Assistant: [Analysis with project conventions]
```

## API Integration

### Endpoints Used

- `POST /api/chat/conversations` - Create conversations
- `POST /api/chat/messages` - Send messages
- `GET /api/tasks` - Fetch recent tasks
- `GET /api/claude-todos` - Fetch todos

### WebSocket Events

- `conversation:created` - New conversation
- `message:complete` - Message processed
- `conversation:archived` - Conversation archived

## Troubleshooting

### Messages Not Syncing

1. Check `.baton-project` file exists
2. Verify API URL in environment
3. Enable debug mode: `DEBUG_CHAT_CAPTURE=true`

### Context Not Working

1. Ensure project has tasks/todos
2. Check API connectivity
3. Enable debug: `DEBUG_CHAT_CONTEXT=true`

### Session Issues

1. Check `.claude/chat-sessions.json`
2. Clear stale sessions if needed
3. Verify conversation creation

## Advanced Configuration

### Environment Variables

- `BATON_API_URL` - API endpoint (default: http://localhost:3001)
- `DEBUG_CHAT_CAPTURE` - Enable chat capture debugging
- `DEBUG_CHAT_CONTEXT` - Enable context enhancement debugging

### Custom Intents

Modify `detectChatIntent()` in `chat-context-enhancer.js` to add custom intent detection:

```javascript
if (promptLower.match(/\b(deploy|release|ship)\b/)) {
  return 'deployment';
}
```

### Session Management

Sessions are stored in `.claude/chat-sessions.json`:

```json
{
  "session-id": {
    "conversationId": "conv-123",
    "lastUpdated": "2024-01-01T00:00:00Z"
  }
}
```

## Best Practices

1. **Project Setup**: Always create `.baton-project` file
2. **Context Usage**: Let context enhancement guide responses
3. **Task Integration**: Convert actionable items to tasks
4. **Code Tracking**: Extract and save important code snippets
5. **Session Hygiene**: Clean up old sessions periodically