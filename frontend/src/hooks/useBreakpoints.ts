import { useMediaQuery } from './useMediaQuery';

/**
 * Standard breakpoint values matching Tailwind CSS defaults
 */
export const breakpoints = {
  sm: '640px',   // Small devices (landscape phones, 640px and up)
  md: '768px',   // Medium devices (tablets, 768px and up) 
  lg: '1024px',  // Large devices (desktops, 1024px and up)
  xl: '1280px',  // Extra large devices (large desktops, 1280px and up)
  '2xl': '1536px' // 2X Extra large devices (larger desktops, 1536px and up)
} as const;

/**
 * Custom breakpoint definitions for the application
 */
export const appBreakpoints = {
  mobile: `(max-width: ${breakpoints.md})`,      // < 768px
  tablet: `(min-width: ${breakpoints.md}) and (max-width: ${breakpoints.lg})`, // 768px - 1023px
  desktop: `(min-width: ${breakpoints.lg})`,     // >= 1024px
  
  // Additional useful breakpoints
  smallMobile: `(max-width: ${breakpoints.sm})`, // < 640px
  largeDesktop: `(min-width: ${breakpoints.xl})` // >= 1280px
} as const;

/**
 * Hook that provides responsive breakpoint detection
 * 
 * @returns Object containing boolean values for each breakpoint
 */
export const useBreakpoints = () => {
  // Core breakpoints
  const isMobile = useMediaQuery(appBreakpoints.mobile);
  const isTablet = useMediaQuery(appBreakpoints.tablet);
  const isDesktop = useMediaQuery(appBreakpoints.desktop);
  
  // Additional breakpoints
  const isSmallMobile = useMediaQuery(appBreakpoints.smallMobile);
  const isLargeDesktop = useMediaQuery(appBreakpoints.largeDesktop);
  
  // Convenience computed values
  const isMobileOrTablet = isMobile || isTablet;
  const isTabletOrDesktop = isTablet || isDesktop;

  return {
    // Primary breakpoints
    isMobile,
    isTablet, 
    isDesktop,
    
    // Additional breakpoints
    isSmallMobile,
    isLargeDesktop,
    
    // Convenience combinations
    isMobileOrTablet,
    isTabletOrDesktop,
    
    // Current breakpoint (useful for debugging)
    currentBreakpoint: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
  } as const;
};

/**
 * Hook for custom media queries with app breakpoint values
 * 
 * @param breakpointKey - Key from appBreakpoints or custom query string
 * @returns boolean indicating if the query matches
 */
export const useBreakpoint = (breakpointKey: keyof typeof appBreakpoints | string): boolean => {
  const query = breakpointKey in appBreakpoints 
    ? appBreakpoints[breakpointKey as keyof typeof appBreakpoints]
    : breakpointKey;
    
  return useMediaQuery(query);
};