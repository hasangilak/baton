import { useEffect, useState, useRef } from 'react';
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
  const [permissionMode, setPermissionMode] = useState<'default' | 'plan' | 'acceptEdits'>('default');
  
  // Ref to track if conversation creation is already in progress
  const isCreatingConversationRef = useRef(false);

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
  
  // Auto-create conversation when visiting /chat without a conversation ID
  useEffect(() => {
    // Only auto-create if we're on the base /chat route (no conversationId) and we have a project
    // AND we're not already creating a conversation
    if (!conversationId && !selectedConversationId && currentProjectId && !isCreatingConversationRef.current) {
      isCreatingConversationRef.current = true;
      
      const autoCreateConversation = async () => {
        try {
          console.log('🚀 Auto-creating conversation for project:', currentProjectId);
          const result = await createConversation.mutateAsync('New Chat');
          
          const newConversationId = (result as { id?: string; conversation?: { id?: string } })?.id || 
                                   (result as { id?: string; conversation?: { id?: string } })?.conversation?.id;
          
          if (newConversationId) {
            console.log('✅ Auto-created conversation:', newConversationId);
            setSelectedConversationId(newConversationId);
          } else {
            console.error('❌ Failed to get conversation ID from auto-creation result');
          }
        } catch (error) {
          console.error('❌ Failed to auto-create conversation:', error);
        } finally {
          // Reset the flag regardless of success or failure
          isCreatingConversationRef.current = false;
        }
      };
      
      autoCreateConversation();
    }
  }, [conversationId, selectedConversationId, currentProjectId]);
  
  // Reset creation flag when conversation ID changes (for cleanup)
  useEffect(() => {
    if (selectedConversationId) {
      isCreatingConversationRef.current = false;
    }
  }, [selectedConversationId]);
  
  // Fetch persisted messages for the selected conversation with session ID
  const { messages: dbMessages, isLoading: isLoadingMessages } = useMessages(selectedConversationId, urlSessionId || undefined);

  // Compute isNewChat based on whether the conversation has any messages (including optimistic)
  // A conversation is "new" if it has no database messages AND no optimistic user message
  // This ensures immediate UI transition when user sends first message
  const isNewChat = !selectedConversationId || 
    ((!dbMessages || dbMessages.length === 0) && !optimisticUserMessage);

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
    } else {
      (window as any).__currentConversationId = null;
      navigate('/chat', { replace: true });
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

    // Use the proper useChat hook for message sending
    const attachments = fileUpload.selectedFiles?.map(fileItem => ({
      filename: fileItem.file.name,
      mimeType: fileItem.file.type,
      size: fileItem.file.size,
      url: fileItem.preview || `file://${fileItem.file.name}`,
    })) || [];

    if (convId) {
      try {
        // For existing conversations, use the useChat hook
        if (selectedConversationId === convId) {
          await sendMessage(trimmed, attachments.length > 0 ? attachments : undefined);
          console.log('✅ Message sent via useChat hook for existing conversation');
        } else {
          // For new conversations, we need to update the selected conversation ID first
          // Then the useChat hook will be re-initialized with the new conversation ID
          console.log('⏳ New conversation created, updating conversation ID and sending message');
          
          // Update the conversation ID state immediately
          setSelectedConversationId(convId);
          
          // Wait for the state update to propagate, then send the message
          setTimeout(async () => {
            try {
              await sendMessage(trimmed, attachments.length > 0 ? attachments : undefined);
              console.log('✅ Message sent via useChat hook for new conversation');
            } catch (error) {
              console.error('❌ Failed to send delayed message:', error);
            }
          }, 1000); // Slightly longer delay to allow useChat hook to reinitialize
        }
      } catch (error) {
        console.error('❌ Failed to send message via useChat hook:', error);
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