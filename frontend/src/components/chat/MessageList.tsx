import React, { useEffect, useRef } from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Message, InteractivePrompt } from '../../types';
import { Button } from '../ui/button';
import { InteractivePrompt as InteractivePromptComponent } from './InteractivePrompt';

interface MessageListProps {
  messages: Message[];
  streamingMessage?: Message | null;
  pendingPrompts?: InteractivePrompt[];
  onPromptResponse?: (promptId: string, optionId: string) => void;
  isRespondingToPrompt?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingMessage,
  pendingPrompts = [],
  onPromptResponse,
  isRespondingToPrompt = false,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, pendingPrompts]);

  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === 'user';
    const isStreaming = message.status === 'sending';

    return (
      <div
        key={message.id}
        className={`flex gap-3 p-4 ${isUser ? 'bg-gray-100' : 'bg-gray-200'}`}
      >
        {/* Avatar */}
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
          ${isUser ? 'bg-blue-600' : 'bg-orange-600'}
        `}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-gray-200">
              {isUser ? 'You' : 'Claude'}
            </span>
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
            {message.model && (
              <span className="text-xs text-gray-600 bg-gray-700 px-2 py-0.5 rounded">
                {message.model}
              </span>
            )}
          </div>

          {/* Message content */}
          <div className="prose prose-invert max-w-none">
            {message.error ? (
              <div className="text-red-400 text-sm">
                Error: {message.error}
              </div>
            ) : (
              <div className="text-gray-300 whitespace-pre-wrap">
                {message.content}
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
                )}
              </div>
            )}
          </div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:underline"
                >
                  📎 {attachment.filename} ({(attachment.size / 1024).toFixed(1)}KB)
                </a>
              ))}
            </div>
          )}

          {/* Code blocks */}
          {message.codeBlocks && message.codeBlocks.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.codeBlocks.map((block) => (
                <div key={block.id} className="relative group">
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-gray-400 hover:text-gray-200"
                      onClick={() => handleCopy(block.code, block.id)}
                    >
                      {copiedId === block.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                  <pre className="bg-gray-950 rounded-lg p-3 overflow-x-auto">
                    <code className={`language-${block.language} text-sm`}>
                      {block.code}
                    </code>
                  </pre>
                  {block.filename && (
                    <div className="text-xs text-gray-500 mt-1">
                      {block.filename}
                      {block.lineStart && ` (lines ${block.lineStart}-${block.lineEnd})`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {!isUser && !isStreaming && (
            <div className="flex items-center gap-2 mt-2 opacity-0 hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-400 hover:text-gray-200"
                onClick={() => handleCopy(message.content, message.id)}
              >
                {copiedId === message.id ? (
                  <>
                    <Check size={14} className="mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} className="mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const allMessages = streamingMessage 
    ? [...messages, streamingMessage]
    : messages;

  return (
    <div className="flex-1 overflow-y-auto">
      {allMessages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Bot size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">Start a conversation</p>
            <p className="text-sm mt-2">Ask anything or upload a file to begin</p>
          </div>
        </div>
      ) : (
        <>
          {allMessages.map(renderMessage)}
          
          {/* Render pending interactive prompts */}
          {pendingPrompts.map(prompt => (
            <div key={prompt.id} className="px-4 py-2">
              <InteractivePromptComponent
                prompt={prompt}
                onOptionSelect={onPromptResponse || (() => {})}
                isResponding={isRespondingToPrompt}
              />
            </div>
          ))}
          
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
};