import React from 'react';
import { StyleSheet, Pressable, View, Platform } from 'react-native';
import { Home } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

export function FloatingHomeButton() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();

  // Show button only on folder detail screens
  const isVisible =
    pathname.startsWith('/folder/') &&
    !pathname.includes('reels-player');

  if (!isVisible) {
    return null;
  }

  const handlePress = () => {
    // Navigate straight to home (Learn tab)
    router.replace('/(protected)/(tabs)/learn');
  };

  // Calculate dynamic bottom position avoiding system safe areas perfectly
  const bottomPosition = Math.max(insets.bottom, 16) + 24;

  return (
    <View
      style={[
        styles.container,
        {
          bottom: bottomPosition,
          right: 24,
        },
      ]}
    >
      <View style={[styles.outerRing, { backgroundColor: addAlpha(palette.accent, 0.12), borderColor: palette.accent }]}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.surface },
            pressed && { backgroundColor: palette.inputBg },
            Platform.OS === 'ios' && [styles.iosShadow, { shadowColor: palette.shadow }],
            Platform.OS === 'android' && styles.androidShadow,
          ]}
        >
          <Home color={palette.accent} size={20} strokeWidth={2.3} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  outerRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosShadow: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  androidShadow: {
    elevation: 8,
  },
});
