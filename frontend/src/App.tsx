import { useState, useCallback } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRouter } from './components/router';
import { queryClient } from './lib/queryClient';
import { useProjects } from './hooks/useProjects';
import { ToastProvider } from './hooks/useToast';
import { ThemeProvider } from './hooks/useTheme';

interface AppContentProps {
  activeProjectId: string;
  setCurrentProjectId: (id: string) => void;
}

function AppContent({ activeProjectId, setCurrentProjectId }: AppContentProps) {
  // Memoized sync handler to prevent unnecessary re-renders
  const handleSync = useCallback(() => {
    // This could trigger a sync modal or action
    console.log('Sync requested');
  }, []);

  return (
    <Layout
      currentProjectId={activeProjectId}
      onProjectChange={setCurrentProjectId}
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

function AppWrapper() {
  const { data: projects } = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string>('');

  // Use first available project if baton project doesn't exist
  const activeProjectId = currentProjectId || projects?.[0]?.id || '';

  return (
    <AppContent 
      activeProjectId={activeProjectId}
      setCurrentProjectId={setCurrentProjectId}
    />
  );
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AppWrapper />
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;