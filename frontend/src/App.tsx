import { useState, useMemo, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRouter } from './components/router';
import { queryClient } from './lib/queryClient';
import { useProjects } from './hooks/useProjects';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';

interface AppContentProps {
  activeProjectId: string;
  setCurrentProjectId: (id: string) => void;
}

function AppContent({ activeProjectId, setCurrentProjectId }: AppContentProps) {

  // Use the new SocketContext
  const { isConnected, isConnecting, error } = useSocket();

  // Memoized sync handler to prevent unnecessary re-renders
  const handleSync = useCallback(() => {
    // This could trigger a sync modal or action
    console.log('Sync requested');
  }, []);

  // Memoized websocket status to prevent object recreation
  const websocketStatus = useMemo(() => ({
    connected: isConnected,
    connecting: isConnecting,
    error
  }), [isConnected, isConnecting, error]);

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
  const { data: projects } = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string>('');

  // Use first available project if baton project doesn't exist
  const activeProjectId = currentProjectId || projects?.[0]?.id || '';

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <SocketProvider autoConnect={true} activeProjectId={activeProjectId}>
              <AppContent 
                activeProjectId={activeProjectId}
                setCurrentProjectId={setCurrentProjectId}
              />
            </SocketProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;