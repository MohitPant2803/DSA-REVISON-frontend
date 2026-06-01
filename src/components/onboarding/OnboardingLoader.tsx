import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { springPresets, easings } from '@/theme/motion';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { hapticFeedback } from '@/utils/haptics';
import { Sparkles, Folder, CheckCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const TOPICS = [
  { label: 'SDE', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.25)' },
  { label: 'Data', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)' },
  { label: 'Quant', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)' },
  { label: 'Product', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.25)' },
  { label: 'Case Studies', color: '#EA580C', bg: 'rgba(234, 88, 12, 0.08)', border: 'rgba(234, 88, 12, 0.25)' },
  { label: 'Guesstimates', color: '#10B981', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)' },
  { label: 'System Design', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.25)' },
  { label: 'DBMS', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)' },
  { label: 'CN', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)' }
];

interface FloatingTopicProps {
  label: string;
  color: string;
  bg: string;
  borderColor: string;
  index: number;
  total: number;
}

function FloatingTopic({ label, color, bg, borderColor, index, total }: FloatingTopicProps) {
  const angle = (index * 2 * Math.PI) / total;
  const radius = 96; // Orbit distance from center
  const posX = Math.cos(angle) * radius;
  const posY = Math.sin(angle) * radius;

  // Shared values for calm floating animation
  const tx = useSharedValue(posX);
  const ty = useSharedValue(posY);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // 1. Smooth, staggered fade-in based on index
    const staggerDelay = index * 180;
    scale.value = withDelay(staggerDelay, withSpring(1.0, { damping: 15, stiffness: 50 }));
    opacity.value = withDelay(staggerDelay, withTiming(0.95, { duration: 600 }));

    // 2. Continuous Calming float drift animation (sine-wave emulation using reanimated sequencing)
    const driftDuration = 2800 + (index * 220);
    const driftAmp = 6;

    tx.value = withRepeat(
      withSequence(
        withTiming(posX + Math.cos(angle) * driftAmp, { duration: driftDuration, easing: easings.cubicBezier }),
        withTiming(posX - Math.cos(angle) * driftAmp, { duration: driftDuration, easing: easings.cubicBezier })
      ),
      -1,
      true
    );

    ty.value = withRepeat(
      withSequence(
        withTiming(posY + Math.sin(angle) * driftAmp, { duration: driftDuration + 300, easing: easings.cubicBezier }),
        withTiming(posY - Math.sin(angle) * driftAmp, { duration: driftDuration + 300, easing: easings.cubicBezier })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View style={[styles.floatingTag, { backgroundColor: bg, borderColor: borderColor }, animatedStyle]}>
      <Text style={[styles.floatingTagText, { color: color }]}>{label}</Text>
    </Animated.View>
  );
}

export function OnboardingLoader() {
  const { preferences } = useOnboardingStore();
  const [progress, setProgress] = useState(0);
  const [logMessage, setLogMessage] = useState('Booting revision compilers...');

  // Reanimated Shared Values
  const haloRotation = useSharedValue(0);
  const haloScale = useSharedValue(0.85);

  const folder1Scale = useSharedValue(1);
  const folder2Scale = useSharedValue(1);

  useEffect(() => {
    // 1. Continuous slow rotation of compiling halo
    haloRotation.value = withRepeat(
      withTiming(360, { duration: 4000, easing: easings.cubicBezier }),
      -1,
      false
    );
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000 }),
        withTiming(0.85, { duration: 2000 })
      ),
      -1,
      true
    );

    // 2. Multi-stage personalized visual sorting sequence
    const runPersonalizedCompilation = async () => {
      // Stage 1: Load preferences (0ms - 800ms)
      setTimeout(() => {
        setProgress(15);
        setLogMessage('Synchronizing customized learning path...');
        hapticFeedback.impactLight();
      }, 600);

      // Stage 2: SDE, System Design, DBMS, CN
      setTimeout(() => {
        setProgress(40);
        setLogMessage('Mapping SDE Core: System Design, DBMS & Networks...');
        hapticFeedback.impactLight();
        
        folder1Scale.value = withSequence(
          withSpring(1.2, springPresets.stiff),
          withSpring(1.0, springPresets.bouncy)
        );
      }, 1500);

      // Stage 3: Data & Quant
      setTimeout(() => {
        setProgress(65);
        setLogMessage('Calibrating Data & Quant mathematical models...');
        hapticFeedback.impactLight();
      }, 2500);

      // Stage 4: Product, Case Studies, Guesstimates
      setTimeout(() => {
        setProgress(85);
        setLogMessage('Synthesizing Product, Case Studies & Guesstimates...');
        hapticFeedback.impactLight();
        
        folder2Scale.value = withSequence(
          withSpring(1.2, springPresets.stiff),
          withSpring(1.0, springPresets.bouncy)
        );
      }, 3500);

      // Stage 5: Done (4500ms)
      setTimeout(() => {
        setProgress(100);
        setLogMessage('Revision ecosystem fully compiled.');
        hapticFeedback.success();
      }, 4500);
    };

    runPersonalizedCompilation();
  }, []);

  // Animated styles
  const haloAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${haloRotation.value}deg` },
      { scale: haloScale.value },
    ],
  }));

  const folder1AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: folder1Scale.value }],
  }));

  const folder2AnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: folder2Scale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Iridescent compiler ring */}
      <View style={styles.compilerPortal}>
        <Animated.View style={[styles.haloRing, haloAnimatedStyle]} />
        <View style={styles.coreBranding}>
          <Sparkles color="#8B5CF6" size={28} strokeWidth={1.5} />
        </View>

        {/* Constellation of Calm Orbiting Topic Tags */}
        {TOPICS.map((topic, idx) => (
          <FloatingTopic
            key={topic.label}
            label={topic.label}
            color={topic.color}
            bg={topic.bg}
            borderColor={topic.border}
            index={idx}
            total={TOPICS.length}
          />
        ))}
      </View>


      {/* Dynamic Logger & Progress Bar */}
      <View style={styles.loggerBlock}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.logRow}>
          {progress === 100 ? (
            <CheckCircle color="#10B981" size={16} style={styles.checkIcon} />
          ) : (
            <ActivityIndicator color="#8B5CF6" size="small" style={styles.checkIcon} />
          )}
          <Text style={[styles.logText, progress === 100 && styles.logTextSuccess]}>
            {logMessage}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  compilerPortal: {
    width: 250,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 44,
  },
  haloRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: '#8B5CF6',
    borderStyle: 'dashed',
    opacity: 0.15,
  },
  coreBranding: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  floatingTag: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  floatingTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  foldersRow: {
    flexDirection: 'row',
    width: width - 64,
    justifyContent: 'space-between',
    marginBottom: 44,
  },
  folderPlate: {
    width: (width - 80) / 2,
    height: 56,
  },
  folderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    padding: 12,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  folderName: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 0,
  },
  loggerBlock: {
    width: width - 64,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    borderRadius: 2,
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    marginRight: 10,
  },
  logText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '500',
  },
  logTextSuccess: {
    color: '#10B981',
    fontWeight: 'bold',
  },
});
