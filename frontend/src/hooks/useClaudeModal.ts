import { useState, useCallback } from 'react';
import type { ClaudeCodePlan, ClaudeTodo } from '../types';

interface UseClaudeModalReturn {
  // Plan modal state
  selectedPlan: ClaudeCodePlan | null;
  isPlanModalOpen: boolean;
  openPlanModal: (plan: ClaudeCodePlan) => void;
  closePlanModal: () => void;

  // Todo modal state
  selectedTodo: ClaudeTodo | null;
  isTodoModalOpen: boolean;
  openTodoModal: (todo: ClaudeTodo) => void;
  closeTodoModal: () => void;

  // Utility functions
  closeAllModals: () => void;
  switchToPlanModal: (plan: ClaudeCodePlan) => void;
  switchToTodoModal: (todo: ClaudeTodo) => void;
}

export const useClaudeModal = (): UseClaudeModalReturn => {
  // Plan modal state
  const [selectedPlan, setSelectedPlan] = useState<ClaudeCodePlan | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  // Todo modal state
  const [selectedTodo, setSelectedTodo] = useState<ClaudeTodo | null>(null);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);

  // Plan modal functions
  const openPlanModal = useCallback((plan: ClaudeCodePlan) => {
    setSelectedPlan(plan);
    setIsPlanModalOpen(true);
    // Close todo modal if open
    setIsTodoModalOpen(false);
    setSelectedTodo(null);
  }, []);

  const closePlanModal = useCallback(() => {
    setIsPlanModalOpen(false);
    // Keep selectedPlan for potential quick reopen, clear it after a delay
    setTimeout(() => {
      if (!isPlanModalOpen) {
        setSelectedPlan(null);
      }
    }, 300);
  }, [isPlanModalOpen]);

  // Todo modal functions
  const openTodoModal = useCallback((todo: ClaudeTodo) => {
    setSelectedTodo(todo);
    setIsTodoModalOpen(true);
    // Close plan modal if open
    setIsPlanModalOpen(false);
    setSelectedPlan(null);
  }, []);

  const closeTodoModal = useCallback(() => {
    setIsTodoModalOpen(false);
    // Keep selectedTodo for potential quick reopen, clear it after a delay
    setTimeout(() => {
      if (!isTodoModalOpen) {
        setSelectedTodo(null);
      }
    }, 300);
  }, [isTodoModalOpen]);

  // Utility functions
  const closeAllModals = useCallback(() => {
    setIsPlanModalOpen(false);
    setIsTodoModalOpen(false);
    // Clear selections after animation completes
    setTimeout(() => {
      setSelectedPlan(null);
      setSelectedTodo(null);
    }, 300);
  }, []);

  const switchToPlanModal = useCallback((plan: ClaudeCodePlan) => {
    // Close todo modal and open plan modal
    setIsTodoModalOpen(false);
    setSelectedTodo(null);
    
    // Small delay to allow previous modal to close
    setTimeout(() => {
      setSelectedPlan(plan);
      setIsPlanModalOpen(true);
    }, 100);
  }, []);

  const switchToTodoModal = useCallback((todo: ClaudeTodo) => {
    // Close plan modal and open todo modal
    setIsPlanModalOpen(false);
    setSelectedPlan(null);
    
    // Small delay to allow previous modal to close
    setTimeout(() => {
      setSelectedTodo(todo);
      setIsTodoModalOpen(true);
    }, 100);
  }, []);

  return {
    // Plan modal
    selectedPlan,
    isPlanModalOpen,
    openPlanModal,
    closePlanModal,

    // Todo modal
    selectedTodo,
    isTodoModalOpen,
    openTodoModal,
    closeTodoModal,

    // Utilities
    closeAllModals,
    switchToPlanModal,
    switchToTodoModal,
  };
};