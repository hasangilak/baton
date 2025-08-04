import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ProjectSidebar } from './ProjectSidebar';
import { Header } from './Header';

interface LayoutProps {
  children: React.ReactNode;
  currentProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  websocketStatus?: {
    connected: boolean;
    connecting: boolean;
    error: string | null;
  };
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  currentProjectId, 
  onProjectChange,
  websocketStatus
}) => {
  const [currentSection, setCurrentSection] = useState('tasks');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Projects Sidebar (Black) */}
      <ProjectSidebar 
        currentProjectId={currentProjectId}
        onProjectChange={onProjectChange || (() => {})}
      />
      
      {/* Main Sidebar (White) */}
      <Sidebar 
        currentSection={currentSection} 
        onSectionChange={setCurrentSection} 
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header currentSection={currentSection} websocketStatus={websocketStatus} />
        
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};