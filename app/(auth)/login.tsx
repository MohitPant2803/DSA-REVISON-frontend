import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Sparkles, ArrowRight, CheckSquare, Square } from 'lucide-react-native';
import { useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import api from '@/services/api';
import { SuperchargedPressable } from '@/components/motion/SuperchargedPressable';
import { CinematicFadeIn } from '@/components/motion/CinematicFadeIn';
import { hapticFeedback } from '@/utils/haptics';
import ThemeBackground from '@/components/ThemeBackground';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isConsentChecked, setIsConsentChecked] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pageOpacity = useSharedValue(0);

  useEffect(() => {
    pageOpacity.value = withTiming(1, { duration: 800 });
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Logo floating / breathing shared value
  const logoScale = useSharedValue(0.95);

  useEffect(() => {
    // Elegant slow breathing pulse for logo
    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2500 }),
        withTiming(0.95, { duration: 2500 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(logoScale);
  }, []);



  const handleGoogleLogin = async () => {
    if (!isConsentChecked) {
      setAuthError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    
    setAuthError(null);
    let isMounted = true;

    try {
      setIsAuthenticating(true);
      hapticFeedback.success();

      // 15-second fail-safe timeout to prevent permanent button locking
      timeoutRef.current = setTimeout(() => {
        if (isMounted) {
          setIsAuthenticating(false);
          setAuthError('Google Sign-In connection timed out. Please check your connection and try again.');
        }
      }, 15000);

      await GoogleSignin.hasPlayServices();
      try {
        await GoogleSignin.signOut();
      } catch {}

      const userInfo = await GoogleSignin.signIn();

      if (!isMounted) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (userInfo.type === 'success') {
        const { idToken } = userInfo.data;
        if (!idToken) {
          throw new Error('Google Sign-In failed: No ID Token returned.');
        }

        console.log('[DEBUG] Google Sign-In Successful! Exchanging token with backend...');
        const { deviceId, logicalClockSequence } = usePlaylistStateStore.getState();
        const clockEpoch = String(logicalClockSequence || 0);
        const res = await api.post('/auth/google', { idToken, deviceId, clockEpoch });
        const { token, user: rawUser } = res.data.data;

        // Reset walkthrough state to make sure tutorial starts fresh for new Google sign-in accounts
        const createdAt = new Date(rawUser.createdAt).getTime();
        const updatedAt = new Date(rawUser.updatedAt).getTime();
        const isNewUser = Math.abs(createdAt - updatedAt) < 10000;
        if (isNewUser) {
          const { useWalkthroughStore } = require('@/store/useWalkthroughStore');
          useWalkthroughStore.getState().setStep('point-reels');
          
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem('dsa-reels-walkthrough-complete');
          await AsyncStorage.removeItem('dsa-reels-tutorial-complete');
          await AsyncStorage.removeItem('guest-dsa-reels-walkthrough-complete');
          await AsyncStorage.removeItem('guest-dsa-reels-tutorial-complete');
        }

        const user = {
          id: rawUser._id,
          name: rawUser.name,
          email: rawUser.email,
          avatarUrl: rawUser.profilePicture,
          role: rawUser.role,
          totalSwipes: rawUser.totalSwipes || 0,
          totalScrolls: rawUser.totalScrolls || 0,
        };

        await login(token, user);

        // Handle Deep Link holding redirect or default navigation
        const targetDeepLink = useAuthStore.getState().targetDeepLink;
        if (targetDeepLink) {
          useAuthStore.getState().setTargetDeepLink(null);
          router.replace(targetDeepLink as any);
        } else {
          router.replace('/(protected)/(tabs)/learn');
        }
      } else {
        setIsAuthenticating(false);
      }
    } catch (error: any) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.log("FULL GOOGLE ERROR:", JSON.stringify(error, null, 2));

      if (!isMounted) return;

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled, fail silently and cleanly without showing error text
        setAuthError(null);
      } else if (error.code === statusCodes.IN_PROGRESS) {
        setAuthError('Another sign-in prompt is already active. Please complete it.');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setAuthError('Google Play Services is missing or outdated. Please update Play Services to log in securely.');
      } else if (error.code === 'NETWORK_ERROR' || error.code === '7' || error.message?.toLowerCase().includes('network')) {
        setAuthError('Connection issue detected. Please check your internet connection and try again.');
      } else {
        setAuthError(error.message || 'Something went wrong. Please check your connection and try again.');
      }
      setIsAuthenticating(false);
    }
  };

  const handleSeeTrial = async () => {
    setAuthError(null);
    try {
      setIsAuthenticating(true);
      hapticFeedback.success();
      
      const mockToken = '';
      const mockUser = {
        id: 'guest-user',
        name: 'Guest Explorer',
        email: 'guest@dsa-reels.com',
        avatarUrl: 'https://ui-avatars.com/api/?name=Guest',
        role: 'user' as const,
      };

      // Reset walkthrough state to make sure tutorial starts fresh
      const { useWalkthroughStore } = require('@/store/useWalkthroughStore');
      useWalkthroughStore.getState().setStep('point-reels');
      
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem('dsa-reels-walkthrough-complete');
      await AsyncStorage.removeItem('dsa-reels-tutorial-complete');
      await AsyncStorage.removeItem('guest-dsa-reels-walkthrough-complete');
      await AsyncStorage.removeItem('guest-dsa-reels-tutorial-complete');

      // Set onboarding as completed for trial so they go straight to walkthrough
      const { useOnboardingStore } = require('@/store/useOnboardingStore');
      await useOnboardingStore.getState().completeOnboarding();

      await login(mockToken, mockUser);
      
      router.replace('/(protected)/(tabs)/learn');
    } catch (error: any) {
      setAuthError(error.message || 'Failed to start guest trial. Please try again.');
      setIsAuthenticating(false);
    }
  };

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const pageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pageOpacity.value,
    flex: 1,
  }));

  return (
    <Animated.View style={pageAnimatedStyle}>
      <ThemeBackground style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <View style={styles.content}>
        
        <CinematicFadeIn delay={100} style={styles.brandingBlock}>
          <View style={styles.logoTile}>
            <Image
              source={require('../../assets/icon213.png')}
              style={{ width: '100%', height: '100%', borderRadius: 24 }}
              contentFit="cover"
            />
          </View>
        </CinematicFadeIn>

        {/* CENTER: Typography content */}
        <CinematicFadeIn delay={250} style={styles.typographyBlock}>
          <Text style={styles.title}>ReeWise</Text>
          <Text style={styles.subtitle}>
            Short revisions, playlists, and active recall in one calm place.
          </Text>
        </CinematicFadeIn>

        {/* BOTTOM: CTAs & Trust Microcopy */}
        <CinematicFadeIn delay={400} style={styles.actionBlock}>
          
          {/* Compliance Consent Gate Checkbox */}
          <TouchableOpacity
            onPress={() => {
              hapticFeedback.selection();
              setIsConsentChecked(!isConsentChecked);
              setAuthError(null);
            }}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 12 }}
            accessibilityLabel="Agree to Terms of Service and Privacy Policy checkbox"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isConsentChecked }}
          >
            {isConsentChecked ? (
              <CheckSquare size={20} color="#8B5CF6" strokeWidth={2.5} />
            ) : (
              <Square size={20} color="#94A3B8" strokeWidth={2} />
            )}
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginLeft: 10, flex: 1, lineHeight: 16 }}>
              I agree to the Terms of Service and Privacy Policy
            </Text>
          </TouchableOpacity>

          {/* PRIMARY CTA: Google Pill Button */}
          <SuperchargedPressable
            disabled={isAuthenticating}
            onPress={handleGoogleLogin}
            activeScale={isConsentChecked ? 0.96 : 1.0}
            style={[styles.primaryBtn, !isConsentChecked && { backgroundColor: '#CBD5E1', shadowColor: 'transparent' }]}
            accessibilityLabel={isAuthenticating ? "Logging in to Google" : "Continue with Google button"}
            accessibilityRole="button"
            accessibilityState={{ disabled: isAuthenticating || !isConsentChecked }}
          >
            {isAuthenticating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.btnContent}>
                <Text style={styles.primaryBtnText}>Continue with Google</Text>
                <ArrowRight color="#FFFFFF" size={16} strokeWidth={2.5} style={styles.btnArrow} />
              </View>
            )}
          </SuperchargedPressable>

          {/* SECONDARY CTA: See Trial Button */}
          <SuperchargedPressable
            disabled={isAuthenticating}
            onPress={handleSeeTrial}
            activeScale={0.96}
            style={styles.trialBtn}
            accessibilityLabel="See Trial button"
            accessibilityRole="button"
            accessibilityState={{ disabled: isAuthenticating }}
          >
            <View style={styles.btnContent}>
              <Text style={styles.trialBtnText}>See Trial</Text>
              <ArrowRight color="#8B5CF6" size={16} strokeWidth={2.5} style={styles.btnArrow} />
            </View>
          </SuperchargedPressable>

          {/* Accessible Inline Error Display */}
          {authError && (
            <View 
              style={{ paddingHorizontal: 12, marginBottom: 12, width: '100%' }}
              accessibilityLiveRegion="assertive"
            >
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 18 }}>
                {authError}
              </Text>
            </View>
          )}



          <Text style={styles.termsText}>
            ReeWise protects your data and respects your privacy.
          </Text>
        </CinematicFadeIn>
      </View>
    </SafeAreaView>
    </ThemeBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F7', // Warm off-white
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 36,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  brandingBlock: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoTile: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 2,
  },
  typographyBlock: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
    marginVertical: 40,
  },
  title: {
    color: '#0F172A', // Dark Navy
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  subtitle: {
    color: '#475569', // Soft Charcoal
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  actionBlock: {
    width: '100%',
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#8B5CF6',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 16,
  },
  trialBtn: {
    backgroundColor: '#FFFFFF',
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  trialBtnText: {
    color: '#8B5CF6',
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnArrow: {
    marginLeft: 8,
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  termsText: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
});
