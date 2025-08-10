/**
 * Claude Code SDK Types for Baton Integration
 * 
 * These types define the StreamResponse format that bridges
 * Claude Code SDK messages with Baton's chat system.
 */

// Import SDK types from the Claude Code package
type SDKMessage = any; // Will be properly typed when importing from @anthropic-ai/claude-code/sdk

/**
 * StreamResponse format used in WebSocket communication
 * Matches the format: { type: "claude_json", data: sdkMessage, requestId, timestamp }
 */
export interface StreamResponse {
  type: 'claude_json';
  data: SDKMessage;
  requestId: string;
  timestamp: number;
}

/**
 * Type guard to check if a message is a StreamResponse
 */
export function isStreamResponse(obj: any): obj is StreamResponse {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.type === 'claude_json' &&
    obj.data &&
    typeof obj.requestId === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Extract message type from StreamResponse
 */
export function getSDKMessageType(streamResponse: StreamResponse): string {
  return streamResponse.data?.type || 'unknown';
}

/**
 * Extract session ID from StreamResponse
 */
export function getSessionId(streamResponse: StreamResponse): string | undefined {
  return streamResponse.data?.session_id;
}

/**
 * Extract Claude message ID from StreamResponse
 */
export function getClaudeMessageId(streamResponse: StreamResponse): string | undefined {
  return streamResponse.data?.message?.id;
}

/**
 * Extract model from StreamResponse
 */
export function getModel(streamResponse: StreamResponse): string | undefined {
  return streamResponse.data?.message?.model || streamResponse.data?.model;
}

/**
 * Extract usage information from StreamResponse
 */
export function getUsage(streamResponse: StreamResponse): any {
  return streamResponse.data?.message?.usage || streamResponse.data?.usage;
}