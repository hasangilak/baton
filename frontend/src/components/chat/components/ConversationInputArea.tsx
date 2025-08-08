import React from 'react';
import { Paperclip, Send } from 'lucide-react';
import { FileUploadArea } from '../FileUploadArea';

interface Props { inputValue: string; setInputValue: (v: string) => void; handleKeyPress: (e: React.KeyboardEvent) => void; handleSendMessage: () => void; fileUpload: any; isDisabled: boolean }

export const ConversationInputArea: React.FC<Props> = ({ inputValue, setInputValue, handleKeyPress, handleSendMessage, fileUpload, isDisabled }) => (
  <div className="border-t border-[#2C2D30] bg-[#18191B]/95 backdrop-blur supports-[backdrop-filter]:bg-[#18191B]/80 md:static fixed left-0 right-0 z-30" style={{ bottom: 'calc(var(--app-bottom-nav-height,56px))', paddingBottom: 'env(safe-area-inset-bottom)' }} data-testid="chat-input-container">
    <div className="max-w-3xl mx-auto px-3 md:px-4 py-2.5 md:py-4">
      <FileUploadArea files={fileUpload.selectedFiles} onRemoveFile={fileUpload.removeFile} formatFileSize={fileUpload.formatFileSize} />
      <div className="relative">
        <textarea data-testid="chat-text-area-bottom" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyPress} onFocus={() => { setTimeout(() => { try { const el = document.querySelector('[data-testid=\"chat-text-area-bottom\"]'); if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'nearest' }); } catch {} }, 50); }} placeholder="Reply..." disabled={isDisabled} className="w-full px-4 py-3 pr-12 bg-[#2A2B2E] border border-[#3A3B3E] rounded-xl text-[#E5E5E5] placeholder-[#7E7F82] resize-none focus:outline-none focus:border-[#4A4B4F] transition-colors disabled:opacity-50 shadow-sm" style={{ minHeight: '64px', maxHeight: '200px' }} rows={1} />
        <div className="absolute left-3 bottom-3 flex items-center space-x-2">
          <button onClick={fileUpload.openFileDialog} className="p-1.5 hover:bg-[#2D2D30] rounded-lg transition-colors" title="Attach files" data-testid="chat-attach-files-conversation"><Paperclip className="w-4 h-4 text-[#8B8B8D]" /></button>
        </div>
        <button onClick={handleSendMessage} disabled={(!inputValue.trim() && fileUpload.selectedFiles.length === 0) || isDisabled} className="absolute right-3 bottom-3 p-1.5 text-[#8B8B8D] hover:text-[#E5E5E5] disabled:opacity-50 transition-colors" data-testid="chat-send-conversation"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  </div>
);
