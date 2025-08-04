import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

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
   * Detect the current project based on workspace context
   */
  async detectCurrentProject(workspacePath?: string): Promise<string | null> {
    const currentPath = workspacePath || process.cwd();
    
    // Method 1: Check for .baton-project file
    const batonProjectFile = path.join(currentPath, '.baton-project');
    if (fs.existsSync(batonProjectFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(batonProjectFile, 'utf8'));
        if (config.projectId) {
          await this.updateLastAccessed(config.projectId, currentPath);
          return config.projectId;
        }
      } catch (error) {
        console.warn('Failed to read .baton-project file:', error);
      }
    }

    // Method 2: Check for package.json with baton config
    const packageJsonFile = path.join(currentPath, 'package.json');
    if (fs.existsSync(packageJsonFile)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
        if (packageJson.baton?.projectId) {
          await this.updateLastAccessed(packageJson.baton.projectId, currentPath);
          return packageJson.baton.projectId;
        }
      } catch (error) {
        console.warn('Failed to read package.json baton config:', error);
      }
    }

    // Method 3: Auto-match by workspace path or project name
    const folderName = path.basename(currentPath);
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [
          { name: { contains: folderName, mode: 'insensitive' } },
          { description: { contains: folderName, mode: 'insensitive' } }
        ]
      }
    });

    if (project) {
      // Auto-create .baton-project file for future use
      await this.createProjectConfig(currentPath, project.id);
      return project.id;
    }

    // Method 4: Check workspace mappings from database
    const mapping = await this.getWorkspaceMapping(currentPath);
    if (mapping) {
      await this.updateLastAccessed(mapping.projectId, currentPath);
      return mapping.projectId;
    }

    return null;
  }

  /**
   * Create or update project configuration file
   */
  async createProjectConfig(workspacePath: string, projectId: string): Promise<void> {
    const configFile = path.join(workspacePath, '.baton-project');
    const config = {
      projectId,
      workspacePath,
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    };

    try {
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
      console.log(`📁 Created .baton-project config for project ${projectId}`);
    } catch (error) {
      console.warn('Failed to create .baton-project file:', error);
    }
  }

  /**
   * Associate current workspace with a Baton project
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

    // Create workspace mapping in database
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

    // Create .baton-project file
    await this.createProjectConfig(currentPath, projectId);

    console.log(`✅ Associated workspace ${currentPath} with project ${project.name}`);
    return true;
  }

  /**
   * Get workspace mapping from database
   */
  private async getWorkspaceMapping(workspacePath: string): Promise<WorkspaceProjectMapping | null> {
    try {
      const mapping = await this.prisma.workspaceMapping.findUnique({
        where: { workspacePath },
        include: {
          project: {
            select: { name: true }
          }
        }
      });

      if (mapping) {
        return {
          workspacePath: mapping.workspacePath,
          projectId: mapping.projectId,
          projectName: mapping.project.name,
          lastAccessed: mapping.lastAccessed
        };
      }
    } catch (error) {
      // Table might not exist yet
      console.warn('Workspace mapping table not found, skipping database lookup');
    }

    return null;
  }

  /**
   * Update last accessed timestamp
   */
  private async updateLastAccessed(projectId: string, workspacePath: string): Promise<void> {
    try {
      await this.prisma.workspaceMapping.upsert({
        where: { workspacePath },
        update: { lastAccessed: new Date() },
        create: {
          workspacePath,
          projectId,
          lastAccessed: new Date()
        }
      });
    } catch (error) {
      // Ignore errors if table doesn't exist
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