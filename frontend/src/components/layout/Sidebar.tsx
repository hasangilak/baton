import React from 'react';
import { 
  LayoutDashboard, 
  Inbox, 
  Calendar, 
  FolderOpen, 
  Users, 
  Settings, 
  HelpCircle,
  Bot,
  ArrowUpDown,
  ListTodo,
  SidebarOpen,
  SidebarClose
} from 'lucide-react';
import clsx from 'clsx';

interface SidebarProps {
  currentSection: string;
  onSectionChange: (section: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const mainNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
];

const teamNavItems = [
  { id: 'tasks', label: 'Tasks', icon: FolderOpen },
  { id: 'claude-todos', label: 'Claude Todos', icon: ListTodo },
  { id: 'sync', label: 'Sync Panel', icon: ArrowUpDown },
  { id: 'docs', label: 'Docs', icon: FolderOpen },
  { id: 'meeting', label: 'Meeting', icon: Users },
];

const otherNavItems = [
  { id: 'mcp-agents', label: 'MCP Agents', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'support', label: 'Support', icon: HelpCircle },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentSection, 
  onSectionChange, 
  isCollapsed = false, 
  onToggleCollapse 
}) => {
  const renderNavItem = (item: typeof mainNavItems[0], isActive: boolean) => {
    const Icon = item.icon;
    
    return (
      <button
        key={item.id}
        onClick={() => onSectionChange(item.id)}
        className={clsx(
          'sidebar-item w-full text-left',
          isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
          isCollapsed ? 'justify-center px-2' : ''
        )}
        data-testid={`sidebar-nav-${item.id}`}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon className={clsx("w-5 h-5", isCollapsed ? "" : "mr-3")} />
        {!isCollapsed && item.label}
      </button>
    );
  };

  return (
    <aside className={clsx(
      "bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ease-in-out",
      isCollapsed ? "w-16" : "w-64 md:w-56 lg:w-64"
    )}>
      {/* Header */}
      <div className={clsx("border-b border-gray-200", isCollapsed ? "p-2" : "p-3 md:p-4")}>
        <div className={clsx("flex items-center", isCollapsed ? "justify-center" : "space-x-3")}>
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="font-semibold text-gray-900 text-sm md:text-base">Baton</h1>
              <p className="text-xs text-gray-500 hidden md:block">Task Manager</p>
            </div>
          )}
        </div>
        {/* Toggle Button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={clsx(
              "mt-3 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors",
              isCollapsed ? "w-full flex justify-center" : "ml-auto flex"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-testid="sidebar-toggle-button"
          >
            {isCollapsed ? (
              <SidebarOpen className="w-4 h-4" />
            ) : (
              <SidebarClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Main Navigation */}
        <div className={clsx(isCollapsed ? "p-1" : "p-2 md:p-3")}>
          {!isCollapsed && (
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Menu
            </h3>
          )}
          <nav className="space-y-1">
            {mainNavItems.map((item) => 
              renderNavItem(item, currentSection === item.id)
            )}
          </nav>
        </div>

        {/* Team Spaces */}
        <div className={clsx(isCollapsed ? "p-1" : "p-2 md:p-3")}>
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Team spaces
              </h3>
              <button 
                className="text-gray-400 hover:text-gray-600"
                data-testid="sidebar-add-team-space-button"
              >
                <span className="text-lg">+</span>
              </button>
            </div>
          )}
          <nav className="space-y-1">
            {teamNavItems.map((item) => 
              renderNavItem(item, currentSection === item.id)
            )}
          </nav>
        </div>

        {/* Other */}
        <div className={clsx(isCollapsed ? "p-1" : "p-2 md:p-3")}>
          {!isCollapsed && (
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Other
            </h3>
          )}
          <nav className="space-y-1">
            {otherNavItems.map((item) => 
              renderNavItem(item, currentSection === item.id)
            )}
          </nav>
        </div>
      </div>
    </aside>
  );
};