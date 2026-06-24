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
import { useWalkthroughStore } from "@/store/useWalkthroughStore";
// import * as SplashScreen from 'expo-splash-screen';

// singleton configuration guard to prevent native bridge desync
export function ensureGoogleConfigured() {
  if ((globalThis as any).__googleConfigured) return;

  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
  });

  (globalThis as any).__googleConfigured = true;
}

// Keep splash visible until auth state is resolved (removed)
// SplashScreen.preventAutoHideAsync();

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

import { useThemePalette } from "@/hooks/useThemePalette";

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
}

export default function RootLayout() {
  const { isAuthenticated, isLoading, restoreSession, user, token, logout, isLoggingOut } = useAuthStore();
  const { isOnboarded, isGeneratingSystem } = useOnboardingStore();
  const segments = useSegments();
  const router = useRouter();
  const palette = useThemePalette();

  // Retrieve Hydration Gate, Bootstrap status, and Sync indicators
  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const bootstrapStatus = usePlaylistStateStore((s) => s.bootstrapStatus);
  const lastSyncedRevision = usePlaylistStateStore((s) => s.lastSyncedRevision);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const syncProgressPercentage = usePlaylistStateStore((s) => s.syncProgressPercentage);
  const syncProgressStatus = usePlaylistStateStore((s) => s.syncProgressStatus);
  const isFirstTimeSyncInProgress = usePlaylistStateStore((s) => s.isFirstTimeSyncInProgress);
  const isGuest = user?.id === 'guest-user';

  // Strict store ready check: ensure local SQLite databases are fully loaded into Zustand memory partitions before allowing access
  const isStoreReady = isGuest || (hasHydrated && (bootstrapStatus === 'completed' || bootstrapStatus === 'failed'));

  // Strict initial sync check: disabled to allow instant zero-delay boots
  const isSyncGated = false;

  // 1. Unified Serialized Startup Pipeline: Database Ready -> Session Restored -> Hydrated
  useEffect(() => {
    ensureGoogleConfigured();

    (async () => {
      try {
        // Skip entire SQLite pipeline for guest users
        const authState = useAuthStore.getState();
        if (authState.user?.id === 'guest-user') {
          console.log('[RootLayout] Guest mode: Skipping SQLite bootstrap pipeline.');
          return;
        }
        const { initializeDatabase } = require('@/utils/appBootstrapGate');
        const { bootstrapHydrateFromSQLite } = require('@/store/usePlaylistStateStore');

        console.log('[RootLayout] Phase 1: Initializing SQLite database and schema...');
        await initializeDatabase();

        console.log('[RootLayout] Phase 2: Restoring user session credentials...');
        await restoreSession();

        // Explicit Phase 3 hydration safety guard to resolve boot race conditions
        const latestAuthState = useAuthStore.getState();
        if (latestAuthState.isAuthenticated && latestAuthState.user) {
          const storeState = usePlaylistStateStore.getState();
          if (storeState.bootstrapStatus === 'not_started') {
            console.log('[RootLayout] Phase 3: Explicitly hydrating Zustand store from SQLite...');
            await bootstrapHydrateFromSQLite(latestAuthState.user.id);
          }
        }
      } catch (err: any) {
        console.error('[RootLayout] Critical: Serialized startup pipeline failed:', err.message);
        usePlaylistStateStore.setState({ bootstrapStatus: 'failed' });
        useAuthStore.setState({ isLoading: false, isAuthReady: true });
      }
    })();
  }, []);

  const isOnboardingHydrated = useOnboardingStore((s) => s.hasHydrated);

  // 1a. Core Startup Reels Queue pre-warming gatekeeper
  useEffect(() => {
    if (isLoading || !isStoreReady || isGeneratingSystem || isGuest) return;

    InteractionManager.runAfterInteractions(async () => {
      // Task 4: Pre-warm reels feed queue silently
      try {
        const reelsFeedService = require('@/services/reelsFeedService');
        reelsFeedService.getReelFeedSlice(Date.now().toString())
          .then((slice: any) => {
            if (slice && slice.cardsSlice) {
              const store = usePlaylistStateStore.getState();
              store.hydratePlaylistCards('all', slice.cardsSlice);
            }
          })
          .catch(() => {});
      } catch (err) {
        if (__DEV__) console.log('[Startup Queue Pre-warm Error]', err);
      }
    });
  }, [isLoading, isStoreReady, isGeneratingSystem]);

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
        if (userId && userId !== 'guest-user') {
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

  // 2. Hydration Gate & SplashScreen Timing (disabled)

  // 3. Navigation Guard gating with isStoreReady
  useEffect(() => {
    // Prevent any optimistic redirects until auth and onboarding finishes loading
    if (isLoading || !isOnboardingHydrated) return;
    // Wait for store hydration only when user has access (needs data). After logout, skip this.
    if (!isStoreReady && isAuthenticated) return;
    if (isSyncGated) return;

    const isRoot = (segments as string[]).length === 0 || !segments[0];
    if (isRoot) return;

    const currentPath = segments.join('/');
    const isGuest = user?.id === 'guest-user';
    const isWalkthroughComplete = useWalkthroughStore.getState().isComplete;

    // Hard walkthrough navigation guard for guest users
    if (isGuest && !isWalkthroughComplete) {
      const walkthroughStep = useWalkthroughStore.getState().step;
      if (walkthroughStep !== 'none') {
        let allowed = false;
        if (walkthroughStep === 'point-reels') {
          allowed = currentPath === '(protected)/(tabs)/learn';
        } else if (walkthroughStep === 'reels-tutorial' || walkthroughStep === 'point-myspace') {
          allowed = currentPath === '(protected)/(tabs)/reels';
        } else if (['myspace-theme', 'myspace-settings-arrow', 'myspace-hard-focus'].includes(walkthroughStep)) {
          allowed = currentPath === '(protected)/(tabs)/personal';
        } else if (['playlist-reorder', 'playlist-remove', 'playlist-reminder', 'playlist-happy'].includes(walkthroughStep)) {
          allowed = currentPath === '(protected)/playlist/[playlistId]';
        }

        if (!allowed) {
          if (__DEV__) {
            console.warn(`[Walkthrough Guard] Blocking navigation attempt to /${currentPath} during step: ${walkthroughStep}`);
          }
          if (walkthroughStep === 'point-reels') {
            router.replace('/(protected)/(tabs)/learn');
          } else if (walkthroughStep === 'reels-tutorial' || walkthroughStep === 'point-myspace') {
            router.replace('/(protected)/(tabs)/reels');
          } else if (['myspace-theme', 'myspace-settings-arrow', 'myspace-hard-focus'].includes(walkthroughStep)) {
            router.replace('/(protected)/(tabs)/personal');
          } else if (['playlist-reorder', 'playlist-remove', 'playlist-reminder', 'playlist-happy'].includes(walkthroughStep)) {
            router.replace('/(protected)/playlist/hard');
          }
          return;
        }
      }
    }

    // Guest is only allowed if they haven't completed the walkthrough yet
    if (isGuest && isWalkthroughComplete) {
      logout();
      return;
    }

    const hasAccess = !!isAuthenticated || (isGuest && !isWalkthroughComplete);

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments as string[])[1] === 'onboarding';

    // Block all automatic redirects while onboarding exit transition is in-flight
    if (isGeneratingSystem) return;

    // 1. If not logged in, they must go to onboarding or login page
    if (!hasAccess && !inAuthGroup) {
      if (!isOnboarded) {
        router.replace("/(auth)/onboarding");
      } else {
        router.replace("/(auth)/login");
      }
      return;
    }

    // 2. If logged in and on an auth screen, redirect to protected tabs
    if (hasAccess && inAuthGroup && !isFirstTimeSyncInProgress) {
      if (!inOnboarding) {
        router.replace("/(protected)/(tabs)/learn");
      }
    }
  }, [isAuthenticated, isLoading, isStoreReady, isSyncGated, isGeneratingSystem, segments, user?.id, isOnboarded, isFirstTimeSyncInProgress]);

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

  // 5. Remote push notifications registration
  useEffect(() => {
    if (isLoading || !isStoreReady || !isAuthenticated || isGuest || !token) return;

    const setupPushNotifications = async () => {
      try {
        const { registerForPushNotificationsAsync } = require('@/services/notificationService');
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken) {
          const apiModule = require('@/services/api').default;
          await apiModule.put('/auth/push-token', { pushToken });
          if (__DEV__) {
            console.log('[Push Notifications] Push token successfully registered on backend');
          }
        }
      } catch (err: any) {
        console.warn('[Push Notifications] Registration failed:', err.message);
      }
    };

    setupPushNotifications();
  }, [isLoading, isStoreReady, isAuthenticated, isGuest, token]);

  // Show logout overlay first — before any other gates
  if (isLoggingOut) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={{ marginTop: 20, color: palette.textPrimary, fontSize: 18, fontWeight: '600', letterSpacing: -0.5 }}>
          Clearing local data...
        </Text>
        <Text style={{ marginTop: 8, color: palette.textSecondary, fontSize: 13, fontWeight: '500' }}>
          Securing your revision desk
        </Text>
      </View>
    );
  }

  if (!isStoreReady && (isLoading || isAuthenticated)) {
    return <AppSkeleton />;
  }
  // Initial sync gate overlay removed for instant, zero-delay booting

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={{ flex: 1, backgroundColor: palette.background }}>
        <QueryProvider>
          <SyncEngineMount />
          <StatusBar style={palette.isDark ? "light" : "dark"} />
          <View style={{ flex: 1, position: 'relative', backgroundColor: palette.background }}>
            <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: palette.background } }}>
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
