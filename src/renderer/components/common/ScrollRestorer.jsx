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

    // If we're moving to a NEW search or filter, we PROBABLY want to reset to top
    // BUT if we're clicking 'back' from a detail page, we want the saved position.
    
    // Logic: If the base pathname changed (e.g. going from /installed to /modhub), 
    // or if it's a route we've never seen, start at 0.
    // HashRouter handles these transitions by remounting/re-routing.

    const restore = () => {
      if (savedPos > 0) {
        // We use two attempts: one immediate, and one slightly delayed 
        // to handle async content loading in ModHub/Library.
        container.scrollTo({ top: savedPos, behavior: 'instant' });
        
        setTimeout(() => {
          container.scrollTo({ top: savedPos, behavior: 'instant' });
        }, 100);
        
        // Final "insurance" scroll for slower loading grids
        setTimeout(() => {
          if (container.scrollTop < savedPos - 10) {
            container.scrollTo({ top: savedPos, behavior: 'smooth' });
          }
        }, 400);
      } else {
        container.scrollTo(0, 0);
      }
    };

    restore();
    lastPathRef.current = currentKey;
  }, [location.pathname, location.search, getScrollPosition]);

  return <>{children}</>;
}
