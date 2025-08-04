import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Layout } from './components/layout/Layout';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { queryClient } from './lib/queryClient';

// For now, we'll use a demo project ID
const DEMO_PROJECT_ID = 'demo-project-1';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <KanbanBoard projectId={DEMO_PROJECT_ID} />
      </Layout>
      {/* React Query DevTools - only shows in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;