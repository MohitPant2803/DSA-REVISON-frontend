import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Vibration,
  Platform,
  Alert,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { RichText } from '@/components/RichText';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useRouter } from 'expo-router';
import {
  X,
  ListMusic,
  Check,
  Heart,
  MoreVertical,
  Clock,
  ChevronRight,
} from 'lucide-react-native';
import { IPopulatedRevisionCard, ISlide } from '@/hooks/useRevisionCards';
import { useTogglePlaylistItem } from '@/hooks/usePlaylists';
import { useUpdateCardProgress } from '@/services/useProgress';
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import { canModifyItem, UserRole } from '@/utils/permissions';
import * as userCardStateService from '@/services/userCardStateService';
import Toast from 'react-native-toast-message';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
    Vibration.vibrate(8);
  }
};

export const getSlidesForCard = (card: IPopulatedRevisionCard): ISlide[] => {
  // If the card already has a full deck of custom slides (> 1 slide), use them!
  if (card.slides && card.slides.length > 1) {
    return card.slides;
  }

  const slides: ISlide[] = [];
  
  // 1. Intro / Cover Card (rendered via ConceptCardPreview)
  slides.push({
    type: 'intro',
    headline: card.title,
    body: card.explanation,
  });

  // 2. Simplified Analogy / Metaphor
  if (card.analogy) {
    slides.push({
      type: 'explanation',
      headline: '💡 The Mental Model',
      body: `**Simplified Analogy**:\n${card.analogy}\n\n*Think of this conceptually before diving into the code.*`,
    });
  }

  // 3. Core Intuition (How it clicks)
  slides.push({
    type: 'explanation',
    headline: '🧠 Core Intuition',
    body: card.intuition || card.explanation || 'At its core, this problem asks us to observe how values shift relative to our active bounds.',
  });

  // 4. Common Mistake vs Preferred Approach (Tension)
  if (card.mistake || card.prefer) {
    const mistakeStr = card.mistake ? `❌ **Common Trap**:\n${card.mistake}` : '';
    const preferStr = card.prefer ? `✅ **Preferred Approach**:\n${card.prefer}` : '';
    slides.push({
      type: 'explanation',
      headline: '⚠️ The Trap vs The Clean Way',
      body: `${mistakeStr}\n\n${preferStr}`,
    });
  }

  // 5. Optimal Implementation (Code)
  if (card.code && card.code.trim()) {
    slides.push({
      type: 'code',
      headline: '💻 Optimal Implementation',
      body: 'Review the clean, highly optimized implementation below:',
      code: card.code,
    });
  }

  // 6. Dry Run Trace
  if (card.examples && card.examples.length > 0) {
    slides.push({
      type: 'dryrun',
      headline: '🔍 Dry Run Trace',
      body: card.dryRun || "Walk through step-by-step executions of the algorithm:",
    });
  }

  // 7. Complexity Matrix slide
  if (card.complexity) {
    slides.push({
      type: 'complexity',
      headline: '⚡ Performance Footprints',
      body: 'Time and space performance benchmarks for this pattern.',
    });
  }

  // Fallback to Concept Summary if none of the above matches
  if (slides.length <= 2) {
    slides.push({
      type: 'summary',
      headline: '✨ Spaced Repetition Recall',
      body: 'Successfully mastered this DSA pattern! Retain this core logic for coding interviews.',
    });
  }

  return slides;
};

interface ConceptCardPreviewProps {
  card: IPopulatedRevisionCard;
  onViewExplanation?: (index?: number) => void;
  isWatchLater?: boolean;
  onToggleWatchLater?: () => void;
  onCardStateUpdate?: (cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => void;
  activePlaylistId?: string | null;
  scrollEnabled?: boolean;
}

export const ConceptCardPreview = React.memo(({ card, onViewExplanation, isWatchLater, onToggleWatchLater, onCardStateUpdate, activePlaylistId, scrollEnabled = true }: ConceptCardPreviewProps) => {
  const router = useRouter();
  const ctaScale = useSharedValue(1);

  const ctaAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: ctaScale.value }],
    };
  });

  const { user, logout } = useAuthStore();
  const { role } = useRole();
  const { mutate: updateProgress } = useUpdateCardProgress();
  const { mutate: deleteCard } = useDeleteRevisionCard();
  const togglePlaylistItem = useTogglePlaylistItem();

  const folderId = typeof card.folderId === 'object' && card.folderId !== null ? card.folderId._id : card.folderId;
  const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
  const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, card.createdBy) : false);

  const { preferences } = useUserPreferencesStore();
  const slideCount = useMemo(() => {
    const baseSlides = getSlidesForCard(card);
    const introSlide = baseSlides.find(s => s.type === 'intro');
    let otherSlides = baseSlides.filter(s => s.type !== 'intro');
    
    if (preferences.hideCertainBlockTypes && preferences.hideCertainBlockTypes.length > 0) {
      otherSlides = otherSlides.filter(s => s.type ? !preferences.hideCertainBlockTypes.includes(s.type) : true);
    }
    
    return (introSlide ? 1 : 0) + otherSlides.length;
  }, [card, preferences.hideCertainBlockTypes]);

  const isGuest = user?.id === 'guest-user';

  const promptSignIn = () => {
    Alert.alert(
      "Sign In Required",
      "Please sign in to save progress, favorite cards, or manage playlists.",
      [
        { text: "Maybe Later", style: "cancel" },
        { 
          text: "Sign In", 
          onPress: async () => {
            await logout();
          } 
        }
      ]
    );
  };

  const handleProgressUpdate = (action: 'favorite' | 'difficult' | 'archived') => {
    if (isGuest) return promptSignIn();

    const cleanId = card._id.split('-loop-')[0];

    if (action === 'favorite') {
      const currentlyRed = !!card.isFavorite || (!!activePlaylistId && activePlaylistId !== 'likes');
      const newValue = !currentlyRed;

      // 1. Optimistic parent update
      onCardStateUpdate?.(cleanId, 'favorite', newValue);

      // 2. Update favorite/like in progress
      updateProgress(
        { cardId: cleanId, action: 'favorite', value: newValue },
        {
          onError: (err) => {
            console.error(`[LIKE MUTATION ERROR]`, err);
            onCardStateUpdate?.(cleanId, 'favorite', currentlyRed);
          }
        }
      );

      // Call new backend userCardState toggle
      if (!isGuest) {
        userCardStateService.toggleLike(cleanId).catch((err) => {
          console.error('[UserCardState toggleLike Error]', err);
        });
      }

      // 3. Remove/add from current playlist too
      if (activePlaylistId && activePlaylistId !== 'likes' && activePlaylistId !== 'watch-later') {
        togglePlaylistItem.mutate(
          {
            playlistId: activePlaylistId,
            revisionCardId: cleanId,
            isInPlaylist: currentlyRed, // if it was red, remove it (isInPlaylist = true)
          },
          {
            onError: (err) => {
              console.error(`[PLAYLIST TOGGLE ERROR]`, err);
            }
          }
        );
      }
      return;
    }

    const key = action === 'difficult' ? 'isDifficult' : 'isArchived';
    const currentValue = !!card[key];
    const newValue = !currentValue;

    // Optimistic parent update
    onCardStateUpdate?.(cleanId, action, newValue);

    updateProgress(
      { cardId: cleanId, action, value: newValue },
      {
        onError: (err) => {
          console.error(`[MUTATION ERROR]`, err);
          onCardStateUpdate?.(cleanId, action, currentValue);
        }
      }
    );
  };

  const handleDelete = () => {
    if (isGuest) return promptSignIn();

    Alert.alert('Delete Card', 'Are you sure you want to permanently delete this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteCard(card._id),
      },
    ]);
  };

  const handleEdit = () => {
    if (isGuest) return promptSignIn();

    router.push({
      pathname: '/(protected)/(tabs)/CreateRevisionScreen',
      params: { cardId: card._id, folderId, card: JSON.stringify(card) },
    });
  };



  const showCardOptionsMenu = () => {
    const options = [
      {
        text: 'Code Walkthrough',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'code');
          onViewExplanation?.(idx !== -1 ? idx : 0);
        },
      },
      {
        text: 'Trace Dry Run',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'dryrun');
          onViewExplanation?.(idx !== -1 ? idx : 0);
        },
      },
      {
        text: card.isArchived ? 'Unhide Card' : 'Hide Card (Archive)',
        onPress: () => handleProgressUpdate('archived'),
      },
    ];

    if (canEdit) {
      options.push({ text: 'Edit Card', onPress: handleEdit });
      options.push({ text: 'Delete Card', onPress: handleDelete });
    }

    Alert.alert(card.title, 'Choose an action for this card:', [
      ...options.map((opt) => ({ text: opt.text, onPress: opt.onPress })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const { frequencyScore, frequencyText, timeExpected, companies } = useMemo(() => {
    const hash = card.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const score = 75 + (hash % 21); // 75% to 95%
    const freqText = score >= 90 ? 'Very High' : score >= 82 ? 'High' : 'Moderate';
    const time = card.difficulty === 'Easy' ? '15m' : card.difficulty === 'Medium' ? '30m' : '45m';

    const knownCompanies = ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple', 'Netflix', 'Uber', 'Airbnb', 'Adobe', 'Atlassian'];
    const found = card.tags?.filter(t => knownCompanies.some(c => t.toLowerCase() === c.toLowerCase())) || [];
    const companiesList = found.length > 0 ? found.join(' • ') : ['Google', 'Meta', 'Amazon', 'Microsoft', 'Uber'][hash % 4] + ' • ' + ['Google', 'Meta', 'Amazon', 'Microsoft', 'Uber'][(hash + 1) % 4] + ' • ' + ['Google', 'Meta', 'Amazon', 'Microsoft', 'Uber'][(hash + 2) % 4];

    return { frequencyScore: score, frequencyText: freqText, timeExpected: time, companies: companiesList };
  }, [card.title, card.difficulty, card.tags]);

  return (
    <View className="flex-1 justify-between bg-transparent h-full pb-11 pr-14">
      <View className="flex-1 justify-between gap-y-4">
        {/* Top Section */}
        <View className="gap-y-3">
          {/* Modern Apple-style Capsule Tags */}
          <View className="flex-row flex-wrap gap-2 items-center">
            <View className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200/60">
              <Text className="text-slate-600 text-[10px] font-extrabold uppercase tracking-wider">{card.topic}</Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${
              card.difficulty === 'Easy' ? 'bg-emerald-50/60 border border-emerald-100' :
              card.difficulty === 'Medium' ? 'bg-amber-50/60 border border-amber-100' :
              'bg-rose-50/60 border border-rose-100'
            }`}>
              <Text className={`text-[10px] font-extrabold uppercase tracking-wider ${
                card.difficulty === 'Easy' ? 'text-emerald-700' :
                card.difficulty === 'Medium' ? 'text-amber-700' :
                'text-rose-700'
              }`}>{card.difficulty}</Text>
            </View>
            {card.complexity && (
              <View className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200/60">
                <Text className="text-slate-600 text-[10px] font-mono font-extrabold uppercase tracking-wider">{card.complexity}</Text>
              </View>
            )}
          </View>

          {/* Title (Striking, Extremely Large Typographical Focal Point) */}
          <Text
            style={{ fontSize: 35, fontWeight: '900', color: '#0F172A', letterSpacing: -0.6, lineHeight: 35, marginTop: 4 }}
            numberOfLines={2}
          >
            {card.title}
          </Text>

          {/* Premium Compact Companies Pill (Reduced by Half) */}
          <View className="bg-slate-50/80 border border-slate-200/40 rounded-xl px-4 py-2 mt-1 self-start flex-row items-center gap-x-2 shadow-sm shadow-slate-100/10">
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#94A3B8' }}>Companies:</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569' }}>
              {companies}
            </Text>
          </View>
        </View>

        {/* Middle Section (Spacious Problem Statement Explanation) */}
        <View className="flex-1 justify-center my-4">
          <View className="bg-violet-50/30 border border-violet-100/50 rounded-[32px] p-5 shadow-sm gap-y-3 h-full justify-between">
            <View className="flex-row items-center justify-between">
              <Text className="text-slate-900 font-black tracking-tight text-[27px] leading-tight">🎯 What does the question ask?</Text>
            </View>
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              className="flex-1 mt-1.5"
              scrollEnabled={scrollEnabled}
            >
              <RichText
                text={card.explanation || ''}
                style={{ color: '#334155', fontSize: 18.5, lineHeight: 29, fontWeight: '600' }}
                boldStyle={{ color: '#0F172A', fontWeight: '900' }}
              />
            </ScrollView>
          </View>
        </View>
      </View>

      {/* Redesigned Pulsing Interactive Walkthrough CTA */}
      <Animated.View style={ctaAnimatedStyle} className="mt-auto self-center mb-2">
        <Pressable
          onPressIn={() => {
            ctaScale.value = withSpring(0.96, { damping: 10, stiffness: 350 });
          }}
          onPressOut={() => {
            ctaScale.value = withSpring(1, { damping: 10, stiffness: 350 });
          }}
          onPress={() => {
            if (onViewExplanation) {
              lightHaptic();
              onViewExplanation(1);
            }
          }}
          className="flex-row items-center justify-center py-2.5 bg-violet-500 rounded-full px-6 shadow-sm shadow-violet-500/10"
        >
          <Text className="text-white text-[12px] font-extrabold tracking-wider uppercase text-center">
            {slideCount} slides {'>'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.card._id === nextProps.card._id &&
    prevProps.card.isFavorite === nextProps.card.isFavorite &&
    prevProps.card.isDifficult === nextProps.card.isDifficult &&
    prevProps.card.isArchived === nextProps.card.isArchived &&
    prevProps.isWatchLater === nextProps.isWatchLater &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.scrollEnabled === nextProps.scrollEnabled
  );
});
