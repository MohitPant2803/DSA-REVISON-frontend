import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeInDown,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { hapticFeedback } from '@/utils/haptics';
import { CheckCircle, ShieldAlert, ArrowUp } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const CARDS_DATA = [
  {
    title: 'Two Sum Problem',
    complexity: 'O(N) Time • O(N) Space',
    solution: 'Use a Hash Map to record indices of visited numbers and check target complements in constant time.',
    difficulty: 'Easy',
    color: '#10B981',
  },
  {
    title: 'Reverse Linked List',
    complexity: 'O(N) Time • O(1) Space',
    solution: 'Iterate through the list shifting pointers: next = curr.next; curr.next = prev; prev = curr; curr = next;',
    difficulty: 'Medium',
    color: '#F59E0B',
  },
];

export function ReelsDemo() {
  const [cardIndex, setCardIndex] = useState(0);
  const currentData = CARDS_DATA[cardIndex];

  // Gestures Shared Values
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  // Triggered when swipe up completes
  const handleCardDismiss = () => {
    // Light notification haptic on complete
    hapticFeedback.success();

    // Toggle problem details
    setCardIndex((prev) => (prev + 1) % CARDS_DATA.length);

    // Bounce the new card in from the bottom
    translateY.value = 180;
    scale.value = 0.9;
    opacity.value = 0;

    translateY.value = withSpring(0, springPresets.bouncy);
    scale.value = withSpring(1.0, springPresets.bouncy);
    opacity.value = withTiming(1.0, { duration: 300 });
  };

  // Pan gesture definition
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Allow swiping upwards freely, resist downward drags
      if (e.translationY < 0) {
        translateY.value = e.translationY;
      } else {
        translateY.value = e.translationY * 0.35; // Springy drag resistance
      }
      scale.value = 1 - Math.min(Math.abs(e.translationY) / 1000, 0.08);
    })
    .onEnd((e) => {
      // Trigger card eject if user dragged upwards fast or far enough
      if (e.translationY < -110 || e.velocityY < -700) {
        translateY.value = withTiming(-400, { duration: 250 }, () => {
          runOnJS(handleCardDismiss)();
        });
        opacity.value = withTiming(0, { duration: 200 });
      } else {
        // Dynamic snap back to resting spot
        translateY.value = withSpring(0, springPresets.snappy);
        scale.value = withSpring(1, springPresets.snappy);
        runOnJS(hapticFeedback.impactLight)();
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const arrowAnimatedStyle = useAnimatedStyle(() => {
    // Make hint indicator bounce based on pull distance
    const offset = Math.min(Math.abs(translateY.value) * 0.15, 12);
    return {
      transform: [{ translateY: -offset }],
    };
  });

  return (
    <View style={styles.container}>
      {/* Narrative Stagger */}
      <Animated.View entering={FadeInDown.duration(800)} style={styles.textBlock}>
        <Text style={styles.tag}>MICRO REVISION</Text>
        <Text style={styles.title}>Reels for Algorithms.</Text>
        <Text style={styles.titleHighlight}>Zero Friction.</Text>
        <Text style={styles.desc}>
          Revision shouldn't require setting up IDEs. Swipe through clean coding cards and refresh your mental models instantly.
        </Text>
      </Animated.View>

      {/* Swipe Indicator Tip */}
      <Animated.View style={[styles.tipRow, arrowAnimatedStyle]}>
        <ArrowUp color="#8B5CF6" size={16} />
        <Text style={styles.tipText}>Swipe up on card to revise</Text>
      </Animated.View>

      {/* Interactive Drag Portal */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.cardWrapper, cardAnimatedStyle]}>
          <GlassPanel style={styles.card} intensity={16} tint="dark">
            <View style={styles.cardTop}>
              <View style={[styles.diffBadge, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: currentData.color }]}>
                <Text style={[styles.diffText, { color: currentData.color }]}>{currentData.difficulty}</Text>
              </View>
              <Text style={styles.complexity}>{currentData.complexity}</Text>
            </View>

            <Text style={styles.cardTitle}>{currentData.title}</Text>
            <Text style={styles.solutionText}>{currentData.solution}</Text>

            <View style={styles.cardFooter}>
              <CheckCircle color="#8B5CF6" size={16} />
              <Text style={styles.activeRecallLabel}>Active recall in 60s</Text>
            </View>
          </GlassPanel>
        </Animated.View>
      </GestureDetector>
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
    marginBottom: 24,
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
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    opacity: 0.8,
  },
  tipText: {
    color: '#8B5CF6',
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '500',
  },
  cardWrapper: {
    width: width - 64,
    height: 250,
  },
  card: {
    padding: 24,
    height: '100%',
    justifyContent: 'space-between',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diffBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  diffText: {
    fontSize: 12,
    fontWeight: '600',
  },
  complexity: {
    color: '#64748B',
    fontSize: 13,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'normal',
    marginTop: 12,
  },
  solutionText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 12,
  },
  activeRecallLabel: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },
});
