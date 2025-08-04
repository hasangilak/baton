import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Layout } from './components/layout/Layout';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { ClaudeTodoList } from './components/claude/ClaudeTodoList';
import { SyncPanel } from './components/claude/SyncPanel';
import { queryClient } from './lib/queryClient';
import { useProjects } from './hooks/useProjects';

function AppContent() {
  const { data: projects } = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string>('demo-project-1');

  // Use first available project if demo project doesn't exist
  const activeProjectId = currentProjectId || projects?.[0]?.id || 'demo-project-1';

  return (
    <Layout 
      currentProjectId={activeProjectId}
      onProjectChange={setCurrentProjectId}
    >
      <div className="h-full flex flex-col">
        {/* Main content area with tabs/sections */}
        <div className="flex-1 p-6 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Kanban Board - Main view */}
            <div className="lg:col-span-2">
              <KanbanBoard projectId={activeProjectId} />
            </div>

            {/* Claude Code Integration Panel */}
            <div className="lg:col-span-1 space-y-6 overflow-y-auto">
              {/* Claude Todos */}
              <ClaudeTodoList 
                projectId={activeProjectId}
                onSync={() => {
                  // This could trigger a sync modal or action
                  console.log('Sync requested');
                }}
              />

              {/* Sync Panel */}
              <SyncPanel projectId={activeProjectId} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      {/* React Query DevTools - only shows in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;