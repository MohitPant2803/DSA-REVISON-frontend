import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { FloatingHomeButton } from '@/components/FloatingHomeButton';

function StackWithBack() {
  useAppBackHandler();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', animationTypeForReplace: 'pop' }}>
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="admin" />
      <Stack.Screen name="playlist/[playlistId]" />
      <Stack.Screen name="folder/[folderId]" />
      <Stack.Screen name="reels-player" options={{ gestureEnabled: true }} />
      <Stack.Screen name="CreateRevisionScreen" />
      <Stack.Screen name="RevisionForm" />
      <Stack.Screen name="RevisionCard" />
      <Stack.Screen name="dev" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}

export default function ProtectedLayout() {
  return (
    <View style={{ flex: 1 }}>
      <StackWithBack />
      <FloatingHomeButton />
    </View>
  );
}