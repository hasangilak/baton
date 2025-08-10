import React from "react";
import { Menu, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WelcomeScreen } from "../shared/WelcomeScreen";
import { SessionInfo } from "../shared/SessionInfo";
import { ConversationInputArea } from "../input/ConversationInputArea";
import { SimpleMessageRenderer } from "../messages/SimpleMessageRenderer";
import { useChatContext } from "../../../contexts/ChatContext";
import { useFileUpload } from "../../../hooks/useFileUpload";
import { useInteractivePrompts } from "../../../hooks/useInteractivePrompts";

export const ChatPageMobile: React.FC = () => {
  const {
    state,
    conversations,
    selectConversation,
    sendMessage,
    stopStreaming,
    setInputValue,
    setSidebarVisible,
    setPermissionMode,
    archiveConversation,
    deleteConversation,
    isNewChat,
  } = useChatContext();

  const fileUpload = useFileUpload({
    maxFiles: 5,
    maxSizeBytes: 25 * 1024 * 1024,
    onError: (err) => console.error('File upload error:', err)
  });

  const {
    pendingPrompts,
    isRespondingToPrompt,
    handlePromptResponse,
  } = useInteractivePrompts({ conversationId: state.selectedConversationId });

  // State for mobile sidebar
  const [showMobileSidebar, setShowMobileSidebar] = React.useState(false);
  
  // State for session resume
  const [isResuming, setIsResuming] = React.useState(false);

  // Helper functions
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleSendMessage = async () => {
    const trimmed = state.inputValue.trim();
    if (!trimmed) return;

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

  const cyclePermissionMode = () => {
    const newMode = (() => {
      switch (state.permissionMode) {
        case 'default': return 'plan';
        case 'plan': return 'acceptEdits';
        case 'acceptEdits': return 'default';
        default: return 'default';
      }
    })();
    setPermissionMode(newMode);
  };

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
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
  }, [state.messages.length, state.isStreaming]);

  // Handle session resume
  const handleResumeSession = React.useCallback(async () => {
    setIsResuming(true);
    try {
      console.log('✅ WebSocket connection handles session management automatically');
    } catch (error) {
      console.error('❌ Session resume error:', error);
    } finally {
      setIsResuming(false);
    }
  }, []);

  return (
    <div className="h-[calc(100vh-90px)] flex flex-col bg-[#1E1F22] text-gray-200 relative">
      {/* Mobile Header */}
      <div className="flex md:hidden bg-[#191A1C] border-b border-[#2C2D30] p-4 items-center justify-between">
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="p-2 hover:bg-[#242528] rounded-lg transition-colors"
          data-testid="mobile-menu-button"
        >
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
        <h1 className="text-lg font-semibold text-gray-200">Chat</h1>
        <div className="w-9" /> {/* Spacer */}
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 md:hidden">
          <div className="w-80 max-w-[80vw] h-full bg-[#1F2022] border-r border-[#2C2D30]">
            <div className="p-4 border-b border-[#3E3E42] flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-300">Conversations</h2>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="p-1 hover:bg-[#2D2D30] rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    selectConversation(c.id);
                    setShowMobileSidebar(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-[#242528] transition-colors border-b border-[#2C2D30] ${
                    state.selectedConversationId === c.id ? "bg-[#242528]" : ""
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
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        {isNewChat ? (
          <WelcomeScreen
            inputValue={state.inputValue}
            setInputValue={setInputValue}
            handleKeyPress={handleKeyPress}
            handleSendMessage={handleSendMessage}
            fileUpload={fileUpload}
            getGreeting={getGreeting}
            permissionMode={state.permissionMode}
            onCyclePermissionMode={cyclePermissionMode}
          />
        ) : (
          <>
            <SessionInfo
              sessionId={state.conversationDetails?.claudeSessionId}
              contextTokens={state.conversationDetails?.contextTokens ?? null}
              onResumeSession={handleResumeSession}
              isResuming={isResuming}
            />
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-8"
              data-testid="chat-messages-scroll"
            >
              <div className="max-w-3xl mx-auto px-3 md:px-4 py-3 md:py-6">
                {state.isLoadingMessages && state.selectedConversationId && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-gray-500">
                      Loading conversation history...
                    </div>
                  </div>
                )}
                {state.messages.map((message) => (
                  <SimpleMessageRenderer
                    key={message.id}
                    message={message}
                    isStreaming={state.isStreaming && message.id === state.streamingMessage?.id}
                    onCopy={(content, messageId) => {
                      navigator.clipboard.writeText(content);
                    }}
                  />
                ))}
                <div style={{ height: 1 }} />
              </div>
            </div>
            <ConversationInputArea
              inputValue={state.inputValue}
              setInputValue={setInputValue}
              handleKeyPress={handleKeyPress}
              handleSendMessage={handleSendMessage}
              fileUpload={fileUpload}
              isDisabled={state.isStreaming}
              permissionMode={state.permissionMode}
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