import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [currentSection, setCurrentSection] = useState('tasks');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        currentSection={currentSection} 
        onSectionChange={setCurrentSection} 
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header currentSection={currentSection} />
        
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};