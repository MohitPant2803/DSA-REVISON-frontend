import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { Bookmark, AlertCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const FORGOTTEN_CARDS = [
  { title: 'Merge K Sorted Lists', topic: 'Heaps / Divide & Conquer', delay: 200, color: '#8B5CF6' },
  { title: 'LRU Cache Design', topic: 'Design / Doubly Linked List', delay: 700, color: '#6366F1' },
  { title: 'Binary Tree Path Sum III', topic: 'Depth First Search', delay: 1200, color: '#3B82F6' },
];

export function EmotionalHook() {
  return (
    <View style={styles.container}>
      {/* Narrative Stagger */}
      <Animated.View entering={FadeInDown.duration(800)} style={styles.textBlock}>
        <Text style={styles.tag}>THE COLD TRUTH</Text>
        <Text style={styles.title}>You solved it once.</Text>
        <Text style={styles.titleHighlight}>Then forgot it.</Text>
        <Text style={styles.desc}>
          Bookmarks become clutter. Memories fade into digital dust. Revision needs to be fluid.
        </Text>
      </Animated.View>

      {/* Floating Card Stack */}
      <View style={styles.stackContainer}>
        {FORGOTTEN_CARDS.map((card, idx) => (
          <DissolvingCard key={card.title} card={card} index={idx} />
        ))}
      </View>
    </View>
  );
}

interface CardProps {
  card: typeof FORGOTTEN_CARDS[0];
  index: number;
}

function DissolvingCard({ card, index }: CardProps) {
  // Animation offsets
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(index * -16);
  const scale = useSharedValue(1 - index * 0.05);
  const rotate = useSharedValue(index * -2);
  const blur = useSharedValue(0);

  useEffect(() => {
    // Dissolving trigger delayed by card index
    const triggerDelay = 1000 + card.delay;

    // Slide up, drift horizontally, rotate away, and fade out
    translateY.value = withDelay(
      triggerDelay,
      withSpring(-120 - index * 20, { damping: 25, stiffness: 40 })
    );
    
    rotate.value = withDelay(
      triggerDelay,
      withSpring(index * 6 + (Math.random() * 8 - 4), { damping: 22, stiffness: 35 })
    );

    opacity.value = withDelay(
      triggerDelay,
      withTiming(0, { duration: 1500 })
    );
    
    scale.value = withDelay(
      triggerDelay,
      withSpring(0.85, { damping: 20, stiffness: 30 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.cardWrapper, { zIndex: 10 - index }, animatedStyle]}>
      <GlassPanel style={styles.card} intensity={12} tint="dark">
        <View style={styles.cardHeader}>
          <View style={[styles.topicDot, { backgroundColor: card.color }]} />
          <Text style={styles.cardTopic}>{card.topic}</Text>
          <Bookmark color="rgba(255,255,255,0.2)" size={16} style={styles.bookmark} />
        </View>
        <Text style={styles.cardTitle}>{card.title}</Text>
        
        {/* Dissolve State Indicator */}
        <View style={styles.fadingRow}>
          <AlertCircle color="#64748B" size={13} />
          <Text style={styles.fadingText}>Fading from active memory...</Text>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 48,
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
    paddingHorizontal: 20,
  },
  stackContainer: {
    width: width - 80,
    height: 240,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
  },
  card: {
    padding: 20,
    height: 140,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topicDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  cardTopic: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  bookmark: {
    marginLeft: 'auto',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'normal',
    marginVertical: 12,
  },
  fadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
  },
  fadingText: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 6,
  },
});
