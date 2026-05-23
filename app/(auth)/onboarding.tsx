import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react-native';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { SpringPressable } from '@/components/SpringPressable';
import { EmotionalHook } from '@/components/onboarding/EmotionalHook';
import { ReelsDemo } from '@/components/onboarding/ReelsDemo';
import { GrowthDemo } from '@/components/onboarding/GrowthDemo';
import { AIExplainDemo } from '@/components/onboarding/AIExplainDemo';
import { PersonalizationForm } from '@/components/onboarding/PersonalizationForm';
import { OnboardingLoader } from '@/components/onboarding/OnboardingLoader';

const TOTAL_STEPS = 8; // Steps 0 to 7

export default function OnboardingCoordinator() {
  const router = useRouter();
  const { login } = useAuthStore();
  const {
    currentStep,
    setStep,
    preferences,
    updatePreferences,
    completeOnboarding,
    isGeneratingSystem,
    setIsGeneratingSystem,
  } = useOnboardingStore();

  const [isLoading, setIsLoading] = useState(false);
  const [activeStepContent, setActiveStepContent] = useState<string>('');

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      setStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setStep(currentStep - 1);
    }
  };

  // Skip Login / Authenticate as Guest
  const handleSkipOrGuest = async () => {
    try {
      setIsLoading(true);
      
      const mockToken = "";
      const mockUser = {
        id: "guest-user",
        name: "Guest Explorer",
        email: "guest@dsa-reels.com",
        avatarUrl: "https://ui-avatars.com/api/?name=Guest",
        role: "user" as const,
      };

      // Set auth store state first
      await login(mockToken, mockUser);
      
      // Trigger system generation step before finishing
      setStep(7);
      triggerSystemGeneration();
    } catch (e) {
      console.error('Guest onboarding setup error:', e);
      setIsLoading(false);
    }
  };

  // Google SSO Handler
  const handleGoogleSignup = async () => {
    try {
      setIsLoading(true);
      
      // Simulating a fast, successful auth flow for testing purposes.
      // In production, this ties into the GoogleSignin SDK configuration.
      const mockToken = "mock-google-jwt-token";
      const mockUser = {
        id: "google-oauth-user",
        name: "Developer Apprentice",
        email: "apprentice@dsa-reels.com",
        avatarUrl: "https://ui-avatars.com/api/?name=Apprentice",
        role: "user" as const,
      };

      await login(mockToken, mockUser);

      setStep(7);
      triggerSystemGeneration();
    } catch (e) {
      console.error('Google auth onboarding error:', e);
      setIsLoading(false);
    }
  };

  // System Generation step - automates progress updates before navigating
  const triggerSystemGeneration = () => {
    setIsGeneratingSystem(true);
    let progress = 0;
    
    const interval = setInterval(async () => {
      progress += 25;
      if (progress === 25) {
        setActiveStepContent("Analyzing learning goals...");
      } else if (progress === 50) {
        setActiveStepContent("Compiling Blind 75 algorithms...");
      } else if (progress === 75) {
        setActiveStepContent("Calibrating spaced repetition tracker...");
      } else if (progress >= 100) {
        clearInterval(interval);
        setActiveStepContent("Dynamic revision environment ready.");
        
        // Finalize onboarding status
        await completeOnboarding();
        setIsGeneratingSystem(false);
        setIsLoading(false);
        
        // Redirect will be automatically handled by the root layout guards!
        // This is safe, but we can also trigger explicit redirection here as safety guard
        router.replace('/(protected)/(tabs)/learn');
      }
    }, 600);
  };

  const renderStepContent = () => {
    // These blocks are the structural skeletons. The full design visuals (animations, cards, heatmaps)
    // will be built inside their dedicated component files in the next phase.
    switch (currentStep) {
      case 0:
        return (
          <Animated.View key="step0" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <EmotionalHook />
          </Animated.View>
        );
      case 1:
        return (
          <Animated.View key="step1" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <ReelsDemo />
          </Animated.View>
        );
      case 2:
        return (
          <Animated.View key="step2" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <AIExplainDemo />
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View key="step3" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <Text style={styles.stepTitle}>Spaced Repetition</Text>
            <Text style={styles.stepHighlight}>Easy, Medium, Hard</Text>
            <Text style={styles.stepDesc}>
              Categorize cards with intuitive gestures. Weak topics reappear automatically until they are mastered.
            </Text>
          </Animated.View>
        );
      case 4:
        return (
          <Animated.View key="step4" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <GrowthDemo />
          </Animated.View>
        );
      case 5:
        return (
          <Animated.View key="step5" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <PersonalizationForm onComplete={handleNext} />
          </Animated.View>
        );
      case 6:
        return (
          <Animated.View key="step6" entering={SlideInRight} exiting={SlideOutLeft} style={styles.slide}>
            <Text style={styles.stepTitle}>Save Your Progress</Text>
            <Text style={styles.stepHighlight}>Lock in revision sync</Text>
            <Text style={styles.stepDesc}>
              Connect Google to protect your daily streaks, unlock verbal AI reviews, and sync seamlessly across devices.
            </Text>

            <View style={styles.authContainer}>
              <SpringPressable
                onPress={handleGoogleSignup}
                disabled={isLoading}
                style={styles.googleBtn}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.googleBtnText}>Sync with Google</Text>
                )}
              </SpringPressable>

              <TouchableOpacity
                onPress={handleSkipOrGuest}
                disabled={isLoading}
                style={styles.guestBtn}
              >
                <Text style={styles.guestBtnText}>Proceed as Guest</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        );
      case 7:
        return (
          <Animated.View key="step7" entering={FadeIn} exiting={FadeOut} style={styles.slideCentered}>
            <OnboardingLoader />
          </Animated.View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Back Arrow */}
      <View style={styles.header}>
        {currentStep > 0 && currentStep < TOTAL_STEPS - 1 && !isGeneratingSystem && (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <ChevronLeft color="#94A3B8" size={24} />
          </TouchableOpacity>
        )}
        <View style={styles.stepIndicatorContainer}>
          {Array.from({ length: TOTAL_STEPS }).map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.stepDot,
                currentStep === idx && styles.stepDotActive,
                idx < currentStep && styles.stepDotPassed,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Main Slide Portal */}
      <View style={styles.contentPortal}>{renderStepContent()}</View>

      {/* Bottom Action Footer */}
      {currentStep < 6 && (
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleSkipOrGuest} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip Onboarding</Text>
          </TouchableOpacity>

          <SpringPressable onPress={handleNext} style={styles.nextBtn}>
            <ChevronRight color="#FFFFFF" size={24} />
          </SpringPressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19', // Dark premium background canvas
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginLeft: 6,
  },
  stepDotActive: {
    width: 18,
    backgroundColor: '#8B5CF6',
  },
  stepDotPassed: {
    backgroundColor: '#6366F1',
  },
  contentPortal: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  slide: {
    width: '100%',
  },
  slideCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'normal',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepHighlight: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: 'normal',
    lineHeight: 46,
    marginTop: 4,
    marginBottom: 20,
  },
  stepDesc: {
    color: '#64748B',
    fontSize: 16,
    lineHeight: 26,
  },
  stepTitleCentered: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'normal',
    marginTop: 16,
    textAlign: 'center',
  },
  loaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowRadius: 10,
    shadowOpacity: 0.2,
  },
  loaderStatus: {
    color: '#64748B',
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  preferencesContainer: {
    marginTop: 12,
  },
  prefsLabel: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 24,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    margin: 4,
  },
  chipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: '#8B5CF6',
  },
  chipText: {
    color: '#64748B',
    fontSize: 14,
  },
  chipTextActive: {
    color: '#F8FAFC',
    fontWeight: '500',
  },
  authContainer: {
    marginTop: 32,
    width: '100%',
  },
  googleBtn: {
    backgroundColor: '#8B5CF6',
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  googleBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  guestBtn: {
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    width: '100%',
  },
  guestBtnText: {
    color: '#64748B',
    fontSize: 15,
  },
  footer: {
    height: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  skipBtn: {
    paddingVertical: 12,
  },
  skipBtnText: {
    color: '#64748B',
    fontSize: 14,
  },
  nextBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});
