import React from 'react';
import { Paperclip, Send, Lock, FileText, Edit, Clock, Loader2 } from 'lucide-react';
import { FileUploadArea } from './FileUpload';
import { SimpleFileReferenceMentions } from './FileMentions';
import { useChatContext } from '../../../hooks/chat/useChatContext';

interface Props { 
  inputValue: string; 
  setInputValue: (v: string) => void; 
  handleKeyPress: (e: React.KeyboardEvent) => void; 
  handleSendMessage: () => void; 
  fileUpload: any; 
  isDisabled: boolean;
  permissionMode: 'default' | 'plan' | 'acceptEdits';
  onCyclePermissionMode: () => void;
  workingDirectory?: string;
  conversationId: string | null;
  messageCount?: number; // To determine if this is the first message
}

export const ConversationInputArea: React.FC<Props> = ({ inputValue, setInputValue, handleKeyPress, handleSendMessage, fileUpload, isDisabled, permissionMode, onCyclePermissionMode, workingDirectory = '/home/hassan/work/baton', conversationId, messageCount = 0 }) => {
  const { 
    sessionState, 
    isSessionReady, 
    isSessionPending 
  } = useChatContext();
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Shift+Tab for permission mode cycling
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      onCyclePermissionMode();
      return;
    }
    
    // Pass other key events to the original handler
    handleKeyPress(e);
  };

  const getModeLabel = () => {
    switch (permissionMode) {
      case 'plan': return 'Plan mode';
      case 'acceptEdits': return 'Accept Edits mode'; 
      default: return 'Default mode';
    }
  };

  const getModeIcon = () => {
    switch (permissionMode) {
      case 'plan': return <FileText className="w-3 h-3" />;
      case 'acceptEdits': return <Edit className="w-3 h-3" />;
      default: return <Lock className="w-3 h-3" />;
    }
  };

  const getPlaceholderText = () => {
    const baseText = `Reply... [${getModeLabel()}] (Shift+Tab to change mode)`;
    
    if (isDisabled) {
      return `${baseText} - Press ESC to stop`;
    }
    
    // Session-aware placeholder text
    if (conversationId) {
      const isFirstMessage = messageCount === 0;
      const isPending = isSessionPending(conversationId);
      const isReady = isSessionReady(conversationId);
      
      if (isPending && isFirstMessage) {
        return 'Preparing your conversation...';
      } else if (isPending && !isFirstMessage) {
        return 'Initializing Claude session...';
      } else if (!isReady && !isFirstMessage) {
        return 'Session required - click to reconnect';
      }
    }
    
    return baseText;
  };

  // Determine if input should be disabled
  const getInputDisabled = () => {
    if (isDisabled) return true; // Already streaming
    
    if (conversationId) {
      const isFirstMessage = messageCount === 0;
      const isPending = isSessionPending(conversationId);
      const isReady = isSessionReady(conversationId);
      
      // Allow first message even without session (it will initialize)
      if (isFirstMessage) return false;
      
      // For subsequent messages, require session to be ready
      if (!isReady && !isPending) return true;
      
      // Don't allow sending while session is being initialized
      if (isPending) return true;
    }
    
    return false;
  };

  // Determine send button state
  const getSendButtonState = () => {
    const inputDisabled = getInputDisabled();
    const hasContent = inputValue.trim() || fileUpload.selectedFiles.length > 0;
    
    if (conversationId) {
      const isFirstMessage = messageCount === 0;
      const isPending = isSessionPending(conversationId);
      
      if (isPending && !isFirstMessage) {
        return {
          disabled: true,
          icon: <Clock className="w-5 h-5" />,
          title: 'Initializing session...'
        };
      }
    }
    
    return {
      disabled: !hasContent || inputDisabled,
      icon: <Send className="w-5 h-5" />,
      title: inputDisabled ? 'Input disabled' : 'Send message'
    };
  };

  return (
  <div className="border-t border-[#2C2D30] bg-[#18191B]/95 backdrop-blur supports-[backdrop-filter]:bg-[#18191B]/80 md:static fixed left-0 right-0 z-[100]" style={{ bottom: 'calc(var(--app-bottom-nav-height,56px))', paddingBottom: 'env(safe-area-inset-bottom)' }} data-testid="chat-input-container">
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6">
      <FileUploadArea files={fileUpload.selectedFiles} onRemoveFile={fileUpload.removeFile} formatFileSize={fileUpload.formatFileSize} />
      <div className="relative">
        <SimpleFileReferenceMentions
          value={inputValue}
          onChange={setInputValue}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholderText()}
          disabled={getInputDisabled()}
          workingDirectory={workingDirectory}
          className="w-full"
        />
        <div className="absolute left-4 bottom-4 flex items-center space-x-1">
          <button 
            onClick={fileUpload.openFileDialog} 
            disabled={getInputDisabled()}
            className="p-2 hover:bg-[#3A3B3E] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            title="Attach files" 
            data-testid="chat-attach-files-conversation"
          >
            <Paperclip className="w-5 h-5 text-[#8B8D97]" />
          </button>
        </div>
        
        {/* Enhanced send button with session awareness */}
        {(() => {
          const buttonState = getSendButtonState();
          return (
            <button 
              onClick={handleSendMessage} 
              disabled={buttonState.disabled}
              className="absolute right-4 bottom-4 p-2 text-[#8B8D97] hover:text-[#F4F4F4] disabled:opacity-50 transition-colors disabled:cursor-not-allowed" 
              data-testid="chat-send-conversation"
              title={buttonState.title}
            >
              {buttonState.icon}
            </button>
          );
        })()}

        {/* Permission mode pill (inline, matching model selector styling) */}
        <button
          onClick={onCyclePermissionMode}
          className="absolute right-14 bottom-4 px-3 py-2 bg-[#3A3B3E] hover:bg-[#454648] rounded-lg transition-colors flex items-center space-x-1 text-xs"
          title={`Current mode: ${getModeLabel()}. Click or press Shift+Tab to cycle.`}
          data-testid="chat-permission-mode-conversation"
        >
          {getModeIcon()}
          <span className="hidden sm:inline text-[#9CA3AF]">{getModeLabel()}</span>
        </button>
      </div>
    </div>
  </div>
);
};
