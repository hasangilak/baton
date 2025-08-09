/**
 * Utility functions for parsing @ file references and including file content
 */

interface FileReference {
  originalText: string;
  filePath: string;
  fileName: string;
}

interface FileContent {
  path: string;
  content: string;
  size: number;
  error?: string;
}

/**
 * Parse @ file references from message content
 * Matches patterns like @filename.txt or @folder/file.js
 */
export function parseFileReferences(message: string): FileReference[] {
  const fileRefRegex = /@([^\s@]+)/g;
  const references: FileReference[] = [];
  let match;

  while ((match = fileRefRegex.exec(message)) !== null) {
    const originalText = match[0]; // e.g., "@package.json"
    const filePath = match[1]; // e.g., "package.json"
    if (!filePath) continue; // Skip if no path captured
    
    const fileName = filePath.split('/').pop() ?? filePath;
    
    references.push({
      originalText,
      filePath,
      fileName
    });
  }

  return references;
}

/**
 * Fetch file content from bridge service
 */
export async function fetchFileContent(filePath: string, workingDirectory?: string): Promise<FileContent> {
  try {
    const BRIDGE_URL = 'http://localhost:8080';
    const response = await fetch(`${BRIDGE_URL}/files/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath,
        workingDirectory
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      path: data.path,
      content: data.content,
      size: data.size
    };
  } catch (error) {
    console.error(`❌ Failed to fetch file content for ${filePath}:`, error);
    return {
      path: filePath,
      content: '',
      size: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Process message with @ file references and include file content
 */
export async function processFileReferences(
  message: string, 
  workingDirectory?: string
): Promise<string> {
  const fileRefs = parseFileReferences(message);
  
  if (fileRefs.length === 0) {
    return message; // No file references found
  }

  console.log(`📁 Found ${fileRefs.length} file references:`, fileRefs.map(ref => ref.filePath));

  // Fetch all file contents
  const fileContents = await Promise.all(
    fileRefs.map(ref => fetchFileContent(ref.filePath, workingDirectory))
  );

  // Build context with file contents
  let processedMessage = message;
  const fileContexts: string[] = [];

  fileContents.forEach((fileContent, index) => {
    const fileRef = fileRefs[index];
    if (!fileRef) return; // Skip if no corresponding file reference
    
    if (fileContent.error) {
      console.warn(`⚠️ Could not read file ${fileRef.filePath}: ${fileContent.error}`);
      // Keep the @ reference as is if file can't be read
      return;
    }

    // Add file content to context
    const truncatedContent = fileContent.size > 50000 
      ? fileContent.content.slice(0, 50000) + '\n\n[Content truncated - file too large]'
      : fileContent.content;

    fileContexts.push(`File: ${fileRef.filePath}\n\`\`\`\n${truncatedContent}\n\`\`\``);
    
    // Optional: Replace @filename with just filename in the message
    // processedMessage = processedMessage.replace(fileRef.originalText, fileRef.fileName);
  });

  // Prepend file contexts to the message
  if (fileContexts.length > 0) {
    const contextHeader = fileContexts.length === 1 
      ? 'Referenced file:\n\n' 
      : `Referenced files (${fileContexts.length}):\n\n`;
    
    processedMessage = contextHeader + fileContexts.join('\n\n---\n\n') + '\n\n---\n\n' + processedMessage;
  }

  return processedMessage;
}

/**
 * Simple helper to check if message contains file references
 */
export function hasFileReferences(message: string): boolean {
  return /@[^\s@]+/.test(message);
}