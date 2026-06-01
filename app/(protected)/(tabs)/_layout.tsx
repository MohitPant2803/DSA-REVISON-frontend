import React, { useEffect } from 'react';
import { Platform, Pressable, View, LogBox, Vibration } from 'react-native';

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

import { BottomTabBar } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useUIStore } from '@/store/useUIStore';

// Suppress Lucide deep-import warnings caused by Metro package exports enforcement
LogBox.ignoreLogs(['Attempted to import the module', 'which is not listed in the "exports"']);

interface TabButtonProps {
  focused: boolean;
  icon: React.ReactNode;
  onPress?: any;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabButton({ focused, icon, onPress }: TabButtonProps) {
  return (
    <Pressable
      onPress={() => {
        lightHaptic(); // Trigger responsive tactile click instantly on tab tap
        if (onPress) onPress();
      }}
      style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 56, height: 46 }}>
        {/* Icon */}
        <View style={{ zIndex: 2, marginBottom: 2 }}>
          {icon}
        </View>
      </View>
    </Pressable>
  );
}

function TabLayoutInner() {
  // useAppBackHandler(); // This generic handler conflicts with the more specific one below.
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
      // Standard tabs or after reveal animation settles: show floating bottom tab bar instantly
      translateY.value = 0;
      opacity.value = 1;
    }
  }, [isReels, isReelsPlayer, isLearn, hasAppBeenAnimated]);

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
          tabBarButton: (props) => {
            const focused = isFolder || (isReelsPlayer && cameFromFolder.current) ? true : (isPlaylist ? false : isLearn);
            return (
              <TabButton
                focused={focused}
                onPress={props.onPress}
                icon={
                  <Home
                    color={focused ? '#0F172A' : '#94A3B8'}
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
                icon={
                  <Layers
                    color={focused ? '#0F172A' : '#94A3B8'}
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
                icon={
                  <Bookmark
                    color={focused ? '#0F172A' : '#94A3B8'}
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
  );
}

export default function TabLayout() {
  return <TabLayoutInner />;
}
