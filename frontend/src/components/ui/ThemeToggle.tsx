import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type Theme, getThemeDisplayName } from '../../hooks/useTheme';
import clsx from 'clsx';

interface ThemeToggleProps {
  variant?: 'buttons' | 'dropdown';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ 
  variant = 'buttons', 
  className 
}) => {
  const { theme, setTheme, systemTheme } = useTheme();

  const themes: Array<{ value: Theme; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun className="w-4 h-4" />, label: 'Light' },
    { value: 'dark', icon: <Moon className="w-4 h-4" />, label: 'Dark' },
    { value: 'auto', icon: <Monitor className="w-4 h-4" />, label: `Auto (${getThemeDisplayName(systemTheme)})` },
  ];

  if (variant === 'buttons') {
    return (
      <div className={clsx('flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1', className)}>
        {themes.map(({ value, icon, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={clsx(
              'flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              'hover:bg-white/50 dark:hover:bg-gray-700/50',
              theme === value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            )}
            title={`Switch to ${label.toLowerCase()} theme`}
            aria-pressed={theme === value}
          >
            {icon}
            <span className="hidden sm:inline">{value === 'auto' ? 'Auto' : label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={clsx('relative', className)}>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className={clsx(
          'appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600',
          'rounded-md px-3 py-2 pr-8 text-sm font-medium',
          'text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200'
        )}
        aria-label="Select theme"
      >
        {themes.map(({ value, label }) => (
          <option key={value} value={value}>
            {value === 'auto' ? `Auto (${getThemeDisplayName(systemTheme)})` : label}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        {theme === 'light' && <Sun className="w-4 h-4 text-gray-400" />}
        {theme === 'dark' && <Moon className="w-4 h-4 text-gray-400" />}
        {theme === 'auto' && <Monitor className="w-4 h-4 text-gray-400" />}
      </div>
    </div>
  );
};

// Compact version for header integration
export const ThemeSelector: React.FC<{ className?: string }> = ({ className }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const getCurrentIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="w-4 h-4" />;
      case 'dark':
        return <Moon className="w-4 h-4" />;
      case 'auto':
        return <Monitor className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]!);
  };

  return (
    <button
      onClick={cycleTheme}
      className={clsx(
        'p-2 rounded-lg transition-colors duration-200',
        'text-gray-600 dark:text-gray-400',
        'hover:text-gray-900 dark:hover:text-gray-100',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
        className
      )}
      title={`Current: ${getThemeDisplayName(theme)} ${theme === 'auto' ? `(${resolvedTheme})` : ''} - Click to cycle`}
      aria-label={`Switch theme. Current: ${getThemeDisplayName(theme)}`}
    >
      {getCurrentIcon()}
    </button>
  );
};