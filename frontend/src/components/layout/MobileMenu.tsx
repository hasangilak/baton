import React, { useEffect, useRef } from 'react';
import { X, Menu } from 'lucide-react';
import clsx from 'clsx';

interface MobileMenuProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onToggle }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const startTouchRef = useRef<{ x: number; y: number } | null>(null);

  // Handle swipe gestures to close menu
  useEffect(() => {
    if (!isOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      startTouchRef.current = {
        x: e.touches[0]!.clientX,
        y: e.touches[0]!.clientY
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!startTouchRef.current) return;

      const endX = e.changedTouches[0]!.clientX;
      const endY = e.changedTouches[0]!.clientY;
      const deltaX = endX - startTouchRef.current.x;
      const deltaY = endY - startTouchRef.current.y;

      // Swipe left to close (threshold: 100px, and more horizontal than vertical)
      if (deltaX < -100 && Math.abs(deltaX) > Math.abs(deltaY)) {
        onToggle();
      }

      startTouchRef.current = null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggle();
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('keydown', handleKeyDown);

    // Focus trap management
    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen, onToggle]);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={onToggle}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors touch-target"
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation-menu"
        data-testid="mobile-menu-toggle"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-gray-600" aria-hidden="true" />
        ) : (
          <Menu className="w-6 h-6 text-gray-600" aria-hidden="true" />
        )}
      </button>

      {/* Mobile menu overlay */}
      {isOpen && (
        <div
          ref={overlayRef}
          className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity duration-300"
          onClick={onToggle}
          onTouchStart={(e) => e.preventDefault()} // Prevent scroll behind overlay
          aria-label="Close navigation menu"
          role="button"
          tabIndex={0}
          data-testid="mobile-menu-overlay"
        />
      )}

      {/* Screen reader announcement */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {isOpen ? 'Navigation menu opened' : ''}
      </div>
    </>
  );
};