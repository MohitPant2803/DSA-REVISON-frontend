import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
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
import { useAuthStore } from '@/store/useAuthStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { springPresets, easings } from '@/theme/motion';
import { preloadStaticAssets, preheatNetwork, startOptimisticDataPreload } from '@/utils/preload';
import { hapticFeedback } from '@/utils/haptics';

const { width } = Dimensions.get('window');

export default function StartupCoordinator() {
  const router = useRouter();
  const { restoreSession, isLoading: isAuthLoading, isAuthenticated, user } = useAuthStore();
  const { isOnboarded, resetOnboarding } = useOnboardingStore();
  const [isPreloadComplete, setIsPreloadComplete] = useState(false);

  // Animation Shared Values
  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(40);
  
  const textTranslateY = useSharedValue(20);
  const textOpacity = useSharedValue(0);

  const glowScale = useSharedValue(0.6);
  const glowOpacity = useSharedValue(0);
  const glowTranslateX = useSharedValue(0);
  const glowTranslateY = useSharedValue(0);

  // Trigger state for the cinematic zoom-portal exit
  const isExiting = useSharedValue(0); // 0 = default, 1 = exiting

  useEffect(() => {
    // 1. PHASE 1: Cinematic soft entry sequence
    // background glow drifts in
    glowScale.value = withSpring(1.0, { damping: 20, stiffness: 60 });
    glowOpacity.value = withTiming(0.25, { duration: 1000 });

    // branding tile fades and springs up
    logoScale.value = withSpring(1.0, { damping: 14, stiffness: 90 });
    logoOpacity.value = withTiming(1.0, { duration: 900 });
    logoTranslateY.value = withSpring(0, { damping: 12, stiffness: 80 });

    // titles fade in sequentially with a subtle stagger
    textOpacity.value = withTiming(1.0, { duration: 1200 });
    textTranslateY.value = withSpring(0, { damping: 15, stiffness: 70 });

    // Tactile micro impact when splash launches
    hapticFeedback.impactLight();

    // 2. PHASE 2: Ambient breathing pulse (continuous)
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 3000, easing: easings.cubicBezier }),
        withTiming(0.9, { duration: 3000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
    
    // Slow drifting float for background orb
    glowTranslateX.value = withRepeat(
      withSequence(
        withTiming(20, { duration: 4000, easing: easings.cubicBezier }),
        withTiming(-20, { duration: 4000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
    glowTranslateY.value = withRepeat(
      withSequence(
        withTiming(-15, { duration: 3500, easing: easings.cubicBezier }),
        withTiming(15, { duration: 3500, easing: easings.cubicBezier })
      ),
      -1,
      true
    );

    // 3. EXECUTE STARTUP PIPELINE (Asset load + session hydrations in parallel)
    const executePipeline = async () => {
      const startTime = Date.now();
      try {
        await Promise.all([
          preloadStaticAssets(),
          preheatNetwork(),
          restoreSession(),
        ]);


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
  }, []);

  // 4. PHASE 3 & 4: Exit sequence and Routing handoff
  useEffect(() => {
    if (!isPreloadComplete || isAuthLoading) return;

    const performCinematicExit = () => {
      // Set exit state
      isExiting.value = withTiming(1, { duration: 600, easing: easings.easeOutExpo });
      
      // Animate logo flying upward out of view
      logoScale.value = withSpring(0.7, springPresets.stiff);
      logoTranslateY.value = withTiming(-280, { duration: 550, easing: easings.easeInExpo });
      logoOpacity.value = withTiming(0, { duration: 450 });

      // Animate text sliding downward out of view
      textTranslateY.value = withTiming(120, { duration: 550, easing: easings.easeInExpo });
      textOpacity.value = withTiming(0, { duration: 450 });

      // Animate background portal expanding dynamically
      glowScale.value = withTiming(3.2, { duration: 600, easing: easings.easeOutExpo });
      glowOpacity.value = withTiming(0, { duration: 600 });

      // Tactile notification sweep at handoff transition
      hapticFeedback.selection();

      // Trigger routing immediately at the peak of the portal expansion (550ms)
      setTimeout(() => {
        runOnJS(handleNavigation)();
      }, 550);
    };

    const handleNavigation = () => {
      const isGuest = user?.id === 'guest-user';
      const hasAccess = !!isAuthenticated || isGuest;

      // Optimistically preload reels feeds for returning users
      if (hasAccess && isOnboarded) {
        startOptimisticDataPreload();
      }

      if (hasAccess) {
        router.replace('/(protected)/(tabs)/learn');
      } else if (!isOnboarded) {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(auth)/login');
      }
    };

    performCinematicExit();
  }, [isPreloadComplete, isAuthLoading]);

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
    <View style={styles.container}>
      {/* Iridescent Glowing Portal Canvas */}
      <Animated.View style={[styles.glowOrb, glowAnimatedStyle]} />

      <View style={styles.content}>
        {/* Glowing Branding Tile */}
        <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
          <View style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Text 
              style={{ 
                fontSize: 44, 
                fontWeight: '900', 
                color: '#8B5CF6', 
                fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-condensed',
                lineHeight: 52,
              }}
            >
              R
            </Text>
            
            {/* Star Sparkle (Top Right) */}
            <View style={{ position: 'absolute', top: -6, right: -10 }}>
              <Sparkles color="#8B5CF6" size={16} strokeWidth={1.5} />
            </View>

            {/* Star Sparkle (Bottom Left) */}
            <View style={{ position: 'absolute', bottom: -4, left: -10 }}>
              <Sparkles color="#A78BFA" size={12} strokeWidth={1.2} />
            </View>

            {/* Glowing Purple Dot (Top Left) */}
            <View 
              style={{ 
                position: 'absolute', 
                top: 2, 
                left: -4, 
                width: 5, 
                height: 5, 
                borderRadius: 2.5, 
                backgroundColor: '#8B5CF6', 
                opacity: 0.8 
              }} 
            />

            {/* Glowing Purple Dot (Bottom Right) */}
            <View 
              style={{ 
                position: 'absolute', 
                bottom: 4, 
                right: -4, 
                width: 6, 
                height: 6, 
                borderRadius: 3, 
                backgroundColor: '#C084FC', 
                opacity: 0.7 
              }} 
            />
          </View>
        </Animated.View>

        {/* Cinematic Typographic Sequence */}
        <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
          <Text style={styles.title}>ReeWise</Text>
          <Text style={styles.subtitle}>Curating active recall...</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F7', // Warm off-white canvas
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOrb: {
    position: 'absolute',
    width: width * 0.85,
    height: width * 0.85,
    borderRadius: (width * 0.85) / 2,
    backgroundColor: 'transparent',
  },
  content: {
    alignItems: 'center',
    zIndex: 2,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    color: '#0F172A', // Dark navy
    fontSize: 26,
    fontWeight: 'normal',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#475569', // Soft charcoal
    fontSize: 14,
    fontWeight: 'normal',
  },
});