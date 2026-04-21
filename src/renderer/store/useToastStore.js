import { create } from 'zustand';

let toastIdCounter = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],

  /**
   * Add or update a toast
   * @param {string} type - 'success' | 'error' | 'info' | 'warning'
   * @param {string} message - The text to display
   * @param {number|object} options - Duration in ms OR an options object { duration, id }
   */
  addToast: (type, message, options = {}) => {
    const duration = typeof options === 'number' ? options : (options?.duration || (type === 'success' ? 2500 : 4000));
    const customId = typeof options === 'object' ? options?.id : null;
    
    set((state) => {
      // If a custom ID is provided, check if it already exists to avoid duplicates
      if (customId) {
        const existingIndex = state.toasts.findIndex(t => t.customId === customId);
        if (existingIndex !== -1) {
          // Update existing toast
          const newToasts = [...state.toasts];
          const oldToast = newToasts[existingIndex];
          
          // Reset the timeout if it exists
          if (oldToast.timer) clearTimeout(oldToast.timer);
          
          const newId = oldToast.id;
          const timer = duration > 0 ? setTimeout(() => get().removeToast(newId), duration) : null;
          
          newToasts[existingIndex] = { ...oldToast, type, message, exiting: false, timer };
          return { toasts: newToasts };
        }
      }

      const id = ++toastIdCounter;
      const timer = duration > 0 ? setTimeout(() => get().removeToast(id), duration) : null;
      
      return {
        toasts: [...state.toasts, { id, customId, type, message, exiting: false, timer }],
      };
    });
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, exiting: true } : t
      ),
    }));
    
    // Wait for animation to finish before removing from state
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 300);
  },

  success: (msg, options) => get().addToast('success', msg, options),
  error: (msg, options) => get().addToast('error', msg, options || { duration: 6000 }),
  info: (msg, options) => get().addToast('info', msg, options),
  warning: (msg, options) => get().addToast('warning', msg, options),
}));
