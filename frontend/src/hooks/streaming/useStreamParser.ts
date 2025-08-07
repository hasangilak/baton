/**
 * Stream Parser Hook - Based on Claude Code WebUI Architecture
 * 
 * Processes NDJSON stream lines and converts them to appropriate message types,
 * following the comprehensive implementation guide patterns.
 */

import { useCallback } from 'react';
import type { StreamResponse, StreamingContext, SystemMessage, AbortMessage } from '../../types/streaming';
import { isClaudeJsonResponse, isErrorResponse, isAbortedResponse } from '../../utils/messageTypes';
import { useMessageProcessor } from './useMessageProcessor';

export function useStreamParser() {
  const { processClaudeData } = useMessageProcessor();

  const processStreamLine = useCallback(
    (line: string, context: StreamingContext) => {
      try {
        // Skip empty lines
        if (!line.trim()) {
          return;
        }

        // Handle Server-Sent Events format from bridge
        let jsonData: string = line;
        if (line.startsWith('data: ')) {
          jsonData = line.substring(6); // Remove 'data: ' prefix
        }

        // Skip if it's just SSE keep-alive or empty data
        if (!jsonData.trim()) {
          return;
        }

        const data: StreamResponse = JSON.parse(jsonData);

        if (isClaudeJsonResponse(data) && (data as any).data) {
          // Process Claude SDK message
          try {
            processClaudeData((data as any).data, context);
          } catch (processError) {
            console.warn("Failed to process Claude data:", processError);
            // Don't throw - continue processing other messages
          }
        } else if (isErrorResponse(data)) {
          // Handle error response
          const errorMessage: SystemMessage = {
            type: "error",
            subtype: "stream_error", 
            message: (data as any).error || "Unknown error",
            timestamp: Date.now(),
          };
          context.addMessage(errorMessage);
        } else if (isAbortedResponse(data)) {
          // Handle abort response
          const abortedMessage: AbortMessage = {
            type: "abort",
            message: "Operation was aborted by user",
            timestamp: Date.now(),
          };
          context.addMessage(abortedMessage);
          context.setCurrentAssistantMessage(null);
        } else if (data.type === 'done') {
          // Handle completion
          console.log('🏁 Stream completed');
          console.log('📊 Current assistant message state:', {
            exists: !!context.currentAssistantMessage,
            content: context.currentAssistantMessage?.content,
            hasContent: !!(context.currentAssistantMessage && context.currentAssistantMessage.content)
          });

          // Do not add another assistant message on completion; it was already
          // added on the first assistant chunk. Simply finalize/clear to avoid duplicates.
          context.setCurrentAssistantMessage(null);
        } else if (data.type === 'delegated') {
          // Handle delegation status (from backend)
          console.log('📤 Request delegated to local handler');
        } else {
          // Unknown response type - log but continue
          console.warn('Unknown stream response type:', data.type);
        }
      } catch (parseError) {
        console.error("Failed to parse stream line:", parseError);
        console.error("Problematic line:", line);
        
        // Only add parse error message if it's not a minor formatting issue
        if (line.trim().length > 0) {
          const parseErrorMessage: SystemMessage = {
            type: "error",
            subtype: "parse_error",
            message: `Failed to parse stream data: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            timestamp: Date.now(),
          };
          context.addMessage(parseErrorMessage);
        }
      }
    },
    [processClaudeData],
  );

  return { processStreamLine };
}