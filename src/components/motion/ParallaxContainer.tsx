import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';

interface ParallaxContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  // Multipliers for layer speeds
  bgSpeed?: number;
  midSpeed?: number;
  fgSpeed?: number;
}

export function ParallaxContainer({
  children,
  style,
  bgSpeed = 0.06,
  midSpeed = 0.14,
  fgSpeed = 0.26,
}: ParallaxContainerProps) {
  // Shared drag offsets
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  // Gesture handler tracking touch coords
  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      dragX.value = e.translationX;
      dragY.value = e.translationY;
    })
    .onEnd(() => {
      // Spring back to center smoothly with high damping snappy preset
      dragX.value = withSpring(0, springPresets.gentle);
      dragY.value = withSpring(0, springPresets.gentle);
    });

  // Animated styles representing the layered depth offsets
  const bgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value * bgSpeed },
      { translateY: dragY.value * bgSpeed },
    ],
  }));

  const midAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value * midSpeed },
      { translateY: dragY.value * midSpeed },
    ],
  }));

  const fgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value * fgSpeed },
      { translateY: dragY.value * fgSpeed },
    ],
  }));

  // Helper layers
  const backgroundLayer = React.Children.toArray(children).find(
    (child: any) => child.props?.layer === 'background'
  );
  const midgroundLayer = React.Children.toArray(children).find(
    (child: any) => child.props?.layer === 'midground'
  );
  const foregroundLayer = React.Children.toArray(children).find(
    (child: any) => child.props?.layer === 'foreground' || !child.props?.layer
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.card, style]}>
        {/* Background layer */}
        {backgroundLayer && (
          <Animated.View style={[StyleSheet.absoluteFillObject, bgAnimatedStyle]}>
            {backgroundLayer}
          </Animated.View>
        )}

        {/* Midground layer */}
        {midgroundLayer && (
          <Animated.View style={[StyleSheet.absoluteFillObject, midAnimatedStyle, styles.zIndexMid]}>
            {midgroundLayer}
          </Animated.View>
        )}

        {/* Foreground (Default Content) layer */}
        {foregroundLayer && (
          <Animated.View style={[styles.foregroundContainer, fgAnimatedStyle]}>
            {foregroundLayer}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zIndexMid: {
    zIndex: 2,
  },
  foregroundContainer: {
    zIndex: 3,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
