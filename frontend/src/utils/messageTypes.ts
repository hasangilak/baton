/**
 * Message Type Guards - Based on Claude Code WebUI Architecture
 * 
 * Type guards for different message types in the streaming chat system,
 * following the comprehensive implementation guide patterns.
 */

import type { 
  AllMessage, 
  ChatMessage, 
  SystemMessage, 
  ToolMessage, 
  ToolResultMessage,
  AbortMessage,
  SDKMessage,
  StreamResponse 
} from '../types/streaming';

// Type guards for message types
export function isChatMessage(message: AllMessage): message is ChatMessage {
  return message.type === "chat";
}

export function isSystemMessage(message: AllMessage): message is SystemMessage {
  return (
    message.type === "system" ||
    message.type === "result" ||
    message.type === "error"
  );
}

export function isToolMessage(message: AllMessage): message is ToolMessage {
  return message.type === "tool_use";
}

export function isToolResultMessage(message: AllMessage): message is ToolResultMessage {
  return message.type === "tool_result";
}

export function isAbortMessage(message: AllMessage): message is AbortMessage {
  return message.type === "abort";
}

// Type guards for SDK messages
export function isAssistantMessage(sdkMessage: SDKMessage): sdkMessage is Extract<SDKMessage, { type: "assistant" }> {
  return sdkMessage.type === "assistant";
}

export function isUserMessage(sdkMessage: SDKMessage): sdkMessage is Extract<SDKMessage, { type: "user" }> {
  return sdkMessage.type === "user";
}

export function isSystemSDKMessage(sdkMessage: SDKMessage): sdkMessage is Extract<SDKMessage, { type: "system" }> {
  return sdkMessage.type === "system";
}

export function isResultMessage(sdkMessage: SDKMessage): sdkMessage is Extract<SDKMessage, { type: "result" }> {
  return sdkMessage.type === "result";
}

// Type guards for streaming responses
export function isClaudeJsonResponse(response: StreamResponse): response is Extract<StreamResponse, { type: "claude_json" }> {
  return response.type === "claude_json";
}

export function isErrorResponse(response: StreamResponse): response is Extract<StreamResponse, { type: "error" }> {
  return response.type === "error";
}

export function isDoneResponse(response: StreamResponse): response is Extract<StreamResponse, { type: "done" }> {
  return response.type === "done";
}

export function isAbortedResponse(response: StreamResponse): response is Extract<StreamResponse, { type: "aborted" }> {
  return response.type === "aborted";
}

export function isDelegatedResponse(response: StreamResponse): response is Extract<StreamResponse, { type: "delegated" }> {
  return response.type === "delegated";
}

// Utility functions for content extraction
export function extractTextFromContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('');
  }
  
  return '';
}

export function extractToolUsesFromContent(content: any): ToolMessage[] {
  if (!Array.isArray(content)) {
    return [];
  }
  
  return content
    .filter((block: any) => block.type === 'tool_use')
    .map((block: any) => ({
      type: 'tool_use' as const,
      name: block.name || 'Unknown Tool',
      input: block.input || {},
      id: block.id || `tool_${Date.now()}`,
      timestamp: Date.now(),
    }));
}

export function extractToolResultsFromContent(content: any): ToolResultMessage[] {
  if (!Array.isArray(content)) {
    return [];
  }
  
  return content
    .filter((block: any) => block.type === 'tool_result')
    .map((block: any) => ({
      type: 'tool_result' as const,
      content: block.content || '',
      tool_use_id: block.tool_use_id || '',
      is_error: block.is_error || false,
      timestamp: Date.now(),
    }));
}