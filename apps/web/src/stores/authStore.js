import { create } from 'zustand';
import { apiFetch, safeParseJson } from '../lib/apiClient';
import { useFridayStore } from './fridayStore';

/**
 * Memory-only session mirror backed by HttpOnly auth cookies on the Node API.
 * Never persists bearer tokens in localStorage or sessionStorage.
 */
export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isCheckingSession: true,

  setUser: (user) =>
    set({
      user: user || null,
      isAuthenticated: Boolean(user),
      isCheckingSession: false
    }),

  bootstrapSession: async () => {
    set({ isCheckingSession: true });
    try {
      const res = await apiFetch('/v1/auth/me', { method: 'GET' });
      if (res.ok) {
        const payload = await safeParseJson(res);
        const user = payload?.data?.user || null;
        if (user) {
          set({ user, isAuthenticated: true, isCheckingSession: false });
          return true;
        }
      }
    } catch {
      // Treat network failure during bootstrap cleanly as unauthenticated
    }

    set({ user: null, isAuthenticated: false, isCheckingSession: false });
    return false;
  },

  logout: async () => {
    try {
      await apiFetch('/v1/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // Still clear local session mirror if API call fails
    } finally {
      useFridayStore.getState().newChat();
      set({ user: null, isAuthenticated: false, isCheckingSession: false });
    }
  }
}));
