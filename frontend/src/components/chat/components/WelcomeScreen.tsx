import React from 'react';
import { ChevronUp, MoreHorizontal, Paperclip, Search, Send, Sparkles, Edit3, BookOpen, Code2 } from 'lucide-react';
import { FileUploadArea } from '../FileUploadArea';
import { ActionButton } from './ActionButton';

interface Props { inputValue: string; setInputValue: (v: string) => void; handleKeyPress: (e: React.KeyboardEvent) => void; handleSendMessage: () => void; fileUpload: any; getGreeting: () => string }

export const WelcomeScreen: React.FC<Props> = ({ inputValue, setInputValue, handleKeyPress, handleSendMessage, fileUpload, getGreeting }) => (
  <div className="flex-1 flex flex-col items-center justify-center px-3 pb-20 md:pb-0">
    <div className="w-full max-w-3xl mx-auto">
      <h1 className="text-xl md:text-3xl font-normal text-[#E5E5E5] mb-8 md:mb-12 flex items-center justify-center">
        <Sparkles className="w-7 h-7 mr-3 text-[#FF6B6B]" />
        {getGreeting()}
      </h1>
      <FileUploadArea files={fileUpload.selectedFiles} onRemoveFile={fileUpload.removeFile} formatFileSize={fileUpload.formatFileSize} />
      <div className="relative">
        <textarea value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyPress} placeholder="How can I help you today?" className="w-full px-4 py-3 pr-12 bg-[#2A2B2E] border border-[#3A3B3E] rounded-xl text-[#E5E5E5] placeholder-[#7E7F82] resize-none focus:outline-none focus:border-[#4A4B4F] transition-colors shadow-sm" style={{ minHeight: '85px', maxHeight: '220px' }} rows={1} data-testid="chat-text-area-middle" />
        <div className="absolute left-3 bottom-3 flex items-center space-x-2">
          <button onClick={fileUpload.openFileDialog} className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors" title="Attach files" data-testid="chat-attach-files-welcome"><Paperclip className="w-4 h-4 text-[#8B8B8D]" /></button>
          <button className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors" data-testid="chat-more-options-welcome"><MoreHorizontal className="w-4 h-4 text-[#8B8B8D]" /></button>
          <button className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors flex items-center space-x-1" data-testid="chat-research-welcome"><Search className="w-4 h-4 text-[#8B8B8D]" /><span className="text-xs text-[#8B8B8D]">Research</span></button>
        </div>
        <div className="absolute right-3 bottom-3 flex items-center space-x-2">
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
