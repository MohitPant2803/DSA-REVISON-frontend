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
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { Sparkles, ArrowRight, Shield, Brain, Laptop, Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/services/api';
import { GlassPanel } from '@/components/motion/GlassPanel';
import { SuperchargedPressable } from '@/components/motion/SuperchargedPressable';
import { CinematicFadeIn } from '@/components/motion/CinematicFadeIn';
import { springPresets, easings } from '@/theme/motion';
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

  // Background glow orbs animations
  const glowScale = useSharedValue(0.9);
  const glowOpacity = useSharedValue(0.2);

  useEffect(() => {
    // Breathing continuous background orb
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 3000, easing: easings.cubicBezier }),
        withTiming(0.9, { duration: 3000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 3000, easing: easings.cubicBezier }),
        withTiming(0.2, { duration: 3000, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
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
      
      // Funnel Guest directly into Onboarding Step 0 to build emotional attachment first
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
        
        // Target dashboard home instead of feed
        router.replace('/(protected)/(tabs)/learn');
      } else {
        setIsAuthenticating(false);
      }
    } catch (error: any) {
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        console.error('Google Sign-In Error:', error);
      }
      setIsAuthenticating(false);
    }
  };

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Drifting Iridescent Background Glow */}
      <Animated.View style={[styles.glowOrb, glowAnimatedStyle]} />

      <View style={styles.content}>
        
        {/* Branding header staggered entry */}
        <CinematicFadeIn delay={100} style={styles.brandingBlock}>
          <View style={styles.logoTile}>
            <Sparkles color="#8B5CF6" size={26} strokeWidth={1.5} />
          </View>
          <Text style={styles.title}>DSA Revision</Text>
          <Text style={styles.subtitle}>Mastering algorithms through active recall.</Text>
        </CinematicFadeIn>

        {/* Cinematic Value Propositions Card */}
        <CinematicFadeIn delay={300} style={styles.valuesBlock}>
          <GlassPanel style={styles.valuesGlass} intensity={14} tint="dark">
            <View style={styles.valuesHeader}>
              <Text style={styles.valuesHeaderLabel}>SYNCHRONIZATION ADVANTAGES</Text>
            </View>

            {/* Row 1: Streak Protection */}
            <View style={styles.valueRow}>
              <Flame color="#EF4444" size={18} style={styles.rowIcon} />
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>Streak Protection</Text>
                <Text style={styles.rowDesc}>Lock in daily recall targets; never lose streak progress.</Text>
              </View>
            </View>

            {/* Row 2: AI Voice Reviews */}
            <View style={styles.valueRow}>
              <Brain color="#8B5CF6" size={18} style={styles.rowIcon} />
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>AI Voice Evaluation</Text>
                <Text style={styles.rowDesc}>Explain solutions verbally; GPT compares complexity.</Text>
              </View>
            </View>

            {/* Row 3: Multi-device sync */}
            <View style={styles.valueRow}>
              <Laptop color="#6366F1" size={18} style={styles.rowIcon} />
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>Cloud Multi-Device Sync</Text>
                <Text style={styles.rowDesc}>Access saved playlists and custom sheets anywhere.</Text>
              </View>
            </View>
          </GlassPanel>
        </CinematicFadeIn>

        {/* CTA Actions Group */}
        <CinematicFadeIn delay={500} style={styles.actionBlock}>
          
          {/* PRIMARY CTA: Gradient Google Button */}
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
                <Text style={styles.primaryBtnText}>Sync with Google</Text>
                <ArrowRight color="#FFFFFF" size={16} strokeWidth={2} style={styles.btnArrow} />
              </View>
            )}
          </SuperchargedPressable>

          {/* SECONDARY CTA: See Trial First */}
          <TouchableOpacity
            disabled={isAuthenticating}
            onPress={handleSkipLogin}
            activeOpacity={0.8}
            style={styles.secondaryBtn}
          >
            <GlassPanel style={styles.secondaryGlass} intensity={10} tint="dark">
              <Text style={styles.secondaryBtnText}>See Trial First</Text>
            </GlassPanel>
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
    backgroundColor: '#0B0F19', // Dark premium spatial operating system canvas
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOrb: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
    backgroundColor: '#8B5CF6',
    filter: 'blur(100px)' as any,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 24,
    width: '100%',
    zIndex: 2,
  },
  brandingBlock: {
    alignItems: 'center',
    marginTop: 16,
  },
  logoTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: 'normal',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  valuesBlock: {
    width: '100%',
  },
  valuesGlass: {
    padding: 20,
  },
  valuesHeader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 12,
    marginBottom: 16,
  },
  valuesHeaderLabel: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rowIcon: {
    marginRight: 14,
    marginTop: 2,
  },
  rowTextCol: {
    flex: 1,
  },
  rowTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '500',
  },
  rowDesc: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  actionBlock: {
    width: '100%',
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
    shadowOpacity: 0.25,
    shadowRadius: 10,
    marginBottom: 14,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  btnArrow: {
    marginLeft: 8,
  },
  secondaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  secondaryGlass: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryBtnText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  termsText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
  },
});
