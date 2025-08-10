import React from "react";
import { Menu, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WelcomeScreen } from "../WelcomeScreen";
import { SessionInfoBar } from "../SessionInfoBar";
import { ConversationInputArea } from "../ConversationInputArea";
import { DropdownMenu } from "../DropdownMenu";
import { useChatPageLogic } from "../../../../hooks/useChatPageLogic";
import { useConversationItems } from "../../../../hooks/useConversationItems";
import { ConversationItemRenderer } from "../ConversationItem";
import { usePlanReview, usePlanReviewWebSocket } from "../../../../hooks/usePlanReview";

export const ChatLayoutDesktop: React.FC = () => {
  const {
    isNewChat,
    inputValue,
    setInputValue,
    handleKeyPress,
    handleSendMessage,
    fileUpload,
    getGreeting,
    conversationDetails,
    urlSessionId,
    claudeStreaming,
    pendingPrompts,
    isRespondingToPrompt,
    handlePromptResponse,
    displayConversations,
    selectedConversationId,
    setSelectedConversationId,
    showSidebar,
    setShowSidebar,
    isLoadingMessages,
    dbMessages,
    archiveConversation,
    deleteConversation,
    permissionMode,
    cyclePermissionMode,
  } = useChatPageLogic();

  // State for ESC key abort feedback
  const [showAbortFeedback, setShowAbortFeedback] = React.useState(false);
  
  // State for session resume
  const [isResuming, setIsResuming] = React.useState(false);

  // Plan review functionality
  const planReview = usePlanReview({
    conversationId: selectedConversationId || undefined,
    onPlanReviewResolved: (decision) => {
      console.log('📋 Plan review resolved:', decision);
    }
  });

  // Set up WebSocket listeners for plan reviews
  usePlanReviewWebSocket();

  // Always call hooks at top level - never conditionally
  const conversationItems = useConversationItems({
    dbMessages,
    claudeStreaming,
    pendingPrompts,
    selectedConversationId
  });

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } catch {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [
    conversationItems.length,
    claudeStreaming.isStreaming,
  ]);

  // ESC key handler for aborting conversations (Claude Code style)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle ESC key during streaming and not when modal/dropdown is open
      if (e.key === 'Escape' && claudeStreaming.isStreaming) {
        // Check if there are any open modals/dropdowns to avoid interference
        const hasOpenModal = document.querySelector('[role="dialog"]');
        const hasOpenDropdown = document.querySelector('[role="menu"]');
        
        if (!hasOpenModal && !hasOpenDropdown) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('🛑 ESC pressed - aborting conversation');
          
          // Show immediate feedback (Claude Code style)
          setShowAbortFeedback(true);
          
          // Add abort message to conversation history
          claudeStreaming.addMessage({
            type: "abort",
            subtype: "user_abort",
            message: "Conversation aborted by user (ESC key)",
            reason: "User pressed ESC key to stop the conversation",
            timestamp: Date.now(),
          });
          
          // Abort the conversation
          claudeStreaming.handleAbort();
          
          // Hide feedback after 3 seconds
          setTimeout(() => {
            setShowAbortFeedback(false);
          }, 3000);
        }
      }
    };

    // Add global event listener
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [claudeStreaming.isStreaming, claudeStreaming.handleAbort]);

  // Handle session resume
  const handleResumeSession = React.useCallback(async () => {
    setIsResuming(true);
    try {
      // Use URL session ID as fallback if chatState doesn't have it yet
      const sessionIdToResume = claudeStreaming.currentSessionId || urlSessionId || 
                               conversationDetails?.claudeSessionId;
      const success = await claudeStreaming.resumeSession(sessionIdToResume);
      if (success) {
        console.log('✅ Session resumed successfully');
      }
    } catch (error) {
      console.error('❌ Session resume error:', error);
    } finally {
      setIsResuming(false);
    }
  }, [claudeStreaming, urlSessionId, conversationDetails?.claudeSessionId]);

  return (
    <div className="h-[calc(100vh-90px)] flex flex-col md:flex-row bg-[#1E1F22] text-gray-200 relative">
      {/* ESC key abort feedback (Claude Code style) */}
      {showAbortFeedback && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1 bg-red-600 text-white text-sm font-medium rounded shadow-lg animate-pulse">
          Interrupted
        </div>
      )}
      <div className="hidden md:flex w-12 bg-[#191A1C] border-r border-[#2C2D30] flex-col items-center">
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="p-2 hover:bg-[#242528] rounded-lg transition-colors"
          data-testid="chat-toggle-sidebar"
          aria-label="Toggle conversations sidebar"
        >
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
        <div className="mt-8 space-y-4">
          <button
            onClick={() => {
              claudeStreaming.handleAbort();
              claudeStreaming.resetForNewConversation();
              setSelectedConversationId(null);
            }}
            className="p-2 hover:bg-[#242528] rounded-lg transition-colors"
            data-testid="chat-new-conversation"
            aria-label="Start new conversation"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
      {showSidebar && (
        <div className="hidden md:flex w-64 bg-[#1F2022] border-r border-[#2C2D30] flex-col">
          <div className="p-4 border-b border-[#3E3E42] flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-300">Conversations</h2>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-1 hover:bg-[#2D2D30] rounded transition-colors"
              data-testid="chat-close-sidebar"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {displayConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedConversationId(c.id);
                  setShowSidebar(false);
                  // Update URL with session ID if available
                  const sessionId = c.claudeSessionId;
                  if (sessionId) {
                    window.history.replaceState(null, '', `/chat/${c.id}?sessionId=${sessionId}`);
                  }
                }}
                className={`w-full px-4 py-3 text-left hover:bg-[#242528] transition-colors border-b border-[#2C2D30] ${
                  selectedConversationId === c.id ? "bg-[#242528]" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">
                      {c.title || "New conversation"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(c.updatedAt), {
                          addSuffix: true,
                        })}
                      </p>
                      {c.claudeSessionId && (
                        <span className="text-xs bg-[#2C2D30] text-gray-400 px-1 py-0.5 rounded">
                          Session: {c.claudeSessionId.slice(-8)}
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu
                    conversation={c}
                    onArchive={() => archiveConversation.mutate(c.id)}
                    onDelete={() => {
                      deleteConversation.mutate(c.id);
                      if (selectedConversationId === c.id)
                        setSelectedConversationId(null);
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0">
        {isNewChat ? (
          <WelcomeScreen
            inputValue={inputValue}
            setInputValue={setInputValue}
            handleKeyPress={handleKeyPress}
            handleSendMessage={handleSendMessage}
            fileUpload={fileUpload}
            getGreeting={getGreeting}
            permissionMode={permissionMode}
            onCyclePermissionMode={cyclePermissionMode}
          />
        ) : (
          <>
            <SessionInfoBar
              sessionId={
                conversationDetails?.claudeSessionId ||
                urlSessionId ||
                claudeStreaming.currentSessionId
              }
              contextTokens={conversationDetails?.contextTokens ?? null}
              onResumeSession={handleResumeSession}
              isResuming={isResuming}
            />
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-8"
              data-testid="chat-messages-scroll"
            >
              <div className="max-w-3xl mx-auto px-3 md:px-4 py-3 md:py-6">
                {isLoadingMessages && selectedConversationId && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-gray-500">
                      Loading conversation history...
                    </div>
                  </div>
                )}
{conversationItems.map((item) => (
                    <ConversationItemRenderer
                      key={item.id}
                      item={item}
                      onPromptResponse={handlePromptResponse}
                      onPlanReviewDecision={(planReviewId, decision) => planReview.submitPlanDecision(planReviewId, decision)}
                      isRespondingToPrompt={isRespondingToPrompt}
                    />
                  ))}
                <div style={{ height: 1 }} />
              </div>
            </div>
            <ConversationInputArea
              inputValue={inputValue}
              setInputValue={setInputValue}
              handleKeyPress={handleKeyPress}
              handleSendMessage={handleSendMessage}
              fileUpload={fileUpload}
              isDisabled={claudeStreaming.isStreaming}
              permissionMode={permissionMode}
              onCyclePermissionMode={cyclePermissionMode}
            />
          </>
        )}
      </div>
      <input
        type="file"
        ref={fileUpload.fileInputRef}
        onChange={(e) => fileUpload.handleFileSelection(e.target.files)}
        multiple
        accept={fileUpload.supportedExtensions.join(",")}
        style={{ display: "none" }}
      />

    </div>
  );
};
