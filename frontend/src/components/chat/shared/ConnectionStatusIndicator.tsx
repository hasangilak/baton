/**
 * ConnectionStatusIndicator Component
 * 
 * Shows WebSocket connection status with automatic reconnection feedback
 * Provides clear visual cues for connection health
 */

import React from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { useChatContext } from '../../../hooks/chat/useChatContext';

interface ConnectionStatusIndicatorProps {
  className?: string;
  showText?: boolean;
  compact?: boolean;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  className = '',
  showText = true,
  compact = false
}) => {
  const { state } = useChatContext();
  const connected = state.isConnected;
  
  const [showReconnecting, setShowReconnecting] = React.useState(false);
  const [lastConnectionTime, setLastConnectionTime] = React.useState<number | null>(null);

  // Track connection changes
  React.useEffect(() => {
    if (connected) {
      setLastConnectionTime(Date.now());
      setShowReconnecting(false);
    } else if (lastConnectionTime) {
      // If we were previously connected and now disconnected, show reconnecting
      setShowReconnecting(true);
    }
  }, [connected, lastConnectionTime]);

  // Auto-hide reconnecting after a delay if still disconnected
  React.useEffect(() => {
    if (showReconnecting && !connected) {
      const timer = setTimeout(() => {
        setShowReconnecting(false);
      }, 10000); // Hide after 10 seconds of failed reconnection

      return () => clearTimeout(timer);
    }
  }, [showReconnecting, connected]);

  const getStatusInfo = () => {
    if (connected) {
      return {
        icon: <Wifi className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-green-500`} />,
        text: 'Connected',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20',
        textColor: 'text-green-400',
        pulse: false,
      };
    }

    if (showReconnecting) {
      return {
        icon: <Loader2 className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-amber-500 animate-spin`} />,
        text: 'Reconnecting...',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
        textColor: 'text-amber-400',
        pulse: true,
      };
    }

    return {
      icon: <WifiOff className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-red-500`} />,
      text: 'Disconnected',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      textColor: 'text-red-400',
      pulse: false,
    };
  };

  const statusInfo = getStatusInfo();

  if (compact) {
    return (
      <div className={`flex items-center ${className}`} title={statusInfo.text}>
        <div className={statusInfo.pulse ? 'animate-pulse' : ''}>
          {statusInfo.icon}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${statusInfo.bgColor} ${statusInfo.borderColor} ${
          statusInfo.pulse ? 'animate-pulse' : ''
        }`}
      >
        {statusInfo.icon}
        {showText && (
          <span className={`text-xs font-medium ${statusInfo.textColor}`}>
            {statusInfo.text}
          </span>
        )}
      </div>
    </div>
  );
};

// Banner version for critical connection issues
export const ConnectionLostBanner: React.FC<{
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}> = ({ onRetry, onDismiss, className = '' }) => {
  const { state } = useChatContext();
  const connected = state.isConnected;
  
  const [isRetrying, setIsRetrying] = React.useState(false);

  // Auto-hide banner when connection is restored
  React.useEffect(() => {
    if (connected && onDismiss) {
      onDismiss();
    }
  }, [connected, onDismiss]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      }
      // Wait a bit to show the retry state
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setIsRetrying(false);
    }
  };

  if (connected) {
    return null;
  }

  return (
    <div className={`bg-red-500/10 border border-red-500/20 rounded-lg p-3 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-red-400">
            Connection Lost
          </h3>
          <p className="mt-1 text-sm text-red-300 opacity-90">
            Unable to connect to the chat service. Messages may not be delivered.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md transition-colors"
              title="Retry connection"
            >
              {isRetrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
              title="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Tooltip version for minimal UI
export const ConnectionStatusTooltip: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { state } = useChatContext();
  const connected = state.isConnected;
  
  const statusText = connected ? 'Connected to chat service' : 'Disconnected from chat service';

  return (
    <div 
      className="relative group cursor-help"
      title={statusText}
    >
      {children}
      
      {/* Optional detailed tooltip on hover */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {statusText}
      </div>
    </div>
  );
};