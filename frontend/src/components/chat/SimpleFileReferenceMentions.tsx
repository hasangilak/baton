import React, { useState, useEffect, useCallback, useRef } from 'react';
import { File, Folder } from 'lucide-react';

interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

interface SimpleFileReferenceMentionsProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  workingDirectory?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}

export const SimpleFileReferenceMentions: React.FC<SimpleFileReferenceMentionsProps> = ({
  value,
  onChange,
  placeholder = "Type your message...",
  disabled = false,
  workingDirectory,
  onKeyDown,
  className,
}) => {
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Fetch files from bridge service
  const fetchFiles = useCallback(async (search: string = '') => {
    setIsLoading(true);
    try {
      const BRIDGE_URL = 'http://localhost:8080';
      const url = new URL(`${BRIDGE_URL}/files/list`);
      
      if (workingDirectory) {
        url.searchParams.append('workingDirectory', workingDirectory);
      }
      if (search) {
        url.searchParams.append('search', search);
      }

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setFileList(data.files || []);
      
      console.log('📁 Fetched files:', data.files?.length || 0, 'files');
      
    } catch (error) {
      console.error('❌ Failed to fetch files:', error);
      setFileList([]);
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory]);

  // Initial file load
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Filter files based on mention query
  const filteredFiles = fileList.filter(file => 
    file.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // Handle textarea change and @ detection
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || newValue.length;
    
    console.log('🔍 Textarea changed:', { newValue, cursorPos });
    onChange(newValue);
    
    // Find @ mentions
    const beforeCursor = newValue.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    console.log('🔍 @ detection:', { beforeCursor, atIndex });
    
    if (atIndex !== -1) {
      const afterAt = beforeCursor.slice(atIndex + 1);
      const hasSpaceAfter = afterAt.includes(' ') || afterAt.includes('\n');
      
      console.log('🔍 After @:', { afterAt, hasSpaceAfter });
      
      if (!hasSpaceAfter) {
        setMentionStart(atIndex);
        setMentionQuery(afterAt);
        setShowSuggestions(true);
        setSelectedIndex(0);
        console.log('🔍 Showing suggestions for:', afterAt);
        fetchFiles(afterAt);
      } else {
        setShowSuggestions(false);
        console.log('🔍 Hiding suggestions - space detected');
      }
    } else {
      setShowSuggestions(false);
      console.log('🔍 Hiding suggestions - no @ found');
    }
  };

  // Handle key navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && filteredFiles.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = selectedIndex < filteredFiles.length - 1 ? selectedIndex + 1 : 0;
          setSelectedIndex(nextIndex);
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredFiles.length - 1;
          setSelectedIndex(prevIndex);
          break;
        case 'Enter':
          if (filteredFiles[selectedIndex]) {
            e.preventDefault();
            selectFile(filteredFiles[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          break;
      }
    }
    
    // Pass through other key events
    if (onKeyDown && (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && 
                     !(e.key === 'Enter' && showSuggestions) && e.key !== 'Escape')) {
      onKeyDown(e);
    }
  };

  // Select a file from suggestions
  const selectFile = (file: FileItem) => {
    if (mentionStart !== -1) {
      const beforeMention = value.slice(0, mentionStart);
      const afterMention = value.slice(mentionStart + mentionQuery.length + 1);
      const newValue = `${beforeMention}@${file.name} ${afterMention}`;
      onChange(newValue);
      setShowSuggestions(false);
      
      // Focus back to textarea
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = beforeMention.length + file.name.length + 2;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected item into view when selectedIndex changes
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Claude is responding..." : placeholder}
        disabled={disabled}
        className="w-full px-5 py-4 bg-[#2C2D30] border border-[#3E3F42] rounded-xl text-[#F4F4F4] placeholder-[#9CA3AF] resize-none focus:outline-none focus:border-[#4A4B4F] transition-all disabled:opacity-50"
        style={{ minHeight: '95px', maxHeight: '250px' }}
        rows={1}
      />
      
      {/* Suggestions Dropdown */}
      {showSuggestions && filteredFiles.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-[9999] w-full max-w-md bg-[#1F2937] border border-[#374151] rounded-lg shadow-xl max-h-60 overflow-y-auto mb-1 custom-scrollbar"
          style={{ 
            bottom: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            scrollbarWidth: 'thin',
            scrollbarColor: '#4B5563 #1F2937'
          }}
        >
          {filteredFiles.slice(0, 10).map((file, index) => (
            <div
              key={file.path}
              ref={index === selectedIndex ? selectedItemRef : null}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                index === selectedIndex
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              onClick={() => selectFile(file)}
            >
              {file.type === 'file' ? (
                <File size={16} className="text-blue-400" />
              ) : (
                <Folder size={16} className="text-yellow-400" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {file.name}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {file.path}
                </div>
              </div>
            </div>
          ))}
          {filteredFiles.length > 10 && (
            <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-600">
              Showing 10 of {filteredFiles.length} files
            </div>
          )}
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute right-12 top-1/2 transform -translate-y-1/2 text-gray-400">
          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
        </div>
      )}
    </div>
  );
};