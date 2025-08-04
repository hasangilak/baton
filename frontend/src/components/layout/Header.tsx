import React from 'react';
import { Search, Bell, ChevronLeft, Plus, MoreHorizontal, Wifi, WifiOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface HeaderProps {
  currentSection: string;
  websocketStatus?: {
    connected: boolean;
    connecting: boolean;
    error: string | null;
  };
}

const sectionTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  inbox: 'Inbox',
  calendar: 'Calendar',
  tasks: 'Tasks',
  docs: 'Docs',
  meeting: 'Meeting',
  'mcp-agents': 'MCP Agents',
  settings: 'Settings',
  support: 'Support',
};

export const Header: React.FC<HeaderProps> = ({ currentSection, websocketStatus }) => {
  const title = sectionTitles[currentSection] || 'Baton';

  const renderConnectionStatus = () => {
    if (!websocketStatus) return null;

    const { connected, connecting, error } = websocketStatus;

    if (connecting) {
      return (
        <div className="flex items-center space-x-2 px-2 py-1 bg-yellow-50 text-yellow-700 rounded-md text-xs" title="Connecting to real-time updates...">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Connecting</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center space-x-2 px-2 py-1 bg-red-50 text-red-700 rounded-md text-xs" title={`Connection error: ${error}`}>
          <WifiOff className="w-3 h-3" />
          <span>Offline</span>
        </div>
      );
    }

    if (connected) {
      return (
        <div className="flex items-center space-x-2 px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs" title="Connected to real-time updates">
          <Wifi className="w-3 h-3" />
          <span>Live</span>
        </div>
      );
    }

    return null;
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Breadcrumb and Title */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <button className="hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Team spaces</span>
            <span>/</span>
            <span className="text-gray-900 font-medium">{title}</span>
          </div>
        </div>

        {/* Center - Title and Description */}
        <div className="flex-1 max-w-2xl mx-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">{title}</h1>
          {currentSection === 'tasks' && (
            <p className="text-sm text-gray-500">
              Manage your tasks and collaborate with AI agents
            </p>
          )}
        </div>

        {/* Right side - Actions and User */}
        <div className="flex items-center space-x-4">
          {/* Connection Status */}
          {renderConnectionStatus()}

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Action Buttons */}
          {currentSection === 'tasks' && (
            <button className="btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </button>
          )}

          {/* Notifications */}
          <button className="relative p-2 text-gray-400 hover:text-gray-600">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </button>

          {/* User Avatars */}
          <div className="flex items-center -space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full border-2 border-white flex items-center justify-center">
              <span className="text-white text-xs font-medium">DD</span>
            </div>
            <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-white flex items-center justify-center">
              <span className="text-white text-xs font-medium">JD</span>
            </div>
            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full border-2 border-white flex items-center justify-center">
              <span className="text-white text-xs font-medium">SK</span>
            </div>
            <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-pink-600 rounded-full border-2 border-white flex items-center justify-center">
              <span className="text-white text-xs font-medium">AL</span>
            </div>
            <button className="w-8 h-8 bg-gray-100 border-2 border-white rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* More Options */}
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};