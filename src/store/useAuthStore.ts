import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import NetInfo from '@react-native-community/netinfo';
import api from '@/services/api';

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
  isAuthReady: boolean;
  isSessionExpired: boolean;
  targetDeepLink: string | null;
  setTargetDeepLink: (link: string | null) => void;
  setSessionExpired: (expired: boolean) => void;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  silentTokenRefresh: () => Promise<boolean>;
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
  isAuthReady: false,
  isSessionExpired: false,
  targetDeepLink: null,

  setTargetDeepLink: (link) => set({ targetDeepLink: link }),
  setSessionExpired: (expired) => set({ isSessionExpired: expired }),

  login: async (token: string, user: User) => {
    const safeUser = sanitizeUser(user);
    if (!safeUser || token == null) {
      throw new Error('Invalid login payload');
    }
    
    // Proactive Synchronous Account-Switching Flush Guard
    const oldUser = get().user;
    if (oldUser && oldUser.id !== safeUser.id) {
      console.log('[AuthStore] Account switch detected! Sync purging old user session data...');
      
      // WIPE other store states in-memory synchronously to prevent leakage before new session
      const { usePlaylistStateStore } = require('./usePlaylistStateStore');
      usePlaylistStateStore.getState().hardResetStore();
      
      const { useResumeStore } = require('./useResumeStore');
      useResumeStore.getState().clearAll();
      
      const { useTrackingStore } = require('./useTrackingStore');
      useTrackingStore.getState().resetSession();

      // WIPE our own auth state synchronously first so that no components render with old user
      set({ token: null, user: null, isAuthenticated: false, isSessionExpired: false, isAuthReady: false });
    }

    if (token) {
      await SecureStorage.setToken(token);
    } else {
      await SecureStorage.removeToken();
    }
    await SecureStorage.setUser(safeUser);
    set({ token, user: safeUser, isAuthenticated: safeUser.id !== 'guest-user', isLoading: false, isAuthReady: true, isSessionExpired: false });
  },

  logout: async () => {
    await SecureStorage.removeToken();
    await SecureStorage.removeUser();
    
    // Clear resume progress
    const { useResumeStore } = require('@/store/useResumeStore');
    useResumeStore.getState().clearAll();
    
    set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: false, isSessionExpired: false });
  },

  restoreSession: async () => {
    try {
      // Synchronously retrieve cached network state via NetInfo
      const netState = await NetInfo.fetch();
      const isOffline = netState.isConnected === false;

      // Parallelize storage retrievals to resolve startup waterfalls
      const [user, token] = await Promise.all([
        SecureStorage.getUser(),
        SecureStorage.getToken()
      ]);

      if (isOffline) {
        if (user && token) {
          console.log('[Session Recovery] Network offline. Instantly recovered cached session locally! (<50ms)');
          set({ token, user, isAuthenticated: user.id !== 'guest-user', isLoading: false, isAuthReady: true, isSessionExpired: false });
          return;
        }
        // Offline but no credentials, route as guest or logged out
        set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
        return;
      }

      if (user?.id === 'guest-user') {
        set({ token: '', user, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
        return;
      }

      if (!token) {
        set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
        return;
      }

      set({ token, isLoading: true });

      const { getMe } = require('@/services/authService');
      
      let freshUser = null;
      try {
        // Race the server verification against a strict 3.5-second timeout for rapid startup recovery
        const getMeWithTimeout = Promise.race([
          getMe(),
          new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 3500)
          )
        ]);
        freshUser = await getMeWithTimeout;
      } catch (err: any) {
        console.warn('[Session Recovery] Network/Timeout error during restoration:', err);
        const isNetworkError = 
          err.message?.includes('Network request failed') || 
          err.message?.includes('Network Error') ||
          err.code === 'ERR_NETWORK' ||
          err.message === 'Connection timeout';

        if (isNetworkError) {
          // INSTANT local session recovery when completely offline/airplane mode (<50ms local path)
          const cachedUser = await SecureStorage.getUser();
          const cachedToken = await SecureStorage.getToken();
          
          if (cachedUser && cachedToken) {
            console.log('[Session Recovery] Successfully recovered session locally in Offline Mode!');
            set({ token: cachedToken, user: cachedUser, isAuthenticated: true, isLoading: false, isAuthReady: true, isSessionExpired: false });
            return;
          }
        }
        throw err; // Re-throw other genuine auth errors
      }

      if (!freshUser) {
        await SecureStorage.removeToken();
        await SecureStorage.removeUser();
        set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
        return;
      }

      await SecureStorage.setUser(freshUser);
      set({ token, user: freshUser, isAuthenticated: true, isLoading: false, isAuthReady: true, isSessionExpired: false });
    } catch (error: any) {
      console.warn('[Session Recovery] Failed to restore session:', error);
      
      // Genuine server/session deletion error: clear and log out
      await SecureStorage.removeToken();
      await SecureStorage.removeUser();
      set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
    }
  },

  silentTokenRefresh: async () => {
    try {
      console.log('[AuthStore] Proactively silently refreshing Google credentials...');
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signInSilently();
      
      if (userInfo.type === 'success') {
        const { idToken } = userInfo.data;
        if (!idToken) throw new Error('No ID Token returned during silent sign-in.');

        const res = await api.post('/auth/google', { idToken });
        const { token, user: rawUser } = res.data.data;
        
        const user = {
          id: rawUser._id,
          name: rawUser.name,
          email: rawUser.email,
          avatarUrl: rawUser.profilePicture,
          role: rawUser.role,
        };

        await SecureStorage.setToken(token);
        await SecureStorage.setUser(user);
        set({ token, user, isAuthenticated: true, isSessionExpired: false, isAuthReady: true });
        console.log('[AuthStore] Proactive silent token refresh successful!');
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[AuthStore] Proactive silent refresh failed:', err);
      return false;
    }
  },
}));
