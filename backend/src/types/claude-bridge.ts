/**
 * Claude Code Bridge Types
 * 
 * Types for compatibility with the bridge.ts WebSocket system
 * and Claude Code SDK integration
 */

import type { 
  SDKMessage, 
  SDKUserMessage, 
  SDKAssistantMessage, 
  SDKResultMessage, 
  SDKSystemMessage,
  Options, 
  PermissionMode 
} from '@anthropic-ai/claude-code';

// Re-export Claude Code SDK types
export type {
  SDKMessage,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  Options,
  PermissionMode
};

// Bridge types from scripts/bridge.ts
export interface BridgeRequest {
  message: string;
  requestId: string;
  projectId: string;
  sessionId?: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: PermissionMode;
  projectName?: string;
}

export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted";
  data?: SDKMessage; // This contains the actual Claude SDK message
  error?: string;
  requestId: string;
  timestamp: number;
}

// WebSocket event types for bridge communication
export interface WebSocketBridgeEvents {
  'claude:execute': (request: BridgeRequest) => void;
  'claude:abort': (requestId: string) => void;
  'permission:response': (data: { promptId: string; response: any }) => void;
  'bridge:health': () => void;
  'files:list': (data: { workingDirectory?: string; search?: string }) => void;
  'files:content': (data: { filePath: string; workingDirectory?: string }) => void;
}

export interface WebSocketBridgeEmits {
  'claude:stream': (response: StreamResponse) => void;
  'claude:complete': (data: { requestId: string; sessionId?: string }) => void;
  'claude:error': (data: { requestId: string; error: string }) => void;
  'claude:aborted': (data: { requestId: string }) => void;
  'permission:request': (data: any) => void;
  'bridge:health-response': (data: { status: string; activeRequests: number }) => void;
  'files:list-response': (data: { files: any[]; workingDirectory: string; count: number }) => void;
  'files:content-response': (data: { content: string; path: string; fullPath: string; size: number; lastModified: Date }) => void;
}

// MongoDB document structure for storing chat data
export interface ChatDocument {
  id: string;
  projectId: string;
  title: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ChatMessageDocument {
  id: string;
  chatId: string;
  streamResponse: StreamResponse; // Store the complete StreamResponse from bridge
  options?: Options; // Store Claude Code SDK options
  timestamp: Date;
}

// Permission system types that bridge expects
export interface PermissionRequestData {
  type: 'tool_permission' | 'plan_review';
  title: string;
  message: string;
  options: Array<{
    id: string;
    label: string;
    value: string;
    description?: string;
  }>;
  context: {
    toolName?: string;
    parameters?: string;
    riskLevel?: string;
    usageCount?: number;
    progressiveTimeout?: boolean;
    planLength?: number;
    timestamp?: number;
  };
  projectId: string;
}

export interface PermissionResponseData {
  promptId: string;
  selectedOption: string;
  label?: string;
  decision?: string;
  feedback?: string;
  editedPlan?: string;
}

// Plan review specific types
export interface PlanReviewData {
  type: 'plan_review';
  title: string;
  message: string;
  planContent: string;
  options: Array<{
    id: string;
    label: string;
    value: string;
    description: string;
  }>;
  context: {
    toolName: string;
    parameters: string;
    planLength: number;
    timestamp: number;
  };
  projectId: string;
}