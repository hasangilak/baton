import React from 'react';
import { 
  LayoutDashboard, 
  Inbox, 
  FolderOpen, 
  Bot,
  Settings
} from 'lucide-react';
import clsx from 'clsx';

interface BottomNavigationProps {
  currentSection: string;
  onSectionChange: (section: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: FolderOpen },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'mcp-agents', label: 'AI', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const BottomNavigation: React.FC<BottomNavigationProps> = React.memo(({ 
  currentSection, 
  onSectionChange 
}) => {
  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-5 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentSection === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={clsx(
                'flex flex-col items-center justify-center space-y-1 text-xs font-medium transition-colors duration-200',
                'touch-target min-h-[64px]',
                isActive 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900 active:bg-gray-50'
              )}
              aria-label={`Navigate to ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`bottom-nav-${item.id}`}
            >
              <Icon 
                className={clsx(
                  'w-5 h-5 transition-transform duration-200',
                  isActive && 'scale-110'
                )} 
              />
              <span className={clsx(
                'transition-all duration-200',
                isActive ? 'font-semibold' : 'font-normal'
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      
      {/* Safe area padding for devices with home indicator */}
      <div className="h-safe-area-inset-bottom bg-white" />
    </nav>
  );
});

BottomNavigation.displayName = 'BottomNavigation';