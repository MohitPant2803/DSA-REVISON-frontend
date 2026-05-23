import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface SpringPressableProps extends PressableProps {
  children?: React.ReactNode;
  activeScale?: number;
}

export function SpringPressable({
  children,
  activeScale = 0.985,
  style,
  ...props
}: SpringPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(activeScale, {
      damping: 22,
      stiffness: 200,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 18,
      stiffness: 180,
    });
  };

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
