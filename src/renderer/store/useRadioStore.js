import { create } from 'zustand';

const ACCOUNT_STORAGE_KEY = 'fs25_spotify_account';

const getInitialSpotifyAccount = () => {
  try {
    const data = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const useRadioStore = create((set, get) => ({
  stations: [],
  searchResults: [],
  isSearching: false,
  isLoading: false,

  playingStationUrl: null,

  // Spotify Account Link State
  spotifyAccount: getInitialSpotifyAccount(),

  setSpotifyAccount: (accountData) => {
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accountData));
    } catch (e) {}
    set({ spotifyAccount: accountData });
  },

  clearSpotifyAccount: () => {
    try {
      localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    } catch (e) {}
    set({ spotifyAccount: null });
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
