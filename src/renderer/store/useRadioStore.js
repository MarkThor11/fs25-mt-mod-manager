import { create } from 'zustand';

export const useRadioStore = create((set, get) => ({
  stations: [],
  searchResults: [],
  isSearching: false,
  isLoading: false,

  playingStationUrl: null,

  fetchRadios: async () => {
    if (!window.api?.radio) return;
    set({ isLoading: true });
    try {
      const stations = await window.api.radio.getRadios();
      set({ stations });
    } finally {
      set({ isLoading: false });
    }
  },

  searchStations: async (filters) => {
    if (!window.api?.radio) return;
    
    // Check if we have at least one filter
    const hasFilters = Object.values(filters).some(v => v && v.trim() !== '');
    if (!hasFilters) {
      set({ searchResults: [] });
      return;
    }

    set({ isSearching: true });
    try {
      const results = await window.api.radio.search(filters);
      set({ searchResults: results || [] });
    } catch (err) {
      console.error('Radio search failed:', err);
      set({ searchResults: [] });
    } finally {
      set({ isSearching: false });
    }
  },

  setPlayingStation: (url) => set({ playingStationUrl: url }),

  addStation: async (href) => {
    if (!window.api?.radio) return { success: false };
    const result = await window.api.radio.add(href);
    if (result.success) {
      await get().fetchRadios();
    }
    return result;
  },

  removeStation: async (href) => {
    if (!window.api?.radio) return { success: false };
    const result = await window.api.radio.remove(href);
    if (result.success) {
      await get().fetchRadios();
    }
    return result;
  }
}));
