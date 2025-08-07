/**
 * Message Processor Hook - Based on Claude Code WebUI Architecture
 * 
 * Handles different Claude SDK message types and converts them to frontend message format,
 * following the comprehensive implementation guide patterns.
 */

import { useCallback } from 'react';
import { generateMessageId } from '../../utils/id';
import type { 
  SDKMessage, 
  StreamingContext, 
  SystemMessage,
  ToolMessage 
} from '../../types/streaming';
import { 
  isAssistantMessage, 
  isUserMessage, 
  isSystemSDKMessage, 
  isResultMessage,
  extractToolResultsFromContent 
} from '../../utils/messageTypes';

export function useMessageProcessor() {
  // Handle assistant text messages (full content updates)
  const handleAssistantTextMessage = useCallback(
    (contentItem: { text?: string }, context: StreamingContext) => {
      // Ensure text is a string (Claude sends full content each time)
      const fullText = String(contentItem.text || '');
      
      let messageToUpdate = context.currentAssistantMessage;

      if (!messageToUpdate) {
        // Create new assistant message with stable unique ID
        messageToUpdate = {
          type: "chat",
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          id: generateMessageId(),
        };
        context.setCurrentAssistantMessage(messageToUpdate);
        context.addMessage(messageToUpdate);
      }

      // Update content with full text (not appending - Claude sends complete content)
      const updatedMessage = { ...messageToUpdate, content: fullText };

      context.setCurrentAssistantMessage(updatedMessage);
      context.updateLastMessage(fullText);
    },
    [],
  );

  // Handle assistant messages (following WebUI guide pattern)
  const handleAssistantMessage = useCallback(
    (sdkMessage: SDKMessage, context: StreamingContext) => {
      if (!sdkMessage.message?.content) return;

      // Handle array of content blocks (WebUI pattern)
      const content = sdkMessage.message.content;
      if (Array.isArray(content)) {
        for (const contentItem of content) {
          if (contentItem.type === "text") {
            // Handle streaming text content
            handleAssistantTextMessage(contentItem, context);
          } else if (contentItem.type === "tool_use") {
            // Handle tool usage messages
            const toolMessage: ToolMessage = {
              type: 'tool_use',
              name: contentItem.name || 'Unknown Tool',
              input: contentItem.input || {},
              id: contentItem.id || `tool_${Date.now()}`,
              timestamp: Date.now(),
            };
            context.onToolUse?.(toolMessage);
            context.addMessage(toolMessage);
          }
        }
      } else if (typeof content === 'string') {
        // Handle simple string content
        handleAssistantTextMessage({ text: content }, context);
      }
    },
    [handleAssistantTextMessage],
  );

  // Handle user messages (usually tool results)
  const handleUserMessage = useCallback(
    (sdkMessage: SDKMessage, context: StreamingContext) => {
      if (!sdkMessage.message?.content) return;

      // Handle tool results
      const toolResults = extractToolResultsFromContent(sdkMessage.message.content);
      toolResults.forEach(toolResult => {
        context.onToolResult?.(toolResult);
        context.addMessage(toolResult);
      });
    },
    [],
  );

  // Handle system messages
  const handleSystemMessage = useCallback(
    (sdkMessage: SDKMessage, context: StreamingContext) => {
      const systemMessage: SystemMessage = {
        type: "system",
        subtype: "sdk_system",
        message: sdkMessage.message?.content || "System message",
        timestamp: Date.now(),
        data: sdkMessage,
      };
      context.addMessage(systemMessage);
    },
    [],
  );

  // Handle result messages (final response)
  const handleResultMessage = useCallback(
    (sdkMessage: SDKMessage, context: StreamingContext) => {
      if (sdkMessage.result) {
        // Only apply final result text if we did NOT already stream assistant chunks.
        // If a streaming assistant message exists, its content is already up-to-date.
        if (!context.currentAssistantMessage) {
          handleAssistantTextMessage({ text: sdkMessage.result }, context);
        }
      }
      
      // Add result system message
      const resultMessage: SystemMessage = {
        type: "result",
        subtype: "completion",
        message: "Query completed successfully",
        timestamp: Date.now(),
        data: sdkMessage,
      };
      context.addMessage(resultMessage);
    },
    [handleAssistantTextMessage],
  );

  // Main processor function (following WebUI guide pattern)
  const processClaudeData = useCallback(
    (sdkMessage: SDKMessage, context: StreamingContext) => {
      // Validate SDK message structure
      if (!sdkMessage || typeof sdkMessage !== 'object') {
        console.warn('Invalid SDK message:', sdkMessage);
        return;
      }

      console.log('📨 Processing Claude SDK message:', sdkMessage.type);

      try {
        // Extract session ID from first assistant message (WebUI pattern)
        if (
          sdkMessage.type === "assistant" &&
          context.hasReceivedInit &&
          (sdkMessage.session_id || sdkMessage.sessionId) &&
          context.onSessionId
        ) {
          const sessionId = sdkMessage.session_id || sdkMessage.sessionId;
          if (typeof sessionId === 'string') {
            context.onSessionId(sessionId);
          }
        }

        // Route to appropriate handler based on message type (WebUI switch pattern)
        switch (sdkMessage.type) {
          case "system":
            if (isSystemSDKMessage(sdkMessage)) {
              handleSystemMessage(sdkMessage, context);
            }
            break;
          case "assistant":
            if (isAssistantMessage(sdkMessage)) {
              handleAssistantMessage(sdkMessage, context);
            }
            break;
          case "result":
            if (isResultMessage(sdkMessage)) {
              handleResultMessage(sdkMessage, context);
            }
            break;
          case "user":
            if (isUserMessage(sdkMessage)) {
              handleUserMessage(sdkMessage, context);
            }
            break;
          default:
            // Unknown message type
            console.warn('Unknown SDK message type:', sdkMessage.type, sdkMessage);
            const unknownMessage: SystemMessage = {
              type: "system",
              subtype: "unknown",
              message: `Unknown message type: ${sdkMessage.type || 'undefined'}`,
              timestamp: Date.now(),
              data: sdkMessage,
            };
            context.addMessage(unknownMessage);
        }
      } catch (processingError) {
        console.error('Error processing Claude SDK message:', processingError);
        const errorMessage: SystemMessage = {
          type: "error",
          subtype: "processing_error",
          message: `Error processing message: ${processingError instanceof Error ? processingError.message : String(processingError)}`,
          timestamp: Date.now(),
          data: sdkMessage,
        };
        context.addMessage(errorMessage);
      }
    },
    [handleAssistantMessage, handleUserMessage, handleSystemMessage, handleResultMessage],
  );

  return {
    processClaudeData,
    handleAssistantMessage,
    handleUserMessage,
    handleSystemMessage,
    handleResultMessage,
  };
}