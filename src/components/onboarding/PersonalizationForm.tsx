import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInRight,
  FadeOutLeft,
} from 'react-native-reanimated';
import { springPresets } from '@/theme/motion';
import { GlassPanel } from '../motion/GlassPanel';
import { SuperchargedPressable } from '../motion/SuperchargedPressable';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { hapticFeedback } from '@/utils/haptics';
import { Check, Target, Brain, Award, Zap, Code } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const QUESTIONS = [
  {
    id: 'skillLevel',
    label: 'EXPERIENCE LEVEL',
    title: 'What is your current DSA comfort level?',
    options: [
      { value: 'beginner', label: 'Beginner', desc: 'Learning basics, Arrays, Lists', icon: Code },
      { value: 'intermediate', label: 'Intermediate', desc: 'Know Stacks, Trees, Recursion', icon: Brain },
      { value: 'advanced', label: 'Advanced', desc: 'Expert in Graphs, DP, segment trees', icon: Award },
    ],
    multiSelect: false,
  },
  {
    id: 'goals',
    label: 'PRIMARY TARGET',
    title: 'What is your main revision goal?',
    options: [
      { value: 'interview', label: 'Interview Prep', desc: 'FAANG / Tier 1 job prep', icon: Target },
      { value: 'consistency', label: 'Consistency', desc: 'Build daily coding habit', icon: Zap },
      { value: 'mastery', label: 'Mastering Hard Topics', desc: 'Cracking DP & Advanced Graphs', icon: Brain },
    ],
    multiSelect: true,
  },
  {
    id: 'weakTopics',
    label: 'ALGORITHMIC PAIN POINTS',
    title: 'Which topics are your main weaknesses?',
    options: [
      { value: 'Dynamic Programming', label: 'DP (Knapsack, LCS)', desc: 'Optimizations' },
      { value: 'Graphs', label: 'Graphs & Traversals', desc: 'BFS, DFS, Dijkstra' },
      { value: 'Trees', label: 'Trees & Tries', desc: 'BST, Segment Trees' },
      { value: 'Recursion', label: 'Recursion & Backtracking', desc: 'N-Queens, Subset sum' },
      { value: 'Arrays & Hashing', label: 'Arrays & Hashing', desc: 'Sliding windows, Map lookups' },
      { value: 'Bit Manipulation', label: 'Bit Manipulation', desc: 'Bitwise gates, masking' },
    ],
    multiSelect: true,
  },
  {
    id: 'dailyTarget',
    label: 'DAILY DEDICATION',
    title: 'Set your daily micro-revision target.',
    options: [
      { value: 3, label: '3 Cards / Day', desc: 'Calm habit (3 mins)' },
      { value: 5, label: '5 Cards / Day', desc: 'Recommended (5 mins)' },
      { value: 10, label: '10 Cards / Day', desc: 'Hyper-prep (10 mins)' },
    ],
    multiSelect: false,
  },
];

interface PersonalizationFormProps {
  onComplete: () => void;
}

export function PersonalizationForm({ onComplete }: PersonalizationFormProps) {
  const { preferences, updatePreferences } = useOnboardingStore();
  const [subStep, setSubStep] = useState(0);
  const currentQ = QUESTIONS[subStep];

  const handleOptionSelect = (val: any) => {
    hapticFeedback.selection();

    if (currentQ.multiSelect) {
      const currentList = (preferences as any)[currentQ.id] as any[];
      const exists = currentList.includes(val);
      const updatedList = exists
        ? currentList.filter((item) => item !== val)
        : [...currentList, val];
      
      updatePreferences({ [currentQ.id]: updatedList });
    } else {
      updatePreferences({ [currentQ.id]: val });
      
      // Auto-advance single choice options to maintain low friction
      setTimeout(() => {
        handleNext();
      }, 350);
    }
  };

  const handleNext = () => {
    if (subStep < QUESTIONS.length - 1) {
      setSubStep(subStep + 1);
      hapticFeedback.impactLight();
    } else {
      // Completed questionnaire, execute callback
      onComplete();
    }
  };

  const handleBack = () => {
    if (subStep > 0) {
      setSubStep(subStep - 1);
      hapticFeedback.impactLight();
    }
  };

  const isSelected = (val: any) => {
    const data = (preferences as any)[currentQ.id];
    if (Array.isArray(data)) {
      return data.includes(val);
    }
    return data === val;
  };

  return (
    <View style={styles.container}>
      {/* Questionnaire Progress Indicator */}
      <View style={styles.progressBarBg}>
        <Animated.View 
          style={[
            styles.progressBarFill, 
            { width: `${((subStep + 1) / QUESTIONS.length) * 100}%` }
          ]} 
        />
      </View>

      {/* Main Question Portal */}
      <Animated.View key={subStep} entering={FadeInRight.duration(300)} exiting={FadeOutLeft.duration(200)} style={styles.slide}>
        <Text style={styles.tag}>{currentQ.label}</Text>
        <Text style={styles.title}>{currentQ.title}</Text>

        <View style={styles.optionsList}>
          {currentQ.options.map((opt) => {
            const selected = isSelected(opt.value);
            const Icon = (opt as any).icon;

            return (
              <SuperchargedPressable
                key={String(opt.value)}
                onPress={() => handleOptionSelect(opt.value)}
                activeScale={0.97}
                style={[
                  styles.optionCard,
                  selected && styles.optionCardActive
                ]}
              >
                <GlassPanel style={styles.optionGlass} intensity={selected ? 22 : 12} tint="dark">
                  <View style={styles.cardContent}>
                    {Icon && (
                      <View style={[styles.iconContainer, selected && styles.iconActive]}>
                        <Icon color={selected ? '#FFFFFF' : '#8B5CF6'} size={18} />
                      </View>
                    )}
                    <View style={styles.textContainer}>
                      <Text style={[styles.optLabel, selected && styles.optLabelActive]}>{opt.label}</Text>
                      {opt.desc && <Text style={styles.optDesc}>{opt.desc}</Text>}
                    </View>

                    {selected && (
                      <View style={styles.checkWrapper}>
                        <Check color="#FFFFFF" size={14} strokeWidth={3} />
                      </View>
                    )}
                  </View>
                </GlassPanel>
              </SuperchargedPressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Footer wizard controls */}
      <View style={styles.footerRow}>
        {subStep > 0 && (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}
        
        {/* Next/Skip indicator button */}
        {(currentQ.multiSelect || isSelected(preferences[currentQ.id as keyof typeof preferences])) && (
          <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
            <Text style={styles.nextText}>
              {subStep === QUESTIONS.length - 1 ? 'Finish Selections' : 'Continue'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * ADAPTIVE SPACED REPETITION RECOMMENDATION SEEDING ENGINE
 * 
 * Implements priority seeding based on pain points and comfort levels.
 * This logic creates weights to feed cards matching weak topics 40% more frequently in the revision queue.
 */
export interface SeedingResult {
  cardWeights: Record<string, number>;
  personalizedIntro: string;
}

export function seedAdaptiveRecommendations(
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | '',
  weakTopics: string[]
): SeedingResult {
  const cardWeights: Record<string, number> = {};

  // 1. Initialize default weights based on experience
  const baseWeight = skillLevel === 'beginner' ? 1.0 : skillLevel === 'intermediate' ? 1.4 : 1.8;

  // 2. Dynamic weights multiplier for Algorithmic Pain Points
  // Pain point topics receive a 1.4x weighting boost to schedule them 40% more frequently
  weakTopics.forEach((topic) => {
    cardWeights[topic] = baseWeight * 1.4;
  });

  // 3. Formulate custom personalized intro message
  const painPointsStr = weakTopics.length > 0 ? weakTopics.slice(0, 2).join(' & ') : 'essential concepts';
  const personalizedIntro = `Dynamically priority-seeding your revision stack focusing on ${painPointsStr} at an ${skillLevel || 'intermediate'} depth.`;

  return {
    cardWeights,
    personalizedIntro,
  };
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 2,
    marginBottom: 28,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
  },
  slide: {
    width: '100%',
  },
  tag: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: 'normal',
    lineHeight: 32,
    marginBottom: 24,
  },
  optionsList: {
    marginVertical: -6,
  },
  optionCard: {
    marginVertical: 6,
    borderRadius: 20,
    width: '100%',
  },
  optionCardActive: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  optionGlass: {
    padding: 16,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconActive: {
    backgroundColor: '#8B5CF6',
  },
  textContainer: {
    flex: 1,
  },
  optLabel: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: 'normal',
  },
  optLabelActive: {
    color: '#F8FAFC',
    fontWeight: '500',
  },
  optDesc: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  checkWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    height: 48,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backText: {
    color: '#64748B',
    fontSize: 15,
  },
  nextBtn: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: '#8B5CF6',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  nextText: {
    color: '#8B5CF6',
    fontSize: 15,
    fontWeight: '500',
  },
});
