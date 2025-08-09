import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MentionsInput, Mention, type SuggestionDataItem } from 'react-mentions';
import { File, Folder } from 'lucide-react';

interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

interface FileReferenceMentionsProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  workingDirectory?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
}

export const FileReferenceMentions: React.FC<FileReferenceMentionsProps> = ({
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
  const [lastSearch, setLastSearch] = useState('');

  // Fetch files from bridge service
  const fetchFiles = useCallback(async (search: string = '') => {
    if (search === lastSearch && fileList.length > 0) {
      return; // Avoid duplicate requests
    }

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
      setLastSearch(search);
      
      console.log('📁 Fetched files:', data.files?.length || 0, 'files');
      
    } catch (error) {
      console.error('❌ Failed to fetch files:', error);
      setFileList([]);
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory, fileList.length, lastSearch]);

  // Initial file load
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Convert files to mention suggestions
  const fileSuggestions = useMemo((): SuggestionDataItem[] => {
    return fileList.map(file => ({
      id: file.path,
      display: file.name,
      // Show relative path for files with same name
      displayTransform: (_id: string, display: string) => {
        const duplicateNames = fileList.filter(f => f.name === display);
        if (duplicateNames.length > 1) {
          return `${display} (${file.path})`;
        }
        return display;
      }
    }));
  }, [fileList]);


  // Custom render for file suggestions
  const renderFileSuggestion = useCallback((
    suggestion: SuggestionDataItem,
    _search: string,
    highlightedDisplay: React.ReactNode,
    _index: number,
    focused: boolean
  ) => {
    const file = fileList.find(f => f.path === suggestion.id);
    const isFile = file?.type === 'file';
    
    return (
      <div 
        className={`
          flex items-center gap-2 px-3 py-2 text-sm
          ${focused ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}
          transition-colors cursor-pointer
        `}
      >
        {isFile ? (
          <File size={16} className="text-blue-400" />
        ) : (
          <Folder size={16} className="text-yellow-400" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {highlightedDisplay}
          </div>
          {file && (
            <div className="text-xs text-gray-400 truncate">
              {file.path}
            </div>
          )}
        </div>
      </div>
    );
  }, [fileList]);

  // Mention styles to match Baton's dark theme
  const mentionStyles = {
    control: {
      backgroundColor: 'transparent',
      fontSize: '14px',
      fontFamily: 'inherit',
    },
    '&multiLine': {
      control: {
        minHeight: '64px',
        maxHeight: '200px',
      },
      highlighter: {
        padding: '12px 16px',
        border: '1px solid transparent',
        borderRadius: '12px',
      },
      input: {
        padding: '12px 16px',
        border: '1px solid #3A3B3E',
        borderRadius: '12px',
        backgroundColor: '#2A2B2E',
        color: '#E5E5E5',
        outline: 'none',
        fontSize: '14px',
        fontFamily: 'inherit',
        resize: 'none' as const,
        minHeight: '64px',
        maxHeight: '200px',
        '&::placeholder': {
          color: '#7E7F82',
        },
        '&:focus': {
          borderColor: '#4A4B4F',
        },
        '&:disabled': {
          opacity: '0.5',
        },
      },
    },
    suggestions: {
      list: {
        backgroundColor: 'rgb(31, 41, 55)', // bg-gray-800
        border: '1px solid rgb(55, 65, 81)', // border-gray-700
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        fontSize: '14px',
        maxHeight: '200px',
        overflowY: 'auto' as const,
        zIndex: 1000,
      },
      item: {
        padding: 0,
        borderBottom: '1px solid rgb(55, 65, 81)',
        '&focused': {
          backgroundColor: 'rgb(234, 88, 12)', // bg-orange-600
        },
      },
    },
  };

  return (
    <div className={className}>
      <MentionsInput
        value={value}
        onChange={(_e, newValue) => onChange(newValue)}
        placeholder={disabled ? "Claude is responding..." : placeholder}
        disabled={disabled}
        style={mentionStyles}
        allowSpaceInQuery={false}
        onKeyDown={onKeyDown as ((event: React.KeyboardEvent<HTMLInputElement> | React.KeyboardEvent<HTMLTextAreaElement>) => void) | undefined}
        className="w-full"
        a11ySuggestionsListLabel="File suggestions"
      >
        <Mention
          trigger="@"
          data={fileSuggestions}
          // onSearch prop not available in this version of react-mentions
          // Search is handled by the trigger system instead
          renderSuggestion={renderFileSuggestion}
          displayTransform={(id: string) => `@${fileList.find(f => f.path === id)?.name || id}`}
          style={{
            backgroundColor: 'rgb(59, 130, 246, 0.1)', // bg-blue-500 with opacity
            color: 'rgb(59, 130, 246)', // text-blue-500
            fontWeight: '500',
            padding: '2px 4px',
            borderRadius: '4px',
          }}
          appendSpaceOnAdd
        />
      </MentionsInput>
      
      {isLoading && (
        <div className="absolute right-12 top-1/2 transform -translate-y-1/2 text-gray-400">
          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
        </div>
      )}
    </div>
  );
};