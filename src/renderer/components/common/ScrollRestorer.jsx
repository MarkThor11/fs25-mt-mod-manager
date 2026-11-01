import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/useUIStore';

/**
 * ScrollRestorer
 * 
 * Monitors the .main-content scrolling container.
 * Saves scroll position for each unique path + search combo.
 * Restores scroll position when returning to a previously visited page.
 */
export default function ScrollRestorer({ children }) {
  const location = useLocation();
  const { setScrollPosition, getScrollPosition } = useUIStore();
  const lastPathRef = useRef(location.pathname + location.search);

  // ── SAVE SCROLL POSITION ──
  useEffect(() => {
    const container = document.querySelector('.main-content');
    if (!container) return;

    let timeoutId;
    const handleScroll = () => {
      // Debounce slightly to avoid excessive store updates
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setScrollPosition(location.pathname + location.search, container.scrollTop);
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [location.pathname, location.search, setScrollPosition]);

  // ── RESTORE SCROLL POSITION ──
  useEffect(() => {
    const container = document.querySelector('.main-content');
    if (!container) return;

    const currentKey = location.pathname + location.search;
    const savedPos = getScrollPosition(currentKey);

    if (savedPos > 0) {
      container.scrollTop = savedPos;
    } else {
      container.scrollTop = 0;
    }
    lastPathRef.current = currentKey;
  }, [location.pathname, location.search, getScrollPosition]);

  return <>{children}</>;
}
