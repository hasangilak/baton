# Archived Documentation

This directory contains documentation files that have been archived during the documentation consolidation project completed in August 2025.

## Why These Were Archived

These documents contained:
- **Obsolete references** to removed handlers (webui-chat-handler.js, webui-chat-handler-enhanced.js)
- **Duplicate information** that was consolidated into comprehensive guides
- **Outdated implementation details** that no longer match the current system

## Archived Files

### `CHAT_CLAUDE_CODE_BRIDGE.md`
- **Archived**: August 2025
- **Reason**: Obsolete - referenced removed chat-handler.js
- **Replacement**: [CLAUDE_CODE_INTEGRATION.md](../CLAUDE_CODE_INTEGRATION.md) - WebUI Integration section

### `CHAT_INTEGRATION.md`
- **Archived**: August 2025
- **Reason**: Obsolete - documented removed webui-chat-handler.js integration
- **Replacement**: [CLAUDE_CODE_INTEGRATION.md](../CLAUDE_CODE_INTEGRATION.md) - Complete integration guide

### `CLAUDE_CODE_CONTEXT_MANAGEMENT.md`
- **Archived**: August 2025
- **Reason**: Consolidated - token management and session handling
- **Replacement**: [TECHNICAL_REFERENCE.md](../TECHNICAL_REFERENCE.md) - Performance Considerations section

### `CLAUDE_CODE_INTERACTIVE_PROMPTS.md`
- **Archived**: August 2025
- **Reason**: Consolidated - permission system documentation
- **Replacement**: [CLAUDE_CODE_INTEGRATION.md](../CLAUDE_CODE_INTEGRATION.md) - Permission Management section

### `PERMISSION_SYSTEM_ENHANCEMENT.md`
- **Archived**: August 2025
- **Reason**: Obsolete - documented features for removed webui-chat-handler-enhanced.js
- **Replacement**: [CLAUDE_CODE_INTEGRATION.md](../CLAUDE_CODE_INTEGRATION.md) - Permission Management section

### `MCP_INTEGRATION.md`
- **Archived**: August 2025
- **Reason**: Replaced with updated version
- **Replacement**: [MCP_SERVER_GUIDE.md](../MCP_SERVER_GUIDE.md) - Updated with current implementation

## New Documentation Structure

The documentation has been consolidated into 4 main documents:

1. **[GETTING_STARTED.md](../GETTING_STARTED.md)** - Quick setup with bridge.ts
2. **[CLAUDE_CODE_INTEGRATION.md](../CLAUDE_CODE_INTEGRATION.md)** - Complete integration guide
3. **[MCP_SERVER_GUIDE.md](../MCP_SERVER_GUIDE.md)** - MCP server documentation
4. **[TECHNICAL_REFERENCE.md](../TECHNICAL_REFERENCE.md)** - Developer reference

## Migration Benefits

- ✅ **Eliminated obsolete references** to removed handlers
- ✅ **Reduced maintenance burden** from 11+ docs to 4 focused guides
- ✅ **Improved accuracy** with implementation-matched examples
- ✅ **Better user experience** with clear, tested setup instructions
- ✅ **Single source of truth** for each major feature

## Recovery

If you need information from archived docs for historical reference, they remain available in this directory. However, **do not use them for setup or integration** as they contain outdated instructions that will not work with the current system.

Use the new documentation structure for all current development and integration work.