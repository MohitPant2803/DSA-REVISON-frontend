import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
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
import { Sparkles, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/services/api';
import { SuperchargedPressable } from '@/components/motion/SuperchargedPressable';
import { CinematicFadeIn } from '@/components/motion/CinematicFadeIn';
import { hapticFeedback } from '@/utils/haptics';

const { width } = Dimensions.get('window');

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: true,
});

export default function LoginScreen() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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

  const handleSkipLogin = async () => {
    try {
      setIsAuthenticating(true);
      hapticFeedback.selection();

      const mockToken = "";
      const mockUser = {
        id: "guest-user",
        name: "Guest Explorer",
        email: "guest@dsa-reels.com",
        avatarUrl: "https://ui-avatars.com/api/?name=Guest",
        role: "user" as const,
      };

      // Set guest session parameters
      await login(mockToken, mockUser);
      
      // Funnel Guest directly into Onboarding for the initial experience
      router.replace('/(auth)/onboarding');
      setIsAuthenticating(false);
    } catch (error) {
      console.error('Skip login error:', error);
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsAuthenticating(true);
      hapticFeedback.success();

      await GoogleSignin.hasPlayServices();
      try {
        await GoogleSignin.signOut();
      } catch {}

      const userInfo = await GoogleSignin.signIn();

      if (userInfo.type === 'success') {
        const { idToken } = userInfo.data;
        if (!idToken) {
          throw new Error('Google Sign-In failed: No ID Token returned.');
        }

        console.log('[DEBUG] Google Sign-In Successful! Exchanging token with backend...');
        const res = await api.post('/auth/google', { idToken });
        const { token, user: rawUser } = res.data.data;

        const user = {
          id: rawUser._id,
          name: rawUser.name,
          email: rawUser.email,
          avatarUrl: rawUser.profilePicture,
          role: rawUser.role,
        };

        await login(token, user);
        router.replace('/(protected)/(tabs)/learn');
      } else {
        setIsAuthenticating(false);
      }
    } catch (error: any) {
      console.log("FULL GOOGLE ERROR:", JSON.stringify(error, null, 2));
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        console.error('Google Sign-In Error:', error);
      }
      setIsAuthenticating(false);
    }
  };

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        {/* TOP: Floating app logo with breathing animation */}
        <CinematicFadeIn delay={100} style={styles.brandingBlock}>
          <Animated.View style={[styles.logoTile, logoAnimatedStyle]}>
            <Sparkles color="#8B5CF6" size={32} strokeWidth={1.5} />
          </Animated.View>
        </CinematicFadeIn>

        {/* CENTER: Typography content */}
        <CinematicFadeIn delay={250} style={styles.typographyBlock}>
          <Text style={styles.title}>Build real DSA intuition.</Text>
          <Text style={styles.subtitle}>
            Short revisions, playlists, and active recall in one calm place.
          </Text>
        </CinematicFadeIn>

        {/* BOTTOM: CTAs & Trust Microcopy */}
        <CinematicFadeIn delay={400} style={styles.actionBlock}>
          
          {/* PRIMARY CTA: Google Pill Button */}
          <SuperchargedPressable
            disabled={isAuthenticating}
            onPress={handleGoogleLogin}
            activeScale={0.96}
            style={styles.primaryBtn}
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

          {/* SECONDARY CTA: Calm guest session text link */}
          <TouchableOpacity
            disabled={isAuthenticating}
            onPress={handleSkipLogin}
            activeOpacity={0.6}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>See how it works first</Text>
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By continuing, you agree to our terms and privacy policy.
          </Text>
        </CinematicFadeIn>
      </View>
    </SafeAreaView>
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
