import React, { useState } from 'react';
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
import type { InteractivePrompt, PromptOption } from '../../types';
import { Button } from '@/components/ui/button';

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

const riskAccentMap: Record<string, { border: string; icon: string; text: string; bg: string }> = {
  LOW: { border: 'border-green-500/60', icon: 'text-green-400', text: 'text-green-300', bg: 'bg-green-950/30' },
  MEDIUM: { border: 'border-yellow-500/60', icon: 'text-yellow-400', text: 'text-yellow-300', bg: 'bg-yellow-950/30' },
  HIGH: { border: 'border-orange-500/70', icon: 'text-orange-400', text: 'text-orange-300', bg: 'bg-orange-950/30' },
  CRITICAL: { border: 'border-red-500/70', icon: 'text-red-400', text: 'text-red-300', bg: 'bg-red-950/30' }
};

const getOptionButtonVariant = (option: PromptOption) => {
  if (option.isRecommended) return 'default';
  if (option.isDefault) return 'secondary';
  return 'outline';
};

const getOptionButtonIcon = (option: PromptOption) => {
  if (option.value === 'yes' || option.value === 'yes_dont_ask') return <CheckCircle2 className="w-4 h-4" />;
  if (option.value === 'no' || option.value === 'no_explain') return <AlertCircle className="w-4 h-4" />;
  return null;
};

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
  const accent: { border: string; icon: string; text: string; bg: string } = (riskAccentMap as any)[riskLevel] || riskAccentMap.MEDIUM;
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

  return (
    <div className={`border-l-2 ${accent.border} ${accent.bg} pl-3 py-2 rounded-sm space-y-2 my-2 transition-colors hover:bg-opacity-60`} data-testid="permission-prompt-container">
      {/* Summary Row */}
  <div className="flex items-center gap-2">
        <PromptIcon size={14} className={accent.icon} />
        <span className={`text-[10px] font-semibold tracking-wide ${accent.text}`}>{prompt.title || 'PERMISSION'}</span>
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <RiskIcon size={12} className={accent.icon} />{riskLevel}
        </span>
        <span className="flex-1 truncate text-xs text-gray-300">{shortMsg}</span>
        {timestamp && (
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Timer size={12} />{new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={() => setShowDetails(d => !d)}
            className="ml-1 text-gray-500 hover:text-gray-300"
          aria-label={showDetails ? 'Collapse details' : 'Expand details'}
        >
          {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {showDetails && (
        <div className="space-y-3">
          <div className="text-[11px] text-gray-400 leading-snug">
            {prompt.message}
          </div>
          {(prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && toolName && (
            <div className="bg-gray-950/50 border border-gray-800 rounded p-2 text-[11px] space-y-2">
              <div className="flex flex-wrap gap-3 text-gray-300">
                <span className="flex items-center gap-1"><Settings size={12} className="text-gray-400" />Tool: <span className="font-mono text-gray-200">{toolName}</span></span>
                {usageCount > 0 && (
                  <span className="flex items-center gap-1"><BarChart3 size={12} className="text-gray-400" />Usage: {usageCount}</span>
                )}
                {usageStatistics?.recommendedAction && (
                  <span className="flex items-center gap-1"><Zap size={12} className="text-yellow-400" />{usageStatistics.recommendedAction === 'auto_allow' ? 'Low Risk' : 'Review'}</span>
                )}
              </div>
              {(prompt.context as any)?.projectPath && (
                <div className="flex items-center gap-1 text-gray-400"><FileText size={12} className="text-gray-500" />Location: <span className="font-mono text-gray-300">{(prompt.context as any).projectPath}</span></div>
              )}
              {(prompt.context as any)?.parameters && (
                <div className="border border-gray-800 rounded p-2 bg-gray-950/60 max-h-32 overflow-auto font-mono text-[11px] text-gray-300">
                  {(prompt.context as any).parameters}
                </div>
              )}
              {(prompt.context as any)?.originalContext && (
                <div className="flex items-start gap-1 text-gray-400"><AlertCircle size={12} className="text-gray-500 mt-0.5" />{(prompt.context as any).originalContext}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Options */}
      <div className="space-y-1">
        {prompt.options.map((option, index) => {
          const isSelected = selectedOption === option.id;
          const ButtonIcon = getOptionButtonIcon(option);
          return (
            <Button
              key={option.id}
              variant={getOptionButtonVariant(option)}
              size="sm"
              onClick={() => handleOptionClick(option.id)}
              disabled={isResponding || selectedOption !== null}
              data-testid={`permission-option-${option.id}`}
              data-testid-semantic={
                option.value === 'allow_once' || option.label?.toLowerCase().includes('once') ? 'permission-allow-once' :
                option.value === 'allow_always' || option.label?.toLowerCase().includes('always') || option.label?.toLowerCase().includes("don't ask") ? 'permission-allow-always' :
                option.value === 'deny' || option.label?.toLowerCase().includes('deny') || option.label?.toLowerCase().includes('no') ? 'permission-deny' :
                `permission-option-${option.id}`
              }
              className={clsx(
                'w-full justify-start text-left h-auto py-2 px-3 text-sm',
                isSelected && 'ring-1 ring-offset-0 ring-blue-500',
                option.isRecommended && 'border-blue-400',
                (prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && index === 0 && 'border-green-400/60',
                (prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && index === 1 && 'border-blue-400/60',
                (prompt.type === 'tool_usage' || prompt.type === 'tool_permission') && index === 2 && 'border-red-400/60'
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <span className="text-[10px] font-mono text-gray-500 w-5">{option.id}.</span>
                {ButtonIcon}
                <span className="flex-1 truncate">{option.label}</span>
                {option.isRecommended && <span className="text-[10px] text-blue-400">Rec</span>}
                {option.isDefault && !option.isRecommended && <span className="text-[10px] text-gray-500">Default</span>}
                {isSelected && isResponding && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                {isSelected && !isResponding && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </div>
            </Button>
          );
        })}
      </div>

      {/* Status + timeout */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 pt-1">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>30s timeout</span>
        </div>
        {selectedOption && (
          <div className="flex items-center gap-1">
            {isResponding ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-green-500" />
            )}
            <span>{isResponding ? 'Sending response…' : 'Response sent'}</span>
          </div>
        )}
        {!selectedOption && (
          <div className="flex items-center gap-1 text-amber-400">
            <AlertCircle size={12} />
            <span>No selection yet</span>
          </div>
        )}
      </div>
    </div>
  );
};