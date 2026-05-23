import React from 'react';
import { Pressable, PressableProps, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { hapticFeedback } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SuperchargedPressableProps extends PressableProps {
  children?: React.ReactNode;
  activeScale?: number;
  enableHaptics?: boolean;
  style?: any;
  activeBgColor?: string;
  inactiveBgColor?: string;
}

export function SuperchargedPressable({
  children,
  activeScale = 0.95,
  enableHaptics = true,
  style,
  activeBgColor,
  inactiveBgColor,
  ...props
}: SuperchargedPressableProps) {
  // Shared values
  const scale = useSharedValue(1);
  const pressActive = useSharedValue(0); // 0 (inactive) to 1 (active)

  // Handlers for touch states
  const handlePressIn = () => {
    // 1. Snappy physical press scale shrinkage
    scale.value = withSpring(activeScale, springPresets.stiff);
    pressActive.value = withTiming(1, { duration: 150 });

    // 2. Dynamic light tactile pressure tick
    if (enableHaptics) {
      hapticFeedback.impactLight();
    }
  };

  const handlePressOut = () => {
    // 1. Soft bouncy spring back to rest state
    scale.value = withSpring(1, springPresets.bouncy);
    pressActive.value = withTiming(0, { duration: 250 });

    // 2. Light exit tick
    if (enableHaptics) {
      hapticFeedback.selection();
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    // Dynamically interpolate color if parameters are passed
    const backgroundColor = activeBgColor && inactiveBgColor
      ? interpolateColor(
          pressActive.value,
          [0, 1],
          [inactiveBgColor, activeBgColor]
        )
      : undefined;

    return {
      transform: [{ scale: scale.value }],
      ...(backgroundColor ? { backgroundColor } : {}),
    } as any;
  });

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style as any]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
