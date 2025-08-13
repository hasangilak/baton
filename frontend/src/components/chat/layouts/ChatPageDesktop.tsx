import React from "react";
import { Menu, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WelcomeScreen } from "../shared/WelcomeScreen";
import { SessionInfo } from "../shared/SessionInfo";
import { ConversationInputArea } from "../input/ConversationInputArea";
import { DropdownMenu } from "../sidebar/DropdownMenu";
import { SimpleMessageRenderer } from "../messages/SimpleMessageRenderer";
import { SessionStatusIndicator } from "../shared/SessionStatusIndicator";
import { SessionErrorBanner } from "../shared/SessionErrorBanner";
import { ConnectionStatusIndicator, ConnectionLostBanner } from "../shared/ConnectionStatusIndicator";
import { BridgeServiceBanner, BridgeServiceIndicator } from "../shared/BridgeServiceBanner";
import { useChatIntegration } from "../../../hooks/chat/useChatIntegration";
import { useParams } from 'react-router-dom';
import { useFileUpload } from "../../../hooks/useFileUpload";
import { useInteractivePrompts } from "../../../hooks/useInteractivePrompts";
import { useConversationItems } from "../../../hooks/useConversationItems";

export const ChatPageDesktop: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  
  // Use the integration hook that provides a ChatContext-compatible interface
  const {
    state,
    conversations,
    selectConversation,
    startNewChat,
    sendMessage,
    stopStreaming,
    setInputValue,
    setSidebarVisible,
    setPermissionMode,
    archiveConversation,
    deleteConversation,
    isNewChat,
    getAllMessages,
    // Session management
    sessionState,
    currentSessionId,
    isSessionReady,
    isSessionPending,
    initializeSession,
    // WebSocket connection
    socket,
    isConnected,
    // Bridge service management
    retryBridgeMessage,
    // Utility
    clearError,
    clearBridgeError,
  } = useChatIntegration(projectId || '');

  const fileUpload = useFileUpload({
    maxFiles: 5,
    maxSizeBytes: 25 * 1024 * 1024,
    onError: (err) => console.error("File upload error:", err),
  });

  const { pendingPrompts, isRespondingToPrompt, handlePromptResponse } =
    useInteractivePrompts({ 
      projectId: state.selectedConversationId, // Note: after migration, selectedConversationId is actually projectId
      sessionId: currentSessionId,
      socket,
      enableAnalytics: false // Disabled: permissions handled via WebSocket only, no auto-polling
    });

  // State for ESC key abort feedback
  const [showAbortFeedback, setShowAbortFeedback] = React.useState(false);

  // State for session resume
  const [isResuming, setIsResuming] = React.useState(false);

  // Session error handling
  const [sessionError, setSessionError] = React.useState<any>(null);
  
  // Connection error handling
  const [showConnectionBanner, setShowConnectionBanner] = React.useState(false);
  
  // Get current messages including optimistic and streaming
  const rawMessages = getAllMessages();
  
  // Use unified conversation items that include interactive prompts
  const conversationItems = useConversationItems({
    dbMessages: rawMessages,
    streamingMessage: state.streamingMessage,
    optimisticUserMessage: state.optimisticUserMessage,
    isStreaming: state.isStreaming,
    pendingPrompts,
    selectedConversationId: state.selectedConversationId
  });
  
  // Debug: Track conversation items changes
  React.useEffect(() => {
    console.log('🖥️ ChatPageDesktop conversation items updated:', {
      itemCount: conversationItems.length,
      isStreaming: state.isStreaming,
      lastItemType: conversationItems[conversationItems.length - 1]?.type,
      itemTypes: conversationItems.map(item => item.type),
      pendingPromptCount: pendingPrompts.length
    });
  }, [conversationItems, state.isStreaming, pendingPrompts.length]);
  
  // Debug: Track re-renders
  React.useEffect(() => {
    console.log('🔄 ChatPageDesktop re-rendered');
  });

  // Helper functions
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleSendMessage = async () => {
    const trimmed = state.inputValue.trim();
    console.log('🔍 [DEBUG] ChatPageDesktop.handleSendMessage called:', {
      inputValue: state.inputValue,
      trimmedLength: trimmed.length,
      hasFiles: !!fileUpload.selectedFiles?.length,
      sendMessageExists: !!sendMessage
    });
    
    if (!trimmed) {
      console.log('🔍 [DEBUG] No trimmed content, returning early');
      return;
    }

    // const attachments =
    //   fileUpload.selectedFiles?.map((fileItem) => ({
    //     filename: fileItem.file.name,
    //     mimeType: fileItem.file.type,
    //     size: fileItem.file.size,
    //     url: fileItem.preview || `file://${fileItem.file.name}`,
    //   })) || [];

    // console.log('🔍 [DEBUG] About to call sendMessage with:', {
    //   message: trimmed,
    //   attachmentsCount: attachments.length
    // });

    try {
      await sendMessage(
        trimmed,
        undefined
      );
      console.log('✅ [DEBUG] sendMessage completed successfully');
      // fileUpload.clearFiles();
    } catch (error) {
      console.error("❌ [DEBUG] Failed to send message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const cyclePermissionMode = () => {
    const newMode = (() => {
      switch (state.permissionMode) {
        case "default":
          return "plan";
        case "plan":
          return "acceptEdits";
        case "acceptEdits":
          return "default";
        default:
          return "default";
      }
    })();
    setPermissionMode(newMode);
  };

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
  }, [conversationItems.length, state.isStreaming]);

  // ESC key handler for aborting conversations (Claude Code style)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle ESC key during streaming and not when modal/dropdown is open
      if (e.key === "Escape" && state.isStreaming) {
        // Check if there are any open modals/dropdowns to avoid interference
        const hasOpenModal = document.querySelector('[role="dialog"]');
        const hasOpenDropdown = document.querySelector('[role="menu"]');

        if (!hasOpenModal && !hasOpenDropdown) {
          e.preventDefault();
          e.stopPropagation();

          console.log("🛑 ESC pressed - aborting conversation");

          // Show immediate feedback (Claude Code style)
          setShowAbortFeedback(true);

          // Stop the WebSocket streaming
          stopStreaming();

          // Hide feedback after 3 seconds
          setTimeout(() => {
            setShowAbortFeedback(false);
          }, 3000);
        }
      }
    };

    // Add global event listener
    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [state.isStreaming, stopStreaming]);

  // Handle session resume - WebSocket approach doesn't need explicit session resume
  const handleResumeSession = React.useCallback(async () => {
    setIsResuming(true);
    try {
      // With WebSocket approach, sessions are automatically managed
      console.log(
        "✅ WebSocket connection handles session management automatically"
      );
    } catch (error) {
      console.error("❌ Session resume error:", error);
    } finally {
      setIsResuming(false);
    }
  }, []);

  // Listen for session-related errors from context
  React.useEffect(() => {
    if (state.error && state.error.includes('session')) {
      setSessionError({
        type: 'session_failed',
        message: state.error,
        recoverable: true
      });
    }
  }, [state.error]);

  // Monitor connection status
  React.useEffect(() => {
    if (!state.isConnected) {
      // Show connection banner after a short delay to avoid flicker
      const timer = setTimeout(() => {
        setShowConnectionBanner(true);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setShowConnectionBanner(false);
    }
  }, [state.isConnected]);

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
          onClick={() => setSidebarVisible(!state.showSidebar)}
          className="p-2 hover:bg-[#242528] rounded-lg transition-colors"
          data-testid="chat-toggle-sidebar"
          aria-label="Toggle conversations sidebar"
        >
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
        <div className="mt-8 space-y-4">
          <button
            onClick={() => {
              stopStreaming();
              selectConversation(null); // No session ID needed for new conversation
            }}
            className="p-2 hover:bg-[#242528] rounded-lg transition-colors"
            data-testid="chat-new-conversation"
            aria-label="Start new conversation"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
      {state.showSidebar && (
        <div className="hidden md:flex w-64 bg-[#1F2022] border-r border-[#2C2D30] flex-col">
          <div className="p-4 border-b border-[#3E3E42] flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-300">Conversations</h2>
            <button
              onClick={() => setSidebarVisible(false)}
              className="p-1 hover:bg-[#2D2D30] rounded transition-colors"
              data-testid="chat-close-sidebar"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  selectConversation(c.id, c.claudeSessionId || undefined);
                  setSidebarVisible(false);
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
                  <DropdownMenu
                    conversation={c}
                    onArchive={() => archiveConversation(c.id)}
                    onDelete={() => {
                      deleteConversation(c.id);
                      if (state.selectedConversationId === c.id)
                        selectConversation(null); // No session ID needed when clearing
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
          <>
           {/* Bridge service error banner */}
            {state.bridgeServiceError && (
              <div className="p-4 bg-[#1E1F22]">
                <BridgeServiceBanner
                  onRetry={retryBridgeMessage}
                  onDismiss={() => {
                    clearBridgeError();
                  }}
                />
              </div>
            )}
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
          </>
        ) : (
          <>
            {/* Session status bar */}
            <div className="bg-[#1F2022] border-b border-[#2C2D30] p-3 flex items-center justify-between">
              <SessionInfo
                sessionId={state.conversationDetails?.claudeSessionId}
                contextTokens={state.conversationDetails?.contextTokens ?? null}
                onResumeSession={handleResumeSession}
                isResuming={isResuming}
              />
              
              <div className="flex items-center gap-3">
                <ConnectionStatusIndicator compact />
                <BridgeServiceIndicator 
                  isError={state.bridgeServiceError} 
                  onClick={() => console.log('Bridge service indicator clicked')} 
                />
                <SessionStatusIndicator 
                  conversationId={state.selectedConversationId}
                />
              </div>
            </div>

            {/* Connection lost banner */}
            {showConnectionBanner && (
              <div className="p-4 bg-[#1E1F22]">
                <ConnectionLostBanner
                  onDismiss={() => setShowConnectionBanner(false)}
                  onRetry={() => {
                    // Unified WebSocket will handle automatic reconnection
                    console.log('Manual retry requested');
                  }}
                />
              </div>
            )}
            {/* Bridge service error banner */}
            {state.bridgeServiceError && (
              <div className="p-4 bg-[#1E1F22]">
                <BridgeServiceBanner
                  onRetry={retryBridgeMessage}
                  onDismiss={() => {
                    clearBridgeError();
                  }}
                />
              </div>
            )}

            {/* Session error banner */}
            {sessionError && (
              <div className="p-4 bg-[#1E1F22]">
                <SessionErrorBanner
                  conversationId={state.selectedConversationId}
                  error={sessionError}
                  onDismiss={() => setSessionError(null)}
                  onNewConversation={() => {
                    if (projectId) {
                      startNewChat(projectId);
                    }
                    setSessionError(null);
                  }}
                />
              </div>
            )}
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
                {conversationItems.map((item) => {
                  // Handle different conversation item types
                  if (item.type === 'prompt') {
                    const prompt = item.data;
                    const isUnified = (prompt as any)?.unifiedRequest;
                    const permissionType = (prompt as any)?.permissionType;
                    
                    console.log('🎨 Rendering interactive prompt:', {
                      promptId: prompt.id,
                      type: prompt.type,
                      isUnified,
                      permissionType,
                      title: prompt.title,
                      optionsCount: prompt.options?.length
                    });
                    
                    return (
                      <div key={item.id} className="mb-4 p-4 bg-[#2A2D31] border border-[#3E3E42] rounded-lg">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                            <h3 className="text-sm font-medium text-gray-200">
                              {prompt.title || 'Permission Required'}
                            </h3>
                            {isUnified && (
                              <span className="px-2 py-0.5 text-xs bg-blue-900 text-blue-200 rounded">
                                {permissionType}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Message */}
                        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                          {prompt.message}
                        </p>
                        
                        {/* Options */}
                        <div className="flex flex-wrap gap-2">
                          {prompt.options?.map((option) => (
                            <button
                              key={option.id}
                              onClick={() => {
                                console.log('🖱️ User clicked prompt option:', {
                                  promptId: prompt.id,
                                  optionId: option.id,
                                  optionValue: option.value
                                });
                                handlePromptResponse(prompt.id, option.id);
                              }}
                              disabled={isRespondingToPrompt}
                              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                option.style === 'primary' 
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                  : option.style === 'danger'
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-[#3E3E42] hover:bg-[#4A4A4E] text-gray-200 border border-[#5A5A5E]'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        
                        {/* Debug info in development */}
                        {process.env.NODE_ENV === 'development' && (
                          <div className="mt-3 pt-3 border-t border-[#3E3E42]">
                            <details className="text-xs text-gray-500">
                              <summary className="cursor-pointer">Debug Info</summary>
                              <pre className="mt-2 text-xs">
                                {JSON.stringify({
                                  id: prompt.id,
                                  type: prompt.type,
                                  conversationId: prompt.conversationId,
                                  sessionId: prompt.sessionId,
                                  isUnified,
                                  permissionType
                                }, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Handle loading state
                  if (item.type === 'loading') {
                    return (
                      <div key={item.id} className="flex items-center justify-center py-4">
                        <div className="text-sm text-gray-500">
                          Claude is thinking...
                        </div>
                      </div>
                    );
                  }
                  
                  // Handle message types (use 'data' property for message data)
                  if (item.type === 'message' && item.data) {
                    return (
                      <SimpleMessageRenderer
                        key={item.id}
                        message={item.data}
                        isStreaming={
                          state.isStreaming &&
                          !item.data.metadata?.isComplete
                        }
                        onCopy={(content, messageId) => {
                          navigator.clipboard.writeText(content);
                        }}
                      />
                    );
                  }
                  
                  // Fallback for unknown types
                  return (
                    <div key={item.id} className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">Unknown conversation item type: {item.type}</p>
                    </div>
                  );
                })}
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
              conversationId={state.selectedConversationId}
              messageCount={conversationItems.length}
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
