import React, { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Tabs, useSegments } from 'expo-router';
import { Home, Layers, Bookmark } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface TabButtonProps {
  focused: boolean;
  icon: React.ReactNode;
  onPress?: any;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabButton({ focused, icon, onPress }: TabButtonProps) {
  const scale = useSharedValue(focused ? 1.08 : 0.95);
  const activeBgOpacity = useSharedValue(focused ? 1 : 0);
  const indicatorWidth = useSharedValue(focused ? 14 : 0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.08 : 0.95, {
      damping: 14,
      stiffness: 220,
    });
    activeBgOpacity.value = withSpring(focused ? 1 : 0, {
      damping: 15,
      stiffness: 180,
    });
    indicatorWidth.value = withSpring(focused ? 14 : 0, {
      damping: 12,
      stiffness: 200,
    });
  }, [focused]);

  const containerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const bgStyle = useAnimatedStyle(() => {
    return {
      opacity: activeBgOpacity.value,
      transform: [{ scale: activeBgOpacity.value }],
    };
  });

  const dotStyle = useAnimatedStyle(() => {
    return {
      width: indicatorWidth.value,
      opacity: focused ? 1 : 0,
    };
  });

  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[{ alignItems: 'center', justifyContent: 'center', width: 56, height: 46 }, containerStyle]}>
        {/* Dynamic active morph pill background */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 52,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(139, 92, 246, 0.12)',
            },
            bgStyle,
          ]}
        />
        
        {/* Icon */}
        <View style={{ zIndex: 2, marginBottom: 2 }}>
          {icon}
        </View>

        {/* Small Active Dot */}
        <Animated.View
          style={[
            {
              height: 3,
              borderRadius: 1.5,
              backgroundColor: '#8B5CF6',
              position: 'absolute',
              bottom: -2,
            },
            dotStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

function TabLayoutInner() {
  useAppBackHandler();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, 10) + 6; // Extra padding from bottom for detached floating dock resting on surface
  const segments = useSegments();
  const isReels = segments[segments.length - 1] === 'reels';

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 26, stiffness: 180 });
    opacity.value = withSpring(1, { damping: 22, stiffness: 150 });
  }, [isReels]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  return (
    <Tabs
      tabBar={(props) => (
        <Animated.View 
          style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 }, animatedStyle]}
          pointerEvents="auto"
        >
          <BottomTabBar {...props} />
        </Animated.View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false, // Cleaner visual appearance like VisionOS
        tabBarStyle: {
          position: 'absolute',
          bottom: dockBottom,
          left: 32,
          right: 32,
          height: 64,
          borderRadius: 36,
          backgroundColor: '#FFFFFF', // Solid pristine white
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.05)', // Reduced border visibility
          paddingTop: 4,
          paddingBottom: 4,
          elevation: 2,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.02,
          shadowRadius: 18,
        },
      }}
    >
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Home',
          tabBarButton: (props) => (
            <TabButton
              focused={props.accessibilityState?.selected ?? false}
              onPress={props.onPress}
              icon={
                <Home
                  color={props.accessibilityState?.selected ? '#8B5CF6' : '#94A3B8'}
                  size={20}
                  strokeWidth={props.accessibilityState?.selected ? 2.5 : 1.8}
                />
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarButton: (props) => (
            <TabButton
              focused={props.accessibilityState?.selected ?? false}
              onPress={props.onPress}
              icon={
                <Layers
                  color={props.accessibilityState?.selected ? '#8B5CF6' : '#94A3B8'}
                  size={20}
                  strokeWidth={props.accessibilityState?.selected ? 2.5 : 1.8}
                />
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="personal"
        options={{
          title: 'My Space',
          tabBarButton: (props) => (
            <TabButton
              focused={props.accessibilityState?.selected ?? false}
              onPress={props.onPress}
              icon={
                <Bookmark
                  color={props.accessibilityState?.selected ? '#8B5CF6' : '#94A3B8'}
                  size={20}
                  strokeWidth={props.accessibilityState?.selected ? 2.5 : 1.8}
                />
              }
            />
          ),
        }}
      />
      <Tabs.Screen name="reels-player" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="CreateRevisionScreen" options={{ href: null }} />
      <Tabs.Screen name="RevisionForm" options={{ href: null }} />
      <Tabs.Screen name="RevisionCard" options={{ href: null }} />
      <Tabs.Screen name="SlideStudio" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return <TabLayoutInner />;
}
