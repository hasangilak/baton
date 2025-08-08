/**
 * Abort Message Component - Linear minimal style
 */

import React from 'react';
import { StopCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AbortMessageProps {
  message: any;
  showTimestamp?: boolean;
  compact?: boolean;
}

export const AbortMessage: React.FC<AbortMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const timestamp = message.timestamp || Date.now();
  const abortText = message.message || 'Operation was aborted by user';
  const reason = message.data?.reason || message.reason;

  const row = (
    <div className="flex items-center gap-2">
      <StopCircle size={14} className="text-orange-400" />
      <span className="text-xs font-semibold text-orange-300">ABORTED</span>
      <span className="flex-1 truncate text-xs text-gray-400">{abortText}</span>
      {showTimestamp && (
        <span className="text-[10px] text-gray-500">{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</span>
      )}
      {(reason || (!compact && abortText.length > 120)) && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-1 text-gray-500 hover:text-gray-300"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
    </div>
  );

  if (compact && !expanded) {
    return (
      <div className="border-l-2 border-orange-500/70 pl-3 py-1.5 bg-gray-900/20 rounded-sm">{row}</div>
    );
  }

  return (
    <div className="border-l-2 border-orange-500/70 pl-3 py-2 bg-gray-900/30 rounded-sm space-y-2">
      {row}
      {expanded && (
        <div className="bg-gray-950/50 border border-gray-800 rounded p-2 text-[11px] leading-snug text-gray-300 font-mono whitespace-pre-wrap">
          {abortText}
          {reason && (
            <div className="mt-2 text-orange-300/90">
              <span className="text-gray-400">Reason:</span> {reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AbortMessage;