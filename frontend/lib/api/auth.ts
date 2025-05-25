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

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      throw new Error('Invalid credentials');
    }

    return response.json();
  },

  logout: async (): Promise<void> => {
    if (isMockMode()) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return;
    }

    const token = getAuthToken();
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to logout');
    }
  },
}; 