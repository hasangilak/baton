import React, { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Plus, 
  MoreHorizontal,
  Settings,
  Archive,
  Star,
  Users,
  Search,
  Edit,
  Trash2,
  SidebarOpen,
  SidebarClose
} from 'lucide-react';
import clsx from 'clsx';
import { useProjects, useUpdateProject, useDeleteProject } from '../../hooks/useProjects';
import { CreateProjectModal } from '../projects/CreateProjectModal';
import { EditProjectModal } from '../projects/EditProjectModal';
import { useToast } from '../../hooks/useToast';
import type { Project } from '../../types';

type FilterType = 'all' | 'starred' | 'shared' | 'archived';

interface ProjectSidebarProps {
  currentProjectId: string | undefined;
  onProjectChange: (projectId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ 
  currentProjectId, 
  onProjectChange,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { data: projects, isLoading } = useProjects();
  const updateProjectMutation = useUpdateProject();
  const toast = useToast();
  const deleteProjectMutation = useDeleteProject();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [currentFilter, setCurrentFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenuProject, setContextMenuProject] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenuProject) {
        setContextMenuProject(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenuProject]);

  const handleProjectClick = (project: Project) => {
    onProjectChange(project.id);
  };

  const handleToggleStar = async (project: Project) => {
    try {
      await updateProjectMutation.mutateAsync({
        id: project.id,
        data: { isStarred: !project.isStarred }
      });
      toast.success(
        project.isStarred ? 'Removed from starred' : 'Added to starred',
        `Project "${project.name}" has been ${project.isStarred ? 'removed from' : 'added to'} your starred projects.`
      );
    } catch (error) {
      toast.error('Failed to update project', 'Please try again.');
      console.error('Failed to toggle star:', error);
    }
  };

  const handleArchiveProject = async (project: Project) => {
    try {
      const isArchiving = project.status !== 'archived';
      await updateProjectMutation.mutateAsync({
        id: project.id,
        data: { status: isArchiving ? 'archived' : 'active' }
      });
      toast.success(
        isArchiving ? 'Project archived' : 'Project restored',
        `Project "${project.name}" has been ${isArchiving ? 'archived' : 'restored'}.`
      );
    } catch (error) {
      toast.error('Failed to update project', 'Please try again.');
      console.error('Failed to archive project:', error);
    }
  };

  // Filter and search projects
  const filteredProjects = projects?.filter((project) => {
    // Search filter
    if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Status filter
    switch (currentFilter) {
      case 'starred':
        return project.isStarred;
      case 'shared':
        // TODO: Add team/sharing functionality
        return false; // No shared projects yet
      case 'archived':
        return project.status === 'archived';
      case 'all':
      default:
        return project.status !== 'archived'; // Show active and completed projects by default
    }
  }) || [];

  const renderProject = (project: Project) => {
    const isActive = currentProjectId === project.id;
    const taskCount = project._count?.tasks ?? 0;

    if (isCollapsed) {
      return (
        <div
          key={project.id}
          onClick={() => handleProjectClick(project)}
          className={clsx(
            'flex items-center justify-center p-2 rounded-lg cursor-pointer transition-all duration-200',
            isActive 
              ? 'bg-gray-800 text-white' 
              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
          )}
          title={`${project.name}${taskCount ? ` (${taskCount} tasks)` : ''}`}
          data-testid={`project-sidebar-project-${project.id}`}
        >
          <div 
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: project.color }}
          />
        </div>
      );
    }

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
        data-testid={`project-sidebar-project-${project.id}`}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium truncate">{project.name}</p>
              {project.isStarred && (
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
              )}
              {project.status === 'archived' && (
                <Archive className="w-3 h-3 text-gray-500 flex-shrink-0" />
              )}
            </div>
            {project.description && (
              <p className="text-xs opacity-60 truncate">{project.description}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-medium bg-gray-700 px-2 py-1 rounded">
            {taskCount}
          </span>
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setContextMenuProject(contextMenuProject === project.id ? null : project.id);
              }}
              className="p-1 hover:bg-gray-700 rounded"
              data-testid={`project-sidebar-project-menu-${project.id}`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            
            {/* Context Menu */}
            {contextMenuProject === project.id && (
              <div className="absolute right-0 top-8 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-40">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProject(project);
                      setContextMenuProject(null);
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                    data-testid={`project-sidebar-edit-${project.id}`}
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Project</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStar(project);
                      setContextMenuProject(null);
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                    data-testid={`project-sidebar-star-${project.id}`}
                  >
                    <Star className={clsx("w-4 h-4", project.isStarred && "fill-yellow-400 text-yellow-400")} />
                    <span>{project.isStarred ? 'Remove from Starred' : 'Add to Starred'}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArchiveProject(project);
                      setContextMenuProject(null);
                    }}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                    data-testid={`project-sidebar-archive-${project.id}`}
                  >
                    <Archive className="w-4 h-4" />
                    <span>{project.status === 'archived' ? 'Unarchive' : 'Archive'}</span>
                  </button>
                  <div className="border-t border-gray-700 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenuProject(null);
                      const confirmed = window.confirm(`Delete project "${project.name}"? This cannot be undone.`);
                      if (!confirmed) return;
                      deleteProjectMutation.mutate(project.id, {
                        onSuccess: () => {
                          toast.success('Project deleted', `"${project.name}" was removed.`);
                        },
                        onError: () => {
                          toast.error('Delete failed', 'Could not delete project.');
                        }
                      });
                    }}
                    disabled={deleteProjectMutation.isPending}
                    className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid={`project-sidebar-delete-${project.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{deleteProjectMutation.isPending ? 'Deleting…' : 'Delete Project'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className={clsx(
      "bg-gray-900 border-r border-gray-800 flex flex-col h-full transition-all duration-300 ease-in-out",
      isCollapsed ? "w-16" : "w-72 md:w-64 lg:w-72"
    )}>
      {/* Header */}
      <div className={clsx("border-b border-gray-800", isCollapsed ? "p-2" : "p-3 md:p-4")}>
        <div className={clsx("flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
          {!isCollapsed && (
            <div className="flex items-center space-x-3">
              <FolderOpen className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-white">Projects</h2>
            </div>
          )}
          {isCollapsed && (
            <FolderOpen className="w-5 h-5 text-gray-400" />
          )}
          {!isCollapsed && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Create new project"
              data-testid="project-sidebar-create-button"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Toggle Button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={clsx(
              "mt-3 p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors",
              isCollapsed ? "w-full flex justify-center" : "ml-auto flex"
            )}
            title={isCollapsed ? "Expand projects sidebar" : "Collapse projects sidebar"}
            data-testid="project-sidebar-toggle-button"
          >
            {isCollapsed ? (
              <SidebarOpen className="w-4 h-4" />
            ) : (
              <SidebarClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Search */}
      {!isCollapsed && (
        <div className="p-3 md:p-4 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              data-testid="project-sidebar-search-input"
            />
          </div>
        </div>
      )}

      {/* Filters */}
      {!isCollapsed && (
        <div className="p-3 md:p-4 border-b border-gray-800">
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setCurrentFilter('all')}
              className={clsx(
                "flex items-center space-x-2 px-3 py-1.5 text-xs rounded-md transition-colors",
                currentFilter === 'all'
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
              data-testid="project-sidebar-filter-all"
            >
              <FolderOpen className="w-3 h-3" />
              <span>All</span>
            </button>
            <button 
              onClick={() => setCurrentFilter('starred')}
              className={clsx(
                "flex items-center space-x-2 px-3 py-1.5 text-xs rounded-md transition-colors",
                currentFilter === 'starred'
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
              data-testid="project-sidebar-filter-starred"
            >
              <Star className="w-3 h-3" />
              <span>Starred</span>
            </button>
            <button 
              onClick={() => setCurrentFilter('shared')}
              className={clsx(
                "flex items-center space-x-2 px-3 py-1.5 text-xs rounded-md transition-colors",
                currentFilter === 'shared'
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
              data-testid="project-sidebar-filter-shared"
            >
              <Users className="w-3 h-3" />
              <span>Shared</span>
            </button>
            <button 
              onClick={() => setCurrentFilter('archived')}
              className={clsx(
                "flex items-center space-x-2 px-3 py-1.5 text-xs rounded-md transition-colors",
                currentFilter === 'archived'
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
              data-testid="project-sidebar-filter-archived"
            >
              <Archive className="w-3 h-3" />
              <span>Archived</span>
            </button>
          </div>
        </div>
      )}

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        <div className={clsx(isCollapsed ? "p-1" : "p-3 md:p-4")}>
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
          ) : filteredProjects.length > 0 ? (
            <div className="space-y-2">
              {filteredProjects.map(renderProject)}
            </div>
          ) : searchQuery || currentFilter !== 'all' ? (
            <div className="text-center py-8">
              <FolderOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-sm mb-2">
                {searchQuery 
                  ? `No projects found for "${searchQuery}"`
                  : `No ${currentFilter} projects`
                }
              </p>
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setCurrentFilter('all');
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                data-testid="project-sidebar-clear-filters"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-sm mb-2">No projects yet</p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                data-testid="project-sidebar-create-first-project"
              >
                Create your first project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-3 md:p-4 border-t border-gray-800">
          <button 
            onClick={() => {
              const currentProject = projects?.find(p => p.id === currentProjectId);
              if (currentProject) {
                setEditingProject(currentProject);
              }
            }}
            disabled={!currentProjectId}
            className="flex items-center space-x-3 w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="project-sidebar-settings-button"
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm">Project Settings</span>
          </button>
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(projectId) => {
          onProjectChange(projectId);
          setShowCreateModal(false);
        }}
      />

      {/* Edit Project Modal */}
      <EditProjectModal
        project={editingProject}
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        onDelete={() => {
          // If the deleted project was the current one, clear selection
          if (editingProject?.id === currentProjectId) {
            // Switch to first available project or none
            const remainingProjects = projects?.filter(p => p.id !== editingProject?.id);
            if (remainingProjects && remainingProjects.length > 0) {
              onProjectChange(remainingProjects[0]!.id);
            }
          }
        }}
      />
    </aside>
  );
};