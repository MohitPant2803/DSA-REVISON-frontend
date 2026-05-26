import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { QueryProvider } from "@/providers/QueryProvider";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { usePlaylistStateStore } from "@/store/usePlaylistStateStore";
import Toast from 'react-native-toast-message';
import '../global.css';  // ← only here
import { ExitConfirmationModal } from "@/components/ExitConfirmationModal";
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import NetInfo from '@react-native-community/netinfo';
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

export default function RootLayout() {
  const { isAuthenticated, isLoading, restoreSession, user, token, logout } = useAuthStore();
  const { isOnboarded } = useOnboardingStore();
  const segments = useSegments();
  const router = useRouter();

  // Retrieve Hydration Gate flag
  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);

  // 1. Trigger session restoration on mount
  useEffect(() => {
    ensureGoogleConfigured();
    restoreSession();
  }, []);

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

  // 2. Hydration Gate & SplashScreen Timing
  useEffect(() => {
    // Hide splash only when BOTH Zustand and Auth session rehydrations are fully complete
    if (!isLoading && hasHydrated) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, hasHydrated]);

  const isGuest = user?.id === 'guest-user';

  // 3. Navigation Guard gating with hasHydrated
  useEffect(() => {
    // Prevent any optimistic redirects until both auth and Zustand hydration finish!
    if (isLoading || !hasHydrated) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments as string[])[1] === 'onboarding';
    const hasAccess = !!isAuthenticated || isGuest;

    if (!isOnboarded) {
      if (!inOnboarding) {
        router.replace("/(auth)/onboarding");
      }
      return;
    }

    if (!hasAccess && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (hasAccess && inAuthGroup) {
      router.replace("/(protected)/(tabs)/learn");
    }
  }, [isAuthenticated, isLoading, hasHydrated, segments, user?.id, isGuest, isOnboarded]);

  // 4. Silent Background token expiration checking
  useEffect(() => {
    if (isLoading || !hasHydrated) return;

    const checkTokenExpiryGracefully = async () => {
      const expired = isTokenExpired(token);
      if (expired && token) {
        const netState = await NetInfo.fetch();
        const online = netState.isConnected === true;
        if (online) {
          if (__DEV__) console.log('[Auth Layout] Token expired while online. Logging out...');
          await logout();
          router.replace("/(auth)/login");
        } else {
          if (__DEV__) console.log('[Auth Layout] Token expired while offline. Study studies allowed...');
          Toast.show({
            type: 'info',
            text1: 'Sync Temporarily Suspended',
            text2: "Please sign in next time you are online to backup your progress.",
            position: 'top',
            autoHide: false,
          });
        }
      }
    };

    if (isAuthenticated) {
      checkTokenExpiryGracefully();
    }
  }, [isAuthenticated, isLoading, hasHydrated, token]);

  // Prevent rendering stacked routes before store hydration is solved
  if (!hasHydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryProvider>
          <SyncEngineMount />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(protected)" options={{ animation: 'none' }} />
          </Stack>
          <Toast />
          <ExitConfirmationModal />
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
