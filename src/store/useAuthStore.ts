import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { isNetworkConnected } from '@/utils/network';
import api from '@/services/api';
import offlineSeed from '../constants/offlineSeed.json';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role?: 'user' | 'admin' | 'superadmin';
  totalSwipes?: number;
  totalScrolls?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthReady: boolean;
  isSessionExpired: boolean;
  targetDeepLink: string | null;
  isLoggingOut: boolean;
  sessionGenerationId: number;
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
    totalSwipes: typeof user.totalSwipes === 'number' ? user.totalSwipes : 0,
    totalScrolls: typeof user.totalScrolls === 'number' ? user.totalScrolls : 0,
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

export async function getOrCreateInstallationUUID(): Promise<string> {
  const INSTALLATION_UUID_KEY = 'installation_uuid';
  try {
    let uuid = await SecureStore.getItemAsync(INSTALLATION_UUID_KEY);
    if (!uuid) {
      uuid = `uuid-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      await SecureStore.setItemAsync(INSTALLATION_UUID_KEY, uuid);
    }
    return uuid;
  } catch {
    return 'default-fallback-uuid';
  }
}

async function alignStoreUserSession(targetUserId: string, serverSwipes: number = 0, serverScrolls: number = 0) {
  const { usePlaylistStateStore, bootstrapHydrateFromSQLite } = require('./usePlaylistStateStore');
  const currentUserId = usePlaylistStateStore.getState().userId;
  
  const effectiveCurrentId = currentUserId || 'guest-user';
  const effectiveTargetId = targetUserId || 'guest-user';
  
  if (effectiveCurrentId === effectiveTargetId) {
    console.log(`[AuthStore] Session already aligned for user: ${effectiveTargetId}. Skipping hard reset.`);
    
    if (currentUserId !== targetUserId) {
      usePlaylistStateStore.setState({ userId: targetUserId });
    }
    
    // Preheat encryption key for synchronous decryption
    try {
      const { initializeEncryptionKey } = require('@/utils/sqliteSyncBridge');
      await initializeEncryptionKey();
    } catch (err) {
      console.warn('[AuthStore] Failed eager encryption key preheat:', err);
    }
    
    // Trigger bootstrap hydration asynchronously so we don't block
    bootstrapHydrateFromSQLite(targetUserId, serverSwipes, serverScrolls).catch((err: any) => {
      console.error('[AuthStore] Failed to bootstrap hydrate aligned session:', err);
    });
    return;
  }

  console.log(`[AuthStore] Aligning local stores for user session: ${targetUserId} (Server Swipes: ${serverSwipes}, Scrolls: ${serverScrolls})`);
  
  // Wipe other store states in-memory synchronously to prevent leakage before new session
  usePlaylistStateStore.getState().hardResetStore();
  
  const { useResumeStore } = require('./useResumeStore');
  useResumeStore.getState().clearAll();
  
  const { useTrackingStore } = require('./useTrackingStore');
  useTrackingStore.getState().resetSession();
  useTrackingStore.getState().setReelsSession({
    sessionId: null,
    sessionCards: [],
    activeIndex: 0,
    sourceType: null,
    sourceId: null,
  });

  // Set new userId in store
  usePlaylistStateStore.setState({ userId: targetUserId });

  // Preheat encryption key for synchronous decryption
  try {
    const { initializeEncryptionKey } = require('@/utils/sqliteSyncBridge');
    await initializeEncryptionKey();
  } catch (err) {
    console.warn('[AuthStore] Failed eager encryption key preheat:', err);
  }

  // Trigger bootstrap hydration
  await bootstrapHydrateFromSQLite(targetUserId, serverSwipes, serverScrolls);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  isAuthReady: false,
  isSessionExpired: false,
  targetDeepLink: null,
  isLoggingOut: false,
  sessionGenerationId: 0,

  setTargetDeepLink: (link) => set({ targetDeepLink: link }),
  setSessionExpired: (expired) => set({ isSessionExpired: expired }),

  login: async (token: string, user: User) => {
    const safeUser = sanitizeUser(user);
    if (!safeUser || token == null) {
      throw new Error('Invalid login payload');
    }
    
    // Proactive Synchronous Account-Switching and Metrics Hydration Guard
    await alignStoreUserSession(safeUser.id, safeUser.totalSwipes || 0, safeUser.totalScrolls || 0);

    if (safeUser.id !== 'guest-user') {
      if (token) {
        await SecureStorage.setToken(token);
      } else {
        await SecureStorage.removeToken();
      }
      await SecureStorage.setUser(safeUser);
    } else {
      await SecureStorage.removeToken();
      await SecureStorage.removeUser();
    }
    set({ token, user: safeUser, isAuthenticated: safeUser.id !== 'guest-user', isLoading: false, isAuthReady: true, isSessionExpired: false });
  },

  logout: async () => {
    set({ isLoggingOut: true });

    const isGuest = get().user?.id === 'guest-user';

    // Synchronous guest stores & state cleanup at the very beginning to prevent hydration races
    if (isGuest) {
      try {
        const { usePlaylistStateStore } = require('./usePlaylistStateStore');
        usePlaylistStateStore.getState().hardResetStore();

        const { useResumeStore } = require('@/store/useResumeStore');
        useResumeStore.getState().clearAll();

        const { useTrackingStore } = require('./useTrackingStore');
        useTrackingStore.getState().resetSession();
        useTrackingStore.getState().setReelsSession({
          sessionId: null,
          sessionCards: [],
          activeIndex: 0,
          sourceType: null,
          sourceId: null,
        });
        useTrackingStore.getState().setMetrics({ totalSwipes: 0, totalScrolls: 0, unsyncedSwipes: 0, unsyncedScrolls: 0 });

        const { useUserPreferencesStore } = require('./useUserPreferencesStore');
        useUserPreferencesStore.getState().resetToDefault();

        const { useWalkthroughStore } = require('./useWalkthroughStore');
        useWalkthroughStore.setState({ step: 'none', isComplete: false });

        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.removeItem('guest-dsa-reels-walkthrough-complete');
        await AsyncStorage.removeItem('guest-dsa-reels-tutorial-complete');
      } catch (resetErr) {
        console.warn('[AuthStore] Guest synchronous reset error:', resetErr);
      }

      await SecureStorage.removeToken();
      await SecureStorage.removeUser();
      set((state) => ({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isAuthReady: false,
        isSessionExpired: false,
        isLoggingOut: false,
        sessionGenerationId: state.sessionGenerationId + 1,
      }));
      return;
    }

    // Check for pending unsynced work before destroying session
    const pendingCount = (() => {
      try {
        const { usePlaylistStateStore } = require('./usePlaylistStateStore');
        return usePlaylistStateStore.getState().offlineActionQueue.length;
      } catch { return 0; }
    })();
    if (pendingCount > 0) {
      console.warn(`[AuthStore] Logging out with ${pendingCount} unsynced actions in queue!`);
      // Attempt emergency flush before logout
      try {
        const { usePlaylistStateStore } = require('./usePlaylistStateStore');
        const queue = usePlaylistStateStore.getState().offlineActionQueue;
        if (queue.length > 0) {
          const token = get().token;
          if (token) {
            const apiModule = require('@/services/api').default;
            await Promise.race([
              apiModule.post('/sync/actions', { actions: queue }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Emergency flush timeout')), 5000)),
            ]);
            console.log('[AuthStore] Emergency queue flush succeeded before logout.');
            usePlaylistStateStore.getState().removeProcessedActions(queue.map((a: any) => a.id));
          }
        }
      } catch (flushErr) {
        console.warn('[AuthStore] Emergency flush failed. Queue preserved for next login.', flushErr);
      }
    }

    // Attempt full catalog sync before logout so playlist truth reaches MongoDB.
    try {
      const token = get().token;
      if (token) {
        const { syncManager } = require('@/utils/syncManager');
        await Promise.race([
          syncManager.sync(true),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Emergency catalog sync timeout')), 5000)),
        ]);
        console.log('[AuthStore] Emergency catalog sync succeeded before logout.');
      }
    } catch (catalogErr) {
      console.warn('[AuthStore] Emergency catalog sync failed before logout:', catalogErr);
    }

    // Attempt emergency analytics sync before logout
    try {
      const { syncAnalyticsOnly } = require('../hooks/useSyncEngine');
      const token = get().token;
      if (token) {
        await Promise.race([
          syncAnalyticsOnly(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Emergency analytics sync timeout')), 3000)),
        ]);
        console.log('[AuthStore] Emergency analytics sync succeeded before logout.');
      }
    } catch (analyticsErr) {
      console.warn('[AuthStore] Emergency analytics sync failed before logout:', analyticsErr);
    }

    // Clear only in-memory/session state. SQLite rows are partitioned by userId and must remain
    // available so switching accounts does not mix or lose local Personal tab data.
    try {
      const { usePlaylistStateStore } = require('./usePlaylistStateStore');
      usePlaylistStateStore.getState().hardResetStore();
      
      const { useResumeStore } = require('@/store/useResumeStore');
      useResumeStore.getState().clearAll();
      
      const { useTrackingStore } = require('./useTrackingStore');
      useTrackingStore.getState().resetSession();
      useTrackingStore.getState().setReelsSession({
        sessionId: null,
        sessionCards: [],
        activeIndex: 0,
        sourceType: null,
        sourceId: null,
      });
      useTrackingStore.getState().setMetrics({ totalSwipes: 0, totalScrolls: 0, unsyncedSwipes: 0, unsyncedScrolls: 0 });

      const { useUserPreferencesStore } = require('./useUserPreferencesStore');
      useUserPreferencesStore.getState().resetToDefault();

      const { useWalkthroughStore } = require('./useWalkthroughStore');
      useWalkthroughStore.setState({ step: 'none', isComplete: false });
    } catch (sqlPurgeErr) {
      console.warn('[AuthStore] Local memory reset error during logout:', sqlPurgeErr);
    }

    await SecureStorage.removeToken();
    await SecureStorage.removeUser();
    set((state) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isAuthReady: false,
      isSessionExpired: false,
      isLoggingOut: false,
      sessionGenerationId: state.sessionGenerationId + 1,
    }));
  },

  restoreSession: async () => {
    try {
      // Retrieve cached network state via isNetworkConnected utility
      const isConnected = await isNetworkConnected();
      const isOffline = !isConnected;

      // Parallelize storage retrievals to resolve startup waterfalls
      const [user, token] = await Promise.all([
        SecureStorage.getUser(),
        SecureStorage.getToken()
      ]);

      if (isOffline) {
        if (user && token && user.id !== 'guest-user') {
          await alignStoreUserSession(user.id, user.totalSwipes || 0, user.totalScrolls || 0);
          console.log('[Session Recovery] Network offline. Instantly recovered cached session locally! (<50ms)');
          set({ token, user, isAuthenticated: user.id !== 'guest-user', isLoading: false, isAuthReady: true, isSessionExpired: false });
          return;
        }
        // Offline but no credentials or is guest-user, route as guest or logged out
        if (user?.id === 'guest-user') {
          await SecureStorage.removeToken();
          await SecureStorage.removeUser();
        }
        set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
        return;
      }

      if (user?.id === 'guest-user') {
        await SecureStorage.removeToken();
        await SecureStorage.removeUser();
        set({ token: null, user: null, isAuthenticated: false, isLoading: false, isAuthReady: true, isSessionExpired: false });
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
          
          if (cachedUser && cachedToken && cachedUser.id !== 'guest-user') {
            await alignStoreUserSession(cachedUser.id, cachedUser.totalSwipes || 0, cachedUser.totalScrolls || 0);
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

      await alignStoreUserSession(freshUser.id, freshUser.totalSwipes || 0, freshUser.totalScrolls || 0);
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
      const userInfo = await Promise.race([
        GoogleSignin.signInSilently(),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Google silent signin timeout')), 3500)
        )
      ]);
      
      if (userInfo.type === 'success') {
        const { idToken } = userInfo.data;
        if (!idToken) throw new Error('No ID Token returned during silent sign-in.');

        const { usePlaylistStateStore } = require('./usePlaylistStateStore');
        const { deviceId, logicalClockSequence } = usePlaylistStateStore.getState();
        const clockEpoch = String(logicalClockSequence || 0);

        const res = await api.post('/auth/google', { idToken, deviceId, clockEpoch });
        const { token, user: rawUser } = res.data.data;
        
        const user = {
          id: rawUser._id,
          name: rawUser.name,
          email: rawUser.email,
          avatarUrl: rawUser.profilePicture,
          role: rawUser.role,
          totalSwipes: rawUser.totalSwipes || 0,
          totalScrolls: rawUser.totalScrolls || 0,
        };

        await alignStoreUserSession(user.id, user.totalSwipes || 0, user.totalScrolls || 0);
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
