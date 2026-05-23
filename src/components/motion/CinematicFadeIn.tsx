import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';

interface CinematicFadeInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  translateYOffset?: number;
  style?: ViewStyle;
}

export function CinematicFadeIn({
  children,
  delay = 0,
  translateYOffset = 24,
  style,
}: CinematicFadeInProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(translateYOffset);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSpring(1, { ...springPresets.gentle, stiffness: 120 } as any)
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, springPresets.gentle)
    );
  }, [delay, translateYOffset]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Avoid absolute layouts to prevent rendering flow bugs
  },
});
