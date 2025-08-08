/**
 * Abort Message Component - User cancellation handling
 */

import React from 'react';
import { StopCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AbortMessageProps {
  message: any;
  showTimestamp?: boolean;
}

export const AbortMessage: React.FC<AbortMessageProps> = ({
  message,
  showTimestamp = true,
}) => {
  const timestamp = message.timestamp || Date.now();
  const abortText = message.message || 'Operation was aborted by user';

  return (
    <div className="bg-orange-900/10 border border-orange-800/50 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded bg-orange-900/20 flex items-center justify-center flex-shrink-0">
          <StopCircle size={14} className="text-orange-400" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-orange-400 text-sm">Aborted</span>
            {showTimestamp && (
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-1">{abortText}</div>
        </div>
      </div>
    </div>
  );
};

export default AbortMessage;