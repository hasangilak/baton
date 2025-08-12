●User approved Claude's plan:
  ⎿  Frontend Chat Unification: UX-First Implementation Plan with File Targets

     Core UX Problems to Solve

     1. Session Confusion: Users don't understand when sessions are initializing vs ready
     2. Broken Message Flow: Messages fail without clear feedback when sessions are missing
     3. Loading State Gaps: Users see empty states without knowing what's happening
     4. Error Recovery Complexity: When things break, users can't easily fix them
     5. Inconsistent Connection States: Multiple hooks create conflicting UI states

     Phase 1: Session Status UX Foundation (Priority: Critical)

     1.1 Create Session Status Component

     - Todo: Design and implement SessionStatusIndicator component with clear visual states
       - File: frontend/src/components/chat/shared/SessionStatusIndicator.tsx (CREATE)
     - Todo: Add session loading spinner with "Initializing Claude session..." text
       - File: frontend/src/components/chat/shared/SessionStatusIndicator.tsx (EDIT)
     - Todo: Add session ready indicator with truncated session ID
       - File: frontend/src/components/chat/shared/SessionStatusIndicator.tsx (EDIT)
     - Todo: Add session error state with recovery action button
       - File: frontend/src/components/chat/shared/SessionStatusIndicator.tsx (EDIT)
     - Todo: Make status indicator non-intrusive but informative (top-right corner)
       - File: frontend/src/components/chat/layouts/ChatPageDesktop.tsx (EDIT)

     1.2 Add Session Loading States to Input

     - Todo: Disable message input during session initialization with clear messaging
       - File: frontend/src/components/chat/input/ConversationInputArea.tsx (EDIT)
     - Todo: Show "Preparing your conversation..." placeholder during first message flow
       - File: frontend/src/components/chat/input/ConversationInputArea.tsx (EDIT)
     - Todo: Add subtle loading animation to send button during session setup
       - File: frontend/src/components/chat/input/ConversationInputArea.tsx (EDIT)
     - Todo: Prevent duplicate message sends during session initialization
       - File: frontend/src/components/chat/input/ConversationInputArea.tsx (EDIT)

     1.3 Session Error Recovery UX

     - Todo: Create user-friendly error banner for session failures
       - File: frontend/src/components/chat/shared/SessionErrorBanner.tsx (CREATE)
     - Todo: Add "Reconnect Session" button with loading state
       - File: frontend/src/components/chat/shared/SessionErrorBanner.tsx (EDIT)
     - Todo: Show progress feedback during session recovery attempts
       - File: frontend/src/components/chat/shared/SessionErrorBanner.tsx (EDIT)
     - Todo: Provide fallback option to "Start New Conversation" if recovery fails
       - File: frontend/src/components/chat/shared/SessionErrorBanner.tsx (EDIT)

     Phase 2: Message Flow Unification (Priority: High)

     2.1 Update ChatContext to Use Unified WebSocket

     - Todo: Remove useChatMessages dependency from ChatContext
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - remove import and hook usage)
     - Todo: Replace with direct useUnifiedWebSocket integration
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add unified WebSocket integration)
     - Todo: Add session state awareness to sendMessage function
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - update sendMessage implementation)
     - Todo: Implement automatic conversation room joining with error handling
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add room joining logic)

     2.2 Add Session ID to Message Sending

     - Todo: Modify sendMessage to include session ID when available
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - update sendMessage parameters)
     - Todo: Handle first-message case (no session ID) gracefully
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add first message logic)
     - Todo: Add retry logic for session ID acquisition failures
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add retry mechanism)
     - Todo: Show clear feedback when session ID is missing for subsequent messages
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add error handling)

     2.3 Enhanced Message Sending Flow

     - Todo: Add optimistic UI updates with session validation
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - update state management)
     - Todo: Show message queuing state when session is initializing
       - File: frontend/src/components/chat/messages/SimpleMessageRenderer.tsx (EDIT)
     - Todo: Implement message retry with session recovery
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add retry logic)
     - Todo: Add timeout handling for failed session initialization
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add timeout logic)

     Phase 3: Connection State Simplification (Priority: Medium)

     3.1 Consolidate WebSocket Event Handlers

     - Todo: Move all chat events to unified WebSocket in ChatContext
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add unified event handlers)
     - Todo: Remove duplicate event listeners from multiple hooks
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - cleanup duplicate handlers)
     - Todo: Add proper cleanup for event handlers
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add cleanup logic)
     - Todo: Implement event handler error boundaries
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add error boundaries)

     3.2 Connection Status UX

     - Todo: Add connection status indicator in UI header
       - File: frontend/src/components/chat/shared/ConnectionStatusIndicator.tsx (CREATE)
       - File: frontend/src/components/chat/layouts/ChatPageDesktop.tsx (EDIT - add indicator)
     - Todo: Show "Reconnecting..." state during WebSocket reconnection
       - File: frontend/src/components/chat/shared/ConnectionStatusIndicator.tsx (EDIT)
     - Todo: Add connection lost banner with retry option
       - File: frontend/src/components/chat/shared/ConnectionLostBanner.tsx (CREATE)
     - Todo: Implement automatic reconnection with backoff strategy
       - File: frontend/src/hooks/useUnifiedWebSocket.ts (EDIT - enhance reconnection logic)

     Phase 4: Hook Cleanup and Migration (Priority: Medium)

     4.1 Remove Deprecated Hooks Safely

     - Todo: Create feature flag to toggle between old/new implementations
       - File: frontend/src/config/featureFlags.ts (CREATE)
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add feature flag usage)
     - Todo: Remove useChatMessages from ChatContext gradually
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - remove hook dependency)
     - Todo: Delete useChat.deprecated.ts and useClaudeStreaming.ts
       - File: frontend/src/hooks/useChat.deprecated.ts (DELETE)
       - File: frontend/src/hooks/useClaudeStreaming.ts (DELETE)
     - Todo: Clean up service layer WebSocket logic
       - File: frontend/src/services/chat/eventBus.ts (EDIT - remove WebSocket logic)

     4.2 Component Integration Updates

     - Todo: Update ChatPageDesktop to use session-aware patterns
       - File: frontend/src/components/chat/layouts/ChatPageDesktop.tsx (EDIT - add session awareness)
     - Todo: Add session status to SimpleMessageRenderer for debugging
       - File: frontend/src/components/chat/messages/SimpleMessageRenderer.tsx (EDIT - add session info)
     - Todo: Update ConversationInputArea with session validation
       - File: frontend/src/components/chat/input/ConversationInputArea.tsx (EDIT - add validation)
     - Todo: Add session health checks to message display components
       - File: frontend/src/components/chat/messages/SimpleMessageRenderer.tsx (EDIT - add health checks)

     Phase 5: Advanced UX Polish (Priority: Low)

     5.1 Session Management Polish

     - Todo: Add session resume functionality for page refreshes
       - File: frontend/src/hooks/useUnifiedWebSocket.ts (EDIT - add resume logic)
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - integrate resume)
     - Todo: Implement session persistence across browser tabs
       - File: frontend/src/utils/sessionStorage.ts (CREATE)
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add persistence)
     - Todo: Add session expiry warnings with renewal options
       - File: frontend/src/components/chat/shared/SessionExpiryWarning.tsx (CREATE)
     - Todo: Create session debug panel for development
       - File: frontend/src/components/chat/debug/SessionDebugPanel.tsx (CREATE)

     5.2 Error Handling Polish

     - Todo: Add contextual error messages based on failure type
       - File: frontend/src/utils/errorMessages.ts (CREATE)
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - use contextual messages)
     - Todo: Implement progressive error escalation (retry → reconnect → new session)
       - File: frontend/src/utils/errorEscalation.ts (CREATE)
       - File: frontend/src/contexts/ChatContext.tsx (EDIT - add escalation logic)
     - Todo: Add error analytics tracking for session issues
       - File: frontend/src/services/analytics/sessionTracking.ts (CREATE)
     - Todo: Create session health monitoring dashboard
       - File: frontend/src/components/chat/debug/SessionHealthDashboard.tsx (CREATE)

     5.3 Performance Optimizations

     - Todo: Implement session preloading for faster message sending
       - File: frontend/src/hooks/useUnifiedWebSocket.ts (EDIT - add preloading)
     - Todo: Add WebSocket connection pooling for multiple conversations
       - File: frontend/src/hooks/useUnifiedWebSocket.ts (EDIT - add connection pooling)
     - Todo: Optimize message rendering during session transitions
       - File: frontend/src/components/chat/messages/SimpleMessageRenderer.tsx (EDIT - optimize rendering)
     - Todo: Add memory cleanup for abandoned sessions
       - File: frontend/src/hooks/useUnifiedWebSocket.ts (EDIT - add cleanup logic)

     Final Cleanup Phase

     Hook Deletion (After Migration Complete)

     - Todo: Delete deprecated chat hooks
       - File: frontend/src/hooks/chat/useChatMessages.ts (DELETE)
       - File: frontend/src/hooks/useWebSocket.deprecated.ts (DELETE)
       - File: frontend/src/services/chat/eventBus.ts (DELETE if no longer needed)

     UX Success Criteria

     - Zero Confusing States: Users always know what's happening
     - Seamless Session Flow: First message "just works" without user intervention
     - Clear Error Recovery: Users can always get back to a working state
     - Fast Perceived Performance: UI feels responsive even during session setup
     - Transparent Session Management: Session status is visible but not intrusive

     Risk Mitigation

     - Gradual Migration: Implement feature flags for safe rollback
     - Extensive Testing: Test every session scenario thoroughly
     - User Feedback: Monitor for session-related support requests
     - Performance Monitoring: Track session initialization times