import React from 'react';
import { Copy, Link, RotateCcw } from 'lucide-react';

interface Props { 
  sessionId?: string | null; 
  contextTokens?: number | null;
  onResumeSession?: () => void;
  isResuming?: boolean;
}

export const SessionInfo: React.FC<Props> = ({ sessionId, contextTokens, onResumeSession, isResuming = false }) => {
  if (!sessionId) return null;
  return (
    <div className="bg-[#202123] border-b border-[#2C2D30] px-3 md:px-4 py-2 flex items-center justify-between text-[11px]">
      <div className="flex items-center space-x-2">
        <Link className="w-3 h-3 text-[#8B8B8D]" />
        <span className="text-[#8B8B8D]">Claude Session:</span>
        <code className="text-[#E5E5E5] bg-[#3E3E42] px-2 py-1 rounded">{sessionId}</code>
        {typeof contextTokens === 'number' && (
          <span className="text-[#8B8B8D] ml-2">({contextTokens.toLocaleString()} tokens)</span>
        )}
      </div>
      <div className="flex items-center space-x-1">
        {onResumeSession && (
          <button 
            onClick={onResumeSession}
            disabled={isResuming}
            className="p-1 hover:bg-[#3E3E42] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            title="Resume/Reattach to session" 
            data-testid="chat-resume-session"
          >
            <RotateCcw className={`w-3 h-3 text-[#8B8B8D] ${isResuming ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button onClick={() => sessionId && navigator.clipboard.writeText(sessionId)} className="p-1 hover:bg-[#3E3E42] rounded transition-colors" title="Copy session ID" data-testid="chat-copy-session-id">
          <Copy className="w-3 h-3 text-[#8B8B8D]" />
        </button>
      </div>
    </div>
  );
};
