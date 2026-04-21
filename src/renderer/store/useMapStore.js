import { create } from 'zustand';

export const useMapStore = create((set, get) => ({
    templates: [],
    isLoading: false,
    error: null,

    loadCache: async () => {
        if (!window.api?.settings) return;
        try {
            const cached = await window.api.settings.get('mapTemplateCache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) {
                    set({ templates: parsed });
                }
            }
        } catch (e) {
            console.error("[MAP-STORE] Failed to load cache:", e);
        }
    },

    fetchTemplates: async () => {
        if (!window.api?.maps) return;
        
        // If we already have data, don't set global loading to prevent flickering
        const hasData = get().templates.length > 0;
        if (!hasData) set({ isLoading: true });

        try {
            const data = await window.api.maps.getTemplates();
            const templates = data || [];
            set({ templates, isLoading: false, error: null });

            // Persist to cache
            await window.api.settings.set('mapTemplateCache', JSON.stringify(templates));
        } catch (err) {
            set({ error: err.message, isLoading: false });
        }
    },

    deleteTemplate: async (folderName, title) => {
        if (!window.api?.maps) return { success: false };
        try {
            const result = await window.api.maps.deleteTemplate(folderName);
            if (result.success) {
                const newTemplates = get().templates.filter(t => t.id !== folderName);
                set({ templates: newTemplates });
                await window.api.settings.set('mapTemplateCache', JSON.stringify(newTemplates));
            }
            return result;
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}));
