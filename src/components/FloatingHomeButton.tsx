import React from 'react';
import { StyleSheet, Pressable, View, Platform } from 'react-native';
import { Home } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';

export function FloatingHomeButton() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

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
      <View style={styles.outerRing}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            Platform.OS === 'ios' && styles.iosShadow,
            Platform.OS === 'android' && styles.androidShadow,
          ]}
        >
          <Home color="#0066FF" size={20} strokeWidth={2.3} />
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
    backgroundColor: '#DBEAFE',   // light blue fill
    borderWidth: 2.5,
    borderColor: '#1E3A8A',       // dark blue boundary
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',   // slightly lighter inner circle
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: '#BFDBFE',
    opacity: 0.95,
  },
  iosShadow: {
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  androidShadow: {
    elevation: 8,
  },
});
