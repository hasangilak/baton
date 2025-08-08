import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
// (Layout-specific icons moved into layout components)
import { useConversations, useConversation, useMessages } from '../../hooks/useChat';
import { useProjects } from '../../hooks/useProjects';
import { useInteractivePrompts } from '../../hooks/useInteractivePrompts';
import { useClaudeStreaming } from '../../hooks/useClaudeStreaming';
import { useFileUpload } from '../../hooks/useFileUpload';
import { generateMessageId } from '../../utils/id';
import { ChatLayoutMobile } from './components/layout/ChatLayoutMobile';
import { ChatLayoutDesktop } from './components/layout/ChatLayoutDesktop';
import { useIsMobile } from './hooks/useIsMobile';
import { useToast } from '../../hooks/useToast';

export const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams] = useSearchParams();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    conversationId || null
  );
  const [inputValue, setInputValue] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isNewChat, setIsNewChat] = useState(true);

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

  // Search hook retained for future filtering (currently unused after layout refactor)
  // const { searchQuery, searchResults, isSearching } = useChatSearch(currentProjectId);

  // Interactive prompts
  const {
    pendingPrompts,
    isRespondingToPrompt,
    handlePromptResponse,
  } = useInteractivePrompts({ conversationId: selectedConversationId });

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
      // Safe toast usage (component is within provider hierarchy in App.tsx)
      try {
        const { error: showError } = useToast();
        let msg: string;
        if (typeof err === 'string') msg = err;
        else if (err && typeof err === 'object' && 'message' in err) msg = (err as any).message || 'Unable to upload file(s).';
        else msg = 'Unable to upload file(s).';
        showError('File upload failed', msg);
      } catch (_) {
        /* no-op if toast not available */
      }
    }
  });

  // Get conversation details including Claude session ID
  const { data: conversationDetails } = useConversation(selectedConversationId);
  
  // Fetch persisted messages for the selected conversation
  const { messages: dbMessages, isLoading: isLoadingMessages } = useMessages(selectedConversationId);
  
  // Get session ID from URL parameters for session tuning
  const urlSessionId = searchParams.get('sessionId');

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

  // const pendingMessageRef = useRef<string | null>(null); // Not needed after refactor

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
      const maybeId: any = (result as any)?.id || (result as any)?.conversation?.id;
      if (maybeId) {
        convId = maybeId;
      }
      setSelectedConversationId(convId);
    }

    claudeStreaming.sendMessage(trimmed, convId || undefined);
    setInputValue('');
    fileUpload.clearFiles();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isMobile = useIsMobile();
  return isMobile ? (
    <ChatLayoutMobile
      isNewChat={isNewChat}
      inputValue={inputValue}
      setInputValue={setInputValue}
      handleKeyPress={handleKeyPress}
      handleSendMessage={handleSendMessage}
      fileUpload={fileUpload}
      getGreeting={getGreeting}
      conversationDetails={conversationDetails}
      urlSessionId={urlSessionId}
      claudeStreaming={claudeStreaming}
      pendingPrompts={pendingPrompts}
      isRespondingToPrompt={isRespondingToPrompt}
      handlePromptResponse={handlePromptResponse}
      displayConversations={displayConversations}
      selectedConversationId={selectedConversationId}
      setSelectedConversationId={setSelectedConversationId}
      showSidebar={showSidebar}
      setShowSidebar={setShowSidebar}
      isLoadingMessages={isLoadingMessages}
      dbMessages={dbMessages}
      archiveConversation={archiveConversation}
      deleteConversation={deleteConversation}
      generateMessageId={generateMessageId}
    />
  ) : (
    <ChatLayoutDesktop
      isNewChat={isNewChat}
      inputValue={inputValue}
      setInputValue={setInputValue}
      handleKeyPress={handleKeyPress}
      handleSendMessage={handleSendMessage}
      fileUpload={fileUpload}
      getGreeting={getGreeting}
      conversationDetails={conversationDetails}
      urlSessionId={urlSessionId}
      claudeStreaming={claudeStreaming}
      pendingPrompts={pendingPrompts}
      isRespondingToPrompt={isRespondingToPrompt}
      handlePromptResponse={handlePromptResponse}
      displayConversations={displayConversations}
      selectedConversationId={selectedConversationId}
      setSelectedConversationId={setSelectedConversationId}
      showSidebar={showSidebar}
      setShowSidebar={setShowSidebar}
      isLoadingMessages={isLoadingMessages}
      dbMessages={dbMessages}
      archiveConversation={archiveConversation}
      deleteConversation={deleteConversation}
      generateMessageId={generateMessageId}
    />
  );
};

// (Moved helper + UI subcomponents into ./components/* for modularity)