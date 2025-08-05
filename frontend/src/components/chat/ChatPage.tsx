import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { useConversations, useMessages, useChat, useChatSearch } from '../../hooks/useChat';
import { useProjects } from '../../hooks/useProjects';
import { Loader2 } from 'lucide-react';

export const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    conversationId || null
  );

  // Get current project
  const { data: projects } = useProjects();
  const currentProjectId = projects?.[0]?.id || 'demo-project-1';

  // Chat hooks
  const {
    conversations,
    isLoading: isLoadingConversations,
    createConversation,
    archiveConversation,
    deleteConversation,
  } = useConversations(currentProjectId);

  const { messages, isLoading: isLoadingMessages } = useMessages(selectedConversationId);
  
  const {
    sendMessage,
    streamingMessage,
    isStreaming,
    uploadFile,
  } = useChat(selectedConversationId);

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
  } = useChatSearch(currentProjectId);

  // Update URL when conversation changes
  useEffect(() => {
    if (selectedConversationId) {
      navigate(`/chat/${selectedConversationId}`, { replace: true });
    } else {
      navigate('/chat', { replace: true });
    }
  }, [selectedConversationId, navigate]);

  const handleCreateConversation = async () => {
    const result = await createConversation.mutateAsync(undefined);
    const conversation = result.conversation || result.data;
    if (conversation) {
      setSelectedConversationId(conversation.id);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setSearchQuery(''); // Clear search when selecting
  };

  const handleSendMessage = async (content: string, attachments?: any[]) => {
    if (!selectedConversationId) {
      // Create a new conversation if none selected
      const result = await createConversation.mutateAsync(undefined);
      const conversation = result.conversation || result.data;
      if (conversation) {
        setSelectedConversationId(conversation.id);
        // Send message after conversation is created
        setTimeout(() => {
          sendMessage(content, attachments);
        }, 100);
      }
    } else {
      sendMessage(content, attachments);
    }
  };

  const displayConversations = searchQuery.length > 2 && isSearching
    ? searchResults
    : conversations;

  if (isLoadingConversations) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-100">
      {/* Conversation sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-800">
        <ConversationList
          conversations={displayConversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          onCreateConversation={handleCreateConversation}
          onArchiveConversation={(id) => archiveConversation.mutate(id)}
          onDeleteConversation={(id) => {
            deleteConversation.mutate(id);
            if (selectedConversationId === id) {
              setSelectedConversationId(null);
            }
          }}
          onSearch={setSearchQuery}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <MessageList
          messages={messages}
          streamingMessage={streamingMessage}
        />

        {/* Input */}
        <MessageInput
          onSendMessage={handleSendMessage}
          onUploadFile={async (file: File) => {
            const result = await uploadFile.mutateAsync(file);
            return {
              id: '',
              messageId: '',
              filename: result.filename,
              mimeType: result.mimeType,
              size: result.size,
              url: result.url,
              createdAt: new Date().toISOString()
            };
          }}
          isStreaming={isStreaming}
          disabled={isLoadingMessages}
        />
      </div>
    </div>
  );
};