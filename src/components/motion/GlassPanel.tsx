import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number; // Frosted blur strength
  tint?: 'light' | 'dark' | 'default';
  borderColor?: string;
  borderRadius?: number;
}

export function GlassPanel({
  children,
  style,
  intensity = 20,
  tint = 'dark',
  borderColor = 'rgba(255, 255, 255, 0.07)',
  borderRadius = 24,
}: GlassPanelProps) {
  
  // High-performance fallbacks for Frosted backdrops
  const getFrostedBackground = () => {
    if (tint === 'light') {
      return 'rgba(255, 255, 255, 0.65)';
    }
    if (tint === 'dark') {
      return 'rgba(15, 23, 42, 0.45)'; // Premium HSL dark slate
    }
    return 'rgba(30, 41, 59, 0.25)';
  };

  const getBlurView = () => {
    try {
      // Dynamic import to prevent crash if expo-blur is not bundled or platform-incompatible
      const { BlurView } = require('expo-blur');
      return (
        <BlurView
          intensity={intensity}
          tint={tint === 'default' ? 'default' : tint}
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius }
          ]}
        />
      );
    } catch {
      // Fallback frosted panel
      return (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: getFrostedBackground(),
              borderRadius,
            }
          ]}
        />
      );
    }
  };

  return (
    <View
      style={[
        styles.panel,
        {
          borderRadius,
          borderColor,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : getFrostedBackground(),
        },
        style,
      ]}
    >
      {/* Background Frosted layer */}
      {Platform.OS === 'ios' && getBlurView()}
      {Platform.OS !== 'ios' && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: getFrostedBackground(),
              borderRadius,
            }
          ]}
        />
      )}

      {/* Glow highlight and Content children */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 3,
  },
  content: {
    zIndex: 2,
  },
});
