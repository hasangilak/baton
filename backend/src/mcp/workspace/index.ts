import { PrismaClient } from '@prisma/client';

export interface WorkspaceProjectMapping {
  workspacePath: string;
  projectId: string;
  projectName: string;
  lastAccessed: Date;
}

export class BatonWorkspaceManager {
  private currentProjectId: string | null = null;
  
  constructor(private prisma: PrismaClient) {}

  /**
   * This method is deprecated as the backend runs in Docker and cannot access host filesystem.
   * Project context should be provided explicitly via MCP tool parameters.
   */
  async detectCurrentProject(): Promise<string | null> {
    console.warn('⚠️  detectCurrentProject() is deprecated. Backend runs in Docker and cannot access host filesystem. Please provide projectId explicitly.');
    return null;
  }

  /**
   * This method is deprecated as the backend runs in Docker and cannot write to host filesystem.
   */
  async createProjectConfig(): Promise<void> {
    console.warn('⚠️  createProjectConfig() is deprecated. Backend runs in Docker and cannot write to host filesystem.');
  }

  /**
   * Associate current workspace with a Baton project (database mapping only)
   */
  async associateWorkspaceWithProject(projectId: string, workspacePath?: string): Promise<boolean> {
    const currentPath = workspacePath || process.cwd();
    
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Create workspace mapping in database only (no filesystem operations)
    try {
      await this.prisma.workspaceMapping.upsert({
        where: { workspacePath: currentPath },
        update: {
          projectId,
          lastAccessed: new Date()
        },
        create: {
          workspacePath: currentPath,
          projectId,
          lastAccessed: new Date()
        }
      });
      console.log(`✅ Associated workspace ${currentPath} with project ${project.name} (database only)`);
      return true;
    } catch (error) {
      console.warn('Could not create workspace mapping:', error);
      return false;
    }
  }

  /**
   * List all workspace mappings
   */
  async listWorkspaceMappings(): Promise<WorkspaceProjectMapping[]> {
    try {
      const mappings = await this.prisma.workspaceMapping.findMany({
        include: {
          project: {
            select: { name: true }
          }
        },
        orderBy: { lastAccessed: 'desc' }
      });

      return mappings.map(mapping => ({
        workspacePath: mapping.workspacePath,
        projectId: mapping.projectId,
        projectName: mapping.project.name,
        lastAccessed: mapping.lastAccessed
      }));
    } catch (error) {
      console.warn('Could not fetch workspace mappings:', error);
      return [];
    }
  }

  /**
   * Set current project context (for WebSocket connections with project parameters)
   */
  setCurrentProject(projectId: string): void {
    this.currentProjectId = projectId;
    console.log(`🎯 Set current project context: ${projectId}`);
  }

  /**
   * Get current project ID
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /**
   * Get context-aware resource URIs based on current project
   */
  getContextualResourceURIs(projectId: string): string[] {
    return [
      `baton://workspace/current`,
      `baton://projects/${projectId}`,
      `baton://projects/${projectId}/tasks`,
      `baton://projects/${projectId}/tasks/kanban`,
      `baton://workspace/project/tasks/pending`,
      `baton://workspace/project/analytics`
    ];
  }
}