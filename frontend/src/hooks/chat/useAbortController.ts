/**
 * Abort Controller Hook - Based on Claude Code WebUI Architecture
 * 
 * Manages request abortion for streaming chat requests,
 * following the comprehensive implementation guide patterns.
 */

import { useState, useCallback, useRef } from 'react';

export function useAbortController() {
  const [isAborting, setIsAborting] = useState(false);
  const currentRequestIdRef = useRef<string | null>(null);
  const abortTimeoutRef = useRef<number | null>(null);

  // Create abort handler for a specific request
  const createAbortHandler = useCallback((requestId: string) => {
    return async () => {
      if (isAborting || currentRequestIdRef.current !== requestId) {
        return; // Already aborting or different request
      }

      console.log(`⏹️ Aborting request: ${requestId}`);
      setIsAborting(true);

      try {
        // Call bridge abort endpoint
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_BASE_URL}/api/chat/messages/abort-bridge/${requestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Abort successful:', result.message);
        } else {
          console.warn('⚠️ Abort request failed:', response.status);
        }
      } catch (error) {
        console.error('❌ Abort request error:', error);
      } finally {
        // Reset abort state after a short delay
        if (abortTimeoutRef.current) {
          window.clearTimeout(abortTimeoutRef.current);
        }
        
        abortTimeoutRef.current = window.setTimeout(() => {
          setIsAborting(false);
          currentRequestIdRef.current = null;
        }, 1000);
      }
    };
  }, [isAborting]);

  // Set current request ID for abort tracking
  const setCurrentRequestId = useCallback((requestId: string | null) => {
    currentRequestIdRef.current = requestId;
    if (!requestId) {
      setIsAborting(false);
    }
  }, []);

  // Generic abort function for current request
  const abortCurrentRequest = useCallback(async () => {
    const requestId = currentRequestIdRef.current;
    if (!requestId) {
      console.warn('⚠️ No current request to abort');
      return;
    }

    const abortHandler = createAbortHandler(requestId);
    await abortHandler();
  }, [createAbortHandler]);

  // Check if a specific request can be aborted
  const canAbortRequest = useCallback((requestId: string) => {
    return currentRequestIdRef.current === requestId && !isAborting;
  }, [isAborting]);

  // Get current request info
  const getCurrentRequest = useCallback(() => {
    return {
      requestId: currentRequestIdRef.current,
      isAborting,
      canAbort: !!currentRequestIdRef.current && !isAborting,
    };
  }, [isAborting]);

  // Clean up function
  const cleanup = useCallback(() => {
    if (abortTimeoutRef.current) {
      clearTimeout(abortTimeoutRef.current);
      abortTimeoutRef.current = null;
    }
    currentRequestIdRef.current = null;
    setIsAborting(false);
  }, []);

  return {
    // State
    isAborting,
    currentRequestId: currentRequestIdRef.current,
    
    // Actions
    createAbortHandler,
    abortCurrentRequest,
    setCurrentRequestId,
    
    // Utilities
    canAbortRequest,
    getCurrentRequest,
    cleanup,
  };
}