/**
 * Configuration Management for Claude Code Bridge
 */

export interface BridgeConfig {
  // Server settings
  port: number;
  backendUrl: string;
  idleTimeout: number;
  
  // Claude Code settings
  maxTurns: number;
  claudeCodePath: string;
  workingDirectory?: string;
  
  // Permission settings
  permissionCacheDuration: number;
  progressiveTimeoutStages: TimeoutStage[];
  maxConsecutiveErrors: number;
  
  // Performance settings
  maxConcurrentRequests: number;
  pollInterval: number;
  fetchTimeout: number;
  
  // File operations
  maxFileSize: number;
  maxDirectoryDepth: number;
  maxFilesPerScan: number;
  excludeDirectories: string[];
  includeExtensions: string[];
  
  // Security
  allowedHosts: string[];
  rateLimitRequests: number;
  rateLimitWindow: number;
}

export interface TimeoutStage {
  duration: number;
  description: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: BridgeConfig;

  private constructor() {
    this.config = this.loadDefaultConfig();
    this.loadEnvironmentOverrides();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadDefaultConfig(): BridgeConfig {
    return {
      // Server settings
      port: 8080,
      backendUrl: 'http://localhost:3001',
      idleTimeout: 180,
      
      // Claude Code settings
      maxTurns: 20,
      claudeCodePath: process.env.CLAUDE_CODE_PATH || "/home/hassan/.nvm/versions/node/v22.18.0/bin/claude",
      
      // Permission settings
      permissionCacheDuration: 30000, // 30 seconds
      progressiveTimeoutStages: [
        { duration: 30000, description: 'Initial response window' },
        { duration: 60000, description: 'Extended wait with notification' },  
        { duration: 120000, description: 'Final escalation period' }
      ],
      maxConsecutiveErrors: 10,
      
      // Performance settings
      maxConcurrentRequests: 10,
      pollInterval: 500,
      fetchTimeout: 5000,
      
      // File operations
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxDirectoryDepth: 5,
      maxFilesPerScan: 100,
      excludeDirectories: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.vscode', '.idea'],
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.yml', '.yaml', '.txt', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h'],
      
      // Security
      allowedHosts: ['localhost', '127.0.0.1'],
      rateLimitRequests: 100,
      rateLimitWindow: 60000 // 1 minute
    };
  }

  private loadEnvironmentOverrides(): void {
    // Override with environment variables
    if (process.env.BRIDGE_PORT) {
      this.config.port = parseInt(process.env.BRIDGE_PORT, 10);
    }
    
    if (process.env.BRIDGE_BACKEND_URL) {
      this.config.backendUrl = process.env.BRIDGE_BACKEND_URL;
    }
    
    if (process.env.BRIDGE_MAX_TURNS) {
      this.config.maxTurns = parseInt(process.env.BRIDGE_MAX_TURNS, 10);
    }
    
    if (process.env.BRIDGE_MAX_CONCURRENT) {
      this.config.maxConcurrentRequests = parseInt(process.env.BRIDGE_MAX_CONCURRENT, 10);
    }
    
    if (process.env.BRIDGE_WORKING_DIR) {
      this.config.workingDirectory = process.env.BRIDGE_WORKING_DIR;
    }
  }

  getConfig(): Readonly<BridgeConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<BridgeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Validation
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.port < 1 || this.config.port > 65535) {
      errors.push('Port must be between 1 and 65535');
    }

    if (this.config.maxTurns < 1) {
      errors.push('Max turns must be at least 1');
    }

    if (this.config.maxConcurrentRequests < 1) {
      errors.push('Max concurrent requests must be at least 1');
    }

    try {
      new URL(this.config.backendUrl);
    } catch {
      errors.push('Backend URL must be a valid URL');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Configuration presets
  static createDevelopmentConfig(): Partial<BridgeConfig> {
    return {
      maxConsecutiveErrors: 5,
      pollInterval: 1000, // Slower polling for development
      fetchTimeout: 10000, // Longer timeout for debugging
    };
  }

  static createProductionConfig(): Partial<BridgeConfig> {
    return {
      maxConsecutiveErrors: 3,
      pollInterval: 200, // Faster polling for production
      fetchTimeout: 3000, // Shorter timeout for production
      rateLimitRequests: 50, // More restrictive rate limiting
    };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();