import React, { useState } from 'react';
import { 
  FolderOpen, 
  Plus, 
  MoreHorizontal,
  Settings,
  Archive,
  Star,
  Users
} from 'lucide-react';
import clsx from 'clsx';
import { useProjects } from '../../hooks/useProjects';
import { CreateProjectModal } from '../projects/CreateProjectModal';
import type { Project } from '../../types';

interface ProjectSidebarProps {
  currentProjectId: string | undefined;
  onProjectChange: (projectId: string) => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ 
  currentProjectId, 
  onProjectChange 
}) => {
  const { data: projects, isLoading } = useProjects();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleProjectClick = (project: Project) => {
    onProjectChange(project.id);
  };

  const renderProject = (project: Project) => {
    const isActive = currentProjectId === project.id;
    const taskCount = project._count?.tasks ?? 0;

    return (
      <div
        key={project.id}
        onClick={() => handleProjectClick(project)}
        className={clsx(
          'group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200',
          isActive 
            ? 'bg-gray-800 text-white' 
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        )}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{project.name}</p>
            {project.description && (
              <p className="text-xs opacity-60 truncate">{project.description}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-medium bg-gray-700 px-2 py-1 rounded">
            {taskCount}
          </span>
          <button className="p-1 hover:bg-gray-700 rounded">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FolderOpen className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Projects</h2>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Create new project"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex space-x-2">
          <button className="flex items-center space-x-2 px-3 py-1.5 text-xs bg-gray-800 text-white rounded-md">
            <Star className="w-3 h-3" />
            <span>Starred</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            <Users className="w-3 h-3" />
            <span>Shared</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            <Archive className="w-3 h-3" />
            <span>Archived</span>
          </button>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center space-x-3 p-3">
                    <div className="w-3 h-3 bg-gray-700 rounded-full" />
                    <div className="flex-1">
                      <div className="w-24 h-4 bg-gray-700 rounded mb-1" />
                      <div className="w-16 h-3 bg-gray-800 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map(renderProject)}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-sm mb-2">No projects yet</p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Create your first project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <button className="flex items-center space-x-3 w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          <Settings className="w-4 h-4" />
          <span className="text-sm">Project Settings</span>
        </button>
      </div>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(projectId) => {
          onProjectChange(projectId);
          setShowCreateModal(false);
        }}
      />
    </aside>
  );
};