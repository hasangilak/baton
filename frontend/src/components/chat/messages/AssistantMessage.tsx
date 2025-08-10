/**
 * Assistant Message Component - Advanced Claude response rendering
 * 
 * Features:
 * - Markdown rendering with syntax highlighting
 * - Streaming text animation
 * - Copy functionality with visual feedback
 * - Memory-efficient rendering for large conversations
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Bot, Copy, Check, RotateCcw, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '../../ui/button';

// Interface for new WebSocket message format from Claude
interface AssistantMessageProps {
  message: {
    type?: 'claude_json';
    data?: {
      message?: {
        id?: string;
        model?: string;
        content?: Array<{ type: string; text: string }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
      session_id?: string;
    };
    timestamp?: number;
    // Fallback properties for simpler formats
    id?: string;
    content?: string;
    createdAt?: string;
  };
  isStreaming?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showTimestamp?: boolean;
  compact?: boolean;
  virtualizedIndex?: number;
  showMetadata?: boolean; // Show model info and token usage
}

/**
 * Extract content from the new Claude WebSocket message format
 */
const extractMessageContent = (message: AssistantMessageProps['message']): string => {
  // Try new WebSocket format first
  if (message.data?.message?.content && Array.isArray(message.data.message.content)) {
    return message.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
  }
  
  // Fallback to simple content property
  return message.content || '';
};

/**
 * Extract metadata from the new Claude WebSocket message format
 */
const extractMessageMetadata = (message: AssistantMessageProps['message']) => {
  const claudeMessage = message.data?.message;
  return {
    id: claudeMessage?.id || message.id || `msg_${Date.now()}`,
    model: claudeMessage?.model,
    usage: claudeMessage?.usage,
    sessionId: message.data?.session_id,
    timestamp: message.timestamp || message.createdAt || Date.now(),
  };
};

/**
 * Streaming text component with typewriter effect
 */
const StreamingText: React.FC<{ content: string; isStreaming: boolean }> = ({
  content,
  isStreaming,
}) => {
  if (!isStreaming) {
    return <span>{content}</span>;
  }

  return (
    <span className="relative">
      {content}
      <span className="inline-block w-2 h-4 bg-orange-400 animate-pulse ml-1 align-bottom" />
    </span>
  );
};

/**
 * Advanced markdown components with syntax highlighting
 */
const MarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    if (!inline && language) {
      return (
        <div className="relative group my-4">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-gray-200 h-6 px-2"
              onClick={() => navigator.clipboard.writeText(String(children))}
            >
              <Copy size={12} />
            </Button>
          </div>
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
            }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <code
        className="bg-gray-800 text-orange-300 px-1.5 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-4 border-orange-400 pl-4 py-2 my-4 bg-gray-800 rounded-r">
        <div className="text-gray-300">{children}</div>
      </blockquote>
    );
  },

  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border border-gray-700 rounded-lg">
          {children}
        </table>
      </div>
    );
  },

  th({ children }: any) {
    return (
      <th className="border border-gray-700 bg-gray-800 px-4 py-2 text-left text-gray-300 font-medium">
        {children}
      </th>
    );
  },

  td({ children }: any) {
    return (
      <td className="border border-gray-700 px-4 py-2 text-gray-300">
        {children}
      </td>
    );
  },
};

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message,
  isStreaming = false,
  onCopy,
  onRetry,
  showTimestamp = true,
  compact = false,
  showMetadata = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Extract content and metadata from new WebSocket format
  const content = extractMessageContent(message);
  const metadata = extractMessageMetadata(message);
  const { id: messageId, model, usage, sessionId, timestamp } = metadata;

  // Memory optimization: memoize expensive operations
  const renderedContent = useMemo(() => {
    if (!content) return null;

    // Check if content is likely markdown
    const hasMarkdown = /[*_`#\[\]|]|```/.test(content);

    if (hasMarkdown && !isStreaming) {
      return (
        <ReactMarkdown components={MarkdownComponents}>
          {content}
        </ReactMarkdown>
      );
    }

    return (
      <div className="whitespace-pre-wrap text-gray-300">
        <StreamingText content={content} isStreaming={isStreaming} />
      </div>
    );
  }, [content, isStreaming]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, messageId);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [content, messageId, onCopy]);

  const handleRetry = useCallback(() => {
    onRetry?.(messageId);
  }, [messageId, onRetry]);

  // Compact view for performance optimization
  if (compact && !isExpanded) {
    return (
      <div className="flex gap-3 p-2 hover:bg-gray-700 cursor-pointer" onClick={() => setIsExpanded(true)}>
        <Bot size={16} className="text-orange-400 mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-gray-300 text-sm truncate">
            {content.substring(0, 100)}
            {content.length > 100 && '...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 p-4 hover:bg-gray-800/50 transition-colors group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center flex-shrink-0">
        <Bot size={18} className="text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm text-gray-200 flex items-center gap-1">
            <Sparkles size={12} className="text-orange-400" />
            Claude
          </span>
          
          {showTimestamp && (
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
            </span>
          )}
          
          {/* Model Info */}
          {model && (
            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
              {model}
            </span>
          )}
          
          {/* Usage Tokens (if showMetadata is enabled) */}
          {showMetadata && usage && (
            <span className="text-xs text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded">
              {usage.input_tokens}→{usage.output_tokens} tokens
            </span>
          )}
          
          {/* Session ID for debugging */}
          {showMetadata && sessionId && (
            <span className="text-xs text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded font-mono">
              {sessionId.slice(-8)}
            </span>
          )}
          
          {isStreaming && (
            <span className="text-xs text-orange-400 bg-orange-900/20 px-2 py-0.5 rounded animate-pulse">
              Thinking...
            </span>
          )}
        </div>

        {/* Message Content */}
        <div className="prose prose-invert max-w-none">
          {message.error || message.data?.error ? (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-800">
              <strong>Error:</strong> {message.error || message.data?.error}
            </div>
          ) : (
            <div className='text-gray-100'>{renderedContent}</div>
          )}
        </div>

        {/* Actions */}
        {!isStreaming && content && (
          <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-gray-200 h-7 px-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={12} className="mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={12} className="mr-1" />
                  Copy
                </>
              )}
            </Button>
            
            {onRetry && (
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-400 hover:text-gray-200 h-7 px-2"
                onClick={handleRetry}
              >
                <RotateCcw size={12} className="mr-1" />
                Retry
              </Button>
            )}

            {compact && (
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-400 hover:text-gray-200 h-7 px-2"
                onClick={() => setIsExpanded(false)}
              >
                Collapse
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistantMessage;