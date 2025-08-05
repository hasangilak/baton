import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DesktopLayout } from '../layout/DesktopLayout';
import { MobileLayout } from '../layout/MobileLayout';
import { ChatPage } from '../chat/ChatPage';
import { useBreakpoints } from '../../hooks/useBreakpoints';

interface AppRouterProps {
  projectId: string;
  onSync?: () => void;
}

export const AppRouter: React.FC<AppRouterProps> = ({ projectId, onSync }) => {
  const { isMobile } = useBreakpoints();

  return (
    <Routes>
      {/* Default route - redirect to tasks */}
      <Route path="/" element={<Navigate to="/tasks" replace />} />
      
      {/* Tasks/Kanban view */}
      <Route 
        path="/tasks" 
        element={
          isMobile ? (
            <MobileLayout projectId={projectId} onSync={onSync} />
          ) : (
            <DesktopLayout projectId={projectId} onSync={onSync} />
          )
        } 
      />
      
      {/* Chat page */}
      <Route path="/chat" element={<ChatPage />} />
      
      {/* Other sections - for now redirect to tasks */}
      <Route path="/dashboard" element={<Navigate to="/tasks" replace />} />
      <Route path="/inbox" element={<Navigate to="/tasks" replace />} />
      <Route path="/calendar" element={<Navigate to="/tasks" replace />} />
      <Route path="/claude-todos" element={<Navigate to="/tasks" replace />} />
      <Route path="/sync" element={<Navigate to="/tasks" replace />} />
      <Route path="/docs" element={<Navigate to="/tasks" replace />} />
      <Route path="/meeting" element={<Navigate to="/tasks" replace />} />
      <Route path="/mcp-agents" element={<Navigate to="/tasks" replace />} />
      <Route path="/settings" element={<Navigate to="/tasks" replace />} />
      <Route path="/support" element={<Navigate to="/tasks" replace />} />
      
      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/tasks" replace />} />
    </Routes>
  );
};