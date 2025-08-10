import React from "react";
import { Menu, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WelcomeScreen } from "../WelcomeScreen";
import { SessionInfoBar } from "../SessionInfoBar";
import { ConversationInputArea } from "../ConversationInputArea";
import { useChatPageLogic } from "../../../../hooks/useChatPageLogic";
import { useConversationItems } from "../../../../hooks/useConversationItems";
import { ConversationItemRenderer } from "../ConversationItem";
import { usePlanReview, usePlanReviewWebSocket } from "../../../../hooks/usePlanReview";

export const ChatLayoutMobile: React.FC = () => {
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

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const autoScrollRef = React.useRef(true);
  const lastScrollHeightRef = React.useRef(0);

  // Always call hooks at top level - never conditionally
  const conversationItems = useConversationItems({
    dbMessages,
    claudeStreaming,
    pendingPrompts,
    selectedConversationId
  });

  // Track user manual scroll to disable auto-scroll temporarily
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      // If user scrolls up more than 50px from bottom, disable auto-scroll
      autoScrollRef.current = distanceFromBottom < 50;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollContainerRef.current;
      if (!el) return;
      // Only auto-scroll if user near bottom or explicitly streaming
      if (!autoScrollRef.current) return;
      
      // Calculate if we're already at the bottom
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
      
      // If we're already at bottom, no need to scroll
      if (isAtBottom) return;
      
      try {
        // Use setTimeout to ensure this runs after render
        setTimeout(() => {
          el.scrollTo({ 
            top: el.scrollHeight,
            behavior: behavior === "auto" ? "auto" : "smooth"
          });
        }, 0);
      } catch {
        // Fallback
        el.scrollTop = el.scrollHeight;
      }
    },
    []
  );

  // Improved scroll effect that handles all message updates
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Check if we should auto-scroll
    const shouldAutoScroll = autoScrollRef.current;
    
    // Scroll to bottom if we're streaming or if this is a new message
    if (shouldAutoScroll) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        // Add a small delay to ensure content is fully rendered
        setTimeout(() => {
          scrollToBottom(claudeStreaming.isStreaming ? "auto" : "smooth");
        }, 10);
      });
    }
    
    // Update last scroll height
    lastScrollHeightRef.current = el.scrollHeight;
  }, [
    scrollToBottom,
    conversationItems.length,
    claudeStreaming.isStreaming,
  ]);

  // Force scroll on first load of an existing chat
  React.useEffect(() => {
    if (!isNewChat) {
      // Delay slightly to ensure content is rendered
      const timer = setTimeout(() => {
        scrollToBottom("auto");
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isNewChat, scrollToBottom]);

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
          
          console.log('🛑 ESC pressed - aborting conversation (mobile)');
          
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
    <div className="h-full min-h-screen flex flex-col bg-[#1E1F22] text-gray-200 relative">
      {/* ESC key abort feedback (Claude Code style) */}
      {showAbortFeedback && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1 bg-red-600 text-white text-sm font-medium rounded shadow-lg animate-pulse">
          Interrupted
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#323337] bg-[#18191B] sticky top-0 z-30 h-11">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-2 rounded-md bg-[#242528] hover:bg-[#2A2B2E] focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Open conversations"
            data-testid="chat-open-sidebar-mobile"
          >
            <Menu className="w-4 h-4 text-gray-300" />
          </button>
          <h1 className="text-sm font-medium tracking-wide leading-none">
            {isNewChat ? "New Chat" : "Conversation"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              claudeStreaming.handleAbort();
              claudeStreaming.resetForNewConversation();
              setSelectedConversationId(null);
            }}
            className="px-2 py-1 rounded-md bg-[#242528] hover:bg-[#2A2B2E] text-[11px] text-gray-300 leading-none"
            data-testid="chat-new-mobile"
          >
            New
          </button>
        </div>
      </div>
      {showSidebar && (
        <div className="fixed inset-0 z-40 flex">
          <div className="w-64 bg-[#202123] h-full flex flex-col border-r border-[#303134] animate-slide-in">
            <div className="p-3 flex items-center justify-between border-b border-[#303134]">
              <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                Conversations
              </span>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-2 rounded-md hover:bg-[#2A2B2E] focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {displayConversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedConversationId(c.id);
                    setShowSidebar(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-[#2A2B2E] transition-colors border-b border-[#303134] ${
                    selectedConversationId === c.id ? "bg-[#2A2B2E]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 truncate">
                        {c.title || "New conversation"}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {formatDistanceToNow(new Date(c.updatedAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <button
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSidebar(false)}
            aria-label="Close sidebar backdrop"
          />
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
          <div className="flex-1 flex flex-col min-h-0">
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
            {/* Single dedicated scroll container */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto scroll-smooth no-scrollbar"
            >
              <div
                className="max-w-3xl mx-auto px-3 py-3 md:py-6 pb-[calc(var(--app-bottom-nav-height,56px)+140px)]"
                data-testid="chat-messages-scroll"
              >
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
                      onPlanReviewDecision={(_planReviewId, decision) => planReview.submitDecision(decision)}
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
          </div>
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
