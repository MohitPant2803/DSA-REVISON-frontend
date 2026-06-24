import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Platform, Vibration } from 'react-native';
import Svg, { Circle, Path, Ellipse, Defs, LinearGradient, Stop, G, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';

// Custom Animated SVG Components for hardware-accelerated transitions
const AnimatedPath = Animated.createAnimatedComponent(Path) as any;
const AnimatedCircle = Animated.createAnimatedComponent(Circle) as any;
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse) as any;
const AnimatedRect = Animated.createAnimatedComponent(Rect) as any;
const AnimatedG = Animated.createAnimatedComponent(G) as any;

const ALL_STATES = [
  'idle',
  'blep',
  'skipping',
  'focused',
  'sleeping',
  'happy',
  'celebrating',
  'thinking',
  'loading',
  'onboarding',
  'completion',
  'coffee_coding',
  'angry_coding',
  'cocoon',
  'pillow_scroll',
  'knocked_out',
  'searching',
  'note_stack',
  'flashcards',
  'quiz_time',
  'coffee_break',
  'v_fingers',
  'tutorial_walk',
  'tutorial_tired',
  'superman_stand',
  'superman_fly',
  'engineer_reew',
  'grad_reew',
  'grad_sweat',
  'dj_reew',
  'cute_sad',
  'sort_reew',
  'smirk',
] as const;

type ReeWState = typeof ALL_STATES[number];

const resolveState = (incomingState?: string): ReeWState => {
  if (!incomingState) return 'idle';
  if (incomingState === 'zen') return 'idle';
  if (incomingState === 'streak') return 'skipping';
  if (ALL_STATES.includes(incomingState as any)) {
    return incomingState as ReeWState;
  }
  return 'idle';
};

const CYCLE_STATES = [
  'idle',
  'blep',
  'skipping',
  'focused',
  'sleeping',
] as const;

interface ReeWCharacterProps {
  state?: 'idle' | 'blep' | 'skipping' | 'focused' | 'sleeping' | 'happy' | 'celebrating' | 'thinking' | 'loading' | 'onboarding' | 'completion' | 'zen' | 'streak' | 'coffee_coding' | 'angry_coding' | 'cocoon' | 'pillow_scroll' | 'knocked_out' | 'searching' | 'note_stack' | 'flashcards' | 'quiz_time' | 'coffee_break' | 'v_fingers' | 'tutorial_walk' | 'tutorial_tired' | 'superman_stand' | 'superman_fly' | 'engineer_reew' | 'grad_reew' | 'grad_sweat' | 'dj_reew' | 'cute_sad' | 'sort_reew' | 'smirk';
  size?: number;
  disableIdleCycle?: boolean;
}

export const ReeWCharacter = React.memo(({ state = 'idle', size = 80, disableIdleCycle = false }: ReeWCharacterProps) => {
  const isComplete = useWalkthroughStore((s) => s.isComplete);

  // --- STATE ALIGNMENT & CYCLING ---
  const initialResolvedState = resolveState(state);
  const [currentState, setCurrentState] = useState<ReeWState>(() => initialResolvedState);

  // --- REANIMATED VALUES FOR ULTRA-SMOOTH, RESTRAINED MOTION ---
  const bobbing = useSharedValue(0);
  const breathing = useSharedValue(1);
  const eyeBlink = useSharedValue(1);
  const squashStretchX = useSharedValue(1);
  const squashStretchY = useSharedValue(1);
  const earTwitch = useSharedValue(0);
  const walkLegY = useSharedValue(0);
  const sweatDropY = useSharedValue(0);
  const sweatOpacity = useSharedValue(0);
  const engineerLeftArmY = useSharedValue(0);
  const engineerRightArmY = useSharedValue(0);
  
  // Continuous slow, extremely cute side-to-side rocking dance (very small steps)
  const danceSway = useSharedValue(0);
  const danceBobY = useSharedValue(0);
  
  // State-specific subtle translations
  const raisedArms = useSharedValue(0);
  const thinkingArm = useSharedValue(0);
  const sparkleRotation = useSharedValue(0);
  const floatZzz = useSharedValue(0);
  const thinkingBulb = useSharedValue(0);
  
  // 3 new states animations
  const card1Y = useSharedValue(0); // Y translation for loading card 1
  const card2Y = useSharedValue(0); // Y translation for loading card 2
  const swipeArrow = useSharedValue(24); // Stroke dash offset for onboarding arrow
  const checkmarkScale = useSharedValue(0.85); // Scale for completion checkmark
  const loadingScale = useSharedValue(1);
  const sortAnim = useSharedValue(0);

  // Interactive Touch Squash shared values
  const touchSquashX = useSharedValue(1);
  const touchSquashY = useSharedValue(1);

  // Overlay state visibility progress shared values (0 = hidden, 1 = fully visible)
  const sleepingProgress = useSharedValue(initialResolvedState === 'sleeping' ? 1 : 0);
  const celebratingProgress = useSharedValue(initialResolvedState === 'celebrating' ? 1 : 0);
  const thinkingProgress = useSharedValue(initialResolvedState === 'thinking' ? 1 : 0);
  const loadingProgress = useSharedValue(initialResolvedState === 'loading' ? 1 : 0);
  const onboardingProgress = useSharedValue(initialResolvedState === 'onboarding' ? 1 : 0);
  const completionProgress = useSharedValue(initialResolvedState === 'completion' ? 1 : 0);
  const focusedProgress = useSharedValue(initialResolvedState === 'focused' ? 1 : 0);
  const coffeeCodingProgress = useSharedValue(initialResolvedState === 'coffee_coding' ? 1 : 0);
  const angryCodingProgress = useSharedValue(initialResolvedState === 'angry_coding' ? 1 : 0);
  const cocoonProgress = useSharedValue(initialResolvedState === 'cocoon' ? 1 : 0);
  const pillowScrollProgress = useSharedValue(initialResolvedState === 'pillow_scroll' ? 1 : 0);
  const knockedOutProgress = useSharedValue(initialResolvedState === 'knocked_out' ? 1 : 0);
  const searchingProgress = useSharedValue(initialResolvedState === 'searching' ? 1 : 0);
  const noteStackProgress = useSharedValue(initialResolvedState === 'note_stack' ? 1 : 0);
  const flashcardsProgress = useSharedValue(initialResolvedState === 'flashcards' ? 1 : 0);
  const quizTimeProgress = useSharedValue(initialResolvedState === 'quiz_time' ? 1 : 0);
  const coffeeBreakProgress = useSharedValue(initialResolvedState === 'coffee_break' ? 1 : 0);

  // --- Continuous Loop Shared Values for 10 Loading States ---
  const typingPawLeftY = useSharedValue(0);
  const typingPawRightY = useSharedValue(0);
  const angryShakeX = useSharedValue(0);
  const coffeeSteamY = useSharedValue(0);
  const droolScale = useSharedValue(0);
  const searchBubbleFloat = useSharedValue(0);
  const noteDrop1Y = useSharedValue(0);
  const noteDrop2Y = useSharedValue(0);
  const noteDrop3Y = useSharedValue(0);
  const flashcardRotate = useSharedValue(0);
  const quizBuzzerPulse = useSharedValue(1);
  const clockSpin = useSharedValue(0);

  // --- CENTRALIZED HIGH-FIDELITY ANIMATION ENGINE ---
  const animateToState = (nextState: ReeWState) => {
    // 1. Smoothly fade / scale overlays using spring physics
    sleepingProgress.value = withSpring(nextState === 'sleeping' ? 1 : 0, { damping: 15, stiffness: 120 });
    celebratingProgress.value = withSpring(nextState === 'celebrating' ? 1 : 0, { damping: 15, stiffness: 120 });
    thinkingProgress.value = withSpring(nextState === 'thinking' ? 1 : 0, { damping: 15, stiffness: 120 });
    loadingProgress.value = withSpring(nextState === 'loading' ? 1 : 0, { damping: 15, stiffness: 120 });
    onboardingProgress.value = withSpring(nextState === 'onboarding' ? 1 : 0, { damping: 15, stiffness: 120 });
    completionProgress.value = withSpring(nextState === 'completion' ? 1 : 0, { damping: 15, stiffness: 120 });
    focusedProgress.value = nextState === 'focused' ? withSpring(1, { damping: 15, stiffness: 120 }) : 0;
    coffeeCodingProgress.value = withSpring(nextState === 'coffee_coding' ? 1 : 0, { damping: 15, stiffness: 120 });
    angryCodingProgress.value = withSpring(nextState === 'angry_coding' ? 1 : 0, { damping: 15, stiffness: 120 });
    cocoonProgress.value = withSpring(nextState === 'cocoon' ? 1 : 0, { damping: 15, stiffness: 120 });
    pillowScrollProgress.value = withSpring(nextState === 'pillow_scroll' ? 1 : 0, { damping: 15, stiffness: 120 });
    knockedOutProgress.value = withSpring(nextState === 'knocked_out' ? 1 : 0, { damping: 15, stiffness: 120 });
    searchingProgress.value = withSpring(nextState === 'searching' ? 1 : 0, { damping: 15, stiffness: 120 });
    noteStackProgress.value = withSpring(nextState === 'note_stack' ? 1 : 0, { damping: 15, stiffness: 120 });
    flashcardsProgress.value = withSpring(nextState === 'flashcards' ? 1 : 0, { damping: 15, stiffness: 120 });
    quizTimeProgress.value = withSpring(nextState === 'quiz_time' ? 1 : 0, { damping: 15, stiffness: 120 });
    coffeeBreakProgress.value = withSpring(nextState === 'coffee_break' ? 1 : 0, { damping: 15, stiffness: 120 });

    // 2. Trigger rich transition-specific physics & tactile vibration feedback!
    if (nextState === 'blep') {
      // SNAPPY WINK TRANSITION (Very gentle wobbly wink snap)
      squashStretchX.value = withSequence(
        withTiming(1.03, { duration: 80 }),
        withTiming(0.98, { duration: 90 }),
        withSpring(1, { damping: 15, stiffness: 160 })
      );
      squashStretchY.value = withSequence(
        withTiming(0.97, { duration: 80 }),
        withTiming(1.02, { duration: 90 }),
        withSpring(1, { damping: 15, stiffness: 160 })
      );
      earTwitch.value = withSequence(
        withTiming(4, { duration: 100 }),
        withTiming(-2, { duration: 100 }),
        withSpring(0)
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(8); // Soft tactile haptic click
      }
    } else if (nextState === 'skipping') {
      // GRAVITATIONAL STEPPING JUMP (Subtle, highly stable launch step)
      squashStretchY.value = withSequence(
        withTiming(0.96, { duration: 110 }), // Gentle pre-jump squash
        withTiming(1.04, { duration: 90 }),  // Subtle launch stretch
        withSpring(1, { damping: 15, stiffness: 140 })
      );
      bobbing.value = withSequence(
        withTiming(-3, { duration: 170, easing: Easing.out(Easing.quad) }), // Very small, controlled float step
        withTiming(0, { duration: 190, easing: Easing.in(Easing.quad) }),    // Natural stable fall
        withSpring(0, { damping: 15, stiffness: 120 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(10); // Standard single soft haptic
      }
    } else if (nextState === 'focused') {
      // SPECS ADJUSTMENT SHAKE (Very gentle specs shift)
      squashStretchX.value = withSequence(
        withTiming(1.02, { duration: 70 }),
        withTiming(0.98, { duration: 70 }),
        withSpring(1, { damping: 18, stiffness: 200 })
      );
      earTwitch.value = withSequence(
        withTiming(-2, { duration: 80 }),
        withTiming(2, { duration: 80 }),
        withSpring(0)
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(6); // Tiny tick
      }
    } else if (nextState === 'sleeping') {
      // HEAVY SETTLING SLUMBER (Subtle soft breathing settle)
      squashStretchY.value = withSequence(
        withTiming(0.96, { duration: 220 }),
        withSpring(0.99, { damping: 16, stiffness: 80 }),
        withTiming(1, { duration: 300 })
      );
      squashStretchX.value = withSequence(
        withTiming(1.04, { duration: 220 }),
        withSpring(1.01, { damping: 16, stiffness: 80 }),
        withTiming(1, { duration: 300 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(15);
      }
    } else if (nextState === 'happy' || nextState === 'celebrating') {
      // Joyful subtle bounce
      squashStretchY.value = withSequence(
        withTiming(0.97, { duration: 90 }),
        withTiming(1.03, { duration: 90 }),
        withSpring(1, { damping: 16, stiffness: 160 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(8);
      }
    } else if (nextState === 'thinking') {
      // Thoughtful pulse tilt
      squashStretchX.value = withSequence(
        withTiming(0.99, { duration: 150 }),
        withSpring(1, { damping: 15, stiffness: 140 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(8);
      }
    } else if (nextState === 'loading') {
      // Continuous micro wobble
      squashStretchX.value = withSequence(
        withTiming(1.01, { duration: 100 }),
        withTiming(0.99, { duration: 100 }),
        withSpring(1, { damping: 14, stiffness: 160 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(5);
      }
    } else if (nextState === 'onboarding') {
      squashStretchY.value = withSequence(
        withTiming(0.98, { duration: 120 }),
        withSpring(1, { damping: 15, stiffness: 150 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(8);
      }
    } else if (nextState === 'completion') {
      // Victory celebration squash with small stable bounce
      squashStretchX.value = withSequence(
        withTiming(1.04, { duration: 100 }),
        withTiming(0.98, { duration: 100 }),
        withSpring(1, { damping: 15, stiffness: 160 })
      );
      squashStretchY.value = withSequence(
        withTiming(0.96, { duration: 100 }),
        withTiming(1.02, { duration: 100 }),
        withSpring(1, { damping: 15, stiffness: 160 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 10, 30, 8]); // Soft celebratory double haptic
      }
    } else {
      // CALM SNAPPY RESET (Subtle cute wobbly squash-and-stretch)
      squashStretchX.value = withSequence(
        withTiming(1.03, { duration: 90 }),
        withTiming(0.98, { duration: 110 }),
        withSpring(1, { damping: 15, stiffness: 160 })
      );
      squashStretchY.value = withSequence(
        withTiming(0.97, { duration: 90 }),
        withTiming(1.02, { duration: 110 }),
        withSpring(1, { damping: 15, stiffness: 160 })
      );
      if (Platform.OS === 'android') {
        Vibration.vibrate(6); // Soft standard haptic
      }
    }
  };

  // --- TOUCH SQUEEZE HANDLERS ---
  const handlePressIn = () => {
    if (!isComplete) return;
    // Squeeze down very gently on press start to maintain structural stability
    touchSquashX.value = withSpring(1.02, { damping: 15, stiffness: 200 });
    touchSquashY.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    if (!isComplete) return;
    // Rebound back smoothly with stable spring recoil on release
    touchSquashX.value = withSpring(1.0, { damping: 15, stiffness: 180 });
    touchSquashY.value = withSpring(1.0, { damping: 15, stiffness: 180 });
  };

  // --- INTERACTIVE TAP CYCLING ---
  const handleTap = () => {
    if (!isComplete) return;
    // 1. Determine next cycled state synchronously
    const currentIndex = CYCLE_STATES.indexOf(currentState as any);
    let nextState: ReeWState = 'idle';
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % CYCLE_STATES.length;
      nextState = CYCLE_STATES[nextIndex];
    }

    // 2. Update React state
    setCurrentState(nextState);

    // 3. Trigger rich transition-specific physics & tactile feedback
    animateToState(nextState);
  };

  // --- INITIAL RENDERING ALIGNMENT ---
  useEffect(() => {
    // Sync initial state overlays instantly on mount (no spring transition on first load)
    const resolved = resolveState(state);
    sleepingProgress.value = resolved === 'sleeping' ? 1 : 0;
    celebratingProgress.value = resolved === 'celebrating' ? 1 : 0;
    thinkingProgress.value = resolved === 'thinking' ? 1 : 0;
    loadingProgress.value = resolved === 'loading' ? 1 : 0;
    onboardingProgress.value = resolved === 'onboarding' ? 1 : 0;
    completionProgress.value = resolved === 'completion' ? 1 : 0;
    focusedProgress.value = resolved === 'focused' ? 1 : 0;
    coffeeCodingProgress.value = resolved === 'coffee_coding' ? 1 : 0;
    angryCodingProgress.value = resolved === 'angry_coding' ? 1 : 0;
    cocoonProgress.value = resolved === 'cocoon' ? 1 : 0;
    pillowScrollProgress.value = resolved === 'pillow_scroll' ? 1 : 0;
    knockedOutProgress.value = resolved === 'knocked_out' ? 1 : 0;
    searchingProgress.value = resolved === 'searching' ? 1 : 0;
    noteStackProgress.value = resolved === 'note_stack' ? 1 : 0;
    flashcardsProgress.value = resolved === 'flashcards' ? 1 : 0;
    quizTimeProgress.value = resolved === 'quiz_time' ? 1 : 0;
    coffeeBreakProgress.value = resolved === 'coffee_break' ? 1 : 0;
  }, []);

  // --- PROP STATE CHANGES FLOW REDIRECT ---
  useEffect(() => {
    const resolved = resolveState(state);
    if (resolved !== currentState) {
      setCurrentState(resolved);
      animateToState(resolved);
    }
  }, [state]);

  // --- 30-SECOND IDLE AUTO-TRANSITION TIMER ---
  useEffect(() => {
    if (disableIdleCycle) return;
    const isInCycle = CYCLE_STATES.includes(currentState as any);
    if (!isInCycle) return;

    // Transition automatically to the next state if the user remains idle for 30s
    const timer = setTimeout(() => {
      const currentIndex = CYCLE_STATES.indexOf(currentState as any);
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % CYCLE_STATES.length;
        const nextState = CYCLE_STATES[nextIndex];
        setCurrentState(nextState);
        animateToState(nextState);
      }
    }, 30000); // 30 seconds

    return () => clearTimeout(timer);
  }, [currentState, disableIdleCycle]);

  // --- CALM ANIMATION LIFECYCLE (LINEAR / HEADSPACE INSPIRATION) ---
  useEffect(() => {
    // Disabled continuous sways for absolute character stability
    danceSway.value = withTiming(0, { duration: 300 });
    danceBobY.value = withTiming(0, { duration: 300 });

    // 1. Slow, barely-perceptible floating bob (Idle, Blep, Skipping, Focused, Thinking, Onboarding)
    const isFloating = ['idle', 'blep', 'skipping', 'focused', 'thinking', 'onboarding'].includes(currentState);
    if (isFloating) {
      bobbing.value = withRepeat(
        withTiming(-0.6, {
          duration: currentState === 'happy' ? 2400 : 3200,
          easing: Easing.bezier(0.445, 0.05, 0.55, 0.95), // easeInOutSine
        }),
        -1,
        true
      );
    } else {
      bobbing.value = withTiming(0, { duration: 600 });
    }

    // 2. Rhythmic, deep chest breathing cycle (Extremely Slow)
    let breathDuration = 2400;
    let breathScale = 1.025;
    if (currentState === 'sleeping') {
      breathDuration = 3200;
      breathScale = 1.05;
    } else if (currentState === 'focused' || currentState === 'loading') {
      breathDuration = 2800;
      breathScale = 1.018;
    } else if (currentState === 'tutorial_tired') {
      breathDuration = 800;
      breathScale = 1.06;
    }
    
    breathing.value = withRepeat(
      withTiming(breathScale, {
        duration: breathDuration,
        easing: Easing.bezier(0.445, 0.05, 0.55, 0.95),
      }),
      -1,
      true
    );

    // 3. Periodic natural blinking (Every 4.5 seconds)
    const canBlink = !['sleeping', 'focused', 'loading', 'happy', 'celebrating', 'completion'].includes(currentState);
    const blinkInterval = setInterval(() => {
      if (canBlink) {
        eyeBlink.value = withSequence(
          withTiming(0, { duration: 100 }),
          withTiming(1, { duration: 100 })
        );
      }
    }, 4500);

    // 4. Subtle, infrequent ear twitch (Every 8 seconds)
    const earInterval = setInterval(() => {
      if (currentState !== 'sleeping') {
        earTwitch.value = withSequence(
          withTiming(5, { duration: 150 }),
          withTiming(-2, { duration: 120 }),
          withTiming(0, { duration: 120 })
        );
      }
    }, 8000);

    // 5. Restrained State loops overrides
    if (currentState === 'celebrating') {
      raisedArms.value = withSpring(-5, { damping: 14, stiffness: 140 });
      sparkleRotation.value = withRepeat(
        withTiming(360, { duration: 6000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      raisedArms.value = withTiming(0, { duration: 400 });
    }

    if (currentState === 'thinking') {
      thinkingArm.value = withSpring(-4, { damping: 12, stiffness: 120 });
      thinkingBulb.value = withRepeat(
        withTiming(-2.0, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      thinkingArm.value = withTiming(0, { duration: 400 });
    }

    if (currentState === 'sleeping') {
      floatZzz.value = withRepeat(
        withTiming(-4, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      floatZzz.value = withTiming(0, { duration: 400 });
    }

    if (currentState === 'loading') {
      // Smooth front and back inspect loop (scaling up and down)
      loadingScale.value = withRepeat(
        withTiming(1.10, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      loadingScale.value = withTiming(1, { duration: 400 });
    }

    if (currentState === 'onboarding') {
      // Loop the swipe arrow stroke dash offset to draw the arrow repeatedly
      swipeArrow.value = withRepeat(
        withTiming(0, { duration: 1600, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
        -1,
        false
      );
      thinkingArm.value = withSpring(-3, { damping: 12, stiffness: 100 });
    } else {
      swipeArrow.value = withTiming(24, { duration: 400 });
    }

    if (currentState === 'completion') {
      // Subtle pulse on the victory checkmark
      checkmarkScale.value = withRepeat(
        withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      checkmarkScale.value = withTiming(0.85, { duration: 400 });
    }

    // --- 10 Loading States Loops ---
    typingPawLeftY.value = withRepeat(
      withTiming(-3, { duration: 150, easing: Easing.linear }),
      -1,
      true
    );
    typingPawRightY.value = withRepeat(
      withTiming(-3, { duration: 150, easing: Easing.linear }),
      -1,
      true
    );
    angryShakeX.value = withRepeat(
      withTiming(1.5, { duration: 80, easing: Easing.linear }),
      -1,
      true
    );
    coffeeSteamY.value = withRepeat(
      withTiming(-4, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
    droolScale.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    searchBubbleFloat.value = withRepeat(
      withTiming(-5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    noteDrop1Y.value = withRepeat(
      withSequence(
        withTiming(-15, { duration: 0 }),
        withTiming(0, { duration: 600, easing: Easing.bounce }),
        withDelay(1200, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );
    noteDrop2Y.value = withRepeat(
      withSequence(
        withDelay(300, withTiming(-15, { duration: 0 })),
        withTiming(0, { duration: 600, easing: Easing.bounce }),
        withDelay(900, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );
    noteDrop3Y.value = withRepeat(
      withSequence(
        withDelay(600, withTiming(-15, { duration: 0 })),
        withTiming(0, { duration: 600, easing: Easing.bounce }),
        withDelay(600, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );
    flashcardRotate.value = withRepeat(
      withTiming(360, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
    quizBuzzerPulse.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 100 }),
        withTiming(1, { duration: 100 }),
        withDelay(800, withTiming(1, { duration: 0 }))
      ),
      -1,
      false
    );
    clockSpin.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );

    if (currentState === 'tutorial_walk') {
      walkLegY.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 180, easing: Easing.linear }),
          withTiming(0, { duration: 180, easing: Easing.linear })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(walkLegY);
      walkLegY.value = withTiming(0, { duration: 200 });
    }

    if (currentState === 'tutorial_tired') {
      sweatDropY.value = 0;
      sweatOpacity.value = withTiming(1, { duration: 200 });
      sweatDropY.value = withRepeat(
        withSequence(
          withTiming(8, { duration: 1000, easing: Easing.linear }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(sweatDropY);
      sweatOpacity.value = withTiming(0, { duration: 200 });
    }

    if (currentState === 'engineer_reew') {
      engineerLeftArmY.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(4, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      engineerRightArmY.value = withRepeat(
        withSequence(
          withTiming(4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(-4, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(engineerLeftArmY);
      cancelAnimation(engineerRightArmY);
      engineerLeftArmY.value = withTiming(0, { duration: 200 });
      engineerRightArmY.value = withTiming(0, { duration: 200 });
    }

    if (currentState === 'sort_reew') {
      sortAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(sortAnim);
      sortAnim.value = 0;
    }

    return () => {
      clearInterval(blinkInterval);
      clearInterval(earInterval);
    };
  }, [currentState]);

  // --- NATIVE UI THREAD SVG PROP ANIMATIONS (0% JS THREAD OVERHEAD) ---
  const eyeProps = useAnimatedProps(() => ({
    ry: eyeBlink.value * 4.5,
  }));

  const eyeHighlightProps = useAnimatedProps(() => ({
    r: eyeBlink.value * 1.5,
  }));

  const eyeSubHighlightProps = useAnimatedProps(() => ({
    r: eyeBlink.value * 0.7,
  }));

  const onboardingArrowProps = useAnimatedProps(() => ({
    strokeDashoffset: swipeArrow.value,
  }));

  const leftFootProps = useAnimatedProps(() => ({
    translateY: currentState === 'tutorial_walk' ? walkLegY.value : 0,
  }));

  const rightFootProps = useAnimatedProps(() => ({
    translateY: currentState === 'tutorial_walk' ? -walkLegY.value : 0,
  }));

  const sweatProps = useAnimatedProps(() => ({
    opacity: sweatOpacity.value,
    translateY: sweatDropY.value,
  }));

  // --- ANIMATED STYLES FOR REANIMATED ---
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bobbing.value }],
  }));

  // Removed continuous rock sways for extreme visual stability
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: squashStretchX.value * touchSquashX.value },
      { scaleY: squashStretchY.value * touchSquashY.value },
    ],
  }));

  const leftEarProps = useAnimatedProps(() => ({
    rotation: -earTwitch.value,
    originX: 20,
    originY: 20,
  }));

  const rightEarProps = useAnimatedProps(() => ({
    rotation: earTwitch.value,
    originX: 80,
    originY: 20,
  }));

  const leftPawProps = useAnimatedProps(() => {
    let tx = 0;
    let ty = 0;
    if (currentState === 'celebrating') {
      ty = raisedArms.value;
      tx = -2;
    } else if (currentState === 'thinking' || currentState === 'onboarding') {
      ty = thinkingArm.value;
      tx = 3;
    } else if (currentState === 'coffee_coding' || currentState === 'angry_coding') {
      ty = typingPawLeftY.value;
    } else if (currentState === 'tutorial_walk') {
      ty = walkLegY.value;
    } else if (currentState === 'engineer_reew') {
      ty = engineerLeftArmY.value;
    }
    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
      ] as any,
    };
  });

  const rightPawProps = useAnimatedProps(() => {
    let tx = 0;
    let ty = 0;
    if (currentState === 'celebrating') {
      ty = raisedArms.value;
      tx = 2;
    } else if (currentState === 'loading') {
      // Translate right paw to hold the magnifying glass handle
      tx = -3;
      ty = -6;
    } else if (currentState === 'coffee_coding' || currentState === 'angry_coding') {
      ty = typingPawRightY.value;
    } else if (currentState === 'tutorial_walk') {
      ty = -walkLegY.value;
    } else if (currentState === 'engineer_reew') {
      ty = engineerRightArmY.value;
    } else if (currentState === 'sort_reew') {
      tx = sortAnim.value * -36;
    }
    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
      ] as any,
    };
  });

  const coffeeCodingProps = useAnimatedProps(() => ({
    opacity: coffeeCodingProgress.value,
  }));

  const angryCodingProps = useAnimatedProps(() => ({
    opacity: angryCodingProgress.value,
    translateX: angryShakeX.value * angryCodingProgress.value,
  }));

  const cocoonProps = useAnimatedProps(() => ({
    opacity: cocoonProgress.value,
  }));

  const pillowScrollProps = useAnimatedProps(() => ({
    opacity: pillowScrollProgress.value,
  }));

  const knockedOutProps = useAnimatedProps(() => ({
    opacity: knockedOutProgress.value,
  }));

  const searchingProps = useAnimatedProps(() => ({
    opacity: searchingProgress.value,
    translateY: searchBubbleFloat.value * searchingProgress.value,
  }));

  const noteStackProps = useAnimatedProps(() => ({
    opacity: noteStackProgress.value,
  }));

  const note1Props = useAnimatedProps(() => ({
    translateY: noteDrop1Y.value * noteStackProgress.value,
  }));

  const note2Props = useAnimatedProps(() => ({
    translateY: noteDrop2Y.value * noteStackProgress.value,
  }));

  const note3Props = useAnimatedProps(() => ({
    translateY: noteDrop3Y.value * noteStackProgress.value,
  }));

  const flashcardsProps = useAnimatedProps(() => ({
    opacity: flashcardsProgress.value,
  }));

  const flashcardAnimatedProps = useAnimatedProps(() => ({
    scaleX: Math.cos(flashcardRotate.value * Math.PI / 180),
    originX: 50,
    originY: 77,
  }));

  const quizTimeProps = useAnimatedProps(() => ({
    opacity: quizTimeProgress.value,
  }));

  const buzzerProps = useAnimatedProps(() => ({
    scaleY: 1.0 + 0.1 * quizBuzzerPulse.value,
    originX: 8,
    originY: 8,
  }));

  const coffeeBreakProps = useAnimatedProps(() => ({
    opacity: coffeeBreakProgress.value,
  }));

  const clockHandProps = useAnimatedProps(() => ({
    rotation: clockSpin.value,
    originX: 8,
    originY: 8,
  }));

  const celebratingProps = useAnimatedProps(() => ({
    opacity: celebratingProgress.value,
  }));

  const thinkingProps = useAnimatedProps(() => ({
    opacity: thinkingProgress.value,
    translateY: thinkingBulb.value,
  }));

  const zzzStyle = useAnimatedStyle(() => ({
    opacity: sleepingProgress.value,
    transform: [
      { translateY: floatZzz.value },
      { scale: breathing.value * sleepingProgress.value },
    ],
  }));

  const card1Props = useAnimatedProps(() => ({
    translateY: card1Y.value,
  }));

  const card2Props = useAnimatedProps(() => ({
    translateY: card2Y.value,
  }));

  const loadingProps = useAnimatedProps(() => ({
    opacity: loadingProgress.value,
  }));

  const lensAnimatedStyle = useAnimatedStyle(() => {
    const currentScale = typeof loadingScale.value === 'number' ? loadingScale.value : 1;
    return {
      opacity: loadingProgress.value,
      transform: [
        { scale: currentScale },
      ],
    };
  });

  const onboardingProps = useAnimatedProps(() => ({
    opacity: onboardingProgress.value,
  }));

  const completionProps = useAnimatedProps(() => ({
    opacity: completionProgress.value,
  }));

  const focusedProps = useAnimatedProps(() => ({
    opacity: focusedProgress.value,
  }));

  if (!isComplete && (state === 'zen' || state === 'streak')) {
    return null;
  }

  return (
    <Pressable 
      onPress={handleTap} 
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[bobStyle, { width: '100%', height: '100%' }]}>
        
        {/* --- SLEEPING ZZZ PARTICLES (SLATE MUTED INSTEAD OF CARTOON) --- */}
        <Animated.View style={[styles.zzzContainer, zzzStyle]}>
          <View style={[styles.zzz, { top: -2, left: -6, transform: [{ scale: 0.65 }] }]} />
          <View style={[styles.zzz, { top: -14, left: 4, transform: [{ scale: 0.95 }] }]} />
          <View style={[styles.zzz, { top: -26, left: 16, transform: [{ scale: 0.75 }] }]} />
        </Animated.View>

        <Animated.View style={[bodyStyle, { width: '100%', height: '100%' }]}>
          <Svg width="100%" height="100%" viewBox={currentState === 'loading' ? "12 10 76 76" : "0 0 100 100"}>
            <Defs>
              <LinearGradient id="reew_sparkle_grad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#FB7185" stopOpacity={0.4} />
                <Stop offset="100%" stopColor="#FB7185" stopOpacity={0.01} />
              </LinearGradient>
            </Defs>

            {/* --- STATE 4: CELEBRATING SPARKLES (FLOATING PINK VECTOR HEARTS - IMAGE 3 STYLE) --- */}
            <AnimatedG animatedProps={celebratingProps}>
              {/* Heart 1 */}
              <Path
                d="M 28,12 C 26,10 24,10 23,12 C 22,14 24,16 28,20 C 32,16 34,14 33,12 C 32,10 30,10 28,12"
                fill="#FB7185"
              />
              {/* Heart 2 */}
              <Path
                d="M 72,12 C 70,10 68,10 67,12 C 66,14 68,16 72,20 C 76,16 78,14 77,12 C 76,10 74,10 72,12"
                fill="#FB7185"
              />
              {/* Center pulsing heart */}
              <Path
                d="M 50,4 C 47,1 44,1 42,4 C 40,7 44,11 50,17 C 56,11 60,7 58,4 C 56,1 53,1 50,4"
                fill="url(#reew_sparkle_grad)"
                stroke="#F43F5E"
                strokeWidth={0.8}
              />
            </AnimatedG>

            {/* --- 10 LOADING STATES SVG GEOMETRIES --- */}
            {/* 1. COFFEE CODING */}
            <AnimatedG animatedProps={coffeeCodingProps}>
              {/* 6 Coffee Mugs around him */}
              {/* Mug 1 (Left Back) */}
              <Rect x="8" y="70" width="10" height="12" rx="2" fill="#93C5FD" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 8,73 C 5,73 5,77 8,77" fill="none" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 12,65 Q 14,60 12,56" fill="none" stroke="#4A3B32" strokeWidth={1} opacity={0.6} />

              {/* Mug 2 (Left Middle) */}
              <Rect x="14" y="80" width="10" height="12" rx="2" fill="#FCA5A5" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 14,83 C 11,83 11,87 14,87" fill="none" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 18,75 Q 20,70 18,66" fill="none" stroke="#4A3B32" strokeWidth={1} opacity={0.6} />

              {/* Mug 3 (Left Front) */}
              <Rect x="20" y="88" width="10" height="12" rx="2" fill="#FDE047" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 20,91 C 17,91 17,95 20,95" fill="none" stroke="#4A3B32" strokeWidth={1.2} />

              {/* Mug 4 (Right Back) */}
              <Rect x="82" y="70" width="10" height="12" rx="2" fill="#C084FC" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 92,73 C 95,73 95,77 92,77" fill="none" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 88,65 Q 90,60 88,56" fill="none" stroke="#4A3B32" strokeWidth={1} opacity={0.6} />

              {/* Mug 5 (Right Middle) */}
              <Rect x="76" y="80" width="10" height="12" rx="2" fill="#86EFAC" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 86,83 C 89,83 89,87 86,87" fill="none" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 82,75 Q 84,70 82,66" fill="none" stroke="#4A3B32" strokeWidth={1} opacity={0.6} />

              {/* Mug 6 (Right Front) */}
              <Rect x="70" y="88" width="10" height="12" rx="2" fill="#FDA4AF" stroke="#4A3B32" strokeWidth={1.2} />
              <Path d="M 80,91 C 83,91 83,95 80,95" fill="none" stroke="#4A3B32" strokeWidth={1.2} />

              {/* Blue Laptop in front */}
              <Path d="M 36,82 L 64,82 L 68,96 L 32,96 Z" fill="#60A5FA" stroke="#4A3B32" strokeWidth={1.5} strokeLinejoin="round" />
              <Path d="M 38,82 L 38,70 L 62,70 L 62,82" fill="#3B82F6" stroke="#4A3B32" strokeWidth={1.5} strokeLinejoin="round" />
              <Circle cx="50" cy="76" r="2.5" fill="#FFFFFF" opacity={0.8} />
            </AnimatedG>

            {/* 2. ANGRY CODING */}
            <AnimatedG animatedProps={angryCodingProps}>
              {/* Pink Laptop with Stickers */}
              <Path d="M 36,82 L 64,82 L 68,96 L 32,96 Z" fill="#F472B6" stroke="#4A3B32" strokeWidth={1.5} strokeLinejoin="round" />
              <Path d="M 38,82 L 38,70 L 62,70 L 62,82" fill="#EC4899" stroke="#4A3B32" strokeWidth={1.5} strokeLinejoin="round" />
              <Path d="M 50,74 C 49,73 48,73 47.5,74 C 47,75 48,76 50,78 C 52,76 53,75 52.5,74 C 52,73 51,73 50,74" fill="#F43F5E" />

              {/* Red Anger Marks */}
              <Path d="M 76,22 L 80,26 M 80,22 L 76,26 M 78,20 L 78,28 M 74,24 L 82,24" stroke="#EF4444" strokeWidth={1.5} strokeLinecap="round" />
              <Path d="M 18,22 L 22,26 M 22,22 L 18,26 M 20,20 L 20,28 M 16,24 L 24,24" stroke="#EF4444" strokeWidth={1.5} strokeLinecap="round" />
            </AnimatedG>

            {/* 3. COCOON */}
            <AnimatedG animatedProps={cocoonProps}>
              {/* Massive blankets stack */}
              <Path d="M 16,74 C 16,74 24,96 50,96 C 76,96 84,74 84,74 C 84,74 90,88 50,98 C 10,88 16,74 16,74 Z" fill="#60A5FA" stroke="#4A3B32" strokeWidth={2} />
              <Path d="M 18,78 C 18,78 26,92 50,92 C 74,92 82,78 82,78 C 82,78 86,86 50,89 C 14,86 18,78 18,78 Z" fill="#34D399" stroke="#4A3B32" strokeWidth={2} />
              <Path d="M 20,82 C 20,82 28,88 50,88 C 72,88 80,82 80,82 C 80,82 83,85 50,86 C 17,85 20,82 20,82 Z" fill="#FBBF24" stroke="#4A3B32" strokeWidth={2} />
              
              {/* Glowing phone */}
              <Rect x="44" y="66" width="12" height="18" rx="2" fill="#F59E0B" stroke="#4A3B32" strokeWidth={1.5} />
              <Rect x="46" y="68" width="8" height="12" fill="#FEF08A" />
              <Circle cx="50" cy="74" r="8" fill="#FEF08A" opacity={0.35} />
            </AnimatedG>

            {/* 4. PILLOW SCROLL */}
            <AnimatedG animatedProps={pillowScrollProps}>
              {/* Large yellow pillow */}
              <Path d="M 14,35 Q 8,50 14,65 Q 50,70 86,65 Q 92,50 86,35 Q 50,30 14,35 Z" fill="#FDE047" stroke="#4A3B32" strokeWidth={1.8} opacity={0.85} />
              
              {/* Purple phone */}
              <G transform="rotate(15, 50, 75)">
                <Rect x="42" y="70" width="16" height="10" rx="2" fill="#A855F7" stroke="#4A3B32" strokeWidth={1.5} />
                <Rect x="44" y="72" width="12" height="6" fill="#E9D5FF" />
              </G>

              {/* Drool */}
              <Path d="M 52,53 C 52,53 51,57 52.5,58 C 54,59 55,57 52,53 Z" fill="#93C5FD" opacity={0.8} />
            </AnimatedG>

            {/* 5. KNOCKED OUT */}
            <AnimatedG animatedProps={knockedOutProps}>
              {/* Cushion */}
              <Path d="M 10,75 C 10,70 90,70 90,75 C 90,82 75,98 50,98 C 25,98 10,82 10,75 Z" fill="#2DD4BF" stroke="#4A3B32" strokeWidth={2} />

              {/* Boba tea */}
              <G transform="translate(14, 60)">
                <Path d="M 2,12 L 10,12 L 8,24 L 4,24 Z" fill="#E2E8F0" stroke="#4A3B32" strokeWidth={1.2} />
                <Path d="M 6,12 L 6,6" stroke="#EC4899" strokeWidth={2} />
                <Circle cx="5" cy="20" r="1" fill="#000000" />
                <Circle cx="7" cy="22" r="1" fill="#000000" />
                <Circle cx="5" cy="22" r="1" fill="#000000" />
              </G>

              {/* Open book on face */}
              <G transform="translate(30, 32)">
                <Path d="M 20,10 Q 10,6 0,8 L 0,22 Q 10,20 20,24 Z" fill="#F472B6" stroke="#4A3B32" strokeWidth={1.5} />
                <Path d="M 20,10 Q 30,6 40,8 L 40,22 Q 30,20 20,24 Z" fill="#F472B6" stroke="#4A3B32" strokeWidth={1.5} />
                <Path d="M 4,11 L 16,13" stroke="#FFFFFF" strokeWidth={1} />
                <Path d="M 4,15 L 16,17" stroke="#FFFFFF" strokeWidth={1} />
                <Path d="M 24,13 L 36,11" stroke="#FFFFFF" strokeWidth={1} />
                <Path d="M 24,17 L 36,15" stroke="#FFFFFF" strokeWidth={1} />
              </G>
              
              {/* Drool */}
              <Path d="M 52,53 C 52,53 51,57 52.5,58 C 54,59 55,57 52,53 Z" fill="#93C5FD" opacity={0.8} />
            </AnimatedG>

            {/* 6. SEARCHING */}
            <AnimatedG animatedProps={searchingProps}>
              {/* Query bubbles */}
              <G transform="translate(12, 30)">
                <Circle cx="8" cy="8" r="7" fill="#E0F2FE" stroke="#4A3B32" strokeWidth={1.2} />
                <Path d="M 7,6 C 7,5 9,5 9,6 C 9,7 8,8 8,9 M 8,11 L 8,11.5" fill="none" stroke="#0369A1" strokeWidth={1.2} strokeLinecap="round" />
              </G>
              <G transform="translate(74, 25)">
                <Circle cx="8" cy="8" r="7" fill="#EBF5FF" stroke="#4A3B32" strokeWidth={1.2} />
                <Path d="M 7,6 C 7,5 9,5 9,6 C 9,7 8,8 8,9 M 8,11 L 8,11.5" fill="none" stroke="#1C3D5A" strokeWidth={1.2} strokeLinecap="round" />
              </G>

              {/* Magnifying Glass */}
              <G transform="translate(32, 60) rotate(-15)">
                <Path d="M 0,12 L 6,18" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" />
                <Circle cx="0" cy="6" r="6" fill="#E0F2FE" stroke="#4A3B32" strokeWidth={1.8} />
                <Path d="M -3,3 Q 0,0 3,3" fill="none" stroke="#FFFFFF" strokeWidth={1} />
              </G>
            </AnimatedG>

            {/* 7. NOTE STACK */}
            <AnimatedG animatedProps={noteStackProps}>
              {/* Note stack dropping */}
              <AnimatedRect x="34" y="86" width="16" height="10" rx="1" fill="#FBCFE8" stroke="#4A3B32" strokeWidth={1.2} animatedProps={note1Props} />
              <AnimatedRect x="42" y="82" width="16" height="10" rx="1" fill="#FEF08A" stroke="#4A3B32" strokeWidth={1.2} animatedProps={note2Props} />
              <AnimatedRect x="38" y="78" width="16" height="10" rx="1" fill="#BAE6FD" stroke="#4A3B32" strokeWidth={1.2} animatedProps={note3Props} />
            </AnimatedG>

            {/* 8. FLASHCARDS */}
            <AnimatedG animatedProps={flashcardsProps}>
              <Rect x="42" y="74" width="18" height="12" rx="1.5" fill="#E2E8F0" stroke="#4A3B32" strokeWidth={1.2} />
              <AnimatedG animatedProps={flashcardAnimatedProps}>
                <Rect x="40" y="70" width="20" height="14" rx="1.8" fill="#F0FDF4" stroke="#4A3B32" strokeWidth={1.5} />
                <Path d="M 46,77 L 49,80 L 54,74" fill="none" stroke="#22C55E" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </AnimatedG>
            </AnimatedG>

            {/* 9. QUIZ TIME */}
            <AnimatedG animatedProps={quizTimeProps}>
              {/* Question Mark Balloon */}
              <G transform="translate(68, 14)">
                <Path d="M 6,18 Q 8,24 6,32" fill="none" stroke="#4A3B32" strokeWidth={1.2} />
                <Circle cx="6" cy="10" r="8" fill="#FCA5A5" stroke="#4A3B32" strokeWidth={1.5} />
                <Path d="M 5,8 C 5,7 7,7 7,8 C 7,9 6,10 6,11 M 6,13 L 6,13.5" fill="none" stroke="#B91C1C" strokeWidth={1.2} strokeLinecap="round" />
              </G>

              {/* Buzzer in Paw */}
              <G transform="translate(18, 70)">
                <Rect x="2" y="8" width="12" height="8" rx="2" fill="#94A3B8" stroke="#4A3B32" strokeWidth={1.2} />
                <AnimatedRect x="4" y="4" width="8" height="4" rx="1" fill="#EF4444" stroke="#4A3B32" strokeWidth={1.2} animatedProps={buzzerProps} />
              </G>
            </AnimatedG>

            {/* 10. COFFEE BREAK */}
            <AnimatedG animatedProps={coffeeBreakProps}>
              <G transform="translate(42, 64)">
                <Rect x="2" y="4" width="12" height="10" rx="2.5" fill="#FBCFE8" stroke="#4A3B32" strokeWidth={1.5} />
                <Path d="M 14,6 C 16.5,6 16.5,10 14,10" fill="none" stroke="#4A3B32" strokeWidth={1.5} />
                <Path d="M 6,-2 Q 8,-7 6,-11 M 10,-1 Q 12,-5 10,-9" fill="none" stroke="#4A3B32" strokeWidth={1} opacity={0.6} />
              </G>

              {/* Spinning Clock */}
              <G transform="translate(74, 55)">
                <Circle cx="8" cy="8" r="8" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={1.5} />
                <AnimatedG animatedProps={clockHandProps}>
                  <Path d="M 8,8 L 8,4" stroke="#4A3B32" strokeWidth={1.5} strokeLinecap="round" />
                  <Path d="M 8,8 L 11,8" stroke="#4A3B32" strokeWidth={1} strokeLinecap="round" />
                </AnimatedG>
              </G>
            </AnimatedG>

            {/* --- STATE 6: THINKING IDEA SPARK --- */}
            <AnimatedPath
              d="M 50,3 Q 50,9 44,9 Q 50,9 50,15 Q 50,9 56,9 Q 50,9 50,3 Z"
              fill="rgba(167, 139, 250, 0.15)"
              stroke="#4A3B32"
              strokeWidth={1.2}
              animatedProps={thinkingProps}
            />

            {/* --- STATE 3: CARDS SORTING / ORGANIZING (LOADING STATE) --- */}
            <AnimatedG animatedProps={loadingProps}>
            </AnimatedG>

            {/* --- STATE 8: ONBOARDING SWIPE TRAJECTORY GUIDE --- */}
            <AnimatedG animatedProps={onboardingProps}>
              {/* Ultra-fine elegant curved guiding arrow */}
              <AnimatedPath
                d="M 22,22 Q 50,6 78,22"
                fill="none"
                stroke="rgba(244, 63, 94, 0.45)"
                strokeWidth={1.2}
                strokeDasharray="4 3"
                animatedProps={onboardingArrowProps}
              />
              {/* Arrowhead */}
              <Path
                d="M 74,18 L 78,22 L 74,25"
                fill="none"
                stroke="rgba(244, 63, 94, 0.45)"
                strokeWidth={1.2}
              />
              {/* Floating little heart from finger gesture */}
              <Path
                d="M 50,22 C 48,20 46,20 45,22 C 44,24 46,26 50,30 C 54,26 56,24 55,22 C 54,20 52,20 50,22"
                fill="#FB7185"
              />
            </AnimatedG>

            {/* --- UPGRADED "COMPLETION" OVERLAY (GOLD CROWN, GOLD TROPHY, FLOTING SPARKLING STARS - MATCHES YOUR IMAGE PERFECTLY) --- */}
            <AnimatedG animatedProps={completionProps}>
              {/* 1. Yellow Golden Crown between ears */}
              <Path
                d="M 43,15 L 39,8 L 46,11 L 50,5 L 54,11 L 61,8 L 57,15 Z"
                fill="#FBBF24"
                stroke="#4A3B32"
                strokeWidth={2.0}
                strokeLinejoin="round"
              />
              {/* Crown peak tips */}
              <Circle cx="39" cy="8" r="1.3" fill="#FBBF24" stroke="#4A3B32" strokeWidth={1.2} />
              <Circle cx="50" cy="5" r="1.3" fill="#FBBF24" stroke="#4A3B32" strokeWidth={1.2} />
              <Circle cx="61" cy="8" r="1.3" fill="#FBBF24" stroke="#4A3B32" strokeWidth={1.2} />

              {/* 2. Golden Trophy cup clutched in front of body */}
              {/* Handles */}
              <Path d="M 42,67 C 38.5,67 38.5,71 42,71" fill="none" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
              <Path d="M 58,67 C 61.5,67 61.5,71 58,71" fill="none" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
              {/* Cup shape */}
              <Path
                d="M 42,65 L 58,65 C 58,71 55,75 50,75 C 45,75 42,71 42,65 Z"
                fill="#FBBF24"
                stroke="#4A3B32"
                strokeWidth={2.0}
                strokeLinejoin="round"
              />
              {/* Stem / Base */}
              <Path d="M 48,75 L 52,75 L 53,78 L 47,78 Z" fill="#D97706" stroke="#4A3B32" strokeWidth={2.0} strokeLinejoin="round" />
              <Path d="M 44,78 L 56,78" fill="none" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
              {/* Number "1" engraved on the cup */}
              <Path
                d="M 49.5,68 L 50.8,67.2 L 50.8,72.5 M 49.6,68.6 L 50.8,67.2"
                fill="none"
                stroke="#D97706"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 3. Paws clutching the trophy */}
              <Circle cx="41" cy="70" r="4.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              <Circle cx="59" cy="70" r="4.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />

              {/* 4. Floating 4-Point Victory Stars */}
              {/* Star 1 - Top Left */}
              <Path d="M 24,16 Q 24,20 20,20 Q 24,20 24,24 Q 24,20 28,20 Q 24,20 24,16 Z" fill="#FBBF24" />
              {/* Star 2 - Right Cheek */}
              <Path d="M 80,53 Q 80,56 77,56 Q 80,56 80,59 Q 80,56 83,56 Q 80,56 80,53 Z" fill="#FBBF24" />
              {/* Star 3 - Bottom Right */}
              <Path d="M 74,71 Q 74,74 71,74 Q 74,74 74,77 Q 74,74 77,74 Q 74,74 74,71 Z" fill="#FBBF24" />
            </AnimatedG>

            <G transform={
              currentState === 'v_fingers'
                ? 'rotate(-6, 50, 42)'
                : currentState === 'tutorial_tired'
                  ? 'rotate(3, 50, 42)'
                  : undefined
            }>
              {/* --- CUTE ROUND COMIC EARS (DARK COCOA PANDA EARS - #4A3B32) --- */}
              <AnimatedPath
                d="M 18,28 C 13,26 14,14 22,14 C 29,14 27,24 24,28 Z"
                fill="#4A3B32"
                stroke="#4A3B32"
                strokeWidth={2.4}
                strokeLinejoin="round"
                animatedProps={leftEarProps}
              />
              <AnimatedPath
                d="M 82,28 C 87,26 86,14 78,14 C 71,14 73,24 76,28 Z"
                fill="#4A3B32"
                stroke="#4A3B32"
                strokeWidth={2.4}
                strokeLinejoin="round"
                animatedProps={rightEarProps}
              />
            </G>

            {/* --- RED SUPERMAN CAPE (Flows behind body and neck) --- */}
            {(currentState === 'superman_stand' || currentState === 'superman_fly') && (
              <G>
                {/* Red cape body */}
                <Path
                  d="M 32,60 C 14,64 6,80 12,98 C 24,96 38,92 50,88 C 62,92 76,96 88,98 C 94,80 86,64 68,60 Z"
                  fill="#CE4B4B"
                  stroke="#4A3B32"
                  strokeWidth={2.4}
                  strokeLinejoin="round"
                />
                {/* Cape folds shading */}
                <Path
                  d="M 38,68 C 30,76 26,84 28,94"
                  fill="none"
                  stroke="#9B3333"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
                <Path
                  d="M 62,68 C 70,76 74,84 72,94"
                  fill="none"
                  stroke="#9B3333"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </G>
            )}

            {/* --- CHUBBY PANDA BODY (PURE WHITE SURFACES) --- */}
            <Ellipse
              cx="50"
              cy="74"
              rx="26"
              ry="20"
              fill="#FFFFFF"
              stroke="#4A3B32"
              strokeWidth={2.8}
            />

            {/* --- FEET (DARK FEET UNDER THE BODY) --- */}
            <AnimatedCircle cx="36" cy="90" r="5" fill="#4A3B32" stroke="#4A3B32" strokeWidth={1} animatedProps={leftFootProps} />
            <AnimatedCircle cx="64" cy="90" r="5" fill="#4A3B32" stroke="#4A3B32" strokeWidth={1} animatedProps={rightFootProps} />

            {/* --- STATE SPECIFIC BACKGROUND BAGS (EXPRESSION B - IMAGE 2 STYLE) --- */}
            {currentState === 'skipping' && (
              <G>
                {/* Bag strap */}
                <Path d="M 32,65 Q 45,74 58,82" fill="none" stroke="#4A3B32" strokeWidth={3} />
                {/* Yellow Messenger Side Bag */}
                <Rect x="60" y="74" width="10" height="9" rx="3.5" fill="#EAB308" stroke="#4A3B32" strokeWidth={2} />
                <Path d="M 60,76 L 70,76" stroke="#4A3B32" strokeWidth={1.8} />
              </G>
            )}

            {/* --- STATE SPECIFIC DIAGONAL BAG STRAP (EXPRESSION A - IMAGE 1 STYLE) --- */}
            {currentState === 'blep' && (
              <G>
                {/* Diagonal strap outlines */}
                <Path d="M 33,65 L 68,82" fill="none" stroke="#4A3B32" strokeWidth={4.5} strokeLinecap="round" />
                <Path d="M 33,65 L 68,82" fill="none" stroke="#EAB308" strokeWidth={2.5} strokeLinecap="round" />
              </G>
            )}

            {/* --- COLLAR AND CUTE CHOCOLATE BOW TIE --- */}
            <Path
              d="M 30,62 Q 50,68 70,62"
              fill="none"
              stroke="#4A3B32"
              strokeWidth={3}
            />
            <G transform="translate(50, 64)">
              {/* Left bow wing */}
              <Path d="M 0,0 L -6,-4 L -8,0 L -6,4 Z" fill="#4A3B32" />
              {/* Right bow wing */}
              <Path d="M 0,0 L 6,-4 L 8,0 L 6,4 Z" fill="#4A3B32" />
              {/* Center knot */}
              <Circle cx="0" cy="0" r="2.5" fill="#4A3B32" />
            </G>

            <G transform={
              currentState === 'v_fingers'
                ? 'rotate(-6, 50, 42)'
                : currentState === 'tutorial_tired'
                  ? 'rotate(3, 50, 42)'
                  : undefined
            }>
              {/* --- FAT CHUBBY ORGANIC PANDA HEAD (Pear shape with bulging cheeks - matches Image 1/2) --- */}
              <Path
                d="M 50,16 C 33,16 20,24 17,34 C 13,44 14,56 25,62 C 33,66 67,66 75,62 C 86,56 87,44 83,34 C 80,24 67,16 50,16 Z"
                fill="#FFFFFF"
                stroke="#4A3B32"
                strokeWidth={2.8}
                strokeLinejoin="round"
              />

              {currentState === 'engineer_reew' && (
                <G>
                  {/* Yellow safety helmet dome */}
                  <Path
                    d="M 26,26 A 24,22 0 0,1 74,26 Z"
                    fill="#FBBF24"
                    stroke="#4A3B32"
                    strokeWidth={2.8}
                    strokeLinejoin="round"
                  />
                  {/* Helmet crest / top ridge */}
                  <Path
                    d="M 45,26 Q 50,13 55,26"
                    fill="#FBBF24"
                    stroke="#4A3B32"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  />
                  {/* Shading/amber highlight details on dome */}
                  <Path
                    d="M 33,24 Q 50,19 67,24"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  {/* Brim of safety helmet */}
                  <Path
                    d="M 20,28 Q 50,23 80,28"
                    fill="none"
                    stroke="#4A3B32"
                    strokeWidth={5.0}
                    strokeLinecap="round"
                  />
                  <Path
                    d="M 21,28 Q 50,23.5 79,28"
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth={3.0}
                    strokeLinecap="round"
                  />
                </G>
              )}

              {currentState === 'dj_reew' && (
                <G>
                  {/* Headphone band connecting the ear cups */}
                  <Path
                    d="M 22,26 C 22,7 78,7 78,26"
                    fill="none"
                    stroke="#4A3B32"
                    strokeWidth={4.5}
                    strokeLinecap="round"
                  />
                  <Path
                    d="M 22,26 C 22,7 78,7 78,26"
                    fill="none"
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  {/* Left ear cup */}
                  <Ellipse
                    cx="20"
                    cy="27"
                    rx="5.5"
                    ry="9.5"
                    fill="#EC4899"
                    stroke="#4A3B32"
                    strokeWidth={2.0}
                  />
                  <Rect
                    x="21"
                    y="21"
                    width="2"
                    height="12"
                    rx="1"
                    fill="#10B981"
                  />
                  {/* Right ear cup */}
                  <Ellipse
                    cx="80"
                    cy="27"
                    rx="5.5"
                    ry="9.5"
                    fill="#EC4899"
                    stroke="#4A3B32"
                    strokeWidth={2.0}
                  />
                  <Rect
                    x="77"
                    y="21"
                    width="2"
                    height="12"
                    rx="1"
                    fill="#10B981"
                  />
                </G>
              )}

            <G transform={
              currentState === 'tutorial_walk'
                ? 'translate(-8, 0)'
                : currentState === 'tutorial_tired'
                  ? 'translate(-2, 2)'
                  : currentState === 'superman_fly'
                    ? 'translate(0, -6)'
                    : undefined
            }>
              {/* --- SOFT CORAL-PEACH PANDA BLUSH (EXACT COLOR MATCH - #FFA8A8) --- */}
              <Ellipse
                cx="23"
                cy="51"
                rx={currentState === 'tutorial_walk' ? 2.5 : 6.5}
                ry="5"
                fill="#FFA8A8"
              />
            <Ellipse
              cx="77"
              cy="51"
              rx="6.5"
              ry="5"
              fill="#FFA8A8"
            />

            {/* --- FACIAL DETAILS --- */}
            {(currentState === 'sleeping' || currentState === 'pillow_scroll' || currentState === 'tutorial_tired') ? (
              // Sleepy curved arches
              <>
                <Path
                  d="M 32,48 Q 36,52 40,48"
                  fill="transparent"
                  stroke="#4A3B32"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                <Path
                  d="M 60,48 Q 64,52 68,48"
                  fill="transparent"
                  stroke="#4A3B32"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </>
            ) : (currentState === 'happy' || currentState === 'celebrating' || currentState === 'note_stack' || currentState === 'coffee_break' || currentState === 'v_fingers' || currentState === 'engineer_reew' || currentState === 'grad_reew' || currentState === 'grad_sweat' || currentState === 'dj_reew' || currentState === 'sort_reew' || currentState === 'smirk') ? (
              // Gentle closed-eye smile arches (Image 4 style)
              <>
                <Path
                  d="M 32,48 Q 36,43 40,48"
                  fill="transparent"
                  stroke="#4A3B32"
                  strokeWidth={2.8}
                  strokeLinecap="round"
                />
                <Path
                  d="M 60,48 Q 64,43 68,48"
                  fill="transparent"
                  stroke="#4A3B32"
                  strokeWidth={2.8}
                  strokeLinecap="round"
                />
                {currentState === 'grad_sweat' && (
                  <Path
                    d="M 28,38 C 26,40 26,42 28,44 C 30,44 30,42 28,38"
                    fill="#60A5FA"
                    stroke="#4A3B32"
                    strokeWidth={0.8}
                  />
                )}
              </>
            ) : currentState === 'angry_coding' ? (
              // Determined shiny eyes with angry eyebrows
              <>
                <Path d="M 31,39 L 39,43" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" />
                <Path d="M 69,39 L 61,43" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" />
                <G>
                  <AnimatedEllipse
                    cx="35"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="33.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="36.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
                <G>
                  <AnimatedEllipse
                    cx="65"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="63.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="66.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
              </>
             ) : currentState === 'superman_fly' ? (
              // Ambitious looking-up eyes and determined eyebrows
              <>
                {/* Ambitious tilted eyebrows */}
                <Path d="M 31,40 L 39,42" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" />
                <Path d="M 69,40 L 61,42" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" />
                <G>
                  <AnimatedEllipse
                    cx="35"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="33.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="36.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
                <G>
                  <AnimatedEllipse
                    cx="65"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="63.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="66.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
              </>

            ) : currentState === 'loading' ? (
              // Winking / Inspecting Close-up Eye (Left eye winks, Right eye open shiny with lens)
              <>
                {/* Winking Left eyebrow / eye arches */}
                <Path d="M 31,37 Q 35,33 39,36" fill="none" stroke="#4A3B32" strokeWidth={2.2} strokeLinecap="round" />
                <Path d="M 29,48 Q 35,53 41,48" fill="none" stroke="#4A3B32" strokeWidth={2.8} strokeLinecap="round" />
                
                {/* Right eyebrow and open shiny eye */}
                <Path d="M 69,36 Q 65,33 61,35" fill="none" stroke="#4A3B32" strokeWidth={2.2} strokeLinecap="round" />
                <G>
                  <Circle cx="64" cy="46" r="5.5" fill="#4A3B32" />
                  <Circle cx="62.2" cy="44.2" r="1.8" fill="#FFFFFF" />
                  <Circle cx="65.8" cy="47.8" r="0.9" fill="#FFFFFF" />
                </G>
              </>
            ) : (currentState === 'thinking' || currentState === 'onboarding') ? (
              // Winking cute eyes (Image 5 style winking finger hearts)
              <>
                {/* Left eye winking (>) */}
                <Path d="M 31,44 L 37,47 L 31,50" fill="none" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                
                {/* Right eye open shiny */}
                <G>
                  <Circle cx="65" cy="46" r="4.5" fill="#4A3B32" />
                  <Circle cx="63.5" cy="44.5" r="1.5" fill="#FFFFFF" />
                  <Circle cx="66.5" cy="47.5" r="0.7" fill="#FFFFFF" />
                </G>
              </>
            ) : currentState === 'completion' ? (
              // Upgraded completion eyes: Gentle shiny dots and white highlights (matches your reference image perfectly!)
              <>
                <G>
                  <AnimatedEllipse
                    cx="35"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="33.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="36.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
                <G>
                  <AnimatedEllipse
                    cx="65"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="63.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="66.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
              </>
            ) : currentState === 'cute_sad' ? (
              // Pleading, shiny eyes 🥺
              <>
                {/* Pleading slanted eyebrows */}
                <Path d="M 29,42 Q 34,39 39,39" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" fill="none" />
                <Path d="M 71,42 Q 66,39 61,39" stroke="#4A3B32" strokeWidth={2.5} strokeLinecap="round" fill="none" />
                <G>
                  <AnimatedEllipse
                    cx="35"
                    cy="46"
                    rx={5.0}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="33.2"
                    cy="43.5"
                    r={2.2}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="36.5"
                    cy="48.5"
                    r={1.2}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
                <G>
                  <AnimatedEllipse
                    cx="65"
                    cy="46"
                    rx={5.0}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="63.2"
                    cy="43.5"
                    r={2.2}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="66.5"
                    cy="48.5"
                    r={1.2}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
              </>
            ) : (
              // Normal shiny dot eyes (blinking accelerated on UI thread)
              <>
                <G>
                  <AnimatedEllipse
                    cx="35"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="33.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="36.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
                <G>
                  <AnimatedEllipse
                    cx="65"
                    cy="46"
                    rx={4.5}
                    animatedProps={eyeProps}
                    fill="#4A3B32"
                  />
                  <AnimatedCircle
                    cx="63.5"
                    cy="44.5"
                    r={1.5}
                    animatedProps={eyeHighlightProps}
                    fill="#FFFFFF"
                  />
                  <AnimatedCircle
                    cx="66.5"
                    cy="47.5"
                    r={0.7}
                    animatedProps={eyeSubHighlightProps}
                    fill="#FFFFFF"
                  />
                </G>
              </>
            )}

            {/* --- SPECS (FOCUSED STATE - DROPS DOWN FLUIDLY) --- */}
            <AnimatedG animatedProps={focusedProps}>
              <Circle cx="35" cy="46" r="7.5" fill="rgba(74,59,50,0.03)" stroke="#4A3B32" strokeWidth={1.8} />
              <Circle cx="65" cy="46" r="7.5" fill="rgba(74,59,50,0.03)" stroke="#4A3B32" strokeWidth={1.8} />
              <Path d="M 42.5,46 L 57.5,46" stroke="#4A3B32" strokeWidth={1.8} />
            </AnimatedG>

            {(currentState === 'grad_reew' || currentState === 'grad_sweat') && (
              <G>
                {/* Left lens frame */}
                <Circle cx="35" cy="47" r="9" fill="rgba(74,59,50,0.05)" stroke="#4A3B32" strokeWidth={2.0} />
                {/* Right lens frame */}
                <Circle cx="65" cy="47" r="9" fill="rgba(74,59,50,0.05)" stroke="#4A3B32" strokeWidth={2.0} />
                {/* Bridge */}
                <Path d="M 44,47 Q 50,44 56,47" fill="none" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
                {/* Temple extensions (sides of glasses) */}
                <Path d="M 26,47 L 19,47" fill="none" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
                <Path d="M 74,47 L 81,47" fill="none" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
                {/* Glass reflections/shines */}
                <Path d="M 31,43 Q 35,39 39,43" fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.6} strokeLinecap="round" />
                <Path d="M 61,43 Q 65,39 69,43" fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.6} strokeLinecap="round" />
              </G>
            )}

            {/* --- STUDIOUS WOODEN DESK (STAYS STILL IN FRONT) --- */}
            <AnimatedG animatedProps={loadingProps}>
              {/* Wooden desk surface */}
              <Rect x="-10" y="68" width="120" height="28" fill="#8D5B4C" stroke="#4A3B32" strokeWidth={2.4} />
              {/* Desk wood grain lines */}
              <Path d="M 5,72 L 25,72 M 80,72 L 95,72" stroke="#6E473B" strokeWidth={1.2} strokeLinecap="round" />
            </AnimatedG>

            {/* Magnifying glass scales inside absolute overlay outside Svg */}

            {/* --- CUTE SMILES --- */}
            {(currentState === 'happy' || currentState === 'celebrating' || currentState === 'note_stack' || currentState === 'coffee_break' || currentState === 'quiz_time' || currentState === 'engineer_reew' || currentState === 'grad_reew' || currentState === 'grad_sweat' || currentState === 'dj_reew') ? (
              // Big open happy mouth with tongue (Image 4 style)
              <G>
                <Path
                  d="M 46,49 Q 50,56 54,49 Z"
                  fill="#4A3B32"
                />
                <Path
                  d="M 47.5,51.5 Q 50,55.5 52.5,51.5 Z"
                  fill="#FF8E9E"
                />
              </G>
            ) : currentState === 'blep' ? (
              // Cute w-mouth with a pink tongue sticking out! (Image 1 style)
              <G>
                <Path
                  d="M 46,49 Q 48,51.2 50,49 Q 52,51.2 54,49"
                  fill="transparent"
                  stroke="#4A3B32"
                  strokeWidth={2.0}
                  strokeLinecap="round"
                />
                <Path
                  d="M 48.5,50 Q 50,56 51.5,50 Z"
                  fill="#FF8E9E"
                  stroke="#4A3B32"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </G>
            ) : (currentState === 'sleeping' || currentState === 'pillow_scroll') ? (
              // Sleepy little smile
              <Path
                d="M 47,50 Q 50,52 53,50"
                fill="transparent"
                stroke="#4A3B32"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            ) : currentState === 'tutorial_tired' ? (
              // Small sad panting mouth
              <Path
                d="M 47,51 Q 50,54 53,51 Z"
                fill="#4A3B32"
                stroke="#4A3B32"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ) : currentState === 'loading' ? (
              // Cute winking w-mouth
              <Path
                d="M 46,49 Q 48,51.2 50,49 Q 52,51.2 54,49"
                fill="transparent"
                stroke="#4A3B32"
                strokeWidth={2.0}
                strokeLinecap="round"
              />

            ) : currentState === 'smirk' ? (
              // Grinning mouth showing teeth (😁 style)
              <G>
                {/* Mouth opening */}
                <Path
                  d="M 45,49 Q 50,57 55,49 Z"
                  fill="#4A3B32"
                />
                {/* White teeth bar at the top */}
                <Path
                  d="M 46,49.5 L 54,49.5 Q 50,52.5 46,49.5 Z"
                  fill="#FFFFFF"
                />
                {/* Pink tongue at the bottom */}
                <Path
                  d="M 48.5,53 Q 50,56.5 51.5,53 Z"
                  fill="#FF8E9E"
                />
              </G>
            ) : currentState === 'cute_sad' ? (
              // Small cute sad frown mouth
              <Path
                d="M 46.5,52 Q 50,49.5 53.5,52"
                fill="transparent"
                stroke="#4A3B32"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            ) : currentState === 'completion' ? (
              // Signature cute w-mouth matching reference image
              <Path
                d="M 46,49 Q 48,51.2 50,49 Q 52,51.2 54,49"
                fill="transparent"
                stroke="#4A3B32"
                strokeWidth={2.0}
                strokeLinecap="round"
              />
            ) : (
              // Signature "w" mouth (Image 2 style)
              <Path
                d="M 46,49 Q 48,51.2 50,49 Q 52,51.2 54,49"
                fill="transparent"
                stroke="#4A3B32"
                strokeWidth={2.0}
                strokeLinecap="round"
              />
            )}
            </G>

            {/* Sweat drops for tutorial_tired */}
            <AnimatedG animatedProps={sweatProps}>
              {/* Sweat drop 1 */}
              <Path
                d="M 75,34 C 73,36 73,38 75,40 C 77,40 77,38 75,34"
                fill="#60A5FA"
                stroke="#4A3B32"
                strokeWidth={0.8}
              />
              {/* Sweat drop 2 */}
              <Path
                d="M 79,38 C 77,40 77,42 79,44 C 81,44 81,42 79,38"
                fill="#60A5FA"
                stroke="#4A3B32"
                strokeWidth={0.8}
              />
            </AnimatedG>
            </G>

            {/* --- TINY STUBBY HANDS / PAWS (COMIC STYLED) --- */}
            {(currentState === 'sleeping' || currentState === 'pillow_scroll') ? (
              <>
                <Circle cx="32" cy="78" r="4.5" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                <Circle cx="68" cy="78" r="4.5" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            ) : (currentState === 'completion' || currentState === 'knocked_out') ? (
              // Hands are rendered inside the overlay, so we skip default arms entirely!
              null
            ) : currentState === 'loading' ? (
              // Left paw resting cutely, Right paw is drawn inside the loading group overlay so we skip it here!
              <>
                <Circle cx="29" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            ) : (currentState === 'happy' || currentState === 'celebrating' || currentState === 'coffee_coding' || currentState === 'angry_coding' || currentState === 'coffee_break' || currentState === 'quiz_time' || currentState === 'flashcards' || currentState === 'note_stack' || currentState === 'searching') ? (
              // Excited / clutching hands in center (Image 1 and 4 style)
              <>
                <AnimatedCircle cx="44" cy="72" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} animatedProps={leftPawProps} />
                <AnimatedCircle cx="56" cy="72" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} animatedProps={rightPawProps} />
              </>
            ) : (currentState === 'thinking' || currentState === 'onboarding') ? (
              // One hand up winking (Image 5 style finger hearts)
              <>
                <AnimatedCircle cx="40" cy="70" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} animatedProps={leftPawProps} />
                <Circle cx="68" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            ) : currentState === 'skipping' ? (
              // Skipping open arms pose (Image 2 style)
              <>
                <Circle cx="23" cy="73" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                <Circle cx="77" cy="73" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            ) : (currentState === 'blep' || currentState === 'v_fingers') ? (
              // Peace Sign hand gesture next to cheek (Image 1 style)
              <>
                {/* Left hand resting cutely */}
                <Circle cx="29" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                
                {/* Right hand raised doing peace sign next to right cheek */}
                <G transform="translate(68, 54)">
                  <Circle cx="2" cy="2" r="4.5" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                  {/* Two tiny V-fingers outlines */}
                  <Ellipse cx="0.5" cy="-3.5" rx="1.6" ry="3.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                  <Ellipse cx="4.5" cy="-3.5" rx="1.6" ry="3.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </G>
              </>
            ) : currentState === 'superman_fly' ? (
              <>
                {/* Left hand resting at the side */}
                <Circle cx="26" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                
                {/* Right hand raised straight up above the shoulder */}
                <Path d="M 72,70 L 78,48" stroke="#4A3B32" strokeWidth={5.0} strokeLinecap="round" />
                <Path d="M 72,70 L 78,48" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
                <Circle cx="78" cy="48" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            ) : currentState === 'tutorial_walk' ? (
              <>
                {/* Running arms: left arm moves up/down, right arm moves out of phase */}
                <AnimatedCircle cx="26" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} animatedProps={leftPawProps} />
                <AnimatedCircle cx="74" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} animatedProps={rightPawProps} />
              </>
            ) : currentState === 'sort_reew' ? (
              <>
                {/* Right Paw holding the sliding card is rendered FIRST so it slides behind the folder */}
                <AnimatedG animatedProps={rightPawProps}>
                  {/* Revision Card */}
                  <Rect x="65" y="65" width="18" height="12" rx="1.5" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={1.5} />
                  <Path d="M 69,69 L 79,69 M 69,73 L 75,73" stroke="#94A3B8" strokeWidth={1.2} strokeLinecap="round" />
                  {/* Paw */}
                  <Circle cx="74" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </AnimatedG>

                {/* Left Paw holding the folder is rendered SECOND (on top) */}
                <AnimatedG animatedProps={leftPawProps}>
                  {/* Folder paper peaking out */}
                  <Rect x="17" y="62" width="18" height="10" rx="1" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={1.0} />
                  {/* Folder body */}
                  <Path d="M 14,66 L 22,66 L 25,69 L 38,69 L 38,81 L 14,81 Z" fill="#8B5CF6" stroke="#4A3B32" strokeWidth={1.5} strokeLinejoin="round" />
                  {/* Paw */}
                  <Circle cx="26" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </AnimatedG>
              </>
            ) : currentState === 'engineer_reew' ? (
              <>
                {/* Asymmetric waving hands holding tools */}
                <AnimatedG animatedProps={leftPawProps}>
                  {/* Screwdriver Handle: orange safety handle */}
                  <Rect x="23" y="60" width="6" height="11" rx="1.5" fill="#F97316" stroke="#4A3B32" strokeWidth={1.5} />
                  {/* Screwdriver metal shaft */}
                  <Path d="M 26,60 L 26,49" stroke="#94A3B8" strokeWidth={2.0} strokeLinecap="round" />
                  <Path d="M 26,60 L 26,49" stroke="#4A3B32" strokeWidth={0.8} />
                  {/* Tip */}
                  <Path d="M 24.5,49 L 27.5,49" stroke="#4A3B32" strokeWidth={1.2} />
                  {/* Paw */}
                  <Circle cx="26" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </AnimatedG>

                <AnimatedG animatedProps={rightPawProps}>
                  {/* Scissor Jack tool in right hand */}
                  {/* Base */}
                  <Path d="M 70,65 L 78,65" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
                  {/* Diamond structure */}
                  <Path d="M 74,65 L 70,59 L 74,53 L 78,59 Z" fill="#94A3B8" stroke="#4A3B32" strokeWidth={1.5} strokeLinejoin="round" />
                  {/* Center screw */}
                  <Path d="M 68,59 L 80,59" stroke="#4A3B32" strokeWidth={1.2} />
                  {/* Jack top saddle */}
                  <Path d="M 72,53 L 76,53" stroke="#4A3B32" strokeWidth={2.0} strokeLinecap="round" />
                  {/* Right Paw holding the jack */}
                  <Circle cx="74" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </AnimatedG>
              </>
            ) : (currentState === 'grad_reew' || currentState === 'grad_sweat') ? (
              <>
                {/* Left hand holding a degree scroll */}
                <G>
                  {/* Tilted white degree scroll roll */}
                  <Rect
                    x="18"
                    y="63"
                    width="14"
                    height="7"
                    rx="1.5"
                    transform="rotate(-25, 25, 66)"
                    fill="#FFFFFF"
                    stroke="#4A3B32"
                    strokeWidth={1.5}
                  />
                  {/* Red ribbon tied around scroll */}
                  <Rect
                    x="23"
                    y="63"
                    width="3.5"
                    height="7"
                    transform="rotate(-25, 25, 66)"
                    fill="#EF4444"
                  />
                  {/* Left Paw holding it */}
                  <Circle cx="26" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </G>

                {/* Right hand raised doing peace sign next to right cheek */}
                <G transform="translate(68, 54)">
                  <Circle cx="2" cy="2" r="4.5" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                  {/* Two tiny V-fingers outlines */}
                  <Ellipse cx="0.5" cy="-3.5" rx="1.6" ry="3.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                  <Ellipse cx="4.5" cy="-3.5" rx="1.6" ry="3.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </G>
              </>
            ) : currentState === 'dj_reew' ? (
              <>
                {/* Left hand holding playlist folder */}
                <G>
                  {/* Tilted pink binder folder */}
                  <Rect
                    x="18"
                    y="60"
                    width="14"
                    height="18"
                    rx="2"
                    transform="rotate(-15, 25, 69)"
                    fill="#EC4899"
                    stroke="#4A3B32"
                    strokeWidth={2.0}
                  />
                  {/* Music note symbol inside folder */}
                  {/* Circle note head */}
                  <Circle
                    cx="23"
                    cy="72"
                    r="2.0"
                    transform="rotate(-15, 25, 69)"
                    fill="#FFFFFF"
                  />
                  {/* Note stem */}
                  <Path
                    d="M 25,72 L 25,66 Q 28,68 30,66"
                    transform="rotate(-15, 25, 69)"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  {/* Left Paw holding it */}
                  <Circle cx="26" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                </G>

                {/* Right hand resting/clutching side */}
                <Circle cx="74" cy="71" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            ) : (
              // Standard sitting arms (Image 2 style)
              <>
                <Circle cx="29" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
                <Circle cx="71" cy="74" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
              </>
            )}
          </Svg>

          {/* Absolute overlay for the magnifying glass and hand so they scale perfectly on the native UI thread */}
          <Animated.View style={[StyleSheet.absoluteFill, lensAnimatedStyle]} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="12 10 76 76">
              {/* Magnifying glass handle connected to the hand */}
              <Path d="M 72.5,54.5 L 68,66" stroke="#8B5CF6" strokeWidth={2.5} strokeLinecap="round" />
              {/* Big purple translucent glass lens */}
              <Circle cx="64" cy="46" r="12" fill="rgba(139, 92, 246, 0.08)" stroke="#8B5CF6" strokeWidth={2.2} />
              {/* Glass shine highlights */}
              <Path d="M 58,40 Q 64,36 69,41" fill="none" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
              <Path d="M 59,51 Q 64,55 69,50" fill="none" stroke="#FFFFFF" strokeWidth={0.8} strokeLinecap="round" opacity={0.5} />
              
              {/* Right paw holding the handle */}
              <Circle cx="68" cy="68" r="5.0" fill="#FFFFFF" stroke="#4A3B32" strokeWidth={2.0} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  zzzContainer: {
    position: 'absolute',
    top: -24,
    right: -10,
    width: 30,
    height: 30,
  },
  zzz: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderTopWidth: 2.0,
    borderRightWidth: 2.0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderColor: '#4A3B32',
    opacity: 0.5,
    transform: [{ rotate: '45deg' }],
  },
});
