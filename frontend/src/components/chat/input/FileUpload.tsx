/**
 * File Upload Area Component - Displays selected files with preview and actions
 * 
 * Shows file information, type icons, and allows removal of files before sending
 */

import React from 'react';
import { X, FileText, Image, Code2, FileType } from 'lucide-react';
import type { FileUploadItem } from '../../../hooks/useFileUpload';

interface FileUploadAreaProps {
  files: FileUploadItem[];
  onRemoveFile: (fileId: string) => void;
  formatFileSize: (bytes: number) => string;
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  files,
  onRemoveFile,
  formatFileSize
}) => {
  if (files.length === 0) return null;

  // Get appropriate icon for file type
  const getFileIcon = (type: FileUploadItem['type']) => {
    switch (type) {
      case 'image':
        return Image;
      case 'code':
        return Code2;
      case 'document':
        return FileType;
      case 'text':
      default:
        return FileText;
    }
  };

  // Get file type color
  const getTypeColor = (type: FileUploadItem['type']) => {
    switch (type) {
      case 'image':
        return 'text-green-400';
      case 'code':
        return 'text-blue-400';
      case 'document':
        return 'text-red-400';
      case 'text':
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="mb-3 p-3 bg-[#252526] border border-[#3E3E42] rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#8B8B8D] font-medium">
          {files.length} file{files.length !== 1 ? 's' : ''} selected
        </span>
      </div>
      
      <div className="space-y-2">
        {files.map((fileItem) => {
          const Icon = getFileIcon(fileItem.type);
          const colorClass = getTypeColor(fileItem.type);
          
          return (
            <div
              key={fileItem.id}
              className="flex items-start space-x-3 p-2 bg-[#2D2D30] border border-[#3E3E42] rounded-lg group hover:bg-[#3E3E42] transition-colors"
            >
              {/* File Icon or Image Preview */}
              <div className="flex-shrink-0">
                {fileItem.preview && fileItem.type === 'image' ? (
                  <img
                    src={fileItem.preview}
                    alt={fileItem.file.name}
                    className="w-10 h-10 object-cover rounded border border-[#3E3E42]"
                  />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-[#3E3E42] rounded border border-[#565658]">
                    <Icon className={`w-5 h-5 ${colorClass}`} />
                  </div>
                )}
              </div>
              
              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#E5E5E5] truncate font-medium">
                  {fileItem.file.name}
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`text-xs ${colorClass} capitalize`}>
                    {fileItem.type}
                  </span>
                  <span className="text-xs text-[#8B8B8D]">•</span>
                  <span className="text-xs text-[#8B8B8D]">
                    {formatFileSize(fileItem.file.size)}
                  </span>
                </div>
              </div>
              
              {/* Remove Button */}
              <button
                onClick={() => onRemoveFile(fileItem.id)}
                className="flex-shrink-0 p-1 hover:bg-[#565658] rounded transition-colors opacity-70 hover:opacity-100"
                title="Remove file"
              >
                <X className="w-4 h-4 text-[#8B8B8D]" />
              </button>
            </div>
          );
        })}
      </div>
      
      {/* Help text */}
      <p className="mt-2 text-xs text-[#8B8B8D]">
        Files will be included in your message to Claude
      </p>
    </div>
  );
};