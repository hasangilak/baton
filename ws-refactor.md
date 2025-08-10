# WebSocket Refactoring Plan

## Overview

This document outlines the migration plan to convert the Baton chat interface and Claude Code bridge service from a mixed HTTP/WebSocket architecture to a pure WebSocket-based communication system. The goal is to eliminate HTTP API endpoints for real-time communication while maintaining WebSocket-only architecture for Claude Code SDK integration and chat interactions.

## Current Architecture Analysis

### Bridge Service (`scripts/bridge.ts`)
- **Current**: HTTP server with SSE streaming for Claude Code SDK responses
- **Port**: 8080
- **Endpoints**:
  - `POST /execute` - Execute Claude Code requests
  - `POST /abort/:requestId` - Abort running requests
  - `GET /health` - Health checks
  - `GET /files/list` - File listing
  - `POST /files/content` - File content retrieval

### Backend Chat API (`backend/src/routes/chat.ts`)
- **Current**: Mixed HTTP endpoints + WebSocket notifications
- **Main endpoints**:
  - `POST /api/chat/messages/stream-bridge` - Bridge-based streaming
  - `POST /api/chat/messages/stream-webui` - WebUI streaming  
  - `GET /api/chat/messages/:conversationId` - Message retrieval
  - `POST /api/chat/conversations` - Conversation management
  - Permission and prompt management endpoints

### Frontend (`frontend/src/services/chat.service.ts`)
- **Current**: HTTP API calls with SSE streaming + WebSocket for notifications
- **Methods**: createConversation, sendMessage (HTTP), real-time updates (WebSocket)

## Migration Plan

### Phase 1: Create Documentation and Plan
**Status**: ✅ Complete
- Document current architecture
- Define WebSocket protocol specifications
- Create migration roadmap

### Phase 2: Bridge Service WebSocket Conversion

#### Files to Modify:
- `scripts/bridge.ts` - Convert HTTP server to WebSocket server
- `backend/src/index.ts` - Add WebSocket handlers for bridge communication

#### Changes:
1. **Replace HTTP server with WebSocket server**:
   ```typescript
   // Old: HTTP server with Bun.serve()
   // New: WebSocket server using Socket.IO or ws library
   ```

2. **Convert HTTP endpoints to WebSocket events**:
   ```typescript
   // Old: POST /execute
   // New: socket.on('claude:execute', handler)
   
   // Old: POST /abort/:requestId  
   // New: socket.on('claude:abort', handler)
   ```

3. **Replace SSE streaming with WebSocket events**:
   ```typescript
   // Old: res.write(`data: ${JSON.stringify(response)}\n\n`)
   // New: socket.emit('claude:stream', response)
   ```

4. **Convert permission system**:
   ```typescript
   // Old: HTTP polling to backend API
   // New: socket.emit('permission:request') → socket.on('permission:response')
   ```

#### New WebSocket Events:
- `claude:execute` - Execute Claude Code request
- `claude:stream` - Stream Claude Code response
- `claude:complete` - Signal completion
- `claude:error` - Error handling
- `claude:abort` - Abort request
- `claude:aborted` - Confirm abortion
- `permission:request` - Request permission
- `permission:response` - Permission response
- `bridge:health` - Health check
- `files:list` - File listing
- `files:content` - File content

### Phase 3: Backend Chat API Modernization

#### Files to Modify:
- `backend/src/routes/chat.ts` - Remove streaming endpoints, keep message fetching
- `backend/src/handlers/streaming-chat.ts` - Update for WebSocket communication  
- `backend/src/index.ts` - Add comprehensive WebSocket chat handlers

#### Changes:
1. **Remove HTTP streaming endpoints**:
   - Remove `POST /api/chat/messages/stream-bridge`
   - Remove `POST /api/chat/messages/stream-webui`
   - Remove `POST /api/chat/messages/abort/:requestId`

2. **Keep HTTP endpoints for data operations**:
   - Keep `GET /api/chat/messages/:conversationId` - Message history
   - Keep `GET /api/chat/conversations/:projectId` - Conversation list
   - Keep `POST /api/chat/upload` - File uploads
   - Keep `POST /api/chat/conversations` - Conversation creation

3. **Add WebSocket handlers in `backend/src/index.ts`**:
   ```typescript
   // Chat message sending
   socket.on('chat:send-message', async (data) => {
     // Handle message sending via WebSocket
     // Stream responses back via socket.emit('chat:stream-response')
   });
   
   // Bridge communication
   socket.on('bridge:connect', () => {
     // Handle bridge connection
     socket.join('claude-bridge');
   });
   
   socket.on('claude:execute', async (request) => {
     // Forward to bridge service via WebSocket
   });
   ```

#### New WebSocket Events:
- `chat:send-message` - Send chat message
- `chat:stream-response` - Stream chat response
- `chat:message-complete` - Message completion
- `chat:error` - Chat error
- `conversation:join` - Join conversation room
- `conversation:leave` - Leave conversation room
- `bridge:connect` - Bridge service connection
- `bridge:disconnect` - Bridge service disconnection

### Phase 4: Frontend WebSocket Integration

#### Files to Modify:
- `frontend/src/services/chat.service.ts` - Replace HTTP with WebSocket
- `frontend/src/hooks/useChat.ts` - Update messaging logic
- `frontend/src/hooks/useWebSocket.ts` - Add chat handlers

#### Changes:
1. **Update `chat.service.ts`**:
   ```typescript
   // Old: HTTP fetch for sendMessage
   // New: socket.emit('chat:send-message', data)
   
   // Old: SSE streaming handling
   // New: socket.on('chat:stream-response', onStream)
   ```

2. **Update `useChat.ts`**:
   ```typescript
   // Replace HTTP sendMessage with WebSocket emission
   // Update streaming response handling
   // Maintain optimistic UI updates
   ```

3. **Extend `useWebSocket.ts`**:
   ```typescript
   // Add chat-specific WebSocket event handlers
   socket.on('chat:stream-response', handleStreamResponse);
   socket.on('chat:message-complete', handleMessageComplete);
   socket.on('permission:request', handlePermissionRequest);
   ```

### Phase 5: Protocol Standardization

#### Event Flow Specifications:

**Bridge Communication Flow**:
```
Frontend → Backend: chat:send-message
Backend → Bridge: claude:execute  
Bridge → Backend: claude:stream (multiple)
Backend → Frontend: chat:stream-response (multiple)
Bridge → Backend: claude:complete
Backend → Frontend: chat:message-complete
```

**Permission Request Flow**:
```
Bridge: permission:request → Backend
Backend: interactive_prompt → Frontend
Frontend: permission:response → Backend  
Backend: permission:response → Bridge
```

**Error Handling Flow**:
```
Any Component: *:error → Backend
Backend: error → Frontend (with error details)
```

#### WebSocket Room Management:
- `conversation-{id}` - Conversation-specific events
- `project-{id}` - Project-specific events  
- `claude-bridge` - Bridge service communication
- `user-{id}` - User-specific events

## Implementation Benefits

### Performance Improvements
- **Reduced Latency**: Eliminate HTTP request/response overhead
- **True Real-time**: Bidirectional communication without polling
- **Connection Reuse**: Single WebSocket connection for all real-time operations

### Architecture Simplification  
- **Unified Protocol**: Single WebSocket approach across the system
- **Event-Driven**: Clear event-based communication patterns
- **Scalable**: Better support for concurrent operations

### Developer Experience
- **Consistent API**: Uniform event-based interface
- **Better Debugging**: Clear event flow tracking
- **Type Safety**: Strong typing for all WebSocket events

## Backward Compatibility

### Retained HTTP Endpoints
The following HTTP endpoints will be maintained for specific use cases:

1. **Data Fetching** (Read-only operations):
   - `GET /api/chat/messages/*` - Message history
   - `GET /api/chat/conversations/*` - Conversation lists
   - `GET /api/chat/conversation/*` - Conversation details

2. **File Operations**:
   - `POST /api/chat/upload` - File uploads
   - File serving endpoints

3. **System Operations**:
   - `GET /health` - Health checks
   - Authentication endpoints (if applicable)

### Migration Strategy
- Phase rollout to minimize disruption
- Feature flags for gradual migration
- Comprehensive testing at each phase
- Rollback capability if issues arise

## Testing Strategy

### Unit Tests
- WebSocket event handlers
- Message serialization/deserialization
- Error handling scenarios

### Integration Tests  
- End-to-end message flow
- Bridge service communication
- Permission system functionality
- File upload with WebSocket coordination

### Performance Tests
- Concurrent WebSocket connections
- Message throughput benchmarks
- Memory usage optimization
- Connection stability under load

## Deployment Considerations

### Infrastructure
- WebSocket connection limits
- Load balancer WebSocket support
- Session affinity requirements
- Monitoring and logging setup

### Monitoring
- WebSocket connection metrics
- Event processing latency
- Error rates and types
- Bridge service health

### Security
- WebSocket authentication
- Message validation
- Rate limiting
- CORS configuration

## Timeline

### Phase 2: Bridge Service Conversion (Day 1-2)
- Convert `scripts/bridge.ts` to WebSocket server
- Update backend WebSocket handlers
- Test bridge communication

### Phase 3: Backend API Modernization (Day 2-3)  
- Remove HTTP streaming endpoints
- Implement WebSocket chat handlers
- Update routing logic

### Phase 4: Frontend Integration (Day 3-4)
- Update frontend services
- Modify chat hooks  
- Test end-to-end functionality

### Phase 5: Testing & Optimization (Day 4-5)
- Comprehensive testing
- Performance optimization
- Documentation updates

## Success Criteria

- ✅ All real-time communication uses WebSocket exclusively
- ✅ HTTP endpoints only for data fetching and file operations
- ✅ No breaking changes to user experience
- ✅ Improved performance metrics
- ✅ Comprehensive test coverage
- ✅ Clear documentation and event specifications

## Risk Mitigation

### Technical Risks
- **WebSocket Connection Issues**: Implement reconnection logic
- **Message Ordering**: Use sequence numbers for critical operations  
- **Memory Leaks**: Proper event listener cleanup
- **Browser Compatibility**: Fallback mechanisms if needed

### Operational Risks
- **Deployment Issues**: Phased rollout with rollback capability
- **Performance Degradation**: Load testing and monitoring
- **Data Loss**: Message persistence and retry mechanisms
- **Service Dependencies**: Bridge service reliability improvements

## Conclusion

This WebSocket refactoring plan provides a comprehensive approach to modernizing the Baton chat interface and Claude Code bridge service. By eliminating HTTP APIs for real-time communication and standardizing on WebSocket protocols, the system will achieve better performance, simpler architecture, and improved developer experience while maintaining backward compatibility for essential data operations.