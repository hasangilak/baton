import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Settings,
  User,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  Timer,
  Zap,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';
import type { InteractivePrompt } from '../../types';

interface InteractivePromptComponentProps {
  prompt: InteractivePrompt;
  onOptionSelect: (promptId: string, optionId: string) => void;
  isResponding?: boolean;
}

const promptTypeIcons = {
  permission: User,
  tool_usage: Settings,
  tool_permission: Settings,
  multiple_choice: FileText,
  three_option: FileText,
  file_selection: FileText
};

const riskIconMap = {
  LOW: ShieldCheck,
  MEDIUM: Shield,
  HIGH: ShieldAlert,
  CRITICAL: AlertCircle
};

// Simplified accent map – only used for risk badge + subtle left bar indicator
const riskAccentMap: Record<string, { badge: string; bar: string; icon: string }> = {
  LOW: { badge: 'bg-gray-700/50 text-gray-300', bar: 'bg-gray-600/60', icon: 'text-gray-400' },
  MEDIUM: { badge: 'bg-amber-500/20 text-amber-400', bar: 'bg-amber-500/40', icon: 'text-amber-400' },
  HIGH: { badge: 'bg-orange-500/20 text-orange-400', bar: 'bg-orange-500/40', icon: 'text-orange-400' },
  CRITICAL: { badge: 'bg-red-500/20 text-red-400', bar: 'bg-red-500/50', icon: 'text-red-400' }
};

// Legacy helpers (variant, icon) removed for minimal design; inline logic below.

export const InteractivePromptComponent: React.FC<InteractivePromptComponentProps> = ({
  prompt,
  onOptionSelect,
  isResponding = false
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  if (prompt.status !== 'pending') return null;

  const PromptIcon = promptTypeIcons[prompt.type] || AlertCircle;
  const riskLevel = (prompt.context as any)?.riskLevel || 'MEDIUM';
  const accent = (riskAccentMap as any)[riskLevel] || riskAccentMap.MEDIUM;
  const RiskIcon = (riskIconMap as any)[riskLevel] || Shield;
  const toolName = (prompt.context as any)?.toolName;
  const usageCount = (prompt.context as any)?.usageCount || 0;
  const usageStatistics = (prompt as any).usageStatistics;
  const timestamp = (prompt as any).timestamp;

  const shortMsg = (() => {
    if (prompt.type === 'tool_usage' && toolName) return `Allow ${toolName} to run?`;
    if (prompt.type === 'tool_permission' && toolName) return `Allow tool: ${toolName}?`;
    const msg = prompt.message || '';
    return msg.length > 160 ? msg.slice(0, 160) + '…' : msg;
  })();

  const handleOptionClick = (optionId: string) => {
    if (isResponding || selectedOption) return;
    setSelectedOption(optionId);
    onOptionSelect(prompt.id, optionId);
  };

  // Accessibility + keyboard nav -----------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusOption = useCallback((idx: number) => {
    const btn = optionRefs.current[idx];
    if (btn) btn.focus();
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!prompt.options.length) return;
    const currentIndex = optionRefs.current.findIndex(b => b === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentIndex + 1) % prompt.options.length;
      focusOption(next);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentIndex - 1 + prompt.options.length) % prompt.options.length;
      focusOption(prev);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (currentIndex >= 0) {
        e.preventDefault();
        const opt = prompt.options[currentIndex];
        if (opt) handleOptionClick(opt.id);
      }
    }
  }, [prompt.options, handleOptionClick, focusOption]);

  useEffect(() => {
    // Auto focus first option when prompt appears
    if (containerRef.current) {
      const first = optionRefs.current[0];
      if (first) first.focus();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'group relative my-2 rounded-md border border-gray-800 bg-[#111315] text-gray-200 transition-colors',
        'focus-within:border-gray-700'
      )}
      data-testid="permission-prompt-container"
      role="group"
      aria-label={prompt.title || 'Permission prompt'}
      onKeyDown={onKeyDown}
    >
      {/* subtle left risk bar */}
      <div className={clsx('absolute left-0 top-0 h-full w-0.5 rounded-l-md', accent.bar)} />
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <PromptIcon size={14} className={clsx('shrink-0', accent.icon)} />
        <span className="text-[11px] font-medium tracking-wide uppercase text-gray-300">
          {prompt.title || 'Permission'}
        </span>
        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 font-medium', accent.badge)}>
          <RiskIcon size={11} />{riskLevel}
        </span>
        {toolName && (
          <span className="text-[11px] font-mono text-gray-400 truncate max-w-[120px]">{toolName}</span>
        )}
        <span className="flex-1 truncate text-[11px] text-gray-500 hidden sm:inline">{shortMsg}</span>
        {timestamp && (
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Timer size={12} />{new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={() => setShowDetails(d => !d)}
          className="ml-1 text-gray-600 hover:text-gray-300 focus:outline-none"
          aria-expanded={showDetails}
          aria-label={showDetails ? 'Collapse details' : 'Expand details'}
        >
          {showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {showDetails && (
        <div className="px-3 pb-2 border-t border-gray-800">
          <div className="py-2 space-y-3">
            <div className="text-[12px] leading-snug text-gray-300 whitespace-pre-wrap">
              {prompt.message}
            </div>
            {(prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && toolName && (
              <div className="grid gap-2 text-[11px]">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
                  <span className="flex items-center gap-1"><Settings size={12} className="text-gray-500" />Tool <span className="font-mono text-gray-300">{toolName}</span></span>
                  {usageCount > 0 && (
                    <span className="flex items-center gap-1"><BarChart3 size={12} className="text-gray-500" />{usageCount} uses</span>
                  )}
                  {usageStatistics?.recommendedAction && (
                    <span className="flex items-center gap-1"><Zap size={12} className="text-gray-500" />{usageStatistics.recommendedAction === 'auto_allow' ? 'auto allow' : 'review'}</span>
                  )}
                </div>
                {(prompt.context as any)?.projectPath && (
                  <div className="flex items-center gap-1 text-gray-500"><FileText size={12} className="text-gray-600" />{(prompt.context as any).projectPath}</div>
                )}
                {(prompt.context as any)?.parameters && (
                  <pre className="border border-gray-800/70 rounded p-2 bg-black/30 max-h-40 overflow-auto font-mono text-[10px] text-gray-400 whitespace-pre-wrap">{(prompt.context as any).parameters}</pre>
                )}
                {(prompt.context as any)?.originalContext && (
                  <div className="flex items-start gap-1 text-gray-500"><AlertCircle size={12} className="text-gray-600 mt-0.5" />{(prompt.context as any).originalContext}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Options */}
      {/* Actions Row */}
      <div className="flex flex-wrap gap-2 px-3 pb-1 pt-1" role="radiogroup" aria-label="Permission choices">
        {prompt.options.map((option, index) => {
          const isSelected = selectedOption === option.id;
          const iconEl = (() => {
            const v = (option.value || option.label || '').toLowerCase();
            if (/(yes|allow)/.test(v)) return <CheckCircle2 className="w-3.5 h-3.5" />;
            if (/(no|deny)/.test(v)) return <AlertCircle className="w-3.5 h-3.5" />;
            return null;
          })();
          // Color accent for semantic actions (still subtle)
          const semanticTint = (() => {
            const val = option.value || option.label?.toLowerCase();
            if (!val) return '';
            if (/allow/.test(val) && /always/.test(val)) return 'hover:bg-blue-500/10 text-blue-300';
            if (/allow/.test(val) || /yes/.test(val)) return 'hover:bg-green-500/10 text-green-300';
            if (/deny|no/.test(val)) return 'hover:bg-red-500/10 text-red-300';
            return 'hover:bg-gray-600/10 text-gray-200';
          })();
          return (
            <button
              key={option.id}
              ref={el => { optionRefs.current[index] = el; }}
              onClick={() => handleOptionClick(option.id)}
              disabled={isResponding || selectedOption !== null}
              data-testid={`permission-option-${option.id}`}
              data-testid-semantic={
                option.value === 'allow_once' || option.label?.toLowerCase().includes('once') ? 'permission-allow-once' :
                option.value === 'allow_always' || option.label?.toLowerCase().includes('always') || option.label?.toLowerCase().includes("don't ask") ? 'permission-allow-always' :
                option.value === 'deny' || option.label?.toLowerCase().includes('deny') || option.label?.toLowerCase().includes('no') ? 'permission-deny' :
                `permission-option-${option.id}`
              }
              role="radio"
              aria-checked={isSelected}
              className={clsx(
                'relative select-none rounded-sm border px-3 h-7 text-[12px] font-medium flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                semanticTint,
                isSelected ? 'border-gray-600 bg-gray-800/70' : 'border-gray-800 bg-gray-900/30'
              )}
            >
              <span className="text-[10px] font-mono text-gray-500 -ml-1 pr-0.5">{option.id}</span>
              {iconEl}
              <span className="truncate max-w-[140px] md:max-w-[180px] text-gray-100">{option.label}</span>
              {option.isRecommended && <span className="text-[9px] uppercase tracking-wide text-blue-300">Rec</span>}
              {option.isDefault && !option.isRecommended && <span className="text-[9px] uppercase tracking-wide text-gray-500">Default</span>}
              {isSelected && isResponding && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
              {isSelected && !isResponding && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
            </button>
          );
        })}
      </div>

      {/* Status + timeout */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 px-3 pb-2">
        <div className="flex items-center gap-1"><Clock size={12} /><span>30s</span></div>
        {selectedOption ? (
          <div className="flex items-center gap-1">
            {isResponding ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-green-500" />}
            <span className="text-gray-400">{isResponding ? 'sending…' : 'sent'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-gray-500">
            <AlertCircle size={12} />
            <span>awaiting choice</span>
          </div>
        )}
      </div>
    </div>
  );
};