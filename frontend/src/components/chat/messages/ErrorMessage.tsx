/**
 * Error Message Component - Error handling and display
 */

import React, { useState } from 'react';
import { AlertTriangle, RefreshCcw, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';

interface ErrorMessageProps {
  message: any;
  showTimestamp?: boolean;
  onRetry?: (messageId: string) => void;
  onCopy?: (content: string, messageId: string) => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  showTimestamp = true,
  onRetry,
  onCopy,
}) => {
  const [copied, setCopied] = useState(false);

  const errorText = message.error || message.message || 'Unknown error occurred';
  const timestamp = message.timestamp || Date.now();
  const messageId = message.id || `error_${Date.now()}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      onCopy?.(errorText, messageId);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="bg-red-900/10 border border-red-800/50 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-900/20 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={18} className="text-red-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-red-400">Error</span>
            {message.subtype && (
              <span className="text-xs text-gray-600 bg-gray-700 px-2 py-0.5 rounded">
                {message.subtype}
              </span>
            )}
            {showTimestamp && (
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
              </span>
            )}
          </div>

          <div className="text-sm text-red-300 mb-3">{errorText}</div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 h-7 px-2"
              onClick={handleCopy}
            >
              <Copy size={12} className="mr-1" />
              {copied ? 'Copied' : 'Copy Error'}
            </Button>
            
            {onRetry && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 h-7 px-2"
                onClick={() => onRetry(messageId)}
              >
                <RefreshCcw size={12} className="mr-1" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;