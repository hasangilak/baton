    Create a comprehensive test script to capture all WebSocket message types from Claude Code SDK, analyze their structure, and refactor 
    the chat components for optimal WebSocket-driven rendering.

    Phase 1: WebSocket Message Analysis & Testing

    1.1 Create Bridge Test Script (test-bridge-websocket-analysis.js)

    - Purpose: Capture all possible Claude Code message types via WebSocket
    - Features:
      - Connect to bridge service WebSocket (ws://localhost:8080)
      - Send various test prompts to trigger different message types
      - Capture and log all claude:stream responses with full metadata
      - Save responses to JSON files for analysis
      - Test scenarios: basic chat, tool usage, system messages, results, errors

    1.2 Message Type Categorization

    Based on Claude Code SDK types and our current findings:

    Core SDK Message Types:
    - SDKUserMessage: User input messages
    - SDKAssistantMessage: Claude's responses with content blocks
    - SDKSystemMessage: Initialization, status, configuration 
    - SDKResultMessage: Final execution results with usage/cost data

    StreamResponse Categories:
    - claude_json - Main Claude SDK messages (assistant, system, result)
    - error - Error conditions and failures
    - done - Completion signals
    - aborted - User or system interruptions

    Message Subtypes to Identify:
    - System: init, configuration, tool_list, mcp_status
    - Result: success, error_max_turns, error_during_execution
    - Assistant: streaming vs complete, tool usage, thinking tokens

    Phase 2: Chat Component Architecture Analysis

    2.1 Current Component Structure Assessment

    Existing Components:
    - MessageTypeRenderer.tsx - Central dispatcher (✅ good foundation)
    - AssistantMessage.tsx - Claude responses (✅ supports new format)
    - SystemMessage.tsx - System notifications (needs WebSocket integration)
    - ToolMessage.tsx - Tool execution display (needs enhancement)
    - ResultMessage.tsx - Execution results (needs SDK format support)
    - UserMessage.tsx - User input (✅ complete)
    - ErrorMessage.tsx, AbortMessage.tsx - Error handling

    2.2 WebSocket Integration Points

    - Components need real-time updates from WebSocket streams
    - Message state management for streaming vs persisted messages
    - Component selection based on StreamResponse.type and SDK message types

    Phase 3: Component Refactoring Strategy

    3.1 Enhanced Message Type Dispatcher

    Update MessageTypeRenderer.tsx:
    - Add WebSocket message type discrimination
    - Support for StreamResponse format detection
    - Enhanced fallback handling for unknown types
    - Performance optimization for streaming messages

    3.2 WebSocket-Aware Component Updates

    SystemMessage.tsx Enhancements:
    - Handle Claude Code SDK system messages
    - Display initialization status, tool lists, MCP server status
    - Show session information and configuration changes

    AssistantMessage.tsx Improvements:
    - Enhanced streaming indicator for real-time updates
    - Better handling of content blocks from SDK
    - Token usage and cost display from usage metadata
    - Session ID tracking for debugging

    ResultMessage.tsx SDK Integration:
    - Parse SDK result format with cost/usage data
    - Display execution duration and performance metrics
    - Handle both success and error result subtypes

    ToolMessage.tsx WebSocket Support:
    - Real-time tool execution status updates
    - Enhanced risk assessment for WebSocket tools
    - Better integration with SDK tool usage data

    3.3 New Component Development

    StreamingStatusIndicator.tsx:
    - Real-time status display for active WebSocket messages
    - Progress indicators for long-running operations
    - Connection health monitoring

    MessageMetadataPanel.tsx:
    - Expandable panel for SDK metadata
    - Session tracking, token usage, model information
    - Debug information for development

    Phase 4: WebSocket Message Flow Integration

    4.1 Real-time Component Selection

    - WebSocket listener in chat page that routes messages to appropriate components
    - Message deduplication to prevent duplicate renders
    - Optimistic UI updates during streaming

    4.2 State Management Updates

    - Enhanced message state to handle WebSocket vs database messages
    - Real-time synchronization between streaming and persisted data
    - Conflict resolution for message updates

    Phase 5: Testing & Validation

    5.1 Component Testing

    - Test all message types with the new dispatcher
    - Verify real-time updates work correctly
    - Ensure performance with high-frequency WebSocket messages

    5.2 Integration Testing

    - End-to-end testing with bridge service
    - Verify all Claude Code SDK message types render correctly
    - Test error scenarios and fallback handling

    Implementation Benefits

    1. Real-time Responsiveness: Components update immediately from WebSocket streams
    2. Complete SDK Support: Full support for all Claude Code message types
    3. Performance Optimized: Efficient component selection and rendering
    4. Extensible Architecture: Easy to add new message types and components
    5. Debug-friendly: Rich metadata display for development
    6. Fallback Safe: Graceful handling of unknown message types

    Files to Create/Modify

    New Files:
    - test-bridge-websocket-analysis.js - WebSocket testing script
    - StreamingStatusIndicator.tsx - Real-time status component
    - MessageMetadataPanel.tsx - SDK metadata display

    Updated Files:
    - MessageTypeRenderer.tsx - Enhanced dispatcher
    - SystemMessage.tsx - SDK system message support  
    - ResultMessage.tsx - SDK result format integration
    - ToolMessage.tsx - WebSocket tool integration
    - Chat page components - WebSocket message routing

    This plan ensures comprehensive WebSocket message analysis, optimal component architecture, and seamless real-time chat experience with 
    full Claude Code SDK support.