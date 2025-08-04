import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ProjectSidebar } from './ProjectSidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { BottomNavigation } from './BottomNavigation';
import { useBreakpoints } from '../../hooks/useBreakpoints';

interface LayoutProps {
  children: React.ReactNode;
  currentProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  websocketStatus?: {
    connected: boolean;
    connecting: boolean;
    error: string | null;
  };
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  currentProjectId, 
  onProjectChange,
  websocketStatus
}) => {
  const [currentSection, setCurrentSection] = useState('tasks');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isMobile } = useBreakpoints();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close mobile menu when section changes (for bottom nav integration)
  const handleSectionChange = (section: string) => {
    setCurrentSection(section);
    if (isMobileMenuOpen && isMobile) {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <div className="app-grid bg-gray-50">
      {/* Mobile Menu Component */}
      <MobileMenu isOpen={isMobileMenuOpen} onToggle={toggleMobileMenu} />
      
      {/* Mobile Header - Only shown on mobile */}
      <div className="app-grid-mobile-header md:hidden">
        <Header currentSection={currentSection} websocketStatus={websocketStatus} />
      </div>
      
      {/* Projects Sidebar - Grid Area */}
      <div className={`
        app-grid-project-sidebar
        md:relative md:translate-x-0 md:opacity-100
        ${
          isMobile
            ? isMobileMenuOpen 
              ? 'fixed inset-y-0 left-0 z-40 translate-x-0 opacity-100' 
              : 'fixed inset-y-0 left-0 z-40 -translate-x-full opacity-0'
            : 'opacity-100 translate-x-0'
        }
        transition-all duration-300 ease-in-out
      `}>
        <ProjectSidebar 
          currentProjectId={currentProjectId}
          onProjectChange={onProjectChange || (() => {})}
        />
      </div>
      
      {/* Main Sidebar - Grid Area */}
      <div className={`
        app-grid-main-sidebar
        md:relative md:translate-x-0 md:opacity-100
        ${
          isMobile
            ? isMobileMenuOpen 
              ? 'fixed inset-y-0 left-72 z-40 translate-x-0 opacity-100' 
              : 'fixed inset-y-0 left-72 z-40 -translate-x-full opacity-0'
            : 'opacity-100 translate-x-0'
        }
        transition-all duration-300 ease-in-out
      `}>
        <Sidebar 
          currentSection={currentSection} 
          onSectionChange={handleSectionChange} 
        />
      </div>

      {/* Desktop Header - Grid Area */}
      <div className="app-grid-header hidden md:block">
        <Header currentSection={currentSection} websocketStatus={websocketStatus} />
      </div>
      
      {/* Main Content Area - Grid Area */}
      <main className="app-grid-main-content overflow-hidden container-query">
        <div className="h-full overflow-hidden pt-16 md:pt-0 pb-bottom-nav md:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <BottomNavigation 
        currentSection={currentSection}
        onSectionChange={handleSectionChange}
      />
    </div>
  );
};