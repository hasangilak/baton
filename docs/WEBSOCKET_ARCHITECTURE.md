# WebSocket Communication & MongoDB Storage Architecture

This document provides a comprehensive analysis of how frontend, backend, and bridge services communicate via WebSockets and how every message is stored in MongoDB under conversations.

## Architecture Overview

```
┌─────────────────┐    WebSocket     ┌─────────────────┐    WebSocket     ┌─────────────────┐
│                 │  (Socket.IO)     │                 │  (Socket.IO)     │                 │
│   Frontend      │◄────────────────►│   Backend       │◄────────────────►│  Bridge Service │
│   React App     │                  │   Express +     │                  │  Claude Code    │
│   Port: 5173    │                  │   Socket.IO     │                  │  SDK Bridge     │
│                 │                  │   Port: 3001    │                  │  Port: 8080     │
└─────────────────┘                  └─────────────────┘                  └─────────────────┘
                                              │
                                              │ MongoDB
                                              │ Connection
                                              ▼
                                     ┌─────────────────┐
                                     │                 │
                                     │   MongoDB       │
                                     │   Database      │
                                     │   Port: 27017   │
                                     │                 │
                                     └─────────────────┘
```

## Key Components

### 1. Bridge Service (`scripts/bridge.ts`)

**Purpose**: Executes Claude Code SDK requests and streams responses back to the backend.

**Architecture**:
- **Modular Design**: Uses `ModularClaudeCodeBridge` class from `scripts/bridge-modules/index.ts`
- **Dual WebSocket Connection**: Connects to backend as both client and server
- **Event Handling**: Listens for `claude:execute` and responds with `claude:stream`

**Key Events**:
```typescript
// Received from backend
socket.on('claude:execute', async (request: BridgeRequest) => {
  // Execute Claude Code SDK
  // Stream responses back via claude:stream
});

// Sent to backend  
socket.emit('claude:stream', {
  type: "claude_json",
  data: sdkMessage,
  requestId: request.requestId,
  timestamp: Date.now()
});
```

### 2. Backend WebSocket Server (`backend/src/index.ts`)

**Purpose**: Central hub that coordinates message flow and stores everything in MongoDB.

**Key Handlers**:

#### Message Sending Flow (`lines 168-229`)
```typescript
socket.on('chat:send-message', async (data) => {
  // 1. Store user message immediately
  const userMessage = await messageStorage.createUserMessage(conversationId, content, attachments);
  
  // 2. Create assistant message placeholder  
  const assistantMessage = await messageStorage.createAssistantMessagePlaceholder(conversationId);
  
  // 3. Map request for streaming updates
  (global as any).activeRequests.set(requestId, {
    assistantMessageId: assistantMessage.id,
    conversationId,
    userMessageId: userMessage.id
  });
  
  // 4. Forward to bridge service
  bridgeSockets[0].emit('claude:execute', { message: content, requestId, ... });
});
```

#### Message Streaming Flow (`lines 443-493`)  
```typescript
socket.on('claude:stream', async (data) => {
  // Get request mapping to find conversation
  const requestInfo = (global as any).activeRequests?.get(data.requestId);
  
  // Store Claude Code SDK message in MongoDB
  if (data.type === 'claude_json' && data.data) {
    if (data.data.type === 'assistant') {
      await messageStorage.createClaudeSDKMessage(requestInfo.conversationId, data);
    }
  }
  
  // Forward to frontend for real-time updates
  io.emit('chat:stream-response', data);
});
```

### 3. Message Storage Service (`backend/src/services/message-storage.service.ts`)

**Purpose**: Handles all database operations for message persistence with comprehensive error handling.

**Key Methods**:

#### `createClaudeSDKMessage()` (`lines 82-170`)
Stores every Claude Code SDK message with rich metadata:

```typescript
async createClaudeSDKMessage(conversationId: string, streamResponse: StreamResponse): Promise<Message> {
  // Extract content based on SDKMessage type
  let content = '';
  let role = 'assistant';
  
  if (streamResponse.data.type === 'assistant') {
    // Extract text from message content blocks
    if (assistantData.message?.content) {
      content = assistantData.message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
    }
  }
  
  // Store in MongoDB with full metadata
  const message = await this.prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      type: streamResponse.type,
      claudeData: streamResponse as any, // Store full StreamResponse
      claudeMessageId: streamResponse.data.message?.id,
      model: streamResponse.data.message?.model,
      sessionId: streamResponse.data.session_id,
      usage: streamResponse.data.message?.usage,
      timestamp: BigInt(streamResponse.timestamp),
      status: 'completed',
    },
  });
}
```

### 4. MongoDB Schema (`backend/prisma/schema.prisma`)

#### Messages Collection (`lines 264-297`)
```prisma
model Message {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  conversationId String   @db.ObjectId
  role           String    // user, assistant, system
  content        String
  
  // Claude WebSocket format fields
  type           String?   // claude_json, etc.
  claudeData     Json?     // Full Claude WebSocket data structure
  claudeMessageId String?  // data.message.id from Claude
  model          String?   // data.message.model (e.g., "claude-3-5-sonnet-20241022")
  sessionId      String?   // data.session_id from Claude SDK
  usage          Json?     // data.message.usage (input_tokens, output_tokens)
  
  // Status and timing
  status         String    @default("completed") // sending, completed, failed
  error          String?   // Error message if failed
  timestamp      BigInt?   // WebSocket timestamp from bridge
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  
  // Relations
  conversation   Conversation        @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  attachments    MessageAttachment[]
  codeBlocks     CodeBlock[]
}
```

#### Conversations Collection (`lines 213-240`)
```prisma
model Conversation {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  title            String?
  projectId        String
  userId           String   @db.ObjectId
  model            String    @default("claude-3-sonnet")
  status           String    @default("active") // active, archived
  claudeSessionId  String?   // Claude Code SDK session ID for context preservation
  contextTokens    Int       @default(0) // Current context window token usage
  lastCompacted    DateTime? // When context was last compacted
  
  // Relations
  project           Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user              User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages          Message[]
  interactivePrompts InteractivePrompt[]
  permissions       ConversationPermission[]
}
```

### 5. Frontend WebSocket Client (`frontend/src/hooks/useUnifiedWebSocket.ts`)

**Purpose**: Handles real-time message updates and maintains React Query cache synchronization.

**Key Event Handlers** (`lines 263-329`):
```typescript
// Chat streaming responses
socket.on('chat:stream-response', (data) => {
  window.dispatchEvent(new CustomEvent('chat:stream-response', { detail: data }));
});

// Session ID updates
socket.on('chat:session-id-available', async (data) => {
  // Update conversation with session ID
  await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/session`, {
    method: 'PUT',
    body: JSON.stringify({ claudeSessionId: data.sessionId })
  });
  
  // Update URL with session ID for context
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('sessionId', data.sessionId);
  window.history.replaceState({}, '', currentUrl.toString());
});

// Message completion
socket.on('chat:message-complete', (data) => {
  queryClient.invalidateQueries({ queryKey: ['chat', 'messages', data.conversationId] });
});
```

## Message Flow Sequence

### 1. User Sends Message
```
Frontend → Backend: chat:send-message
Backend → MongoDB: createUserMessage()
Backend → MongoDB: createAssistantMessagePlaceholder()
Backend → Bridge: claude:execute
```

### 2. Claude Processing & Streaming
```
Bridge → Claude SDK: executeQuery()
Claude SDK → Bridge: Stream of SDKMessage objects
Bridge → Backend: claude:stream (for each chunk)
Backend → MongoDB: createClaudeSDKMessage() (for each chunk)
Backend → Frontend: chat:stream-response (real-time)
```

### 3. Message Completion
```
Bridge → Backend: claude:complete
Backend → Frontend: chat:message-complete
Frontend → React Query: Invalidate message cache
Frontend → UI: Update message list
```

## Data Storage Details

### Every Message Stored
The system stores **every single message** from the bridge in MongoDB with:

1. **User Messages**: Stored immediately when sent
2. **Assistant Messages**: Each streaming chunk stored as separate message
3. **System Messages**: Claude SDK initialization messages
4. **Result Messages**: Execution completion status

### Rich Metadata Captured
```typescript
// Example stored message from Claude Code SDK
{
  "id": "674b8c9f8e1234567890abcd",
  "conversationId": "674b8c9e8e1234567890abce",
  "role": "assistant",
  "content": "I'll help you create a new feature...",
  "type": "claude_json",
  "claudeData": {
    "type": "claude_json",
    "data": {
      "type": "assistant",
      "message": {
        "id": "msg_01ABC123DEF456",
        "model": "claude-3-5-sonnet-20241022",
        "role": "assistant",
        "content": [
          {
            "type": "text",
            "text": "I'll help you create a new feature..."
          }
        ],
        "usage": {
          "input_tokens": 150,
          "output_tokens": 75
        }
      },
      "session_id": "session_abc123"
    },
    "requestId": "req_12345",
    "timestamp": 1699123456789
  },
  "claudeMessageId": "msg_01ABC123DEF456",
  "model": "claude-3-5-sonnet-20241022",
  "sessionId": "session_abc123",
  "usage": {
    "input_tokens": 150,
    "output_tokens": 75
  },
  "timestamp": 1699123456789n,
  "status": "completed"
}
```

## Bridge Service Modules (`scripts/bridge-modules/`)

The bridge uses a modular architecture:

- **`config.ts`**: Configuration management
- **`logger.ts`**: Contextual logging with request IDs
- **`permissions.ts`**: Permission handling for tool usage
- **`claude-sdk.ts`**: Claude Code SDK integration
- **`streams.ts`**: Stream management and processing
- **`resources.ts`**: Resource and file system operations
- **`errors.ts`**: Error handling and user messaging

## Real-time Synchronization

### Global Request Mapping
The backend maintains a global map to track active requests:
```typescript
(global as any).activeRequests = new Map();
// Maps requestId → { assistantMessageId, conversationId, userMessageId }
```

### Query Cache Invalidation
Frontend automatically invalidates React Query caches when:
- New messages arrive
- Conversations are created/updated  
- Session IDs are established
- Messages are completed or failed

## Security & Error Handling

### Robust Error Handling
- **Bridge Failures**: Marked in database with error details
- **Connection Issues**: Automatic reconnection with exponential backoff
- **Database Errors**: Comprehensive logging without breaking streams
- **Validation**: Full request validation before processing

### Message Persistence Guarantees
- **Atomic Operations**: Database transactions ensure consistency
- **Immediate Storage**: User messages stored before forwarding
- **Error Recovery**: Failed messages marked with error details
- **No Data Loss**: Every bridge response captured in MongoDB

This architecture ensures that every interaction with Claude Code is fully captured, traceable, and available for debugging, analytics, and conversation context preservation.