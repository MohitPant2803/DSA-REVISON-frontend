import { Stack } from 'expo-router';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

function StackWithBack() {
  useAppBackHandler();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="domains/[id]" />
    </Stack>
  );
}

export default function ProtectedLayout() {
  return <StackWithBack />;
}