import { Stack } from "expo-router";
import { useThemePalette } from "@/hooks/useThemePalette";

export default function AuthLayout() {
  const palette = useThemePalette();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: palette.background } }} />
  );
}

