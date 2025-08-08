/**
 * Result Message Component - Linear minimal execution result display
 */

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Hash,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Copy,
  BarChart3
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';

interface ResultMessageProps {
  message: any;
  showTimestamp?: boolean;
  compact?: boolean;
  onCopy?: (content: string, messageId: string) => void;
}

// Metadata extraction helper (lightweight)
const extractMeta = (m: any) => {
  const content = m.message || m.content || '';
  const dur = /Duration:\s*(\d+(?:\.\d+)?)\s*ms/.exec(content)?.[1];
  const cost = /Cost:\s*\$(\d+(?:\.\d+)?)/.exec(content)?.[1];
  const toks = /Tokens:\s*(\d+)/.exec(content)?.[1];
  const data = m.data || {};
  return {
    duration: Number(dur) || data.duration || data.executionTime,
    cost: cost ? Number(cost) : (data.cost ?? data.price),
    tokens: toks ? Number(toks) : (data.tokens ?? data.tokenCount),
    model: data.model
  };
};

const fmtDuration = (ms?: number) => {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000); const s = Math.floor((ms % 60000) / 1000); return `${m}m ${s}s`;
};
const fmtCost = (c?: number) => (c === undefined || c === null) ? 'Free' : `$${c.toFixed(4)}`;
const perf = (d?: number) => {
  if (!d) return { color: 'text-gray-400', label: 'Unknown' };
  if (d < 1000) return { color: 'text-green-400', label: 'Excellent' };
  if (d < 5000) return { color: 'text-green-400', label: 'Good' };
  if (d < 15000) return { color: 'text-yellow-400', label: 'Fair' };
  return { color: 'text-red-400', label: 'Slow' };
};

export const ResultMessage: React.FC<ResultMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false,
  onCopy
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { duration, cost, tokens, model } = useMemo(() => extractMeta(message), [message]);
  const performance = useMemo(() => perf(duration), [duration]);
  const timestamp = message.timestamp || message.createdAt || Date.now();
  const messageId = message.id || `result_${Date.now()}`;
  const summaryText = (message.message || message.content || '').trim();

  const handleCopy = async () => {
    try {
      const content = JSON.stringify({
        result: summaryText,
        metadata: { duration, cost, tokens, model, performance: performance.label },
        timestamp: new Date(timestamp).toISOString()
      }, null, 2);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, messageId);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const metricsInline = (
    <div className="flex items-center gap-3 text-[10px] text-gray-500">
      {duration !== undefined && (
        <span className="flex items-center gap-1"><Clock size={12} className="text-gray-400" />{fmtDuration(duration)}</span>
      )}
      {cost !== undefined && cost !== null && (
        <span className="flex items-center gap-1"><DollarSign size={12} className="text-gray-400" />{fmtCost(cost)}</span>
      )}
      {tokens !== undefined && tokens !== null && (
        <span className="flex items-center gap-1"><Hash size={12} className="text-gray-400" />{tokens}</span>
      )}
      {duration !== undefined && (
        <span className={`flex items-center gap-1 ${performance.color}`}><TrendingUp size={12} />{performance.label}</span>
      )}
    </div>
  );

  const row = (
    <div className="flex items-center gap-2">
      <CheckCircle2 size={14} className="text-green-400" />
      <span className="text-xs font-semibold text-green-300">RESULT</span>
      {metricsInline}
      <span className="flex-1 truncate font-mono text-[11px] text-gray-400">
        {summaryText.slice(0, 140)}{summaryText.length > 140 ? '…' : ''}
      </span>
      {showTimestamp && (
        <span className="text-[10px] text-gray-500">{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</span>
      )}
      <button
        className="ml-1 text-gray-500 hover:text-gray-300"
        onClick={() => setExpanded(e => !e)}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  );

  if (compact && !expanded) {
    return (
      <div className="border-l-2 border-green-500/70 pl-3 py-1.5 bg-gray-900/20 rounded-sm cursor-pointer" onClick={() => setExpanded(true)}>
        {row}
      </div>
    );
  }

  return (
    <div className="border-l-2 border-green-500/70 pl-3 py-2 bg-gray-900/30 rounded-sm space-y-2">
      {row}
      {expanded && (
        <div className="space-y-3">
          <div className="bg-gray-950/60 border border-gray-800 rounded p-2 max-h-56 overflow-auto">
            <div className="text-[11px] font-medium text-gray-400 mb-1 flex items-center gap-1"><BarChart3 size={12} />Full Result</div>
            <pre className="text-xs leading-snug text-gray-300 font-mono whitespace-pre-wrap">{summaryText || 'No content'}</pre>
          </div>
          {message.data && (
            <div className="bg-gray-950/50 border border-gray-800 rounded p-2 max-h-40 overflow-auto">
              <div className="text-[11px] font-medium text-gray-400 mb-1">Raw Data</div>
              <pre className="text-[11px] leading-snug text-gray-300 font-mono">{JSON.stringify(message.data, null, 2)}</pre>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-500">
            {model && (
              <div><span className="text-gray-400">Model: </span><span className="font-mono text-gray-300">{model}</span></div>
            )}
            <div><span className="text-gray-400">ID: </span><span className="font-mono text-gray-300">{messageId}</span></div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-gray-400 hover:text-gray-200"
              onClick={handleCopy}
            >
              <Copy size={12} />
              <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultMessage;