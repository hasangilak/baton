/**
 * BridgeServiceBanner Component
 * 
 * Displays when the Claude Code bridge service is disconnected or unavailable
 * Provides clear messaging and actionable steps for users to resolve the issue
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Terminal, ExternalLink, X } from 'lucide-react';

interface BridgeServiceBannerProps {
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  showDismiss?: boolean;
}

export const BridgeServiceBanner: React.FC<BridgeServiceBannerProps> = ({ 
  onRetry, 
  onDismiss, 
  className = '',
  showDismiss = true
}) => {
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
      // Wait a bit to show the retry state
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className={`bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-amber-400 mb-1">
            Claude Code Bridge Service Required
          </h3>
          <p className="text-sm text-amber-300/90 mb-3">
            The bridge service is needed to execute Claude Code queries. Please start the bridge service to continue.
          </p>
          
          <div className="bg-gray-800/50 rounded-md p-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-xs font-medium text-gray-400">Run this command:</span>
            </div>
            <code className="text-xs text-green-400 font-mono">
              bun run scripts/bridge.ts
            </code>
          </div>
          
          <div className="text-xs text-amber-300/80 space-y-1">
            <p>• Ensure you're in the project root directory</p>
            <p>• The bridge service connects Claude Code to Baton</p>
            <p>• Keep the terminal window open while using Claude Code features</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              title="Retry message after starting bridge service"
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Retry Message
                </>
              )}
            </button>
          )}

          {showDismiss && onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
              title="Dismiss this warning"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Optional help link */}
      <div className="mt-3 pt-3 border-t border-amber-500/20">
        <a 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            // Could link to documentation or help page
            console.log('Open bridge service help documentation');
          }}
          className="text-xs text-amber-300/80 hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Need help setting up the bridge service?
        </a>
      </div>
    </div>
  );
};

// Compact version for status bars
export const BridgeServiceIndicator: React.FC<{
  isError: boolean;
  onClick?: () => void;
  className?: string;
}> = ({ isError, onClick, className = '' }) => {
  if (!isError) return null;
  
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400 hover:bg-amber-500/20 transition-colors ${className}`}
      title="Bridge service disconnected - click for details"
    >
      <AlertTriangle className="w-3 h-3" />
      <span className="hidden sm:inline">Bridge Service</span>
      <span className="sm:hidden">Bridge</span>
    </button>
  );
};