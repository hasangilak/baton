import { useState, useEffect, useMemo, useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Layout } from './components/layout/Layout';
import { MobileLayout } from './components/layout/MobileLayout';
import { DesktopLayout } from './components/layout/DesktopLayout';
import { queryClient } from './lib/queryClient';
import { useProjects } from './hooks/useProjects';
import { useWebSocket } from './hooks/useWebSocket';
import { useBreakpoints } from './hooks/useBreakpoints';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';

function AppContent() {
  const { data: projects } = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string>('demo-project-1');
  const { isMobile } = useBreakpoints();

  // Use first available project if demo project doesn't exist
  const activeProjectId = currentProjectId || projects?.[0]?.id || 'demo-project-1';

  const { connected, connecting, error, joinProject, leaveProject } = useWebSocket({
    activeProjectId
  });

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

  // Memoized sync handler to prevent unnecessary re-renders
  const handleSync = useCallback(() => {
    // This could trigger a sync modal or action
    console.log('Sync requested');
  }, []);

  // Memoized websocket status to prevent object recreation
  const websocketStatus = useMemo(() => ({
    connected,
    connecting,
    error
  }), [connected, connecting, error]);

  return (
    <Layout
      currentProjectId={activeProjectId}
      onProjectChange={setCurrentProjectId}
      websocketStatus={websocketStatus}
    >
      <div className="h-full flex flex-col">
        {/* Conditional rendering based on viewport size */}
        <div className="flex-1 p-responsive overflow-hidden">
          {isMobile ? (
            <MobileLayout 
              projectId={activeProjectId}
              onSync={handleSync}
            />
          ) : (
            <DesktopLayout 
              projectId={activeProjectId}
              onSync={handleSync}
            />
          )}
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