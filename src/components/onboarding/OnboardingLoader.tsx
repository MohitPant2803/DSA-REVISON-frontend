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
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { springPresets, easings } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { hapticFeedback } from '@/utils/haptics';
import { Sparkles, Folder, CheckCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export function OnboardingLoader() {
  const { preferences } = useOnboardingStore();
  const [progress, setProgress] = useState(0);
  const [logMessage, setLogMessage] = useState('Booting revision compilers...');
  
  // Visual tracking of card-fly states
  const [flyingCardIndex, setFlyingCardIndex] = useState(-1);

  // Reanimated Shared Values
  const haloRotation = useSharedValue(0);
  const haloScale = useSharedValue(0.85);

  // Micro cards fly translation values
  const card1X = useSharedValue(0);
  const card1Y = useSharedValue(0);
  const card1Scale = useSharedValue(1);
  const card1Opacity = useSharedValue(0);

  const card2X = useSharedValue(0);
  const card2Y = useSharedValue(0);
  const card2Scale = useSharedValue(1);
  const card2Opacity = useSharedValue(0);

  const folder1Scale = useSharedValue(1);
  const folder2Scale = useSharedValue(1);

  // Get their selected weak topics (fallback to generic if empty)
  const weak1 = preferences.weakTopics[0] || 'Dynamic Programming';
  const weak2 = preferences.weakTopics[1] || 'Graphs & Traversals';

  useEffect(() => {
    // 1. Continuous slow rotation of compiling halo
    haloRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: easings.cubicBezier }),
      -1,
      false
    );
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500 }),
        withTiming(0.85, { duration: 1500 })
      ),
      -1,
      true
    );

    // 2. Multi-stage personalized visual sorting sequence
    const runPersonalizedCompilation = async () => {
      // Stage 1: Load preferences (0ms - 800ms)
      setTimeout(() => {
        setProgress(20);
        setLogMessage(`Configuring ${preferences.skillLevel || 'intermediate'} recall track...`);
        hapticFeedback.impactLight();
      }, 700);

      // Stage 2: Seeding Topic 1 and flying card 1 (800ms - 2000ms)
      setTimeout(() => {
        setProgress(45);
        setLogMessage(`Structuring priority folder: ${weak1}...`);
        hapticFeedback.impactLight();
        
        // Fly Card 1 out to Folder 1 (Left folder)
        card1Opacity.value = withTiming(1.0, { duration: 100 });
        card1X.value = withSpring(-80, springPresets.bouncy);
        card1Y.value = withSpring(80, springPresets.bouncy);
        card1Scale.value = withSpring(0.4, springPresets.bouncy);

        setTimeout(() => {
          // Folder 1 absorption impact haptic
          folder1Scale.value = withSequence(
            withSpring(1.2, springPresets.stiff),
            withSpring(1.0, springPresets.bouncy)
          );
          hapticFeedback.success();
          card1Opacity.value = withTiming(0, { duration: 150 });
        }, 600);
      }, 1600);

      // Stage 3: Seeding Topic 2 and flying card 2 (2000ms - 3200ms)
      setTimeout(() => {
        setProgress(70);
        setLogMessage(`Structuring priority folder: ${weak2}...`);
        hapticFeedback.impactLight();

        // Fly Card 2 out to Folder 2 (Right folder)
        card2Opacity.value = withTiming(1.0, { duration: 100 });
        card2X.value = withSpring(80, springPresets.bouncy);
        card2Y.value = withSpring(80, springPresets.bouncy);
        card2Scale.value = withSpring(0.4, springPresets.bouncy);

        setTimeout(() => {
          // Folder 2 absorption impact
          folder2Scale.value = withSequence(
            withSpring(1.2, springPresets.stiff),
            withSpring(1.0, springPresets.bouncy)
          );
          hapticFeedback.success();
          card2Opacity.value = withTiming(0, { duration: 150 });
        }, 600);
      }, 2800);

      // Stage 4: Calibration (3200ms - 4200ms)
      setTimeout(() => {
        setProgress(90);
        setLogMessage('Calibrating active verbal GPT comparison feedback...');
        hapticFeedback.impactMedium();
      }, 3800);

      // Stage 5: Done (4200ms)
      setTimeout(() => {
        setProgress(100);
        setLogMessage('Revision system generated.');
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

  const card1AnimatedStyle = useAnimatedStyle(() => ({
    opacity: card1Opacity.value,
    transform: [
      { translateX: card1X.value },
      { translateY: card1Y.value },
      { scale: card1Scale.value },
    ],
  }));

  const card2AnimatedStyle = useAnimatedStyle(() => ({
    opacity: card2Opacity.value,
    transform: [
      { translateX: card2X.value },
      { translateY: card2Y.value },
      { scale: card2Scale.value },
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
          <Sparkles color="#8B5CF6" size={28} />
        </View>

        {/* Floating cards being sorted */}
        <Animated.View style={[styles.microCard, styles.cardRed, card1AnimatedStyle]}>
          <Text style={styles.microText}>DP</Text>
        </Animated.View>

        <Animated.View style={[styles.microCard, styles.cardGreen, card2AnimatedStyle]}>
          <Text style={styles.microText}>Graph</Text>
        </Animated.View>
      </View>

      {/* Playlist Folders visual compiling */}
      <View style={styles.foldersRow}>
        <Animated.View style={[styles.folderPlate, folder1AnimatedStyle]}>
          <GlassPanel style={styles.folderGlass} intensity={14} tint="dark">
            <Folder color="#8B5CF6" size={18} />
            <Text style={styles.folderName} numberOfLines={1}>
              {weak1}
            </Text>
          </GlassPanel>
        </Animated.View>

        <Animated.View style={[styles.folderPlate, folder2AnimatedStyle]}>
          <GlassPanel style={styles.folderGlass} intensity={14} tint="dark">
            <Folder color="#6366F1" size={18} />
            <Text style={styles.folderName} numberOfLines={1}>
              {weak2}
            </Text>
          </GlassPanel>
        </Animated.View>
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
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 32,
  },
  haloRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: '#8B5CF6',
    borderStyle: 'dashed',
    opacity: 0.35,
  },
  coreBranding: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  microCard: {
    position: 'absolute',
    width: 54,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    zIndex: 2,
  },
  cardRed: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8B5CF6',
  },
  cardGreen: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: '#6366F1',
  },
  microText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: 'bold',
  },
  foldersRow: {
    flexDirection: 'row',
    width: width - 64,
    justifyContent: 'space-between',
    marginBottom: 44,
  },
  folderPlate: {
    width: (width - 80) / 2,
    height: 64,
  },
  folderGlass: {
    padding: 12,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  folderName: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  loggerBlock: {
    width: width - 64,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    color: '#64748B',
    fontSize: 14,
  },
  logTextSuccess: {
    color: '#10B981',
    fontWeight: '500',
  },
});
