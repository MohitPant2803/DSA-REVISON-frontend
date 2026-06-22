import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, Platform, DevSettings, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { ReeWCharacter } from '@/components/ReeWCharacter';
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
import { addAlpha, themePalettes } from '@/theme/themePalettes';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isConsentChecked, setIsConsentChecked] = useState(false);
  const palette = themePalettes.midnight;
  const buttonTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  // First-Time Sync State Selectors
  const isFirstTimeSyncInProgress = usePlaylistStateStore((s) => {
    const val = s.isFirstTimeSyncInProgress;
    console.log(`[INSTRUMENT SELECTOR] login.tsx | Selector read: ${val} | Time: ${Date.now()}`);
    return val;
  });

  const [syncFailed, setSyncFailed] = useState(false);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleRestart = async () => {
    hapticFeedback.success();
    if (Platform.OS === 'web') {
      window.location.reload();
    } else {
      try {
        const Updates = require('expo-updates');
        await Updates.reloadAsync();
      } catch (e) {
        console.warn('[LoginScreen] Failed to reload with expo-updates, trying DevSettings:', e);
        DevSettings.reload();
      }
    }
  };

  useEffect(() => {
    console.log(`[INSTRUMENT EVALUATION] login.tsx | useEffect evaluate isFirstTimeSyncInProgress: ${isFirstTimeSyncInProgress} | Time: ${Date.now()}`);
    if (isFirstTimeSyncInProgress) {
      setSyncFailed(false);
      // Start a 10-second fail-safe timer
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (typeof (global as any).dumpInstrumentState === 'function') {
        (global as any).dumpInstrumentState('12. timeout timer starts');
      }
      syncTimerRef.current = setTimeout(() => {
        if (typeof (global as any).dumpInstrumentState === 'function') {
          (global as any).dumpInstrumentState('13. timeout timer fires');
        }
        setSyncFailed(true);
        // Automatically trigger restart on timeout/hang
        handleRestart();
      }, 10000);
    } else {
      if (syncTimerRef.current) {
        console.log('[LoginScreen] Clearing fail-safe sync timeout timer (successful completion)');
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      setSyncFailed(false);
    }

    return () => {
      if (syncTimerRef.current) {
        console.log('[LoginScreen] Cleaning up/Clearing fail-safe sync timeout timer on unmount');
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [isFirstTimeSyncInProgress]);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (isFirstTimeSyncInProgress && typeof (global as any).dumpInstrumentState === 'function') {
    (global as any).dumpInstrumentState(syncFailed ? '14. restart screen renders' : 'UI overlays first-time sync card');
  }

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
    if (typeof (global as any).dumpInstrumentState === 'function') {
      (global as any).dumpInstrumentState('1. Login starts');
    }

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
        if (typeof (global as any).dumpInstrumentState === 'function') {
          (global as any).dumpInstrumentState('2. Google token exchange succeeds');
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

        // Only redirect if first-time sync is NOT in progress.
        // If it is, the RootLayout guard will redirect us once the sync completes.
        const isSyncInProgress = usePlaylistStateStore.getState().isFirstTimeSyncInProgress;
        console.log(`[INSTRUMENT EVALUATION] login.tsx | Direct state read isFirstTimeSyncInProgress: ${isSyncInProgress} | Time: ${Date.now()}`);
        if (!isSyncInProgress) {
          const targetDeepLink = useAuthStore.getState().targetDeepLink;
          if (targetDeepLink) {
            useAuthStore.getState().setTargetDeepLink(null);
            router.replace(targetDeepLink as any);
          } else {
            router.replace('/(protected)/(tabs)/learn');
          }
        }
      } else {
        setIsAuthenticating(false);
      }
    } catch (error: any) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.log("FULL GOOGLE ERROR:", JSON.stringify(error, null, 2));

      if (!isMounted) return;

      let friendlyMessage = 'Google login failed. Please try again.';
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        friendlyMessage = 'Google sign-in was cancelled.';
      } else if (error.code === statusCodes.IN_PROGRESS) {
        friendlyMessage = 'Google sign-in is already in progress.';
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        friendlyMessage = 'Google Play Services are not available or outdated.';
      } else if (error.message) {
        friendlyMessage = error.message;
      }
      
      setAuthError(friendlyMessage);
      setIsAuthenticating(false);
    }
  };

  const handleSeeTrial = async () => {
    try {
      setIsAuthenticating(true);
      hapticFeedback.success();

      // 1-second delay for premium animation transition
      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockToken = '';
      const mockUser = {
        id: 'guest-user',
        name: 'Guest Explorer',
        email: 'guest@dsa-reels.com',
        avatarUrl: 'https://ui-avatars.com/api/?name=Guest',
        role: 'user' as const,
      };

      // Set onboarding as completed for trial so they go straight to walkthrough
      const { useOnboardingStore } = require('@/store/useOnboardingStore');
      await useOnboardingStore.getState().completeOnboarding();

      // Reset guest walkthrough and tutorial keys for a fresh trial run
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem('guest-dsa-reels-walkthrough-complete');
      await AsyncStorage.removeItem('guest-dsa-reels-tutorial-complete');

      const { useWalkthroughStore } = require('@/store/useWalkthroughStore');
      useWalkthroughStore.setState({
        step: 'point-reels',
        isComplete: false,
        reelsTutorialStep: 0,
        reelsShot: 1,
      });

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
      <ThemeBackground style={{ flex: 1 }} themeId="midnight">
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <View style={styles.content}>
        
        <CinematicFadeIn delay={100} style={styles.brandingBlock}>
          <View style={[styles.logoTile, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: palette.shadow }]}>
            <Image
              source={require('../../assets/icon213.png')}
              style={{ width: '100%', height: '100%', borderRadius: 24 }}
              contentFit="cover"
            />
          </View>
        </CinematicFadeIn>

        {/* CENTER: Typography content */}
        <CinematicFadeIn delay={250} style={styles.typographyBlock}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>ReeWise</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
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
              <CheckSquare size={20} color={palette.accent} strokeWidth={2.5} />
            ) : (
              <Square size={20} color={palette.textMuted} strokeWidth={2} />
            )}
            <Text style={{ fontSize: 12, fontWeight: '600', color: palette.textSecondary, marginLeft: 10, flex: 1, lineHeight: 16 }}>
              I agree to the{' '}
              <Text
                style={{ color: palette.accent, textDecorationLine: 'underline' }}
                onPress={(e) => {
                  e.stopPropagation();
                  hapticFeedback.selection();
                  Linking.openURL('https://ree-wise-download-website.vercel.app/terms').catch(() => {});
                }}
              >
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text
                style={{ color: palette.accent, textDecorationLine: 'underline' }}
                onPress={(e) => {
                  e.stopPropagation();
                  hapticFeedback.selection();
                  Linking.openURL('https://ree-wise-download-website.vercel.app/privacy').catch(() => {});
                }}
              >
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>

          {/* PRIMARY CTA: Google Pill Button */}
          <SuperchargedPressable
            disabled={isAuthenticating}
            onPress={handleGoogleLogin}
            activeScale={isConsentChecked ? 0.96 : 1.0}
            style={[
              styles.primaryBtn,
              { backgroundColor: palette.accent, shadowColor: palette.accentGlow },
              !isConsentChecked && { backgroundColor: palette.inputBg, shadowColor: 'transparent' }
            ]}
            accessibilityLabel={isAuthenticating ? "Logging in to Google" : "Continue with Google button"}
            accessibilityRole="button"
            accessibilityState={{ disabled: isAuthenticating || !isConsentChecked }}
          >
            {isAuthenticating ? (
              <ActivityIndicator color={buttonTextColor} />
            ) : (
              <View style={styles.btnContent}>
                <Text style={[styles.primaryBtnText, { color: buttonTextColor }]}>Continue with Google</Text>
                <ArrowRight color={buttonTextColor} size={16} strokeWidth={2.5} style={styles.btnArrow} />
              </View>
            )}
          </SuperchargedPressable>

          {/* SECONDARY CTA: Try without logging in Button */}
          <SuperchargedPressable
            disabled={isAuthenticating}
            onPress={handleSeeTrial}
            activeScale={0.96}
            style={[styles.trialBtn, { backgroundColor: palette.surface, borderColor: palette.accent, shadowColor: palette.accentGlow }]}
            accessibilityLabel="Try without logging in button"
            accessibilityRole="button"
            accessibilityState={{ disabled: isAuthenticating }}
          >
            <View style={styles.btnContent}>
              <Text style={[styles.trialBtnText, { color: palette.accent }]}>Try without logging in</Text>
              <ArrowRight color={palette.accent} size={16} strokeWidth={2.5} style={styles.btnArrow} />
            </View>
          </SuperchargedPressable>

          {/* Accessible Inline Error Display */}
          {authError && (
            <View 
              style={{ paddingHorizontal: 12, marginBottom: 12, width: '100%' }}
              accessibilityLiveRegion="assertive"
            >
              <Text style={{ color: palette.error, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 18 }}>
                {authError}
              </Text>
            </View>
          )}

          <Text style={[styles.termsText, { color: palette.textMuted }]}>
            ReeWise protects your data and respects your privacy.
          </Text>
        </CinematicFadeIn>
      </View>
    </SafeAreaView>
    </ThemeBackground>

    {/* Premium First-Time Sync Loading Overlay */}
    {isFirstTimeSyncInProgress && (
      <View style={[StyleSheet.absoluteFillObject, styles.overlayContainer, { backgroundColor: addAlpha(palette.background, 0.96) }]}>
        <CinematicFadeIn duration={400} style={{ ...styles.overlayCard, backgroundColor: palette.surface, borderColor: palette.border, shadowColor: palette.shadow }}>
          <View style={styles.characterContainer}>
            <ReeWCharacter state={syncFailed ? 'cute_sad' : 'thinking'} size={120} />
          </View>
          
          {syncFailed ? (
            <View style={styles.overlayTextContainer}>
              <Text style={[styles.overlayTitle, { color: palette.textPrimary }]}>Connection is Weak</Text>
              <Text style={[styles.overlaySubtitle, { color: palette.textSecondary }]}>
                We couldn't download the syllabus contents. Please check your internet connection and restart the app.
              </Text>
              
              <SuperchargedPressable
                onPress={handleRestart}
                activeScale={0.96}
                style={[styles.restartBtn, { backgroundColor: palette.accent, shadowColor: palette.accentGlow }]}
              >
                <Text style={[styles.restartBtnText, { color: buttonTextColor }]}>Restart App</Text>
              </SuperchargedPressable>
            </View>
          ) : (
            <View style={styles.overlayTextContainer}>
              <Text style={[styles.overlayTitle, { color: palette.textPrimary, marginBottom: 0 }]}>Getting started...</Text>
            </View>
          )}
        </CinematicFadeIn>
      </View>
    )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  subtitle: {
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
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 16,
  },
  trialBtn: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  trialBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryBtnText: {
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
    fontSize: 14,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
  overlayContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  overlayCard: {
    width: width - 64,
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  characterContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  overlayTextContainer: {
    alignItems: 'center',
    width: '100%',
  },
  overlayTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  overlaySubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '700',
  },
  restartBtn: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 8,
  },
  restartBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
