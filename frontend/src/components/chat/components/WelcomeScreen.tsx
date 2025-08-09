import React from 'react';
import { ChevronUp, MoreHorizontal, Paperclip, Search, Send, Sparkles, Edit3, BookOpen, Code2 } from 'lucide-react';
import { FileUploadArea } from '../FileUploadArea';
import { ActionButton } from './ActionButton';

interface Props { 
  inputValue: string; 
  setInputValue: (v: string) => void; 
  handleKeyPress: (e: React.KeyboardEvent) => void; 
  handleSendMessage: () => void; 
  fileUpload: any; 
  getGreeting: () => string;
  permissionMode: 'default' | 'plan' | 'acceptEdits';
  onCyclePermissionMode: () => void;
}

export const WelcomeScreen: React.FC<Props> = ({ inputValue, setInputValue, handleKeyPress, handleSendMessage, fileUpload, getGreeting, permissionMode, onCyclePermissionMode }) => {
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
      case 'plan': return '📝';
      case 'acceptEdits': return '✏️';
      default: return '🔒';
    }
  };

  return (
  <div className="flex-1 flex flex-col items-center justify-center px-3 pb-20 md:pb-0">
    <div className="w-full max-w-3xl mx-auto">
      <h1 className="text-xl md:text-3xl font-normal text-[#E5E5E5] mb-8 md:mb-12 flex items-center justify-center">
        <Sparkles className="w-7 h-7 mr-3 text-[#FF6B6B]" />
        {getGreeting()}
      </h1>
      <FileUploadArea files={fileUpload.selectedFiles} onRemoveFile={fileUpload.removeFile} formatFileSize={fileUpload.formatFileSize} />
      <div className="relative">
        <textarea 
          value={inputValue} 
          onChange={e => setInputValue(e.target.value)} 
          onKeyDown={handleKeyDown} 
          placeholder={`How can I help you today? [${getModeLabel()}] (Shift+Tab to change mode)`} 
          className="w-full px-4 py-3 pr-20 bg-[#2A2B2E] border border-[#3A3B3E] rounded-xl text-[#E5E5E5] placeholder-[#7E7F82] resize-none focus:outline-none focus:border-[#4A4B4F] transition-colors shadow-sm" 
          style={{ minHeight: '85px', maxHeight: '220px' }} 
          rows={1} 
          data-testid="chat-text-area-middle" 
        />
        <div className="absolute left-3 bottom-3 flex items-center space-x-2">
          <button onClick={fileUpload.openFileDialog} className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors" title="Attach files" data-testid="chat-attach-files-welcome"><Paperclip className="w-4 h-4 text-[#8B8B8D]" /></button>
          <button className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors" data-testid="chat-more-options-welcome"><MoreHorizontal className="w-4 h-4 text-[#8B8B8D]" /></button>
          <button className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors flex items-center space-x-1" data-testid="chat-research-welcome"><Search className="w-4 h-4 text-[#8B8B8D]" /><span className="text-xs text-[#8B8B8D]">Research</span></button>
        </div>
        
        <div className="absolute right-3 bottom-3 flex items-center space-x-2">
          {/* Permission mode pill (matches model selector styling) */}
          <button
            onClick={onCyclePermissionMode}
            className="px-3 py-1.5 bg-[#2D2D30] hover:bg-[#252526] rounded-lg transition-colors flex items-center space-x-1"
            title={`Current mode: ${getModeLabel()}. Click or press Shift+Tab to cycle.`}
            data-testid="chat-permission-mode-welcome"
          >
            <span className="text-sm">{getModeIcon()}</span>
            <span className="text-xs text-[#8B8B8D]">{getModeLabel()}</span>
          </button>
          <button className="px-3 py-1.5 bg-[#2D2D30] hover:bg-[#252526] rounded-lg transition-colors flex items-center space-x-1" data-testid="chat-model-selector-welcome"><span className="text-xs text-[#8B8B8D]">Claude Sonnet 4</span><ChevronUp className="w-3 h-3 text-[#8B8B8D]" /></button>
          <button onClick={handleSendMessage} disabled={!inputValue.trim() && fileUpload.selectedFiles.length === 0} className="p-1.5 text-[#8B8B8D] hover:text-[#E5E5E5] disabled:opacity-50 transition-colors" data-testid="chat-send-welcome"><Send className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6 md:mt-8 max-w-lg mx-auto">
        <ActionButton icon={Edit3} label="Write" testId="chat-action-write" />
        <ActionButton icon={BookOpen} label="Learn" testId="chat-action-learn" />
        <ActionButton icon={Code2} label="Code" testId="chat-action-code" />
        <ActionButton icon={Sparkles} label="Life stuff" testId="chat-action-life" />
      </div>
    </div>
  </div>
);
};
