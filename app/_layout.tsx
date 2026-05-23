import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryProvider } from "@/providers/QueryProvider";
import { useAuthStore } from "@/store/useAuthStore";
import '../global.css';  // ← only here

// ... rest of imports

import { useOnboardingStore } from "@/store/useOnboardingStore";

export default function RootLayout() {
  const { isAuthenticated, isLoading, restoreSession, user } = useAuthStore();
  const { isOnboarded } = useOnboardingStore();
  const segments = useSegments();
  const router = useRouter();

  // 1. Trigger session hydration on mount
  useEffect(() => {
    restoreSession();
  }, []);

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(protected)" />
          </Stack>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
