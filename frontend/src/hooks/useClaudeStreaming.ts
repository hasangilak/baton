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

  // Enhanced custom event integration for hybrid message persistence
  useEffect(() => {
    const handleMessageUpdate = (event: CustomEvent) => {
      const data = event.detail;
      
      // Only process messages for the current conversation
      if (!conversationId || data.conversationId !== conversationId) return;
      
      console.log('🎯 Enhanced message update for current conversation:', data);
      
      if (data.content) {
        // Create or update the current assistant message
        const assistantMessage: ChatMessage = {
          type: "chat",
          role: "assistant",
          content: data.content,
          timestamp: Date.now(),
        };

        // Update current streaming message for optimistic UI
        setCurrentAssistantMessage(assistantMessage);

        // Hybrid approach: Backend handles persistence, frontend shows optimistic updates
        if (data.isComplete) {
          console.log('✅ Message completed - backend has persisted, clearing UI streaming state');
          
          // Add to UI state for immediate display (backend already persisted)
          chatState.addMessage(assistantMessage);
          
          // Clear streaming state since message is complete and persisted
          setCurrentAssistantMessage(null);
          setIsStreaming(false);
          
          // Log session ID if captured
          if (data.sessionId) {
            console.log('🆔 Final session ID from complete message:', data.sessionId);
            chatState.updateSessionId(data.sessionId);
            onSessionId?.(data.sessionId);
          }
        }
      }
    };

    window.addEventListener('webui:message-updated', handleMessageUpdate as EventListener);

    return () => {
      window.removeEventListener('webui:message-updated', handleMessageUpdate as EventListener);
    };
  }, [conversationId, chatState, onSessionId]);

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

      // Enhanced stream processing with better error handling and session tracking
      let buffer = '';
      let lastContentUpdate = Date.now();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        lastContentUpdate = Date.now();

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            try {
              // Enhanced line processing with session ID tracking
              if (trimmedLine.startsWith('data: ')) {
                const data = JSON.parse(trimmedLine.substring(6));
                
                // Track session ID from enhanced backend
                const incomingSessionId = data.sessionId || data.currentSessionId;
                if (incomingSessionId && !chatState.currentSessionId) {
                  console.log('🆔 Session ID received from enhanced backend:', incomingSessionId);
                  chatState.updateSessionId(incomingSessionId);
                  onSessionId?.(incomingSessionId);
                }
                
                // Handle completion and error states from enhanced backend
                if (data.type === 'done') {
                  console.log('✅ Stream completed successfully via enhanced backend');
                } else if (data.type === 'error') {
                  console.error('❌ Error from enhanced backend:', data.error);
                  if (data.canRetry) {
                    console.log('🔄 Backend indicates this error is retryable by user');
                  }
                }
              }
              
              processStreamLine(trimmedLine, streamingContext);
            } catch (lineError) {
              console.warn('⚠️ Failed to process stream line:', lineError, trimmedLine);
              // Continue processing other lines
            }
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          processStreamLine(buffer.trim(), streamingContext);
        } catch (bufferError) {
          console.warn('⚠️ Failed to process remaining buffer:', bufferError);
        }
      }

      console.log('✅ Streaming completed successfully with enhanced backend');

    } catch (error) {
      console.error('❌ Streaming error:', error);
      
      // Enhanced error handling - show user-friendly messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is a user-friendly error from the backend
      const isUserFriendlyError = errorMessage.includes('Chat setup failed') || 
                                 errorMessage.includes('Connection to Claude Code bridge failed') ||
                                 errorMessage.includes('save your message') ||
                                 errorMessage.includes('prepare response');
      
      chatState.addMessage({
        type: "error",
        subtype: "stream_error",
        message: isUserFriendlyError ? errorMessage : `Connection error: ${errorMessage}`,
        timestamp: Date.now(),
      });
    } finally {
      // Simplified cleanup - backend now handles message persistence
      // No need for complex finally persistence logic since backend uses hybrid approach
      console.log('🧹 Cleaning up streaming state');

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