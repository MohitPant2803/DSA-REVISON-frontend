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
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
    Vibration.vibrate(8);
  }
};

export const getSlidesForCard = (card: IPopulatedRevisionCard): ISlide[] => {
  // If the card already has custom slides, use them!
  // Note: We bypass this and fall back to the dynamic slide generator if the card only has 
  // the single auto-generated backwards-compatibility slide (slides.length === 1 and type === 'intro'
  // and body matches the card's overall explanation).
  const isBackwardsCompatibilitySlide = 
    card.slides && 
    card.slides.length === 1 && 
    card.slides[0].type === 'intro' && 
    (card.slides[0].body === card.explanation || card.slides[0].body === card.title || !card.slides[0].body?.trim());

  if (card.slides && card.slides.length > 0 && !isBackwardsCompatibilitySlide) {
    const normalizedSlides = card.slides.map(s => ({
      ...s,
      body: s.body || (s as any).Body || ''
    }));
    const first = normalizedSlides[0];
    if (first.type === 'intro') {
      if (!first.headline?.trim() && !first.body?.trim()) {
        // Empty intro slide -> Replace it with card-level cover page metadata
        const replacedFirst = { ...first, headline: card.title, body: card.explanation || '' };
        return [replacedFirst, ...normalizedSlides.slice(1)];
      } else {
        // Non-empty intro slide (e.g. DSA card's "Recognition" slide) -> Prepend a cover page
        // Since we are prepending a cover page (which is the new intro slide),
        // we change the type of the original first slide to 'explanation'
        // so it renders as a normal content slide rather than repeating the intro layout.
        const updatedFirst = { ...first, type: 'explanation' as const };
        return [
          { type: 'intro' as const, headline: card.title, body: card.explanation || '' },
          updatedFirst,
          ...normalizedSlides.slice(1),
        ];
      }
    } else {
      // First slide is not an intro slide -> Prepend a cover page
      return [
        { type: 'intro' as const, headline: card.title, body: card.explanation || '' },
        ...normalizedSlides,
      ];
    }
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
  const palette = useThemePalette();
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
  const baseSlides = useMemo(() => getSlidesForCard(card), [card]);
  const firstSlide = baseSlides[0];

  const slideCount = useMemo(() => {
    const introSlide = baseSlides.find(s => s.type === 'intro');
    let otherSlides = baseSlides.filter(s => s.type !== 'intro');
    
    if (preferences.hideCertainBlockTypes && preferences.hideCertainBlockTypes.length > 0) {
      otherSlides = otherSlides.filter(s => s.type ? !preferences.hideCertainBlockTypes.includes(s.type) : true);
    }
    
    return (introSlide ? 1 : 0) + otherSlides.length;
  }, [baseSlides, preferences.hideCertainBlockTypes]);

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
      pathname: '/(protected)/CreateRevisionScreen',
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



  return (
    <View className="flex-1 bg-transparent h-full pb-11 pr-14" style={{ flexDirection: 'column' }}>
      {/* Top Section */}
      <View className="gap-y-3">
        {/* Modern Apple-style Capsule Tags (Flat, transparent background) */}
        <View className="flex-row flex-wrap gap-2 items-center">
          {card.topic && card.topic.trim() ? (
            <View className="px-3 py-1 rounded-full bg-transparent border" style={{ borderColor: palette.border }}>
              <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>{card.topic}</Text>
            </View>
          ) : null}
          {card.difficulty && card.difficulty.trim() ? (
            <View 
              className="px-3 py-1 rounded-full border" 
              style={{ 
                backgroundColor: card.difficulty === 'Easy' ? addAlpha(palette.success, 0.08) :
                                 card.difficulty === 'Medium' ? addAlpha(palette.warning, 0.08) :
                                 addAlpha(palette.error, 0.08),
                borderColor: card.difficulty === 'Easy' ? addAlpha(palette.success, 0.15) :
                             card.difficulty === 'Medium' ? addAlpha(palette.warning, 0.15) :
                             addAlpha(palette.error, 0.15),
              }}
            >
              <Text 
                className="text-[10px] font-semibold uppercase tracking-wider" 
                style={{ 
                  color: card.difficulty === 'Easy' ? palette.success :
                         card.difficulty === 'Medium' ? palette.warning :
                         palette.error
                }}
              >
                {card.difficulty}
              </Text>
            </View>
          ) : null}
          {card.complexity && (
            <View className="px-3 py-1 rounded-full bg-transparent border" style={{ borderColor: palette.border }}>
              <Text className="text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>{card.complexity}</Text>
            </View>
          )}
        </View>

        {/* Title (Striking, Extremely Large Typographical Focal Point) */}
        <Text
          style={{ fontSize: 24, fontWeight: '600', color: palette.textPrimary, letterSpacing: -0.3, lineHeight: 28, marginTop: 4 }}
          numberOfLines={2}
        >
          {card.title}
        </Text>
      </View>

      {/* Spacer 1: 1/3 distance (flex: 1) */}
      <View style={{ flex: 1 }} />

      {/* Middle Section (Spacious Problem Statement Explanation in a curved themed box) */}
      <View style={{ maxHeight: 380, flexShrink: 1, backgroundColor: palette.readingSurface, borderRadius: 24, borderWidth: 1, borderColor: palette.readingBorder }}>
        <View className="p-4 gap-y-3" style={{ maxHeight: '100%', flexShrink: 1 }}>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            scrollEnabled={scrollEnabled}
          >
            <RichText
              text={firstSlide?.body || ''}
              style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 24, fontWeight: '400' }}
              boldStyle={{ color: palette.textPrimary, fontWeight: '600' }}
            />
          </ScrollView>
        </View>
      </View>

      {/* Spacer 2: 2/3 distance (flex: 3.5 for highly pronounced visual alignment) */}
      <View style={{ flex: 3.5 }} />

      {/* Redesigned Pulsing Interactive Walkthrough CTA */}
      <Animated.View style={ctaAnimatedStyle} className="self-center mb-2">
        <Pressable
          onPressIn={() => {
            ctaScale.value = withSpring(0.96, { damping: 15, stiffness: 350 });
          }}
          onPressOut={() => {
            ctaScale.value = withSpring(1, { damping: 15, stiffness: 350 });
          }}
          onPress={() => {
            if (onViewExplanation) {
              lightHaptic();
              onViewExplanation(1);
            }
          }}
          className="flex-row items-center justify-center py-2.5 rounded-full px-6 shadow-sm"
          style={{ 
            backgroundColor: palette.accent,
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12
          }}
        >
          <Text 
            className="text-[12px] font-semibold tracking-wider uppercase text-center"
            style={{ color: palette.isDark ? palette.textPrimary : palette.surface }}
          >
            {slideCount} slides {'>'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.card._id === nextProps.card._id &&
    prevProps.card.updatedAt === nextProps.card.updatedAt &&
    (prevProps.card as any).isContentFullyHydrated === (nextProps.card as any).isContentFullyHydrated &&
    JSON.stringify(prevProps.card.slides) === JSON.stringify(nextProps.card.slides) &&
    prevProps.card.isFavorite === nextProps.card.isFavorite &&
    prevProps.card.isDifficult === nextProps.card.isDifficult &&
    prevProps.card.isArchived === nextProps.card.isArchived &&
    prevProps.isWatchLater === nextProps.isWatchLater &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.scrollEnabled === nextProps.scrollEnabled
  );
});
