import { Stack } from 'expo-router';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

function StackWithBack() {
  useAppBackHandler();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationTypeForReplace: 'pop' }}>
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="admin" />
      <Stack.Screen name="domains/[id]" />
      <Stack.Screen name="playlist/[playlistId]" />
      <Stack.Screen name="folder/[folderId]" />
      <Stack.Screen name="reels-player" options={{ gestureEnabled: false }} />
      <Stack.Screen name="CreateRevisionScreen" />
      <Stack.Screen name="RevisionForm" />
      <Stack.Screen name="RevisionCard" />
      <Stack.Screen name="dev" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}

export default function ProtectedLayout() {
  return <StackWithBack />;
}