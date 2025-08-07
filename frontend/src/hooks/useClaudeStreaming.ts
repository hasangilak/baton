/**
 * Claude Streaming Hook - Based on Claude Code WebUI Architecture
 * 
 * Main streaming interface that orchestrates all streaming functionality,
 * following the comprehensive implementation guide patterns.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatState } from './chat/useChatState';
import { useAbortController } from './chat/useAbortController';
import { useStreamParser } from './streaming/useStreamParser';
import { usePermissions } from './chat/usePermissions';
// import { useWebSocket } from './useWebSocket'; // Unused for now
import type { 
  ChatMessage, 
  StreamingContext, 
  ChatRequest 
} from '../types/streaming';
import { generateRequestId } from '../utils/id';

interface ClaudeStreamingOptions {
  conversationId?: string;
  workingDirectory?: string;
  onSessionId?: (sessionId: string) => void;
  onPermissionError?: (error: any) => void;
}

export function useClaudeStreaming(options: ClaudeStreamingOptions = {}) {
  const {
    conversationId,
    workingDirectory,
    onSessionId,
    onPermissionError,
  } = options;

  // State management
  const chatState = useChatState();
  const abortController = useAbortController();
  const { processStreamLine } = useStreamParser();
  const { allowedTools, permissionRequest, showPermissionRequest } = usePermissions();
  // const webSocket = useWebSocket(); // Unused for now

  // Current streaming state (following WebUI guide)
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState<ChatMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasShownInitMessage, setHasShownInitMessage] = useState(false);
  const [hasReceivedInit, setHasReceivedInit] = useState(false);
  const streamReaderRef = useRef<ReadableStreamDefaultReader | null>(null);

  // Custom event integration for message updates
  useEffect(() => {
    const handleMessageUpdate = (event: CustomEvent) => {
      const data = event.detail;
      
      // Only process messages for the current conversation
      if (!conversationId || data.conversationId !== conversationId) return;
      
      console.log('🎯 Custom event message update for current conversation:', data);
      
      if (data.content) {
        // Create or update the current assistant message
        const assistantMessage: ChatMessage = {
          type: "chat",
          role: "assistant",
          content: data.content,
          timestamp: Date.now(),
        };

        // Update current streaming message
        setCurrentAssistantMessage(assistantMessage);

        // If message is complete, add it to the persistent message list
        if (data.isComplete) {
          console.log('💾 Message complete, adding to chat history:', data.content);
          chatState.addMessage(assistantMessage);
          setCurrentAssistantMessage(null); // Clear streaming state
          setIsStreaming(false);
        }
      }
    };

    window.addEventListener('webui:message-updated', handleMessageUpdate as EventListener);

    return () => {
      window.removeEventListener('webui:message-updated', handleMessageUpdate as EventListener);
    };
  }, [conversationId, chatState]);

  // Handle permission errors (WebUI guide signature)
  const handlePermissionError = useCallback((toolName: string, patterns: string[], toolUseId: string) => {
    console.warn('🔒 Permission error:', { toolName, patterns, toolUseId });
    // For backward compatibility, call original handler if provided
    if (onPermissionError) {
      onPermissionError({ toolName, patterns, toolUseId });
    }
  }, [onPermissionError]);


  // Main send message function
  const sendMessage = useCallback(async (messageContent?: string, targetConversationId?: string) => {
    const content = messageContent || chatState.input.trim();
    const targetId = targetConversationId || conversationId;
    if (!content || isStreaming || !targetId) return;

    const requestId = generateRequestId();
    abortController.setCurrentRequestId(requestId);

    // Add user message
    const userMessage: ChatMessage = {
      type: "chat",
      role: "user",
      content,
      timestamp: Date.now(),
    };
    chatState.addMessage(userMessage);

    // Clear input
    chatState.setInput('');
    chatState.startRequest();
    setIsStreaming(true);

    try {
      // Build request payload
      const requestPayload: ChatRequest = {
        message: content,
        requestId,
        conversationId: targetId,
        allowedTools,
        workingDirectory,
        sessionId: chatState.currentSessionId || undefined,
        permissionMode: 'default',
      };

      console.log('🚀 Starting streaming request:', {
        requestId,
        conversationId: targetId,
        sessionId: requestPayload.sessionId,
        allowedTools: allowedTools?.length || 0,
      });

      // Make streaming request to bridge endpoint
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/chat/messages/stream-bridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: targetId,
          content,
          requestId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      // Set up stream processing
      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();

      // Create streaming context (following WebUI guide)
      const streamingContext: StreamingContext = {
        // Message state management
        currentAssistantMessage,
        setCurrentAssistantMessage,
        addMessage: chatState.addMessage,
        updateLastMessage: chatState.updateLastMessage,

        // Session management
        onSessionId: (sessionId: string) => {
          console.log('🆔 Received session ID:', sessionId);
          chatState.updateSessionId(sessionId);
          onSessionId?.(sessionId);
        },

        // UI state control
        shouldShowInitMessage: () => !hasShownInitMessage,
        onInitMessageShown: () => setHasShownInitMessage(true),
        hasReceivedInit,
        setHasReceivedInit,

        // Error and permission handling
        onPermissionError: handlePermissionError,
        onAbortRequest: handleAbortRequest,
      };

      // Process stream
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            processStreamLine(trimmedLine, streamingContext);
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        processStreamLine(buffer.trim(), streamingContext);
      }

      console.log('✅ Streaming completed successfully');

    } catch (error) {
      console.error('❌ Streaming error:', error);
      
      // Add error message
      chatState.addMessage({
        type: "error",
        subtype: "stream_error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
      
      // Note: permission errors will be handled by the stream processor
    } finally {
      // Persist the current assistant message before clearing it
      if (currentAssistantMessage && currentAssistantMessage.content) {
        console.log('💾 Persisting final assistant message:', currentAssistantMessage.content);
        
        // Create a final completed message from the streaming message
        const finalMessage = {
          ...currentAssistantMessage,
          type: "chat" as const,
          role: "assistant" as const,
          timestamp: Date.now(),
        };
        
        // Add to message history if it's not already there
        if (!chatState.messages.some(msg => 
          msg.type === 'chat' && 
          msg.role === 'assistant' && 
          msg.content === currentAssistantMessage.content
        )) {
          chatState.addMessage(finalMessage);
        }
      }

      // Clean up (WebUI guide pattern)
      setIsStreaming(false);
      setCurrentAssistantMessage(null);
      setHasShownInitMessage(false);
      setHasReceivedInit(false);
      chatState.finishRequest();
      abortController.setCurrentRequestId(null);
      streamReaderRef.current = null;
    }
  }, [
    chatState,
    isStreaming,
    conversationId,
    abortController,
    processStreamLine,
    allowedTools,
    workingDirectory,
    currentAssistantMessage,
    onSessionId,
    handlePermissionError,
  ]);

  // Abort current request
  const handleAbort = useCallback(async () => {
    if (!isStreaming) return;

    console.log('🛑 User requested abort');
    
    // Cancel stream reader
    if (streamReaderRef.current) {
      try {
        await streamReaderRef.current.cancel();
      } catch (error) {
        console.warn('Stream reader cancel error:', error);
      }
    }

    // Call abort endpoint
    await abortController.abortCurrentRequest();
    
    // Clean up state
    setIsStreaming(false);
    setCurrentAssistantMessage(null);
    chatState.finishRequest();
  }, [isStreaming, abortController, chatState]);

  // Handle abort requests (WebUI guide pattern)
  const handleAbortRequest = useCallback(() => {
    console.log('🛑 Abort request initiated');
    handleAbort();
  }, [handleAbort]);

  // Get current streaming status
  const getStreamingStatus = useCallback(() => {
    return {
      isStreaming,
      currentRequestId: abortController.currentRequestId,
      canAbort: abortController.canAbortRequest(abortController.currentRequestId || ''),
      hasActiveSession: !!chatState.currentSessionId,
      messageCount: chatState.getMessageCount(),
    };
  }, [isStreaming, abortController, chatState]);

  return {
    // State from chat state hook
    ...chatState,
    
    // Streaming state
    isStreaming,
    currentAssistantMessage,
    
    // Actions
    sendMessage,
    handleAbort,
    
    // Permission system
    allowedTools,
    permissionRequest,
    showPermissionRequest,
    
    // Utilities
    getStreamingStatus,
    processStreamLine,
  };
}