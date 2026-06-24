import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  runOnJS,
  FadeInDown,
} from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Circle, G } from 'react-native-svg';
import { useAuthStore } from '@/store/useAuthStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { springPresets, easings } from '@/theme/motion';
import { preloadStaticAssets, preheatNetwork, startOptimisticDataPreload } from '@/utils/preload';
import { hapticFeedback } from '@/utils/haptics';
import { ReeWCharacter } from '@/components/ReeWCharacter';
import { GlassPanel } from '@/components/motion/GlassPanel';
import { useThemePalette } from '@/hooks/useThemePalette';

const { width } = Dimensions.get('window');

export default function StartupCoordinator() {
  const router = useRouter();
  const { isLoading: isAuthLoading, isAuthenticated, user } = useAuthStore();
  const { isOnboarded, resetOnboarding } = useOnboardingStore();
  const [isPreloadComplete, setIsPreloadComplete] = useState(false);
  const [hasTimeoutError, setHasTimeoutError] = useState(false);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  const palette = useThemePalette();
  const buttonTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  const bootstrapStatus = usePlaylistStateStore((s) => s.bootstrapStatus);
  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const isStoreReady = hasHydrated && (bootstrapStatus === 'completed' || bootstrapStatus === 'failed');

  const checkDatabaseAndSetTimeoutError = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const state = usePlaylistStateStore.getState();
    const currentStoreReady = state.hasHydrated && 
      (state.bootstrapStatus === 'completed' || state.bootstrapStatus === 'failed');

    if (currentStoreReady) {
      const cardCount = Object.keys(state.cardsById || {}).length;
      if (cardCount === 0) {
        setHasTimeoutError(true);
      } else {
        // We have local cached cards in the database; bypass connection error and proceed
        setIsPreloadComplete(true);
      }
    } else {
      // Store not ready yet. Subscribe and check once hydration completes/fails.
      unsubscribeRef.current = usePlaylistStateStore.subscribe((state) => {
        const ready = state.hasHydrated && 
          (state.bootstrapStatus === 'completed' || state.bootstrapStatus === 'failed');
        if (ready) {
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
          }
          const cardCount = Object.keys(state.cardsById || {}).length;
          if (cardCount === 0) {
            setHasTimeoutError(true);
          } else {
            setIsPreloadComplete(true);
          }
        }
      });
    }
  };

  const startTimeoutTimer = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }
    timeoutTimerRef.current = setTimeout(() => {
      checkDatabaseAndSetTimeoutError();
    }, 15000); // 15 seconds timeout
  };

  const clearTimeoutTimer = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  };

  const handleRetry = async () => {
    hapticFeedback.impactLight();
    setHasTimeoutError(false);
    
    try {
      const authStore = useAuthStore.getState();
      if (!authStore.isAuthenticated && authStore.isLoading) {
        await authStore.restoreSession();
      }
      
      const currentTrigger = usePlaylistStateStore.getState().syncTriggerCount || 0;
      usePlaylistStateStore.setState({ 
        bootstrapStatus: 'not_started',
        syncTriggerCount: currentTrigger + 1 
      });
    } catch (e) {
      console.warn('Retry sync error:', e);
    }
    
    startTimeoutTimer();
  };

  const handleRestartApp = () => {
    hapticFeedback.impactMedium();
    if (__DEV__) {
      try {
        const { DevSettings } = require('react-native');
        DevSettings.reload();
        return;
      } catch (e) {
        // ignore
      }
    }
    
    try {
      const Updates = require('expo-updates');
      if (Updates && typeof Updates.reloadAsync === 'function') {
        Updates.reloadAsync();
        return;
      }
    } catch (e) {
      // ignore
    }
    
    handleRetry();
  };

  // Animation Shared Values
  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(40);
  
  const textTranslateY = useSharedValue(20);
  const textOpacity = useSharedValue(0);

  // Already zoomed out background: starts at 1.0 immediately
  const glowScale = useSharedValue(1.0);
  const glowOpacity = useSharedValue(0);
  const glowTranslateX = useSharedValue(0);
  const glowTranslateY = useSharedValue(0);

  // Trigger state for the cinematic zoom-portal exit
  const isExiting = useSharedValue(0); // 0 = default, 1 = exiting

  useEffect(() => {
    // 1. PHASE 1: Cinematic soft entry sequence
    // background glow drifts in (already zoomed out scale=1.0)
    glowScale.value = withSpring(1.0, { damping: 20, stiffness: 60 });
    glowOpacity.value = withTiming(0.9, { duration: 1000 });

    // branding tile fades and springs up
    logoScale.value = withSpring(1.0, { damping: 14, stiffness: 90 });
    logoOpacity.value = withTiming(1.0, { duration: 900 });
    logoTranslateY.value = withSpring(0, { damping: 12, stiffness: 80 });

    // titles fade in sequentially with a subtle stagger
    textOpacity.value = withTiming(1.0, { duration: 1200 });
    textTranslateY.value = withSpring(0, { damping: 15, stiffness: 70 });

    // Tactile micro impact when splash launches
    hapticFeedback.impactLight();

    // 2. PHASE 2: Ambient breathing pulse (continuous, extremely slow & gentle)
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 12000, easing: easings.cubicBezier }),
        withTiming(0.97, { duration: 12000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
    
    // Slow, almost imperceptible drifting float for background canvas
    glowTranslateX.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 14000, easing: easings.cubicBezier }),
        withTiming(-8, { duration: 14000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
    glowTranslateY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 12000, easing: easings.cubicBezier }),
        withTiming(6, { duration: 12000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );

    // 3. EXECUTE STARTUP PIPELINE (Asset preloading ONLY — _layout.tsx handles restoreSession)
    const executePipeline = async () => {
      const startTime = Date.now();
      try {
        // Fire preheat in background without awaiting, so it does not block the splash screen
        preheatNetwork().catch(() => {});
        await preloadStaticAssets();
      } catch (e) {
        console.warn('Startup pipeline warning:', e);
      } finally {
        const elapsed = Date.now() - startTime;
        // Cinematic dwell time (minimum 2000ms to allow branding stabilization)
        const delay = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          setIsPreloadComplete(true);
        }, delay);
      }
    };

    executePipeline();
    startTimeoutTimer();
    return () => clearTimeoutTimer();
  }, []);

  // 4. PHASE 3 & 4: Exit sequence and Routing handoff
  useEffect(() => {
    const needsStoreReady = isAuthenticated || user?.id === 'guest-user';
    if (!isPreloadComplete || isAuthLoading) return;
    if (needsStoreReady && !isStoreReady) return;

    const performCinematicExit = () => {
      clearTimeoutTimer();
      // Set exit state
      isExiting.value = withTiming(1, { duration: 280, easing: easings.easeOutExpo });
      
      // Animate logo flying upward out of view
      logoScale.value = withSpring(0.7, springPresets.stiff);
      logoTranslateY.value = withTiming(-280, { duration: 250, easing: easings.easeInExpo });
      logoOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(handleNavigation)();
        }
      });

      // Animate text sliding downward out of view
      textTranslateY.value = withTiming(120, { duration: 250, easing: easings.easeInExpo });
      textOpacity.value = withTiming(0, { duration: 180 });

      // Animate background portal expanding dynamically
      glowScale.value = withTiming(3.2, { duration: 280, easing: easings.easeOutExpo });
      glowOpacity.value = withTiming(0, { duration: 280 });

      // Tactile notification sweep at handoff transition
      hapticFeedback.selection();
    };

    const handleNavigation = () => {
      const hasAccess = !!isAuthenticated || user?.id === 'guest-user';

      // Optimistically preload reels feeds for returning users
      if (hasAccess && isOnboarded) {
        startOptimisticDataPreload();
      }

      if (hasAccess) {
        router.replace('/(protected)/(tabs)/learn');
      } else {
        if (!isOnboarded) {
          router.replace('/(auth)/onboarding');
        } else {
          router.replace('/(auth)/login');
        }
      }
    };

    performCinematicExit();
  }, [isPreloadComplete, isAuthLoading, isStoreReady, isAuthenticated, user?.id, isOnboarded]);

  // Animated styles driven on the UI thread
  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: glowScale.value },
      { translateX: glowTranslateX.value },
      { translateY: glowTranslateY.value },
    ],
    opacity: glowOpacity.value,
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: logoScale.value },
      { translateY: logoTranslateY.value },
    ],
    opacity: logoOpacity.value,
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: textTranslateY.value }],
    opacity: textOpacity.value,
  }));

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* Dynamic Living Watercolor Background Canvas */}
      <Animated.View style={[StyleSheet.absoluteFill, glowAnimatedStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          <Defs>
            {/* Midnight Focus Gradient */}
            <RadialGradient id="midnightWash" cx="340" cy="120" rx="200" ry="200" fx="340" fy="120" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#0B132B" stopOpacity={0.45} />
              <Stop offset="50%" stopColor="#1C2541" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#FAF6F0" stopOpacity={0} />
            </RadialGradient>

            {/* Matcha Calm Gradient */}
            <RadialGradient id="matchaWash" cx="60" cy="300" rx="180" ry="180" fx="60" fy="300" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#A3BCA9" stopOpacity={0.45} />
              <Stop offset="60%" stopColor="#C2D3C6" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#FAF6F0" stopOpacity={0} />
            </RadialGradient>

            {/* Sunny Mountain Gradient */}
            <RadialGradient id="sunnyMountainWash" cx="200" cy="520" rx="220" ry="220" fx="200" fy="520" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#90E0EF" stopOpacity={0.4} />
              <Stop offset="50%" stopColor="#A7F3D0" stopOpacity={0.16} />
              <Stop offset="100%" stopColor="#FAF6F0" stopOpacity={0} />
            </RadialGradient>

            {/* Crimson Sunset Gradient */}
            <RadialGradient id="sunsetWash" cx="340" cy="460" rx="180" ry="180" fx="340" fy="460" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#F5A89A" stopOpacity={0.45} />
              <Stop offset="60%" stopColor="#FAD2CB" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#FAF6F0" stopOpacity={0} />
            </RadialGradient>

            {/* Japanese Zen Garden Gradient */}
            <RadialGradient id="zenWash" cx="80" cy="720" rx="200" ry="200" fx="80" fy="720" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#E8D6C5" stopOpacity={0.45} />
              <Stop offset="60%" stopColor="#FAF6F0" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#FAF6F0" stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Color Washes (Wet-on-wet Watercolor Bleeds) */}
          <Circle cx="340" cy="120" r="200" fill="url(#midnightWash)" />
          <Circle cx="60" cy="300" r="180" fill="url(#matchaWash)" />
          <Circle cx="200" cy="520" r="220" fill="url(#sunnyMountainWash)" />
          <Circle cx="340" cy="460" r="180" fill="url(#sunsetWash)" />
          <Circle cx="80" cy="720" r="200" fill="url(#zenWash)" />

          {/* 1. Midnight Focus Indicators (Moon & Constellation) */}
          <G opacity={0.8}>
            {/* Elegant Crescent Moon */}
            <Path 
              d="M 320 50 A 15 15 0 0 0 338 72 A 18 18 0 1 1 320 50 Z" 
              fill="rgba(254, 240, 138, 0.22)" 
              stroke="rgba(234, 179, 8, 0.5)" 
              strokeWidth={1.2} 
              strokeLinecap="round" 
            />
            {/* Star Constellation Lines */}
            <Path 
              d="M 270 60 L 295 80 L 330 115" 
              fill="none" 
              stroke="rgba(255, 255, 255, 0.35)" 
              strokeWidth={1} 
              strokeDasharray="3 3"
            />
            {/* Twinkling Stars */}
            <Circle cx="270" cy="60" r="2" fill="rgba(255, 255, 255, 0.6)" />
            <Circle cx="295" cy="80" r="2.5" fill="rgba(255, 255, 255, 0.6)" />
            <Circle cx="330" cy="115" r="2" fill="rgba(255, 255, 255, 0.6)" />
          </G>

          {/* 2. Matcha Calm Steaming Tea Cup & Leaves */}
          <G opacity={0.75}>
            {/* Tea Cup */}
            <Path 
              d="M 40 310 Q 70 310 100 310 L 92 335 Q 70 342 48 335 Z" 
              fill="rgba(255, 255, 255, 0.24)" 
              stroke="rgba(74, 112, 76, 0.45)" 
              strokeWidth={1.2} 
              strokeLinecap="round"
            />
            {/* Matcha Tea Level inside Bowl */}
            <Path 
              d="M 42 314 Q 70 314 98 314 L 95 320 Q 70 325 45 320 Z" 
              fill="rgba(139, 161, 141, 0.28)" 
            />
            {/* Steam Swirls */}
            <Path 
              d="M 55 295 Q 50 280 60 270" 
              fill="none" 
              stroke="rgba(163, 188, 169, 0.45)" 
              strokeWidth={1.2} 
              strokeLinecap="round"
            />
            <Path 
              d="M 72 298 Q 78 283 70 272" 
              fill="none" 
              stroke="rgba(163, 188, 169, 0.45)" 
              strokeWidth={1.2} 
              strokeLinecap="round"
            />
            <Path 
              d="M 85 295 Q 80 280 90 270" 
              fill="none" 
              stroke="rgba(163, 188, 169, 0.45)" 
              strokeWidth={1.2} 
              strokeLinecap="round"
            />
          </G>

          {/* 3. Sunny Mountain Sketched Peaks, Sun & Cloud */}
          <G opacity={0.75}>
            {/* Sunny Mountain Sun */}
            <Circle cx="240" cy="480" r="15" fill="rgba(251, 191, 36, 0.28)" stroke="rgba(217, 119, 6, 0.4)" strokeWidth={1.2} />
            {/* Sun Rays */}
            <Path d="M 240 460 L 240 455 M 240 500 L 240 505 M 220 480 L 215 480 M 260 480 L 265 480" stroke="rgba(217, 119, 6, 0.35)" strokeWidth={1.2} strokeLinecap="round" />
            <Path d="M 226 466 L 222 462 M 254 494 L 258 498 M 226 494 L 222 498 M 254 466 L 258 462" stroke="rgba(217, 119, 6, 0.35)" strokeWidth={1.2} strokeLinecap="round" />

            {/* Back Peak */}
            <Path 
              d="M 100 580 L 150 505 L 200 580 Z" 
              fill="rgba(12, 74, 110, 0.05)" 
              stroke="rgba(2, 132, 199, 0.3)" 
              strokeWidth={1.2} 
              strokeLinejoin="round"
            />
            <Path 
              d="M 137 525 L 150 505 L 163 525 Q 150 535 137 525 Z" 
              fill="rgba(255, 255, 255, 0.55)" 
            />

            {/* Front Peak */}
            <Path 
              d="M 160 610 L 215 520 L 270 610 Z" 
              fill="rgba(74, 112, 76, 0.06)" 
              stroke="rgba(74, 112, 76, 0.3)" 
              strokeWidth={1.2} 
              strokeLinejoin="round"
            />
            <Path 
              d="M 200 545 L 215 520 L 230 545 Q 215 555 200 545 Z" 
              fill="rgba(255, 255, 255, 0.55)" 
            />

            {/* Cute Cartoon Cloud */}
            <Path 
              d="M 125 490 C 120 480 135 470 145 478 C 150 465 170 468 172 480 C 182 480 185 492 178 496 C 178 496 125 496 125 490 Z" 
              fill="rgba(255, 255, 255, 0.85)" 
            />
          </G>

          {/* 4. Crimson Sunset Floating Autumn Maple Leaf */}
          <G opacity={0.75}>
            {/* Stem */}
            <Path 
              d="M 320 455 L 312 468" 
              fill="none" 
              stroke="rgba(77, 42, 32, 0.42)" 
              strokeWidth={1.2} 
            />
            {/* Maple Leaf contour */}
            <Path 
              d="M 320 455 Q 330 425 342 432 C 348 420 362 432 358 442 C 368 448 358 462 344 458 Q 328 472 320 455 Z" 
              fill="rgba(224, 90, 71, 0.22)" 
              stroke="rgba(77, 42, 32, 0.42)"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </G>

          {/* 5. Japanese Zen Garden Bamboo Stalk & Stone Ripples */}
          <G opacity={0.75}>
            {/* Sand Ripple circles */}
            <Circle 
              cx="85" 
              cy="735" 
              r="22" 
              fill="none" 
              stroke="rgba(140, 106, 92, 0.28)" 
              strokeWidth={1.2} 
            />
            <Circle 
              cx="85" 
              cy="735" 
              r="42" 
              fill="none" 
              stroke="rgba(140, 106, 92, 0.24)" 
              strokeWidth={1.2} 
              strokeDasharray="4 2"
            />
            <Circle 
              cx="85" 
              cy="735" 
              r="62" 
              fill="none" 
              stroke="rgba(140, 106, 92, 0.2)" 
              strokeWidth={1} 
              strokeDasharray="3 3"
            />
            {/* Zen Garden Pebble */}
            <Path 
              d="M 75 735 Q 85 725 95 735 Q 95 745 85 745 Q 75 745 75 735 Z" 
              fill="rgba(140, 106, 92, 0.24)" 
              stroke="rgba(62, 52, 49, 0.4)"
              strokeWidth={1.2}
            />

            {/* Bamboo Stalk Segment 1 */}
            <Path 
              d="M 30 760 L 30 680" 
              fill="none" 
              stroke="rgba(74, 112, 76, 0.48)" 
              strokeWidth={3} 
              strokeLinecap="round"
            />
            {/* Node line */}
            <Path d="M 27 680 L 33 680" fill="none" stroke="rgba(45, 59, 46, 0.48)" strokeWidth={1.5} />
            {/* Bamboo Stalk Segment 2 */}
            <Path 
              d="M 30 677 L 30 597" 
              fill="none" 
              stroke="rgba(74, 112, 76, 0.45)" 
              strokeWidth={2.8} 
              strokeLinecap="round"
            />
            {/* Bamboo Leaf 1 */}
            <Path 
              d="M 30 630 Q 55 615 75 625 M 30 630 Q 55 635 75 625" 
              fill="rgba(90, 110, 92, 0.2)" 
            />
            {/* Bamboo Leaf 2 */}
            <Path 
              d="M 30 670 Q 5 655 -15 660 M 30 670 Q 5 675 -15 660" 
              fill="rgba(90, 110, 92, 0.2)" 
            />
          </G>
        </Svg>
      </Animated.View>

      <View style={styles.content}>
        {/* Glowing Branding Tile */}
        <Animated.View style={[styles.logoContainer, logoAnimatedStyle, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Image
            source={require('../assets/icon213.png')}
            style={{ width: '100%', height: '100%', borderRadius: 24 }}
            contentFit="cover"
          />
        </Animated.View>

        {/* Cinematic Typographic Sequence */}
        <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>ReeWise</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Making revision convenient...</Text>
        </Animated.View>
      </View>

      {hasTimeoutError && (
        <View style={[styles.overlayContainer, { backgroundColor: palette.overlayBg }]}>
          <GlassPanel
            intensity={30}
            tint="light"
            borderColor={palette.border}
            borderRadius={32}
            style={StyleSheet.flatten([styles.timeoutCard, { backgroundColor: palette.dialogBg, borderColor: palette.border, shadowColor: palette.shadow }])}
          >
            <View style={styles.cardContent}>
              <ReeWCharacter state="cute_sad" size={88} disableIdleCycle={true} />
              
              <Text style={[styles.errorTitle, { color: palette.textPrimary }]}>Connection Issue</Text>
              
              <Text style={[styles.errorMessage, { color: palette.textSecondary }]}>
                We couldn't connect to the server. Please check your internet connection and restart the app.
              </Text>

              <View style={styles.buttonContainer}>
                <Pressable
                  onPress={handleRetry}
                  style={({ pressed }) => [
                    styles.retryButton,
                    { backgroundColor: palette.accent, shadowColor: palette.accentGlow },
                    pressed && { opacity: 0.8 }
                  ]}
                >
                  <Text style={[styles.retryButtonText, { color: buttonTextColor }]}>Retry Connection</Text>
                </Pressable>

                <Pressable
                  onPress={handleRestartApp}
                  style={({ pressed }) => [
                    styles.restartButton,
                    { borderColor: palette.accent },
                    pressed && { opacity: 0.8 }
                  ]}
                >
                  <Text style={[styles.restartButtonText, { color: palette.accent }]}>Restart App</Text>
                </Pressable>
              </View>
            </View>
          </GlassPanel>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    zIndex: 2,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'normal',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 'normal',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 24,
  },
  timeoutCard: {
    width: '100%',
    maxWidth: 340,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  cardContent: {
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  retryButton: {
    borderRadius: 16,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  restartButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});