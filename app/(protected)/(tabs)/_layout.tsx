import React, { useEffect } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Tabs, useSegments } from 'expo-router';
import { Home, Layers, Bookmark } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useUIStore } from '@/store/useUIStore';

interface TabButtonProps {
  focused: boolean;
  icon: (isFocused: boolean) => React.ReactNode;
  onPress?: any;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabButton({ focused, icon, onPress }: TabButtonProps) {
  const scale = useSharedValue(focused ? 1.08 : 0.95);
  const activeBgOpacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    scale.value = focused ? 1.08 : 0.95;
    activeBgOpacity.value = focused ? 1 : 0;
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
              backgroundColor: 'rgba(15, 23, 42, 0.05)',
              borderWidth: 1,
              borderColor: 'rgba(15, 23, 42, 0.08)',
            },
            bgStyle,
          ]}
        />
        
        {/* Icon */}
        <View style={{ zIndex: 2, marginBottom: 2 }}>
          {icon(focused)}
        </View>

      </Animated.View>
    </Pressable>
  );
}

function TabLayoutInner() {
  useAppBackHandler();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  
  const isTablet = width > 768;
  const tabWidth = 420;
  const horizontalMargin = isTablet ? (width - tabWidth) / 2 : 32;
  
  const dockBottom = Math.max(insets.bottom, 10) + 6; // Extra padding from bottom for detached floating dock resting on surface
  const segments = useSegments();
  const isReels = segments[segments.length - 1] === 'reels';
  const isReelsPlayer = segments[segments.length - 1] === 'reels-player';
  const isLearn = segments[segments.length - 1] === 'learn';
  const isPersonal = segments[segments.length - 1] === 'personal';
  const { hasAppBeenAnimated } = useUIStore();

  const translateY = useSharedValue(120);

  useEffect(() => {
    const easeOut = Easing.bezier(0.16, 1, 0.3, 1); // Premium smooth Apple ease-out curve

    if (isReelsPlayer) {
      // Focused Immersive Session: slide down and hide the floating bottom dock
      translateY.value = withTiming(120, { duration: 350, easing: easeOut });
    } else if (isLearn && !hasAppBeenAnimated) {
      // Typing/Typewriter Phase: keep the floating bottom dock completely hidden offscreen initially
      translateY.value = 120;
    } else {
      // Standard tabs: slide floating bottom tab bar back up into focus with absolute zero bounce
      translateY.value = withTiming(0, { duration: 450, easing: easeOut });
    }
  }, [isReels, isReelsPlayer, isLearn, hasAppBeenAnimated]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Tabs
      tabBar={(props) => (
        <Animated.View 
          style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100 }, animatedStyle]}
          pointerEvents={isReelsPlayer ? "none" : "auto"} // Allow scroll taps to pass through transparent tab bar region
        >
          <BottomTabBar {...props} />
        </Animated.View>
      )}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarShowLabel: false, // Cleaner visual appearance like VisionOS
        tabBarStyle: {
          position: 'absolute',
          bottom: dockBottom,
          left: horizontalMargin,
          right: horizontalMargin,
          height: 64,
          borderRadius: 36,
          backgroundColor: '#FFFFFF', // Solid pristine white
          borderWidth: 1,
          borderColor: 'rgba(15, 23, 42, 0.08)', // Reduced border visibility to elegant slate
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
              focused={isLearn}
              onPress={props.onPress}
              icon={(isFocused) => (
                <Home
                  color={isFocused ? '#0F172A' : '#94A3B8'}
                  size={20}
                  strokeWidth={isFocused ? 2.4 : 1.8}
                />
              )}
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
              focused={isReels}
              onPress={props.onPress}
              icon={(isFocused) => (
                <Layers
                  color={isFocused ? '#0F172A' : '#94A3B8'}
                  size={20}
                  strokeWidth={isFocused ? 2.4 : 1.8}
                />
              )}
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
              focused={isPersonal}
              onPress={props.onPress}
              icon={(isFocused) => (
                <Bookmark
                  color={isFocused ? '#0F172A' : '#94A3B8'}
                  size={20}
                  strokeWidth={isFocused ? 2.4 : 1.8}
                />
              )}
            />
          ),
        }}
      />
      <Tabs.Screen name="reels-player" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="CreateRevisionScreen" options={{ href: null }} />
      <Tabs.Screen name="RevisionForm" options={{ href: null }} />
      <Tabs.Screen name="RevisionCard" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return <TabLayoutInner />;
}
