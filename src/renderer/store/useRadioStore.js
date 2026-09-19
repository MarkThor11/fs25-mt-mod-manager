import { create } from 'zustand';

const loadSavedFilters = () => {
  try {
    const raw = localStorage.getItem('radio_filters');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

const loadHiddenStations = () => {
  try {
    const raw = localStorage.getItem('radio_hidden_stations');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveFiltersToStorage = (state) => {
  try {
    localStorage.setItem('radio_filters', JSON.stringify({
      query: state.query,
      country: state.country,
      language: state.language,
      tag: state.tag,
      sortOrder: state.sortOrder,
      viewMode: state.viewMode
    }));
  } catch (e) {}
};

const saveHiddenStationsToStorage = (hiddenStations) => {
  try {
    localStorage.setItem('radio_hidden_stations', JSON.stringify(hiddenStations));
  } catch (e) {}
};

const savedFilters = loadSavedFilters();

export const useRadioStore = create((set, get) => ({
  stations: [],
  searchResults: [],
  hiddenStations: loadHiddenStations(),
  isSearching: false,
  isLoading: false,

  playingStationUrl: null,

  // Persistent search filters & view mode across app restarts
  query: savedFilters.query || '',
  country: savedFilters.country || '',
  language: savedFilters.language || '',
  tag: savedFilters.tag || '',
  sortOrder: savedFilters.sortOrder || 'name', // 'name' (Alphabetical A-Z) or 'votes' (Popularity)
  viewMode: savedFilters.viewMode || 'search',

  hideStation: (station) => {
    const current = get().hiddenStations;
    const href = station.url_resolved || station.url || station.href;
    if (!href) return;
    const exists = current.some(s => (s.url_resolved || s.url || s.href) === href);
    if (!exists) {
      const updated = [...current, { ...station, href, hiddenAt: Date.now() }];
      set({ hiddenStations: updated });
      saveHiddenStationsToStorage(updated);
    }
  },

  unhideStation: (href) => {
    const current = get().hiddenStations;
    const updated = current.filter(s => (s.url_resolved || s.url || s.href) !== href);
    set({ hiddenStations: updated });
    saveHiddenStationsToStorage(updated);
  },

  unhideAllStations: () => {
    set({ hiddenStations: [] });
    saveHiddenStationsToStorage([]);
  },

  deleteHiddenStationPermanently: (href) => {
    const current = get().hiddenStations;
    const updated = current.filter(s => (s.url_resolved || s.url || s.href) !== href);
    set({ hiddenStations: updated });
    saveHiddenStationsToStorage(updated);
  },

  setFilterQuery: (query) => {
    set({ query });
    saveFiltersToStorage(get());
  },
  setFilterCountry: (country) => {
    set({ country });
    saveFiltersToStorage(get());
  },
  setFilterLanguage: (language) => {
    set({ language });
    saveFiltersToStorage(get());
  },
  setFilterTag: (tag) => {
    set({ tag });
    saveFiltersToStorage(get());
  },
  setSortOrder: (sortOrder) => {
    set({ sortOrder });
    saveFiltersToStorage(get());
  },
  setViewMode: (viewMode) => {
    set({ viewMode });
    saveFiltersToStorage(get());
  },
  resetFilters: () => {
    set({ query: '', country: '', language: '', tag: '', sortOrder: 'name' });
    saveFiltersToStorage(get());
  },

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
