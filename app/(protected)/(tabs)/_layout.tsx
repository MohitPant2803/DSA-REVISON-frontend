import React, { useEffect } from 'react';
import { Platform, Pressable, View, LogBox, Vibration, StyleSheet } from 'react-native';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
import { WalkthroughOverlay } from '@/components/onboarding/WalkthroughOverlay';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};
import { Tabs, useSegments, useRouter } from 'expo-router';
import { Home, Layers, Bookmark } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { preloadReelsCore } from './reels';

import { BottomTabBar } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { useUIStore } from '@/store/useUIStore';
import { useThemePalette } from '@/hooks/useThemePalette';

// Suppress Lucide deep-import warnings caused by Metro package exports enforcement
LogBox.ignoreLogs(['Attempted to import the module', 'which is not listed in the "exports"']);

interface TabButtonProps {
  focused: boolean;
  icon: React.ReactNode;
  onPress?: any;
  disabled?: boolean;
  shouldPulse?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabButton({ focused, icon, onPress, disabled = false, shouldPulse = false }: TabButtonProps) {
  const pulseAnim = useSharedValue(1);

  React.useEffect(() => {
    if (shouldPulse) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 500 }),
          withTiming(1.0, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseAnim);
      pulseAnim.value = 1;
    }
    return () => cancelAnimation(pulseAnim);
  }, [shouldPulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseAnim.value,
    transform: [{ scale: interpolate(pulseAnim.value, [0.4, 1], [1.0, 1.25]) }]
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        lightHaptic(); // Trigger responsive tactile click instantly on tab tap
        if (onPress) onPress();
      }}
      style={{ 
        flex: 1, 
        height: '100%', 
        alignItems: 'center', 
        justifyContent: 'center',
        opacity: disabled && !shouldPulse ? 0.4 : 1
      }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 56, height: 46 }}>
        {/* Icon */}
        <Animated.View style={[{ zIndex: 2, marginBottom: 2 }, pulseStyle]}>
          {icon}
        </Animated.View>
      </View>
    </Pressable>
  );
}

function TabLayoutInner() {
  // useAppBackHandler(); // This generic handler conflicts with the more specific one below.
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, 10) + 6; // Extra padding from bottom for detached floating dock resting on surface
  const segments = useSegments();
  const isReels = segments[segments.length - 1] === 'reels';
  const isReelsPlayer = segments[segments.length - 1] === 'reels-player';
  const isLearn = segments[segments.length - 1] === 'learn';
  const isPersonal = segments[segments.length - 1] === 'personal';
  const isFolder = segments.some(seg => seg === 'folder');
  const isPlaylist = segments.some(seg => seg === 'playlist');
  console.log('SEGMENTS:', JSON.stringify(segments), '| isPlaylist:', isPlaylist);
  const { hasAppBeenAnimated } = useUIStore();
  const router = useRouter();
  const shouldFreezeTouches = isLearn && !hasAppBeenAnimated;

  const initializeWalkthrough = useWalkthroughStore((s) => s.initialize);
  const step = useWalkthroughStore((s) => s.step);
  const isComplete = useWalkthroughStore((s) => s.isComplete);
  const reelsShot = useWalkthroughStore((s) => s.reelsShot);

  useEffect(() => {
    if (hasAppBeenAnimated) {
      initializeWalkthrough();
    }
  }, [hasAppBeenAnimated]);

  useEffect(() => {
    // Preload Reels Core in the background to ensure instant tab switching in both debug and release
    preloadReelsCore();
  }, []);

  const cameFromPlaylist = React.useRef(false);
  const cameFromFolder = React.useRef(false);

  useEffect(() => {
    if (isPlaylist) cameFromPlaylist.current = true;
    if (!isPlaylist && !isReelsPlayer) cameFromPlaylist.current = false;
  }, [isPlaylist, isReelsPlayer]);

  useEffect(() => {
    if (isFolder) cameFromFolder.current = true;
    if (!isFolder && !isReelsPlayer) cameFromFolder.current = false;
  }, [isFolder, isReelsPlayer]);

  // Back navigation is handled by the global useAppBackHandler in (protected)/_layout.tsx
  // and each screen's own customOnBack handler. No competing BackHandler needed here.

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isReelsPlayer) {
      // Focused Immersive Session: hide the floating bottom dock instantly
      translateY.value = 120;
      opacity.value = 0;
    } else if (isLearn && !hasAppBeenAnimated) {
      // Typing/Typewriter Phase: keep the floating bottom dock completely hidden offscreen initially
      translateY.value = 120;
      opacity.value = 0;
    } else {
      // Standard tabs or after reveal animation settles: show floating bottom tab bar with an elegant spring bounce
      translateY.value = withSpring(0, { damping: 11, stiffness: 120, mass: 0.7 });
      opacity.value = withTiming(1, { duration: 600 });
    }
  }, [isReels, isReelsPlayer, isLearn, hasAppBeenAnimated]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  return (
    <View style={{ flex: 1 }}>
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
          tabBarShowLabel: false, // Cleaner visual appearance like VisionOS
          tabBarStyle: {
            position: 'absolute',
            bottom: dockBottom,
            left: 32,
            right: 32,
            height: 64,
            borderRadius: 36,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            paddingTop: 4,
            paddingBottom: 4,
            elevation: 4,
            shadowColor: palette.isDark ? '#000000' : '#0F172A',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: palette.isDark ? 0.25 : 0.05,
            shadowRadius: 18,
          },
        }}
      >
        <Tabs.Screen
          name="learn"
          options={{
            title: 'Home',
            tabBarButton: (props) => {
              const focused = isFolder || (isReelsPlayer && cameFromFolder.current) ? true : (isPlaylist ? false : isLearn);
              return (
                <TabButton
                  focused={focused}
                  onPress={props.onPress}
                  disabled={!isComplete}
                  icon={
                    <Home
                      color={focused ? palette.accent : palette.textSecondary}
                      size={20}
                      strokeWidth={focused ? 2.4 : 1.8}
                    />
                  }
                />
              );
            },
          }}
        />
        <Tabs.Screen
          name="reels"
          options={{
            title: 'Reels',
            tabBarButton: (props) => {
              const focused = isReels;
              return (
                <TabButton
                  focused={focused}
                  onPress={props.onPress}
                  disabled={!isComplete && step !== 'point-reels'}
                  shouldPulse={!isComplete && step === 'point-reels' && reelsShot === 2}
                  icon={
                    <Layers
                      color={focused ? palette.accent : palette.textSecondary}
                      size={20}
                      strokeWidth={focused ? 2.4 : 1.8}
                    />
                  }
                />
              );
            },
          }}
        />
        <Tabs.Screen
          name="personal"
          options={{
            title: 'My Space',
            tabBarButton: (props) => {
              const focused = isPlaylist || (isReelsPlayer && cameFromPlaylist.current) ? true : (isFolder ? false : isPersonal);
              return (
                <TabButton
                  focused={focused}
                  onPress={props.onPress}
                  disabled={!isComplete && step !== 'point-myspace'}
                  shouldPulse={!isComplete && step === 'point-myspace'}
                  icon={
                    <Bookmark
                      color={focused ? palette.accent : palette.textSecondary}
                      size={20}
                      strokeWidth={focused ? 2.4 : 1.8}
                    />
                  }
                />
              );
            },
          }}
        />
      </Tabs>
      <WalkthroughOverlay />
      {shouldFreezeTouches && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 10000 }]} pointerEvents="auto" />
      )}
    </View>
  );
}

export default function TabLayout() {
  return <TabLayoutInner />;
}
