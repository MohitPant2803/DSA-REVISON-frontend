import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// 1. Type Definitions
export interface User {
  id: string;        // backend returns _id
  name: string;
  email: string;
  avatarUrl?: string; // backend returns profilePicture
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean; // Useful for showing splash screens while restoring session
  
  // Actions
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

// 2. Scalable Storage Abstraction
// SecureStore is purely for mobile. For Next.js/Web, we fallback to a web-compatible API
// without breaking the mobile implementation.
const SecureStorage = {
  getToken: async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      // Future Web Auth: Can be localStorage or HttpOnly cookies
      return typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
    }
    return await SecureStore.getItemAsync('jwt_token');
  },
  setToken: async (token: any): Promise<void> => {
    if (token === undefined || token === null) return;
    const safeToken = typeof token === 'string' ? token : JSON.stringify(token);
    if (!safeToken) return;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.setItem('jwt_token', safeToken);
      return;
    }
    await SecureStore.setItemAsync('jwt_token', safeToken);
  },
  removeToken: async (): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.removeItem('jwt_token');
      return;
    }
    await SecureStore.deleteItemAsync('jwt_token');
  },
  getUser: async (): Promise<User | null> => {
    if (Platform.OS === 'web') {
      const user = typeof window !== 'undefined' ? localStorage.getItem('user_data') : null;
      return user ? JSON.parse(user) : null;
    }
    const user = await SecureStore.getItemAsync('user_data');
    return user ? JSON.parse(user) : null;
  },
  setUser: async (user: User): Promise<void> => {
    if (!user) return;
    const userStr = JSON.stringify(user);
    if (!userStr) return;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.setItem('user_data', userStr);
      return;
    }
    await SecureStore.setItemAsync('user_data', userStr);
  },
  removeUser: async (): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.removeItem('user_data');
      return;
    }
    await SecureStore.deleteItemAsync('user_data');
  }
};

// 3. Zustand Store Initialization
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true, // Start true while we figure out if they have an active session

  login: async (token: string, user: User) => {
    try {
      await SecureStorage.setToken(token);
      
      // Sanitize: ensure clean serializable object
      const safeUser: User = {
        id: String(user?.id || ''),
        name: String(user?.name || ''),
        email: String(user?.email || ''),
        avatarUrl: user.avatarUrl ? String(user.avatarUrl) : undefined,
      };
      await SecureStorage.setUser(safeUser);
      
      set({ token, user: safeUser, isAuthenticated: true });
    } catch (error) {
      console.error('Failed to securely store authentication token', error);
      throw error;
    }
  },

  logout: async () => {
    await SecureStorage.removeToken();
    await SecureStorage.removeUser();
    set({ token: null, user: null, isAuthenticated: false });
  },

  restoreSession: async () => {
    try {
      const token = await SecureStorage.getToken();
      const user = await SecureStorage.getUser();
      
      if (token) {
        // Note: Ideally, you should verify this token with your backend (e.g., GET /me)
        // to fetch fresh user details and ensure it hasn't expired.
        set({ token, user, isAuthenticated: true, isLoading: false });
      } else {
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to restore session from SecureStore', error);
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  }
}));