import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role?: 'user' | 'admin' | 'superadmin';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

function sanitizeUser(user: Partial<User> | null | undefined): User | null {
  if (!user) return null;
  const id = String(user.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    name: String(user.name ?? ''),
    email: String(user.email ?? ''),
    avatarUrl: user.avatarUrl ? String(user.avatarUrl) : undefined,
    role: user.role || 'user',
  };
}

function safeParseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return sanitizeUser(parsed);
  } catch {
    return null;
  }
}

const SecureStorage = {
  getToken: async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
    }
    return await SecureStore.getItemAsync('jwt_token');
  },
  setToken: async (token: string): Promise<void> => {
    if (!token) return;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.setItem('jwt_token', token);
      return;
    }
    await SecureStore.setItemAsync('jwt_token', token);
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
      return safeParseUser(user);
    }
    const user = await SecureStore.getItemAsync('user_data');
    return safeParseUser(user);
  },
  setUser: async (user: User): Promise<void> => {
    const safe = sanitizeUser(user);
    if (!safe) return;
    const userStr = JSON.stringify(safe);
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
  },
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (token: string, user: User) => {
    const safeUser = sanitizeUser(user);
    if (!safeUser || token == null) {
      throw new Error('Invalid login payload');
    }
    
    if (token) {
      await SecureStorage.setToken(token);
    } else {
      await SecureStorage.removeToken();
    }
    await SecureStorage.setUser(safeUser);
    set({ token, user: safeUser, isAuthenticated: safeUser.id !== 'guest-user', isLoading: false });
  },

  logout: async () => {
    await SecureStorage.removeToken();
    await SecureStorage.removeUser();
    
    // Clear resume progress
    const { useResumeStore } = require('@/store/useResumeStore');
    useResumeStore.getState().clearAll();
    
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },

  restoreSession: async () => {
    try {
      const user = await SecureStorage.getUser();
      if (user?.id === 'guest-user') {
        set({ token: '', user, isAuthenticated: false, isLoading: false });
        return;
      }

      const token = await SecureStorage.getToken();
      if (!token) {
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      set({ token, isLoading: true });

      const { getMe } = require('@/services/authService');
      
      // Race the server verification against a strict 3.5-second timeout for rapid startup recovery
      const getMeWithTimeout = Promise.race([
        getMe(),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 3500)
        )
      ]);

      const freshUser = await getMeWithTimeout;
      if (!freshUser) {
        await SecureStorage.removeToken();
        await SecureStorage.removeUser();
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      await SecureStorage.setUser(freshUser);
      set({ token, user: freshUser, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      console.warn('[Session Recovery] Failed to get fresh user from server:', error);
      
      const isAuthError = error?.status === 401 || error?.status === 403;

      if (!isAuthError) {
        // Recover session locally using cached token and user data without kicking out!
        const cachedUser = await SecureStorage.getUser();
        const cachedToken = await SecureStorage.getToken();
        
        if (cachedUser && cachedToken) {
          console.log('[Session Recovery] Successfully recovered session locally in Offline Mode!');
          set({ token: cachedToken, user: cachedUser, isAuthenticated: true, isLoading: false });
          return;
        }
      }

      // Genuine server/session deletion error: clear and log out
      await SecureStorage.removeToken();
      await SecureStorage.removeUser();
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
