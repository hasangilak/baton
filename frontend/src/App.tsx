import React from 'react';
import { Layout } from './components/layout/Layout';
import { KanbanBoard } from './components/kanban/KanbanBoard';

// For now, we'll use a demo project ID
const DEMO_PROJECT_ID = 'demo-project-1';

function App() {
  return (
    <Layout>
      <KanbanBoard projectId={DEMO_PROJECT_ID} />
    </Layout>
  );
}

export default App;