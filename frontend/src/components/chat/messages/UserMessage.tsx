/**
 * User Message Component - User input display
 */

import React, { useState } from 'react';
import { User, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';

interface UserMessageProps {
  message: any;
  showTimestamp?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  compact?: boolean;
}

export const UserMessage: React.FC<UserMessageProps> = ({
  message,
  showTimestamp = true,
  onCopy,
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);

  const content = message.content || message.message || '';
  const messageId = message.id || `user_${Date.now()}`;
  const timestamp = message.createdAt || message.timestamp || Date.now();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, messageId);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="flex gap-3 p-4 hover:bg-gray-800/30 transition-colors group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
        <User size={18} className="text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm text-gray-200">You</span>
          {showTimestamp && (
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Message Content */}
        <div className="text-gray-300 whitespace-pre-wrap">
          {content}
        </div>

        {/* Actions */}
        {!compact && (
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
          </div>
        )}
      </div>
    </div>
  );
};

export default UserMessage;