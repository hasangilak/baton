import { parseMixedContent, type MixedSegment } from '../../utils/mixedContent';
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
  Copy,
  Settings,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useConversations, useChatSearch, useConversation, useMessages } from '../../hooks/useChat';
import { useProjects } from '../../hooks/useProjects';
import { useInteractivePrompts } from '../../hooks/useInteractivePrompts';
import { useClaudeStreaming } from '../../hooks/useClaudeStreaming';
import { useFileUpload } from '../../hooks/useFileUpload';
import { FileUploadArea } from './FileUploadArea';
import { InteractivePromptComponent } from './InteractivePrompt';
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

// Simple code block renderer for fenced code segments
const CodeBlock: React.FC<{ lang?: string; value: string }> = ({ lang, value }) => {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] overflow-hidden">
      <div className="px-3 py-1.5 text-xs text-[#9aa0a6] border-b border-[#2a2a2a] flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[#6b7280]" />
        <span>{lang || 'code'}</span>
      </div>
      <pre className="m-0 p-3 text-sm whitespace-pre-wrap text-[#E5E5E5]">
        <code>{value}</code>
      </pre>
    </div>
  );
};

// Specialized renderer for arrays of links: [{title, url}]
const LinksCard: React.FC<{ items: Array<{ title?: string; url?: string }> }> = ({ items }) => {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] p-3 space-y-2">
      <div className="text-xs uppercase tracking-wide text-[#9aa0a6]">Links</div>
      <ul className="space-y-1 list-disc pl-5">
        {items.map((it, i) => (
          <li key={i} className="text-sm">
            {it.url ? (
              <a href={it.url} target="_blank" rel="noreferrer" className="text-[#7dd3fc] hover:underline">
                {it.title || it.url}
              </a>
            ) : (
              <span className="text-[#E5E5E5]">{it.title || 'Untitled'}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
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
              setSelectedConversationId(null);
              setIsNewChat(true);
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

// Pretty JSON viewer with collapsible details
const PrettyJson: React.FC<{ data: any; collapsedLabel?: string }> = ({ data, collapsedLabel = 'View details' }) => {
  const json = (() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  })();
  return (
    <details className="bg-[#2A2A2D] border border-[#3E3E42] rounded-lg overflow-hidden">
      <summary className="cursor-pointer px-3 py-2 text-sm text-[#CFCFD1] hover:bg-[#333336]">
        {collapsedLabel}
      </summary>
      <pre className="m-0 p-3 text-xs leading-5 text-[#CFCFD1] overflow-auto">
        {json}
      </pre>
    </details>
  );
};

// Mixed content parsing moved to utils/mixedContent.ts using remark AST + JSON5

// Tool Action Card to show tool calls/results in a readable format
const ToolActionCard: React.FC<{
  name?: string;
  args?: any;
  result?: any;
  isError?: boolean;
  status?: 'pending' | 'running' | 'done' | 'error';
}> = ({ name, args, result, isError, status }) => {
  const statusStyles: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    running: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    done: 'bg-green-500/20 text-green-300 border-green-500/30',
    error: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  const badge = isError ? 'error' : (status || 'done');
  return (
    <div className="border border-[#3E3E42] rounded-xl bg-[#1F1F22]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3E3E42]">
        <div className="flex items-center space-x-2">
          <Code2 className="w-4 h-4 text-[#CFCFD1]" />
          <span className="text-sm text-[#E5E5E5]">{name || 'Tool Action'}</span>
        </div>
        <span className={`text-2xs px-2 py-0.5 rounded-full border ${statusStyles[badge] || ''}`}>
          {badge.toUpperCase()}
        </span>
      </div>
      <div className="p-3 space-y-3">
        {typeof args !== 'undefined' && (
          <div>
            <div className="text-xs text-[#8B8B8D] mb-1">Arguments</div>
            <PrettyJson data={args} collapsedLabel="Show arguments" />
          </div>
        )}
        {typeof result !== 'undefined' && (
          <div>
            <div className="text-xs text-[#8B8B8D] mb-1">Result</div>
            {(() => {
              // If result is a string and looks like JSON, parse/pretty print
              if (typeof result === 'string') {
                try {
                  const parsed = JSON.parse(result);
                  return <PrettyJson data={parsed} collapsedLabel="Show result JSON" />;
                } catch {
                  // Show plain text (code-like block for multiline)
                  return (
                    <pre className="m-0 p-3 text-xs leading-5 text-[#CFCFD1] bg-[#2A2A2D] border border-[#3E3E42] rounded-lg overflow-auto whitespace-pre-wrap">{result}</pre>
                  );
                }
              }
              // Non-string result (object/array)
              return <PrettyJson data={result} collapsedLabel="Show result" />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// Message Bubble Component
const MessageBubble: React.FC<{ 
  message: Message; 
  isStreaming?: boolean; 
  streamingMessage?: any 
}> = ({ message, isStreaming, streamingMessage }) => {
  const isUser = message.role === 'user';
  const toolUsages = (message as any).toolUsages || (message as any).metadata?.toolUsages;
  
  // Get message type info for badges
  const getMessageTypeInfo = () => {
    if (streamingMessage) {
      const type = streamingMessage.type;
      const subtype = streamingMessage.subtype;
      
      switch (type) {
        case 'system':
          return { 
            type: 'system', 
            label: subtype === 'init' ? 'System Init' : 'System',
            icon: Settings,
            color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
          };
        case 'result':
          return { 
            type: 'result', 
            label: 'Result',
            icon: CheckCircle,
            color: 'bg-green-500/20 text-green-400 border-green-500/30'
          };
        case 'error':
          return { 
            type: 'error', 
            label: 'Error',
            icon: AlertCircle,
            color: 'bg-red-500/20 text-red-400 border-red-500/30'
          };
        case 'tool_use':
          return { 
            type: 'tool_use', 
            label: 'Tool',
            icon: Code2,
            color: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
          };
        default:
          return null;
      }
    }
    return null;
  };
  
  const typeInfo = getMessageTypeInfo();
  
  return (
    <div 
      className={`mb-6 ${isUser ? 'flex justify-end' : ''}`}
      data-testid={`message-${message.id}`}
      data-testid-role={`message-role-${message.role}`}
      data-testid-status={message.status}
    >
      <div className={`max-w-[85%] ${isUser ? 'ml-auto' : ''}`}>
        <div className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
          <div 
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isUser ? 'bg-[#FF6B6B]' : 'bg-[#3E3E42]'
            }`}
            data-testid={`message-avatar-${message.role}`}
          >
            {isUser ? (
              <span className="text-xs text-white font-semibold">U</span>
            ) : (
              <Sparkles className="w-4 h-4 text-[#FF6B6B]" />
            )}
          </div>
          
          <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <p 
                className="text-xs text-[#8B8B8D]"
                data-testid={`message-sender-${message.id}`}
              >
                {isUser ? 'You' : 'Claude'}
              </p>
              
              {/* Message Type Badge */}
              {typeInfo && !isUser && (
                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${typeInfo.color}`}>
                  <typeInfo.icon className="w-3 h-3 mr-1" />
                  <span>{typeInfo.label}</span>
                </div>
              )}
            </div>
            
            {/* Tool Usage Display */}
            {!isUser && toolUsages && toolUsages.length > 0 && (
              <div 
                className="mb-2 space-y-1"
                data-testid={`message-tools-${message.id}`}
              >
                {toolUsages.map((tool: any, index: number) => (
                  <div 
                    key={index} 
                    className="inline-flex items-center px-2 py-1 bg-[#3E3E42] rounded-md text-xs text-[#8B8B8D] mr-2 mb-1"
                    data-testid={`message-tool-${index}`}
                    data-tool-name={tool.name || tool}
                  >
                    <Code2 className="w-3 h-3 mr-1" />
                    <span>Using {tool.name || tool}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Content / Tool usage formatting */}
            {(() => {
              if (!isUser) {
                // 1) Streaming tool invocation (tool_use)
                if (streamingMessage?.type === 'tool_use') {
                  // Try to extract name/input from anthropic-style content blocks
                  const contentBlocks = streamingMessage?.message?.content;
                  let tu = Array.isArray(contentBlocks) ? contentBlocks.find((c: any) => c?.type === 'tool_use') : undefined;
                  // Some backends might send different shapes
                  const name = tu?.name || streamingMessage?.name || 'Tool';
                  const args = tu?.input ?? streamingMessage?.input ?? streamingMessage?.args ?? streamingMessage?.parameters;
                  // As a fallback, show entire message payload in details
                  if (!tu && !args) {
                    return (
                      <div className="space-y-2">
                        <ToolActionCard name={name} status={isStreaming ? 'running' : 'done'} />
                        <PrettyJson data={streamingMessage} collapsedLabel="Show raw tool_use payload" />
                      </div>
                    );
                  }
                  return <ToolActionCard name={name} args={args} status={isStreaming ? 'running' : 'done'} />;
                }

                // 2) Streaming tool result (tool_result)
                if (streamingMessage?.type === 'tool_result') {
                  const isErr = Boolean(streamingMessage?.is_error);
                  const content = streamingMessage?.content;
                  // try JSON parse, else plain text
                  if (typeof content === 'string') {
                    try {
                      const parsed = JSON.parse(content);
                      const toolName = parsed?.tool || parsed?.name || parsed?.tool_name;
                      const result = parsed?.result ?? parsed?.output ?? parsed?.data ?? parsed;
                      return <ToolActionCard name={toolName} result={result} isError={isErr} status={isErr ? 'error' : 'done'} />;
                    } catch {
                      return <ToolActionCard result={content} isError={isErr} status={isErr ? 'error' : 'done'} />;
                    }
                  }
                  return <ToolActionCard result={content} isError={isErr} status={isErr ? 'error' : 'done'} />;
                }

                // 3) Persisted assistant message that may contain tool-like JSON
                if (typeof message.content === 'string') {
                  try {
                    // First, split mixed content into segments
                    const segments: MixedSegment[] = parseMixedContent(message.content);
                    // If there's any json segment that looks tool-shaped, render rich cards interleaved with text
                    return (
                      <div className="space-y-2 text-left">
                        {segments.map((seg, idx) => {
                          if (seg.type === 'text') {
                            if (!seg.value.trim()) return null;
                            return (
                              <div key={idx} className="inline-block px-4 py-2 rounded-xl bg-transparent text-[#E5E5E5]">
                                <p className="text-sm whitespace-pre-wrap">{seg.value}</p>
                              </div>
                            );
                          }
                          if (seg.type === 'code') {
                            return <CodeBlock key={idx} lang={seg.lang} value={seg.value} />;
                          }
                          // seg.type === 'json'
                          const parsed = seg.value as any;
                          // 1) Tool-shaped payloads -> ToolActionCard
                          const toolName = parsed?.tool || parsed?.name || parsed?.tool_name;
                          const args = parsed?.args || parsed?.input || parsed?.parameters;
                          const result = parsed?.result ?? parsed?.output ?? parsed?.data;
                          const isError = Boolean(parsed?.is_error || parsed?.error);
                          if (toolName || args || typeof result !== 'undefined') {
                            return (
                              <ToolActionCard key={idx} name={toolName} args={args} result={result ?? parsed} isError={isError} status={isError ? 'error' : 'done'} />
                            );
                          }
                          // 2) Array of links [{title, url}] -> LinksCard
                          if (Array.isArray(parsed) && parsed.length && parsed.every((it: any) => typeof it === 'object' && (typeof it.title === 'string' || typeof it.url === 'string'))) {
                            return <LinksCard key={idx} items={parsed} />;
                          }
                          // 3) Fallback JSON viewer
                          return <PrettyJson key={idx} data={parsed} collapsedLabel="Show details" />;
                        })}
                      </div>
                    );
                  } catch {
                    // fallthrough to normal text
                  }
                }
              }
              return (
                <div 
                  className={`inline-block px-4 py-2 rounded-xl ${
                    isUser 
                      ? 'bg-[#3E3E42] text-[#E5E5E5]' 
                      : 'bg-transparent text-[#E5E5E5]'
                  }`}
                  data-testid={`message-content-${message.id}`}
                  data-message-content={message.content}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              );
            })()}
            {isStreaming && (
              <span 
                className="inline-block ml-2 text-[#FF6B6B]"
                data-testid="message-streaming-indicator"
              >●</span>
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