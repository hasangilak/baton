/**
 * Permissions Hook - Based on Claude Code WebUI Architecture
 * 
 * Manages tool permissions for Claude Code integration,
 * following the comprehensive implementation guide patterns.
 */

import { useState, useCallback } from 'react';
import type { PermissionRequest } from '../../types/streaming';

export function usePermissions() {
  const [allowedTools, setAllowedTools] = useState<string[]>([
    // Default safe tools
    'Read',
    'LS', 
    'Glob',
    'Grep',
    'WebFetch',
  ]);
  
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [showPermissionRequest, setShowPermissionRequest] = useState(false);

  // Allow tool temporarily (for current session only)
  const allowToolTemporary = useCallback(
    (pattern: string) => {
      return [...allowedTools, pattern];
    },
    [allowedTools],
  );

  // Allow tool permanently (add to persistent allowed tools)
  const allowToolPermanent = useCallback(
    (pattern: string) => {
      const updatedAllowedTools = [...allowedTools, pattern];
      setAllowedTools(updatedAllowedTools);
      
      // TODO: Save to localStorage or backend for persistence
      try {
        localStorage.setItem('baton-allowed-tools', JSON.stringify(updatedAllowedTools));
      } catch (error) {
        console.warn('Failed to save allowed tools to localStorage:', error);
      }
      
      return updatedAllowedTools;
    },
    [allowedTools],
  );

  // Remove tool from allowed list
  const denyTool = useCallback(
    (pattern: string) => {
      const updatedAllowedTools = allowedTools.filter(tool => tool !== pattern);
      setAllowedTools(updatedAllowedTools);
      
      // Update localStorage
      try {
        localStorage.setItem('baton-allowed-tools', JSON.stringify(updatedAllowedTools));
      } catch (error) {
        console.warn('Failed to save allowed tools to localStorage:', error);
      }
      
      return updatedAllowedTools;
    },
    [allowedTools],
  );

  // Check if a tool is allowed
  const isToolAllowed = useCallback(
    (toolName: string) => {
      return allowedTools.some(pattern => {
        if (pattern.includes('*')) {
          // Simple wildcard matching
          const regexPattern = pattern.replace(/\*/g, '.*');
          return new RegExp(regexPattern).test(toolName);
        }
        return toolName === pattern;
      });
    },
    [allowedTools],
  );

  // Handle permission request from streaming
  const requestPermission = useCallback(
    async (patterns: string[]): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        const request: PermissionRequest = {
          patterns,
          onAllow: async (allowedPatterns: string[]) => {
            const tempAllowedTools = allowToolTemporary(allowedPatterns[0] || '');
            setPermissionRequest(null);
            setShowPermissionRequest(false);
            resolve(tempAllowedTools);
          },
          onAllowPermanent: async (allowedPatterns: string[]) => {
            const permAllowedTools = allowToolPermanent(allowedPatterns[0] || '');
            setPermissionRequest(null);
            setShowPermissionRequest(false);
            resolve(permAllowedTools);
          },
          onDeny: async () => {
            setPermissionRequest(null);
            setShowPermissionRequest(false);
            reject(new Error('Permission denied by user'));
          },
        };

        setPermissionRequest(request);
        setShowPermissionRequest(true);
      });
    },
    [allowToolTemporary, allowToolPermanent],
  );

  // Load permissions from localStorage on initialization
  const loadStoredPermissions = useCallback(() => {
    try {
      const stored = localStorage.getItem('baton-allowed-tools');
      if (stored) {
        const parsedTools = JSON.parse(stored);
        if (Array.isArray(parsedTools)) {
          setAllowedTools(parsedTools);
        }
      }
    } catch (error) {
      console.warn('Failed to load allowed tools from localStorage:', error);
    }
  }, []);

  // Clear all permissions
  const clearPermissions = useCallback(() => {
    const defaultTools = ['Read', 'LS', 'Glob', 'Grep', 'WebFetch'];
    setAllowedTools(defaultTools);
    
    try {
      localStorage.setItem('baton-allowed-tools', JSON.stringify(defaultTools));
    } catch (error) {
      console.warn('Failed to save default tools to localStorage:', error);
    }
  }, []);

  // Get permission summary
  const getPermissionSummary = useCallback(() => {
    return {
      totalAllowed: allowedTools.length,
      allowedTools: [...allowedTools],
      hasActiveRequest: showPermissionRequest,
      requestPatterns: permissionRequest?.patterns || [],
    };
  }, [allowedTools, showPermissionRequest, permissionRequest]);

  return {
    // State
    allowedTools,
    permissionRequest,
    showPermissionRequest,
    
    // Actions
    allowToolTemporary,
    allowToolPermanent,
    denyTool,
    requestPermission,
    
    // Utilities
    isToolAllowed,
    loadStoredPermissions,
    clearPermissions,
    getPermissionSummary,
    
    // Setters (for external control)
    setAllowedTools,
    setPermissionRequest,
    setShowPermissionRequest,
  };
}