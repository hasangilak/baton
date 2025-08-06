import React, { useState, useEffect, useRef } from 'react';
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
import { useConversations, useChatSearch, useConversation } from '../../hooks/useChat';
import { useProjects } from '../../hooks/useProjects';
import { useInteractivePrompts } from '../../hooks/useInteractivePrompts';
import { useClaudeStreaming } from '../../hooks/useClaudeStreaming';
import { useFileUpload } from '../../hooks/useFileUpload';
import { FileUploadArea } from './FileUploadArea';
import type { Conversation, Message } from '../../types';
import { formatDistanceToNow } from 'date-fns';

// Helper function to safely convert content to renderable string
const safeRenderContent = (content: any): string => {
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
  const currentProjectId = projects?.[0]?.id || 'demo-project-1';

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
        >
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
        
        <div className="mt-8 space-y-4">
          <button
            onClick={() => {
              setSelectedConversationId(null);
              setIsNewChat(true);
            }}
            className="p-2 hover:bg-[#2D2D30] rounded-lg transition-colors"
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
                  >
                    <Paperclip className="w-4 h-4 text-[#8B8B8D]" />
                  </button>
                  <button className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-[#8B8B8D]" />
                  </button>
                  <button className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors flex items-center space-x-1">
                    <Search className="w-4 h-4 text-[#8B8B8D]" />
                    <span className="text-xs text-[#8B8B8D]">Research</span>
                  </button>
                </div>
                
                <div className="absolute right-3 bottom-3 flex items-center space-x-2">
                  <button className="px-3 py-1.5 bg-[#2D2D30] hover:bg-[#252526] rounded-lg transition-colors flex items-center space-x-1">
                    <span className="text-xs text-[#8B8B8D]">Claude Sonnet 4</span>
                    <ChevronUp className="w-3 h-3 text-[#8B8B8D]" />
                  </button>
                  <button 
                    onClick={handleSendMessage}
                    disabled={(!inputValue.trim() && fileUpload.selectedFiles.length === 0)}
                    className="p-1.5 text-[#8B8B8D] hover:text-[#E5E5E5] disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-center space-x-4 mt-8">
                <ActionButton icon={Edit3} label="Write" />
                <ActionButton icon={BookOpen} label="Learn" />
                <ActionButton icon={Code2} label="Code" />
                <ActionButton icon={Sparkles} label="Life stuff" />
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
                  >
                    <Copy className="w-3 h-3 text-[#8B8B8D]" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-8 h-[calc(100vh-250px)] overflow-y-auto no-scrollbar">
                {claudeStreaming.messages.map((msg, index) => {
                  // Convert WebUI streaming message to display format
                  const messageId = msg.timestamp?.toString() || `msg-${index}-${Date.now()}`;
                  const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
                  
                  let displayMessage: Message;
                  if (msg.type === 'chat') {
                    const chatMsg = msg as any;
                    displayMessage = {
                      id: messageId,
                      conversationId: selectedConversationId || '',
                      role: chatMsg.role || 'assistant',
                      content: safeRenderContent(chatMsg.content),
                      status: 'completed' as const,
                      createdAt: timestamp.toISOString(),
                      updatedAt: timestamp.toISOString(),
                    };
                  } else {
                    const systemMsg = msg as any;
                    displayMessage = {
                      id: messageId,
                      conversationId: selectedConversationId || '',
                      role: 'system' as const,
                      content: safeRenderContent(systemMsg.message || systemMsg.content || systemMsg),
                      status: 'completed' as const,
                      createdAt: timestamp.toISOString(),
                      updatedAt: timestamp.toISOString(),
                    };
                  }
                  
                  return <MessageBubble key={messageId} message={displayMessage} />;
                })}
                
                {/* Show streaming message when Claude is responding */}
                {claudeStreaming.currentAssistantMessage && (
                  <MessageBubble 
                    message={{
                      id: 'streaming',
                      conversationId: selectedConversationId || '',
                      role: 'assistant',
                      content: safeRenderContent(claudeStreaming.currentAssistantMessage.content),
                      status: 'sending',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    }} 
                    isStreaming 
                  />
                )}

                {/* Show loading state when waiting for response but no streaming yet */}
                {claudeStreaming.isStreaming && !claudeStreaming.currentAssistantMessage && (
                  <LoadingMessage />
                )}

                {/* Interactive Prompts */}
                {pendingPrompts.map(prompt => (
                  <div key={prompt.id} className="mb-6">
                    <div className="max-w-[85%] bg-[#3E3E42] rounded-xl p-4">
                      <p className="text-sm text-[#E5E5E5] mb-3">{prompt.message}</p>
                      <div className="flex space-x-2">
                        {prompt.options.map(option => (
                          <button
                            key={option.id}
                            onClick={() => handlePromptResponse(prompt.id, option.id)}
                            disabled={isRespondingToPrompt}
                            className="px-3 py-1 bg-[#2D2D30] hover:bg-[#252526] text-[#E5E5E5] text-sm rounded transition-colors disabled:opacity-50"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
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
                    >
                      <Paperclip className="w-4 h-4 text-[#8B8B8D]" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={handleSendMessage}
                    disabled={(!inputValue.trim() && fileUpload.selectedFiles.length === 0) || claudeStreaming.isStreaming}
                    className="absolute right-3 bottom-3 p-1.5 text-[#8B8B8D] hover:text-[#E5E5E5] disabled:opacity-50 transition-colors"
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
const ActionButton: React.FC<{ icon: React.ElementType; label: string }> = ({ icon: Icon, label }) => (
  <button className="flex items-center space-x-2 px-4 py-2 border border-[#3E3E42] rounded-lg hover:bg-[#3E3E42] transition-colors">
    <Icon className="w-4 h-4 text-[#8B8B8D]" />
    <span className="text-sm text-[#8B8B8D]">{label}</span>
  </button>
);

// Message Bubble Component
const MessageBubble: React.FC<{ message: Message; isStreaming?: boolean }> = ({ message, isStreaming }) => {
  const isUser = message.role === 'user';
  const toolUsages = (message as any).toolUsages || (message as any).metadata?.toolUsages;
  
  return (
    <div className={`mb-6 ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`max-w-[85%] ${isUser ? 'ml-auto' : ''}`}>
        <div className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-[#FF6B6B]' : 'bg-[#3E3E42]'
          }`}>
            {isUser ? (
              <span className="text-xs text-white font-semibold">U</span>
            ) : (
              <Sparkles className="w-4 h-4 text-[#FF6B6B]" />
            )}
          </div>
          
          <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
            <p className="text-xs text-[#8B8B8D] mb-1">
              {isUser ? 'You' : 'Claude'}
            </p>
            
            {/* Tool Usage Display */}
            {!isUser && toolUsages && toolUsages.length > 0 && (
              <div className="mb-2 space-y-1">
                {toolUsages.map((tool: any, index: number) => (
                  <div key={index} className="inline-flex items-center px-2 py-1 bg-[#3E3E42] rounded-md text-xs text-[#8B8B8D] mr-2 mb-1">
                    <Code2 className="w-3 h-3 mr-1" />
                    <span>Using {tool.name || tool}</span>
                  </div>
                ))}
              </div>
            )}
            
            <div className={`inline-block px-4 py-2 rounded-xl ${
              isUser 
                ? 'bg-[#3E3E42] text-[#E5E5E5]' 
                : 'bg-transparent text-[#E5E5E5]'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
            {isStreaming && (
              <span className="inline-block ml-2 text-[#FF6B6B]">●</span>
            )}
          </div>
        </div>
      </div>
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