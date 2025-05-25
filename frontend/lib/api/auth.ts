import { api } from '@/lib/api';

export interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImage?: string;
  };
  token: string;
}

const getAuthToken = () => {
  const cookie = document.cookie.split('; ').find(row => row.startsWith('session='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

const mockUser = {
  id: '1',
  email: 'demo@larkx.ai',
  firstName: 'John',
  lastName: 'Doe',
  profileImage: 'https://api.dicebear.com/7.x/avatars/svg?seed=John'
};

const isMockMode = () => true;

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    if (isMockMode()) {
      await new Promise(resolve => setTimeout(resolve, 800));
      if (credentials.email === 'demo@larkx.ai' && credentials.password === 'demo123') {
        return {
          user: mockUser,
          token: btoa(JSON.stringify({ userId: mockUser.id }))
        };
      }
      throw new Error('Invalid credentials');
    }

    return api.auth.login(credentials);
  },

  logout: async (): Promise<void> => {
    if (isMockMode()) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return;
    }

    const token = getAuthToken();
    if (!token) {
      throw new Error('No auth token found');
    }
    
    await api.auth.logout(token);
  },
};

export const login = async (credentials: { email: string; password: string }) => {
  return api.auth.login(credentials);
}; 