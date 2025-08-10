import { useState, useEffect, useCallback } from 'react';
import type { PlanReviewDecision } from '../components/chat/PlanReviewModal';

interface PlanReviewState {
  planReviewId: string | null;
  conversationId: string | null;
  planContent: string | null;
  title: string | null;
  message: string | null;
  isModalOpen: boolean;
}

interface UsePlanReviewOptions {
  conversationId?: string;
  onPlanReviewResolved?: (decision: PlanReviewDecision) => void;
}

export const usePlanReview = (options: UsePlanReviewOptions = {}) => {
  const { conversationId, onPlanReviewResolved } = options;

  const [state, setState] = useState<PlanReviewState>({
    planReviewId: null,
    conversationId: null,
    planContent: null,
    title: null,
    message: null,
    isModalOpen: false
  });

  // Handle plan review WebSocket events
  useEffect(() => {
    if (!conversationId) return;

    const handlePlanReview = (event: CustomEvent) => {
      const data = event.detail;
      
      // Only handle events for our conversation
      if (data.conversationId !== conversationId) return;
      
      console.log('📋 Plan review received:', data);
      
      setState({
        planReviewId: data.planReviewId,
        conversationId: data.conversationId,
        planContent: data.planContent,
        title: data.title || 'Plan Review Required',
        message: data.message || 'Claude Code has generated an implementation plan for your review.',
        isModalOpen: true
      });
    };

    // Listen for plan review events
    window.addEventListener('plan_review', handlePlanReview as EventListener);

    return () => {
      window.removeEventListener('plan_review', handlePlanReview as EventListener);
    };
  }, [conversationId]);

  // Submit plan review decision to backend
  const submitDecision = useCallback(async (decision: PlanReviewDecision): Promise<void> => {
    if (!state.planReviewId) {
      throw new Error('No active plan review to respond to');
    }

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    try {
      console.log(`📋 Submitting plan review decision: ${decision.decision} for planReviewId: ${state.planReviewId}`);
      
      const response = await fetch(`${API_BASE_URL}/api/chat/plan-review/${state.planReviewId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision: decision.decision,
          feedback: decision.feedback,
          editedPlan: decision.editedPlan
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`❌ Plan review submission failed: ${error.error || response.statusText}`);
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Plan review decision submitted successfully:', result);

      // Call callback if provided
      onPlanReviewResolved?.(decision);

      // Close modal
      closeModal();

    } catch (error) {
      console.error('❌ Failed to submit plan review decision:', error);
      throw error;
    }
  }, [state.planReviewId, onPlanReviewResolved]);

  // Close the plan review modal
  const closeModal = useCallback(() => {
    setState(prev => ({
      ...prev,
      isModalOpen: false
    }));
  }, []);

  // Clear plan review state (for cleanup)
  const clearState = useCallback(() => {
    setState({
      planReviewId: null,
      conversationId: null,
      planContent: null,
      title: null,
      message: null,
      isModalOpen: false
    });
  }, []);

  // Submit plan decision directly (for ExitPlanMode messages)
  const submitPlanDecision = useCallback(async (planReviewId: string, decision: PlanReviewDecision): Promise<void> => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    try {
      console.log(`📋 Submitting direct plan review decision: ${decision.decision} for planReviewId: ${planReviewId}`);
      
      const response = await fetch(`${API_BASE_URL}/api/chat/plan-review/${planReviewId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision: decision.decision,
          feedback: decision.feedback,
          editedPlan: decision.editedPlan
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`❌ Direct plan review submission failed: ${error.error || response.statusText}`);
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Direct plan review decision submitted successfully:', result);

      // Call callback if provided
      onPlanReviewResolved?.(decision);

    } catch (error) {
      console.error('❌ Failed to submit direct plan review decision:', error);
      throw error;
    }
  }, [onPlanReviewResolved]);

  return {
    // State
    planReview: state,
    
    // Actions
    submitDecision,
    submitPlanDecision, // New direct submission method
    closeModal,
    clearState,
    
    // Status
    hasActivePlanReview: !!state.planReviewId,
    isModalOpen: state.isModalOpen
  };
};

// Hook to set up WebSocket listeners for plan reviews
export const usePlanReviewWebSocket = () => {
  useEffect(() => {
    // Set up socket.io listeners if using socket.io
    const setupSocketListeners = () => {
      // Check if socket.io is available
      const socket = (window as any).io;
      if (!socket) {
        console.warn('Socket.IO not available for plan review events');
        return null;
      }

      // Listen for plan review events from backend
      socket.on('plan_review', (data: any) => {
        console.log('📋 Plan review event from WebSocket:', data);
        
        // Emit custom event for the hook to catch
        const event = new CustomEvent('plan_review', { detail: data });
        window.dispatchEvent(event);
      });

      socket.on('plan_review_completed', (data: any) => {
        console.log('✅ Plan review completed:', data);
        
        // You could emit a completion event here if needed
        const event = new CustomEvent('plan_review_completed', { detail: data });
        window.dispatchEvent(event);
      });

      return socket;
    };

    const socket = setupSocketListeners();

    return () => {
      // Clean up socket listeners
      if (socket) {
        socket.off('plan_review');
        socket.off('plan_review_completed');
      }
    };
  }, []);
};