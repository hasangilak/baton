/**
 * Legacy ChatContext Compatibility Hook
 * 
 * Provides backward compatibility for components still using useChatContext
 * This hook bridges to the new Zustand store architecture
 */

import { useParams } from 'react-router-dom';
import { useChatIntegration } from './useChatIntegration';

/**
 * @deprecated Use useChatIntegration directly or specific chat store hooks
 * This hook is provided for backward compatibility during migration
 */
export const useChatContext = () => {
  const { projectId } = useParams<{ projectId: string }>();
  
  if (!projectId) {
    console.warn('useChatContext: No projectId found in URL params');
  }
  
  return useChatIntegration(projectId || '');
};