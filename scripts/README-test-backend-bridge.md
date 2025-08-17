# Backend-Bridge Test Script

This script tests the backend and bridge connection directly without frontend involvement, capturing Claude's thinking/status messages and displaying them with proper formatting.

## Prerequisites

1. **Backend server running** on port 3001 (Docker or manual)
2. **Bridge service running** on port 8080:
   ```bash
   bun run scripts/bridge.ts
   ```

## Usage

```bash
# Basic usage - simple greeting
node scripts/test-backend-bridge.js

# Complex scenario with tools
node scripts/test-backend-bridge.js --scenario complex

# Stock price query scenario
node scripts/test-backend-bridge.js --scenario stock

# Verbose mode (shows full JSON details)
node scripts/test-backend-bridge.js --scenario complex --verbose

# Custom message
node scripts/test-backend-bridge.js --scenario custom --message "Tell me about React hooks"
```

## Available Scenarios

- **simple**: Send "Hi" message - Tests basic response and thinking messages
- **complex**: Search for mustang car prices - Tests tool execution and status messages  
- **stock**: Query Microsoft stock price - Tests web search tool usage
- **custom**: Use custom message via `--message` parameter

## What the Script Captures

### Message Types Displayed:
- 🤔 **Thinking/Status messages** (yellow) - Claude's internal thinking and status updates
- 💬 **Assistant responses** (green) - Final responses from Claude
- 🔧 **Tool usage** (cyan) - When Claude uses tools like WebSearch
- 📊 **Result messages** (blue) - Final results with usage statistics
- ⚠️ **Errors** (red) - Any errors during processing

### Status Messages Examples:
- "I'll search for the current Microsoft stock price"
- "Let me check the latest car prices"
- "I'm going to help you with..."

## Output Format

```
[timestamp] [type] [content preview]
```

Example output:
```
🤔 [14:23:45.123] Status (1487ms): I'll search for the current Microsoft stock price
🔧 [14:23:47.456] Tool Use (2140ms): WebSearch
💬 [14:23:50.789] Assistant (3206ms): Microsoft (MSFT) is currently trading at **$520.17**...
📊 [14:23:50.810] Result (success): Microsoft (MSFT) is currently trading at **$520.17**...
```

## Verbose Mode

Add `--verbose` to see:
- Full JSON message details
- Complete tool input parameters
- Token usage statistics
- Full text content (not truncated)

## Testing Tips

1. **Check bridge logs** in parallel:
   ```bash
   tail -f /tmp/claude-bridge-debug.log
   ```

2. **Monitor backend logs** if running Docker:
   ```bash
   docker logs baton-backend-1 -f
   ```

3. **Test sequence**:
   - Start with `simple` scenario to verify basic connection
   - Use `complex` or `stock` scenarios to test tool usage
   - Compare output with bridge debug logs

## Troubleshooting

- **Connection refused**: Ensure backend is running on port 3001
- **No bridge service connected**: Start the bridge service with `bun run scripts/bridge.ts`
- **No thinking messages**: Verify `maxThinkingTokens: 8192` is set in bridge-modules/claude-sdk.ts
- **Script hangs**: Press Ctrl+C to exit, or wait for 60-second timeout

## Exit

- **Manual**: Press Ctrl+C
- **Automatic**: Script exits after 60 seconds