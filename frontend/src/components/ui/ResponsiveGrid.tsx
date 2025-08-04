import React from 'react';
import clsx from 'clsx';

interface ResponsiveGridProps {
  children: React.ReactNode;
  variant?: 'auto-fit' | 'auto-fill' | 'dense' | 'masonry';
  minItemWidth?: string;
  gap?: string;
  className?: string;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  variant = 'auto-fit',
  minItemWidth = '300px', 
  gap = '1rem',
  className
}) => {
  const getGridStyle = () => {
    const baseStyle = {
      display: 'grid',
      gap
    };

    switch (variant) {
      case 'auto-fit':
        return {
          ...baseStyle,
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minItemWidth}), 1fr))`
        };
      case 'auto-fill':
        return {
          ...baseStyle,
          gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}, 1fr))`
        };
      case 'dense':
        return {
          ...baseStyle,
          gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}, 1fr))`,
          gridAutoFlow: 'dense'
        };
      case 'masonry':
        return {
          ...baseStyle,
          gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}, 1fr))`,
          gridTemplateRows: 'masonry' // Future CSS feature
        };
      default:
        return baseStyle;
    }
  };

  return (
    <div 
      className={clsx('responsive-grid-container', className)}
      style={getGridStyle()}
    >
      {children}
    </div>
  );
};

// Specialized grid components for common use cases
export const CardGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className 
}) => (
  <ResponsiveGrid 
    variant="auto-fit" 
    minItemWidth="280px" 
    gap="1.5rem"
    className={clsx('card-grid', className)}
  >
    {children}
  </ResponsiveGrid>
);

export const DashboardGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className 
}) => (
  <div 
    className={clsx('dashboard-grid', className)}
    style={{
      display: 'grid',
      gap: '1.5rem',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridAutoRows: 'minmax(120px, auto)'
    }}
  >
    {children}
  </div>
);

// Grid item wrapper with responsive spanning
interface GridItemProps {
  children: React.ReactNode;
  colSpan?: { sm?: number; md?: number; lg?: number; xl?: number };
  rowSpan?: { sm?: number; md?: number; lg?: number; xl?: number };
  className?: string;
}

export const GridItem: React.FC<GridItemProps> = ({ 
  children, 
  colSpan = { sm: 12, md: 6, lg: 4, xl: 3 },
  rowSpan = { sm: 1 },
  className 
}) => {
  const getGridItemClasses = () => {
    const classes = [];
    
    // Column spans
    if (colSpan.sm) classes.push(`col-span-${colSpan.sm}`);
    if (colSpan.md) classes.push(`md:col-span-${colSpan.md}`);
    if (colSpan.lg) classes.push(`lg:col-span-${colSpan.lg}`);
    if (colSpan.xl) classes.push(`xl:col-span-${colSpan.xl}`);
    
    // Row spans
    if (rowSpan.sm) classes.push(`row-span-${rowSpan.sm}`);
    if (rowSpan.md) classes.push(`md:row-span-${rowSpan.md}`);
    if (rowSpan.lg) classes.push(`lg:row-span-${rowSpan.lg}`);
    if (rowSpan.xl) classes.push(`xl:row-span-${rowSpan.xl}`);
    
    return classes.join(' ');
  };

  return (
    <div className={clsx(getGridItemClasses(), className)}>
      {children}
    </div>
  );
};