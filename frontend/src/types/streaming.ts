/**
 * Frontend Streaming Types - Based on Claude Code WebUI Architecture
 * 
 * Shared types between frontend and backend for the streaming chat system,
 * following the comprehensive implementation guide patterns.
 */

// Core streaming response interface (matches backend)
export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted" | "delegated";
  data?: unknown; // SDKMessage object for claude_json type
  error?: string;
  requestId?: string; // For delegated responses
  messageId?: string; // Frontend reference for message updates
}

// Chat request interface (matches backend)
export interface ChatRequest {
  message: string;
  sessionId?: string;
  requestId: string;
  conversationId: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: "default" | "plan" | "acceptEdits";
}

// SDK Message types (from Claude Code SDK)
export interface SDKMessage {
  type: "system" | "assistant" | "user" | "result";
  sessionId?: string;
  session_id?: string;
  message?: {
    role?: string;
    content?: any;
    sessionId?: string;
    session_id?: string;
  };
  result?: string;
  toolUses?: any[];
  [key: string]: any;
}

// Frontend message types following guide patterns
export interface ChatMessage {
  type: "chat";
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  id?: string;
}

export interface SystemMessage {
  type: "system" | "result" | "error";
  subtype?: string;
  message: string;
  timestamp: number;
  data?: any;
}

export interface ToolMessage {
  type: "tool_use";
  name: string;
  input: any;
  id: string;
  timestamp: number;
}

export interface ToolResultMessage {
  type: "tool_result";
  content: string;
  tool_use_id: string;
  is_error?: boolean;
  timestamp: number;
}

export interface AbortMessage {
  type: "abort";
  message: string;
  timestamp: number;
}

// Union type for all message types
export type AllMessage = 
  | ChatMessage 
  | SystemMessage 
  | ToolMessage 
  | ToolResultMessage 
  | AbortMessage;

// Streaming context for frontend hooks (based on WebUI guide)
export interface StreamingContext {
  // Message state management
  currentAssistantMessage: ChatMessage | null;
  setCurrentAssistantMessage: (message: ChatMessage | null) => void;
  addMessage: (message: AllMessage) => void;
  updateLastMessage: (content: string) => void;

  // Session management
  onSessionId?: (sessionId: string) => void;

  // UI state control
  shouldShowInitMessage?: () => boolean;
  onInitMessageShown?: () => void;
  hasReceivedInit?: boolean;
  setHasReceivedInit?: (received: boolean) => void;

  // Error and permission handling
  onPermissionError?: (
    toolName: string,
    patterns: string[],
    toolUseId: string,
  ) => void;
  onAbortRequest?: () => void;
  
  // Tool handling (backward compatibility)
  onToolUse?: (toolUse: ToolMessage) => void;
  onToolResult?: (toolResult: ToolResultMessage) => void;
}

// Permission request types
export interface PermissionRequest {
  patterns: string[];
  onAllow: (patterns: string[]) => Promise<void>;
  onAllowPermanent: (patterns: string[]) => Promise<void>;
  onDeny: () => Promise<void>;
}

// Chat state options
export interface ChatStateOptions {
  defaultMessages?: AllMessage[];
  autoScroll?: boolean;
}