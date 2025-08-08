import React from "react";
import { Menu, X } from "lucide-react";
import type { Message } from "../../../../types";
import { formatDistanceToNow } from "date-fns";
import { WelcomeScreen } from "../WelcomeScreen";
import { SessionInfoBar } from "../SessionInfoBar";
import { ConversationInputArea } from "../ConversationInputArea";
import { MessageBubble, LoadingMessage } from "../MessageBubble";
import { InteractivePromptComponent } from "../../InteractivePrompt";
import { extractMessageContent } from "../messageUtils";
import { generateMessageId } from "../../../../utils/id";
import { useChatPageLogic } from "../../../../hooks/useChatPageLogic";

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
  } = useChatPageLogic();

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const autoScrollRef = React.useRef(true);

  // Track user manual scroll to disable auto-scroll temporarily
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      // If user scrolls up more than 200px from bottom, disable auto-scroll
      autoScrollRef.current = distanceFromBottom < 200;
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
      try {
        el.scrollTo({ top: el.scrollHeight, behavior });
      } catch {
        el.scrollTop = el.scrollHeight;
      }
    },
    []
  );

  // Scroll when new persisted, streamed, or prompt messages appear
  React.useEffect(() => {
    scrollToBottom(claudeStreaming.isStreaming ? "auto" : "smooth");
  }, [
    scrollToBottom,
    dbMessages?.length,
    claudeStreaming.messages.length,
    claudeStreaming.currentAssistantMessage?.content,
    pendingPrompts.length,
  ]);

  // Force scroll on first load of an existing chat
  React.useEffect(() => {
    if (!isNewChat) scrollToBottom("auto");
  }, [isNewChat, scrollToBottom]);

  return (
    <div className="h-full min-h-screen flex flex-col bg-[#1E1F22] text-gray-200">
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
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {isNewChat ? (
          <WelcomeScreen
            inputValue={inputValue}
            setInputValue={setInputValue}
            handleKeyPress={handleKeyPress}
            handleSendMessage={handleSendMessage}
            fileUpload={fileUpload}
            getGreeting={getGreeting}
          />
        ) : (
          <div className="flex-1 flex flex-col">
            <SessionInfoBar
              sessionId={
                conversationDetails?.claudeSessionId ||
                urlSessionId ||
                claudeStreaming.currentSessionId
              }
              contextTokens={conversationDetails?.contextTokens ?? null}
            />
            {/* Single dedicated scroll container */}
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto scroll-smooth no-scrollbar"
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
                {dbMessages?.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {claudeStreaming.messages.map((msg: any, index: number) => {
                  const messageId =
                    msg.id ||
                    msg.timestamp?.toString() ||
                    `msg-${index}-${generateMessageId()}`;
                  const timestamp = msg.timestamp
                    ? new Date(msg.timestamp)
                    : new Date();
                  let displayMessage: Message;
                  if (msg.type === "chat") {
                    displayMessage = {
                      id: messageId,
                      conversationId: selectedConversationId || "",
                      role: msg.role || "assistant",
                      content: extractMessageContent(msg),
                      status: "completed",
                      createdAt: timestamp.toISOString(),
                      updatedAt: timestamp.toISOString(),
                    } as Message;
                  } else {
                    displayMessage = {
                      id: messageId,
                      conversationId: selectedConversationId || "",
                      role: "system",
                      content: extractMessageContent(msg),
                      status: "completed",
                      createdAt: timestamp.toISOString(),
                      updatedAt: timestamp.toISOString(),
                      metadata: {
                        streamingType: msg.type,
                        streamingSubtype: msg.subtype,
                      },
                    } as Message;
                  }
                  return (
                    <MessageBubble
                      key={messageId}
                      message={displayMessage}
                      streamingMessage={msg}
                    />
                  );
                })}
                {claudeStreaming.currentAssistantMessage && (
                  <MessageBubble
                    message={{
                      id: "streaming",
                      conversationId: selectedConversationId || "",
                      role: "assistant",
                      content: extractMessageContent(
                        claudeStreaming.currentAssistantMessage
                      ),
                      status: "sending",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    }}
                    streamingMessage={claudeStreaming.currentAssistantMessage}
                    isStreaming
                  />
                )}
                {claudeStreaming.isStreaming &&
                  !claudeStreaming.currentAssistantMessage && (
                    <LoadingMessage />
                  )}
                {pendingPrompts.map((p) => (
                  <InteractivePromptComponent
                    key={p.id}
                    prompt={p}
                    onOptionSelect={handlePromptResponse}
                    isResponding={isRespondingToPrompt}
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
