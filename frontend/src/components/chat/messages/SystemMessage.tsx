/**
 * System Message Component - Linear minimal style
 */

import React, { useState } from 'react';
import { Settings, Info, AlertCircle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { StreamingSystemMessage } from '../../../types';

interface SystemMessageProps {
  message: StreamingSystemMessage;
  showTimestamp?: boolean;
  compact?: boolean;
}

const configFor = (subtype?: string) => {
  switch (subtype) {
    case 'sdk_system':
    case 'initialization':
      return { icon: Settings, color: 'blue', label: 'System' };
    case 'completion':
    case 'success':
      return { icon: CheckCircle, color: 'green', label: 'Completed' };
    case 'stream_error':
    case 'processing_error':
    case 'parse_error':
      return { icon: AlertCircle, color: 'red', label: 'Error' };
    default:
      return { icon: Info, color: 'gray', label: 'Info' };
  }
};

export const SystemMessageComponent: React.FC<SystemMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false
}) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = configFor(message.subtype);
  const Icon = cfg.icon;
  const timestamp = message.timestamp || Date.now();
  const hasData = message.data && Object.keys(message.data).length > 0;

  const row = (
    <div className="flex items-center gap-2">
      <Icon size={14} className={`text-${cfg.color}-400`} />
      <span className={`text-xs font-medium text-${cfg.color}-300`}>{cfg.label}</span>
      {message.subtype && (
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{message.subtype}</span>
      )}
      <span className="flex-1 truncate text-xs text-gray-400">{message.message}</span>
      {showTimestamp && (
        <span className="text-[10px] text-gray-500">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </span>
      )}
      {hasData && (
        <button
          className="ml-1 text-gray-500 hover:text-gray-300"
          onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
    </div>
  );

  if (compact && !expanded) {
    return (
      <div className={`border-l-2 pl-3 py-1.5 border-${cfg.color}-500/70 bg-gray-900/20 rounded-sm`}>{row}</div>
    );
  }

  return (
    <div className={`border-l-2 pl-3 py-2 space-y-2 border-${cfg.color}-500/70 bg-gray-900/30 rounded-sm`}>
      {row}
      {expanded && hasData && (
        <div className="bg-gray-950/60 border border-gray-800 rounded p-2 max-h-52 overflow-auto">
          <pre className="text-[11px] leading-snug text-gray-300 font-mono">{JSON.stringify(message.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default SystemMessageComponent;