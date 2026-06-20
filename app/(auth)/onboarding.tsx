import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, TouchableOpacity, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  FadeIn,
  FadeOut,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Sparkles, Bookmark, Flame, Zap, Skull, Folder, RefreshCw, Brain, Terminal, MessageSquare, ArrowUpRight, GraduationCap, Moon, Coffee, Heart, GripVertical, ArrowRight, ArrowUp, Plus, ArrowDown, ArrowLeft, Bell } from 'lucide-react-native';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { SpringPressable } from '@/components/SpringPressable';
import { OnboardingLoader } from '@/components/onboarding/OnboardingLoader';
import { hapticFeedback } from '@/utils/haptics';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import api from '@/services/api';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import Toast from 'react-native-toast-message';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop, G } from 'react-native-svg';

const { width } = Dimensions.get('window');

function getCardStyle(idx: number, currentStep: number, cardTranslates: any[], screenWidth: number) {
  'worklet';
  const diff = idx - currentStep;
  
  if (diff === 0) {
    // Active card: swipe translation and tilt rotation
    const tx = cardTranslates[idx].value;
    const rotate = `${tx / 20}deg`;
    return {
      transform: [
        { translateX: tx },
        { rotate: rotate },
        { scale: 1.0 },
      ],
      opacity: 1.0,
      zIndex: 10,
    };
  } else if (diff === 1) {
    // Next card: scales up and fades in as the active card is swiped
    const activeTx = cardTranslates[currentStep] ? cardTranslates[currentStep].value : 0;
    const progress = Math.min(Math.abs(activeTx) / (screenWidth * 0.6), 1.0);
    const scale = 0.93 + (0.07 * progress);
    const opacity = 0.5 + (0.5 * progress);
    return {
      transform: [
        { translateX: 0 },
        { rotate: '0deg' },
        { scale: scale },
      ],
      opacity: opacity,
      zIndex: 9,
    };
  } else if (diff === -1) {
    // Previous card: slides over the current card during back navigation
    const tx = cardTranslates[idx].value;
    const rotate = `${tx / 20}deg`;
    return {
      transform: [
        { translateX: tx },
        { rotate: rotate },
        { scale: 1.0 },
      ],
      opacity: 1.0, // always visible — card is offscreen when not animating
      zIndex: 20, // above the active card so it slides over
    };
  } else if (diff < -1) {
    // Older swiped off cards
    const tx = cardTranslates[idx].value;
    return {
      transform: [
        { translateX: tx },
        { rotate: '0deg' },
        { scale: 1.0 },
      ],
      opacity: 0,
      zIndex: 0,
    };
  } else {
    // Future cards in stack: completely hidden
    return {
      transform: [
        { translateX: 0 },
        { rotate: '0deg' },
        { scale: 0.93 },
      ],
      opacity: 0,
      zIndex: 0,
    };
  }
}

interface OnboardingDynamicBackgroundProps {
  zenOpacity: any;
  matchaOpacity: any;
  sunsetOpacity: any;
  midnightOpacity: any;
}

function OnboardingDynamicBackground({
  zenOpacity,
  matchaOpacity,
  sunsetOpacity,
  midnightOpacity,
}: OnboardingDynamicBackgroundProps) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const animatedZen = useAnimatedStyle(() => ({ opacity: zenOpacity.value }));
  const animatedMatcha = useAnimatedStyle(() => ({ opacity: matchaOpacity.value }));
  const animatedSunset = useAnimatedStyle(() => ({ opacity: sunsetOpacity.value }));
  const animatedMidnight = useAnimatedStyle(() => ({ opacity: midnightOpacity.value }));

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* 1. ZEN LAYER */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FAF6F0' }, animatedZen]}>
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <Defs>
            <LinearGradient id="zenSunGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#E9967A" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#FFFDF9" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>
          
          <G opacity="0.32">
            <Circle cx="20" cy={screenHeight - 20} r="60" stroke="#8C6A5C" strokeWidth="1" fill="none" strokeDasharray="3, 4" />
            <Circle cx="20" cy={screenHeight - 20} r="100" stroke="#8C6A5C" strokeWidth="1" fill="none" />
            <Circle cx="20" cy={screenHeight - 20} r="140" stroke="#8C6A5C" strokeWidth="1" fill="none" strokeDasharray="4, 5" />
            <Circle cx="20" cy={screenHeight - 20} r="180" stroke="#8C6A5C" strokeWidth="1.5" fill="none" />
            <Circle cx="20" cy={screenHeight - 20} r="230" stroke="#8C6A5C" strokeWidth="1" fill="none" strokeDasharray="3, 3" />
          </G>

          <G transform={`translate(15, ${screenHeight - 65})`} opacity="0.25">
            <Path d="M 0 35 Q 20 5 45 35 Z" fill="#8C6A5C" />
            <Path d="M 28 20 Q 42 0 58 20 Z" fill="#8C6A5C" opacity="0.8" />
            <Path d="M 12 12 Q 22 2 34 12 Z" fill="#8C6A5C" opacity="0.6" />
          </G>

          <Circle cx={screenWidth * 0.5} cy="100" r="70" fill="url(#zenSunGlow)" />

          <G opacity="0.26" transform={`translate(${screenWidth - 100}, 20)`}>
            <Path d="M80,0 Q75,100 70,220" stroke="#8C6A5C" strokeWidth="2.5" fill="none" />
            <Path d="M80,0 L70,220" stroke="#FFFDF9" strokeWidth="0.8" fill="none" />
            <Path d="M92,-10 Q88,80 82,180" stroke="#8C6A5C" strokeWidth="1.8" fill="none" />
            <Circle cx="77.5" cy="50" r="2" fill="#8C6A5C" />
            <Circle cx="75" cy="110" r="2.2" fill="#8C6A5C" />
            <Circle cx="72.5" cy="170" r="2" fill="#8C6A5C" />
            <Path d="M77,50 Q40,30 20,40 Q45,55 77,50" fill="#8C6A5C" />
            <Path d="M77,50 Q50,70 30,95 Q55,80 77,50" fill="#8C6A5C" />
            <Path d="M75,110 Q35,105 10,125 Q35,135 75,110" fill="#8C6A5C" />
            <Path d="M75,110 Q45,130 25,165 Q50,145 75,110" fill="#8C6A5C" />
            <Path d="M72.5,170 Q40,180 18,210 Q42,200 72.5,170" fill="#8C6A5C" />
            <Path d="M85,30 Q110,15 125,5 Q115,25 85,30" fill="#8C6A5C" />
            <Path d="M83,90 Q115,85 130,80 Q115,100 83,90" fill="#8C6A5C" />
          </G>
        </Svg>
      </Animated.View>

      {/* 2. MATCHA LAYER */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#F1F5E9' }, animatedMatcha]}>
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <G opacity="0.18" transform={`translate(${screenWidth - 120}, -20)`}>
            <Path d="M0,80 C60,40 100,40 140,80 C100,120 60,120 0,80" fill="#4A704C" />
            <Path d="M0,80 C60,40 120,60 140,80" stroke="#F1F5E9" strokeWidth="1" fill="none" />
            <Path d="M20,130 C70,100 110,110 130,140 C90,170 50,160 20,130" fill="#4A704C" transform="rotate(-15, 20, 130)" />
            <Path d="M30,50 C80,20 110,40 130,70 C90,90 60,80 30,50" fill="#4A704C" transform="rotate(30, 30, 50)" />
          </G>
          <G opacity="0.12" transform={`translate(${screenWidth - 130}, ${screenHeight - 165})`}>
            <Path d="M 10,70 Q 10,115 55,115 Q 100,115 100,70 L 90,70 Q 90,103 55,103 Q 20,103 20,70 Z" fill="#4A704C" />
            <Rect x="43" y="115" width="24" height="4" rx="2" fill="#4A704C" />
            <Path d="M-22,64 L50,86 L48,91 L-24,69 Z" fill="#4A704C" transform="rotate(-15, 14, 75)" />
          </G>
          <G opacity="0.13" transform="translate(-10, 480)">
            <Path d="M0,40 C40,20 80,30 100,60 C70,80 30,70 0,40" fill="#4A704C" transform="rotate(25, 0, 40)" />
          </G>
        </Svg>
      </Animated.View>

      {/* 3. SUNSET LAYER */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFF3EE' }, animatedSunset]}>
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <Defs>
            <LinearGradient id="sunsetGradientOnboarding" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#FFE4D6" stopOpacity="0.8" />
              <Stop offset="45%" stopColor="#FFD3C4" />
              <Stop offset="100%" stopColor="#FFF3EE" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#sunsetGradientOnboarding)" />
          <Circle cx={screenWidth * 0.3} cy="180" r="42" fill="#E05A47" opacity="0.14" />
          <Circle cx={screenWidth * 0.3} cy="180" r="30" fill="#E05A47" opacity="0.16" />
          <G opacity="0.18">
            <Path d={`M 0,${screenHeight - 110} Q ${screenWidth * 0.3},${screenHeight - 160} ${screenWidth * 0.65},${screenHeight - 110} T ${screenWidth},${screenHeight - 90} L ${screenWidth},${screenHeight} L 0,${screenHeight} Z`} fill="#D9534F" />
            <Path d={`M 0,${screenHeight - 70} Q ${screenWidth * 0.5},${screenHeight - 110} ${screenWidth},${screenHeight - 65} L ${screenWidth},${screenHeight} L 0,${screenHeight} Z`} fill="#4A2A20" opacity="0.25" />
          </G>
          <G opacity="0.24" transform={`translate(${screenWidth - 90}, 20)`}>
            <Path d="M90,-10 C60,40 30,70 -10,90" stroke="#7D574E" strokeWidth="1.5" fill="none" />
            <Path d="M40,50 L42,38 L30,45 L32,32 L20,30 L32,24 L28,12 L38,20 L48,15 L44,28 L54,34 L44,38 Z" fill="#E05A47" transform="rotate(-15, 40, 50)" />
            <Path d="M40,50 L52,58 M40,50 L42,38 M40,50 L30,45 M40,50 L32,32 M40,50 L20,30" stroke="#7D574E" strokeWidth="0.6" />
            <Path d="M72,22 L73,12 L63,18 L64,7 L54,6 L64,1 L60,-9 L69,-3 L77,-7 L74,4 L82,9 L74,12 Z" fill="#E05A47" transform="scale(0.85) translate(30, 20)" />
          </G>
        </Svg>
      </Animated.View>

      {/* 4. MIDNIGHT LAYER */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#030509' }, animatedMidnight]}>
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <Defs>
            <LinearGradient id="midnightGradientOnboarding" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#030509" />
              <Stop offset="65%" stopColor="#050810" />
              <Stop offset="100%" stopColor="#090E1A" />
            </LinearGradient>
            <LinearGradient id="lampConeOnboarding" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#FCD34D" stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#FCD34D" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#midnightGradientOnboarding)" />
          <G opacity="0.95">
            <Circle cx="30" cy="80" r="1.2" fill="#FFFFFF" />
            <Circle cx="80" cy="140" r="1.8" fill="#FFFFFF" opacity="0.8" />
            <Circle cx="130" cy="60" r="1" fill="#FFFFFF" />
            <Circle cx={screenWidth * 0.45} cy="100" r="1.5" fill="#FFFFFF" opacity="0.85" />
            <Circle cx={screenWidth * 0.72} cy="180" r="1.2" fill="#FFFFFF" />
            <Circle cx={screenWidth - 140} cy="120" r="2" fill="#FFFFFF" opacity="0.95" />
            <Circle cx="50" cy="280" r="1.5" fill="#FFFFFF" opacity="0.75" />
            <Circle cx={screenWidth - 50} cy="290" r="1.2" fill="#FFFFFF" />
            <Circle cx="120" cy="400" r="1.8" fill="#FFFFFF" opacity="0.8" />
            <Circle cx="190" cy="200" r="1.2" fill="#FFFFFF" opacity="0.7" />
            <Circle cx="260" cy="90" r="1.5" fill="#FFFFFF" opacity="0.8" />
            <Circle cx="310" cy="220" r="1" fill="#FFFFFF" opacity="0.65" />
            <Path d="M150,70 Q150,78 158,78 Q150,78 150,86 Q150,78 142,78 Q150,78 150,70" fill="#FFFFFF" />
            <Path d="M70,220 Q70,226 76,226 Q70,226 70,232 Q70,226 64,226 Q70,226 70,220" fill="#FFFFFF" opacity="0.9" />
            <Path d="M280,140 Q280,147 287,147 Q280,147 280,154 Q280,147 273,147 Q280,147 280,140" fill="#FFFFFF" opacity="0.95" />
          </G>
          <G transform={`translate(${screenWidth * 0.6 - 20}, 60)`}>
            <Circle cx="20" cy="20" r="32" fill="#FFF" opacity="0.02" />
            <Circle cx="20" cy="20" r="22" fill="#FFF" opacity="0.04" />
            <Path d="M 12 4 A 18 18 0 1 0 36 28 A 15 15 0 1 1 12 4 Z" fill="#FFF" opacity="0.8" />
            <Path d="M 12 4 A 18 18 0 1 0 36 28 A 15 15 0 1 1 12 4 Z" stroke="#818CF8" strokeWidth="0.9" fill="none" opacity="0.5" />
          </G>
          <G transform={`translate(${screenWidth - 110}, ${screenHeight - 190})`}>
            <Path d="M 60,30 C 50,20 20,40 10,70" stroke="#818CF8" strokeWidth="1.5" fill="none" opacity="0.25" />
            <Path d="M 50,45 L -280,180 L 10,180 Z" fill="url(#lampConeOnboarding)" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

export default function OnboardingCoordinator() {
  const router = useRouter();
  const { login, isAuthenticated, user } = useAuthStore();
  const {
    currentStep,
    setStep,
    completeOnboarding,
    isGeneratingSystem,
    setIsGeneratingSystem,
  } = useOnboardingStore();

  const [isLoading, setIsLoading] = useState(false);
  const [activeStepContent, setActiveStepContent] = useState<string>('');

  // Exit transition shared values
  const exitOpacity = useSharedValue(0);
  const exitScale = useSharedValue(1);

  // Dynamic Background Shared Values (transitions Midnight -> Sunset -> Matcha -> Zen -> Midnight ...)
  const zenOpacity = useSharedValue(0);
  const matchaOpacity = useSharedValue(0);
  const sunsetOpacity = useSharedValue(0);
  const midnightOpacity = useSharedValue(1);

  const backgroundIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    exitOpacity.value = withTiming(1, { duration: 800 });

    const opacities = [midnightOpacity, sunsetOpacity, matchaOpacity, zenOpacity];
    let currentIdx = 0;
    backgroundIntervalRef.current = setInterval(() => {
      const prevIdx = currentIdx;
      currentIdx = (currentIdx + 1) % 4;
      
      opacities[prevIdx].value = withTiming(0, { duration: 5000 });
      opacities[currentIdx].value = withTiming(1, { duration: 5000 });
    }, 8000);

    return () => {
      if (backgroundIntervalRef.current) {
        clearInterval(backgroundIntervalRef.current);
      }
    };
  }, []);

  const transitionToZenSlowly = () => {
    if (backgroundIntervalRef.current) {
      clearInterval(backgroundIntervalRef.current);
      backgroundIntervalRef.current = null;
    }
    zenOpacity.value = withTiming(1, { duration: 2000 });
    matchaOpacity.value = withTiming(0, { duration: 2000 });
    sunsetOpacity.value = withTiming(0, { duration: 2000 });
    midnightOpacity.value = withTiming(0, { duration: 2000 });
  };

  const card0TranslateX = useSharedValue(0);
  const card1TranslateX = useSharedValue(0);
  const card2TranslateX = useSharedValue(0);
  const card3TranslateX = useSharedValue(0);
  const card4TranslateX = useSharedValue(0);
  const card5TranslateX = useSharedValue(0);

  const cardTranslates = [
    card0TranslateX,
    card1TranslateX,
    card2TranslateX,
    card3TranslateX,
    card4TranslateX,
    card5TranslateX,
  ];

  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const isGestureActive = React.useRef(false);

  const handleCardTouchStart = (e: any) => {
    if (currentStep >= 6 || isGeneratingSystem) return;
    startX.current = e.nativeEvent.pageX;
    startY.current = e.nativeEvent.pageY;
    isGestureActive.current = true;
  };

  const handleCardTouchMove = (e: any) => {
    if (!isGestureActive.current || currentStep >= 6 || isGeneratingSystem) return;
    let dx = e.nativeEvent.pageX - startX.current;
    const dy = e.nativeEvent.pageY - startY.current;
    
    // Only track if horizontal movement is dominant
    if (Math.abs(dx) > 10 && Math.abs(dy) < Math.abs(dx) * 0.8) {
      // Only drag the current card for LEFT swipe (forward)
      if (dx < 0 && currentStep <= 5) {
        cardTranslates[currentStep].value = dx;
      }
    }
  };

  const finalizeStepTransition = (nextStep: number) => {
    // Decouple React state updates in Fabric renderer loop to prevent nesting crashes
    setTimeout(() => {
      setStep(nextStep);
    }, 0);
  };

  const handleCardTouchEnd = (e: any) => {
    if (!isGestureActive.current || currentStep >= 6 || isGeneratingSystem) return;
    isGestureActive.current = false;
    
    const dx = e.nativeEvent.pageX - startX.current;
    
    // Swipe next (left swipe)
    if (dx < -100) {
      if (currentStep < 5) {
        runOnJS(handleNext)();
      } else if (currentStep === 5) {
        runOnJS(handleSkipOrGuest)();
      }
    } 
    // Swipe back (right swipe) - not allowed on first card
    else if (dx > 100 && currentStep > 0) {
      runOnJS(handleBack)();
    } 
    // Cancel swipe, return to center
    else {
      cardTranslates[currentStep].value = withSpring(0, { damping: 15, stiffness: 120 });
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
      hapticFeedback.selection();
      cardTranslates[currentStep].value = withTiming(-width - 100, { duration: 300 }, () => {
        runOnJS(finalizeStepTransition)(currentStep + 1);
      });
    } else if (currentStep === 5) {
      handleSkipOrGuest();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      hapticFeedback.selection();
      // Previous card starts offscreen left, slides RIGHT over the current card
      cardTranslates[currentStep - 1].value = -width - 100;
      cardTranslates[currentStep - 1].value = withTiming(0, { duration: 300 }, () => {
        // Once the previous card is fully in place, reset current card and transition
        cardTranslates[currentStep].value = 0;
        runOnJS(finalizeStepTransition)(currentStep - 1);
      });
    }
  };

  const navigateToAppDirectly = async () => {
    setIsGeneratingSystem(true);
    await completeOnboarding();
    
    const hasAccess = isAuthenticated || user?.id === 'guest-user';

    // Gentle scale-down exit (keep opacity visible to avoid black flash)
    exitScale.value = withTiming(0.97, { duration: 280 });
    exitOpacity.value = withTiming(0.3, { duration: 280 });

    setTimeout(() => {
      // Navigate FIRST — isGeneratingSystem stays true so _layout guard won't race
      if (hasAccess) {
        (globalThis as any).__hasPlayedLearnAnimation = true;
        router.replace('/(protected)/(tabs)/learn');
      } else {
        router.replace('/(auth)/login');
      }

      // Clean up AFTER navigation has had time to mount the new screen
      setTimeout(() => {
        setIsGeneratingSystem(false);
        setIsLoading(false);
      }, 500);
    }, 300);
  };

  const finishGuestLogin = () => {
    setIsGeneratingSystem(true);

    // If already authenticated (returning user in __DEV__ mode), skip mock login
    if (isAuthenticated) {
      navigateToAppDirectly();
      return;
    }

    const doLogin = async () => {
      try {
        const mockToken = "";
        const mockUser = {
          id: "guest-user",
          name: "Guest Explorer",
          email: "guest@dsa-reels.com",
          avatarUrl: "https://ui-avatars.com/api/?name=Guest",
          role: "user" as const,
        };
        await login(mockToken, mockUser);
        navigateToAppDirectly();
      } catch (e) {
        console.error('Guest onboarding setup error:', e);
        setIsGeneratingSystem(false);
        setIsLoading(false);
      }
    };
    doLogin();
  };

  const handleSkipOrGuest = () => {
    try {
      setIsLoading(true);
      hapticFeedback.success();
      
      // Slowly transition the background to Zen theme
      transitionToZenSlowly();
      
      // Animate current card sliding out, then navigate directly
      cardTranslates[currentStep].value = withTiming(-width - 100, { duration: 300 }, () => {
        runOnJS(navigateToAppDirectly)();
      });
    } catch (e) {
      console.error('Guest onboarding setup error:', e);
      cardTranslates[currentStep].value = withSpring(0, { damping: 15, stiffness: 120 });
      setIsLoading(false);
    }
  };

  const finishGoogleLogin = () => {
    navigateToAppDirectly();
  };

  const handleGoogleSignup = () => {
    try {
      setIsLoading(true);
      hapticFeedback.success();
      
      // Slowly transition the background to Zen theme
      transitionToZenSlowly();
      
      // Animate 6th card sliding out, then login & navigate directly
      cardTranslates[5].value = withTiming(-width - 100, { duration: 300 }, () => {
        runOnJS(finishGoogleLogin)();
      });
    } catch (e) {
      console.error('Google auth onboarding error:', e);
      cardTranslates[5].value = withSpring(0, { damping: 15, stiffness: 120 });
      setIsLoading(false);
    }
  };

  const card0Style = useAnimatedStyle(() => getCardStyle(0, currentStep, cardTranslates, width));
  const card1Style = useAnimatedStyle(() => getCardStyle(1, currentStep, cardTranslates, width));
  const card2Style = useAnimatedStyle(() => getCardStyle(2, currentStep, cardTranslates, width));
  const card3Style = useAnimatedStyle(() => getCardStyle(3, currentStep, cardTranslates, width));
  const card4Style = useAnimatedStyle(() => getCardStyle(4, currentStep, cardTranslates, width));
  const card5Style = useAnimatedStyle(() => getCardStyle(5, currentStep, cardTranslates, width));

  const renderStepCard = (stepIdx: number) => {
    const diff = stepIdx - currentStep;
    if (diff > 1) return null;

    let content = null;
    switch (stepIdx) {
      case 0:
        content = <SlideWelcome />;
        break;
      case 1:
        content = <SlidePlaylistReorder />;
        break;
      case 2:
        content = <SlideFlashcardsReels />;
        break;
      case 3:
        content = <SlideAskGPT />;
        break;
      case 4:
        content = <SlideScheduleRevision />;
        break;
      case 5:
        content = <SlideThemeAccents />;
        break;
      default:
        return null;
    }

    const cardStyles = [
      card0Style,
      card1Style,
      card2Style,
      card3Style,
      card4Style,
      card5Style,
    ];

    const isNextCard = diff === 1;

    return (
      <Animated.View
        key={`card-${stepIdx}`}
        style={[
          styles.onboardingCard,
          cardStyles[stepIdx],
        ]}
        {...(isNextCard ? {} : {
          onTouchStart: handleCardTouchStart,
          onTouchMove: handleCardTouchMove,
          onTouchEnd: handleCardTouchEnd,
        })}
      >
        {content}
      </Animated.View>
    );
  };

  const exitAnimatedStyle = useAnimatedStyle(() => ({
    opacity: exitOpacity.value,
    transform: [{ scale: exitScale.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#FAF6F0' }}>
      <Animated.View style={[{ flex: 1 }, exitAnimatedStyle]}>
        <OnboardingDynamicBackground
          zenOpacity={zenOpacity}
          matchaOpacity={matchaOpacity}
          sunsetOpacity={sunsetOpacity}
          midnightOpacity={midnightOpacity}
        />
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
          <View style={styles.header}>
            {currentStep > 0 && currentStep < 6 && !isGeneratingSystem && (
              <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.6}>
                <ChevronLeft color="#475569" size={20} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
            
            {currentStep < 6 && !isGeneratingSystem && (
              <View style={styles.stepIndicatorContainer}>
                {Array.from({ length: 6 }).map((_, idx) => (
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
            )}
          </View>

          <View style={styles.contentPortal}>
            <View style={styles.cardStackContainer}>
              {renderStepCard(5)}
              {renderStepCard(4)}
              {renderStepCard(3)}
              {renderStepCard(2)}
              {renderStepCard(1)}
              {renderStepCard(0)}
            </View>
          </View>

          {currentStep < 6 && !isGeneratingSystem && (
            <View style={styles.footer}>
              <View />

              <View style={styles.nextBtn}>
                <SpringPressable onPress={handleNext} style={styles.nextBtn}>
                  <ChevronRight color="#FFFFFF" size={20} strokeWidth={3} />
                </SpringPressable>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

// -------------------------------------------------------------
// SCREEN 1: WELCOME (Static Premium Apple-Style Layout, No Animations)
// -------------------------------------------------------------
function SlideWelcome() {
  const floatAnim = useSharedValue(0);

  // Background drifting particles shared values
  const particle1X = useSharedValue(0);
  const particle1Y = useSharedValue(0);
  const particle2X = useSharedValue(0);
  const particle2Y = useSharedValue(0);
  const particle3X = useSharedValue(0);
  const particle3Y = useSharedValue(0);

  // Breathing background blob shared value - matches resting human heart/breathing rates
  const blobScale = useSharedValue(0.94);

  // Hashtag animation values
  const hashtagOpacity = useSharedValue(1);
  const hashtagScale = useSharedValue(1);

  // Card 1 (For late-night prep) animation values
  const card1Y = useSharedValue(0);
  const card1X = useSharedValue(0);
  const card1Rotate = useSharedValue(-3);
  const card1Opacity = useSharedValue(0);
  const card1Scale = useSharedValue(1);
  const card1Float = useSharedValue(0);
  const card1TapScale = useSharedValue(1);

  // Card 2 (For small revision sessions) animation values
  const card2Y = useSharedValue(0);
  const card2X = useSharedValue(0);
  const card2Rotate = useSharedValue(3);
  const card2Opacity = useSharedValue(0);
  const card2Scale = useSharedValue(1);
  const card2Float = useSharedValue(0);
  const card2TapScale = useSharedValue(1);

  // Card 3 (For students trying their best) animation values
  const card3Y = useSharedValue(0);
  const card3X = useSharedValue(0);
  const card3Rotate = useSharedValue(-1);
  const card3Opacity = useSharedValue(0);
  const card3Scale = useSharedValue(1);
  const card3Float = useSharedValue(0);
  const card3TapScale = useSharedValue(1);



  // Notebook paper lines drawing
  const line1Width = useSharedValue(0);
  const line2Width = useSharedValue(0);
  const line3Width = useSharedValue(0);

  // Sleepy Student character animations
  const headNodY = useSharedValue(0);
  const headNodRotate = useSharedValue(0);
  const steamY = useSharedValue(0);
  const steamOpacity = useSharedValue(0.4);
  const bodyBreathe = useSharedValue(0.98);
  // Spark animation shared value
  const sparkScale = useSharedValue(0);
  const animatedSpark = useAnimatedStyle(() => ({
    transform: [{ scale: sparkScale.value }],
    opacity: sparkScale.value,
  }));

  // Typing dots shared values and animations
  const dotScale1 = useSharedValue(0);
  const dotScale2 = useSharedValue(0);
  const dotScale3 = useSharedValue(0);
  const animatedDots1 = useAnimatedStyle(() => ({ opacity: dotScale1.value }));
  const animatedDots2 = useAnimatedStyle(() => ({ opacity: dotScale2.value }));
  const animatedDots3 = useAnimatedStyle(() => ({ opacity: dotScale3.value }));

  const glowScale = useSharedValue(0.95);

  useEffect(() => {
    // Start spark animation loop
    sparkScale.value = withDelay(0, withRepeat(withTiming(1, { duration: 800 }), -1, true));

    // Start typing dots animation sequence
    dotScale1.value = withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(300, withTiming(0, { duration: 300 }))
    );
    dotScale2.value = withDelay(200, withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(300, withTiming(0, { duration: 300 }))
    ));
    dotScale3.value = withDelay(400, withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(300, withTiming(0, { duration: 300 }))
    ));

    // 1. Cozy float animation - extremely subtle
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 3200 }),
        withTiming(0, { duration: 3200 })
      ),
      -1,
      true
    );

    // 2. Slow breathing background blob - 6000ms breathing cycle
    blobScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 3000 }),
        withTiming(0.94, { duration: 3000 })
      ),
      -1,
      true
    );

    // 3. Background lazy drifts
    particle1X.value = withRepeat(withSequence(withTiming(15, { duration: 4500 }), withTiming(-15, { duration: 4500 })), -1, true);
    particle1Y.value = withRepeat(withSequence(withTiming(-16, { duration: 5000 }), withTiming(16, { duration: 5000 })), -1, true);

    particle2X.value = withRepeat(withSequence(withTiming(-12, { duration: 4000 }), withTiming(12, { duration: 4000 })), -1, true);
    particle2Y.value = withRepeat(withSequence(withTiming(20, { duration: 5200 }), withTiming(-20, { duration: 5200 })), -1, true);

    particle3X.value = withRepeat(withSequence(withTiming(15, { duration: 4800 }), withTiming(-15, { duration: 4800 })), -1, true);
    particle3Y.value = withRepeat(withSequence(withTiming(-12, { duration: 4200 }), withTiming(12, { duration: 4200 })), -1, true);

    // 4. Staggered hashtag is static



    // 6. Notebook drawing lines
    line1Width.value = withDelay(450, withTiming(1, { duration: 1200 }));
    line2Width.value = withDelay(700, withTiming(1, { duration: 1200 }));
    line3Width.value = withDelay(950, withTiming(1, { duration: 1200 }));

    // 7. Student animations
    headNodY.value = withRepeat(
      withSequence(
        withTiming(2.5, { duration: 2400 }),
        withTiming(0, { duration: 2400 })
      ),
      -1,
      true
    );
    headNodRotate.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 2400 }),
        withTiming(0, { duration: 2400 })
      ),
      -1,
      true
    );
    steamY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1600 }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    steamOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1600 }),
        withTiming(0.4, { duration: 0 })
      ),
      -1,
      false
    );
    bodyBreathe.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2800 }),
        withTiming(0.98, { duration: 2800 })
      ),
      -1,
      true
    );
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2000 }),
        withTiming(0.92, { duration: 2000 })
      ),
      -1,
      true
    );

    // 8. Staggered card fade-in + float loops (no slide-up from below)
    card1Opacity.value = withDelay(150, withTiming(1, { duration: 500 }));
    card1Float.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 2600 }),
        withTiming(3, { duration: 2600 })
      ),
      -1,
      true
    );

    card2Opacity.value = withDelay(350, withTiming(1, { duration: 500 }));
    card2Float.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 3000 }),
        withTiming(1, { duration: 3000 })
      ),
      -1,
      true
    );

    card3Opacity.value = withDelay(550, withTiming(1, { duration: 500 }));
    card3Float.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 2400 }),
        withTiming(2, { duration: 2400 })
      ),
      -1,
      true
    );

    return () => {
      cancelAnimation(sparkScale);
      cancelAnimation(dotScale1);
      cancelAnimation(dotScale2);
      cancelAnimation(dotScale3);

      cancelAnimation(floatAnim);
      cancelAnimation(blobScale);
      cancelAnimation(particle1X);
      cancelAnimation(particle1Y);
      cancelAnimation(particle2X);
      cancelAnimation(particle2Y);
      cancelAnimation(particle3X);
      cancelAnimation(particle3Y);

      cancelAnimation(card1Y);
      cancelAnimation(card1X);
      cancelAnimation(card1Rotate);
      cancelAnimation(card1Opacity);
      cancelAnimation(card1Scale);
      cancelAnimation(card1Float);
      cancelAnimation(card2Y);
      cancelAnimation(card2X);
      cancelAnimation(card2Rotate);
      cancelAnimation(card2Opacity);
      cancelAnimation(card2Scale);
      cancelAnimation(card2Float);
      cancelAnimation(card3Y);
      cancelAnimation(card3X);
      cancelAnimation(card3Rotate);
      cancelAnimation(card3Opacity);
      cancelAnimation(card3Scale);
      cancelAnimation(card3Float);

      cancelAnimation(line1Width);
      cancelAnimation(line2Width);
      cancelAnimation(line3Width);
      cancelAnimation(headNodY);
      cancelAnimation(headNodRotate);
      cancelAnimation(steamY);
      cancelAnimation(steamOpacity);
      cancelAnimation(bodyBreathe);
      cancelAnimation(glowScale);
    };
  }, []);

  const animatedBlobStyle = useAnimatedStyle(() => ({
    transform: [{ scale: blobScale.value }],
  }));

  const animatedHashtagStyle = useAnimatedStyle(() => ({
    opacity: hashtagOpacity.value,
    transform: [{ scale: hashtagScale.value }],
  }));

  // Background Particles style mapping
  const styleParticle1 = useAnimatedStyle(() => ({ transform: [{ translateX: particle1X.value }, { translateY: particle1Y.value }] }));
  const styleParticle2 = useAnimatedStyle(() => ({ transform: [{ translateX: particle2X.value }, { translateY: particle2Y.value }] }));
  const styleParticle3 = useAnimatedStyle(() => ({ transform: [{ translateX: particle3X.value }, { translateY: particle3Y.value }] }));



  // Notebook line drawing styles
  const styleLine1 = useAnimatedStyle(() => ({
    width: `${line1Width.value * 94}%`,
    opacity: line1Width.value * 0.45,
  }));
  const styleLine2 = useAnimatedStyle(() => ({
    width: `${line2Width.value * 96}%`,
    opacity: line2Width.value * 0.45,
  }));
  const styleLine3 = useAnimatedStyle(() => ({
    width: `${line3Width.value * 92}%`,
    opacity: line3Width.value * 0.45,
  }));

  // Sleepy student character animated styles
  const animatedStudentBodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bodyBreathe.value }],
  }));

  const animatedStudentHeadStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: headNodY.value },
      { rotate: `${headNodRotate.value}deg` },
    ],
  }));

  const animatedSteamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: steamY.value }],
    opacity: steamOpacity.value,
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));

  // Dynamic Card Styles
  const styleCard1 = useAnimatedStyle(() => ({
    opacity: card1Opacity.value,
    transform: [
      { translateX: card1X.value },
      { translateY: card1Y.value + card1Float.value },
      { scale: card1Scale.value * card1TapScale.value },
      { rotate: `${card1Rotate.value}deg` },
    ],
  }));

  const styleCard2 = useAnimatedStyle(() => ({
    opacity: card2Opacity.value,
    transform: [
      { translateX: card2X.value },
      { translateY: card2Y.value + card2Float.value },
      { scale: card2Scale.value * card2TapScale.value },
      { rotate: `${card2Rotate.value}deg` },
    ],
  }));

  const styleCard3 = useAnimatedStyle(() => ({
    opacity: card3Opacity.value,
    transform: [
      { translateX: card3X.value },
      { translateY: card3Y.value + card3Float.value },
      { scale: card3Scale.value * card3TapScale.value },
      { rotate: `${card3Rotate.value}deg` },
    ],
  }));

  // Tactile Press Handlers
  const handlePressIn1 = () => {
    card1TapScale.value = withSpring(0.94, { damping: 10, stiffness: 220 });
  };
  const handlePressOut1 = () => {
    card1TapScale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const handlePressIn2 = () => {
    card2TapScale.value = withSpring(0.94, { damping: 10, stiffness: 220 });
  };
  const handlePressOut2 = () => {
    card2TapScale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const handlePressIn3 = () => {
    card3TapScale.value = withSpring(0.94, { damping: 10, stiffness: 220 });
  };
  const handlePressOut3 = () => {
    card3TapScale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  return (
    <View style={styles.slideInner}>
      
      {/* Background large ultra-soft pastel breathing blob */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Animated.View style={[styles.breathingBlobBg, animatedBlobStyle]} />
      </View>

      {/* Background drifting graduation caps & sparkles */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Animated.View style={[styles.floatingBgItem, { top: '12%', left: '8%' }, styleParticle1]}>
          <GraduationCap color="rgba(139, 92, 246, 0.05)" size={20} strokeWidth={1.5} />
        </Animated.View>
        <Animated.View style={[styles.floatingBgItem, { top: '38%', right: '10%' }, styleParticle2]}>
          <Sparkles color="rgba(99, 102, 241, 0.05)" size={16} strokeWidth={1.5} />
        </Animated.View>
        <Animated.View style={[styles.floatingBgItem, { bottom: '28%', left: '12%' }, styleParticle3]}>
          <Sparkles color="rgba(139, 92, 246, 0.04)" size={22} strokeWidth={1.2} />
        </Animated.View>
      </View>

      {/* Notebook Paper Lines Behind Text */}
      <View style={styles.notebookPaper} pointerEvents="none">
        <Animated.View style={[styles.notebookPaperLine, styleLine1]} />
        <Animated.View style={[styles.notebookPaperLine, styleLine2]} />
        <Animated.View style={[styles.notebookPaperLine, styleLine3]} />
      </View>

      <View style={styles.appleTextBlock}>
        <View style={styles.welcomeTitleRow}>
          <Text style={styles.appleTitle}>Welcome 🌱</Text>
        </View>
        
        <Text style={styles.appleBody}>
          Built by a student{"\n"}who wanted revision to feel simple again.
        </Text>

        <Animated.View style={animatedHashtagStyle}>
          <Text style={styles.appleHashtags}>
            #GivingBackToTheCommunity
          </Text>
        </Animated.View>
      </View>

      {/* Spacious, premium cascading card visual deck */}
      <View style={styles.welcomeVisualContainer}>
        
        {/* Abstract Sleepy Student Vector Illustration */}
        <Animated.View style={[styles.sleepyStudentContainer, animatedStudentBodyStyle]} pointerEvents="none">
          <Animated.View style={[styles.characterGlow, animatedGlowStyle]} />
          
          {/* Coffee Mug */}
          <View style={styles.characterMug}>
            <Animated.View style={[styles.characterSteam, animatedSteamStyle]} />
            <View style={styles.mugHandle} />
          </View>

          {/* Laptop */}
          <View style={styles.characterLaptop}>
            <View style={styles.laptopKeyboard} />
            <View style={styles.laptopScreen} />
          </View>

          {/* Student body shape */}
          <View style={styles.studentBody}>
            <View style={styles.hoodieDrawstringLeft} />
            <View style={styles.hoodieDrawstringRight} />
            {/* Head nodding sleepily */}
            <Animated.View style={[styles.studentHead, animatedStudentHeadStyle]}>
              {/* Messy Hair Strands */}
              <View style={styles.hairBase} />
              <View style={[styles.hairStrand, styles.hairStrand1]} />
              <View style={[styles.hairStrand, styles.hairStrand2]} />
              <View style={[styles.hairStrand, styles.hairStrand3]} />
              <View style={[styles.hairStrand, styles.hairStrand4]} />
              <View style={[styles.hairStrand, styles.hairStrand5]} />
              <View style={[styles.hairStrand, styles.hairStrand6]} />
              <View style={[styles.hairStrand, styles.hairStrand7]} />
              <View style={[styles.hairStrand, styles.hairStrand8]} />
              
              <Text style={styles.sleepyEyes}>︶ ︶</Text>
              <View style={styles.headphoneBand} />
              <View style={styles.headphoneCupLeft} />
              <View style={styles.headphoneCupRight} />
            </Animated.View>
          </View>
        </Animated.View>

        {/* Card 1: For late-night prep. */}
        <Animated.View style={[styles.welcomeFloatingCard, styles.welcomeCardLeft, styleCard1]}>
          <Pressable
            onPressIn={handlePressIn1}
            onPressOut={handlePressOut1}
            style={styles.cardPressableContainer}
          >
            <View style={[styles.welcomeIconPill, { backgroundColor: '#EEF2F6' }]}>
              <Moon color="#475569" size={13} strokeWidth={2.5} />
            </View>
            <Text style={styles.welcomeCardText}>For late-night prep.</Text>
          </Pressable>
        </Animated.View>

        {/* Card 2: For small revision sessions. */}
        <Animated.View style={[styles.welcomeFloatingCard, styles.welcomeCardRight, styleCard2]}>
          <Pressable
            onPressIn={handlePressIn2}
            onPressOut={handlePressOut2}
            style={styles.cardPressableContainer}
          >
            <View style={[styles.welcomeIconPill, { backgroundColor: '#FEF3C7' }]}>
              <Coffee color="#D97706" size={13} strokeWidth={2.5} />
            </View>
            <Text style={styles.welcomeCardText}>For small revision sessions.</Text>
          </Pressable>
        </Animated.View>

        {/* Card 3: For students trying their best. */}
        <Animated.View style={[styles.welcomeFloatingCard, styles.welcomeCardCenter, styleCard3]}>
          <Pressable
            onPressIn={handlePressIn3}
            onPressOut={handlePressOut3}
            style={styles.cardPressableContainer}
          >
            <View style={[styles.welcomeIconPill, { backgroundColor: '#FCE7F3' }]}>
              <Heart color="#DB2777" size={13} strokeWidth={2.5} />
            </View>
            <Text style={styles.welcomeCardText}>For students trying their best.</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// SCREEN 2: PLAYLIST REORDERING (drag to reorder animation)
// -------------------------------------------------------------
function SlidePlaylistReorder() {
  const floatAnim = useSharedValue(0);
  const particle1X = useSharedValue(0);
  const particle1Y = useSharedValue(0);
  const particle2X = useSharedValue(0);
  const particle2Y = useSharedValue(0);
  const particle3X = useSharedValue(0);
  const particle3Y = useSharedValue(0);
  const blobScale = useSharedValue(0.94);
  const hashtagOpacity = useSharedValue(1);
  const hashtagScale = useSharedValue(1);

  const line1Width = useSharedValue(0);
  const line2Width = useSharedValue(0);
  const line3Width = useSharedValue(0);

  const item1Y = useSharedValue(0);
  const item2Y = useSharedValue(0);
  const item2Scale = useSharedValue(1);
  const item2Elevation = useSharedValue(2);
  const item2ShadowOpacity = useSharedValue(0.02);

  const item3Y = useSharedValue(0);
  const item3Scale = useSharedValue(1);
  const item3Elevation = useSharedValue(2);
  const item3ShadowOpacity = useSharedValue(0.02);

  useEffect(() => {
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 3000 }),
        withTiming(0, { duration: 3000 })
      ),
      -1,
      true
    );
    blobScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 3200 }),
        withTiming(0.96, { duration: 3200 })
      ),
      -1,
      true
    );
    particle1X.value = withRepeat(withSequence(withTiming(12, { duration: 4000 }), withTiming(-12, { duration: 4000 })), -1, true);
    particle1Y.value = withRepeat(withSequence(withTiming(-12, { duration: 4800 }), withTiming(12, { duration: 4800 })), -1, true);

    particle2X.value = withRepeat(withSequence(withTiming(-10, { duration: 4200 }), withTiming(10, { duration: 4200 })), -1, true);
    particle2Y.value = withRepeat(withSequence(withTiming(15, { duration: 5000 }), withTiming(-15, { duration: 5000 })), -1, true);

    particle3X.value = withRepeat(withSequence(withTiming(12, { duration: 4500 }), withTiming(-12, { duration: 4500 })), -1, true);
    particle3Y.value = withRepeat(withSequence(withTiming(-10, { duration: 3800 }), withTiming(10, { duration: 3800 })), -1, true);

    line1Width.value = withDelay(400, withTiming(1, { duration: 1100 }));
    line2Width.value = withDelay(650, withTiming(1, { duration: 1100 }));
    line3Width.value = withDelay(900, withTiming(1, { duration: 1100 }));

    const loopReorder = () => {
      item1Y.value = withTiming(0, { duration: 350 });
      item2Y.value = withTiming(0, { duration: 350 });
      item3Y.value = withTiming(0, { duration: 350 });

      item2Scale.value = withTiming(1, { duration: 250 });
      item2Elevation.value = withTiming(2, { duration: 250 });
      item2ShadowOpacity.value = withTiming(0.02, { duration: 250 });

      item3Scale.value = withTiming(1, { duration: 250 });
      item3Elevation.value = withTiming(2, { duration: 250 });
      item3ShadowOpacity.value = withTiming(0.02, { duration: 250 });

      item2Scale.value = withDelay(800, withSpring(1.04, { damping: 10, stiffness: 180 }));
      item2Elevation.value = withDelay(800, withTiming(8, { duration: 200 }));
      item2ShadowOpacity.value = withDelay(800, withTiming(0.18, { duration: 200 }));

      item2Y.value = withDelay(1400, withSpring(-92, { damping: 14, stiffness: 100 }, () => {
        runOnJS(hapticFeedback.selection)();
      }));
      item1Y.value = withDelay(1400, withSpring(92, { damping: 14, stiffness: 100 }));

      item2Scale.value = withDelay(2100, withSpring(1.0, { damping: 11, stiffness: 140 }));
      item2Elevation.value = withDelay(2100, withTiming(2, { duration: 200 }));
      item2ShadowOpacity.value = withDelay(2100, withTiming(0.02, { duration: 200 }));

      item3Scale.value = withDelay(3200, withSpring(1.04, { damping: 10, stiffness: 180 }));
      item3Elevation.value = withDelay(3200, withTiming(8, { duration: 200 }));
      item3ShadowOpacity.value = withDelay(3200, withTiming(0.18, { duration: 200 }));

      item3Y.value = withDelay(3800, withSpring(-92, { damping: 14, stiffness: 100 }, () => {
        runOnJS(hapticFeedback.selection)();
      }));
      item1Y.value = withDelay(3800, withSpring(184, { damping: 14, stiffness: 100 }));

      item3Scale.value = withDelay(4500, withSpring(1.0, { damping: 11, stiffness: 140 }));
      item3Elevation.value = withDelay(4500, withTiming(2, { duration: 200 }));
      item3ShadowOpacity.value = withDelay(4500, withTiming(0.02, { duration: 200 }));

      item1Y.value = withDelay(6200, withTiming(0, { duration: 800 }));
      item2Y.value = withDelay(6200, withTiming(0, { duration: 800 }));
      item3Y.value = withDelay(6200, withTiming(0, { duration: 800 }));
    };

    loopReorder();
    const interval = setInterval(loopReorder, 8000);

    return () => {
      clearInterval(interval);
      cancelAnimation(floatAnim);
      cancelAnimation(blobScale);
      cancelAnimation(particle1X);
      cancelAnimation(particle1Y);
      cancelAnimation(particle2X);
      cancelAnimation(particle2Y);
      cancelAnimation(particle3X);
      cancelAnimation(particle3Y);
      cancelAnimation(line1Width);
      cancelAnimation(line2Width);
      cancelAnimation(line3Width);
      cancelAnimation(item1Y);
      cancelAnimation(item2Y);
      cancelAnimation(item2Scale);
      cancelAnimation(item2Elevation);
      cancelAnimation(item2ShadowOpacity);
      cancelAnimation(item3Y);
      cancelAnimation(item3Scale);
      cancelAnimation(item3Elevation);
      cancelAnimation(item3ShadowOpacity);
    };
  }, []);

  const animatedBlobStyle = useAnimatedStyle(() => ({
    transform: [{ scale: blobScale.value }],
  }));

  const animatedHashtagStyle = useAnimatedStyle(() => ({
    opacity: hashtagOpacity.value,
    transform: [{ scale: hashtagScale.value }],
  }));

  const styleParticle1 = useAnimatedStyle(() => ({ transform: [{ translateX: particle1X.value }, { translateY: particle1Y.value }] }));
  const styleParticle2 = useAnimatedStyle(() => ({ transform: [{ translateX: particle2X.value }, { translateY: particle2Y.value }] }));
  const styleParticle3 = useAnimatedStyle(() => ({ transform: [{ translateX: particle3X.value }, { translateY: particle3Y.value }] }));

  const styleLine1 = useAnimatedStyle(() => ({
    width: `${line1Width.value * 94}%`,
    opacity: line1Width.value * 0.45,
  }));
  const styleLine2 = useAnimatedStyle(() => ({
    width: `${line2Width.value * 96}%`,
    opacity: line2Width.value * 0.45,
  }));
  const styleLine3 = useAnimatedStyle(() => ({
    width: `${line3Width.value * 92}%`,
    opacity: line3Width.value * 0.45,
  }));

  const animatedItem1 = useAnimatedStyle(() => ({
    transform: [{ translateY: item1Y.value }],
  }));

  const animatedItem2 = useAnimatedStyle(() => ({
    transform: [
      { translateY: item2Y.value },
      { scale: item2Scale.value },
    ],
    shadowOpacity: item2ShadowOpacity.value,
    elevation: item2Elevation.value,
    borderColor: item2Scale.value > 1.01 ? '#C4B5FD' : '#F1F5F9',
    backgroundColor: item2Scale.value > 1.01 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)',
  }));

  const animatedItem3 = useAnimatedStyle(() => ({
    transform: [
      { translateY: item3Y.value },
      { scale: item3Scale.value },
    ],
    shadowOpacity: item3ShadowOpacity.value,
    elevation: item3Elevation.value,
    borderColor: item3Scale.value > 1.01 ? '#C4B5FD' : '#F1F5F9',
    backgroundColor: item3Scale.value > 1.01 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)',
  }));

  return (
    <View style={styles.slideInner}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Animated.View style={[styles.breathingBlobBg, animatedBlobStyle]} />
      </View>

      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Animated.View style={[styles.floatingBgItem, { top: '12%', left: '8%' }, styleParticle1]}>
          <GraduationCap color="rgba(139, 92, 246, 0.05)" size={20} strokeWidth={1.5} />
        </Animated.View>
        <Animated.View style={[styles.floatingBgItem, { top: '38%', right: '10%' }, styleParticle2]}>
          <Sparkles color="rgba(99, 102, 241, 0.05)" size={16} strokeWidth={1.5} />
        </Animated.View>
        <Animated.View style={[styles.floatingBgItem, { bottom: '28%', left: '12%' }, styleParticle3]}>
          <Sparkles color="rgba(139, 92, 246, 0.04)" size={22} strokeWidth={1.2} />
        </Animated.View>
      </View>

      <View style={styles.notebookPaper} pointerEvents="none">
        <Animated.View style={[styles.notebookPaperLine, styleLine1]} />
        <Animated.View style={[styles.notebookPaperLine, styleLine2]} />
        <Animated.View style={[styles.notebookPaperLine, styleLine3]} />
      </View>

      <View style={styles.appleTextBlock}>
        <View style={styles.welcomeTitleRow}>
          <Text style={styles.appleTitle}>Shape your revision flow</Text>
        </View>
        
        <Text style={styles.appleBody}>
          Revision isn’t linear. Easily drag and reorder the cards in your playlist to prioritize what you need to master first according to your revision plan.
        </Text>

        <Animated.View style={animatedHashtagStyle}>
          <Text style={styles.appleHashtags}>
            #ReorderCards  #ShuffleTopics  #BuildYourOwnFlow
          </Text>
        </Animated.View>
      </View>

      <View style={styles.welcomeVisualContainer}>
        <View style={styles.playlistBox}>
          
          <Animated.View style={[styles.playlistItem, animatedItem1]}>
            <View style={styles.playlistItemLeft}>
              <Text style={styles.playlistTopic}>GRAPHS</Text>
              <Text style={styles.playlistItemText}>Course Schedule II</Text>
              <View style={styles.playlistMetaRow}>
                <Text style={[styles.playlistDifficulty, { color: '#D97706' }]}>Medium</Text>
              </View>
            </View>
            <GripVertical color="#CBD5E1" size={24} />
          </Animated.View>

          <Animated.View style={[styles.playlistItem, styles.activeItem, animatedItem2]}>
            <View style={styles.playlistItemLeft}>
              <Text style={styles.playlistTopic}>HEAPS</Text>
              <Text style={styles.playlistItemText}>Merge K Sorted Lists</Text>
              <View style={styles.playlistMetaRow}>
                <Text style={[styles.playlistDifficulty, { color: '#E11D48' }]}>Hard</Text>
              </View>
            </View>
            <GripVertical color="#CBD5E1" size={24} />
          </Animated.View>

          <Animated.View style={[styles.playlistItem, animatedItem3]}>
            <View style={styles.playlistItemLeft}>
              <Text style={styles.playlistTopic}>DYNAMIC PROGRAMMING</Text>
              <Text style={styles.playlistItemText}>0/1 Knapsack Core</Text>
              <View style={styles.playlistMetaRow}>
                <Text style={[styles.playlistDifficulty, { color: '#D97706' }]}>Medium</Text>
              </View>
            </View>
            <GripVertical color="#CBD5E1" size={24} />
          </Animated.View>

        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// SCREEN 3: FLASHCARDS AS REELS & MODES (Code vs Concept Mode)
// -------------------------------------------------------------
function SlideFlashcardsReels() {
  const cardFlip = useSharedValue(1);
  const activeMode = useSharedValue(0);
  const [modeState, setModeState] = useState<'concept' | 'code'>('concept');

  useEffect(() => {
    const flipCycle = () => {
      cardFlip.value = withDelay(
        1500,
        withSequence(
          withTiming(0.9, { duration: 150 }),
          withTiming(1.0, { duration: 150 })
        )
      );

      activeMode.value = withDelay(
        1600,
        withTiming(activeMode.value === 0 ? 1 : 0, { duration: 400 })
      );

      setTimeout(() => {
        setModeState((prev) => (prev === 'concept' ? 'code' : 'concept'));
      }, 1600);
    };

    flipCycle();
    const interval = setInterval(flipCycle, 3600);

    return () => {
      clearInterval(interval);
      cancelAnimation(cardFlip);
      cancelAnimation(activeMode);
    };
  }, []);

  const animatedCard = useAnimatedStyle(() => ({
    transform: [{ scale: cardFlip.value }],
  }));

  const animatedConcept = useAnimatedStyle(() => ({
    opacity: withTiming(modeState === 'concept' ? 1.0 : 0.0, { duration: 250 }),
    transform: [{ scale: withTiming(modeState === 'concept' ? 1.0 : 0.95, { duration: 250 }) }],
  }));

  const animatedCode = useAnimatedStyle(() => ({
    opacity: withTiming(modeState === 'code' ? 1.0 : 0.0, { duration: 250 }),
    transform: [{ scale: withTiming(modeState === 'code' ? 1.0 : 0.95, { duration: 250 }) }],
  }));

  return (
    <View style={styles.slideInner}>
      <View style={styles.appleTextBlock}>
        <View style={styles.welcomeTitleRow}>
          <Text style={styles.appleTitle}>Scroll & Swipe</Text>
        </View>
        
        <Text style={styles.appleBody}>
          Scroll vertically to browse questions. Swipe horizontally on any card to switch between intuitive concept explanations and code implementations.
        </Text>
        <Text style={{color: '#8B5CF6', fontWeight: '600', marginTop: 4}}>#ScrollQuestions #SwipeConcepts #RevisionReels</Text>
      </View>

      <View style={styles.visualContainer}>
        {/* Horizontal Swipe Indicator badges */}
        <View style={{ position: 'absolute', left: 4, top: 125, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.95)', padding: 4, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
          <ChevronLeft color="#8B5CF6" size={14} strokeWidth={3} />
        </View>
        <View style={{ position: 'absolute', right: 4, top: 125, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.95)', padding: 4, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
          <ChevronRight color="#8B5CF6" size={14} strokeWidth={3} />
        </View>

        {/* Scroll Indicator labels */}
        <View style={{ position: 'absolute', bottom: -5, zIndex: 100, backgroundColor: '#FAF6F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ArrowDown color="#64748B" size={12} strokeWidth={2.5} />
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#64748B' }}>Scroll Down for Next Question</Text>
        </View>

        <View style={styles.modeTabsRow}>
          <View style={[styles.modeTab, modeState === 'concept' && styles.modeTabActive]}>
            <Brain color={modeState === 'concept' ? '#8B5CF6' : '#64748B'} size={12} strokeWidth={2.5} />
            <Text style={[styles.modeTabText, modeState === 'concept' && styles.modeTabTextActive]}>Concept Mode</Text>
          </View>
          <View style={[styles.modeTab, modeState === 'code' && styles.modeTabActive]}>
            <Terminal color={modeState === 'code' ? '#8B5CF6' : '#64748B'} size={12} strokeWidth={2.5} />
            <Text style={[styles.modeTabText, modeState === 'code' && styles.modeTabTextActive]}>Code Mode</Text>
          </View>
        </View>

        <Animated.View style={[styles.floatingCardBase, styles.modeReelCard, animatedCard]}>
          
          <Animated.View style={[styles.cardModeContent, animatedConcept]} pointerEvents={modeState === 'concept' ? 'auto' : 'none'}>
            <View style={styles.cardHeaderSmall}>
              <Text style={styles.complexitySmall}>O(N) Time • O(1) Space</Text>
            </View>
            <Text style={styles.reelCardTitle}>Reverse Linked List</Text>
            <Text style={styles.reelCardDesc}>
              Intuition: Iterate through the list shifting adjacent node links backwards using a temporary pointer.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.cardModeContent, styles.codeModeAbs, animatedCode]} pointerEvents={modeState === 'code' ? 'auto' : 'none'}>
            <View style={styles.cardHeaderSmall}>
              <Text style={[styles.complexitySmall, { color: '#6366F1' }]}>C++ Implementation</Text>
            </View>
            <View style={styles.codeSnippetBox}>
              <Text style={styles.codeLine}><Text style={{ color: '#D946EF' }}>ListNode*</Text> prev = nullptr;</Text>
              <Text style={styles.codeLine}><Text style={{ color: '#F59E0B' }}>while</Text> (curr) &#123;</Text>
              <Text style={styles.codeLine}>  ListNode* next = curr-&gt;next;</Text>
              <Text style={styles.codeLine}>  curr-&gt;next = prev;</Text>
              <Text style={styles.codeLine}>  prev = curr; curr = next;</Text>
              <Text style={styles.codeLine}>&#125;</Text>
            </View>
          </Animated.View>

        </Animated.View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// SCREEN 4: ASK GPT IN ONE TAP (redirect pre-crafted prompt)
// -------------------------------------------------------------
function SlideAskGPT() {
  const [typedText, setTypedText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  const fullPrompt = "Explain this code snippet like I'm 5...";

  useEffect(() => {
    let charIndex = 0;
    let isTyping = true;
    let timer: NodeJS.Timeout;

    const runTypewriter = () => {
      if (isTyping) {
        if (charIndex <= fullPrompt.length) {
          setTypedText(fullPrompt.slice(0, charIndex));
          charIndex++;
          timer = setTimeout(runTypewriter, 75);
        } else {
          isTyping = false;
          timer = setTimeout(runTypewriter, 2200);
        }
      } else {
        if (charIndex > 0) {
          charIndex--;
          setTypedText(fullPrompt.slice(0, charIndex));
          timer = setTimeout(runTypewriter, 35);
        } else {
          isTyping = true;
          timer = setTimeout(runTypewriter, 1000);
        }
      }
    };

    runTypewriter();

    const cursorInterval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);

    return () => {
      clearTimeout(timer);
      clearInterval(cursorInterval);
    };
  }, []);

  return (
    <View style={styles.slideInner}>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { marginBottom: 4 }]}>Stuck on a question?</Text>
        <Text style={[styles.title, { marginBottom: 16 }]}>Ask GPT in one tap.</Text>
        <Text style={styles.desc}>The context is already prepared - so you can focus on understanding, not typing.</Text>
        
        <View style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={styles.desc}>
            No more Copy-Paste-Search
          </Text>
          <Text style={[styles.desc, { marginTop: 4 }]}>
            2 clicks and you have your explanation
          </Text>
        </View>
      </View>

      <View style={styles.visualContainer}>
        <View style={styles.mockSearchBar}>
          <View style={styles.plusCircle}>
            <Plus color="#94A3B8" size={14} strokeWidth={3} />
          </View>
          <Text style={styles.mockSearchText} numberOfLines={1}>
            {typedText}
            <Text style={{ color: '#8B5CF6', fontWeight: 'bold', opacity: cursorVisible ? 1 : 0 }}>|</Text>
          </Text>
          <ArrowUp color="#000000" size={20} strokeWidth={2.5} style={{ marginLeft: 8 }} />
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// SCREEN 5: SCHEDULE REVISION & GET NOTIFIED
// -------------------------------------------------------------
function SlideScheduleRevision() {
  const bellScale = useSharedValue(1);

  useEffect(() => {
    bellScale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 600 }),
        withTiming(1.0, { duration: 600 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(bellScale);
  }, []);

  const animatedBell = useAnimatedStyle(() => ({
    transform: [{ scale: bellScale.value }],
  }));

  return (
    <View style={styles.slideInner}>
      <View style={styles.appleTextBlock}>
        <View style={styles.welcomeTitleRow}>
          <Text style={styles.appleTitle}>Schedule your revision</Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#8B5CF6', marginTop: -4 }}>And get notified</Text>
        <Text style={styles.appleBody}>
          Set custom daily reminders that match your study schedule, and receive timely notifications to keep your recall sharp.
        </Text>
        <Text style={styles.appleHashtags}>
          #StudyReminders #ConsistentRevision #DailyHabits
        </Text>
      </View>

      <View style={styles.welcomeVisualContainer}>
        {/* Mock Push Notification Card */}
        <View style={{
          width: '90%',
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
          marginTop: 15,
        }}>
          <Animated.View style={[{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: '#EEF2F6',
            alignItems: 'center',
            justifyContent: 'center',
          }, animatedBell]}>
            <Bell color="#8B5CF6" size={18} strokeWidth={2.5} />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '800', color: '#0F172A', fontSize: 13 }}>ReeWise Reminder</Text>
              <Text style={{ color: '#64748B', fontSize: 10 }}>Just now</Text>
            </View>
            <Text style={{ color: '#475569', fontSize: 12, marginTop: 2, fontWeight: '500' }}>
              Time to revise Graphs! Spend 3 mins on 'Course Schedule II' 🧠
            </Text>
          </View>
        </View>

        {/* Mock Schedule Toggles */}
        <View style={{ width: '90%', gap: 10, marginTop: 20 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
            borderRadius: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: '#E2E8F0',
          }}>
            <Text style={{ fontWeight: 'bold', color: '#0F172A', fontSize: 13 }}>Morning Review (8:30 AM)</Text>
            <View style={{ width: 34, height: 20, borderRadius: 10, backgroundColor: '#8B5CF6', padding: 2, justifyContent: 'center', alignItems: 'flex-end' }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' }} />
            </View>
          </View>

          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
            borderRadius: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: '#E2E8F0',
          }}>
            <Text style={{ fontWeight: 'bold', color: '#0F172A', fontSize: 13 }}>Evening Recall (7:00 PM)</Text>
            <View style={{ width: 34, height: 20, borderRadius: 10, backgroundColor: '#8B5CF6', padding: 2, justifyContent: 'center', alignItems: 'flex-end' }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' }} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// SCREEN 6: STUNNING THEMES (Zen, Sunset, Midnight)
// -------------------------------------------------------------
function SlideThemeAccents() {
  const themeIndex = useSharedValue(0);
  const [currentThemeLabel, setCurrentThemeLabel] = useState("Zen Garden");

  useEffect(() => {
    const labels = ["Zen Garden", "Crimson Sunset", "Midnight Focus"];
    const interval = setInterval(() => {
      themeIndex.value = (themeIndex.value + 1) % 3;
      setTimeout(() => {
        setCurrentThemeLabel(labels[Math.round(themeIndex.value)]);
      }, 150);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const animatedCardTheme = useAnimatedStyle(() => {
    const activeIdx = themeIndex.value;
    
    const backgroundColor = withTiming(
      activeIdx < 0.5 
        ? '#FAF6F0' 
        : activeIdx < 1.5 
          ? '#FFF3EE' 
          : '#030509', 
      { duration: 400 }
    );

    const borderColor = withTiming(
      activeIdx < 0.5 
        ? '#EADEC9' 
        : activeIdx < 1.5 
          ? '#F6E1D7' 
          : '#263352',
      { duration: 400 }
    );

    return {
      backgroundColor,
      borderColor,
    };
  });

  const animatedTextTheme = useAnimatedStyle(() => {
    const activeIdx = themeIndex.value;
    const color = withTiming(
      activeIdx > 1.5 
        ? '#F8FAFC' 
        : '#0F172A',
      { duration: 400 }
    );
    return { color };
  });

  const animatedDescTheme = useAnimatedStyle(() => {
    const activeIdx = themeIndex.value;
    const color = withTiming(
      activeIdx > 1.5 
        ? '#94A3B8' 
        : '#64748B',
      { duration: 400 }
    );
    return { color };
  });

  const getThemeBubbleStyle = (idx: number) => {
    return useAnimatedStyle(() => {
      const activeIdx = themeIndex.value;
      const isHighlighted = Math.round(activeIdx) === idx;
      return {
        transform: [
          { scale: withSpring(isHighlighted ? 1.15 : 1.0, { damping: 10 }) }
        ],
        borderWidth: isHighlighted ? 2 : 0,
        borderColor: idx === 0 ? '#8C6A5C' : idx === 1 ? '#E05A47' : '#818CF8',
      };
    });
  };

  return (
    <View style={styles.slideInner}>
      <View style={styles.appleTextBlock}>
        <View style={styles.welcomeTitleRow}>
          <Text style={styles.appleTitle}>Gorgeous Themes</Text>
        </View>
        <Text style={styles.appleBody}>
          Revision should look beautiful. Find the aesthetic that helps you focus.
        </Text>
        <Text style={styles.appleHashtags}>
          #JapaneseZen #CrimsonSunset #MidnightFocus
        </Text>
      </View>

      <View style={styles.welcomeVisualContainer}>
        
        <Animated.View style={[{
          width: '80%',
          padding: 16,
          borderRadius: 20,
          borderWidth: 1,
          alignSelf: 'center',
          marginTop: 15,
          height: 110,
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
        }, animatedCardTheme]}>
          
          <Text style={{ 
            fontSize: 10, 
            fontWeight: 'bold', 
            color: '#8B5CF6', 
            letterSpacing: 1,
            marginBottom: 4 
          }}>
            ACTIVE THEME
          </Text>
          <Animated.Text style={[{ 
            fontSize: 18, 
            fontWeight: 'bold', 
            opacity: 0.9,
          }, animatedTextTheme]}>
            {currentThemeLabel}
          </Animated.Text>
          <Animated.Text style={[{ 
            fontSize: 12, 
            marginTop: 4 
          }, animatedDescTheme]}>
            Theme shifts colors across the entire app interface.
          </Animated.Text>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: 20, alignSelf: 'center', marginTop: 25 }}>
          <Animated.View style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FAF6F0', alignItems: 'center', justifyContent: 'center' }, getThemeBubbleStyle(0)]}>
            <Text style={{ fontSize: 14 }}>🎋</Text>
          </Animated.View>
          <Animated.View style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF3EE', alignItems: 'center', justifyContent: 'center' }, getThemeBubbleStyle(1)]}>
            <Text style={{ fontSize: 14 }}>🍁</Text>
          </Animated.View>
          <Animated.View style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#0F1524', alignItems: 'center', justifyContent: 'center' }, getThemeBubbleStyle(2)]}>
            <Text style={{ fontSize: 14 }}>🌙</Text>
          </Animated.View>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F7',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
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
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    marginLeft: 6,
  },
  stepDotActive: {
    width: 16,
    backgroundColor: '#8B5CF6',
  },
  stepDotPassed: {
    backgroundColor: 'rgba(139, 92, 246, 0.5)',
  },
  contentPortal: {
    flex: 1,
    justifyContent: 'center',
  },
  slide: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  slideCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  title: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 32,
  },
  desc: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  hashtag: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: 'bold',
    fontStyle: 'italic', // Gives a lightweight handwritten vibe
    marginTop: 10,
    letterSpacing: 0.5,
  },
  visualContainer: {
    height: 250,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // Slide 1 Welcome Refined Visual
  // Notebook paper background styles
  notebookPaper: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    height: 120,
    justifyContent: 'center',
    gap: 22,
    zIndex: 0,
  },
  notebookPaperLine: {
    height: 1,
    backgroundColor: 'rgba(203, 213, 225, 0.4)',
  },
  
  // Welcome page text block
  welcomeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  appleSprout: {
    fontSize: 26,
  },
  appleTextBlock: {
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 8,
    position: 'relative',
    zIndex: 5,
  },
  appleTitle: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: -0.6,
  },
  appleBody: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
  },
  appleHashtags: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: 'bold',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },

  // Abstract Sleepy Student Vector Illustration
  sleepyStudentContainer: {
    position: 'absolute',
    bottom: 10,
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  characterGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(253, 230, 138, 0.22)', // warm amber soft glow
    shadowColor: '#F59E0B',
    shadowRadius: 20,
    shadowOpacity: 0.15,
  },
  studentBody: {
    width: 38, // Slimmer body width (from 54 to 38)
    height: 48, // Taller body height for a slim, attractive look
    borderRadius: 19,
    backgroundColor: '#6366F1', // Indigo sleek premium hoodie
    borderWidth: 1,
    borderColor: '#818CF8',
    alignItems: 'center',
    position: 'absolute',
    bottom: 20,
  },
  studentHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFE4E6', // Warm skin pastel tone
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: -26,
    // Removed overflow: 'hidden' to let messy hair strands poke out of head shape
  },
  sleepyEyes: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: 2,
    zIndex: 10,
  },
  hoodieDrawstringLeft: {
    position: 'absolute',
    top: 4,
    left: 13,
    width: 1.5,
    height: 12,
    backgroundColor: '#FFFFFF',
    opacity: 0.8,
  },
  hoodieDrawstringRight: {
    position: 'absolute',
    top: 4,
    right: 13,
    width: 1.5,
    height: 12,
    backgroundColor: '#FFFFFF',
    opacity: 0.8,
  },
  hairBase: {
    position: 'absolute',
    top: -2,
    left: 0,
    right: 0,
    height: 13,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#1E293B', // Sleek dark slate hair
    zIndex: 5,
  },
  hairStrand: {
    position: 'absolute',
    backgroundColor: '#1E293B',
    borderRadius: 2,
    zIndex: 6,
  },
  hairStrand1: { // Sticks out top-left
    top: -6,
    left: 4,
    width: 7,
    height: 9,
    transform: [{ rotate: '-35deg' }],
  },
  hairStrand2: { // Sticks out top-middle-left
    top: -7,
    left: 11,
    width: 8,
    height: 8,
    transform: [{ rotate: '-10deg' }],
  },
  hairStrand3: { // Sticks out top-middle-right
    top: -6,
    right: 8,
    width: 7,
    height: 9,
    transform: [{ rotate: '20deg' }],
  },
  hairStrand4: { // Sticks out top-right
    top: -4,
    right: 2,
    width: 6,
    height: 8,
    transform: [{ rotate: '45deg' }],
  },
  hairStrand5: { // Fringe falling slightly in the middle over face (aesthetic!)
    top: 5,
    left: 12,
    width: 6,
    height: 8,
    borderBottomRightRadius: 4,
    transform: [{ rotate: '15deg' }],
  },
  hairStrand6: { // Fringe falling slightly on the left
    top: 5,
    left: 6,
    width: 5,
    height: 7,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '-15deg' }],
  },
  hairStrand7: { // Spiky hair strand sticking out far left side
    top: 4,
    left: -4,
    width: 8,
    height: 6,
    transform: [{ rotate: '-55deg' }],
  },
  hairStrand8: { // Spiky hair strand sticking out far right side
    top: 5,
    right: -4,
    width: 8,
    height: 6,
    transform: [{ rotate: '55deg' }],
  },
  headphoneBand: {
    position: 'absolute',
    top: -4,
    width: 36,
    height: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 2.5,
    borderColor: '#334155', // Sleek matte charcoal band
    borderBottomWidth: 0,
    zIndex: 20, // Over messy hair
  },
  headphoneCupLeft: {
    position: 'absolute',
    left: -5,
    top: 8,
    width: 7,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#334155', // Sleek matte charcoal cups
    borderWidth: 1,
    borderColor: '#475569',
    zIndex: 20,
  },
  headphoneCupRight: {
    position: 'absolute',
    right: -5,
    top: 8,
    width: 7,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
    zIndex: 20,
  },
  characterLaptop: {
    position: 'absolute',
    bottom: 22,
    right: 25,
    width: 36,
    height: 18,
    zIndex: 10,
  },
  laptopKeyboard: {
    position: 'absolute',
    bottom: 0,
    width: 30,
    height: 3,
    borderRadius: 1,
    backgroundColor: '#94A3B8',
  },
  laptopScreen: {
    position: 'absolute',
    bottom: 2,
    left: 4,
    width: 24,
    height: 16,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#64748B',
    transform: [{ skewX: '-10deg' }],
  },
  characterMug: {
    position: 'absolute',
    bottom: 22,
    left: 28,
    width: 12,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#14B8A6', // Cute teal coffee mug
    zIndex: 9,
  },
  mugHandle: {
    position: 'absolute',
    right: -4,
    top: 3,
    width: 5,
    height: 7,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: '#14B8A6',
    borderLeftWidth: 0,
  },
  characterSteam: {
    position: 'absolute',
    top: -8,
    left: 4,
    width: 2,
    height: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(20, 184, 166, 0.4)',
  },
  
  floatingBgItem: {
    position: 'absolute',
    zIndex: 0,
  },
  breathingBlobBg: {
    position: 'absolute',
    alignSelf: 'center',
    top: '20%',
    width: width * 0.75,
    height: width * 0.75,
    borderRadius: (width * 0.75) / 2,
    backgroundColor: 'rgba(139, 92, 246, 0.02)',
  },
  welcomeVisualContainer: {
    height: 350,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 10,
  },
  welcomeFloatingCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 2,
    overflow: 'hidden',
  },
  cardPressableContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
  },
  welcomeCardLeft: {
    top: 10,
    left: 20,
    zIndex: 10,
  },
  welcomeCardRight: {
    top: 70,
    right: 20,
    zIndex: 9,
  },
  welcomeCardCenter: {
    top: 130,
    left: 36,
    zIndex: 8,
  },
  welcomeIconPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeCardText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Slide 2 Visual (Playlist box reordering simulation)
  playlistBox: {
    width: '95%',
    backgroundColor: 'transparent',
    gap: 12,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  activeItem: {
    zIndex: 10,
  },
  playlistItemLeft: {
    flex: 1,
    marginRight: 12,
    alignItems: 'flex-start',
  },
  playlistTopic: {
    color: '#7C3AED',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  playlistItemText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  playlistMetaRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  playlistDifficulty: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Slide 3 Visual (Modes toggle)
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    alignSelf: 'center',
    gap: 4,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
    backgroundColor: 'transparent',
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
  },
  modeTabText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modeTabTextActive: {
    color: '#0F172A',
  },
  floatingCardBase: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  modeReelCard: {
    width: '85%',
    height: 150,
    position: 'relative',
    overflow: 'hidden',
  },
  cardModeContent: {
    padding: 20,
    height: '100%',
    width: '100%',
    justifyContent: 'center',
  },
  codeModeAbs: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  complexitySmall: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: 'bold',
  },
  reelCardTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 6,
  },
  reelCardDesc: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },
  codeSnippetBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  codeLine: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 9,
    color: '#E2E8F0',
    lineHeight: 13,
  },

  // Slide 4 Visual (Ghost Typewriter & GPT input bar)
  mockSearchBar: {
    position: 'absolute',
    bottom: 24,
    width: '95%',
    height: 52,
    backgroundColor: '#F8FAFC',
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  mockSearchText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  plusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  // Slide 5 Visual & Auth
  beginLogoRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beginLogoInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authBlock: {
    width: '100%',
    marginTop: 40,
    paddingHorizontal: 8,
  },
  googleBtn: {
    backgroundColor: '#8B5CF6',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  googleBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  guestBtn: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 1)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    width: '100%',
  },
  guestBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },

  // Footer Navigation
  footer: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skipBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  onboardingCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    padding: 24,
    marginVertical: 12,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  nextCardAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  cardStackContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  repetitionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  playlistCardVisual: {
    position: 'absolute',
    top: 10,
    width: '75%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 5,
  },
});
