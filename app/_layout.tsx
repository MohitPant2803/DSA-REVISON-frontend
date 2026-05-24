import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { QueryProvider } from "@/providers/QueryProvider";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import Toast from 'react-native-toast-message';
import '../global.css';  // ← only here

import { useOnboardingStore } from "@/store/useOnboardingStore";
import * as SplashScreen from 'expo-splash-screen';

// Keep splash visible until auth state is resolved
SplashScreen.preventAutoHideAsync();

const isTokenExpired = (token: string | null) => {
  if (!token) return true;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
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

const checkApiOnline = async () => {
  try {
    const healthUrl = `${process.env.EXPO_PUBLIC_API_URL}/health`;
    const res = await fetch(healthUrl, { method: 'GET' });
    return res.status === 200;
  } catch (e) {
    return false;
  }
};

function SyncEngineMount() {
  useSyncEngine();
  return null;
}

export default function RootLayout() {
  const { isAuthenticated, isLoading, restoreSession, user, token, logout } = useAuthStore();
  const { isOnboarded } = useOnboardingStore();
  const segments = useSegments();
  const router = useRouter();

  // 1. Trigger session hydration on mount
  useEffect(() => {
    restoreSession();
  }, []);

  // Hide splash only once auth is done loading
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  const isGuest = user?.id === 'guest-user';

  useEffect(() => {
    // Do not redirect until auth state has finished hydrating
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = (segments as string[])[1] === 'onboarding';
    const hasAccess = !!isAuthenticated || isGuest;

    // Guard 1: If onboarding has not been completed, funnel them to the onboarding sequence
    if (!isOnboarded) {
      if (!inOnboarding) {
        router.replace("/(auth)/onboarding");
      }
      return;
    }

    // Guard 2: If onboarding is complete, but they have no session and try to access protected area
    if (!hasAccess && !inAuthGroup) {
      router.replace("/(auth)/login");
    } 
    // Guard 3: If they are fully authenticated and lingering in the auth group, send to Home Page
    else if (hasAccess && inAuthGroup) {
      router.replace("/(protected)/(tabs)/learn");
    }
  }, [isAuthenticated, isLoading, segments, user?.id, isGuest, isOnboarded]);

  // 3. Gracefully manage token expiry for offline-first support
  useEffect(() => {
    if (isLoading) return;

    const checkTokenExpiryGracefully = async () => {
      const expired = isTokenExpired(token);
      if (expired && token) {
        // Token is expired! Let's check if we are online
        const online = await checkApiOnline();
        if (online) {
          console.log('[Auth Layout] Token expired while online. Logging out...');
          await logout();
          router.replace("/(auth)/login");
        } else {
          console.log('[Auth Layout] Token expired while offline. Allowing graceful study bypass...');
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
  }, [isAuthenticated, isLoading, token]);

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
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
