import { useEffect, useState, useRef } from "react";
import { View, Text, ActivityIndicator, Animated, StyleSheet, Image, InteractionManager, AppState } from "react-native";
import { syncManager } from "@/utils/syncManager";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { QueryProvider } from "@/providers/QueryProvider";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { usePlaylistStateStore } from "@/store/usePlaylistStateStore";
import { AppSkeleton } from "@/components/AppSkeleton";
import Toast from 'react-native-toast-message';
import '../global.css';  // ← only here
import { ExitConfirmationModal } from "@/components/ExitConfirmationModal";
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { isNetworkConnected } from '@/utils/network';
import * as Linking from 'expo-linking';

import { useOnboardingStore } from "@/store/useOnboardingStore";
import * as SplashScreen from 'expo-splash-screen';

// singleton configuration guard to prevent native bridge desync
export function ensureGoogleConfigured() {
  if ((globalThis as any).__googleConfigured) return;

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
  });

  (globalThis as any).__googleConfigured = true;
}

// Keep splash visible until auth state is resolved
SplashScreen.preventAutoHideAsync();

const decodeBase64 = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const str = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let output = '';
  
  if (str.length % 4 === 1) {
    return '';
  }
  
  let buffer = 0;
  let bc = 0;
  
  for (let idx = 0; idx < str.length; idx++) {
    const char = str.charAt(idx);
    const pos = chars.indexOf(char);
    if (pos === -1) continue;
    
    buffer = bc % 4 ? (buffer << 6) + pos : pos;
    
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (buffer >> ((-2 * bc) & 6)));
    }
  }
  
  return output;
};

const isTokenExpired = (token: string | null) => {
  if (!token) return true;
  try {
    const base64Url = token.split('.')[1];
    const decodedBase64 = decodeBase64(base64Url);
    if (!decodedBase64) return true;
    const jsonPayload = decodeURIComponent(
      decodedBase64
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    return decoded.exp < Date.now() / 1000;
  } catch (e) {
    return true;
  }
};

// Removed speculative HTTP ping checkApiOnline and replaced with NetInfo cache checks

function SyncEngineMount() {
  useSyncEngine();
  return null;
}

function ToastWrapper() {
  try {
    const { useSafeAreaInsets } = require('react-native-safe-area-context');
    const insets = useSafeAreaInsets();
    return <Toast bottomOffset={insets.bottom + 80} topOffset={Math.max(insets.top, 40) + 10} />;
  } catch (e) {
    return <Toast />;
  }
}export default function RootLayout() {
  const { isAuthenticated, isLoading, restoreSession, user, token, logout, isLoggingOut } = useAuthStore();
  const { isOnboarded, isGeneratingSystem } = useOnboardingStore();
  const segments = useSegments();
  const router = useRouter();

  // Retrieve Hydration Gate, Bootstrap status, and Sync indicators
  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const bootstrapStatus = usePlaylistStateStore((s) => s.bootstrapStatus);
  const lastSyncedRevision = usePlaylistStateStore((s) => s.lastSyncedRevision);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const syncProgressPercentage = usePlaylistStateStore((s) => s.syncProgressPercentage);
  const syncProgressStatus = usePlaylistStateStore((s) => s.syncProgressStatus);
  const isGuest = user?.id === 'guest-user';

  // Strict store ready check: ensure local SQLite databases are fully loaded into Zustand memory partitions before allowing access
  const isStoreReady = hasHydrated && (bootstrapStatus === 'completed' || bootstrapStatus === 'failed');

  // Strict initial sync check: disabled to allow instant zero-delay boots
  const isSyncGated = false;

  // 1. Trigger session restoration on mount
  useEffect(() => {
    ensureGoogleConfigured();
    restoreSession();
  }, []);

  const isOnboardingHydrated = useOnboardingStore((s) => s.hasHydrated);

  // 1a. Core Startup Synchronization progress gatekeeper (Trigger background silent sync on startup)
  useEffect(() => {
    if (isLoading || !isStoreReady || isGeneratingSystem) return;

    InteractionManager.runAfterInteractions(async () => {
      const isConnected = await isNetworkConnected();
      const needsSync = isAuthenticated && !isGuest && token;

      if (isConnected && needsSync) {
        if (__DEV__) console.log('[Startup Sync] Triggering silent background sync after interactions...');
        try {
          await syncManager.sync();
        } catch (err: any) {
          console.log('[Startup Sync Error] Silent sync failed:', err.message);
        }
      }

      // Task 4: Pre-warm reels feed queue silently
      try {
        const reelsFeedService = require('@/services/reelsFeedService');
        reelsFeedService.getReelFeedSlice(Date.now().toString())
          .then((slice: any) => {
            if (slice && slice.cardsSlice) {
              const store = usePlaylistStateStore.getState();
              store.hydratePlaylistCards('all', slice.cardsSlice);
              
              // Pre-hydrate first 10 card explanation details from SQLite database
              const prewarmCount = Math.min(slice.cardsSlice.length, 10);
              for (let i = 0; i < prewarmCount; i++) {
                const card = slice.cardsSlice[i];
                if (card && card._id) {
                  store.hydrateCardContentOnDemand(card._id).catch(() => {});
                }
              }
            }
          })
          .catch(() => {});
      } catch (err) {
        if (__DEV__) console.log('[Startup Queue Pre-warm Error]', err);
      }
    });
  }, [isLoading, isStoreReady, isGeneratingSystem, isAuthenticated, isGuest, token, lastSyncedRevision]);

  // 1b. Intercept Deep Links on startup and store in targetDeepLink if not authenticated
  const incomingUrl = Linking.useURL();
  useEffect(() => {
    if (incomingUrl) {
      const parsed = Linking.parse(incomingUrl);
      console.log('[Deep Linking] Intercepted link path:', parsed.path);
      if (parsed.path && !isAuthenticated) {
        useAuthStore.getState().setTargetDeepLink(parsed.path);
      }
    }
  }, [incomingUrl, isAuthenticated]);

  // 1c. Unified App Close/Background Exit Persistence Hook
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        const userId = usePlaylistStateStore.getState().userId || "guest-user";
        if (userId) {
          if (__DEV__) {
            console.log("[Root AppState] App suspending/backgrounded. Flushing all Zustand states to SQLite...");
          }
          const { flushAllZustandToSQLite } = require("@/utils/sqliteSyncBridge");
          await flushAllZustandToSQLite(userId);
        }
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // 2. Hydration Gate & SplashScreen Timing
  useEffect(() => {
    // Hide splash only when BOTH Zustand and Auth session rehydrations are fully complete
    // And if initial sync is required, wait until it has synced!
    if (!isLoading && isStoreReady && !isSyncGated) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, isStoreReady, isSyncGated]);

  // 3. Navigation Guard gating with isStoreReady
  useEffect(() => {
    // Prevent any optimistic redirects until auth and onboarding finishes loading
    if (isLoading || !isOnboardingHydrated) return;
    // Wait for store hydration only when user has access (needs data). After logout, skip this.
    if (!isStoreReady && (isAuthenticated || isGuest)) return;
    if (isSyncGated) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments as string[])[1] === 'onboarding';
    const hasAccess = !!isAuthenticated || isGuest;

    // Only block navigation during onboarding generation — not globally
    if (isGeneratingSystem && inOnboarding) return;

    // 1. If not onboarded and not logged in, they must go to onboarding first
    if (!isOnboarded && !hasAccess) {
      if (!inOnboarding) {
        router.replace("/(auth)/onboarding");
      }
      return;
    }

    // 2. If onboarded but not logged in, they must go to login
    if (!hasAccess && !inAuthGroup) {
      router.replace("/(auth)/login");
    } 
    // 3. If logged in and on an auth screen, redirect to protected tabs
    else if (hasAccess && inAuthGroup) {
      if (!inOnboarding) {
        router.replace("/(protected)/(tabs)/learn");
      }
    }
  }, [isAuthenticated, isLoading, isStoreReady, isSyncGated, isGeneratingSystem, segments, user?.id, isGuest, isOnboarded]);

  // 4. Silent Background token expiration checking
  useEffect(() => {
    if (isLoading || !isStoreReady || isSyncGated) return;

    const checkTokenExpiryGracefully = async () => {
      const expired = isTokenExpired(token);
      if (expired && token) {
        const online = await isNetworkConnected();
        if (online) {
          if (__DEV__) console.log('[Auth Layout] Token expired. Attempting silent credential refresh...');
          const refreshed = await useAuthStore.getState().silentTokenRefresh();
          if (refreshed) {
            if (__DEV__) console.log('[Auth Layout] Token refreshed successfully. Session extended.');
            return; // Don't logout — token was refreshed
          }
          
          // Silent refresh failed — proceed with logout
          console.warn('[Auth Layout] Token expired and silent refresh failed. Logging out.');
          await logout();
          router.replace("/(auth)/login");
        } else {
          if (__DEV__) console.log('[Auth Layout] Token expired while offline. Study session allowed...');
        }
      }
    };

    if (isAuthenticated) {
      checkTokenExpiryGracefully();
    }
  }, [isAuthenticated, isLoading, isStoreReady, isSyncGated, token]);

  // Show logout overlay first — before any other gates
  if (isLoggingOut) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FAF9F7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={{ marginTop: 20, color: '#0B1327', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }}>
          Clearing local data...
        </Text>
        <Text style={{ marginTop: 8, color: '#7F8A9E', fontSize: 13, fontWeight: '600' }}>
          Securing your revision desk
        </Text>
      </View>
    );
  }

  // Prevent rendering stacked routes before store hydration is solved
  // But after logout (!isAuthenticated && !isLoading), skip the gate so nav guard can redirect to login
  if (!isStoreReady && (isLoading || isAuthenticated)) {
    return <AppSkeleton />;
  }
  // Initial sync gate overlay removed for instant, zero-delay booting

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryProvider>
          <SyncEngineMount />
          <StatusBar style="dark" />
          <View style={{ flex: 1, position: 'relative' }}>
            <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(protected)" options={{ animation: 'none' }} />
            </Stack>
          </View>
          <ToastWrapper />
          <ExitConfirmationModal />
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
