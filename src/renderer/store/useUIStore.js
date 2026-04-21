import { create } from 'zustand';

export const useUIStore = create((set, get) => ({
  scrollPositions: {}, // { [pathname]: number }

  setScrollPosition: (path, top) => {
    set((state) => ({
      scrollPositions: {
        ...state.scrollPositions,
        [path]: top
      }
    }));
  },

  getScrollPosition: (path) => {
    return get().scrollPositions[path] || 0;
  },

  clearAllScrollPositions: () => {
    set({ scrollPositions: {} });
  }
}));
