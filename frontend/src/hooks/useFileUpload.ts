/**
 * File Upload Hook - Handles file selection and upload for Claude chat
 * 
 * Supports common file types that Claude Code can work with:
 * - Text files (.txt, .md, .json, .yaml, .csv)
 * - Code files (.js, .ts, .jsx, .tsx, .py, .java, .cpp, .c, .cs, .go, .rs, .php, .rb, .swift, .kt)
 * - Images (.png, .jpg, .jpeg, .gif, .webp, .svg)
 * - Documents (.pdf)
 */

import { useState, useCallback, useRef } from 'react';

export interface FileUploadItem {
  file: File;
  id: string;
  preview?: string;
  type: 'text' | 'image' | 'document' | 'code';
}

interface UseFileUploadOptions {
  maxFiles?: number;
  maxSizeBytes?: number;
  onFilesSelected?: (files: FileUploadItem[]) => void;
  onError?: (error: string) => void;
}

// Supported file types and their categories
const FILE_TYPES = {
  text: ['.txt', '.md', '.markdown', '.csv', '.json', '.yaml', '.yml', '.xml', '.log'],
  code: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.html', '.css', '.scss', '.sass', '.vue', '.svelte'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'],
  document: ['.pdf']
};

const ALL_SUPPORTED_EXTENSIONS = Object.values(FILE_TYPES).flat();

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const {
    maxFiles = 10,
    maxSizeBytes = 25 * 1024 * 1024, // 25MB default
    onFilesSelected,
    onError,
  } = options;

  const [selectedFiles, setSelectedFiles] = useState<FileUploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get file type category
  const getFileType = useCallback((fileName: string): FileUploadItem['type'] => {
    const extension = '.' + fileName.split('.').pop()?.toLowerCase();
    
    if (FILE_TYPES.text.includes(extension)) return 'text';
    if (FILE_TYPES.code.includes(extension)) return 'code';
    if (FILE_TYPES.image.includes(extension)) return 'image';
    if (FILE_TYPES.document.includes(extension)) return 'document';
    
    return 'text'; // Default fallback
  }, []);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > maxSizeBytes) {
      return `File "${file.name}" is too large. Maximum size is ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`;
    }

    // Check file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALL_SUPPORTED_EXTENSIONS.includes(extension)) {
      return `File type "${extension}" is not supported. Supported types: ${ALL_SUPPORTED_EXTENSIONS.join(', ')}.`;
    }

    return null;
  }, [maxSizeBytes]);

  // Create file preview for images
  const createPreview = useCallback((file: File, type: FileUploadItem['type']): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (type === 'image') {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    });
  }, []);

  // Handle file selection
  const handleFileSelection = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Check total file count
    if (selectedFiles.length + fileArray.length > maxFiles) {
      onError?.(`Too many files. Maximum ${maxFiles} files allowed.`);
      return;
    }

    const validFiles: FileUploadItem[] = [];
    
    for (const file of fileArray) {
      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        onError?.(validationError);
        continue;
      }

      // Check for duplicates
      if (selectedFiles.some(existing => existing.file.name === file.name && existing.file.size === file.size)) {
        onError?.(`File "${file.name}" is already selected.`);
        continue;
      }

      // Create file upload item
      const type = getFileType(file.name);
      const preview = await createPreview(file, type);
      
      validFiles.push({
        file,
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        preview,
        type,
      });
    }

    if (validFiles.length > 0) {
      const newFiles = [...selectedFiles, ...validFiles];
      setSelectedFiles(newFiles);
      onFilesSelected?.(newFiles);
    }
  }, [selectedFiles, maxFiles, validateFile, getFileType, createPreview, onFilesSelected, onError]);

  // Trigger file selection dialog
  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Remove a file
  const removeFile = useCallback((fileId: string) => {
    const newFiles = selectedFiles.filter(item => item.id !== fileId);
    setSelectedFiles(newFiles);
    onFilesSelected?.(newFiles);
  }, [selectedFiles, onFilesSelected]);

  // Clear all files
  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
    onFilesSelected?.([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesSelected]);

  // Get file size in human readable format
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  return {
    // State
    selectedFiles,
    
    // Actions
    openFileDialog,
    handleFileSelection,
    removeFile,
    clearFiles,
    
    // Utilities
    formatFileSize,
    getFileType,
    
    // Ref for hidden input
    fileInputRef,
    
    // Configuration
    supportedExtensions: ALL_SUPPORTED_EXTENSIONS,
  };
}