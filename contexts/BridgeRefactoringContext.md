# Bridge Service Modular Refactoring - August 2025

## Overview
This document details the comprehensive refactoring of the Claude Code Bridge service from a monolithic 1200+ line file into a clean, modular architecture with separated concerns and enhanced functionality.

## Problem Statement
The original `scripts/bridge.ts` file had grown to 1,218 lines containing multiple responsibilities:
- Configuration management (hardcoded values)
- Permission handling (800+ lines of inline methods)
- Claude SDK integration (complex inline query execution)
- WebSocket/HTTP handling (mixed throughout)
- File operations (inline file scanning)
- Basic logging (simple console.log statements)
- Basic error handling (try/catch blocks only)

This created maintenance challenges, testing difficulties, and code duplication issues.

## Solution Architecture

### New Modular Structure
The bridge was refactored into 9 specialized modules plus a thin orchestrator:

```
scripts/
├── bridge.ts (116 lines - orchestrator only)
└── bridge-modules/
    ├── index.ts (ModularClaudeCodeBridge - main orchestrator)
    ├── config.ts (Configuration management)
    ├── logger.ts (Structured logging)
    ├── permissions.ts (Permission system)
    ├── claude-sdk.ts (Claude Code SDK wrapper)
    ├── streams.ts (Stream management)
    ├── http-client.ts (HTTP client with retries)
    ├── resources.ts (Resource & file management)
    └── errors.ts (Error handling with recovery)
```

## Module Details

### 1. Configuration Management (`config.ts`)
- **Purpose**: Centralized configuration with environment variable overrides
- **Features**:
  - Environment-aware configuration loading
  - Validation of configuration values
  - Development/production presets
  - WebSocket-specific settings
- **Key Configuration**:
  ```typescript
  interface BridgeConfig {
    // Server settings
    port: number;
    backendUrl: string;
    websocketTimeout: number;
    reconnectionAttempts: number;
    
    // Claude Code settings
    maxTurns: number;
    claudeCodePath: string;
    
    // Permission settings
    permissionCacheDuration: number;
    progressiveTimeoutStages: TimeoutStage[];
    
    // File operation limits
    maxFileSize: number;
    maxDirectoryDepth: number;
    excludeDirectories: string[];
  }
  ```

### 2. Structured Logging (`logger.ts`)
- **Purpose**: Professional logging system with contextual information
- **Features**:
  - Multiple log levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
  - Contextual loggers with request IDs and module names
  - Structured JSON output for analysis
  - File logging with rotation
  - Convenience methods for common operations
- **Usage Pattern**:
  ```typescript
  const contextLogger = new ContextualLogger(logger, 'ModuleName', requestId);
  contextLogger.info('Operation started', { key: 'value' });
  ```

### 3. Permission Management (`permissions.ts`)
- **Purpose**: Advanced permission system with progressive timeout strategy
- **Features**:
  - Risk level assessment (LOW, MEDIUM, HIGH, PLAN)
  - Progressive timeout strategy (30s → 60s → 120s)
  - WebSocket-based permission requests (vs old HTTP)
  - Permission caching with TTL
  - Plan review system for ExitPlanMode
  - Conservative fallback decisions
- **Risk Assessment**:
  - HIGH: Bash, Write, Edit, MultiEdit
  - MEDIUM: WebFetch, NotebookEdit
  - PLAN: ExitPlanMode (special handling)
  - LOW: Read, LS, Glob, Grep (auto-allowed)

### 4. Claude SDK Wrapper (`claude-sdk.ts`)
- **Purpose**: Clean abstraction over Claude Code SDK
- **Features**:
  - Request/response lifecycle management
  - Automatic session ID tracking
  - Tool permission integration
  - Query abort functionality
  - Message content analysis and logging
  - Project-scoped permission mode handling
- **Request Flow**:
  1. Build Claude options with permission mode
  2. Create prompt stream with project context
  3. Execute query with permission callbacks
  4. Stream responses with detailed logging
  5. Handle completion and cleanup

### 5. Stream Management (`streams.ts`)
- **Purpose**: WebSocket stream lifecycle management
- **Features**:
  - Stream controller with metrics tracking
  - Health monitoring and automatic cleanup
  - Server-Sent Events (SSE) support
  - Stream error handling and recovery
  - Memory-efficient streaming
- **Stream States**: pending, active, completed, error, aborted

### 6. HTTP Client (`http-client.ts`)
- **Purpose**: Robust HTTP client for backend communication
- **Features**:
  - Connection pooling and keep-alive
  - Exponential backoff retry logic
  - Request/response metrics tracking
  - Timeout handling
  - Conservative retry policies (don't retry 4xx errors)
- **Retry Strategy**: Base delay × 2^(attempt-1) + jitter, max 30s

### 7. Resource Management (`resources.ts`)
- **Purpose**: System resource monitoring and file operations
- **Features**:
  - Memory usage monitoring
  - Concurrent request limiting
  - File operation validation and limits
  - Directory scanning with security checks
  - Health status reporting
  - Periodic cleanup processes
- **Safety Features**:
  - Path traversal protection
  - File size limits (10MB default)
  - Directory depth limits (5 levels)
  - Excluded directory lists

### 8. Error Handling (`errors.ts`)
- **Purpose**: Comprehensive error handling with recovery strategies
- **Features**:
  - Structured error classification
  - Automatic error recovery strategies
  - Error rate monitoring
  - System health assessment
  - User-friendly error messages
- **Error Types**:
  - VALIDATION_ERROR, PERMISSION_ERROR, RESOURCE_ERROR
  - CLAUDE_SDK_ERROR, NETWORK_ERROR, FILE_SYSTEM_ERROR
  - TIMEOUT_ERROR, CONFIGURATION_ERROR, STREAM_ERROR
- **Recovery Strategies**:
  - Network errors: retry with exponential backoff
  - Timeout errors: increase timeout on retry
  - Resource errors: trigger garbage collection

### 9. Main Orchestrator (`index.ts`)
- **Purpose**: Coordinates all modules and manages service lifecycle
- **Features**:
  - Dependency injection of all modules
  - WebSocket server setup and event routing
  - Backend connection management
  - Request routing to appropriate modules
  - Graceful shutdown handling
  - Health status aggregation

## WebSocket Architecture

### Connection Flow
1. **Bridge Startup**: Create HTTP server → Socket.IO server → Connect to backend
2. **Client Connection**: Accept WebSocket connections → Set up event handlers
3. **Request Processing**: Route requests to appropriate modules → Stream responses
4. **Backend Integration**: Bidirectional communication for permissions and data

### Event Types
- **Execution**: `claude:execute`, `claude:stream`, `claude:complete`
- **Control**: `claude:abort`, `bridge:health`
- **Files**: `files:list`, `files:content`
- **Permissions**: `permission:request`, `permission:response`

## Benefits Achieved

### Maintainability
- **90% reduction** in main bridge.ts file (1,218 → 116 lines)
- **Single responsibility** principle applied to each module
- **Clear interfaces** between modules
- **Easy to understand** code organization

### Testability
- **Independent testing** of each module
- **Mockable dependencies** through dependency injection
- **Isolated functionality** for unit tests
- **Integration test support** through orchestrator

### Performance
- **Resource monitoring** with automatic cleanup
- **Memory management** with garbage collection triggers
- **Connection pooling** for HTTP requests
- **Stream health monitoring** with automatic recovery

### Reliability
- **Error recovery strategies** for transient failures
- **Progressive timeout handling** for user interactions
- **Graceful degradation** when services are unavailable
- **Health monitoring** with issue detection

### Developer Experience
- **Structured logging** with searchable context
- **Clear error messages** for debugging
- **Configuration validation** with helpful error messages
- **Comprehensive metrics** for monitoring

## Migration Notes

### Backward Compatibility
- **API unchanged**: All existing WebSocket events work as before
- **Configuration compatible**: Environment variables still supported
- **Deployment unchanged**: Same startup command and arguments

### New Capabilities
- **Enhanced logging**: Structured logs with request tracing
- **Better error handling**: Automatic recovery and user-friendly messages  
- **Resource monitoring**: Memory and performance metrics
- **Advanced permissions**: Progressive timeout with fallback decisions
- **Health endpoints**: Service status and diagnostics

## Configuration Examples

### Environment Variables
```bash
# Server settings
BRIDGE_PORT=8080
BRIDGE_BACKEND_URL=http://localhost:3001

# Claude Code settings
CLAUDE_CODE_PATH=/path/to/claude
BRIDGE_MAX_TURNS=20

# Resource limits
BRIDGE_MAX_CONCURRENT=10
BRIDGE_WORKING_DIR=/workspace

# Logging
BRIDGE_LOG_FILE=true
BRIDGE_LOG_PATH=/tmp/bridge-service.log
```

### Development vs Production
```typescript
// Development: More verbose logging, longer timeouts
ConfigManager.createDevelopmentConfig()

// Production: Conservative limits, faster responses
ConfigManager.createProductionConfig()
```

## Monitoring and Observability

### Health Check Endpoint
```bash
curl http://localhost:8080/bridge:health
```
Returns: service status, active requests, resource metrics, error statistics

### Log Structure
```json
{
  "timestamp": "2025-08-12T10:00:00.000Z",
  "level": "INFO",
  "module": "PermissionManager",
  "requestId": "req_123",
  "message": "Permission granted for tool",
  "context": { "toolName": "Read", "decision": "allow_once" }
}
```

### Metrics Available
- Request processing times
- Error rates by module
- Memory usage trends
- Active connection counts
- Permission approval rates

## Future Enhancements

### Planned Improvements
1. **Metrics Export**: Prometheus/OpenTelemetry integration
2. **Advanced Caching**: Redis integration for permission cache
3. **Load Balancing**: Multiple bridge instance support
4. **Security**: Rate limiting and authentication
5. **Testing**: Comprehensive test suite for all modules

### Extensibility Points
- **New permission strategies**: Add custom risk assessment
- **Custom logging**: Integrate with external log aggregation
- **Additional transports**: Support more communication protocols
- **Plugin system**: Add custom modules for specific needs

## Troubleshooting Guide

### Common Issues
1. **Connection failures**: Check backend URL and port configuration
2. **Permission timeouts**: Verify progressive timeout configuration
3. **Memory issues**: Monitor resource metrics and cleanup frequency
4. **File operation errors**: Check path validation and security settings

### Debug Commands
```bash
# Check service status
curl localhost:8080/bridge:health

# View structured logs
tail -f /tmp/bridge-service.log | jq .

# Monitor resource usage
# Look for "ResourceManager" entries in logs
```

## Technical Debt Resolved

### Before Refactoring
- ❌ 1,200+ line monolithic file
- ❌ Mixed responsibilities
- ❌ Hardcoded configuration
- ❌ Basic error handling
- ❌ Console-only logging
- ❌ No resource monitoring
- ❌ Difficult to test
- ❌ No recovery mechanisms

### After Refactoring
- ✅ 116-line orchestrator + 9 focused modules
- ✅ Single responsibility principle
- ✅ Environment-aware configuration
- ✅ Comprehensive error handling with recovery
- ✅ Structured logging with context
- ✅ Resource monitoring and health checks
- ✅ Testable modular architecture
- ✅ Automatic recovery strategies

## Conclusion

This refactoring transformed a complex, monolithic bridge service into a professional, maintainable system while preserving all existing functionality and adding significant new capabilities. The modular architecture provides a solid foundation for future enhancements and makes the system much easier to understand, test, and maintain.

The 90% reduction in the main file complexity, combined with enhanced functionality through specialized modules, represents a significant improvement in code quality and system reliability.