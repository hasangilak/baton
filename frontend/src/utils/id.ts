/**
 * ID Generation Utilities - Based on Claude Code WebUI Architecture
 * 
 * Generates unique IDs for requests, messages, and other entities,
 * following the comprehensive implementation guide patterns.
 */

/**
 * Generate a unique ID using timestamp and random string
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substr(2, 9);
  return `${timestamp}_${randomStr}`;
}

/**
 * Generate a request ID specifically for streaming requests
 */
export function generateRequestId(): string {
  return `req_${generateId()}`;
}

/**
 * Generate a message ID for chat messages
 */
export function generateMessageId(): string {
  return `msg_${generateId()}`;
}

/**
 * Generate a session ID for conversation sessions
 */
export function generateSessionId(): string {
  return `session_${generateId()}`;
}

/**
 * Validate if a string looks like a valid ID
 */
export function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // Basic validation: should contain alphanumeric characters and underscores
  const idPattern = /^[a-zA-Z0-9_]+$/;
  return idPattern.test(id) && id.length >= 5;
}

/**
 * Extract timestamp from ID if it was generated with generateId
 */
export function extractTimestampFromId(id: string): number | null {
  try {
    const parts = id.split('_');
    if (parts.length >= 2) {
      // Try to parse the first part as a base36 timestamp
      const timestampStr = parts[1] || parts[0];
      const timestamp = parseInt(timestampStr || '', 36);
      
      // Validate that it's a reasonable timestamp
      if (timestamp > 1000000000000 && timestamp < Date.now() + 86400000) {
        return timestamp;
      }
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  return null;
}