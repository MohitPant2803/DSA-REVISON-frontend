import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryProvider } from "@/providers/QueryProvider";
import { useAuthStore } from "@/store/useAuthStore";
import '../global.css';  // ← only here

// ... rest of imports

export default function RootLayout() {
  const { isAuthenticated, isLoading, restoreSession, user } = useAuthStore();
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
    const hasAccess = !!isAuthenticated || isGuest;

    // If no access (neither auth nor guest) and trying to enter protected area
    if (!hasAccess && !inAuthGroup) {
      router.replace("/(auth)/login");
    } 
    // If we have access and are still hanging out in the auth group
    else if (hasAccess && inAuthGroup) {
      router.replace("/(protected)/(tabs)/learn");
    }
  }, [isAuthenticated, isLoading, segments, user?.id, isGuest]);

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
