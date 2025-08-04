import { useState, useEffect } from 'react';

/**
 * Custom hook that tracks a CSS media query and returns whether it matches
 * 
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @param defaultMatches - Default value when window is unavailable (SSR)
 * @returns boolean indicating if the media query matches
 */
export const useMediaQuery = (query: string, defaultMatches = false): boolean => {
  // Initialize state with current match or default for SSR
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return defaultMatches;
  });

  useEffect(() => {
    // Return early if window is not available (SSR)
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    
    // Update state when media query changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial value
    setMatches(mediaQueryList.matches);

    // Add event listener with both new and legacy methods for broader compatibility
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
    } else {
      // Legacy method for older browsers
      mediaQueryList.addListener(handleChange);
    }

    // Cleanup function
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange);
      } else {
        // Legacy method for older browsers
        mediaQueryList.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
};