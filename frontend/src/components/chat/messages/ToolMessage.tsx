/**
 * Tool Message Component (Linear Minimal Design)
 * - Single line summary with accent border
 * - Inline status + risk indicators
 * - Expand for full JSON + meta + actions
 */

import React, { useState, useMemo } from 'react';
import {
  Terminal,
  Globe,
  Search,
  FileText,
  Settings,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../ui/button';
import type { StreamingToolMessage as ToolMessageType } from '../../../types';

interface ToolMessageProps {
  message: ToolMessageType & { metadata?: any };
  isStreaming?: boolean;
  onCopy?: (content: string, messageId: string) => void;
  onRetry?: (messageId: string) => void;
  showTimestamp?: boolean;
  compact?: boolean;
}

// Icon selection
const getToolIcon = (toolName: string) => {
  const name = toolName.toLowerCase();
  if (name.includes('websearch') || name.includes('search')) return Globe;
  if (name.includes('bash') || name.includes('terminal')) return Terminal;
  if (name.includes('grep') || name.includes('find')) return Search;
  if (name.includes('read') || name.includes('file')) return FileText;
  return Settings;
};

// Status styling abstraction (explicit classes for Tailwind safelist friendliness)
const statusMap = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'running':
    case 'executing':
      return { label: 'Running', icon: Play, accent: 'border-blue-500/70', text: 'text-blue-300', iconColor: 'text-blue-400' };
    case 'done':
    case 'completed':
    case 'success':
      return { label: 'Done', icon: CheckCircle, accent: 'border-green-500/70', text: 'text-green-300', iconColor: 'text-green-400' };
    case 'failed':
    case 'error':
      return { label: 'Failed', icon: XCircle, accent: 'border-red-500/70', text: 'text-red-300', iconColor: 'text-red-400' };
    case 'pending':
    case 'waiting':
      return { label: 'Pending', icon: Clock, accent: 'border-yellow-500/70', text: 'text-yellow-300', iconColor: 'text-yellow-400' };
    default:
      return { label: 'Unknown', icon: Settings, accent: 'border-gray-500/50', text: 'text-gray-300', iconColor: 'text-gray-400' };
  }
};

// Risk evaluation
const assessRiskLevel = (toolName: string, input: any): 'low' | 'medium' | 'high' => {
  const dangerous = ['bash', 'write', 'edit', 'multiedit', 'delete'];
  const moderate = ['websearch', 'webfetch', 'notebookedit'];
  const n = toolName.toLowerCase();
  if (dangerous.some(t => n.includes(t))) {
    const s = JSON.stringify(input).toLowerCase();
    if (s.includes('rm ') || s.includes('delete') || s.includes('format')) return 'high';
    return 'medium';
  }
  if (moderate.some(t => n.includes(t))) return 'medium';
  return 'low';
};

const truncateInline = (obj: any, max = 140) => {
  try {
    const str = JSON.stringify(obj);
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  } catch {
    return String(obj);
  }
};

export const ToolMessageComponent: React.FC<ToolMessageProps> = ({
  message,
  isStreaming = false,
  onCopy,
  onRetry,
  showTimestamp = true,
  compact = false
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const toolName = message.metadata?.toolName || message.name || 'Unknown Tool';
  const toolInput = message.metadata?.toolInput || message.input || {};
  const toolId = message.id || `tool_${Date.now()}`;
  const timestamp = message.timestamp || Date.now();
  const status = (message as any).status || (isStreaming ? 'running' : 'completed');

  const statusCfg = statusMap(status);
  const ToolIcon = getToolIcon(toolName);
  const risk = useMemo(() => assessRiskLevel(toolName, toolInput), [toolName, toolInput]);
  const riskColor = risk === 'high' ? 'text-red-400' : risk === 'medium' ? 'text-yellow-400' : 'text-green-400';

  const handleCopy = async () => {
    try {
      const content = JSON.stringify({ tool: toolName, input: toolInput }, null, 2);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content, toolId);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  // Inline/compact row
  const summaryRow = (
    <div className="flex items-center gap-2">
      <ToolIcon size={14} className={statusCfg.iconColor} />
      <span className="text-sm font-medium text-gray-200">{toolName}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 ${statusCfg.text}`}>{statusCfg.label}</span>
      {risk !== 'low' && (
        <span className={`flex items-center gap-0.5 text-[10px] ${riskColor}`}>
          {risk === 'high' && <AlertTriangle size={12} />}
          {risk.toUpperCase()}
        </span>
      )}
      <span className="flex-1 truncate font-mono text-xs text-gray-500">{truncateInline(toolInput)}</span>
      {showTimestamp && (
        <span className="text-[10px] text-gray-600">{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</span>
      )}
      <button
        onClick={() => setExpanded(e => !e)}
        className="ml-1 text-gray-500 hover:text-gray-300"
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  );

  if (compact && !expanded) {
    return (
      <div className={`border-l-2 ${statusCfg.accent} pl-3 py-1.5 bg-gray-900/30 rounded-sm cursor-pointer`} onClick={() => setExpanded(true)}>
        {summaryRow}
      </div>
    );
  }

  return (
    <div className={`border-l-2 ${statusCfg.accent} pl-3 py-2 bg-gray-900/40 rounded-sm space-y-2`}> 
      {summaryRow}
      {expanded && (
        <div className="space-y-2">
          <div className="bg-gray-950/60 border border-gray-800 rounded p-2 max-h-56 overflow-auto">
            <pre className="text-xs leading-snug text-gray-300 font-mono">{JSON.stringify(toolInput, null, 2)}</pre>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-500">
            <div>
              <span className="text-gray-400">Tool ID: </span>
              <span className="font-mono text-gray-300">{toolId}</span>
            </div>
            <div>
              <span className="text-gray-400">Risk: </span>
              <span className={`font-medium ${riskColor}`}>{risk}</span>
            </div>
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
            {onRetry && statusCfg.label === 'Failed' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-gray-400 hover:text-gray-200"
                onClick={() => onRetry(toolId)}
              >
                <Play size={12} />
                <span className="ml-1 text-xs">Retry</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolMessageComponent;