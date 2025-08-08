import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Plus, 
  MoreHorizontal, 
  Search, 
  ChevronUp,
  Edit3,
  BookOpen,
  Code2,
  Sparkles,
  Archive,
  Trash2,
  Menu,
  X,
  Send,
  Paperclip,
  Link,
  Copy
} from 'lucide-react';
import { useConversations, useChatSearch, useConversation, useMessages } from '../../hooks/useChat';
import { useProjects } from '../../hooks/useProjects';
import { useInteractivePrompts } from '../../hooks/useInteractivePrompts';
import { useClaudeStreaming } from '../../hooks/useClaudeStreaming';
import { useFileUpload } from '../../hooks/useFileUpload';
import { FileUploadArea } from './FileUploadArea';
import { InteractivePromptComponent } from './InteractivePrompt';
import { MessageTypeRenderer } from './messages/MessageTypeRenderer';
import type { Conversation, Message } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { generateMessageId } from '../../utils/id';

// Helper function to safely convert content to renderable string
const safeRenderContent = (content: any, _streamingMessage?: any): string => {
  if (content === null || content === undefined) {
    return '';
  }
  
  if (typeof content === 'string') {
    return content;
  }
  
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }
  
  // Handle arrays of content blocks (common in Claude responses)
  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        // Handle text blocks
        if (item.type === 'text' && item.text) {
          return item.text;
        }
        // Handle other structured content
        return JSON.stringify(item, null, 2);
      }
      return String(item);
    }).join('\n');
  }
  
  // Handle object content
  if (typeof content === 'object') {
    // Handle text blocks
    if (content.type === 'text' && content.text) {
      return content.text;
    }
    // Fallback to JSON representation
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }
  
  return String(content);
};


// Helper function to extract meaningful content from different message types
const extractMessageContent = (msg: any): string => {
  const msgType = msg.type;
  
  switch (msgType) {
    case 'system':
      if (msg.subtype === 'init') {
        const data = msg.data || msg;
        const session = data.session_id;
        const model = data.model || 'Claude';
        const toolCount = data.tools?.length || 0;
        return `Session initialized with ${model}\nSession ID: ${session}\nAvailable tools: ${toolCount}`;
      }
      return msg.message || msg.content || 'System message';
      
    case 'result':
      const data = msg.data || msg;
      const result = data.result || msg.result || '';
      const cost = data.total_cost_usd || 0;
      const duration = data.duration_ms || 0;
      const usage = data.usage;
      
      let resultContent = `${result}`;
      if (cost > 0 || duration > 0) {
        resultContent += '\n\n';
        if (duration > 0) resultContent += `Duration: ${duration}ms`;
        if (cost > 0) resultContent += `${duration > 0 ? ', ' : ''}Cost: $${cost.toFixed(4)}`;
        if (usage?.output_tokens) resultContent += `\nTokens: ${usage.output_tokens} output`;
      }
      return resultContent;
      
    case 'chat':
      return safeRenderContent(msg.content);
      
    default:
      return safeRenderContent(msg.message || msg.content || msg);
  }
};

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

  const {
    searchQuery,
    searchResults,
    isSearching,
  } = useChatSearch(currentProjectId);

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
    onError: (error) => {
      console.error('File upload error:', error);
      // TODO: Show error toast/notification
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

  const pendingMessageRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Effect to send pending message when conversation is created
  useEffect(() => {
    if (selectedConversationId && pendingMessageRef.current) {
      claudeStreaming.sendMessage(pendingMessageRef.current);
      pendingMessageRef.current = null;
    }
  }, [selectedConversationId, claudeStreaming]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() && fileUpload.selectedFiles.length === 0) return;

    // Prepare message with file context if files are selected
    let messageToSend = inputValue;
    if (fileUpload.selectedFiles.length > 0) {
      const fileList = fileUpload.selectedFiles
        .map(f => `- ${f.file.name} (${fileUpload.formatFileSize(f.file.size)}, ${f.type})`)
        .join('\n');
      
      messageToSend = `${inputValue}\n\nAttached files:\n${fileList}`;
    }

    setInputValue(''); // Clear input immediately for better UX
    fileUpload.clearFiles(); // Clear files after sending

    if (!selectedConversationId) {
      try {
        // Store the message to send after conversation is created
        pendingMessageRef.current = messageToSend;
        
        const result = await createConversation.mutateAsync(undefined);
        // Backend returns { success: true, conversation: {...} }
        const conversation = result.conversation || result.data;
        if (conversation && conversation.id) {
          setSelectedConversationId(conversation.id);
          // The useEffect will handle sending the message
        }
      } catch (error) {
        console.error('Failed to create conversation:', error);
        setInputValue(messageToSend.split('\n\nAttached files:')[0] || messageToSend); // Restore input on error
        pendingMessageRef.current = null;
      }
    } else {
      claudeStreaming.sendMessage(messageToSend);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Hello, night owl';
  };

  // Smooth auto-scroll to latest messages
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Use requestAnimationFrame to ensure DOM is painted before scrolling
    requestAnimationFrame(() => {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } catch {
        // Fallback for older browsers
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [
    dbMessages?.length,
    claudeStreaming.messages.length,
    !!claudeStreaming.currentAssistantMessage,
    claudeStreaming.isStreaming,
    pendingPrompts.length,
  ]);

  // Display conversations with search results
  const displayConversations = searchQuery.length > 2 && isSearching
    ? searchResults
    : conversations;

  return (
    <div className="flex h-full bg-[#2D2D30]">
      {/* Minimal Sidebar */}
      <div className="w-12 bg-[#212121] border-r border-[#3E3E42] flex flex-col items-center py-3">
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="p-2 hover:bg-[#2D2D30] rounded-lg transition-colors"
          data-testid="chat-toggle-sidebar"
        >
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
        
        <div className="mt-8 space-y-4">
          <button
            onClick={() => {
              // Enhanced new conversation - clear all session state
              console.log('🆕 Starting new conversation - clearing all state');
              
              // Clear streaming state first
              claudeStreaming.handleAbort();
              
              // Use enhanced reset function to clear all state
              claudeStreaming.resetForNewConversation();
              
              // Clear component state
              setSelectedConversationId(null);
              setIsNewChat(true);
              
              console.log('✅ New conversation ready - all state cleared');
            }}
            className="p-2 hover:bg-[#2D2D30] rounded-lg transition-colors"
            data-testid="chat-new-conversation"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Expanded Sidebar */}
      {showSidebar && (
        <div className="w-64 bg-[#252526] border-r border-[#3E3E42] flex flex-col">
          <div className="p-4 border-b border-[#3E3E42] flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-300">Conversations</h2>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-1 hover:bg-[#2D2D30] rounded transition-colors"
              data-testid="chat-close-sidebar"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {displayConversations.map((conversation: Conversation) => (
              <button
                key={conversation.id}
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setShowSidebar(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-[#2D2D30] transition-colors border-b border-[#3E3E42] ${
                  selectedConversationId === conversation.id ? 'bg-[#2D2D30]' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">
                      {conversation.title || 'New conversation'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <DropdownMenu conversation={conversation} 
                    onArchive={() => archiveConversation.mutate(conversation.id)}
                    onDelete={() => {
                      deleteConversation.mutate(conversation.id);
                      if (selectedConversationId === conversation.id) {
                        setSelectedConversationId(null);
                      }
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {isNewChat ? (
          // Welcome Screen
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <h1 className="text-3xl font-normal text-[#E5E5E5] mb-12 flex items-center justify-center">
                <Sparkles className="w-7 h-7 mr-3 text-[#FF6B6B]" />
                {getGreeting()}
              </h1>
              
              {/* File Upload Area */}
              <FileUploadArea
                files={fileUpload.selectedFiles}
                onRemoveFile={fileUpload.removeFile}
                formatFileSize={fileUpload.formatFileSize}
              />
              
              <div className="relative">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="How can I help you today?"
                  className="w-full px-4 py-3 pr-12 bg-[#3E3E42] border border-[#565658] rounded-xl text-[#E5E5E5] placeholder-[#8B8B8D] resize-none focus:outline-none focus:border-[#6B6B6D] transition-colors"
                  style={{ minHeight: '85px', maxHeight: '200px' }}
                  rows={1}
                  data-testid="chat-text-area-middle"
                />
                
                <div className="absolute left-3 bottom-3 flex items-center space-x-2">
                  <button 
                    onClick={fileUpload.openFileDialog}
                    className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors"
                    title="Attach files"
                    data-testid="chat-attach-files-welcome"
                  >
                    <Paperclip className="w-4 h-4 text-[#8B8B8D]" />
                  </button>
                  <button 
                    className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors"
                    data-testid="chat-more-options-welcome"
                  >
                    <MoreHorizontal className="w-4 h-4 text-[#8B8B8D]" />
                  </button>
                  <button 
                    className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors flex items-center space-x-1"
                    data-testid="chat-research-welcome"
                  >
                    <Search className="w-4 h-4 text-[#8B8B8D]" />
                    <span className="text-xs text-[#8B8B8D]">Research</span>
                  </button>
                </div>
                
                <div className="absolute right-3 bottom-3 flex items-center space-x-2">
                  <button 
                    className="px-3 py-1.5 bg-[#2D2D30] hover:bg-[#252526] rounded-lg transition-colors flex items-center space-x-1"
                    data-testid="chat-model-selector-welcome"
                  >
                    <span className="text-xs text-[#8B8B8D]">Claude Sonnet 4</span>
                    <ChevronUp className="w-3 h-3 text-[#8B8B8D]" />
                  </button>
                  <button 
                    onClick={handleSendMessage}
                    disabled={(!inputValue.trim() && fileUpload.selectedFiles.length === 0)}
                    className="p-1.5 text-[#8B8B8D] hover:text-[#E5E5E5] disabled:opacity-50 transition-colors"
                    data-testid="chat-send-welcome"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-center space-x-4 mt-8">
                <ActionButton icon={Edit3} label="Write" testId="chat-action-write" />
                <ActionButton icon={BookOpen} label="Learn" testId="chat-action-learn" />
                <ActionButton icon={Code2} label="Code" testId="chat-action-code" />
                <ActionButton icon={Sparkles} label="Life stuff" testId="chat-action-life" />
              </div>
            </div>
          </div>
        ) : (
          // Conversation View
          <div className="flex-1 flex flex-col">
            {/* Session Info Bar */}
            {(conversationDetails?.claudeSessionId || urlSessionId || claudeStreaming.currentSessionId) && (
              <div className="bg-[#252526] border-b border-[#3E3E42] px-4 py-2 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Link className="w-3 h-3 text-[#8B8B8D]" />
                  <span className="text-[#8B8B8D]">Claude Session:</span>
                  <code className="text-[#E5E5E5] bg-[#3E3E42] px-2 py-1 rounded">
                    {conversationDetails?.claudeSessionId || urlSessionId || claudeStreaming.currentSessionId}
                  </code>
                  {conversationDetails?.contextTokens && (
                    <span className="text-[#8B8B8D] ml-2">
                      ({conversationDetails.contextTokens.toLocaleString()} tokens)
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <button 
                    onClick={() => {
                      const sessionId = conversationDetails?.claudeSessionId || urlSessionId || claudeStreaming.currentSessionId;
                      if (sessionId) {
                        navigator.clipboard.writeText(sessionId);
                      }
                    }}
                    className="p-1 hover:bg-[#3E3E42] rounded transition-colors"
                    title="Copy session ID"
                    data-testid="chat-copy-session-id"
                  >
                    <Copy className="w-3 h-3 text-[#8B8B8D]" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div ref={scrollContainerRef} className="max-w-3xl mx-auto px-4 py-8 h-[calc(100vh-250px)] overflow-y-auto no-scrollbar">
                {/* Loading state for persisted messages */}
                {isLoadingMessages && selectedConversationId && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-gray-500">Loading conversation history...</div>
                  </div>
                )}
                
                {/* Display persisted messages from database */}
                {dbMessages?.map((msg) => (
                  <MessageBubble 
                    key={msg.id}
                    message={msg}
                  />
                ))}
                
                {/* Display real-time streaming messages */}
                {claudeStreaming.messages.map((msg, index) => {
                  // Convert WebUI streaming message to display format
                  const messageId = (msg as any).id || msg.timestamp?.toString() || `msg-${index}-${generateMessageId()}`;
                  const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
                  
                  let displayMessage: Message;
                  if (msg.type === 'chat') {
                    const chatMsg = msg as any;
                    displayMessage = {
                      id: messageId,
                      conversationId: selectedConversationId || '',
                      role: chatMsg.role || 'assistant',
                      content: extractMessageContent(msg),
                      status: 'completed' as const,
                      createdAt: timestamp.toISOString(),
                      updatedAt: timestamp.toISOString(),
                    };
                  } else {
                    displayMessage = {
                      id: messageId,
                      conversationId: selectedConversationId || '',
                      role: 'system' as const,
                      content: extractMessageContent(msg),
                      status: 'completed' as const,
                      createdAt: timestamp.toISOString(),
                      updatedAt: timestamp.toISOString(),
                      // Pass the streaming message type for badge display
                      metadata: { 
                        streamingType: msg.type,
                        streamingSubtype: (msg as any).subtype
                      }
                    };
                  }
                  
                  return <MessageBubble key={messageId} message={displayMessage} streamingMessage={msg} />;
                })}
                
                {/* Show streaming message when Claude is responding */}
                {claudeStreaming.currentAssistantMessage && (
                  <MessageBubble 
                    message={{
                      id: 'streaming',
                      conversationId: selectedConversationId || '',
                      role: 'assistant',
                      content: extractMessageContent(claudeStreaming.currentAssistantMessage),
                      status: 'sending',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    }} 
                    streamingMessage={claudeStreaming.currentAssistantMessage}
                    isStreaming 
                  />
                )}

                {/* Show loading state when waiting for response but no streaming yet */}
                {claudeStreaming.isStreaming && !claudeStreaming.currentAssistantMessage && (
                  <LoadingMessage />
                )}

                {/* Interactive Prompts */}
                {pendingPrompts.map(prompt => (
                  <InteractivePromptComponent
                    key={prompt.id}
                    prompt={prompt}
                    onOptionSelect={handlePromptResponse}
                    isResponding={isRespondingToPrompt}
                  />
                ))}

                {/* End of message list */}
                <div style={{ height: 1 }} />
              </div>
            </div>
            
            {/* Input Area */}
            <div className="border-t border-[#3E3E42] bg-[#2D2D30]">
              <div className="max-w-3xl mx-auto px-4 py-4">
                {/* File Upload Area */}
                <FileUploadArea
                  files={fileUpload.selectedFiles}
                  onRemoveFile={fileUpload.removeFile}
                  formatFileSize={fileUpload.formatFileSize}
                />
                
                <div className="relative">
                  <textarea
                    data-testid="chat-text-area-bottom"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Reply..."
                    disabled={claudeStreaming.isStreaming}
                    className="w-full px-4 py-3 pr-12 bg-[#3E3E42] border border-[#565658] rounded-xl text-[#E5E5E5] placeholder-[#8B8B8D] resize-none focus:outline-none focus:border-[#6B6B6D] transition-colors disabled:opacity-50"
                    style={{ minHeight: '76px', maxHeight: '200px' }}
                    rows={1}
                  />
                  
                  <div className="absolute left-3 bottom-3 flex items-center space-x-2">
                    <button 
                      onClick={fileUpload.openFileDialog}
                      className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors"
                      title="Attach files"
                      data-testid="chat-attach-files-conversation"
                    >
                      <Paperclip className="w-4 h-4 text-[#8B8B8D]" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={handleSendMessage}
                    disabled={(!inputValue.trim() && fileUpload.selectedFiles.length === 0) || claudeStreaming.isStreaming}
                    className="absolute right-3 bottom-3 p-1.5 text-[#8B8B8D] hover:text-[#E5E5E5] disabled:opacity-50 transition-colors"
                    data-testid="chat-send-conversation"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileUpload.fileInputRef}
        onChange={(e) => fileUpload.handleFileSelection(e.target.files)}
        multiple
        accept={fileUpload.supportedExtensions.join(',')}
        style={{ display: 'none' }}
      />
    </div>
  );
};

// Action Button Component
const ActionButton: React.FC<{ icon: React.ElementType; label: string; testId?: string }> = ({ icon: Icon, label, testId }) => (
  <button 
    className="flex items-center space-x-2 px-4 py-2 border border-[#3E3E42] rounded-lg hover:bg-[#3E3E42] transition-colors"
    data-testid={testId}
  >
    <Icon className="w-4 h-4 text-[#8B8B8D]" />
    <span className="text-sm text-[#8B8B8D]">{label}</span>
  </button>
);


// Message Bubble Component - Now using our new MessageTypeRenderer
const MessageBubble: React.FC<{ 
  message: Message; 
  isStreaming?: boolean; 
  streamingMessage?: any 
}> = ({ message, isStreaming, streamingMessage }) => {
  // Convert streaming message to our message format if needed
  let processedMessage = message;
  
  if (streamingMessage) {
    // Create a message object compatible with our MessageTypeRenderer
    processedMessage = {
      ...message,
      // Add streaming type info to metadata for our components to use
      metadata: {
        ...message.metadata,
        streamingType: streamingMessage.type,
        streamingSubtype: streamingMessage.subtype,
        streamingData: streamingMessage
      }
    };
    
    // For tool messages, ensure we have proper tool data
    if (streamingMessage.type === 'tool_use') {
      processedMessage.metadata = {
        ...processedMessage.metadata,
        toolName: streamingMessage.name || 'Tool',
        toolInput: streamingMessage.input || streamingMessage.args || streamingMessage.parameters
      };
    }
  }

  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      console.log('Copied content for message:', messageId);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleRetry = (messageId: string) => {
    console.log('Retry message:', messageId);
  };

  return (
    <div 
      className="mb-6"
      data-testid={`message-${message.id}`}
      data-testid-role={`message-role-${message.role}`}
      data-testid-status={message.status}
    >
      <MessageTypeRenderer
        message={processedMessage}
        isStreaming={isStreaming}
        onCopy={handleCopy}
        onRetry={handleRetry}
      />
    </div>
  );
};

// Loading Message Component for Claude Response
const LoadingMessage: React.FC = () => {
  return (
    <div className="mb-6">
      <div className="max-w-[85%]">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#3E3E42]">
            <Sparkles className="w-4 h-4 text-[#FF6B6B]" />
          </div>
          
          <div className="flex-1">
            <p className="text-xs text-[#8B8B8D] mb-1">Claude</p>
            <div className="inline-block px-4 py-2 rounded-xl bg-transparent text-[#E5E5E5]">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-[#FF6B6B] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <span className="text-sm text-[#8B8B8D]">Claude is thinking...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Dropdown Menu Component
const DropdownMenu: React.FC<{
  conversation: Conversation;
  onArchive: () => void;
  onDelete: () => void;
}> = ({ onArchive, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1 hover:bg-[#3E3E42] rounded transition-colors"
      >
        <MoreHorizontal className="w-4 h-4 text-gray-400" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-[#3E3E42] border border-[#565658] rounded-lg shadow-lg z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
              setIsOpen(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2D2D30] transition-colors flex items-center space-x-2"
          >
            <Archive className="w-4 h-4" />
            <span>Archive</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setIsOpen(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[#2D2D30] transition-colors flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};