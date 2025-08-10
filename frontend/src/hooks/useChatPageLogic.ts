import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useConversations, useConversation, useMessages, useChat } from './useChat';
import { useProjects } from './useProjects';
import { useInteractivePrompts } from './useInteractivePrompts';
import { useFileUpload } from './useFileUpload';
import { useWebSocket } from './useWebSocket';

export const useChatPageLogic = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams] = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    conversationId || null
  );
  const [inputValue, setInputValue] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isNewChat, setIsNewChat] = useState(true);
  const [permissionMode, setPermissionMode] = useState<'default' | 'plan' | 'acceptEdits'>('default');

  // Get current project
  const { data: projects } = useProjects();
  const currentProjectId = projects?.[0]?.id || 'cmdxumi04000k4yhw92fvsqqa';

  // Chat hooks
  const {
    conversations,
    createConversation,
    archiveConversation,
    deleteConversation,
  } = useConversations(currentProjectId);

  // Interactive prompts
  const {
    pendingPrompts,
    isRespondingToPrompt,
    handlePromptResponse,
  } = useInteractivePrompts({ conversationId: selectedConversationId });

  // WebSocket for real-time permission mode changes
  const { socket, joinConversation, leaveConversation } = useWebSocket();

  // WebSocket-based chat functionality
  const {
    sendMessage,
    streamingMessage,
    optimisticUserMessage,
    isStreaming,
    stopStreaming
  } = useChat(selectedConversationId);

  // File upload functionality
  const fileUpload = useFileUpload({
    maxFiles: 5,
    maxSizeBytes: 25 * 1024 * 1024, // 25MB
    onError: (err: unknown) => {
      console.error('File upload error:', err);
      // Toast will be handled at component level if needed
    }
  });

  // Get session ID from URL parameters for session tuning
  const urlSessionId = searchParams.get('sessionId');

  // Get conversation details including Claude session ID
  const { data: conversationDetails } = useConversation(selectedConversationId);
  
  // Fetch persisted messages for the selected conversation with session ID
  const { messages: dbMessages, isLoading: isLoadingMessages } = useMessages(selectedConversationId, urlSessionId || undefined);

  // Update URL when conversation changes and track current conversation globally
  useEffect(() => {
    if (selectedConversationId) {
      // Track current conversation for session ID updates
      (window as any).__currentConversationId = selectedConversationId;
      
      const sessionId = conversationDetails?.claudeSessionId;
      const url = sessionId 
        ? `/chat/${selectedConversationId}?sessionId=${sessionId}`
        : `/chat/${selectedConversationId}`;
      navigate(url, { replace: true });
      setIsNewChat(false);
    } else {
      (window as any).__currentConversationId = null;
      navigate('/chat', { replace: true });
      setIsNewChat(true);
    }
  }, [selectedConversationId, conversationDetails?.claudeSessionId, navigate]);

  // WebSocket conversation management and permission mode listener
  useEffect(() => {
    if (!selectedConversationId || !socket) {
      return;
    }

    // Join conversation room
    joinConversation(selectedConversationId);

    // Listen for permission mode changes via custom events (dispatched by useWebSocket)
    const handlePermissionModeChange = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🔄 Permission mode changed:', data);
      if (data.conversationId === selectedConversationId && data.permissionMode) {
        setPermissionMode(data.permissionMode);
      }
    };

    window.addEventListener('permission_mode_changed', handlePermissionModeChange as EventListener);

    return () => {
      window.removeEventListener('permission_mode_changed', handlePermissionModeChange as EventListener);
      leaveConversation(selectedConversationId);
    };
  }, [selectedConversationId, socket, joinConversation, leaveConversation]);

  // Greeting helper
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Filter conversations (placeholder: original code may have had search)
  const displayConversations = conversations || [];

  // Send message logic using WebSocket-based chat
  const handleSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // If new chat create conversation first and wait for it
    let convId = selectedConversationId;
    if (!convId) {
      const title = trimmed.slice(0, 40) || 'New conversation';
      try {
        const result = await createConversation.mutateAsync(title);
        // Mutation returns API response; refetch will populate list; we need to trust conversations update effect
        // For immediate continuity we fallback to using existing selectedConversationId once query invalidates
        // If API returns id, attempt to capture
        const maybeId = (result as { id?: string; conversation?: { id?: string } })?.id || 
                       (result as { id?: string; conversation?: { id?: string } })?.conversation?.id;
        if (maybeId) {
          convId = maybeId;
          setSelectedConversationId(convId);
        } else {
          console.error('❌ Failed to create conversation - no ID returned');
          return;
        }
      } catch (error) {
        console.error('❌ Failed to create conversation:', error);
        return;
      }
    }

    // Now that we have a conversation ID, we need to wait for the useChat hook to re-initialize
    // For now, let's make a direct WebSocket call instead of using the useChat hook
    // This is a temporary workaround - we should refactor this properly
    const attachments = fileUpload.files?.map(file => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      url: file.url || file.localUrl,
    })) || [];

    if (convId) {
      try {
        // Use the chat service directly instead of the hook for new conversations
        const { chatService } = await import('../services/chat.service');
        await chatService.sendMessage(
          {
            conversationId: convId,
            content: trimmed,
            attachments: attachments.length > 0 ? attachments : undefined,
          },
          (response) => {
            console.log('📨 Direct message response:', response);
          }
        );
      } catch (error) {
        console.error('❌ Failed to send message via direct service:', error);
        // Fallback to the hook method if available
        if (selectedConversationId === convId) {
          await sendMessage(trimmed, attachments.length > 0 ? attachments : undefined);
        }
      }
    }

    setInputValue('');
    fileUpload.clearFiles();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Permission mode cycling function
  const cyclePermissionMode = async () => {
    if (!selectedConversationId) {
      console.warn('Cannot cycle permission mode: no conversation selected');
      return;
    }

    const newMode = (() => {
      switch (permissionMode) {
        case 'default': return 'plan';
        case 'plan': return 'acceptEdits';
        case 'acceptEdits': return 'default';
        default: return 'default';
      }
    })();

    // Update local state immediately for responsiveness
    setPermissionMode(newMode);

    // Persist to database
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${selectedConversationId}/permission-mode`, {
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
        // Revert local state on error
        setPermissionMode(permissionMode);
      } else {
        console.log(`✅ Permission mode updated to '${newMode}' and persisted to database`);
      }
    } catch (error) {
      console.error('Error updating permission mode:', error);
      // Revert local state on error
      setPermissionMode(permissionMode);
    }
  };

  return {
    // State
    isNewChat,
    inputValue,
    setInputValue,
    selectedConversationId,
    setSelectedConversationId,
    showSidebar,
    setShowSidebar,
    permissionMode,
    cyclePermissionMode,
    
    // Data
    conversationDetails,
    urlSessionId,
    displayConversations,
    dbMessages,
    isLoadingMessages,
    
    // WebSocket-based chat state
    streamingMessage,
    optimisticUserMessage,
    isStreaming,
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