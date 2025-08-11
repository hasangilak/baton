import { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRouter } from './components/router';
import { queryClient } from './lib/queryClient';
import { useProjects } from './hooks/useProjects';
import { useUnifiedWebSocket } from './hooks/useUnifiedWebSocket';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';

function AppContent() {
  const { data: projects } = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string>('cmdxumi04000k4yhw92fvsqqa');

  // Use first available project if baton project doesn't exist
  const activeProjectId = currentProjectId || projects?.[0]?.id || 'cmdxumi04000k4yhw92fvsqqa';

  const { connected, connecting, error, joinProject, leaveProject } = useUnifiedWebSocket({
    activeProjectId,
    namespace: 'both' // App-level hook needs both general and chat events
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
        {/* Router content */}
        <div className="flex-1 p-responsive overflow-hidden">
          <AppRouter 
            projectId={activeProjectId}
            onSync={handleSync}
          />
        </div>
      </div>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;