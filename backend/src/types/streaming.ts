/**
 * Streaming Types - Based on Claude Code WebUI Architecture
 * 
 * These types define the streaming protocol and message formats
 * for the chat system following the comprehensive implementation guide.
 */

// Core streaming response interface
export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted" | "delegated";
  data?: unknown; // SDKMessage object for claude_json type
  error?: string;
  requestId?: string; // For delegated responses
  messageId?: string; // Frontend reference for message updates
}

// Chat request interface
export interface ChatRequest {
  message: string;
  sessionId?: string;
  requestId: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: "default" | "plan" | "acceptEdits";
}

// Streaming context for handlers
export interface StreamingContext {
  requestId: string;
  messageId: string;
  conversationId: string;
  sessionId?: string;
  abortController: AbortController;
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

// Error types
export class AbortError extends Error {
  constructor(message: string = "Request was aborted") {
    super(message);
    this.name = "AbortError";
  }
}

// Command result interface
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}