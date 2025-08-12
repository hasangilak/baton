/**
 * SessionErrorBanner Component
 * 
 * Displays user-friendly error banners for session-related failures
 * Provides clear recovery actions and fallback options
 */

import React from 'react';
import { AlertCircle, RotateCcw, Plus, X, Loader2 } from 'lucide-react';
import { useChatContext } from '../../../hooks/chat/useChatContext';

interface SessionErrorBannerProps {
  conversationId: string | null;
  error: {
    type: 'session_required' | 'session_failed' | 'connection_lost' | 'timeout' | 'unknown';
    message: string;
    sessionRequired?: boolean;
    existingSessionId?: string;
    recoverable?: boolean;
  };
  onDismiss?: () => void;
  onNewConversation?: () => void;
  className?: string;
}

export const SessionErrorBanner: React.FC<SessionErrorBannerProps> = ({
  conversationId,
  error,
  onDismiss,
  onNewConversation,
  className = ''
}) => {
  const { initializeSession } = useChatContext();
  
  const [isRecovering, setIsRecovering] = React.useState(false);
  const [recoveryAttempts, setRecoveryAttempts] = React.useState(0);
  const maxRetries = 3;

  const handleRecover = async () => {
    if (!conversationId || recoveryAttempts >= maxRetries) return;
    
    setIsRecovering(true);
    setRecoveryAttempts(prev => prev + 1);
    
    try {
      await initializeSession(conversationId);
      // Success - banner will be dismissed automatically when session becomes available
    } catch (recoveryError) {
      console.error('Session recovery failed:', recoveryError);
      
      // If we've exceeded retry attempts, show permanent error
      if (recoveryAttempts + 1 >= maxRetries) {
        // Could dispatch a more severe error state here
      }
    } finally {
      setIsRecovering(false);
    }
  };

  const getErrorDisplay = () => {
    switch (error.type) {
      case 'session_required':
        return {
          icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
          title: 'Session Required',
          message: 'This conversation needs a Claude session to continue.',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/20',
          textColor: 'text-amber-200',
          recoverable: true,
        };

      case 'session_failed':
        return {
          icon: <AlertCircle className="w-5 h-5 text-red-500" />,
          title: 'Session Failed',
          message: error.message || 'Failed to establish connection with Claude.',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          textColor: 'text-red-200',
          recoverable: recoveryAttempts < maxRetries,
        };

      case 'connection_lost':
        return {
          icon: <AlertCircle className="w-5 h-5 text-orange-500" />,
          title: 'Connection Lost',
          message: 'Lost connection to the chat service. Messages may not be delivered.',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/20',
          textColor: 'text-orange-200',
          recoverable: true,
        };

      case 'timeout':
        return {
          icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
          title: 'Session Timeout',
          message: 'The session took too long to initialize. Please try again.',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20',
          textColor: 'text-yellow-200',
          recoverable: true,
        };

      default:
        return {
          icon: <AlertCircle className="w-5 h-5 text-gray-500" />,
          title: 'Connection Error',
          message: error.message || 'An unexpected error occurred.',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/20',
          textColor: 'text-gray-200',
          recoverable: false,
        };
    }
  };

  const errorDisplay = getErrorDisplay();

  return (
    <div className={`relative ${className}`}>
      <div className={`flex items-start gap-3 p-4 rounded-lg border ${errorDisplay.bgColor} ${errorDisplay.borderColor}`}>
        <div className="flex-shrink-0">
          {errorDisplay.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium ${errorDisplay.textColor}`}>
            {errorDisplay.title}
          </h3>
          <p className={`mt-1 text-sm ${errorDisplay.textColor} opacity-90`}>
            {errorDisplay.message}
          </p>
          
          {/* Recovery attempts indicator */}
          {recoveryAttempts > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Recovery attempt {recoveryAttempts}/{maxRetries}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Recovery button */}
          {errorDisplay.recoverable && conversationId && (
            <button
              onClick={handleRecover}
              disabled={isRecovering || recoveryAttempts >= maxRetries}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                error.type === 'session_required' 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title="Attempt to recover the session"
            >
              {isRecovering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {isRecovering ? 'Recovering...' : 'Reconnect'}
            </button>
          )}

          {/* Fallback: New conversation button */}
          {onNewConversation && (recoveryAttempts >= maxRetries || !errorDisplay.recoverable) && (
            <button
              onClick={onNewConversation}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
              title="Start a new conversation"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          )}

          {/* Dismiss button */}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
              title="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress indicator for recovery */}
      {isRecovering && (
        <div className="absolute bottom-0 left-0 right-0">
          <div className="h-1 bg-gray-700 rounded-b-lg overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse"></div>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for use in input areas or smaller spaces
export const SessionErrorToast: React.FC<{
  error: SessionErrorBannerProps['error'];
  onReconnect: () => void;
  isRecovering?: boolean;
}> = ({ error, onReconnect, isRecovering = false }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md text-red-200">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
      <span className="text-sm flex-1 truncate">
        {error.message}
      </span>
      <button
        onClick={onReconnect}
        disabled={isRecovering}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
      >
        {isRecovering ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RotateCcw className="w-3 h-3" />
        )}
        {isRecovering ? 'Fixing...' : 'Fix'}
      </button>
    </div>
  );
};