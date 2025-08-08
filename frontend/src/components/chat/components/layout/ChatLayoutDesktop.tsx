import React from 'react';
import { Menu, Plus } from 'lucide-react';
import type { Conversation, Message } from '../../../../types';
import { formatDistanceToNow } from 'date-fns';
import { WelcomeScreen } from '../WelcomeScreen';
import { SessionInfoBar } from '../SessionInfoBar';
import { ConversationInputArea } from '../ConversationInputArea';
import { MessageBubble, LoadingMessage } from '../MessageBubble';
import { InteractivePromptComponent } from '../../InteractivePrompt';
import { DropdownMenu } from '../DropdownMenu';
import { extractMessageContent } from '../messageUtils';

interface Props {
  isNewChat: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleSendMessage: () => void;
  fileUpload: any;
  getGreeting: () => string;
  conversationDetails: any;
  urlSessionId: string | null;
  claudeStreaming: any;
  pendingPrompts: any[];
  isRespondingToPrompt: boolean;
  handlePromptResponse: (id: string, value: string) => void;
  displayConversations: Conversation[];
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  showSidebar: boolean;
  setShowSidebar: (v: boolean) => void;
  isLoadingMessages: boolean;
  dbMessages: Message[] | undefined;
  archiveConversation: any;
  deleteConversation: any;
  generateMessageId: () => string;
}

export const ChatLayoutDesktop: React.FC<Props> = (props) => {
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
    generateMessageId,
  } = props;

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollContainerRef.current; if (!el) return; requestAnimationFrame(() => { try { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); } catch { el.scrollTop = el.scrollHeight; } });
  }, [dbMessages?.length, claudeStreaming.messages.length, !!claudeStreaming.currentAssistantMessage, claudeStreaming.isStreaming, pendingPrompts.length]);

  return (
    <div className="h-full min-h-screen flex flex-col md:flex-row bg-[#1E1F22] text-gray-200">
      <div className="hidden md:flex w-12 bg-[#191A1C] border-r border-[#2C2D30] flex-col items-center py-3">
        <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 hover:bg-[#242528] rounded-lg transition-colors" data-testid="chat-toggle-sidebar" aria-label="Toggle conversations sidebar">
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
        <div className="mt-8 space-y-4">
          <button onClick={() => { claudeStreaming.handleAbort(); claudeStreaming.resetForNewConversation(); setSelectedConversationId(null); }} className="p-2 hover:bg-[#242528] rounded-lg transition-colors" data-testid="chat-new-conversation" aria-label="Start new conversation">
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
      {showSidebar && (
        <div className="hidden md:flex w-64 bg-[#1F2022] border-r border-[#2C2D30] flex-col">
          <div className="p-4 border-b border-[#3E3E42] flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-300">Conversations</h2>
            <button onClick={() => setShowSidebar(false)} className="p-1 hover:bg-[#2D2D30] rounded transition-colors" data-testid="chat-close-sidebar">×</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {displayConversations.map(c => (
              <button key={c.id} onClick={() => { setSelectedConversationId(c.id); setShowSidebar(false); }} className={`w-full px-4 py-3 text-left hover:bg-[#242528] transition-colors border-b border-[#2C2D30] ${selectedConversationId === c.id ? 'bg-[#242528]' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{c.title || 'New conversation'}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}</p>
                  </div>
                  <DropdownMenu conversation={c} onArchive={() => archiveConversation.mutate(c.id)} onDelete={() => { deleteConversation.mutate(c.id); if (selectedConversationId === c.id) setSelectedConversationId(null); }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0">
        {isNewChat ? (
          <WelcomeScreen inputValue={inputValue} setInputValue={setInputValue} handleKeyPress={handleKeyPress} handleSendMessage={handleSendMessage} fileUpload={fileUpload} getGreeting={getGreeting} />
        ) : (
          <div className="flex-1 flex flex-col">
            <SessionInfoBar sessionId={conversationDetails?.claudeSessionId || urlSessionId || claudeStreaming.currentSessionId} contextTokens={conversationDetails?.contextTokens ?? null} />
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div ref={scrollContainerRef} className="max-w-3xl mx-auto px-3 md:px-4 py-3 md:py-6 overflow-y-auto no-scrollbar pb-8" data-testid="chat-messages-scroll">
                {isLoadingMessages && selectedConversationId && (<div className="flex items-center justify-center py-8"><div className="text-sm text-gray-500">Loading conversation history...</div></div>)}
                {dbMessages?.map(m => (<MessageBubble key={m.id} message={m} />))}
                {claudeStreaming.messages.map((msg: any, index: number) => {
                  const messageId = msg.id || msg.timestamp?.toString() || `msg-${index}-${generateMessageId()}`;
                  const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
                  let displayMessage: Message;
                  if (msg.type === 'chat') {
                    displayMessage = { id: messageId, conversationId: selectedConversationId || '', role: msg.role || 'assistant', content: extractMessageContent(msg), status: 'completed', createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() } as Message;
                  } else {
                    displayMessage = { id: messageId, conversationId: selectedConversationId || '', role: 'system', content: extractMessageContent(msg), status: 'completed', createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString(), metadata: { streamingType: msg.type, streamingSubtype: msg.subtype } } as Message;
                  }
                  return <MessageBubble key={messageId} message={displayMessage} streamingMessage={msg} />;
                })}
                {claudeStreaming.currentAssistantMessage && (<MessageBubble message={{ id: 'streaming', conversationId: selectedConversationId || '', role: 'assistant', content: extractMessageContent(claudeStreaming.currentAssistantMessage), status: 'sending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }} streamingMessage={claudeStreaming.currentAssistantMessage} isStreaming />)}
                {claudeStreaming.isStreaming && !claudeStreaming.currentAssistantMessage && <LoadingMessage />}
                {pendingPrompts.map(p => (<InteractivePromptComponent key={p.id} prompt={p} onOptionSelect={handlePromptResponse} isResponding={isRespondingToPrompt} />))}
                <div style={{ height: 1 }} />
              </div>
            </div>
            <ConversationInputArea inputValue={inputValue} setInputValue={setInputValue} handleKeyPress={handleKeyPress} handleSendMessage={handleSendMessage} fileUpload={fileUpload} isDisabled={claudeStreaming.isStreaming} />
          </div>
        )}
      </div>
      <input type="file" ref={fileUpload.fileInputRef} onChange={(e) => fileUpload.handleFileSelection(e.target.files)} multiple accept={fileUpload.supportedExtensions.join(',')} style={{ display: 'none' }} />
    </div>
  );
};
