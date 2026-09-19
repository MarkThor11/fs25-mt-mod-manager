import { create } from 'zustand';

export const useRadioStore = create((set, get) => ({
  stations: [],
  searchResults: [],
  isSearching: false,
  isLoading: false,

  playingStationUrl: null,

  // Persistent search filters & view mode
  query: '',
  country: '',
  language: '',
  tag: '',
  viewMode: 'search',

  setFilterQuery: (query) => set({ query }),
  setFilterCountry: (country) => set({ country }),
  setFilterLanguage: (language) => set({ language }),
  setFilterTag: (tag) => set({ tag }),
  setViewMode: (viewMode) => set({ viewMode }),
  resetFilters: () => set({ query: '', country: '', language: '', tag: '' }),

  // Companion script & override state
  overrideBuiltins: true,
  isCompanionInstalled: false,

  fetchRadioSettings: async () => {
    if (!window.api?.radio?.getSettings) return;
    try {
      const res = await window.api.radio.getSettings();
      if (res) {
        set({
          overrideBuiltins: res.overrideBuiltins !== false,
          isCompanionInstalled: !!res.isCompanionInstalled
        });
      }
    } catch (e) {
      console.warn('Failed to fetch radio settings:', e);
    }
  },

  setOverrideBuiltins: async (override) => {
    set({ overrideBuiltins: override });
    if (window.api?.radio?.saveSettings) {
      await window.api.radio.saveSettings({ overrideBuiltins: override });
    }
  },

  fetchRadios: async () => {
    if (!window.api?.radio) return;
    set({ isLoading: true });
    try {
      const stations = await window.api.radio.getRadios();
      set({ stations });
      get().fetchRadioSettings();
    } finally {
      set({ isLoading: false });
    }
  },

  searchStations: async (filters) => {
    if (!window.api?.radio) return;
    
    // Check if we have at least one filter
    const hasFilters = Object.values(filters || {}).some(v => v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== ''));
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
  },

  updateStationName: async (href, newName) => {
    if (!window.api?.radio?.updateName) return { success: false };
    const result = await window.api.radio.updateName({ href, newName });
    if (result.success) {
      await get().fetchRadios();
    }
    return result;
  }
}));
