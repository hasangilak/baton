import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  PlayIcon,
  CheckIcon,
  EditIcon,
  XIcon,
  EyeIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
  Timer
} from 'lucide-react';
import clsx from 'clsx';

interface PlanReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  planReviewId: string;
  conversationId: string;
  planContent: string;
  title?: string | null;
  message?: string | null;
  onDecision: (decision: PlanReviewDecision) => void;
}

export interface PlanReviewDecision {
  decision: 'auto_accept' | 'review_accept' | 'edit_plan' | 'reject';
  feedback?: string;
  editedPlan?: string;
}

const PlanReviewModal: React.FC<PlanReviewModalProps> = ({
  isOpen,
  onClose: _onClose,
  planReviewId: _planReviewId,
  conversationId: _conversationId,
  planContent,
  title = "Plan Review Required",
  message = "Claude Code has generated an implementation plan for your review.",
  onDecision
}) => {
  const [selectedAction, setSelectedAction] = useState<PlanReviewDecision['decision'] | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [editedPlan, setEditedPlan] = useState(planContent);
  const [isEditMode, setIsEditMode] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAction(null);
      setShowDetails(false);
      setIsSubmitting(false);
      setFeedback('');
      setEditedPlan(planContent);
      setIsEditMode(false);
    }
  }, [isOpen, planContent]);

  const actionConfigs = [
    {
      id: 'auto_accept' as const,
      label: 'Auto Accept',
      description: 'Immediately approve and start implementation',
      icon: PlayIcon,
      color: 'hover:bg-green-500/10 text-green-300'
    },
    {
      id: 'review_accept' as const,
      label: 'Review & Accept', 
      description: 'I have reviewed the plan and approve it',
      icon: CheckIcon,
      color: 'hover:bg-blue-500/10 text-blue-300'
    },
    {
      id: 'edit_plan' as const,
      label: 'Edit Plan',
      description: 'Let me modify the plan before proceeding',
      icon: EditIcon,
      color: 'hover:bg-amber-500/10 text-amber-300'
    },
    {
      id: 'reject' as const,
      label: 'Reject',
      description: 'Decline this plan and provide feedback',
      icon: XIcon,
      color: 'hover:bg-red-500/10 text-red-300'
    }
  ];

  const handleActionSelect = (action: PlanReviewDecision['decision']) => {
    if (isSubmitting || selectedAction) return;
    
    setSelectedAction(action);
    setIsEditMode(action === 'edit_plan');
    
    // Auto-submit for quick actions
    if (action === 'auto_accept' || action === 'review_accept') {
      handleSubmit(action);
    }
  };

  const handleSubmit = useCallback((action?: PlanReviewDecision['decision']) => {
    const decisionAction = action || selectedAction;
    if (!decisionAction) return;

    setIsSubmitting(true);

    const decision: PlanReviewDecision = {
      decision: decisionAction,
      feedback: feedback.trim() || undefined,
      editedPlan: isEditMode && editedPlan !== planContent ? editedPlan : undefined
    };

    onDecision(decision);
    // Note: onClose will be handled by parent component after successful submission
  }, [selectedAction, feedback, isEditMode, editedPlan, planContent, onDecision]);

  const formatPlanContent = (content: string) => {
    return content
      .split('\n')
      .map((line, index) => {
        if (line.startsWith('# ')) {
          return <h3 key={index} className="text-sm font-semibold mt-3 mb-1 text-blue-400">{line.substring(2)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h4 key={index} className="text-sm font-medium mt-2 mb-1 text-gray-200">{line.substring(3)}</h4>;
        }
        if (line.startsWith('### ')) {
          return <h5 key={index} className="text-xs font-medium mt-1 mb-0.5 text-gray-300">{line.substring(4)}</h5>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={index} className="ml-3 text-xs text-gray-300 list-disc">{line.substring(2)}</li>;
        }
        if (line.match(/^\d+\. /)) {
          return <li key={index} className="ml-3 text-xs text-gray-300 list-decimal">{line.substring(line.indexOf(' ') + 1)}</li>;
        }
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }
        return <p key={index} className="text-xs text-gray-300 leading-relaxed">{line}</p>;
      });
  };

  // Keyboard navigation
  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusOption = useCallback((idx: number) => {
    const btn = optionRefs.current[idx];
    if (btn) btn.focus();
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!actionConfigs.length) return;
    const currentIndex = optionRefs.current.findIndex(b => b === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentIndex + 1) % actionConfigs.length;
      focusOption(next);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentIndex - 1 + actionConfigs.length) % actionConfigs.length;
      focusOption(prev);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (currentIndex >= 0) {
        e.preventDefault();
        const action = actionConfigs[currentIndex];
        if (action) handleActionSelect(action.id);
      }
    }
  }, [actionConfigs, handleActionSelect, focusOption]);

  useEffect(() => {
    // Auto focus first option when prompt appears
    if (isOpen && containerRef.current) {
      const first = optionRefs.current[0];
      if (first) first.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const shortMsg = (message || '').length > 160 ? (message || '').slice(0, 160) + '…' : (message || '');
  const planLines = planContent.split('\n').length;

  return (
    <div
      ref={containerRef}
      className={clsx(
        'group relative my-2 rounded-md border border-gray-800 bg-[#111315] text-gray-200 transition-colors',
        'focus-within:border-gray-700'
      )}
      data-testid="plan-review-container"
      role="group"
      aria-label={title || 'Plan review prompt'}
      onKeyDown={onKeyDown}
    >
      {/* Left accent bar - blue for plan review */}
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-md bg-blue-500/40" />
      
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <EyeIcon size={14} className="shrink-0 text-blue-400" />
        <span className="text-[11px] font-medium tracking-wide uppercase text-gray-300">
          {title || 'Plan Review'}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1 font-medium bg-blue-500/20 text-blue-400">
          <FileText size={11} />PLAN
        </span>
        <span className="text-[11px] font-mono text-gray-400 truncate max-w-[120px]">{planLines} lines</span>
        <span className="flex-1 truncate text-[11px] text-gray-500 hidden sm:inline">{shortMsg}</span>
        <span className="text-[10px] text-gray-500 flex items-center gap-1">
          <Timer size={12} />{new Date().toLocaleTimeString()}
        </span>
        <button
          onClick={() => setShowDetails(d => !d)}
          className="ml-1 text-gray-600 hover:text-gray-300 focus:outline-none"
          aria-expanded={showDetails}
          aria-label={showDetails ? 'Collapse details' : 'Expand details'}
        >
          {showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Expandable plan content */}
      {showDetails && (
        <div className="px-3 pb-2 border-t border-gray-800">
          <div className="py-2 space-y-3">
            <div className="text-[12px] leading-snug text-gray-300">
              {message}
            </div>
            <div className="border border-gray-800/70 rounded p-3 bg-black/30 max-h-60 overflow-auto">
              <div className="space-y-1">
                {formatPlanContent(planContent)}
              </div>
            </div>
            {/* Edit mode */}
            {isEditMode && (
              <div className="space-y-2">
                <h5 className="text-[11px] font-medium text-gray-300">Edit Plan:</h5>
                <textarea
                  value={editedPlan}
                  onChange={(e) => setEditedPlan(e.target.value)}
                  className="w-full h-32 px-2 py-2 text-xs bg-black/50 border border-gray-800 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none"
                  placeholder="Edit the implementation plan..."
                />
              </div>
            )}
            {/* Feedback section */}
            {selectedAction === 'reject' && (
              <div className="space-y-2">
                <h5 className="text-[11px] font-medium text-gray-300">Feedback (Optional):</h5>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full h-20 px-2 py-2 text-xs bg-black/50 border border-gray-800 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-600 resize-none"
                  placeholder="Explain why you're rejecting this plan..."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 px-3 pb-1 pt-1" role="radiogroup" aria-label="Plan review choices">
        {actionConfigs.map((action, index) => {
          const isSelected = selectedAction === action.id;
          const Icon = action.icon;
          
          return (
            <button
              key={action.id}
              ref={el => { optionRefs.current[index] = el; }}
              onClick={() => handleActionSelect(action.id)}
              disabled={isSubmitting || (selectedAction !== null && !isSelected)}
              data-testid={`plan-review-${action.id}`}
              role="radio"
              aria-checked={isSelected}
              className={clsx(
                'relative select-none rounded-sm border px-3 h-7 text-[12px] font-medium flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                action.color,
                isSelected ? 'border-gray-600 bg-gray-800/70' : 'border-gray-800 bg-gray-900/30'
              )}
            >
              <span className="text-[10px] font-mono text-gray-500 -ml-1 pr-0.5">{action.id.slice(0, 3)}</span>
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate max-w-[100px] md:max-w-[120px] text-gray-100">{action.label}</span>
              {isSelected && isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
              {isSelected && !isSubmitting && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
            </button>
          );
        })}
        
        {/* Submit button for complex actions */}
        {selectedAction && (selectedAction === 'edit_plan' || selectedAction === 'reject') && (
          <button
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="relative select-none rounded-sm border px-3 h-7 text-[12px] font-medium flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors border-green-600 bg-green-800/30 hover:bg-green-700/30 text-green-300"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            Submit
          </button>
        )}
      </div>

      {/* Status footer */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 px-3 pb-2">
        <div className="flex items-center gap-1"><Clock size={12} /><span>Plan review</span></div>
        {selectedAction ? (
          <div className="flex items-center gap-1">
            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-green-500" />}
            <span className="text-gray-400">{isSubmitting ? 'processing…' : `${selectedAction} selected`}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-gray-500">
            <AlertCircle size={12} />
            <span>awaiting decision</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanReviewModal;