# Claude Code Chat Bridge

This document explains how to integrate your locally installed Claude Code with Baton's chat service.

## Architecture

The chat service runs in Docker and doesn't have direct access to your local Claude Code installation. To bridge this gap, we use a local handler script that:

1. Connects to the Baton backend via WebSocket (Socket.IO)
2. Receives chat requests from the backend
3. Processes them using your local Claude Code
4. Streams responses back to the backend

## Setup

### Prerequisites

1. Claude Code installed locally:
```bash
npm install -g @anthropic-ai/claude-code
```

2. Baton backend running (via Docker or locally):
```bash
docker compose up -d
```

### Running the Chat Bridge

1. Start the chat bridge handler:
```bash
./scripts/start-chat-bridge.sh
```

Or manually:
```bash
cd /home/hassan/work/baton
npm install socket.io-client axios
node scripts/chat-handler.js
```

2. The handler will connect to the backend and start processing chat requests

## How It Works

### Request Flow

1. **User sends message** → Frontend chat UI
2. **Backend queues request** → Stores in memory with timeout
3. **Bridge picks up request** → Via WebSocket or polling
4. **Claude Code processes** → Using local installation
5. **Response streamed back** → Real-time updates to UI

### Communication Methods

The bridge supports two communication methods:

1. **WebSocket (Primary)**: Real-time bidirectional communication
   - Instant request delivery
   - Streaming responses
   - Automatic reconnection

2. **HTTP Polling (Fallback)**: When WebSocket unavailable
   - Polls `/api/chat/pending` endpoint
   - Posts responses to `/api/chat/response`

## Configuration

Environment variables:

- `BACKEND_URL`: Backend server URL (default: `http://localhost:3001`)
- `POLLING_INTERVAL`: Polling interval in ms (default: 1000)

## API Endpoints

### GET /api/chat/pending
Returns pending chat requests that need processing.

### POST /api/chat/response
Receives responses from the chat bridge.

```json
{
  "messageId": "msg-123",
  "content": "Response text...",
  "isComplete": false,
  "error": null
}
```

## WebSocket Events

### Client → Server

- `chat-bridge:connect`: Register as chat bridge
- `chat-bridge:response`: Send response data

### Server → Client

- `chat:request`: New chat request to process
- `chat:pending`: Batch of pending requests

## Troubleshooting

### Bridge not connecting

1. Check backend is running: `curl http://localhost:3001/health`
2. Check Claude Code is installed: `claude --version`
3. Check network connectivity

### Messages not processing

1. Check bridge console for errors
2. Verify Claude Code works: `claude -p "test"`
3. Check backend logs: `docker compose logs backend`

### Performance Issues

1. Adjust `POLLING_INTERVAL` for less frequent polling
2. Ensure only one bridge instance is running
3. Check system resources

## Development

To modify the chat handler:

1. Edit `scripts/chat-handler.js`
2. Restart the bridge
3. Test with chat UI

To modify the backend service:

1. Edit `src/services/chat.service.ts`
2. Rebuild: `npm run build`
3. Restart backend: `docker compose restart backend`