import React from 'react';
import { Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { DesktopLayout } from '../layout/DesktopLayout';
import { MobileLayout } from '../layout/MobileLayout';
import { ChatPageDesktop } from '../chat/layouts/ChatPageDesktop';
import { ChatPageMobile } from '../chat/layouts/ChatPageMobile';
import { ChatProvider } from '../../contexts/ChatContext';
import { useBreakpoints } from '../../hooks/useBreakpoints';
import type { Socket } from 'socket.io-client';

interface AppRouterProps {
  projectId: string;
  onSync?: () => void;
  socket: Socket | null;
  connected: boolean;
}

// Component to handle project-scoped chat routing
const ProjectScopedChat: React.FC<{ 
  isMobile: boolean; 
  socket: Socket | null; 
  connected: boolean; 
}> = ({ isMobile, socket, connected }) => {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  return (
    <ChatProvider 
      projectId={urlProjectId || ''} 
      initialSessionId={sessionId}
      socket={socket}
      connected={connected}
    >
      {isMobile ? (
        <ChatPageMobile />
      ) : (
        <ChatPageDesktop />
      )}
    </ChatProvider>
  );
};

export const AppRouter: React.FC<AppRouterProps> = ({ projectId, onSync, socket, connected }) => {
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
      
      {/* Chat routes */}
      {/* Redirect bare /chat to project-scoped chat */}
      <Route 
        path="/chat" 
        element={<Navigate to={`/chat/${projectId}`} replace />} 
      />
      
      {/* Project-scoped chat route */}
      <Route 
        path="/chat/:projectId" 
        element={<ProjectScopedChat isMobile={isMobile} socket={socket} connected={connected} />} 
      />
      
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