import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { hapticFeedback } from '@/utils/haptics';
import { Mic, Brain, Sparkles, CheckCircle2, ChevronRight } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export function AIExplainDemo() {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'analyzing' | 'feedback'>('idle');
  const [speechText, setSpeechText] = useState('Touch to start speaking...');

  // Reanimated shared values
  const micScale = useSharedValue(1);
  const ring1Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.15);
  const ring2Scale = useSharedValue(1);
  const ring2Opacity = useSharedValue(0.08);

  const feedbackTranslateY = useSharedValue(150);
  const feedbackOpacity = useSharedValue(0);

  useEffect(() => {
    // Idle breathing pulse for central microphone ring
    micScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500 }),
        withTiming(1.0, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);

  const handleMicPress = () => {
    if (phase === 'idle') {
      // 1. Enter Recording state
      setPhase('recording');
      hapticFeedback.success(); // Tactile confirmation

      // Sound Wave loops (Pulsing concentric ripples)
      ring1Scale.value = withRepeat(
        withTiming(2.4, { duration: 1600 }),
        -1,
        false
      );
      ring1Opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 200 }),
          withTiming(0, { duration: 1400 })
        ),
        -1,
        false
      );

      ring2Scale.value = withRepeat(
        withDelay(600, withTiming(2.4, { duration: 1600 })),
        -1,
        false
      );
      ring2Opacity.value = withRepeat(
        withDelay(600, withSequence(
          withTiming(0.3, { duration: 200 }),
          withTiming(0, { duration: 1400 })
        )),
        -1,
        false
      );

      // Simulate rolling verbal speech inputs
      setSpeechText("I would design it with a doubly linked list...");
      setTimeout(() => {
        setSpeechText("...and a hash map to maintain O(1) page get and put operations.");
      }, 1500);

      // Automatically transition to analysis after 3 seconds
      setTimeout(() => {
        triggerAnalysis();
      }, 3500);
    }
  };

  const triggerAnalysis = () => {
    setPhase('analyzing');
    hapticFeedback.impactMedium();

    // Reset waves
    ring1Scale.value = withSpring(1);
    ring1Opacity.value = withTiming(0);
    ring2Scale.value = withSpring(1);
    ring2Opacity.value = withTiming(0);

    // Simulate AI computing comparisons
    setTimeout(() => {
      setPhase('feedback');
      hapticFeedback.success();

      // Spring feedback panel in beautifully
      feedbackTranslateY.value = withSpring(0, springPresets.gentle);
      feedbackOpacity.value = withTiming(1.0, { duration: 400 });
    }, 1800);
  };

  // Custom animated styles
  const micAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const ring1AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));

  const ring2AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const feedbackAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: feedbackTranslateY.value }],
    opacity: feedbackOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Narrative Stagger */}
      <Animated.View entering={FadeInDown.duration(800)} style={styles.textBlock}>
        <Text style={styles.tag}>HERO FEATURE</Text>
        <Text style={styles.title}>Explain to GPT.</Text>
        <Text style={styles.titleHighlight}>AI Recall.</Text>
        <Text style={styles.desc}>
          Active recall is scientific. Speak your algorithm intuition aloud. Our AI compares it against the optimal complexity tree instantly.
        </Text>
      </Animated.View>

      {/* Recording Portal */}
      <View style={styles.portal}>
        {phase !== 'feedback' && (
          <View style={styles.interactiveArea}>
            
            {/* Concentric soundwaves */}
            <Animated.View style={[styles.soundwaveRing, ring1AnimatedStyle]} />
            <Animated.View style={[styles.soundwaveRing, ring2AnimatedStyle]} />

            {/* Glowing Microphone button */}
            <TouchableOpacity activeOpacity={0.9} onPress={handleMicPress} disabled={phase !== 'idle'}>
              <Animated.View style={[styles.micButton, micAnimatedStyle, phase === 'recording' && styles.micButtonActive]}>
                {phase === 'analyzing' ? (
                  <ActivityIndicator color="#8B5CF6" size="large" />
                ) : (
                  <Mic color={phase === 'recording' ? '#EF4444' : '#F8FAFC'} size={32} strokeWidth={1.5} />
                )}
              </Animated.View>
            </TouchableOpacity>

            {/* Speech transcript bar */}
            <Animated.View entering={FadeInUp.delay(200)} style={styles.speechCard}>
              <Text style={[styles.speechText, phase === 'recording' && styles.speechTextActive]}>
                {speechText}
              </Text>
            </Animated.View>
          </View>
        )}

        {/* AI Comparison Panel */}
        {phase === 'feedback' && (
          <Animated.View style={[styles.feedbackWrapper, feedbackAnimatedStyle]}>
            <GlassPanel style={styles.feedbackPanel} intensity={18} tint="dark">
              <View style={styles.feedbackHeader}>
                <Sparkles color="#8B5CF6" size={16} />
                <Text style={styles.feedbackTitle}>GPT EVALUATION RESULT</Text>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>100% MATCH</Text>
                </View>
              </View>

              <View style={styles.comparisonGrid}>
                {/* Column 1: Intuition */}
                <View style={styles.gridCol}>
                  <Text style={styles.colLabel}>Your Explanation</Text>
                  <Text style={styles.colText}>HashMap + DoublyLinkedList O(1) Get/Put keys</Text>
                </View>

                {/* Arrow */}
                <View style={styles.dividerArrow}>
                  <ChevronRight color="rgba(255,255,255,0.15)" size={16} />
                </View>

                {/* Column 2: Optimal */}
                <View style={styles.gridCol}>
                  <Text style={styles.colLabel}>Optimal Reference</Text>
                  <Text style={styles.colText}>Sentinel nodes (Head/Tail), Map tracking pointers</Text>
                </View>
              </View>

              {/* Assessment Pop */}
              <View style={styles.assessmentRow}>
                <CheckCircle2 color="#10B981" size={18} />
                <Text style={styles.assessmentText}>Excellent. Perfect algorithmic coverage.</Text>
              </View>
            </GlassPanel>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  tag: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  title: {
    color: '#94A3B8',
    fontSize: 20,
    fontWeight: 'normal',
  },
  titleHighlight: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: 'normal',
    lineHeight: 46,
    marginTop: 4,
    marginBottom: 16,
    textAlign: 'center',
  },
  desc: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  portal: {
    width: width - 64,
    height: 290,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 12,
  },
  interactiveArea: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  soundwaveRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    zIndex: 1,
  },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  micButtonActive: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    shadowColor: '#EF4444',
  },
  speechCard: {
    marginTop: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
  },
  speechText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  speechTextActive: {
    color: '#F8FAFC',
  },
  feedbackWrapper: {
    width: '100%',
    height: '100%',
  },
  feedbackPanel: {
    padding: 20,
    height: '100%',
    justifyContent: 'space-between',
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedbackTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 1.0,
  },
  scoreBadge: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  scoreText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  comparisonGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  gridCol: {
    flex: 1,
  },
  colLabel: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
  },
  colText: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 18,
  },
  dividerArrow: {
    paddingHorizontal: 8,
  },
  assessmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 14,
    marginTop: 'auto',
  },
  assessmentText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },
});
