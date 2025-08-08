/**
 * Error Message Component - Linear minimal style
 */

import React, { useState } from 'react';
import { AlertTriangle, RefreshCcw, Copy, ChevronDown, ChevronRight } from 'lucide-react';
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
  onCopy
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const errorText = message.error || message.message || 'Unknown error';
  const timestamp = message.timestamp || Date.now();
  const messageId = message.id || `error_${Date.now()}`;

  const brief = errorText.split('\n')[0].slice(0, 180) + (errorText.length > 180 ? '…' : '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      onCopy?.(errorText, messageId);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* silent */
    }
  };

  return (
    <div className="border-l-2 border-red-500/70 pl-3 py-2 bg-red-950/10 rounded-sm space-y-1">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-red-400" />
        <span className="text-sm font-medium text-red-300">Error</span>
        {message.subtype && (
          <span className="text-[10px] uppercase tracking-wide text-gray-500">{message.subtype}</span>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-gray-500 hover:text-gray-300"
          aria-label={expanded ? 'Collapse error' : 'Expand error'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1" />
        {showTimestamp && (
          <span className="text-[10px] text-gray-500">
            {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
          </span>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-red-300">
        <div className="flex-1">{brief}</div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-6 px-2 text-red-300 hover:text-red-200"
          >
            <Copy size={12} />
            <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          {onRetry && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRetry(messageId)}
              className="h-6 px-2 text-red-300 hover:text-red-200"
            >
              <RefreshCcw size={12} />
              <span className="ml-1">Retry</span>
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-1 bg-red-950/20 border border-red-900/40 rounded p-2 max-h-60 overflow-auto">
          <pre className="text-[11px] leading-snug text-red-200 whitespace-pre-wrap">{errorText}</pre>
        </div>
      )}
    </div>
  );
};

export default ErrorMessage;