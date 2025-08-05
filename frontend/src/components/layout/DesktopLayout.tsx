import React from 'react';
import { KanbanBoard } from '../kanban/KanbanBoard';
import { ClaudeTodoList } from '../claude/ClaudeTodoList';
import { SyncPanel } from '../claude/SyncPanel';
import { PlansList } from '../plans/PlansList';

interface DesktopLayoutProps {
  projectId: string;
  onSync?: () => void;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = React.memo(({ 
  projectId, 
  onSync 
}) => {
  return (
    <div className="h-full">
      <div 
        className="h-full grid gap-6"
        style={{
          gridTemplateAreas: '"kanban kanban sidebar"',
          gridTemplateColumns: '1fr 1fr 500px',
          gridTemplateRows: '1fr'
        }}
      >
        {/* Kanban Board - Main view */}
        <div style={{ gridArea: 'kanban' }} className="min-w-0">
          <KanbanBoard projectId={projectId} />
        </div>

        {/* Claude Code Integration Panel */}
        <div style={{ gridArea: 'sidebar' }} className="space-responsive-y overflow-y-auto min-w-0">
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
    </div>
  );
});

DesktopLayout.displayName = 'DesktopLayout';