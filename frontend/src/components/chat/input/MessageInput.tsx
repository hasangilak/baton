import React, { useState, useRef, type KeyboardEvent } from 'react';
import { Send, Paperclip, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { FileReferenceMentions } from './FileReferenceMentions';
import type { MessageAttachment } from '../../types';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: MessageAttachment[]) => void;
  onUploadFile: (file: File) => Promise<MessageAttachment>;
  isStreaming?: boolean;
  disabled?: boolean;
  onAbort?: () => Promise<void>;
  workingDirectory?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onUploadFile,
  isStreaming = false,
  disabled = false,
  onAbort: _onAbort,
  workingDirectory,
}) => {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (message.trim() || attachments.length > 0) {
      onSendMessage(message.trim(), attachments.length > 0 ? attachments : undefined);
      setMessage('');
      setAttachments([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMessageChange = (newValue: string) => {
    setMessage(newValue);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await onUploadFile(file);
        setAttachments(prev => [...prev, attachment]);
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-gray-800 bg-gray-100 p-4">
      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm"
            >
              <Paperclip size={14} className="text-gray-400" />
              <span className="text-gray-300">{attachment.filename}</span>
              <button
                onClick={() => removeAttachment(index)}
                className="text-gray-500 hover:text-gray-300"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex-1 relative">
          <FileReferenceMentions
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Claude is responding..." : "Type your message..."}
            disabled={disabled || isStreaming}
            workingDirectory={workingDirectory}
            className="pr-12"
          />
          
          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.html,.css"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming || isUploading}
            className="
              absolute right-2 bottom-3
              p-1.5 text-gray-400 hover:text-gray-200
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {isUploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Paperclip size={18} />
            )}
          </button>
        </div>

        {/* Send button */}
        <Button
          type="submit"
          disabled={disabled || isStreaming || (!message.trim() && attachments.length === 0)}
          className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
        >
          {isStreaming ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </Button>
      </form>

      {/* Hint */}
      <div className="mt-2 text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
};