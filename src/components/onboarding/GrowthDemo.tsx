import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  FadeInDown,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { hapticFeedback } from '@/utils/haptics';
import { Sparkles, Calendar } from 'lucide-react-native';

const { width } = Dimensions.get('window');

// Grid dimensions for mini contribution calendar
const GRID_ROWS = 4;
const GRID_COLS = 7;

export function GrowthDemo() {
  const [streakCount, setStreakCount] = useState(4);
  const [hasTappedFlame, setHasTappedFlame] = useState(false);

  // Reanimated shared values
  const flameScale = useSharedValue(1);
  const flameGlow = useSharedValue(0.15);
  
  // Heatmap animation values
  const gridCells = Array.from({ length: GRID_ROWS * GRID_COLS }).map(() => useSharedValue(0));

  useEffect(() => {
    // 1. Breathe loops for the flame glow
    flameScale.value = withSpring(1.0, springPresets.liquid);

    // 2. Animate calendar blocks sequentially to simulate building streaks
    gridCells.forEach((cell, idx) => {
      // Stagger illumination speed
      cell.value = withDelay(
        500 + idx * 80,
        withTiming(1, { duration: 400 })
      );
    });
  }, []);

  const handleFlamePress = () => {
    if (hasTappedFlame) return;
    setHasTappedFlame(true);

    // Tactile notification on completing streak trigger
    hapticFeedback.success();

    // Trigger bouncy pop on flame
    flameScale.value = withSequence(
      withSpring(1.3, springPresets.stiff),
      withSpring(1.0, springPresets.bouncy)
    );

    // Increment count with spring roll
    setStreakCount(5);
  };

  const flameAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Narrative Stagger */}
      <Animated.View entering={FadeInDown.duration(800)} style={styles.textBlock}>
        <Text style={styles.tag}>CONSISTENCY LOOPS</Text>
        <Text style={styles.title}>5 Minutes Daily.</Text>
        <Text style={styles.titleHighlight}>Massive Streaks.</Text>
        <Text style={styles.desc}>
          Consistency beats cramming. Build a visual coding contribution graph that lights up neon green as you revision daily.
        </Text>
      </Animated.View>

      {/* Habits Streaker Module */}
      <View style={styles.habitsWrapper}>
        <GlassPanel style={styles.growthPanel} intensity={14} tint="dark">
          
          {/* Breathing Interactive Flame */}
          <TouchableOpacity activeOpacity={0.9} onPress={handleFlamePress} style={styles.flameButton}>
            <Animated.View style={[styles.flameContainer, flameAnimatedStyle]}>
              <Text style={styles.flameEmoji}>🔥</Text>
            </Animated.View>
            <Text style={styles.streakNumber}>{streakCount}</Text>
            <Text style={styles.streakLabel}>{hasTappedFlame ? "STREAK LOCKED IN!" : "TAP TO LOCK STREAK"}</Text>
          </TouchableOpacity>

          {/* Illuminating neon heatmap */}
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <Calendar color="#8B5CF6" size={14} />
              <Text style={styles.calendarTitle}>Revision Activity Heatmap</Text>
            </View>
            <View style={styles.grid}>
              {gridCells.map((cell, idx) => {
                // Determine a nice emerald/violet neon color pattern
                let color = 'rgba(255,255,255,0.04)'; // empty
                
                // Color mapping to show a beautiful active grid
                if (idx < 5) {
                  color = '#10B981'; // solid emerald completed
                } else if (idx >= 5 && idx < 12) {
                  color = '#8B5CF6'; // purple completed
                } else if (idx === 12 || idx === 13) {
                  color = 'rgba(139,92,246,0.3)'; // light purple
                } else if (idx === 14) {
                  color = '#3B82F6'; // blue
                }

                // Render dynamic opacity cell
                const cellAnimatedStyle = useAnimatedStyle(() => ({
                  opacity: cell.value,
                  transform: [{ scale: cell.value }],
                }));

                return (
                  <Animated.View
                    key={idx}
                    style={[
                      styles.cell,
                      { backgroundColor: color },
                      cellAnimatedStyle,
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </GlassPanel>
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
  habitsWrapper: {
    width: width - 64,
    height: 310,
    marginTop: 12,
  },
  growthPanel: {
    padding: 24,
    height: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flameButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 3,
  },
  flameEmoji: {
    fontSize: 34,
  },
  streakNumber: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 10,
  },
  streakLabel: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  calendarContainer: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  calendarTitle: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: -2,
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 3,
    margin: 2,
  },
});
