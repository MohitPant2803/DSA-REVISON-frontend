import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Pressable, Platform, Vibration } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
import { useAuthStore } from '@/store/useAuthStore';
import { GlassPanel } from '../motion/GlassPanel';
import { hapticFeedback } from '@/utils/haptics';
import { ReeWCharacter } from '@/components/ReeWCharacter';
import { ArrowLeftRight, ArrowUp, Sparkles, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

interface FirstFeedTutorialProps {
  onDismiss: () => void;
  isSettingsOpen?: boolean;
  toggleSettings?: () => void;
}

export function FirstFeedTutorial({ onDismiss, isSettingsOpen = false, toggleSettings }: FirstFeedTutorialProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  
  const { setReelsTutorialStep, step: walkthroughStep, setStep: setWalkthroughStep } = useWalkthroughStore();
  const [step, setStep] = useState(0); // 0: Swipe Slides, 1: Swipe Up, 2: Settings Cog, 3: GPT, 4: Reminders/Playlists
  const [localStep, setLocalStep] = useState(0);
  const [gptShot, setGptShot] = useState<1 | 2 | 3>(1);
  const [localGptShot, setLocalGptShot] = useState<1 | 2 | 3>(1);

  // Reanimated shared values for overlays and mascot
  const overlayOpacity = useSharedValue(1);
  const reewSwipeX = useSharedValue(200);
  const reewFlyY = useSharedValue(180);
  const [reewState, setReewState] = useState<
    'idle' | 'tutorial_walk' | 'tutorial_tired' | 'superman_fly' | 'superman_stand' | 'engineer_reew' | 'grad_reew' | 'grad_sweat' | 'dj_reew'
  >('tutorial_walk');

  const [runAnimationFinished, setRunAnimationFinished] = useState(false);

  // Typewriter states
  const [typedText, setTypedText] = useState('');
  const [typingDone, setTypingDone] = useState(false);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetTextRef = useRef('');

  // Sync sub-step state to walkthrough store
  useEffect(() => {
    setLocalStep(step);
    setReelsTutorialStep(step);
  }, [step]);

  useEffect(() => {
    setLocalGptShot(gptShot);
  }, [gptShot]);

  // Mascot entrance control for Step 0 and 1
  useEffect(() => {
    if (localStep === 0) {
      setRunAnimationFinished(false);
      setReewState('tutorial_walk');
      reewSwipeX.value = 180; // Start on the right side of the card

      // Start timing translation after a short delay (300ms) to ensure tutorial_walk renders
      const timer = setTimeout(() => {
        reewSwipeX.value = withTiming(0, {
          duration: 1500,
          easing: Easing.bezier(0.25, 1, 0.5, 1),
        }, (finished) => {
          if (finished) {
            runOnJS(setReewState)('tutorial_tired');
            runOnJS(setRunAnimationFinished)(true);
          }
        });
      }, 300);

      return () => clearTimeout(timer);
    } else if (localStep === 1) {
      setRunAnimationFinished(false);
      setReewState('superman_fly');
      reewFlyY.value = 180; // Start at the bottom

      // Start flying up after 300ms delay
      const timer = setTimeout(() => {
        reewFlyY.value = withTiming(-30, {
          duration: 1000,
          easing: Easing.bezier(0.25, 1, 0.5, 1),
        }, (finished) => {
          if (finished) {
            runOnJS(setReewState)('superman_stand'); // Land at the top of the box
            runOnJS(setRunAnimationFinished)(true);
          }
        });
      }, 300);

      return () => clearTimeout(timer);
    } else if (localStep === 2) {
      setReewState('engineer_reew');
      setRunAnimationFinished(true);
    } else if (localStep === 3) {
      setReewState(localGptShot === 1 ? 'grad_reew' : (localGptShot === 2 ? 'grad_sweat' : 'grad_reew'));
      setRunAnimationFinished(true);
    } else if (localStep === 4) {
      setReewState('dj_reew');
      setRunAnimationFinished(true);
    } else {
      cancelAnimation(reewSwipeX);
      cancelAnimation(reewFlyY);
      setRunAnimationFinished(true);
    }
  }, [localStep, localGptShot]);

  // Typewriter effect trigger
  useEffect(() => {
    let targetText = '';
    if (localStep === 0) {
      if (!runAnimationFinished) {
        setTypedText('');
        setTypingDone(false);
        return;
      }
      targetText = "Swipe left or right on a revision card to open code walkthroughs, trace dry runs, and active recall summaries.";
    } else if (localStep === 1) {
      if (!runAnimationFinished) {
        setTypedText('');
        setTypingDone(false);
        return;
      }
      targetText = "you can scroll too";
    } else if (localStep === 2) {
      targetText = "I customize what I ReeWise and how I ReeWise";
    } else if (localStep === 3) {
      if (localGptShot === 1) {
        targetText = "I am smart because I eat 2 almonds every day.";
      } else if (localGptShot === 2) {
        targetText = "But also because I click GPT whenever I'm stuck on a reel concept.";
      } else {
        targetText = "The question is already there... I just hit send.";
      }
    } else if (localStep === 4) {
      targetText = "I create custom learning playlists so I can tune in and study my selected topics anytime!";
    }
    targetTextRef.current = targetText;

    if (!targetText) {
      setTypedText('');
      setTypingDone(true);
      return;
    }

    let index = 0;
    setTypedText('');
    setTypingDone(false);

    const interval = setInterval(() => {
      setTypedText((prev) => {
        const next = targetText.slice(0, index + 1);
        index++;
        if (index >= targetText.length) {
          clearInterval(interval);
          setTypingDone(true);
        }
        return next;
      });
    }, 25);
    typingIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
      typingIntervalRef.current = null;
    };
  }, [localStep, localGptShot, runAnimationFinished]);

  // Settings Cog observer to advance Step 2
  useEffect(() => {
    if (localStep === 2 && isSettingsOpen) {
      setStep(3);
    }
  }, [isSettingsOpen, localStep]);



  const completeTyping = () => {
    if (!typingDone) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      setTypedText(targetTextRef.current);
      setTypingDone(true);
      return true;
    }
    return false;
  };

  const handleNextStep = async () => {
    hapticFeedback.selection();
    if (step < 4) {
      setStep(step + 1);
    } else {
      // Save tutorial complete state locally
      try {
        const key = isGuest ? 'guest-dsa-reels-tutorial-complete' : 'dsa-reels-tutorial-complete';
        await AsyncStorage.setItem(key, 'true');
      } catch (e) {}

      // Fade out overlay
      overlayOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(onDismiss)();
        }
      });
      hapticFeedback.success();
    }
  };

  const handleBackdropPress = () => {
    if (localStep === 0 || localStep === 1) {
      if (!runAnimationFinished) return;
      if (completeTyping()) return;
      handleNextStep();
    } else if (localStep === 2) {
      // Step 2 backdrop press does nothing (only Settings cog is active)
    } else if (localStep === 3) {
      if (completeTyping()) return;
      hapticFeedback.selection();
      if (gptShot === 1) {
        setGptShot(2);
      } else if (gptShot === 2) {
        setGptShot(3);
      } else {
        handleNextStep();
      }
    } else if (localStep === 4) {
      handleNextStep();
    }
  };

  const handleSkipTutorial = async () => {
    hapticFeedback.selection();
    try {
      const key = isGuest ? 'guest-dsa-reels-tutorial-complete' : 'dsa-reels-tutorial-complete';
      await AsyncStorage.setItem(key, 'true');
      const walkthroughKey = isGuest ? 'guest-dsa-reels-walkthrough-complete' : 'dsa-reels-walkthrough-complete';
      await AsyncStorage.setItem(walkthroughKey, 'true');
      
      const { useWalkthroughStore } = require('@/store/useWalkthroughStore');
      await useWalkthroughStore.getState().completeWalkthrough();
    } catch (e) {}

    overlayOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
      if (finished) {
        runOnJS(onDismiss)();
      }
    });
  };

  const handleSignInPress = async () => {
    hapticFeedback.selection();
    const { useAuthStore } = require('@/store/useAuthStore');
    await useAuthStore.getState().logout();
    router.replace('/(auth)/login');
  };

  const reewSwipeStyle = useAnimatedStyle(() => {
    if (localStep === 0) {
      return {
        transform: [{ translateX: reewSwipeX.value }],
        opacity: 1,
      };
    }
    return {
      transform: [{ translateX: reewSwipeX.value }],
      opacity: withTiming(typingDone ? 1 : 0, { duration: 250 }),
    };
  });

  const reewFlyStyle = useAnimatedStyle(() => {
    if (localStep === 1) {
      return {
        transform: [{ translateY: reewFlyY.value }],
        opacity: 1,
      };
    }
    return {
      transform: [{ translateY: reewFlyY.value }],
      opacity: 0,
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const renderStepContent = () => {
    switch (localStep) {
      case 0:
        return (
          <View style={styles.contentWrapper}>
            <Text style={styles.desc}>{typedText}</Text>
            
            {runAnimationFinished && typingDone && (
              <TouchableOpacity onPress={handleNextStep} style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>Understand Gesture</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      case 1:
        return (
          <View style={styles.contentWrapper}>
            <View style={styles.header}>
              <ArrowUp color="#8B5CF6" size={20} />
              <Text style={styles.title}>SWIPE NEXT ALGORITHM</Text>
            </View>
            <Text style={styles.desc}>{typedText}</Text>

            {runAnimationFinished && typingDone && (
              <TouchableOpacity onPress={handleNextStep} style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>Begin active recall</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      case 2:
        return (
          <View style={styles.contentWrapper}>
            <View style={styles.header}>
              <Sparkles color="#8B5CF6" size={20} />
              <Text style={styles.title}>CUSTOMIZE THEMES</Text>
            </View>
            <Text style={styles.desc}>{typedText}</Text>
            
            <View style={styles.pointerBadge}>
              <Text style={styles.pointerText}>Tap settings cog at the top right</Text>
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.contentWrapper}>
            <View style={styles.header}>
              <Sparkles color="#8B5CF6" size={20} />
              <Text style={styles.title}>ASK GPT</Text>
            </View>
            <Text style={styles.desc}>{typedText}</Text>
            {typingDone && (
              <Text style={styles.tapHelperText}>
                {localGptShot < 3 ? "Tap card to continue" : "Tap card to proceed"}
              </Text>
            )}
          </View>
        );
      case 4:
        return (
          <View style={styles.contentWrapper}>
            <View style={styles.header}>
              <CheckCircle2 color="#8B5CF6" size={20} />
              <Text style={styles.title}>REVISION PLAYLISTS</Text>
            </View>
            <Text style={styles.desc}>{typedText}</Text>
            {typingDone && (
              <Text style={styles.tapHelperText}>Tap anywhere to finish</Text>
            )}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Animated.View style={[styles.container, overlayAnimatedStyle]} pointerEvents="box-none">
      
      {/* 1. Full screen light backdrop wash (95% visible) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.lightBackdrop} />
      </View>

      {/* 2. Transparent Touch-blocking overlay over the entire screen */}
      {localStep !== 2 && (
        <Pressable 
          onPress={handleBackdropPress}
          style={styles.touchBlockingOverlay} 
        />
      )}

      {/* 3. Custom touch block panels for Step 2 Settings Cog to isolate the settings icon touch */}
      {localStep === 2 && (
        <>
          {/* Top Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + 8,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
          {/* Bottom Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: insets.top + 56,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
          {/* Left Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              height: 48,
              left: 0,
              right: 56,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
          {/* Right Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              height: 48,
              right: 0,
              width: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
        </>
      )}

      {/* 4. Settings Cog pressable overlay target for Step 2 */}
      {localStep === 2 && (
        <Pressable
          onPress={() => {
            lightHaptic();
            if (toggleSettings) {
              toggleSettings();
            }
          }}
          style={{
            position: 'absolute',
            right: 16,
            top: insets.top + 12,
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: 'rgba(0, 0, 0, 0.01)',
            zIndex: 10005,
          }}
        />
      )}

      {/* 5. Main Dialogue Card Container */}
      <Pressable 
        onPress={handleBackdropPress}
        style={[
          styles.cardPortal,
          localStep === 2
            ? { top: insets.top + 116, position: 'absolute' } 
            : localStep === 4 
              ? { bottom: insets.bottom + 145, left: 16, position: 'absolute', width: width - 105 } 
              : {}
        ]}
      >
        <GlassPanel style={styles.glassCard} intensity={30} tint="light" borderColor="#EADEC9" borderRadius={32}>
          <View style={styles.cardContentRow}>
            {/* Left Column: Mascot Container */}
            <View style={styles.mascotContainer}>
              {localStep === 0 && (
                <Animated.View style={reewSwipeStyle}>
                  <ReeWCharacter state={reewState} size={72} disableIdleCycle={true} />
                </Animated.View>
              )}
              {localStep === 1 && (
                <Animated.View style={[reewFlyStyle, { position: 'absolute', bottom: 0 }]}>
                  <ReeWCharacter state={reewState} size={72} disableIdleCycle={true} />
                </Animated.View>
              )}
              {localStep >= 2 && (
                <ReeWCharacter state={reewState} size={72} disableIdleCycle={true} />
              )}
            </View>

            {/* Right Column: Dialogue and Instructions */}
            <View style={{ flex: 1 }}>
              {renderStepContent()}
            </View>
          </View>
        </GlassPanel>
      </Pressable>

      {/* 6. Dynamic Skip Tutorial / Sign In Button for Feed Overlay */}
      {isAuthenticated && (
        <TouchableOpacity
          onPress={handleSkipTutorial}
          activeOpacity={0.8}
          style={[
            styles.skipButtonContainer,
            { bottom: insets.bottom + 85 }
          ]}
        >
          <Text style={styles.skipButtonText}>Skip Tutorial</Text>
        </TouchableOpacity>
      )}
      {isGuest && (
        <TouchableOpacity
          onPress={handleSignInPress}
          activeOpacity={0.8}
          style={[
            styles.skipButtonContainer,
            { bottom: insets.bottom + 85 }
          ]}
        >
          <Text style={styles.skipButtonText}>Sign In</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 246, 240, 0.05)', // Zen sand cream backdrop (95% visible)
  },
  touchBlockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.01)',
    zIndex: 9990,
  },
  cardPortal: {
    width: width - 40,
    zIndex: 10001,
    alignItems: 'center',
  },
  glassCard: {
    width: '100%',
    padding: 20,
    backgroundColor: 'rgba(250, 246, 240, 0.95)', // Zen surface (off-white)
    borderColor: '#EADEC9',
    borderWidth: 1.5,
    shadowColor: '#8C6A5C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 120,
  },
  mascotContainer: {
    width: 80,
    height: 80,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#8C6A5C', // Zen accent
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginLeft: 8,
  },
  desc: {
    color: '#3E3431', // Zen textPrimary
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 10,
  },
  gestureBox: {
    height: 60,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 6,
  },
  fingerIcon: {
    position: 'absolute',
    zIndex: 5,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fingerEmoji: {
    fontSize: 28,
  },
  dragTrackHorizontal: {
    width: 140,
    height: 2,
    backgroundColor: 'rgba(140, 106, 92, 0.25)',
    borderRadius: 1,
  },
  actionBtn: {
    backgroundColor: '#8C6A5C', // Zen accent
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
    shadowColor: '#8C6A5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  pointerBadge: {
    backgroundColor: '#F1ECE6',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#EADEC9',
    marginTop: 4,
  },
  pointerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C6A5C',
  },
  tapHelperText: {
    fontSize: 10,
    color: '#8C6A5C',
    fontWeight: '700',
    opacity: 0.6,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  skipButtonContainer: {
    position: 'absolute',
    left: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1.2,
    borderColor: '#EADEC9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#8C6A5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10010,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8C6A5C',
  },
});
