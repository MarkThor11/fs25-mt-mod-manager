import { create } from 'zustand';

const STORAGE_KEY = 'fs25_spotify_favorites';

const getInitialSpotifyFavorites = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const useRadioStore = create((set, get) => ({
  stations: [],
  searchResults: [],
  isSearching: false,
  isLoading: false,

  playingStationUrl: null,

  // Spotify integration state
  activeSpotifyEmbed: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX1lVhivE98y9', // Default: Country Farming Hits
  spotifyFavorites: getInitialSpotifyFavorites(),

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

  setActiveSpotifyEmbed: (embedUrl) => set({ activeSpotifyEmbed: embedUrl }),

  addSpotifyFavorite: (item) => {
    const current = get().spotifyFavorites;
    if (current.some(f => f.embedUrl === item.embedUrl)) return;
    const updated = [...current, item];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
    set({ spotifyFavorites: updated });
  },

  removeSpotifyFavorite: (embedUrl) => {
    const current = get().spotifyFavorites;
    const updated = current.filter(f => f.embedUrl !== embedUrl);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
    set({ spotifyFavorites: updated });
  },

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
