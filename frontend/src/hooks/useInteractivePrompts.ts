import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { InteractivePrompt } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface UseInteractivePromptsProps {
  conversationId: string | null;
  sessionId?: string | null; // Claude Code session ID for permission correlation
  enableAnalytics?: boolean;
  socket?: any; // Socket will be passed from parent component
}

interface PermissionAnalytics {
  totalPrompts: number;
  responsesByDecision: Record<string, number>;
  averageResponseTime: number;
  toolsRequested: Record<string, number>;
  riskLevelDistribution: Record<string, number>;
  topTools: Array<{ tool: string; count: number }>;
  summary: {
    totalRequests: number;
    mostCommonDecision: string;
    averageResponseSeconds: number;
    mostRequestedTool: string;
  };
}

export const useInteractivePrompts = ({ conversationId, sessionId, enableAnalytics = false, socket }: UseInteractivePromptsProps) => {
  const queryClient = useQueryClient();
  const [isRespondingToPrompt, setIsRespondingToPrompt] = useState(false);
  
  // Real-time prompt state (like successful implementations)
  const [pendingPrompts, setPendingPrompts] = useState<InteractivePrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enhanced analytics state
  const [livePermissionStatus] = useState<string>('');
  const [realtimeAnalytics, setRealtimeAnalytics] = useState<Record<string, unknown>>({});

  // Note: Room management is handled by the main chat system (useChatIntegration)
  // The useInteractivePrompts hook relies on the main chat system's WebSocket connection
  // and room management to receive permission events in the conversation room

  // Load existing pending prompts on mount (like successful implementations)
  useEffect(() => {
    console.log('🔄 useInteractivePrompts mounting, conversationId:', conversationId);
    if (!conversationId) {
      console.log('⚠️ No conversation ID, skipping prompt loading');
      return;
    }
    
    const loadPendingPrompts = async () => {
      try {
        console.log('🔄 Starting to load pending prompts...');
        setIsLoading(true);
        const response = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/prompts/pending`);
        console.log('📡 Response received:', response.status, response.ok);
        if (response.ok) {
          const data = await response.json();
          console.log('📥 Loaded existing pending prompts data:', data);
          // Handle the API response structure (data.prompts)
          if (data.success && data.prompts) {
            setPendingPrompts(data.prompts);
            console.log('✅ Set pending prompts:', data.prompts.length, 'prompts');
          }
        } else {
          console.error('❌ API response not ok:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ Error loading pending prompts:', error);
        setError(error instanceof Error ? error.message : 'Failed to load prompts');
      } finally {
        setIsLoading(false);
      }
    };

    loadPendingPrompts();
  }, [conversationId]);

  // Enhanced WebSocket listeners with analytics
  useEffect(() => {
    if (!socket) {
      console.log('⚠️ useInteractivePrompts: No socket available');
      return;
    }

    console.log('🔗 useInteractivePrompts: Setting up WebSocket listeners for conversation:', conversationId);

    const handleInteractivePrompt = (data: any) => {
      console.log('🔔 Received enhanced interactive prompt:', data);
      console.log('🔍 Current conversation ID:', conversationId);
      console.log('🔍 Prompt conversation ID:', data.conversationId);
      
      // Only handle prompts for the current conversation
      if (data.conversationId !== conversationId) {
        console.log('🚫 Ignoring prompt for different conversation:', data.conversationId, 'vs', conversationId);
        return;
      }

      // Create enhanced prompt object with analytics data
      const prompt: InteractivePrompt & { 
        usageStatistics?: any; 
        timestamp?: number;
        riskLevel?: string;
        analytics?: any; 
      } = {
        id: data.promptId,
        conversationId: data.conversationId,
        sessionId: data.sessionId,
        type: data.type,
        title: data.title,
        message: data.message,
        options: data.options,
        context: {
          ...data.context,
          // Enhanced context from backend
          riskLevel: data.riskLevel,
          toolName: data.toolName,
          usageCount: data.context?.usageCount || 0,
          parameters: data.context?.parameters,
          requestTime: data.context?.requestTime,
          userAgent: data.context?.userAgent
        },
        status: 'pending',
        selectedOption: undefined,
        autoHandler: undefined,
        timeoutAt: new Date(Date.now() + (data.timeout || 30000)).toISOString(),
        createdAt: new Date().toISOString(),
        respondedAt: undefined,
        
        // Enhanced analytics data
        usageStatistics: data.usageStatistics,
        timestamp: data.timestamp,
        riskLevel: data.riskLevel,
        analytics: {
          promptCreatedAt: data.timestamp,
          riskLevel: data.riskLevel,
          toolName: data.toolName,
          usageCount: data.context?.usageCount || 0,
          recommendedAction: data.usageStatistics?.recommendedAction
        }
      };

      // Add to pending prompts (replacing any existing with same ID)
      setPendingPrompts(prev => {
        const filtered = prev.filter(p => p.id !== prompt.id);
        return [...filtered, prompt];
      });

      // Send acknowledgment if required via WebSocket only
      if (data.requiresAck && socket) {
        const acknowledgment = {
          promptId: data.promptId,
          deliveryId: data.deliveryId,
          conversationId: data.conversationId,
          timestamp: Date.now(),
          clientInfo: {
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            windowSize: `${window.innerWidth}x${window.innerHeight}`,
            online: navigator.onLine,
            language: navigator.language
          }
        };
        
        console.log('📨 Sending prompt acknowledgment via WebSocket:', acknowledgment);
        socket.emit('prompt_received_confirmation', acknowledgment);
      }

      // Track analytics event
      if (enableAnalytics) {
        trackAnalyticsEvent('prompt_received', {
          toolName: data.toolName,
          riskLevel: data.riskLevel,
          conversationId: data.conversationId,
          acknowledged: !!data.requiresAck
        });
      }
    };

    // New analytics event handlers
    const handlePermissionAnalytics = (data: Record<string, unknown>) => {
      console.log('📊 Permission analytics update:', data);
      setRealtimeAnalytics(prev => ({
        ...prev,
        ...data,
        lastUpdated: Date.now()
      }));
    };

    const handlePermissionRequest = (data: any) => {
      console.log('🔐 Permission request notification:', data);
      // Could show toast notification for project-level awareness
    };

    const handleAnalyticsEvent = (data: any) => {
      console.log('📈 Analytics event:', data);
      // Update real-time analytics dashboard
    };

    // Unified permission request handler
    const handleUnifiedPermissionRequest = (data: any) => {
      console.log('🔐 [useInteractivePrompts] Received unified permission request:', data);
      console.log('🔍 [useInteractivePrompts] Current conversation ID:', conversationId);
      console.log('🔍 [useInteractivePrompts] Request conversation ID:', data.conversationId);
      
      // Only handle requests for the current conversation
      if (data.conversationId !== conversationId) {
        console.log('🚫 Ignoring unified permission request for different conversation:', data.conversationId, 'vs', conversationId);
        return;
      }

      // Convert unified permission request to interactive prompt format
      const prompt: InteractivePrompt & { 
        permissionType?: string;
        subtype?: string;
        unifiedRequest?: boolean;
      } = {
        id: data.promptId,
        conversationId: data.conversationId,
        sessionId: data.sessionId,
        type: data.permissionType, // Use permissionType as type for unified requests
        title: data.title,
        message: data.message,
        options: data.options,
        context: {
          ...data.context,
          permissionType: data.permissionType,
          subtype: data.subtype,
          originalRequest: data
        },
        status: 'pending',
        selectedOption: undefined,
        autoHandler: undefined,
        timeoutAt: new Date(Date.now() + (data.context?.timeout || 30000)).toISOString(),
        createdAt: new Date().toISOString(),
        respondedAt: undefined,
        
        // Add unified permission metadata
        permissionType: data.permissionType,
        subtype: data.subtype,
        unifiedRequest: true
      };

      // Add to pending prompts (replacing any existing with same ID)
      setPendingPrompts(prev => {
        const filtered = prev.filter(p => p.id !== prompt.id);
        return [...filtered, prompt];
      });

      // Track analytics event for unified permission
      if (enableAnalytics) {
        trackAnalyticsEvent('unified_permission_received', {
          permissionType: data.permissionType,
          subtype: data.subtype,
          toolName: data.context?.toolName,
          riskLevel: data.context?.riskLevel,
          conversationId: data.conversationId
        });
      }
    };

    // Enhanced event listeners including unified permission support
    socket.on('interactive_prompt', handleInteractivePrompt);
    socket.on('unified_permission_request', handleUnifiedPermissionRequest); // New unified handler
    socket.on('permission_analytics', handlePermissionAnalytics);
    socket.on('permission_request', handlePermissionRequest);
    socket.on('analytics_event', handleAnalyticsEvent);
    socket.on('permission_statistics', handleAnalyticsEvent);

    return () => {
      socket.off('interactive_prompt', handleInteractivePrompt);
      socket.off('unified_permission_request', handleUnifiedPermissionRequest); // Cleanup unified handler
      socket.off('permission_analytics', handlePermissionAnalytics);
      socket.off('permission_request', handlePermissionRequest);
      socket.off('analytics_event', handleAnalyticsEvent);
      socket.off('permission_statistics', handleAnalyticsEvent);
    };
  }, [socket, conversationId, enableAnalytics]);

  // Analytics API queries
  const { data: analyticsData } = useQuery({
    queryKey: ['permission-analytics', conversationId],
    queryFn: async (): Promise<PermissionAnalytics> => {
      const response = await fetch(`${API_BASE}/api/chat/analytics/permissions?conversationId=${conversationId}&timeframe=24h`);
      if (!response.ok) {
        throw new Error('Failed to fetch permission analytics');
      }
      const data = await response.json();
      return data.analytics;
    },
    enabled: enableAnalytics && !!conversationId,
    refetchInterval: 60000, // Refetch every minute
  });

  const { data: liveStatus } = useQuery({
    queryKey: ['live-permission-status', conversationId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/permissions/live`);
      if (!response.ok) {
        throw new Error('Failed to fetch live permission status');
      }
      const data = await response.json();
      return data.liveStatus;
    },
    enabled: enableAnalytics && !!conversationId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Analytics tracking function
  const trackAnalyticsEvent = useCallback(async (eventType: string, metadata: any) => {
    if (!conversationId) return;
    
    try {
      await fetch(`${API_BASE}/api/chat/analytics/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType,
          conversationId,
          toolName: metadata.toolName,
          metadata: {
            ...metadata,
            timestamp: Date.now(),
            source: 'frontend'
          }
        }),
      });
    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  }, [conversationId]);

  // HTTP acknowledgment as backup to WebSocket
  const sendPromptAcknowledgmentHTTP = useCallback(async (promptId: string, clientInfo: any) => {
    try {
      await fetch(`${API_BASE}/api/chat/prompts/${promptId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientInfo,
          timestamp: Date.now(),
          acknowledgmentMethod: 'http_backup'
        }),
      });
      console.log('✅ HTTP acknowledgment sent for prompt:', promptId);
    } catch (error) {
      console.error('❌ Failed to send HTTP acknowledgment:', error);
    }
  }, []);

  // Enhanced respond to prompt via WebSocket with unified permission support
  const respondToPrompt = useMutation({
    mutationFn: async ({ promptId, optionId, startTime }: { 
      promptId: string; 
      optionId: string;
      startTime?: number;
    }) => {
      const responseTime = startTime ? Date.now() - startTime : 0;
      
      if (!socket) {
        throw new Error('No WebSocket connection available');
      }

      // Get the prompt to determine if it's a unified permission request
      const prompt = pendingPrompts.find(p => p.id === promptId);
      const isUnifiedRequest = (prompt as any)?.unifiedRequest;
      const permissionType = (prompt as any)?.permissionType;
      const selectedOption = prompt?.options.find(opt => opt.id === optionId);

      if (isUnifiedRequest) {
        // Send unified permission response
        socket.emit('unified_permission_response', {
          promptId,
          conversationId,
          sessionId,
          selectedOption: optionId,
          selectedValue: selectedOption?.value || optionId,
          data: {
            feedback: '', // Can be extended for plan reviews
            metadata: {
              responseTime,
              source: 'frontend',
              timestamp: Date.now()
            }
          },
          responseTime,
          timestamp: Date.now(),
          permissionType,
          subtype: (prompt as any)?.subtype
        });

        console.log('✅ Unified permission response sent via WebSocket', { 
          promptId, 
          selectedOption: optionId,
          permissionType,
          conversationId,
          sessionId 
        });
      } else {
        // Send legacy permission response
        socket.emit('permission:respond', {
          promptId,
          selectedOption: optionId,
          conversationId, // Include conversation ID for routing
          sessionId, // Include session ID for Claude Code correlation
          metadata: {
            responseTime,
            source: 'frontend',
            timestamp: Date.now()
          }
        });

        console.log('✅ Legacy permission response sent via WebSocket', { 
          promptId, 
          selectedOption: optionId,
          conversationId,
          sessionId 
        });
      }
      
      // Track response analytics
      if (enableAnalytics) {
        trackAnalyticsEvent(isUnifiedRequest ? 'unified_prompt_responded' : 'prompt_responded', {
          promptId,
          selectedOption: optionId,
          responseTime,
          method: 'websocket',
          permissionType: isUnifiedRequest ? permissionType : undefined
        });
      }

      return { success: true, promptId, selectedOption: optionId };
    },
    onMutate: () => {
      setIsRespondingToPrompt(true);
    },
    onSuccess: (_data, variables) => {
      console.log('✅ Prompt response sent:', variables);
      
      // Invalidate and refetch pending prompts
      queryClient.invalidateQueries({
        queryKey: ['interactivePrompts', 'pending', conversationId]
      });
      
      setIsRespondingToPrompt(false);
    },
    onError: (error, variables) => {
      console.error('❌ Failed to respond to prompt:', error, variables);
      setIsRespondingToPrompt(false);
    },
  });

  // WebSocket event listeners are now handled in the shared useWebSocket hook
  // No need for separate event listeners here since the shared connection 
  // already handles 'interactive_prompt', 'prompt:response', and 'prompt:timeout' events

  const handlePromptResponse = useCallback(async (promptId: string, optionId: string) => {
    const startTime = Date.now();
    
    try {
      // Get the prompt for analytics before removing it
      const prompt = pendingPrompts.find(p => p.id === promptId);
      
      // Immediately remove from pending prompts (optimistic update)
      setPendingPrompts(prev => prev.filter(p => p.id !== promptId));
      
      await respondToPrompt.mutateAsync({ promptId, optionId, startTime });
      
      // Track successful response
      if (enableAnalytics && prompt) {
        trackAnalyticsEvent('prompt_completed', {
          promptId,
          selectedOption: optionId,
          responseTime: Date.now() - startTime,
          riskLevel: (prompt as any).riskLevel,
          toolName: (prompt.context as any)?.toolName,
          success: true
        });
      }
    } catch (error) {
      console.error('Failed to respond to prompt:', error);
      
      // Track failed response
      if (enableAnalytics) {
        trackAnalyticsEvent('prompt_failed', {
          promptId,
          selectedOption: optionId,
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        });
      }
    }
  }, [respondToPrompt, pendingPrompts, enableAnalytics, trackAnalyticsEvent]);

  return {
    // Core functionality
    pendingPrompts: pendingPrompts as InteractivePrompt[],
    isLoading,
    error,
    isRespondingToPrompt,
    handlePromptResponse,
    socket,
    
    // Enhanced analytics
    analyticsData,
    liveStatus,
    livePermissionStatus,
    realtimeAnalytics,
    trackAnalyticsEvent,
    
    // Computed analytics
    permissionSummary: analyticsData?.summary ? {
      totalRequests: analyticsData.summary.totalRequests,
      averageResponseTime: analyticsData.summary.averageResponseSeconds,
      mostCommonDecision: analyticsData.summary.mostCommonDecision,
      riskDistribution: analyticsData.riskLevelDistribution,
      topTools: analyticsData.topTools?.slice(0, 3) || [],
      recentActivity: liveStatus?.recentActivity?.slice(0, 5) || []
    } : null,
  };
};