/**
 * Resource Management and Cleanup for Claude Code Bridge
 */

import { config } from './config';
import { logger, ContextualLogger } from './logger';
import { StreamManager } from './streams';
import { ClaudeSDK } from './claude-sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface ResourceMetrics {
  memory: NodeJS.MemoryUsage;
  activeConnections: number;
  activeStreams: number;
  activeQueries: number;
  uptime: number;
  requestsProcessed: number;
  errorsEncountered: number;
}

export interface FileOperationLimits {
  maxFileSize: number;
  maxDirectoryDepth: number;
  maxFilesPerScan: number;
  allowedPaths: string[];
  excludeDirectories: string[];
}

export class ResourceManager {
  private streamManager: StreamManager;
  private claudeSDK: ClaudeSDK;
  private logger: ContextualLogger;
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private fileOperationLimits: FileOperationLimits;

  constructor(streamManager: StreamManager, claudeSDK: ClaudeSDK) {
    this.streamManager = streamManager;
    this.claudeSDK = claudeSDK;
    this.logger = new ContextualLogger(logger, 'ResourceManager');
    
    const cfg = config.getConfig();
    this.fileOperationLimits = {
      maxFileSize: cfg.maxFileSize,
      maxDirectoryDepth: cfg.maxDirectoryDepth,
      maxFilesPerScan: cfg.maxFilesPerScan,
      allowedPaths: [process.cwd()], // Default to current working directory
      excludeDirectories: cfg.excludeDirectories
    };

    this.startPeriodicCleanup();
  }

  /**
   * Check if system has enough resources for new request
   */
  canAcceptNewRequest(): { allowed: boolean; reason?: string } {
    const cfg = config.getConfig();
    const memory = process.memoryUsage();
    
    // Check concurrent request limit
    const activeQueries = this.claudeSDK.getActiveQueryCount();
    if (activeQueries >= cfg.maxConcurrentRequests) {
      return {
        allowed: false,
        reason: `Too many concurrent requests (${activeQueries}/${cfg.maxConcurrentRequests})`
      };
    }

    // Check memory usage (warn if over 500MB, deny if over 1GB)
    const memoryMB = memory.heapUsed / 1024 / 1024;
    if (memoryMB > 1024) {
      return {
        allowed: false,
        reason: `Memory usage too high (${memoryMB.toFixed(0)}MB)`
      };
    }

    // Check stream count
    const activeStreams = this.streamManager.getActiveStreamCount();
    if (activeStreams >= cfg.maxConcurrentRequests * 2) {
      return {
        allowed: false,
        reason: `Too many active streams (${activeStreams})`
      };
    }

    return { allowed: true };
  }

  /**
   * Validate file operation request
   */
  validateFileOperation(filePath: string, operation: 'read' | 'write' | 'scan'): { allowed: boolean; reason?: string } {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Check if path is within allowed directories
      const isAllowed = this.fileOperationLimits.allowedPaths.some(allowedPath => {
        return resolvedPath.startsWith(path.resolve(allowedPath));
      });
      
      if (!isAllowed) {
        return {
          allowed: false,
          reason: 'File path outside allowed directories'
        };
      }

      // Check for excluded directories
      const pathParts = resolvedPath.split(path.sep);
      for (const excludeDir of this.fileOperationLimits.excludeDirectories) {
        if (pathParts.includes(excludeDir)) {
          return {
            allowed: false,
            reason: `Path contains excluded directory: ${excludeDir}`
          };
        }
      }

      // For file operations, check file size
      if (operation === 'read' || operation === 'write') {
        if (fs.existsSync(resolvedPath)) {
          const stats = fs.statSync(resolvedPath);
          if (stats.size > this.fileOperationLimits.maxFileSize) {
            return {
              allowed: false,
              reason: `File too large (${stats.size} bytes > ${this.fileOperationLimits.maxFileSize})`
            };
          }
        }
      }

      return { allowed: true };
      
    } catch (error) {
      return {
        allowed: false,
        reason: `File validation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Scan directory with resource limits
   */
  async scanDirectory(
    dirPath: string, 
    search: string = ''
  ): Promise<Array<{path: string, name: string, type: 'file' | 'directory'}>> {
    const validation = this.validateFileOperation(dirPath, 'scan');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const files: Array<{path: string, name: string, type: 'file' | 'directory'}> = [];
    const cfg = config.getConfig();
    
    const scanRecursive = (currentPath: string, relativePath: string = '', depth: number = 0) => {
      // Respect depth limit
      if (depth >= this.fileOperationLimits.maxDirectoryDepth) {
        return;
      }

      // Respect file count limit
      if (files.length >= this.fileOperationLimits.maxFilesPerScan) {
        return;
      }

      try {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          if (files.length >= this.fileOperationLimits.maxFilesPerScan) {
            break;
          }

          const itemPath = path.join(currentPath, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          
          try {
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
              // Skip excluded directories
              if (this.fileOperationLimits.excludeDirectories.includes(item) || item.startsWith('.')) {
                continue;
              }
              
              // Recursively scan subdirectories
              scanRecursive(itemPath, relativeItemPath, depth + 1);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              
              // Filter by extension and search term
              if (cfg.includeExtensions.includes(ext)) {
                if (!search || item.toLowerCase().includes(search.toLowerCase())) {
                  files.push({
                    path: relativeItemPath,
                    name: item,
                    type: 'file'
                  });
                }
              }
            }
          } catch (itemError) {
            // Skip files/directories that can't be accessed
            this.logger.warn('Skipping inaccessible item', { itemPath }, itemError);
          }
        }
      } catch (dirError) {
        this.logger.warn('Error scanning directory', { currentPath }, dirError);
      }
    };
    
    scanRecursive(dirPath);
    
    // Sort files by name
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    this.logger.info('Directory scan completed', {
      dirPath,
      filesFound: files.length,
      searchTerm: search
    });
    
    return files;
  }

  /**
   * Read file content with safety checks
   */
  async readFileContent(filePath: string, workingDirectory?: string): Promise<{
    content: string;
    path: string;
    fullPath: string;
    size: number;
    lastModified: Date;
  }> {
    const baseDir = workingDirectory || process.cwd();
    const fullPath = path.resolve(baseDir, filePath);
    
    const validation = this.validateFileOperation(fullPath, 'read');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const stats = fs.statSync(fullPath);
    
    this.logger.debug('File read successfully', {
      filePath,
      fullPath,
      size: stats.size
    });
    
    return {
      content,
      path: filePath,
      fullPath,
      size: stats.size,
      lastModified: stats.mtime
    };
  }

  /**
   * Increment request counter
   */
  incrementRequestCount(): void {
    this.requestCount++;
  }

  /**
   * Increment error counter
   */
  incrementErrorCount(): void {
    this.errorCount++;
  }

  /**
   * Get resource metrics
   */
  getMetrics(): ResourceMetrics {
    return {
      memory: process.memoryUsage(),
      activeConnections: 0, // Would need to track HTTP connections
      activeStreams: this.streamManager.getActiveStreamCount(),
      activeQueries: this.claudeSDK.getActiveQueryCount(),
      uptime: Date.now() - this.startTime,
      requestsProcessed: this.requestCount,
      errorsEncountered: this.errorCount
    };
  }

  /**
   * Check system health
   */
  getHealthStatus(): { healthy: boolean; issues: string[]; metrics: ResourceMetrics } {
    const metrics = this.getMetrics();
    const issues: string[] = [];
    
    // Check memory usage
    const memoryMB = metrics.memory.heapUsed / 1024 / 1024;
    if (memoryMB > 512) {
      issues.push(`High memory usage: ${memoryMB.toFixed(0)}MB`);
    }

    // Check error rate
    if (metrics.requestsProcessed > 0) {
      const errorRate = metrics.errorsEncountered / metrics.requestsProcessed;
      if (errorRate > 0.1) {
        issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    // Check active resources
    if (metrics.activeQueries > config.getConfig().maxConcurrentRequests * 0.8) {
      issues.push(`High query load: ${metrics.activeQueries} active queries`);
    }

    if (metrics.activeStreams > 20) {
      issues.push(`Many active streams: ${metrics.activeStreams}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics
    };
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Every minute

    this.logger.info('Periodic cleanup started');
  }

  /**
   * Perform cleanup of resources
   */
  private performCleanup(): void {
    const beforeMetrics = this.getMetrics();
    
    try {
      // Cleanup streams
      this.streamManager.cleanup();
      
      // Force garbage collection if available (for development)
      if (global.gc && process.env.NODE_ENV === 'development') {
        global.gc();
      }
      
      const afterMetrics = this.getMetrics();
      const memoryFreed = beforeMetrics.memory.heapUsed - afterMetrics.memory.heapUsed;
      
      this.logger.debug('Cleanup completed', {
        memoryFreed: memoryFreed > 0 ? `${(memoryFreed / 1024 / 1024).toFixed(1)}MB` : 'none',
        streamsActive: afterMetrics.activeStreams,
        queriesActive: afterMetrics.activeQueries
      });
      
    } catch (error) {
      this.logger.error('Cleanup failed', {}, error);
    }
  }

  /**
   * Update file operation limits
   */
  updateFileOperationLimits(limits: Partial<FileOperationLimits>): void {
    this.fileOperationLimits = { ...this.fileOperationLimits, ...limits };
    this.logger.info('File operation limits updated', limits);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Starting resource manager shutdown');

    // Stop periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all streams
    this.streamManager.closeAllStreams();

    // Cleanup Claude SDK
    await this.claudeSDK.cleanup();

    // Final cleanup
    this.performCleanup();

    this.logger.info('Resource manager shutdown completed', {
      finalMetrics: this.getMetrics()
    });
  }
}