import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { SuperchargedPressable } from '../motion/SuperchargedPressable';
import { hapticFeedback } from '@/utils/haptics';
import { ArrowLeftRight, ArrowUp, Sparkles, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

interface FirstFeedTutorialProps {
  onDismiss: () => void;
}

export function FirstFeedTutorial({ onDismiss }: FirstFeedTutorialProps) {
  const [step, setStep] = useState(0); // 0: Swipe Left/Right (Slides), 1: Swipe Up (Next card)

  // Reanimated shared values
  const overlayOpacity = useSharedValue(1);
  
  // Floating finger offsets
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const fingerOpacity = useSharedValue(0.7);

  useEffect(() => {
    runGestureSimulation();
  }, [step]);

  const runGestureSimulation = () => {
    // Reset finger anchors
    fingerX.value = 0;
    fingerY.value = 0;
    fingerOpacity.value = 0.7;

    if (step === 0) {
      // Horizontal swipe hand glide (drift left and fade out)
      fingerX.value = withRepeat(
        withSequence(
          withTiming(-120, { duration: 1600 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      // Vertical swipe hand glide (drift up and fade out)
      fingerY.value = withRepeat(
        withSequence(
          withTiming(-120, { duration: 1600 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    }
  };

  const handleNextStep = async () => {
    hapticFeedback.selection();
    if (step === 0) {
      setStep(1);
    } else {
      // Save tutorial complete state locally
      try {
        await AsyncStorage.setItem('dsa-reels-tutorial-complete', 'true');
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

  const fingerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fingerX.value },
      { translateY: fingerY.value },
    ],
    opacity: fingerOpacity.value,
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, overlayAnimatedStyle]} pointerEvents="box-none">
      
      {/* Dimmed backdrop covering reels background */}
      <View style={styles.backdrop} />

      <View style={styles.portal}>
        
        {/* Layered Onboarding Tips */}
        {step === 0 ? (
          <GlassPanel key="step0" style={styles.tutorialPanel} intensity={18} tint="dark">
            <View style={styles.header}>
              <ArrowLeftRight color="#8B5CF6" size={20} />
              <Text style={styles.title}>EXPLANATION SLIDES</Text>
            </View>
            <Text style={styles.desc}>
              Swipe left or right on a revision card to open code walkthroughs, trace dry runs, and active recall summaries.
            </Text>

            {/* Gesture Visual teaching hand */}
            <View style={styles.gestureBox}>
              <Animated.View style={[styles.fingerIcon, fingerAnimatedStyle]}>
                <Text style={styles.fingerEmoji}>👈</Text>
              </Animated.View>
              <View style={styles.dragTrackHorizontal} />
            </View>

            <SuperchargedPressable onPress={handleNextStep} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Understand Gesture</Text>
            </SuperchargedPressable>
          </GlassPanel>
        ) : (
          <GlassPanel key="step1" style={styles.tutorialPanel} intensity={18} tint="dark">
            <View style={styles.header}>
              <ArrowUp color="#8B5CF6" size={20} />
              <Text style={styles.title}>SWIPE NEXT ALGORITHM</Text>
            </View>
            <Text style={styles.desc}>
              Once you finish reviewing, swipe upwards on the card to classify difficulty and move onto your next prioritized algorithm.
            </Text>

            {/* Gesture vertical visual hand */}
            <View style={styles.gestureBox}>
              <Animated.View style={[styles.fingerIcon, fingerAnimatedStyle]}>
                <Text style={styles.fingerEmoji}>👆</Text>
              </Animated.View>
              <View style={styles.dragTrackVertical} />
            </View>

            <SuperchargedPressable onPress={handleNextStep} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Begin active recall</Text>
            </SuperchargedPressable>
          </GlassPanel>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 15, 25, 0.75)', // matching background slate dark
  },
  portal: {
    width: width - 64,
    height: 340,
    zIndex: 1001,
  },
  tutorialPanel: {
    padding: 24,
    height: '100%',
    justifyContent: 'space-between',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginLeft: 8,
  },
  desc: {
    color: '#F8FAFC',
    fontSize: 15,
    lineHeight: 22,
  },
  gestureBox: {
    height: 90,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  fingerIcon: {
    position: 'absolute',
    zIndex: 5,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fingerEmoji: {
    fontSize: 32,
  },
  dragTrackHorizontal: {
    width: 180,
    height: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 1,
  },
  dragTrackVertical: {
    height: 80,
    width: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 1,
  },
  actionBtn: {
    backgroundColor: '#8B5CF6',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
});
