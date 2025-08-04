import React from 'react';
import { KanbanBoard } from '../kanban/KanbanBoard';
import { ClaudeTodoList } from '../claude/ClaudeTodoList';
import { SyncPanel } from '../claude/SyncPanel';
import { PlansList } from '../plans/PlansList';

interface MobileLayoutProps {
  projectId: string;
  onSync?: () => void;
}

export const MobileLayout: React.FC<MobileLayoutProps> = React.memo(({ 
  projectId, 
  onSync 
}) => {
  return (
    <div className="h-full flex flex-col gap-responsive">
      {/* Kanban Board - Main view on mobile */}
      <div className="flex-1 min-h-0">
        <KanbanBoard projectId={projectId} />
      </div>

      {/* Claude Code Integration Panel - Collapsible on mobile */}
      <div className="flex-shrink-0 max-h-[40vh] overflow-y-auto space-responsive-y">
        {/* Claude Code Plans */}
        <PlansList projectId={projectId} />

        {/* Claude Todos */}
        <ClaudeTodoList
          projectId={projectId}
          onSync={onSync}
        />

        {/* Sync Panel */}
        <SyncPanel projectId={projectId} />
      </div>
    </div>
  );
});

MobileLayout.displayName = 'MobileLayout';