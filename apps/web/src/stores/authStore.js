import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: {
    id: 'usr_dev_default',
    name: 'Lead Engineer',
    email: 'dev@friday-edith.internal',
    role: 'DEVELOPER'
  },
  token: 'mock_bearer_token_for_session',
  isAuthenticated: true,
  setUser: (user, token) => set({ user, token, isAuthenticated: true }),
  logout: () => set({ user: null, token: null, isAuthenticated: false })
}));

