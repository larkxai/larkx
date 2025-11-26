import { create } from 'zustand'
import { authApi, LoginCredentials, SignupPayload } from '@/lib/api/auth'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  profileImage?: string
}

// Cookie handling utilities
const setCookie = (name: string, value: string, days = 7) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

const deleteCookie = (name: string) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

type AuthStore = {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,
  
  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const { user, token } = await authApi.login(credentials);
      setCookie('session', token);
      set({ user, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout();
      deleteCookie('session');
      set({ user: null, isLoading: false });
      window.location.href = '/login';
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signup: async (payload) => {
    set({ isLoading: true });
    try {
      const { user, token } = await authApi.signup(payload);
      setCookie('session', token);
      set({ user, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
})); 