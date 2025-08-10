 Phase 1: Folder Structure Reorganization (Day 1)

     New Clean Structure

     src/
     ├── components/
     │   └── chat/
     │       ├── layouts/              # Page layouts only
     │       │   ├── ChatPageDesktop.tsx
     │       │   └── ChatPageMobile.tsx
     │       ├── messages/             # Pure message display components
     │       │   ├── MessageBubble.tsx
     │       │   ├── UserMessage.tsx
     │       │   ├── AssistantMessage.tsx
     │       │   ├── SystemMessage.tsx
     │       │   └── ToolMessage.tsx
     │       ├── input/                # Input-related components
     │       │   ├── MessageInput.tsx
     │       │   ├── FileUpload.tsx
     │       │   └── FileMentions.tsx
     │       ├── sidebar/              # Sidebar components
     │       │   ├── ConversationList.tsx
     │       │   └── ConversationItem.tsx
     │       ├── prompts/              # Interactive prompts
     │       │   └── PermissionPrompt.tsx
     │       └── shared/               # Shared chat components
     │           ├── WelcomeScreen.tsx
     │           ├── SessionInfo.tsx
     │           └── StreamingIndicator.tsx
     ├── hooks/
     │   └── chat/                     # Clean separation of concerns
     │       ├── useChatWebSocket.ts   # Pure WebSocket management
     │       ├── useChatMessages.ts    # Message handling logic
     │       ├── useConversations.ts   # Conversation management
     │       └── usePermissions.ts     # Permission system
     └── services/
         └── chat/
             ├── websocket.ts          # WebSocket service
             ├── messages.ts           # Message processing
             └── permissions.ts        # Permission handling

     Phase 2: WebSocket Architecture Simplification (Day 2)

     Centralized WebSocket Event System

     - Single WebSocket Hook: useChatWebSocket.ts handles ALL chat WebSocket events
     - Event Bus Pattern: Simple event dispatcher for component communication
     - Message Pipeline: Streamlined message processing flow
     - Real-time State Sync: Automatic UI updates via WebSocket listeners

     Key Improvements

     1. Single Source of Truth for WebSocket connection
     2. Centralized Event Handling - all chat events in one place
     3. Simplified Message Flow: Direct WebSocket → State → UI pipeline
     4. Automatic Reconnection with proper cleanup

     Phase 3: Message Component Simplification (Day 2-3)

     Simplified Message Rendering

     - Remove Complex Type Discrimination: Replace 486-line MessageTypeRenderer with simple component mapping
     - Pure Message Components: Each message type is a simple, focused component
     - Props-based Rendering: Pass message data as props, no complex logic in components
     - Consistent Message Interface: All message types follow same props pattern

     Message Component Architecture

     interface BaseMessageProps {
       message: Message;
       isStreaming?: boolean;
       onCopy?: (content: string) => void;
     }

     // Simple, focused components
     <UserMessage {...baseProps} />
     <AssistantMessage {...baseProps} />
     <ToolMessage {...baseProps} />

     Phase 4: Interactive Prompts Refactoring (Day 3)

     Simplified Permission System

     - Single Permission Component: Replace 268-line InteractivePrompt with focused component
     - WebSocket-driven Updates: Direct WebSocket event handling
     - Simplified State Management: Remove complex permission mode cycling
     - Clean UI/Logic Separation: UI components only handle display

     Phase 5: State Management Simplification (Day 4)

     Centralized Chat State

     - Single Chat Context: Replace multiple useState/useEffect with centralized state
     - WebSocket State Sync: Automatic state updates from WebSocket events
     - Optimistic Updates: Clean optimistic UI updates for better UX
     - Error Handling: Centralized error management

     Phase 6: Integration & Testing (Day 5)

     WebSocket Event Flow

     User Action → WebSocket Emit → Backend Processing → WebSocket Event → State Update → UI Refresh

     Testing Strategy

     - Component Tests: Each simplified component tested in isolation
     - WebSocket Tests: Mock WebSocket events for integration testing
     - End-to-end Tests: Full chat flow testing

     Expected Benefits

     1. 50% Reduction in Component Complexity - Smaller, focused components
     2. Unified WebSocket Management - Single point of WebSocket control
     3. Simplified Message Handling - Direct event → UI pipeline
     4. Better Developer Experience - Clear component boundaries
     5. Improved Performance - Fewer re-renders and optimized state updates
     6. Enhanced Maintainability - Clear separation of concerns

     Technical Details

     - WebSocket Events: Centralized handling in useChatWebSocket
     - Message Pipeline: Direct WebSocket → State → Component flow
     - File Organization: Clear folder structure with single responsibility
     - Component Props: Consistent interface across all message types
     - State Management: Centralized chat state with WebSocket synchronization

     This refactoring will transform the complex, scattered architecture into a clean, maintainable system with straightforward WebSocket 
     communication patterns.