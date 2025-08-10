import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useConversations, useConversation, useMessages } from './useChat';
import { useProjects } from './useProjects';
import { useInteractivePrompts } from './useInteractivePrompts';
import { useClaudeStreaming } from './useClaudeStreaming';
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

  // New WebUI-based streaming with enhanced features
  const claudeStreaming = useClaudeStreaming({ 
    conversationId: selectedConversationId || undefined,
    onSessionId: (sessionId) => {
      console.log('🆔 Session ID received in ChatPage:', sessionId);
      
      // Immediately update URL with session ID query parameter
      if (selectedConversationId && sessionId) {
        const newUrl = `/chat/${selectedConversationId}?sessionId=${sessionId}`;
        console.log('🔄 Updating URL with session ID:', newUrl);
        navigate(newUrl, { replace: true });
        
        // Update chat state with session ID
        claudeStreaming.updateSessionId(sessionId);
      }
    },
    onPermissionError: (error) => {
      console.warn('🔒 Permission error in ChatPage:', error);
    }
  });

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

  // Update URL when conversation changes, including session ID
  useEffect(() => {
    if (selectedConversationId) {
      const sessionId = conversationDetails?.claudeSessionId || claudeStreaming.currentSessionId;
      const url = sessionId 
        ? `/chat/${selectedConversationId}?sessionId=${sessionId}`
        : `/chat/${selectedConversationId}`;
      navigate(url, { replace: true });
      setIsNewChat(false);
    } else {
      navigate('/chat', { replace: true });
      setIsNewChat(true);
    }
  }, [selectedConversationId, conversationDetails?.claudeSessionId, claudeStreaming.currentSessionId, navigate]);

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

  // Send message logic (simplified preserving existing streaming integration)
  const handleSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // If new chat create conversation first
    let convId = selectedConversationId;
    if (!convId) {
      const title = trimmed.slice(0, 40) || 'New conversation';
      const result = await createConversation.mutateAsync(title);
      // Mutation returns API response; refetch will populate list; we need to trust conversations update effect
      // For immediate continuity we fallback to using existing selectedConversationId once query invalidates
      // If API returns id, attempt to capture
      const maybeId = (result as { id?: string; conversation?: { id?: string } })?.id || 
                     (result as { id?: string; conversation?: { id?: string } })?.conversation?.id;
      if (maybeId) {
        convId = maybeId;
      }
      setSelectedConversationId(convId);
    }

    claudeStreaming.sendMessage(trimmed, convId || undefined, permissionMode);
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
  const cyclePermissionMode = () => {
    setPermissionMode(current => {
      switch (current) {
        case 'default': return 'plan';
        case 'plan': return 'acceptEdits';
        case 'acceptEdits': return 'default';
        default: return 'default';
      }
    });
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
    
    // Hooks
    claudeStreaming,
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