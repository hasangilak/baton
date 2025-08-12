/**
 * SessionStatusIndicator Component
 * 
 * Provides clear visual feedback about Claude Code session status
 * Shows loading, ready, error, and recovery states in a non-intrusive way
 */

import React from 'react';
import { CheckCircle, Clock, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { useChatContext } from '../../../hooks/chat/useChatContext';

interface SessionStatusIndicatorProps {
  conversationId: string | null;
  className?: string;
  showDetails?: boolean;
}

export const SessionStatusIndicator: React.FC<SessionStatusIndicatorProps> = ({
  conversationId,
  className = '',
  showDetails = true
}) => {
  const { 
    sessionState, 
    isSessionReady, 
    isSessionPending,
    initializeSession 
  } = useChatContext();

  const [isRecovering, setIsRecovering] = React.useState(false);

  if (!conversationId) {
    return null;
  }

  const session = sessionState[conversationId];
  const isPending = isSessionPending(conversationId);
  const isReady = isSessionReady(conversationId);

  // Handle session recovery
  const handleRecover = async () => {
    setIsRecovering(true);
    try {
      await initializeSession(conversationId);
    } catch (error) {
      console.error('Session recovery failed:', error);
    } finally {
      setIsRecovering(false);
    }
  };

  // Determine status and styling
  const getStatusInfo = () => {
    if (isRecovering) {
      return {
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        text: 'Recovering session...',
        bgColor: 'bg-blue-500/10',
        textColor: 'text-blue-400',
        borderColor: 'border-blue-500/20',
      };
    }

    if (isPending) {
      return {
        icon: <Clock className="w-3 h-3" />,
        text: 'Initializing Claude session...',
        bgColor: 'bg-amber-500/10',
        textColor: 'text-amber-400',
        borderColor: 'border-amber-500/20',
      };
    }

    if (isReady && session?.sessionId) {
      return {
        icon: <CheckCircle className="w-3 h-3" />,
        text: `Session: ${session.sessionId.slice(0, 8)}`,
        bgColor: 'bg-green-500/10',
        textColor: 'text-green-400',
        borderColor: 'border-green-500/20',
      };
    }

    // Error state - no session when one is needed
    return {
      icon: <AlertCircle className="w-3 h-3" />,
      text: 'No session',
      bgColor: 'bg-red-500/10',
      textColor: 'text-red-400',
      borderColor: 'border-red-500/20',
      showRecovery: true,
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${statusInfo.bgColor} ${statusInfo.borderColor}`}
      >
        <div className={statusInfo.textColor}>
          {statusInfo.icon}
        </div>
        
        {showDetails && (
          <span className={`text-xs font-medium ${statusInfo.textColor}`}>
            {statusInfo.text}
          </span>
        )}
      </div>

      {/* Recovery button for error states */}
      {statusInfo.showRecovery && (
        <button
          onClick={handleRecover}
          disabled={isRecovering}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Reconnect session"
        >
          <RotateCcw className={`w-3 h-3 ${isRecovering ? 'animate-spin' : ''}`} />
          {showDetails && 'Reconnect'}
        </button>
      )}
    </div>
  );
};

// Compact version for use in headers/toolbars
export const SessionStatusIconOnly: React.FC<{ conversationId: string | null }> = ({ 
  conversationId 
}) => {
  return (
    <SessionStatusIndicator 
      conversationId={conversationId} 
      showDetails={false}
      className="ml-2"
    />
  );
};

// Debug version with extra details for development
export const SessionStatusDebug: React.FC<{ conversationId: string | null }> = ({
  conversationId
}) => {
  const { sessionState } = useChatContext();
  
  if (!conversationId) return null;
  
  const session = sessionState[conversationId];
  
  return (
    <details className="text-xs">
      <summary className="cursor-pointer">
        <SessionStatusIndicator conversationId={conversationId} />
      </summary>
      <pre className="mt-2 p-2 bg-gray-800 rounded text-gray-300 overflow-auto">
        {JSON.stringify({
          conversationId,
          session
        }, null, 2)}
      </pre>
    </details>
  );
};