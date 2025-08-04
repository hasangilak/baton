import { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Layout } from './components/layout/Layout';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { ClaudeTodoList } from './components/claude/ClaudeTodoList';
import { SyncPanel } from './components/claude/SyncPanel';
import { queryClient } from './lib/queryClient';
import { useProjects } from './hooks/useProjects';
import { useWebSocket } from './hooks/useWebSocket';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';

function AppContent() {
  const { data: projects } = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string>('demo-project-1');
  const { connected, connecting, error, joinProject, leaveProject } = useWebSocket();

  // Use first available project if demo project doesn't exist
  const activeProjectId = currentProjectId || projects?.[0]?.id || 'demo-project-1';

  // Handle project room subscription when activeProjectId changes
  useEffect(() => {
    if (connected && activeProjectId) {
      // Leave all previous rooms and join the current project room
      joinProject(activeProjectId);
      
      return () => {
        leaveProject(activeProjectId);
      };
    }
    // Explicit return for when condition is not met
    return undefined;
  }, [connected, activeProjectId, joinProject, leaveProject]);

  return (
    <Layout 
      currentProjectId={activeProjectId}
      onProjectChange={setCurrentProjectId}
      websocketStatus={{ connected, connecting, error }}
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
      <ThemeProvider>
        <ToastProvider>
          <AppContent />
          {/* React Query DevTools - only shows in development */}
          <ReactQueryDevtools initialIsOpen={false} />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;