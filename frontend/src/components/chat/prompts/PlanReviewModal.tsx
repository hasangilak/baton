/**
 * Legacy PlanReviewModal - Placeholder for non-tool-based plan reviews
 * 
 * Note: This is kept for backward compatibility with the existing plan review system.
 * For ExitPlanMode tool messages, see ExitPlanModeMessage component.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface PlanReviewDecision {
  decision: 'auto_accept' | 'review_accept' | 'edit_plan' | 'reject';
  feedback?: string;
  editedPlan?: string;
}

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

const PlanReviewModal: React.FC<PlanReviewModalProps> = ({
  isOpen,
  planContent,
  title = "Plan Review Required",
}) => {
  if (!isOpen) return null;

  return (
    <div className="group relative my-2 rounded-md border border-yellow-800 bg-[#1a1500] text-yellow-200 transition-colors">
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-md bg-yellow-500/40" />
      
      <div className="flex items-center gap-2 px-3 py-2">
        <AlertTriangle size={14} className="shrink-0 text-yellow-400" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      
      <div className="px-3 pb-2 border-t border-yellow-800/50">
        <div className="py-2">
          <div className="text-xs text-yellow-300 mb-2">
            Legacy plan review system detected. This feature is being migrated to the new ExitPlanMode system.
          </div>
          <div className="border border-yellow-800/70 rounded p-2 bg-yellow-950/30 max-h-32 overflow-auto">
            <pre className="text-xs text-yellow-200 whitespace-pre-wrap">{planContent}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanReviewModal;