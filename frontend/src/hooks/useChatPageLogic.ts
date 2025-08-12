/**
 * Bridge Hook for Backward Compatibility
 * 
 * This hook maintains the same interface as the original useChatPageLogic
 * but uses our new refactored architecture underneath
 * 
 * This allows existing components to work without changes during transition
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useChatContext } from './chat/useChatContext';
import { useFileUpload } from './useFileUpload';
import { useInteractivePrompts } from './useInteractivePrompts';

export const useChatPageLogic = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams] = useSearchParams();
  
  // Use our new chat context
  const {
    state,
    conversations,
    createConversation,
    archiveConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
    stopStreaming,
    setInputValue,
    setSidebarVisible,
    setPermissionMode,
    isNewChat,
  } = useChatContext();

  // Get URL session ID
  const urlSessionId = searchParams.get('sessionId');

  // Interactive prompts (keep existing functionality)
  const {
    pendingPrompts,
    isRespondingToPrompt,
    handlePromptResponse,
  } = useInteractivePrompts({ conversationId: state.selectedConversationId });

  // File upload functionality
  const fileUpload = useFileUpload({
    maxFiles: 5,
    maxSizeBytes: 25 * 1024 * 1024, // 25MB
    onError: (err: unknown) => {
      console.error('File upload error:', err);
    }
  });

  // Sync conversation ID from URL params
  useEffect(() => {
    if (conversationId !== state.selectedConversationId) {
      selectConversation(conversationId || null);
    }
  }, [conversationId, state.selectedConversationId, selectConversation]);

  // Update URL when conversation changes
  useEffect(() => {
    if (state.selectedConversationId) {
      const sessionId = state.conversationDetails?.claudeSessionId;
      const url = sessionId 
        ? `/chat/${state.selectedConversationId}?sessionId=${sessionId}`
        : `/chat/${state.selectedConversationId}`;
      navigate(url, { replace: true });
    } else {
      navigate('/chat', { replace: true });
    }
  }, [state.selectedConversationId, state.conversationDetails?.claudeSessionId, navigate]);

  // Greeting helper
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Send message wrapper
  const handleSendMessage = async () => {
    const trimmed = state.inputValue.trim();
    if (!trimmed) return;

    // Prepare attachments
    const attachments = fileUpload.selectedFiles?.map(fileItem => ({
      filename: fileItem.file.name,
      mimeType: fileItem.file.type,
      size: fileItem.file.size,
      url: fileItem.preview || `file://${fileItem.file.name}`,
    })) || [];

    try {
      await sendMessage(trimmed, attachments.length > 0 ? attachments : undefined);
      fileUpload.clearFiles();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Permission mode cycling function
  const cyclePermissionMode = async () => {
    if (!state.selectedConversationId) {
      console.warn('Cannot cycle permission mode: no conversation selected');
      return;
    }

    const newMode = (() => {
      switch (state.permissionMode) {
        case 'default': return 'plan';
        case 'plan': return 'acceptEdits';
        case 'acceptEdits': return 'default';
        default: return 'default';
      }
    })();

    setPermissionMode(newMode);

    // Persist to database (keeping original logic)
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${state.selectedConversationId}/permission-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permissionMode: newMode,
          reason: 'manual_user_cycle'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to update permission mode:', error.error);
        // Revert on error
        setPermissionMode(state.permissionMode);
      } else {
        console.log(`✅ Permission mode updated to '${newMode}' and persisted to database`);
      }
    } catch (error) {
      console.error('Error updating permission mode:', error);
      setPermissionMode(state.permissionMode);
    }
  };

  return {
    // State
    isNewChat,
    inputValue: state.inputValue,
    setInputValue,
    selectedConversationId: state.selectedConversationId,
    setSelectedConversationId: selectConversation,
    showSidebar: state.showSidebar,
    setShowSidebar: setSidebarVisible,
    permissionMode: state.permissionMode,
    cyclePermissionMode,
    
    // Data
    conversationDetails: state.conversationDetails,
    urlSessionId,
    displayConversations: conversations,
    dbMessages: state.messages, // Our processed messages
    isLoadingMessages: state.isLoadingMessages,
    
    // WebSocket-based chat state
    streamingMessage: state.streamingMessage,
    optimisticUserMessage: state.optimisticUserMessage,
    isStreaming: state.isStreaming,
    stopStreaming,
    
    // Hooks
    fileUpload,
    
    // Interactive prompts
    pendingPrompts,
    isRespondingToPrompt,
    handlePromptResponse,
    
    // Actions
    handleKeyPress,
    handleSendMessage,
    archiveConversation,
    deleteConversation,
    
    // Helpers
    getGreeting,
  };
};