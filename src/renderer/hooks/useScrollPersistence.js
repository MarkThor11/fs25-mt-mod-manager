import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';

/**
 * useScrollPersistence
 * 
 * Saves and restores the scroll position of a DOM element during the session.
 * 
 * @param {string} key - Unique key for this scrollable area (e.g. 'sidebar' or 'modhub-main')
 * @returns {React.RefObject} - Ref to be attached to the scrollable element
 */
export function useScrollPersistence(key) {
  const ref = useRef(null);
  const { setScrollPosition, getScrollPosition } = useUIStore();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 1. RESTORE POSITION
    const savedPos = getScrollPosition(key);
    if (savedPos > 0) {
      // Immediate scroll
      el.scrollTop = savedPos;
      
      // Delayed insurance scrolls (for content that loads asynchronously)
      const t1 = setTimeout(() => {
        if (el.scrollTop !== savedPos) el.scrollTop = savedPos;
      }, 50);
      
      const t2 = setTimeout(() => {
        if (el.scrollTop !== savedPos) el.scrollTop = savedPos;
      }, 200);
      
      const t3 = setTimeout(() => {
        if (el.scrollTop !== savedPos) el.scrollTop = savedPos;
      }, 500);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [key, getScrollPosition]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timeoutId;
    const handleScroll = () => {
      // Debounce slightly to avoid excessive store updates
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (ref.current) {
          setScrollPosition(key, ref.current.scrollTop);
        }
      }, 150);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      el.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [key, setScrollPosition]);

  return ref;
}
