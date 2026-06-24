"use no compiler";
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, lazy, Suspense } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Dimensions,
  Vibration,
  Platform,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  Modal,
  Image,
  TextInput,
  Animated as RNAnimated,
  FlatList,
  Pressable,
  BackHandler,
  Linking,
  InteractionManager,
  AppState,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListElement = FlashList as any;
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { SyncPauseGate } from '@/components/SyncPauseGate';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  ListMusic,
  Check,
  CheckCircle2,
  Heart,
  MoreVertical,
  Clock,
  RotateCcw,
  Sliders,
  Settings2,
  BrainCircuit,
  Lock,
  Flame,
  Zap,
  Skull,
  SkipForward,
  BookmarkPlus,
  Brain,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { Image as ExpoImage } from 'expo-image';
import { useGetRevisionCards, IPopulatedRevisionCard, ISlide } from '@/hooks/useRevisionCards';
import { useGetFolders } from '@/hooks/useFolders';
import { RevisionCard } from '../../app/(protected)/RevisionCard';
import { useUpdateLastViewedCard, useFolderLoops } from '@/services/useUserProgress';
import { ReeWCharacter } from '@/components/ReeWCharacter';
const ReelsSettingsOverlay = lazy(() =>
  import('@/components/SettingsOverlay').then(m => ({ default: m.ReelsSettingsOverlay }))
);
const PlaylistPickerModal = lazy(() =>
  import('@/components/PlaylistPickerModal').then(m => ({ default: m.PlaylistPickerModal }))
);
import { useShallow } from 'zustand/react/shallow';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';

import { useTrackingStore } from '@/store/useTrackingStore';
import { useProgressSync } from '@/hooks/useProgressSync';
import { useRole } from '@/hooks/useRole';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import * as reelsFeedService from '@/services/reelsFeedService';
import * as revisionService from '@/services/revisionService';
import { GestureHandlerRootView, GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity, ScrollView as RNGHScrollView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  interpolate,
  interpolateColor,
  runOnJS,
  SharedValue,
  cancelAnimation,
  useDerivedValue,
  useAnimatedScrollHandler,
  Easing,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useUpdateCardProgress, useUpdateDifficultyState } from '@/services/useProgress';
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canModifyItem, UserRole } from '@/utils/permissions';
import { normalizeParam } from '@/utils/routeParams';
import { usePlaylists, usePlaylistCards, useTogglePlaylistItem, useCreatePlaylist } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';

import * as userCardStateService from '@/services/userCardStateService';
import { ConceptCardPreview, getSlidesForCard } from '@/components/ConceptCardPreview';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';
import { ThemeBackground } from '@/components/ThemeBackground';
import { FirstFeedTutorial } from '@/components/onboarding/FirstFeedTutorial';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';

// Global slides cache to store pre-compiled and pre-sorted slide arrays by card ID
// IMPORTANT: Bump this version whenever getSlidesForCard logic changes,
// to invalidate stale cache entries that persist across Metro fast refreshes.
const SLIDES_LOGIC_VERSION = 2;
const slidesCache = new Map<string, any[]>();
slidesCache.clear(); // Force clear on module (re)load to bust stale hot-reload data
const MAX_SLIDES_CACHE_SIZE = 50;

const setCachedSlides = (key: string, value: any[]) => {
  if (slidesCache.size >= MAX_SLIDES_CACHE_SIZE) {
    let oldestKey: string | undefined;
    // Bulletproof ES5 loop to avoid ES6 Map iterator compilation helper bugs
    slidesCache.forEach((_, k) => {
      if (oldestKey === undefined) {
        oldestKey = k;
      }
    });
    if (oldestKey !== undefined) {
      slidesCache.delete(oldestKey);
    }
  }
  slidesCache.set(key, value);
};

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width * 0.97;
const PAGE_SIZE = 100; // Load 100 cards at once for an endless, zero-latency reels feed

// Pre-warm the cache immediately when the module loads
let modulePositionCache: { index: number; cardId: string; timestamp: number } | null = null;

AsyncStorage.getItem('reels_position_general')
  .then(raw => {
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp <= 7 * 24 * 60 * 60 * 1000) {
      modulePositionCache = parsed;
    }
  })
  .catch(() => {});

// Paper-light exit â€” card flies off instantly on commit
const FLICK_EXIT_CONFIG = {
  duration: 70,
  easing: Easing.out(Easing.quad),
};

// Snap back â€” tight and instant when gesture is cancelled
const CANCEL_SPRING = {
  damping: 38,
  stiffness: 1200,
  mass: 0.2,
  overshootClamping: true,
};

// Previous card slides in â€” feels pulled like a physical sheet
const PULL_BACK_CONFIG = {
  duration: 70,
  easing: Easing.out(Easing.quad),
};

const OFFSCREEN_X = -width - 20;

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(8);
  }
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  radius?: number;
  stroke?: number;
  progress?: number;
}

// Premium circular progress ring around loop count
const ProgressRing = React.memo(({ radius = 18, stroke = 3, progress = 0 }: ProgressRingProps) => {
  const strokeWidth = stroke;
  const innerRadius = radius - strokeWidth / 2;
  const circumference = 2 * Math.PI * innerRadius;
  
  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = circumference - progress * circumference;
    return {
      strokeDashoffset,
    };
  });
  
  return (
    <Svg width={radius * 2} height={radius * 2} className="rotate-[-90deg]">
      <Circle
        cx={radius}
        cy={radius}
        r={innerRadius}
        stroke="rgba(226, 232, 240, 0.4)"
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <AnimatedCircle
        cx={radius}
        cy={radius}
        r={innerRadius}
        stroke="#8B5CF6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        animatedProps={animatedProps}
        strokeLinecap="round"
        fill="transparent"
      />
    </Svg>
  );
});

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const IndicatorDot = ({ isActive }: { isActive: boolean }) => (
  <View
    style={{
      width: isActive ? 20 : 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isActive ? '#8B5CF6' : 'rgba(148, 163, 184, 0.3)',
      marginHorizontal: 3,
    }}
  />
);

// High-fidelity elegant Apple-style Breathing Opacity Skeleton using Native Animated Driver
const BreathingOpacitySkeleton = ({ style }: { style: any }) => {
  const opacity = React.useRef(new RNAnimated.Value(0.35)).current;

  React.useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: 0.75,
          duration: 1200,
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacity, {
          toValue: 0.35,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <RNAnimated.View style={[style, { opacity }]} />;
};

interface ReelItemSkeletonProps {
  cardHeight: number;
  width: number;
}

// Complete mock visual structure of a Reel Card matching the live layout perfectly
const ReelItemSkeleton = React.memo(({ cardHeight, width }: ReelItemSkeletonProps) => {
  const palette = useThemePalette();
  const cardWidth = width * 0.97;
  return (
    <View
      style={[
        styles.cardBase,
        {
          height: cardHeight,
          marginBottom: 16,
          alignSelf: 'center',
          width: cardWidth,
          overflow: 'hidden',
          padding: 24,
          paddingTop: 64,
          paddingBottom: 24,
          justifyContent: 'space-between',
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={{ gap: 20 }}>
        {/* Mock Badge Header capsules */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <BreathingOpacitySkeleton style={{ width: 64, height: 20, borderRadius: 10, backgroundColor: addAlpha(palette.accent, 0.15) }} />
          <BreathingOpacitySkeleton style={{ width: 72, height: 20, borderRadius: 10, backgroundColor: addAlpha(palette.success, 0.15) }} />
          <BreathingOpacitySkeleton style={{ width: 52, height: 20, borderRadius: 10, backgroundColor: addAlpha(palette.textSecondary, 0.15) }} />
        </View>

        {/* Mock Title Multi-line layout */}
        <View style={{ gap: 8, marginTop: 12 }}>
          <BreathingOpacitySkeleton style={{ width: '85%', height: 28, borderRadius: 8, backgroundColor: addAlpha(palette.textPrimary, 0.1) }} />
          <BreathingOpacitySkeleton style={{ width: '65%', height: 28, borderRadius: 8, backgroundColor: addAlpha(palette.textPrimary, 0.1) }} />
        </View>

        {/* Mock Explanation block */}
        <View style={{ gap: 6, marginTop: 12 }}>
          <BreathingOpacitySkeleton style={{ width: '95%', height: 14, borderRadius: 4, backgroundColor: addAlpha(palette.textPrimary, 0.06) }} />
          <BreathingOpacitySkeleton style={{ width: '90%', height: 14, borderRadius: 4, backgroundColor: addAlpha(palette.textPrimary, 0.06) }} />
          <BreathingOpacitySkeleton style={{ width: '75%', height: 14, borderRadius: 4, backgroundColor: addAlpha(palette.textPrimary, 0.06) }} />
        </View>
      </View>

      {/* Mock lower walkthrough bar */}
      <View style={{ marginTop: 'auto', width: '100%' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            borderRadius: 16,
            backgroundColor: addAlpha(palette.accent, 0.05),
            borderWidth: 1,
            borderColor: addAlpha(palette.accent, 0.08),
            paddingHorizontal: 20,
          }}
        >
          <BreathingOpacitySkeleton style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: addAlpha(palette.accent, 0.5) }} />
          <BreathingOpacitySkeleton style={{ width: 180, height: 12, borderRadius: 3, backgroundColor: addAlpha(palette.accent, 0.15), marginLeft: 10 }} />
          <BreathingOpacitySkeleton style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: addAlpha(palette.accent, 0.3), marginLeft: 'auto' }} />
        </View>
      </View>

      {/* Mock vertical Action Rail on the right side */}
      <View
        style={{
          position: 'absolute',
          right: 16,
          bottom: 85,
          alignItems: 'center',
          backgroundColor: 'transparent',
          gap: 12,
          width: 50,
          zIndex: 50,
          elevation: 10,
        }}
      >
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: addAlpha(palette.textPrimary, 0.1) }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: addAlpha(palette.textPrimary, 0.1) }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: addAlpha(palette.textPrimary, 0.1) }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: addAlpha(palette.textPrimary, 0.1) }} />
      </View>

    </View>
  );
});

interface ReelsActionRailProps {
  cleanId: string;
  item: IPopulatedRevisionCard;
  onDifficultyStateUpdate: (state: 'easy' | 'medium' | 'hard' | 'skipped') => void;
  onPlaylistPickerTrigger: (card: IPopulatedRevisionCard) => void;
  isGuest: boolean;
  isDisabled?: boolean; // Controls whether touch captures are disabled during vertical swipes
}

interface ClassificationButtonProps {
  label: string;
  icon: React.ComponentType<any>;
  activeColor: string;
  isActive: boolean;
  onPress: () => void;
  shouldPulse?: boolean;
  pulseDelay?: number;
}

const ClassificationButton = React.memo(({
  label,
  icon: Icon,
  activeColor,
  isActive,
  onPress,
  shouldPulse = false,
  pulseDelay = 0,
}: ClassificationButtonProps) => {
  const palette = useThemePalette();
  const isMidnight = palette.id === 'midnight';

  const handlePress = () => {
    onPress();
  };

  const handlePressIn = () => {
    lightHaptic(); // Synchronous physical click haptic instantly on touch down!
  };

  const displayColor = isActive ? activeColor : (isMidnight ? '#FFFFFF' : 'rgba(15, 23, 42, 0.22)');

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      activeOpacity={0.65}
      style={{ alignItems: 'center', marginBottom: 12 }}
    >
      <View style={{ position: 'relative' }}>
        {/* Main Action Capsule Button */}
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: isActive 
              ? `${activeColor}15` // soft active background
              : 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: displayColor,
          }}
        >
          <Icon
            color={displayColor}
            size={15}
            strokeWidth={isActive ? 3.0 : 2.2}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
});

const ReelsActionRail = React.memo(({
  cleanId,
  item,
  onDifficultyStateUpdate,
  onPlaylistPickerTrigger,
  isGuest,
  isDisabled = false,
}: ReelsActionRailProps) => {
  const palette = useThemePalette();
  const isMidnight = palette.id === 'midnight';

  // ── LOCAL STATE for instant visual feedback (no Zustand propagation wait) ──
  const storeValue = usePlaylistStateStore(
    useCallback((s) => s.cardsById[cleanId]?.difficultyState ?? null, [cleanId])
  );
  const [localDifficulty, setLocalDifficulty] = useState<string | null>(storeValue);

  // Sync from store when it catches up (or on card change)
  useEffect(() => { setLocalDifficulty(storeValue); }, [storeValue]);

  // Track pending timeout to decouple heavy Zustand parent updates
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    };
  }, []);

  // â”€â”€ INSTANT press handler: update local state FIRST, then fire Zustand update â”€â”€
  const handleDifficultyPress = useCallback((state: 'easy' | 'medium' | 'hard' | 'skipped') => {
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
    }

    const newState = localDifficulty === state ? null : state;
    setLocalDifficulty(newState); // INSTANT â€” same render frame

    // Defer the heavy Zustand store write & parent re-render cascade by 50ms.
    // This decouples visual feedback from store propagation, letting the button update instantly!
    pendingTimeoutRef.current = setTimeout(() => {
      onDifficultyStateUpdate(state); // Triggers Zustand in background
    }, 50);
  }, [localDifficulty, onDifficultyStateUpdate]);

  const shouldPulse = !localDifficulty;

  const { data: membership } = useCardPlaylistMembership(cleanId, !isGuest);
  const isSaved = useMemo(() => {
    if (!membership) return false;
    return Object.keys(membership).some(id => 
      !['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(id) && membership[id]
    );
  }, [membership]);

  return (
    <View 
      pointerEvents={isDisabled ? 'none' : 'auto'}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 85,
        alignItems: 'center',
        backgroundColor: 'transparent',
        zIndex: 50,
        elevation: 10,
        width: 50,
      }}
    >
      <ClassificationButton
        label="Easy"
        icon={Check}
        activeColor="#22C55E"
        isActive={localDifficulty === 'easy'}
        onPress={() => handleDifficultyPress('easy')}
        shouldPulse={shouldPulse}
        pulseDelay={0}
      />

      <ClassificationButton
        label="Medium"
        icon={Zap}
        activeColor="#F59E0B"
        isActive={localDifficulty === 'medium'}
        onPress={() => handleDifficultyPress('medium')}
        shouldPulse={shouldPulse}
        pulseDelay={250}
      />

      <ClassificationButton
        label="Hard"
        icon={Brain}
        activeColor="#EF4444"
        isActive={localDifficulty === 'hard'}
        onPress={() => handleDifficultyPress('hard')}
        shouldPulse={shouldPulse}
        pulseDelay={500}
      />

      <ClassificationButton
        label="Skipped"
        icon={SkipForward}
        activeColor="#3B82F6"
        isActive={localDifficulty === 'skipped'}
        onPress={() => handleDifficultyPress('skipped')}
        shouldPulse={shouldPulse}
        pulseDelay={750}
      />

      {/* Futuristic Sleek Separator Line */}
      <View style={{ width: 24, height: 1, backgroundColor: isMidnight ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)', marginVertical: 6, marginBottom: 12 }} />

      <ClassificationButton
        label="Save"
        icon={BookmarkPlus}
        activeColor="#8B5CF6"
        isActive={isSaved}
        onPress={() => onPlaylistPickerTrigger(item)}
      />
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.cleanId === nextProps.cleanId &&
    prevProps.item._id === nextProps.item._id &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.isDisabled === nextProps.isDisabled
  );
});

interface ReelItemProps {
  cardId: string;
  item?: IPopulatedRevisionCard;
  index: number;
  activeIndex: number;
  goToNextCard: () => void;
  goToPrevCard: () => void;
  cardHeight: number;
  width: number;
  isFavorite?: boolean;
  activePlaylistId: string | null;
  isGuest: boolean;
  canEdit?: boolean;
  onToggleWatchLater: (cleanId: string) => void;
  onCardStateUpdate: (cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => void;
  onPlaylistPickerTrigger: (card: IPopulatedRevisionCard) => void;
  onMoreOptionsTrigger: (card: IPopulatedRevisionCard, scrollHorizontal: (idx: number) => void) => void;
  onDifficultyStateUpdate: (cardId: string, state: 'easy' | 'medium' | 'hard' | 'skipped') => void;
  isActiveCardClassified?: boolean;
  shadowProgress?: SharedValue<number>;
  scrollY?: SharedValue<number>;
  rnghScrollViewRef: React.RefObject<any>;
}

interface ActiveReelItemProps extends Omit<ReelItemProps, 'item'> {
  item: IPopulatedRevisionCard;
}

interface SlideCardWrapperProps {
  slide: ISlide;
  indexInDeck: number;
  activeSlideIndexSV: SharedValue<number>;
  slideDragX: SharedValue<number>;
  prevSlideDragX: SharedValue<number>;
  cardTranslateY: SharedValue<number>; // Dynamic shadow dampening trigger
  cardHeight: number;
  width: number;
  zIndex: number;
  renderSlideContent: (slide: ISlide, index: number) => React.ReactNode;
  shadowProgress: SharedValue<number>;
  isLastSlide?: boolean;
  flipRotation: SharedValue<number>;
}

const SlideCardWrapper = React.memo(({
  slide,
  indexInDeck,
  activeSlideIndexSV,
  slideDragX,
  prevSlideDragX,
  cardTranslateY,
  cardHeight,
  width,
  zIndex,
  renderSlideContent,
  shadowProgress,
  isLastSlide = false,
  flipRotation,
}: SlideCardWrapperProps) => {
  const palette = useThemePalette();
  // =========================================================================
  // Onboarding-style card stack animation with Dynamic Shadow Dampening
  // and Compositor-First solid opacities.
  // =========================================================================
  const animatedStyle = useAnimatedStyle(() => {
    const activeIdx = activeSlideIndexSV.value;
    const delta = indexInDeck - activeIdx;

    let elevation = 0;
    let shadowOpacity = 0;



    // Active card: only tracks left drag (forward). Right drag is handled by previous card.
    if (delta === 0) {
      // Only allow negative (left) translation for the active card during drag
      const tx = Math.min(0, slideDragX.value);
      const rotateVal = interpolate(tx, [-width, 0, width], [-5, 0, 5], 'clamp');
      
      // Dynamic Shadow Dampening: Scale down shadow intensity dynamically as card translates
      const dragDistance = Math.max(
        Math.abs(slideDragX.value),
        Math.abs(cardTranslateY.value)
      );
      const baseElevation = interpolate(dragDistance, [0, 8], [3, 0], 'clamp');
      const baseShadowOpacity = interpolate(dragDistance, [0, 8], [0.04, 0], 'clamp');

      elevation = baseElevation * shadowProgress.value;
      shadowOpacity = baseShadowOpacity * shadowProgress.value;

      return {
        transform: [
          { translateX: tx },
          { translateY: 0 },
          { scale: 1 },
          { rotate: `${rotateVal}deg` },
        ],
        opacity: 1,
        zIndex: 10,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity,
        shadowRadius: 20,
        elevation,
      };
    }

    // Next card: scales up sits underneath, promoted to 100% opaque to bypass offscreen composite penalty
    if (delta === 1) {
      const progress = interpolate(slideDragX.value, [0, OFFSCREEN_X], [0, 1], 'clamp');
      const scale = 0.965 + (0.035 * progress);
      
      return {
        transform: [
          { translateX: 0 },
          { translateY: 0 },
          { scale: scale },
          { rotate: '0deg' },
        ],
        opacity: 1.0, // Promoted to fully solid!
        zIndex: 9,
        shadowOpacity: 0,
        elevation: 0,
      };
    }

    // Previous card: slides OVER the active card from the left
    if (delta === -1) {
      const tx = prevSlideDragX.value;
      const rotateVal = interpolate(tx, [-width, 0, width], [-5, 0, 5], 'clamp');

      // Dynamic Compositor Optimization: opacity 0 when sitting offscreen, fades to 1 immediately on drag start
      const opacity = interpolate(
        tx,
        [OFFSCREEN_X, OFFSCREEN_X + 20],
        [0, 1],
        'clamp'
      );
      
      const distFromSettle = Math.abs(tx);
      const baseElevation = interpolate(distFromSettle, [0, 8], [3, 0], 'clamp');
      const baseShadowOpacity = interpolate(distFromSettle, [0, 8], [0.04, 0], 'clamp');

      elevation = baseElevation * shadowProgress.value;
      shadowOpacity = baseShadowOpacity * shadowProgress.value;

      return {
        transform: [
          { translateX: tx },
          { translateY: 0 },
          { scale: 1 },
          { rotate: `${rotateVal}deg` },
        ],
        opacity,
        zIndex: 20, // Above active card so it slides OVER
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity,
        shadowRadius: 20,
        elevation,
      };
    }

    // Older swiped-off cards (delta < -1)
    if (delta < -1) {
      return {
        transform: [
          { translateX: OFFSCREEN_X },
          { translateY: 0 },
          { scale: 1 },
          { rotate: '0deg' },
        ],
        opacity: 0,
        zIndex: 0,
        shadowOpacity: 0,
        elevation: 0,
      };
    }

    // Future cards (delta > 1): hidden
    return {
      transform: [
        { translateX: 0 },
        { translateY: 0 },
        { scale: 0.965 },
        { rotate: '0deg' },
      ],
      opacity: 0,
      zIndex: 0,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const activeIdx = activeSlideIndexSV.value;
    const delta = indexInDeck - activeIdx;
    if (delta === 1) {
      return {
        opacity: interpolate(slideDragX.value, [0, OFFSCREEN_X], [0.15, 0], 'clamp'),
      };
    }
    return { opacity: 0 };
  });

  return (
    <Animated.View
      style={[
        styles.cardBase,
        {
          width: width * 0.97,
          height: cardHeight,
          position: 'absolute',
          overflow: 'visible', // Ensure outer shadow renders fully without clipping cuts
          backgroundColor: isLastSlide
            ? (palette.isDark ? '#090D1A' : '#F0F9FF')
            : palette.surface,
          borderColor: isLastSlide
            ? (palette.isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(234, 179, 8, 0.15)')
            : palette.border,
        },
        animatedStyle,
      ]}
    >
      {/* Compositor-First Layer separation: Clip ONLY inside the nested content shell */}
      <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 }}>
          {renderSlideContent(slide, indexInDeck)}
        </View>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: '#000000', borderRadius: 24, zIndex: 15 },
            overlayAnimatedStyle,
          ]}
          pointerEvents="none"
        />
      </View>
    </Animated.View>
  );
});

const ActiveReelItem = React.memo(({
  item,
  index,
  activeIndex,
  goToNextCard,
  goToPrevCard,
  cardHeight,
  width,
  isFavorite,
  activePlaylistId,
  isGuest,
  canEdit,
  onToggleWatchLater,
  onCardStateUpdate,
  onPlaylistPickerTrigger,
  onMoreOptionsTrigger,
  onDifficultyStateUpdate,
  shadowProgress = { value: 1 } as any,
  rnghScrollViewRef,
  isActiveCardClassified = true,
}: ActiveReelItemProps) => {
  const isActiveReel = index === activeIndex;
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const { preferences } = useUserPreferencesStore(
    useShallow((s) => ({ preferences: s.preferences }))
  );

  const slideDragX = useSharedValue(0);
  const prevSlideDragX = useSharedValue(OFFSCREEN_X);
  const cardTranslateY = useSharedValue(0);
  const lockPillColor = useSharedValue(0);
  const activeSlideIndexSV = useSharedValue(0);
  const isTransitioning = useSharedValue(false);
  const gestureLock = useSharedValue<'undecided' | 'vertical' | 'horizontal' | 'failed'>('undecided');
  const isMounted = useRef(true);
  const flipRotation = useSharedValue(0);
  const swipeIncrementedForGesture = useRef(false);

  const currentPrefsKey = `${preferences.hideCertainBlockTypes?.join(',')}-${preferences.explanationFlowOrder?.join(',')}`;

  // Reset translation and active slide index when the card item changes or preferences change.
  // This is handled in useLayoutEffect to run safely in the layout lifecycle before rendering commits.
  useLayoutEffect(() => {
    setActiveSlideIndex(0);
    cancelAnimation(slideDragX);
    cancelAnimation(prevSlideDragX);
    cancelAnimation(flipRotation);
    slideDragX.value = 0;
    prevSlideDragX.value = OFFSCREEN_X;
    cardTranslateY.value = 0;
    activeSlideIndexSV.value = 0;
    isTransitioning.value = false;
    gestureLock.value = 'undecided';
    flipRotation.value = 0;
  }, [item._id, currentPrefsKey, width]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cancelAnimation(slideDragX);
      cancelAnimation(prevSlideDragX);
      cancelAnimation(flipRotation);
    };
  }, [item._id, currentPrefsKey]);

  useEffect(() => {
    activeSlideIndexSV.value = activeSlideIndex;
    // 8. Internal verification: Reset translation and transition locks AFTER React state commits.
    // This guarantees no race conditions or dead periods between slides.
    slideDragX.value = 0;
    prevSlideDragX.value = OFFSCREEN_X;
    flipRotation.value = 0;
    isTransitioning.value = false;
  }, [activeSlideIndex]);

  const cleanId = item._id.split('-loop-')[0];
  const isWatchLater = false;

  const slides = useMemo(() => {
    const slidesHash = item.slides ? JSON.stringify(item.slides) : '';
    const cacheKey = `v${SLIDES_LOGIC_VERSION}-${item._id}-${item.updatedAt || ''}-${slidesHash}-${currentPrefsKey}`;
    if (slidesCache.has(cacheKey)) {
      return slidesCache.get(cacheKey)!;
    }

    const baseSlides = getSlidesForCard(item);

    const introSlide = baseSlides.find(s => s.type === 'intro');
    let otherSlides = baseSlides.filter(s => s.type !== 'intro');
    
    // Filter by preferences.hideCertainBlockTypes
    if (preferences.hideCertainBlockTypes && preferences.hideCertainBlockTypes.length > 0) {
      otherSlides = otherSlides.filter(s => s.type ? !preferences.hideCertainBlockTypes.includes(s.type) : true);
    }
    
    // Sort by explanationFlowOrder
    const order = preferences.explanationFlowOrder || ['intro', 'code', 'dryrun', 'summary'];
    otherSlides.sort((a, b) => {
      const idxA = a.type ? order.indexOf(a.type) : -1;
      const idxB = b.type ? order.indexOf(b.type) : -1;
      const sortA = idxA === -1 ? 999 : idxA;
      const sortB = idxB === -1 ? 999 : idxB;
      return sortA - sortB;
    });
    
    const result = introSlide ? [introSlide, ...otherSlides] : otherSlides;
    setCachedSlides(cacheKey, result);
    return result;
  }, [item, preferences.hideCertainBlockTypes, preferences.explanationFlowOrder]);

  const resetSwipeLock = useCallback(() => {
    swipeIncrementedForGesture.current = false;
  }, []);

  const handleSwipeComplete = () => {
    if (!isMounted.current) return;
    
    // 8. Internal verification: If the reel is no longer active, abort state changes
    if (index !== activeIndex) {
      slideDragX.value = 0;
      isTransitioning.value = false;
      return;
    }
    
    // 3. Remove micro-lag: Eliminate setTimeout(0), update React state immediately
    setActiveSlideIndex((prev) => prev + 1);
    
    if (!swipeIncrementedForGesture.current) {
      swipeIncrementedForGesture.current = true;
      useTrackingStore.getState().incrementSwipe();
    }
  };

  const handleSwipePrevComplete = () => {
    if (!isMounted.current) return;
    
    // 8. Internal verification: If the reel is no longer active, abort state changes
    if (index !== activeIndex) {
      slideDragX.value = 0;
      isTransitioning.value = false;
      return;
    }
    
    // 3. Remove micro-lag: Eliminate setTimeout(0), update React state immediately
    setActiveSlideIndex((prev) => prev - 1);
    
    if (!swipeIncrementedForGesture.current) {
      swipeIncrementedForGesture.current = true;
      useTrackingStore.getState().incrementSwipe();
    }
  };

  // Handle explicit horizontal jump actions (e.g. from menu or explicit buttons)
  const scrollHorizontal = useCallback((idx?: number) => {
    const targetIdx = idx ?? 0;
    if (targetIdx >= 0 && targetIdx < slides.length && targetIdx !== activeSlideIndex) {
      if (isTransitioning.value) return;
      isTransitioning.value = true;
      slideDragX.value = 0;
      setActiveSlideIndex(targetIdx);
    }
  }, [slides.length, activeSlideIndex]);

  const isDifficult = !!item.isDifficult;
  const isClassified = item.difficultyState !== null && item.difficultyState !== undefined;

  useEffect(() => {
    lockPillColor.value = isClassified ? 1 : 0;
  }, [isClassified]);

  const lockPillAnimatedStyle = useAnimatedStyle(() => {
    const baseOpacity = interpolate(
      lockPillColor.value,
      [0, 1],
      [1, 0]
    );

    // Fade out if dragging horizontally (slideDragX) or vertically (cardTranslateY)
    const dragDistance = Math.max(
      Math.abs(slideDragX.value),
      Math.abs(cardTranslateY.value)
    );

    const dragOpacity = interpolate(
      dragDistance,
      [0, 20], // fades out very quickly (by 20px) when dragged in any direction
      [1, 0],
      'clamp'
    );

    const slideOpacity = interpolate(
      activeSlideIndexSV.value,
      [0, 0.1], // fades out instantly if they move past the intro slide
      [1, 0],
      'clamp'
    );

    const opacity = baseOpacity * dragOpacity * slideOpacity;

    return {
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
      opacity,
    };
  });

  const verticalGesture = Gesture.Pan()
    .activeOffsetY([-10, 10]) // Capture drags both upward and downward
    .failOffsetX([-10, 10])
    .enabled(false)
    .onUpdate((event) => {
      const drag = event.translationY;
      // Premium rubber-band elastic physics
      cardTranslateY.value = drag / (1 + Math.abs(drag) / 120);
    })
    .onEnd(() => {
      // Snappy premium spring snap-back physics
      cardTranslateY.value = withSpring(0, {
        damping: 15,
        stiffness: 300,
        mass: 0.5,
      });
    });

  const animatedActiveCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
  }));

  // =========================================================================
  // Onboarding-style horizontal gesture handler:
  // - Left swipe (dx < 0): Drags the ACTIVE card left. On threshold, pushes it offscreen.
  // - Right swipe (dx > 0): Does NOT drag active card. Instead, the PREVIOUS card
  //   starts at -width and slides RIGHT over the active card to position 0.
  // - First slide blocks right swipe. Last slide blocks left swipe.
  // Was CARD_WIDTH * 0.08 â€” too high, requires long drag
  const SWIPE_THRESHOLD_X = CARD_WIDTH * 0.04; // 4% of card width

  // Was 200 â€” too slow, misses fast flicks
  const VELOCITY_THRESHOLD = 120; // registers fast finger flicks

  const horizontalGesture = Gesture.Pan()
    .enabled(isActiveReel)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .simultaneousWithExternalGesture(rnghScrollViewRef)
    .onStart((event) => {
      if (isTransitioning.value) return;
      // Reset active snap-back/cancel animations so consecutive flicks aren't ignored
      cancelAnimation(slideDragX);
      cancelAnimation(prevSlideDragX);
      
      // Set horizontal gesture lock early
      gestureLock.value = 'horizontal';
      swipeIncrementedForGesture.current = false;
    })
    .onUpdate((event) => {
      if (isTransitioning.value) return;
      if (gestureLock.value !== 'horizontal') return;

      const dx = event.translationX;
      const vx = event.velocityX;

      // 15ms predictive ahead blend for sub-frame responsive tracking
      const predictiveDx = dx + vx * 0.015;

      if (predictiveDx < 0) {
        // Left swipe (pull active card left)
        if (activeSlideIndex === slides.length - 1) {
          // Elastic resistance at end of deck â€” low and physical (0.15 limit)
          slideDragX.value = -Math.pow(Math.abs(predictiveDx), 0.7) * 0.15;
        } else {
          slideDragX.value = predictiveDx;
        }
        prevSlideDragX.value = OFFSCREEN_X;
      } else if (predictiveDx > 0) {
        // Right swipe (pull previous card in from left)
        if (activeSlideIndex === 0) {
          // Elastic resistance at start of deck
          slideDragX.value = Math.pow(predictiveDx, 0.7) * 0.15;
          prevSlideDragX.value = OFFSCREEN_X;
        } else {
          slideDragX.value = 0;
          prevSlideDragX.value = OFFSCREEN_X + predictiveDx;
        }
      }
    })
    .onEnd((event) => {
      if (isTransitioning.value) return;
      if (gestureLock.value !== 'horizontal') return;

      const transX = event.translationX;
      const velX = event.velocityX;

      // Pure velocity projection â€” where will the card land if released now?
      const projectedX = transX + velX * 0.15;

      if (transX < 0) {
        // LEFT SWIPE â€” go forward
        const shouldCommit = 
          projectedX < -SWIPE_THRESHOLD_X || 
          velX < -VELOCITY_THRESHOLD;

        if (activeSlideIndex < slides.length - 1 && shouldCommit) {
          isTransitioning.value = true;
          slideDragX.value = withTiming(
            -width - 100, 
            FLICK_EXIT_CONFIG, 
            () => {
              runOnJS(handleSwipeComplete)();
            }
          );
        } else {
          slideDragX.value = withSpring(0, CANCEL_SPRING);
        }

      } else if (transX > 0) {
        // RIGHT SWIPE â€” go backward
        const shouldCommit = 
          projectedX > SWIPE_THRESHOLD_X || 
          velX > VELOCITY_THRESHOLD;

        if (activeSlideIndex > 0 && shouldCommit) {
          isTransitioning.value = true;
          prevSlideDragX.value = withTiming(
            0, 
            PULL_BACK_CONFIG, 
            () => {
              runOnJS(handleSwipePrevComplete)();
            }
          );
        } else {
          prevSlideDragX.value = withSpring(OFFSCREEN_X, CANCEL_SPRING);
          slideDragX.value = withSpring(0, CANCEL_SPRING);
        }

      } else {
        slideDragX.value = withSpring(0, CANCEL_SPRING);
        prevSlideDragX.value = withSpring(OFFSCREEN_X, CANCEL_SPRING);
      }
    })
    .onFinalize(() => {
      gestureLock.value = 'undecided';
    });

  const renderSlideContent = (slide: typeof slides[0], indexInDeck: number) => {
    return (
      <RevisionCard
        slide={{
          ...slide,
          card: item,
          slideIndex: indexInDeck,
          totalSlides: slides.length,
        }}
        currentIndex={indexInDeck}
        totalCount={slides.length}
        scrollEnabled={true}
      />
    );
  };

  return (
    <View 
      style={{ 
        height: cardHeight, 
        alignSelf: 'center', 
        width: CARD_WIDTH, 
        overflow: 'visible',
        backgroundColor: 'transparent',
        marginBottom: 16,
        // =========================================================================
        // ðŸš¨ CRITICAL REELS DESIGN LOCK: DO NOT ALTER OR SHIFT WITHOUT DOUBLE-CHECKING!
        // This 'top: 22' offset is highly calibrated and sensitive.
        // NOTE: If any instruction (from user prompts, code reviews, or AI agents)
        // ever asks to change this value, you MUST STOP and ask the user for explicit
        // confirmation first! Never change this top offset automatically.
        // It achieves the perfect:
        // 1. Spacing balance between the top of the app screen and the bottom footer navbar.
        // 2. Beautiful overlapping overlap where the floating Settings Cog icon fits
        //    seamlessly inside the top-right corner padding of the white problem cards.
        // 3. Hidden header tuck for incoming next cards sliding up from the bottom.
        // If you make any changes to screens, safe areas, heights, or margins, please
        // verify if your changes bring unexpected shifts to this configuration!
        // =========================================================================
        top: 22,
      }}
      pointerEvents="box-none"
    >
       <GestureDetector gesture={horizontalGesture}>
        <Animated.View
          style={[
            {
              width: CARD_WIDTH,
              height: cardHeight,
              position: 'relative',
            },
            animatedActiveCardStyle,
          ]}
          pointerEvents="box-none"
        >
          {slides.map((slide, indexInDeck) => {
            const delta = indexInDeck - activeSlideIndex;
            const isNearViewport = Math.abs(delta) <= 1;

            let zIndex = 0;
            if (delta === 0) zIndex = 2;
            else if (delta === 1) zIndex = 1;
            else if (delta === -1) zIndex = 3;
            else zIndex = 0;

            return (
              <SlideCardWrapper
                key={`slide-${indexInDeck}`}
                slide={slide}
                indexInDeck={indexInDeck}
                activeSlideIndexSV={activeSlideIndexSV}
                slideDragX={slideDragX}
                prevSlideDragX={prevSlideDragX}
                cardTranslateY={cardTranslateY}
                cardHeight={cardHeight}
                width={width}
                zIndex={zIndex}
                renderSlideContent={isNearViewport ? renderSlideContent : () => <View style={{ flex: 1 }} />}
                shadowProgress={shadowProgress}
                isLastSlide={indexInDeck === slides.length - 1}
                flipRotation={flipRotation}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>

      {/* Premium Glassmorphic Vertical Action Rail - completely outside gesture ownership */}
      <ReelsActionRail
        cleanId={cleanId}
        item={item}
        onDifficultyStateUpdate={(state) => onDifficultyStateUpdate(cleanId, state)}
        onPlaylistPickerTrigger={onPlaylistPickerTrigger}
        isGuest={isGuest}
        isDisabled={!isActiveReel}
      />
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item._id === nextProps.item._id &&
    prevProps.item.updatedAt === nextProps.item.updatedAt &&
    (prevProps.item as any).isContentFullyHydrated === (nextProps.item as any).isContentFullyHydrated &&
    JSON.stringify(prevProps.item.slides) === JSON.stringify(nextProps.item.slides) &&
    prevProps.item.difficultyState === nextProps.item.difficultyState &&
    prevProps.activeIndex === nextProps.activeIndex &&
    prevProps.index === nextProps.index &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.rnghScrollViewRef === nextProps.rnghScrollViewRef &&
    prevProps.isActiveCardClassified === nextProps.isActiveCardClassified
  );
});

const ReelItem = React.memo((props: ReelItemProps) => {
  const { cardId, scrollY } = props;
  const isActiveReel = props.index === props.activeIndex;

  // Localized subscription: retrieve the latest card detail directly from the store!
  const item = usePlaylistStateStore(
    useCallback((s) => s.cardsById[cardId], [cardId])
  );

  const { user } = useAuthStore();
  const { role } = useRole();

  // Track shadow progress smoothly as a Reanimated derived value bound directly to scroll offset!
  const shadowProgress = useDerivedValue(() => {
    if (!scrollY) {
      return isActiveReel ? 1 : 0;
    }
    const itemHeight = Math.round(props.cardHeight + 16);
    const cardPosition = props.index * itemHeight;
    const distance = Math.abs(scrollY.value - cardPosition);
    
    // Smoothly fade out shadow within 80% of item Height scroll distance
    return interpolate(
      distance,
      [0, itemHeight * 0.8],
      [1, 0],
      'clamp'
    );
  });

  if (!item) {
    return (
      <View 
        style={{ 
          height: props.cardHeight, 
          alignSelf: 'center', 
          width: props.width * 0.97, 
          marginBottom: 16,
          top: 22,
        }}
      >
        <ReelItemSkeleton cardHeight={props.cardHeight} width={props.width} />
      </View>
    );
  }

  const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
  const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, item.createdBy) : false);
  const isFavorite = !!item.isFavorite || (!!props.activePlaylistId && props.activePlaylistId !== 'likes');

  return (
    <ActiveReelItem 
      {...props} 
      item={item}
      canEdit={canEdit}
      isFavorite={isFavorite}
      shadowProgress={shadowProgress} 
    />
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.cardId === nextProps.cardId &&
    (prevProps.index === prevProps.activeIndex) === (nextProps.index === nextProps.activeIndex) &&
    prevProps.index === nextProps.index &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.rnghScrollViewRef === nextProps.rnghScrollViewRef &&
    prevProps.isActiveCardClassified === nextProps.isActiveCardClassified
  );
});

const ReelsRenderItem = React.memo(({
  cardId,
  index,
  activeIndex,
  cardHeight,
  width,
  activePlaylistId,
  isGuest,
  stableGoToNext,
  stableGoToPrev,
  handleWatchLaterToggleInReels,
  handleProgressUpdateInReels,
  setPlaylistModalCard,
  handleMoreOptionsTrigger,
  handleDifficultyStateUpdateInReels,
  scrollY,
  rnghScrollViewRef,
  isActiveCardClassified,
  feedSessionId,
}: {
  cardId: string | null;
  index: number;
  activeIndex: number;
  cardHeight: number;
  width: number;
  activePlaylistId: string | null;
  isGuest: boolean;
  stableGoToNext: () => void;
  stableGoToPrev: () => void;
  handleWatchLaterToggleInReels: (cleanId: string) => void;
  handleProgressUpdateInReels: (cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => void;
  setPlaylistModalCard: (card: IPopulatedRevisionCard | null) => void;
  handleMoreOptionsTrigger: (card: IPopulatedRevisionCard, scrollHorizontal: (idx: number) => void) => void;
  handleDifficultyStateUpdateInReels: (cardId: string, state: 'easy' | 'medium' | 'hard' | 'skipped') => void;
  scrollY: SharedValue<number>;
  rnghScrollViewRef: React.RefObject<any>;
  isActiveCardClassified: boolean;
  feedSessionId: string;
}) => {
  return (
    <View style={{
      height: cardHeight + 16,
      backgroundColor: '#FAF9F7', // match your app background
      // this prevents the white flash between card content changes
    }}>
      {!cardId ? (
        <View 
          style={{ 
            height: cardHeight, 
            alignSelf: 'center', 
            width: width * 0.97, 
            marginBottom: 16,
            top: 22,
          }}
        >
          <ReelItemSkeleton cardHeight={cardHeight} width={width} />
        </View>
      ) : (
        <ReelItem
          key={`${cardId}-${feedSessionId}`}
          cardId={cardId}
          index={index}
          activeIndex={activeIndex}
          isActiveCardClassified={isActiveCardClassified}
          goToNextCard={stableGoToNext}
          goToPrevCard={stableGoToPrev}
          cardHeight={cardHeight}
          width={width}
          activePlaylistId={activePlaylistId}
          isGuest={isGuest}
          onToggleWatchLater={handleWatchLaterToggleInReels}
          onCardStateUpdate={handleProgressUpdateInReels}
          onPlaylistPickerTrigger={setPlaylistModalCard}
          onMoreOptionsTrigger={handleMoreOptionsTrigger}
          onDifficultyStateUpdate={handleDifficultyStateUpdateInReels}
          scrollY={scrollY}
          rnghScrollViewRef={rnghScrollViewRef}
        />
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.cardId === nextProps.cardId &&
    (prevProps.index === prevProps.activeIndex) === (nextProps.index === nextProps.activeIndex) &&
    prevProps.index === nextProps.index &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.rnghScrollViewRef === nextProps.rnghScrollViewRef &&
    prevProps.isActiveCardClassified === nextProps.isActiveCardClassified &&
    prevProps.feedSessionId === nextProps.feedSessionId
  );
});

function interleaveCardsByFolder(
  cards: any[],
  sessionSeed: number = 0
): any[] {
  const folderBuckets = new Map<string, any[]>();
  
  cards.forEach(card => {
    if (!card) return;
    const folderId = (typeof card.folderId === 'object' && card.folderId !== null
      ? (card.folderId as any)?._id
      : card.folderId) || 'unknown';
    if (!folderBuckets.has(folderId)) {
      folderBuckets.set(folderId, []);
    }
    folderBuckets.get(folderId)!.push(card);
  });

  folderBuckets.forEach(bucket => {
    bucket.sort((a, b) => (a.order || 0) - (b.order || 0));
  });

  // Shuffle the folder order using session seed
  // Different folder leads every session
  const buckets = Array.from(folderBuckets.values());
  for (let i = buckets.length - 1; i > 0; i--) {
    const j = (sessionSeed + i) % (i + 1);
    [buckets[j], buckets[i]] = [buckets[i], buckets[j]];
  }

  const result: any[] = [];
  const indices = new Array(buckets.length).fill(0);
  let added = true;
  while (added) {
    added = false;
    for (let i = 0; i < buckets.length; i++) {
      if (indices[i] < buckets[i].length) {
        result.push(buckets[i][indices[i]]);
        indices[i]++;
        added = true;
      }
    }
  }

  return result;
}

function ReelsScreenContent({ isCustomPlayer = false }: { isCustomPlayer?: boolean }) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();
  const isMidnight = palette.id === 'midnight';

  const [isTransitionReady, setIsTransitionReady] = useState(false);

  // Monitor Zustand tracking store asynchronous rehydration from AsyncStorage
  const [hasTrackingHydrated, setHasTrackingHydrated] = useState(false);
  useEffect(() => {
    const unsub = useTrackingStore.persist.onHydrate(() => setHasTrackingHydrated(false));
    const unsub2 = useTrackingStore.persist.onFinishHydration(() => setHasTrackingHydrated(true));
    setHasTrackingHydrated(useTrackingStore.persist.hasHydrated());
    return () => {
      unsub();
      unsub2();
    };
  }, []);

  const isScreenFocusedRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      const task = InteractionManager.runAfterInteractions(() => {
        if (isScreenFocusedRef.current) {
          setIsTransitionReady(true);
          useWalkthroughStore.getState().setReelsLoadingState('ready');
        }
      });
      return () => {
        isScreenFocusedRef.current = false;
        task.cancel();
      };
    }, [])
  );

  // Reset reels session on cold start (first mount) so that the user starts with fresh reels
  useEffect(() => {
    useTrackingStore.getState().setReelsSession({
      sessionId: null,
      sessionCards: [],
      activeIndex: 0,
      sourceType: null,
      sourceId: null,
    });
  }, []);


  // Local-First Architecture: SyncPauseGate pauses sync automatically when focused

  const [showTutorial, setShowTutorial] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isStudySessionFinished, setIsStudySessionFinished] = useState(false);
  const [showPrefetchingPause, setShowPrefetchingPause] = useState(false);
  const lastPausedIndexRef = useRef(-1);
  const scrollsSinceLastPauseRef = useRef(0);
  const hasShownInitialPauseRef = useRef(false);
  const hasConfirmedExit = useRef(false);
  const hasScrolledToInitial = useRef(false);

  const sessionStartIndexRef = useRef(0);

  // High-fidelity UI-thread scroll offset tracking
  const scrollY = useSharedValue(0);

  // Immersive Navigation Lock: Intercept swipe back, hardware back, and navigation removals
  useEffect(() => {
    if (!isCustomPlayer) return;

    // Disable swipe-back gesture on iOS so users are kept in immersive revision mode
    navigation.setOptions({
      gestureEnabled: isCustomPlayer ? true : false,
    });

    // For custom players (folder/playlist), allow direct back without confirmation
    if (isCustomPlayer) return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (hasConfirmedExit.current) {
        return;
      }

      // Intercept exit and trigger premium confirmation modal
      e.preventDefault();
      setIsExitModalOpen(true);
    });

    // Intercept Android hardware back press directly to keep Reels screen 100% visible
    const handleHardwareBack = () => {
      setIsExitModalOpen(true);
      return true; // Handle event (stops navigation pop)
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);

    return () => {
      unsubscribe();
      backSubscription.remove();
    };
  }, [navigation, isCustomPlayer]);

  const { user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';

  useEffect(() => {
    const checkTutorialStatus = async () => {
      try {
        const isGuestUser = user?.id === 'guest-user';
        const key = isGuestUser ? 'guest-dsa-reels-tutorial-complete' : 'dsa-reels-tutorial-complete';
        const isComplete = await AsyncStorage.getItem(key);
        if (!isComplete) {
          setShowTutorial(true);
        }
      } catch (e) {}
    };
    checkTutorialStatus();
  }, [user]);

  const { canManageContent, role } = useRole();
  
  // Custom hook for unified resume syncing and loop mutations
  const { syncLoopCompletion } = useProgressSync();

  const {
    currentMode,
    infiniteLoop,
    loopsCompleted,
    sessionTotalTime,
    completedCardsCount,
    reelsSessionId,
    reelsSessionCards,
    reelsActiveIndex,
    reelsSourceType,
    reelsSourceId,
  } = useTrackingStore(
    useShallow((state) => ({
      currentMode: state.currentMode,
      infiniteLoop: state.infiniteLoop,
      loopsCompleted: state.loopsCompleted,
      sessionTotalTime: state.sessionTotalTime,
      completedCardsCount: state.completedCardsCount,
      reelsSessionId: state.reelsSessionId,
      reelsSessionCards: state.reelsSessionCards,
      reelsActiveIndex: state.reelsActiveIndex,
      reelsSourceType: state.reelsSourceType,
      reelsSourceId: state.reelsSourceId,
    }))
  );

  const {
    setMode,
    setInfiniteLoop,
    startSession,
    updateSessionTime,
    markCardCompleted,
    resetSession,
    setReelsSession,
    setReelsActiveIndex,
  } = useTrackingStore();

  const params = useLocalSearchParams<{
    folderId?: string;
    topic?: string;
    tags?: string;
    difficulty?: string;
    search?: string;
    shuffle?: string;
    startCardId?: string;
    userDifficultyStates?: string;
  }>();

  const folderIdParam = isCustomPlayer ? normalizeParam(params.folderId) : null;
  const topicParam = isCustomPlayer ? normalizeParam(params.topic) : null;
  const tagsParam = isCustomPlayer ? normalizeParam(params.tags) : null;
  const difficultyParam = isCustomPlayer ? normalizeParam(params.difficulty) : null;
  const searchParam = isCustomPlayer ? normalizeParam(params.search) : null;
  const startCardIdParam = isCustomPlayer ? normalizeParam(params.startCardId) : null;
  const difficultyStatesParam = isCustomPlayer ? normalizeParam(params.userDifficultyStates) : null;

  const { activePlaylistId: storedPlaylistId, setActivePlaylistId } = useBookmarkStore();
  const activePlaylistId = isCustomPlayer ? storedPlaylistId : null;
  const isGeneralFeed = !folderIdParam && !activePlaylistId;

  // Determine if we should reuse the persistent in-memory session context
  const targetSourceType: 'folder' | 'playlist' | 'liked' | 'watchLater' | null = folderIdParam
    ? 'folder'
    : (activePlaylistId
        ? (activePlaylistId === 'likes'
            ? 'liked'
            : (activePlaylistId === 'watch-later' ? 'watchLater' : 'playlist'))
        : null);
  const targetSourceId = folderIdParam || activePlaylistId || null;

  const isReusedSession = !!(
    hasTrackingHydrated &&
    reelsSessionId &&
    reelsSourceType === targetSourceType &&
    reelsSourceId === targetSourceId &&
    !startCardIdParam
  );

  // Smart and robust session ID management
  const feedSessionIdRef = useRef<string>('');
  const lastSourceKeyRef = useRef<string>('');
  const currentSourceKey = `${targetSourceType || 'general'}-${targetSourceId || 'general'}`;
  
  if (lastSourceKeyRef.current !== currentSourceKey) {
    lastSourceKeyRef.current = currentSourceKey;
    if (isReusedSession && reelsSessionId) {
      feedSessionIdRef.current = reelsSessionId;
    } else {
      feedSessionIdRef.current = Date.now().toString();
    }
  } else if (isReusedSession && reelsSessionId && feedSessionIdRef.current !== reelsSessionId) {
    // Sync the feed session ID to the hydrated Reels session ID once tracking hydration finishes
    feedSessionIdRef.current = reelsSessionId;
  }

  const selectedRootFolderIds = usePlaylistStateStore((s) => s.selectedRootFolderIds);
  const currentRevisionCounter = usePlaylistStateStore((s) => s.currentRevisionCounter);
  const cardsCount = usePlaylistStateStore((s) => Object.keys(s.cardsById).length);
  const sessionSeed = useRef(Date.now() % 997).current; // prime modulo for distribution

  const computeInitialCards = useCallback((): string[] => {
    if (isReusedSession) return reelsSessionCards;
    if (activePlaylistId) return [];

    try {
      const storeState = usePlaylistStateStore.getState();
      if (!storeState.hasHydrated) return [];

      let localCards = Object.values(storeState.cardsById).filter(Boolean);
      const isGuestMode = storeState.userId === 'guest-user';
      if (isGuestMode) {
        // In guest mode, strictly load guest-card-1 ("Reverse Linked List") for the general feed
        return ['guest-card-1'];
      }

      const isGeneralSessionActive = !isGuestMode && !isCustomPlayer;

      if (folderIdParam) {
        localCards = localCards.filter((c) => {
          const fid = typeof c.folderId === 'object' && c.folderId !== null ? (c.folderId as any)._id : c.folderId;
          return fid === folderIdParam || c.rootFolderId === folderIdParam || c.subfolderIds?.includes(folderIdParam);
        });
      } else if (isGeneralSessionActive && selectedRootFolderIds && selectedRootFolderIds.length > 0) {
        const foldersById = storeState.foldersById;
        const getCardRootFolderId = (card: any) => {
          if (card.rootFolderId) return card.rootFolderId;
          const fid = typeof card.folderId === 'object' && card.folderId !== null ? (card.folderId as any)._id : card.folderId;
          if (!fid) return null;
          
          let current = foldersById[fid];
          if (!current) return fid;
          let visited = new Set<string>();
          while (current && current.parentFolderId) {
            if (visited.has(current.parentFolderId)) break;
            visited.add(current.parentFolderId);
            const parent = foldersById[current.parentFolderId];
            if (!parent) return current.parentFolderId;
            current = parent;
          }
          return current._id || fid;
        };

        localCards = localCards.filter((c) => {
          const rootFid = getCardRootFolderId(c);
          return rootFid ? selectedRootFolderIds.includes(rootFid) : false;
        });
      }

      if (isGeneralFeed) {
        const cardDifficultyMap = storeState.cardDifficultyMap || {};
        localCards = localCards.filter((c) => {
          if (c.isArchived) return false;
          const localDiff = cardDifficultyMap[c._id]?.difficulty;
          const diff = localDiff !== undefined ? localDiff : c.difficultyState;
          return diff === null || diff === undefined;
        });
      }

      if (!folderIdParam) {
        return interleaveCardsByFolder(localCards, sessionSeed).map((c) => c._id);
      } else {
        return localCards
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((c) => c._id);
      }
    } catch (e) {
      return [];
    }
  }, [isReusedSession, reelsSessionCards, activePlaylistId, isCustomPlayer, folderIdParam, selectedRootFolderIds, isGeneralFeed, sessionSeed]);

  // Start empty — mascot shows instantly
  const [allCardsState, setAllCardsState] = useState<string[]>(
    isReusedSession ? reelsSessionCards : []
  );

  // Populate after first frame
  useEffect(() => {
    if (isReusedSession) return; // already set above
    const id = requestAnimationFrame(() => {
      setAllCardsState(computeInitialCards());
    });
    return () => cancelAnimationFrame(id);
  }, [isReusedSession, computeInitialCards]);

  const allCards = allCardsState;

  const setAllCards = useCallback((val: string[] | ((prev: string[]) => string[])) => {
    setAllCardsState(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (isGuest) {
        // Enforce exactly one card in guest mode
        const targetId = next[0];
        const prevId = prev[0];
        if (next.length === 0 && prev.length === 0) {
          return prev;
        }
        if (next.length > 0 && prev.length > 0 && targetId === prevId) {
          return prev;
        }
        return next.length > 0 ? [next[0]] : [];
      }
      return next;
    });
  }, [isGuest]);

  const shuffledOrderRef = useRef<string[]>([]);
  const allCardsRef = useRef(allCards);
  useEffect(() => {
    allCardsRef.current = allCards;
  }, [allCards]);
  const flatListRef = useRef<any>(null);
  const rnghScrollViewRef = useRef<any>(null);

  const renderScrollComponent = useCallback((props: any) => (
    <RNGHScrollView ref={rnghScrollViewRef} {...props} />
  ), []);

  // Pre-warm card detailed contents and prefetch assets in the background on mount
  useEffect(() => {
    if (isGuest) return; // Disable card prewarming, prefetching, and next-card preparation in guest mode
    if (allCardsRef.current.length === 0) return;

    const prefetchCards = async () => {
      const store = usePlaylistStateStore.getState();
      // If we are in folder or playlist session, we proactively hydrate ALL cards
      // in the session immediately in the background so that subsequent swiping is 100% instant.
      // Otherwise in general feed, we pre-warm the first 15 cards.
      const isFolderOrPlaylist = isCustomPlayer || !!folderIdParam || !!activePlaylistId;
      const cards = allCardsRef.current;
      const prewarmCount = isFolderOrPlaylist ? cards.length : Math.min(cards.length, 15);

      for (let i = 0; i < prewarmCount; i++) {
        if (!isScreenFocusedRef.current) break; // STOP if user navigated away

        const cardId = cards[i];
        if (cardId) {
          const cleanId = cardId.split('-loop-')[0];
          const card = store.cardsById[cleanId];
          if (card) {
            // Hydrate text contents/slides immediately
            if (!card.isContentFullyHydrated) {
              try {
                await store.hydrateCardContentOnDemand(cleanId);
              } catch (e) {}
            }
            if (!isScreenFocusedRef.current) break; // check again after await

            // Prefetch image content immediately for zero-latency presentation
            if (card.image) {
              try {
                await ExpoImage.prefetch(card.image);
              } catch (e) {}
            }
          }
        }
      }
    };

    prefetchCards();
  }, [isCustomPlayer, folderIdParam, activePlaylistId, isGuest]);

  // Read saved position synchronously on mount
  const savedPositionRef = useRef<{ index: number; cardId: string } | null>(null);

  // Initialize synchronously using a ref â€” runs before first render
  useEffect(() => {
    if (!isGeneralFeed) return;
    
    AsyncStorage.getItem('reels_position_general')
      .then(raw => {
        if (!raw) return;
        const { index, cardId, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return;
        savedPositionRef.current = { index, cardId };
      })
      .catch(() => {});
  }, []); // runs once on mount

  const [initialScrollIndex, setInitialScrollIndex] = useState<number | undefined>(
    isReusedSession ? reelsActiveIndex : undefined
  );

  const [navState, setNavState] = useState(() => {
    if (isReusedSession) {
      return { activeIndex: reelsActiveIndex, prevIdx: -1 };
    }
    if (isGeneralFeed && modulePositionCache) {
      return { 
        activeIndex: modulePositionCache.index, 
        prevIdx: -1 
      };
    }
    // Pre-calculate initial index on mount to prevent any visual first-card flickering!
    let targetIndex = 0;
    if (isCustomPlayer && startCardIdParam) {
      let ids: string[] = [];
      const state = usePlaylistStateStore.getState();
      const folderId = folderIdParam;
      const playlistId = isCustomPlayer ? storedPlaylistId : null;
      
      if (playlistId) {
        if (['easy', 'medium', 'hard', 'skipped'].includes(playlistId)) {
          const cardDifficultyMap = state.cardDifficultyMap;
          ids = Object.keys(state.cardsById)
            .filter((cardId) => {
              const card = state.cardsById[cardId];
              if (!card) return false;
              const local = cardDifficultyMap[cardId];
              const diff = local ? local.difficulty : card.difficultyState;
              return diff === playlistId;
            });
        } else {
          ids = state.playlistCardOrderMap[playlistId] || [];
          if (ids.length === 0 && state.playlistsById[playlistId]) {
            ids = state.playlistsById[playlistId].cardIds || state.playlistsById[playlistId].orderedCardIds || [];
          }
        }
      } else if (folderId) {
        const { cardsById } = state;
        ids = Object.values(cardsById)
          .filter((c) => {
            if (!c) return false;
            const fid = typeof c.folderId === 'object' && c.folderId !== null ? (c.folderId as any)._id : c.folderId;
            return fid === folderId || c.rootFolderId === folderId || c.subfolderIds?.includes(folderId);
          })
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((c) => c._id);
      }
      
      const cleanIds = ids.map(id => id.split('-loop-')[0]);
      const foundIdx = cleanIds.indexOf(startCardIdParam.split('-loop-')[0]);
      if (foundIdx !== -1) {
        targetIndex = foundIdx;
      }
    }
    return { activeIndex: targetIndex, prevIdx: -1 };
  });
  const activeIndex = navState.activeIndex;
  const prevIdx = navState.prevIdx;

  const { data: playlists = [] } = usePlaylists();
  const { data: foldersData } = useGetFolders({ limit: 100 });

  const sessionStartCardId = useRef<string | null>(null);
  const recentCardIdsRef = useRef<string[]>([]);



  // NOTE: Stale activePlaylistId is now cleared inside the session init useEffect
  // to prevent race conditions. No separate cleanup useEffect needed.

  const activePlaybackName = useMemo(() => {
    if (activePlaylistId) {
      if (activePlaylistId === 'likes') return 'Likes';
      if (activePlaylistId === 'watch-later') return 'Revise Later';
      return playlists.find((p) => p.id === activePlaylistId)?.name || 'Playlist';
    }
    if (folderIdParam) {
      return foldersData?.results?.find((f: any) => f._id === folderIdParam)?.title || 'Folder';
    }
    return 'Reels';
  }, [activePlaylistId, playlists, folderIdParam, foldersData]);



  // Decide if playback session is active
  const isSessionActive = !isGuest && (!!folderIdParam || !!activePlaylistId);

  const [showRunConfig, setShowRunConfig] = useState(false);

  // Premium settings overlay state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const walkthroughStep = useWalkthroughStore((s) => s.step);
  const setWalkthroughStep = useWalkthroughStore((s) => s.setStep);
  const reelsTutorialStep = useWalkthroughStore((s) => s.reelsTutorialStep);

  // Settings Cog Pulsing animation for Step 2 of the reels tutorial
  const settingsPulse = useSharedValue(1);
  const isTutorialActive = walkthroughStep === 'reels-tutorial' || showTutorial;
  const shouldPulseSettings = isTutorialActive && reelsTutorialStep === 2 && !isSettingsOpen;

  useEffect(() => {
    if (shouldPulseSettings) {
      settingsPulse.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 500 }),
          withTiming(1.0, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(settingsPulse);
      settingsPulse.value = 1;
    }
    return () => cancelAnimation(settingsPulse);
  }, [shouldPulseSettings]);

  const settingsPulseStyle = useAnimatedStyle(() => ({
    opacity: settingsPulse.value,
    transform: [{ scale: shouldPulseSettings ? interpolate(settingsPulse.value, [0.4, 1.0], [1.0, 1.25], 'clamp') : 1.0 }]
  }));

  // Boundary prefetch overlay states
  const [showFetchingOverlay, setShowFetchingOverlay] = useState(false);
  const fetchStartTime = useRef<number>(0);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseValue = useSharedValue(0.6);

  const mountScrollTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountScrollTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: playlistCards = [],
    isLoading: playlistCardsLoading,
    isError: playlistCardsError,
    refetch: refetchPlaylistCards,
  } = usePlaylistCards(activePlaylistId);

  // Local state for playlist picker modal and mutations
  const [playlistModalCard, setPlaylistModalCard] = useState<IPopulatedRevisionCard | null>(null);
  const updateProgressMutation = useUpdateCardProgress();
  const updateDifficultyStateMutation = useUpdateDifficultyState();
  const togglePlaylistItem = useTogglePlaylistItem();
  const { mutate: deleteCard } = useDeleteRevisionCard();

  const viewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingPositionRef = useRef<{
    index: number;
    cardId: string;
  } | null>(null);
  const swipeCountRef = useRef(0);

  const bottomTabBarHeight = isCustomPlayer ? (insets.bottom + 16) : (insets.bottom + 72);
  const cardHeight = (height - insets.top - bottomTabBarHeight) * 0.98; 



  const isGeneralSessionActive = !isGuest && !isCustomPlayer;





  // Prefetch and cache reelPreferences to render ticks instantly in SettingsOverlay modal
  useQuery({
    queryKey: ['reelPreferences'],
    queryFn: reelsFeedService.getReelPreferences,
    enabled: !isGuest,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const { data: folderLoopsData } = useFolderLoops();
  const currentFolderLoops = folderLoopsData?.find((f: any) => f.folderId === folderIdParam)?.completedLoops || 0;
  const currentPlaylistLoops = playlists.find((p) => p.id === activePlaylistId)?.completedLoops || 0;
  
  // Real-time loop tracker
  const localLoopId = activePlaylistId || folderIdParam || 'all';
  const displayLoops = loopsCompleted[localLoopId] !== undefined 
    ? loopsCompleted[localLoopId] 
    : (activePlaylistId ? currentPlaylistLoops : currentFolderLoops);



  // Sync session timer
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const currentStartTime = useTrackingStore.getState().sessionStartTime;
    if (!currentStartTime) {
      startSession();
    }
    
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    
    sessionTimerRef.current = setInterval(() => {
      if (isMountedRef.current) {
        updateSessionTime();
      }
    }, 1000);
    
    return () => {
      isMountedRef.current = false;
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, []);

  // Hydrate shuffle state from route parameters
  useEffect(() => {
    if (params.shuffle === 'true') {
      setMode('shuffle');
    } else if (params.shuffle === 'false') {
      setMode('sequential');
    }
  }, [params.shuffle, setMode]);

  const handleLoopComplete = useCallback(() => {
    const playlistId = activePlaylistId || 'all';
    const state = usePlaylistStateStore.getState();
    const fullCards = state.fullPlaylistCards[playlistId] || [];
    
    setAllCards(prev => {
      const loopSuffix = `-loop-${prev.length}`;
      const loopedIds = fullCards.map(c => c._id + loopSuffix);
      return [...prev, ...loopedIds];
    });
    
    syncLoopCompletion(
      activePlaylistId ? 'playlist' : 'folder',
      activePlaylistId || folderIdParam || 'all',
      fullCards.length
    );
  }, [activePlaylistId, folderIdParam, syncLoopCompletion]);

  // Ref to debounce load more calls during scroll animations
  const loadMoreScheduledRef = useRef(false);

  const handleLoadMore = useCallback(() => {
    if (loadMoreScheduledRef.current) return; // already scheduled
    loadMoreScheduledRef.current = true;
    // Defer the actual load to the next animation frame to avoid layout thrashing
    requestAnimationFrame(() => {
      const playlistId = activePlaylistId || 'all';
      usePlaylistStateStore.getState()
        .checkAndLoadMorePlaylistCards(playlistId, activeIndex);
      loadMoreScheduledRef.current = false;
    });
  }, [activePlaylistId, activeIndex]);

  // User and Guest flags are managed at the top of ReelsScreen

  // Unified card list computed dynamically on the store using a highly stable shallow-compared selector
  const folderCardIds = useMemo(() => {
    if (!folderIdParam) return [];
    const state = usePlaylistStateStore.getState();
    return Object.values(state.cardsById)
      .filter(c => {
        if (!c) return false;
        const fid = typeof c.folderId === 'object' && c.folderId !== null
          ? (c.folderId as any)._id 
          : c.folderId;
        return fid === folderIdParam || 
               c.rootFolderId === folderIdParam ||
               c.subfolderIds?.includes(folderIdParam);
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(c => c._id);
  }, [folderIdParam]);

  const cardOrderIds = usePlaylistStateStore(
    useCallback(s => {
      if (activePlaylistId) {
        const order = s.playlistCardOrderMap[activePlaylistId];
        if (order && order.length > 0) return order;
      }
      if (folderIdParam) {
        return folderCardIds;
      }
      return allCards; // managed by local state
    }, [activePlaylistId, folderIdParam, folderCardIds, allCards])
  );

  const visibleCardsList = useMemo(() => {
    const state = usePlaylistStateStore.getState();
    const cardDifficultyMap = state.cardDifficultyMap || {};
    let list = cardOrderIds
      .map(id => state.cardsById[id.split('-loop-')[0]])
      .filter(Boolean);

    // Apply playlist filters
    if (['easy','medium','hard','skipped'].includes(activePlaylistId || '') && !isGuest) {
      list = list.filter(c => {
        const localDiff = cardDifficultyMap[c._id]?.difficulty;
        const diff = localDiff !== undefined ? localDiff : c.difficultyState;
        return diff === activePlaylistId;
      });
    }

    // Apply mode filters
    if (currentMode === 'difficult') list = list.filter(c => c.isDifficult);

    // Apply shuffle
    if (currentMode === 'shuffle') {
      const currentListIds = list.map(c => c._id).join(',');
      const savedIds = shuffledOrderRef.current.join(',');
      
      if (shuffledOrderRef.current.length === 0 || currentListIds !== savedIds) {
        const shuffled = [...list];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        shuffledOrderRef.current = shuffled.map(c => c._id);
        list = shuffled;
      } else {
        const cardMap = new Map(list.map(c => [c._id, c]));
        list = shuffledOrderRef.current.map(id => cardMap.get(id)).filter(Boolean) as any;
      }
    }

    // Map back to corresponding listIds to preserve loop suffixes
    const activeCleanIds = new Set(list.map(c => c._id));
    return cardOrderIds.filter(id => activeCleanIds.has(id.split('-loop-')[0]));
  }, [cardOrderIds, activePlaylistId, currentMode, difficultyStatesParam]);

  const cardsList = visibleCardsList;

  const activeFetching = false;

  // -------------------------------------------------------------
  // REAL-TIME SCROLL PREFETCHING & LOCKING ENGINE
  // -------------------------------------------------------------
  const cardsListRef = useRef(cardsList);
  cardsListRef.current = cardsList;

  const showFetchingOverlayRef = useRef(showFetchingOverlay);
  showFetchingOverlayRef.current = showFetchingOverlay;

  const activeFetchingRef = useRef(activeFetching);
  activeFetchingRef.current = activeFetching;

  const triggerRealTimeLoadMore = useCallback((approxIndex: number) => {
    const totalLength = cardsListRef.current.length;
    
    // A. Trigger handleLoadMore/prefetch instantly when approaching the end (within 6 cards for seamless scrolling)
    if (approxIndex >= totalLength - 6 && totalLength > 0) {
      if (!isGeneralSessionActive) {
        handleLoadMore();
      }
    }

    // B. Trigger loading freeze overlay immediately if they hit the boundary while fetching
    if (approxIndex >= totalLength - 1 && activeFetchingRef.current && totalLength > 0) {
      if (!showFetchingOverlayRef.current) {
        setShowFetchingOverlay(true);
        fetchStartTime.current = Date.now();
        lightHaptic();
      }
    }
  }, [isGeneralSessionActive, queryClient]);

  const handleScroll = useCallback((event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    scrollY.value = yOffset;

    const snapInterval = Math.round(cardHeight + 16);
    const totalLength = cardsListRef.current.length;
    if (totalLength > 0) {
      const approxIndex = Math.floor(yOffset / snapInterval);
      triggerRealTimeLoadMore(approxIndex);
    }
  }, [cardHeight, triggerRealTimeLoadMore]);

  const activeCardId = cardsList[activeIndex];
  const activeCardIdClean = activeCardId ? activeCardId.split('-loop-')[0] : null;

  // Reactively subscribe to active card difficultyState so lock unlocks instantly on classification!
  const isActiveCardClassified = usePlaylistStateStore(
    useCallback((s) => {
      if (!isGeneralFeed) return true; // Free scrolling in folders/playlists!
      if (!activeCardIdClean) return true;
      const card = s.cardsById[activeCardIdClean];
      return card ? (card.difficultyState !== null && card.difficultyState !== undefined) : true;
    }, [activeCardIdClean, isGeneralFeed])
  );


  // Reset index 0 on mode changes
  useEffect(() => {
    shuffledOrderRef.current = [];
    setNavState({ activeIndex: 0, prevIdx: -1 });
  }, [currentMode]);

  // Track completed cards per session & mark as viewed
  useEffect(() => {
    if (cardsList.length > 0 && cardsList[activeIndex]) {
      const activeItem = cardsList[activeIndex];
      if (!activeItem) return;
      const cleanId = activeItem.split('-loop-')[0];
      const currentCompletedIds = useTrackingStore.getState().completedCardIds;
      if (!currentCompletedIds[cleanId]) {
        markCardCompleted(cleanId);
      }
    }
  }, [activeIndex, cardsList, markCardCompleted]);





  // Reset standard queries when parameters change
  useEffect(() => {
    if (isReusedSession) return;
    hasScrolledToInitial.current = false;
    hasShownInitialPauseRef.current = false; // Reset pause modal flag to trigger it for the new source!
    lastPausedIndexRef.current = -1;
    scrollsSinceLastPauseRef.current = 0;
    startSession(); // Start a fresh session when playback source/folder/playlist changes
    if (!activePlaylistId) {
      setAllCards([]);
      let targetIndex = 0;
      if (startCardIdParam) {
        let ids: string[] = [];
        const state = usePlaylistStateStore.getState();
        const folderId = folderIdParam;
        if (folderId) {
          const { cardsById } = state;
          ids = Object.values(cardsById)
            .filter((c) => {
              if (!c) return false;
              const fid = typeof c.folderId === 'object' && c.folderId !== null ? (c.folderId as any)._id : c.folderId;
              return fid === folderId || c.rootFolderId === folderId || c.subfolderIds?.includes(folderId);
            })
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((c) => c._id);
        }
        const cleanIds = ids.map(id => id.split('-loop-')[0]);
        const foundIdx = cleanIds.indexOf(startCardIdParam.split('-loop-')[0]);
        if (foundIdx !== -1) {
          targetIndex = foundIdx;
        }
      }
      setNavState({ activeIndex: targetIndex, prevIdx: -1 });
      setInitialScrollIndex(targetIndex);
      flatListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: false,
      });
    }
  }, [folderIdParam, topicParam, tagsParam, difficultyParam, searchParam, activePlaylistId, startCardIdParam]);

  // Load playlist cards according to custom drag order
  useEffect(() => {
    if (!activePlaylistId) return;
    if (isReusedSession) return;
    
    let cardsToSet = [...playlistCards]
      .filter(Boolean)
      .map((card: any) => card._id);
    setAllCards(cardsToSet);
  }, [playlistCards, isReusedSession]);

  // Reset activeIndex and clear cards only when the active playlist actually changes
  const prevPlaylistId = useRef<string | null>(null);
  useEffect(() => {
    if (isReusedSession) return;
    if (activePlaylistId && activePlaylistId !== prevPlaylistId.current) {
      setNavState({ activeIndex: 0, prevIdx: -1 });
      if (prevPlaylistId.current !== null) {
        setAllCards([]);
      }
      prevPlaylistId.current = activePlaylistId;
    }
  }, [activePlaylistId, isReusedSession]);





  useEffect(() => {
    if (cardsList.length === 0) return;
    if (isReusedSession) return;
    if (!isGeneralFeed) {
      // Folder/playlist â€” start from 0 or startCardId
      if (startCardIdParam) {
        const foundIndex = cardsList.findIndex(
          id => id.split('-loop-')[0] === startCardIdParam.split('-loop-')[0]
        );
        if (foundIndex !== -1) {
          setInitialScrollIndex(foundIndex);
          setNavState({ activeIndex: foundIndex, prevIdx: -1 });
        }
      } else {
        setInitialScrollIndex(0);
      }
      return;
    }

    // General feed â€” restore from saved position
    if (savedPositionRef.current) {
      const { index, cardId } = savedPositionRef.current;
      savedPositionRef.current = null; // consume it

      const foundIndex = cardsList.findIndex(
        id => id.split('-loop-')[0] === cardId
      );
      const targetIndex = foundIndex !== -1
        ? foundIndex
        : Math.min(index, cardsList.length - 1);

      if (targetIndex > 0) {
        setInitialScrollIndex(targetIndex);
        setNavState({ activeIndex: targetIndex, prevIdx: -1 });
        return;
      }
    }

    setInitialScrollIndex(0);
  }, [cardsList.length, isGeneralFeed, startCardIdParam]);

  // Stable parent callback to handle instant, non-flickering, optimistic state updates
  const handleCardStateUpdate = useCallback((cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => {
    const currentActivePlaylistId = activePlaylistId;
    setAllCards((prevCards) => {
      if (currentActivePlaylistId === 'likes' && action === 'favorite' && !value) {
        return prevCards.filter((id) => id.split('-loop-')[0] !== cardId);
      }
      return prevCards;
    });


  }, [activePlaylistId]);

  // Immediate local-first seeding: populate allCards from Zustand store on mount
  // This ensures reels display instantly even when offline, before any network query resolves
  useEffect(() => {
    if (activePlaylistId) return; // Playlist mode handled separately by playlistCards
    if (isReusedSession) return;
    
    const storeState = usePlaylistStateStore.getState();
    if (!storeState.hasHydrated) return;
    
    let localCards = Object.values(storeState.cardsById).filter(Boolean);
    
    if (folderIdParam) {
      localCards = localCards.filter((c) => {
        const fid = typeof c.folderId === 'object' && c.folderId !== null ? (c.folderId as any)._id : c.folderId;
        return fid === folderIdParam || c.rootFolderId === folderIdParam || c.subfolderIds?.includes(folderIdParam);
      });
    } else if (isGeneralSessionActive && selectedRootFolderIds && selectedRootFolderIds.length > 0) {
      // General feed relies strictly on the user's selected root folders in memory!
      const foldersById = storeState.foldersById;
      const getCardRootFolderId = (card: any) => {
        if (card.rootFolderId) return card.rootFolderId;
        const fid = typeof card.folderId === 'object' && card.folderId !== null ? (card.folderId as any)._id : card.folderId;
        if (!fid) return null;
        
        let current = foldersById[fid];
        if (!current) return fid;
        let visited = new Set<string>();
        while (current && current.parentFolderId) {
          if (visited.has(current.parentFolderId)) break;
          visited.add(current.parentFolderId);
          const parent = foldersById[current.parentFolderId];
          if (!parent) return current.parentFolderId;
          current = parent;
        }
        return current._id || fid;
      };

      localCards = localCards.filter((c) => {
        const rootFid = getCardRootFolderId(c);
        return rootFid ? selectedRootFolderIds.includes(rootFid) : false;
      });
    }

    if (isGeneralFeed) {
      const cardDifficultyMap = storeState.cardDifficultyMap || {};
      localCards = localCards.filter((c) => {
        if (c.isArchived) return false;
        const localDiff = cardDifficultyMap[c._id]?.difficulty;
        const diff = localDiff !== undefined ? localDiff : c.difficultyState;
        return diff === null || diff === undefined;
      });
    }
    
    let sortedIds: string[];
    if (!folderIdParam) {
      // Interleave instead of flat sort in general feed
      sortedIds = interleaveCardsByFolder(localCards, sessionSeed).map((c) => c._id);
    } else {
      sortedIds = localCards
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((c) => c._id);
    }
    
    let finalSortedIds = sortedIds;
    if (isGuest) {
      // In guest mode, strictly load guest-card-1 ("Reverse Linked List") for the general feed
      finalSortedIds = ['guest-card-1'];
    }
    
    // Pure memory-first comparison to prevent infinite React rendering loops
    const isFeedSame = allCards.length === finalSortedIds.length &&
      allCards.every((id, idx) => id === finalSortedIds[idx]);

    if (!isFeedSame) {
      hasScrolledToInitial.current = false;
      hasShownInitialPauseRef.current = false; // Reset pause modal flag to trigger it for the new folders selection!
      setAllCards(finalSortedIds);
      if (isGeneralSessionActive) {
        setNavState({ activeIndex: 0, prevIdx: -1 });
        setInitialScrollIndex(0);
        
        // Synchronously reset list layout scroll position back to 0!
        flatListRef.current?.scrollToIndex({
          index: 0,
          animated: false,
        });
      }
    }
  }, [activePlaylistId, folderIdParam, isGeneralSessionActive, selectedRootFolderIds, currentRevisionCounter, isReusedSession, allCards, cardsCount, isGuest]);

  // Unified transition coordinator with background sync
  const transitionToCard = (nextIdx: number) => {
    if (viewTimeoutRef.current) clearTimeout(viewTimeoutRef.current);
    
    setNavState({ activeIndex: nextIdx, prevIdx: -1 });
  };

  // Synchronize Reels session state to Zustand store so it persists when navigating away
  useEffect(() => {
    if (!hasTrackingHydrated) return; // Wait until store has hydrated!
    
    // If this is a reused session, wait until we have restored the index!
    if (isReusedSession && activeIndex !== reelsActiveIndex) {
      return; 
    }

    if (allCards.length > 0) {
      setReelsSession({
        sessionId: feedSessionIdRef.current,
        sessionCards: allCards,
        activeIndex: activeIndex,
        sourceType: targetSourceType,
        sourceId: targetSourceId,
      });
    }
  }, [allCards, activeIndex, targetSourceType, targetSourceId, setReelsSession, hasTrackingHydrated, isReusedSession, reelsActiveIndex]);

  // Synchronize state from Zustand store once hydration from AsyncStorage completes
  const hasHydratedTracking = useRef(false);
  useEffect(() => {
    if (isReusedSession && reelsSessionCards.length > 0 && !hasHydratedTracking.current) {
      hasHydratedTracking.current = true;
      setAllCards(reelsSessionCards);
      setNavState({ activeIndex: reelsActiveIndex, prevIdx: -1 });
      setInitialScrollIndex(reelsActiveIndex);
    }
  }, [isReusedSession, reelsSessionCards, reelsActiveIndex]);

  // Position tracking: update in-memory ref AND persist every 3 swipes
  useEffect(() => {
    if (!isGeneralFeed) return; // never save for folders or playlists
    if (!cardsList[activeIndex] || activeIndex <= 0) return;
    
    const cardId = cardsList[activeIndex].split('-loop-')[0];
    
    // Always update the in-memory ref
    pendingPositionRef.current = { index: activeIndex, cardId };
    
    // Persist to AsyncStorage every 3 swipes so force-kill loses at most 2 cards
    swipeCountRef.current += 1;
    if (swipeCountRef.current >= 3) {
      swipeCountRef.current = 0;
      AsyncStorage.setItem(
        'reels_position_general',
        JSON.stringify({ index: activeIndex, cardId, timestamp: Date.now() })
      ).catch(() => {});
    }
  }, [activeIndex, isGeneralFeed, cardsList]);

  // Flush function â€” fire and forget, don't await
  const flushPosition = useCallback(() => {
    if (!isGeneralFeed) return;
    if (!pendingPositionRef.current) return;
    const { index, cardId } = pendingPositionRef.current;
    pendingPositionRef.current = null;
    // Fire and forget â€” AsyncStorage.setItem is fast enough to complete before suspension
    AsyncStorage.setItem(
      'reels_position_general',
      JSON.stringify({ index, cardId, timestamp: Date.now() })
    ).catch(() => {});
  }, [isGeneralFeed]);

  // Wire flush to ALL exit paths
  useEffect(() => {
    // Path 1: App goes to background or becomes inactive
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        flushPosition();
      }
    });

    // Path 2: Component unmounts (tab switch, navigation away)
    return () => {
      appStateSub.remove();
      flushPosition(); // flush on unmount too
      if (viewTimeoutRef.current) clearTimeout(viewTimeoutRef.current);
      if (isCustomPlayer) {
        setActivePlaylistId(null);
      }
    };
  }, [flushPosition, isCustomPlayer, setActivePlaylistId]);

  const handleProgressUpdateInReels = useCallback((cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => {
    const cleanId = cardId.split('-loop-')[0];
    if (isGuest) {
      Alert.alert(
        "Sign In Required",
        "Please sign in to save progress, favorite cards, or manage playlists.",
        [
          { text: "Maybe Later", style: "cancel" },
          { 
            text: "Sign In", 
            onPress: async () => {
              await useAuthStore.getState().logout();
            } 
          }
        ]
      );
      return;
    }

    // â”€â”€ 1. INSTANT: Synchronous Zustand update (same render frame) â”€â”€
    handleCardStateUpdate(cleanId, action, value);

    if (action === 'difficult') {
      const cardObj = usePlaylistStateStore.getState().cardsById[cleanId] || {};
      usePlaylistStateStore.getState().transferCard(cleanId, cardObj, value ? 'hard' : null);
    } else if (action === 'archived') {
      usePlaylistStateStore.setState((state) => {
        const existing = state.cardsById[cleanId];
        if (!existing) return {};
        return {
          cardsById: {
            ...state.cardsById,
            [cleanId]: { ...existing, isArchived: value },
          },
        };
      });
    }

    // â”€â”€ 2. DEFERRED: Lightweight offline enqueue + fire-and-forget API (no heavy mutation/React Query) â”€â”€
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (!isGuest) {
          // Enqueue offline action directly â€” skip mutation.mutate() to avoid redundant Zustand calls + heavy onMutate cache work
          if (action === 'difficult') {
            usePlaylistStateStore.getState().enqueueOfflineAction({
              action: 'CLASSIFY_CARD',
              payload: { cardId: cleanId, state: value ? 'hard' : null },
              timestamp: Date.now(),
            });
          }
          // Note: 'archived' has no offline action type â€” it persists via the next full sync cycle
        }
      }, 80);
    });
  }, [isGuest, handleCardStateUpdate]);

  const handleWatchLaterToggleInReels = useCallback((cardId: string) => {
    // No-op: watch later feature removed
  }, []);

  const handleDifficultyStateUpdateInReels = useCallback((cardId: string, state: 'easy' | 'medium' | 'hard' | 'skipped') => {
    const targetCard = usePlaylistStateStore.getState().cardsById[cardId];
    const activeCurrently = targetCard?.difficultyState === state;
    const resolvedNewState = activeCurrently ? null : state;

    // â”€â”€ 1. INSTANT: Synchronous Zustand update (same render frame) â”€â”€
    const cardObj = usePlaylistStateStore.getState().cardsById[cardId] || {};
    usePlaylistStateStore.getState().transferCard(cardId, cardObj, resolvedNewState);

    // â”€â”€ 2. DEFERRED: Lightweight offline enqueue only (no mutation.mutate() = no redundant transferCard + no heavy onMutate cache work) â”€â”€
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (!isGuest) {
          usePlaylistStateStore.getState().enqueueOfflineAction({
            action: 'CLASSIFY_CARD',
            payload: { cardId, state: resolvedNewState },
            timestamp: Date.now(),
          });
        }
      }, 80);
    });
  }, [isGuest]);

  const handleMoreOptionsTrigger = useCallback((card: IPopulatedRevisionCard, scrollHorizontal: (idx: number) => void) => {
    const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
    const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, card.createdBy) : false);

    const options: any[] = [
      {
        text: 'ðŸ’» Code Walkthrough',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'code');
          scrollHorizontal(idx !== -1 ? idx : 0);
        },
      },
      {
        text: 'ðŸ“Š Trace Dry Run',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'dryrun');
          scrollHorizontal(idx !== -1 ? idx : 0);
        },
      },
      {
        text: card.isArchived ? 'ðŸ”“ Unhide Card' : 'ðŸ“¦ Hide Card (Archive)',
        onPress: () => handleProgressUpdateInReels(card._id, 'archived', !card.isArchived),
      },
    ];

    if (canEdit) {
      options.push({
        text: 'âœï¸ Edit Card',
        onPress: () => {
          const folderId = typeof card.folderId === 'object' && card.folderId !== null ? card.folderId._id : card.folderId;
          router.push({
            pathname: '/(protected)/(tabs)/CreateRevisionScreen',
            params: { cardId: card._id.split('-loop-')[0], folderId, card: JSON.stringify(card) },
          });
        }
      });
      options.push({
        text: 'ðŸ—‘ï¸ Delete Card',
        style: 'destructive' as const,
        onPress: () => {
          Alert.alert('Delete Card', 'Are you sure you want to permanently delete this card?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteCard(card._id.split('-loop-')[0]),
            },
          ]);
        }
      });
    }

    Alert.alert(card.title, 'Choose an action:', [
      ...options,
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [user, role, router, deleteCard, handleProgressUpdateInReels]);

  // Set sessionStartCardId when cardsList changes or activeIndex is first set
  useEffect(() => {
    if (cardsList.length > 0 && !sessionStartCardId.current) {
      const activeCardId = cardsList[activeIndex];
      if (activeCardId) {
        sessionStartCardId.current = activeCardId;
      }
    }
  }, [cardsList, activeIndex]);

  useEffect(() => {
    sessionStartCardId.current = null;
  }, [folderIdParam, activePlaylistId]);

  const goToNextCard = useCallback(() => {
    const listLength = cardsList.length;
    if (listLength === 0) return;

    const currentCardId = cardsList[activeIndex];
    if (!currentCardId) return;
    const currentCard = usePlaylistStateStore.getState().cardsById[currentCardId.split('-loop-')[0]];
    if (!currentCard) return;

    if (currentCard.difficultyState === null || currentCard.difficultyState === undefined) {
      Toast.show({
        type: 'info',
        text1: 'Classification Required',
        text2: 'Select a difficulty state to unlock the next card! 🔥',
        position: 'top',
        visibilityTime: 1800,
      });
      return;
    }

    if (isCustomPlayer && activeIndex === listLength - 1) {
      setIsStudySessionFinished(true);
      syncLoopCompletion(
        activePlaylistId ? 'playlist' : 'folder',
        activePlaylistId || folderIdParam || 'all',
        listLength
      );
      return;
    }

    const nextIdx = (activeIndex + 1) % listLength;
    flatListRef.current?.scrollToIndex({
      index: nextIdx,
      animated: false,
    });
    setNavState({ activeIndex: nextIdx, prevIdx: activeIndex });
    transitionToCard(nextIdx);
  }, [activeIndex, cardsList, transitionToCard, isCustomPlayer, activePlaylistId, folderIdParam, syncLoopCompletion]);

  const goToPrevCard = useCallback(() => {
    const listLength = cardsList.length;
    if (listLength === 0) return;
    const prevIdxLoc = (activeIndex - 1 + listLength) % listLength;
    flatListRef.current?.scrollToIndex({
      index: prevIdxLoc,
      animated: false,
    });
    setNavState({ activeIndex: prevIdxLoc, prevIdx: activeIndex });
    transitionToCard(prevIdxLoc);
  }, [activeIndex, cardsList.length, transitionToCard]);

  const goToNextCardRef = useRef(goToNextCard);
  const goToPrevCardRef = useRef(goToPrevCard);
  useEffect(() => { goToNextCardRef.current = goToNextCard; }, [goToNextCard]);
  useEffect(() => { goToPrevCardRef.current = goToPrevCard; }, [goToPrevCard]);

  // Stable callback wrappers
  const stableGoToNext = useCallback(() => goToNextCardRef.current(), []);
  const stableGoToPrev = useCallback(() => goToPrevCardRef.current(), []);

  const handleScrollEnd = useCallback((event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    const snapInterval = Math.round(cardHeight + 16);
    const minYOffset = sessionStartIndexRef.current * snapInterval;

    // 🛑 TikTok-Style Ceiling: Prevent scrolling upward past the starting card of this session (only if starting at the absolute beginning)
    if (sessionStartIndexRef.current === 0 && yOffset < minYOffset - 2) {
      flatListRef.current?.scrollToIndex({
        index: sessionStartIndexRef.current,
        animated: true,
      });
      return;
    }

    const index = Math.round(yOffset / snapInterval);

    // Intercept swipe past the last card in custom player mode!
    if (isCustomPlayer && index >= cardsList.length && cardsList.length > 0) {
      setIsStudySessionFinished(true);
      syncLoopCompletion(
        activePlaylistId ? 'playlist' : 'folder',
        activePlaylistId || folderIdParam || 'all',
        cardsList.length
      );
      flatListRef.current?.scrollToIndex({
        index: cardsList.length - 1,
        animated: true,
      });
      return;
    }

    if (index !== activeIndex && index >= 0 && index < cardsList.length) {
      setNavState({ activeIndex: index, prevIdx: activeIndex });
      transitionToCard(index);
      // Increment manual scroll count strictly on drag completions
      useTrackingStore.getState().incrementScroll();
    }
  }, [activeIndex, cardsList.length, cardHeight, transitionToCard, isCustomPlayer, activePlaylistId, folderIdParam, syncLoopCompletion]);

  // Hydration Mount Scrolling
  useEffect(() => {
    if (!hasTrackingHydrated || !isTransitionReady) return; // Wait until tracking store has hydrated and transition is ready!

    if (cardsList.length > 0 && !hasScrolledToInitial.current) {
      sessionStartIndexRef.current = activeIndex; // Set the session starting index anchor right here!
      if (activeIndex > 0) {
        mountScrollTimer1Ref.current = setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: activeIndex,
            animated: false,
          });
          mountScrollTimer2Ref.current = setTimeout(() => {
            hasScrolledToInitial.current = true;
          }, 50);
        }, 100);
      } else {
        hasScrolledToInitial.current = true;
      }
    }

    return () => {
      if (mountScrollTimer1Ref.current) clearTimeout(mountScrollTimer1Ref.current);
      if (mountScrollTimer2Ref.current) clearTimeout(mountScrollTimer2Ref.current);
    };
  }, [cardsList.length, activeIndex, hasTrackingHydrated, isTransitionReady]);

  // Auto-pop reels-player when switching away to another tab
  useEffect(() => {
    if (!isCustomPlayer) return;

    const unsubscribe = navigation.addListener('blur', () => {
      // If we already navigated customly, we don't need to do router.back() again!
      if (hasConfirmedExit.current) return;

      // If we are a custom reels player inside the tabs navigator, and the tab loses focus (blur event),
      // immediately pop back so that the user's Home/My Space page resets back to the original folder/playlist!
      router.back();
    });

    return unsubscribe;
  }, [navigation, isCustomPlayer]);

  // Analytics: Removed vertical scroll useEffect to avoid programmatic snap duplicates

  // Listen to activeIndex changes to sync session, prefetch images, and handle infinite pagination load
  useEffect(() => {
    if (cardsList.length > 0 && activeIndex >= 0 && activeIndex < cardsList.length) {
      const idx = activeIndex;

      // A. Initial boot pause on mount to pre-warm the first card's assets perfectly
      if (!hasShownInitialPauseRef.current) {
        hasShownInitialPauseRef.current = true;
        lightHaptic();
        // No pause on boot — cards are already in memory, no pre-warming needed
      }

      // B. Track active index to maintain swipe history anchors (removed artificial 10-scroll freeze overlay)
      if (idx !== lastPausedIndexRef.current) {
        if (lastPausedIndexRef.current !== -1) {
          scrollsSinceLastPauseRef.current += 1;
        }
        lastPausedIndexRef.current = idx;
      }

      // Keep track of the last 3 visited card IDs
      const currentCardId = cardsList[idx];
      if (currentCardId) {
        recentCardIdsRef.current = [
          currentCardId,
          ...recentCardIdsRef.current.filter(id => id !== currentCardId).slice(0, 2)
        ].filter(Boolean);
      }

      // Defer all expensive prefetching and hydration work off the critical interaction frame
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          if (isGuest) return; // Disable card prewarming, prefetching, and next-card preparation in guest mode
          // 1. Maintain an extended, highly proactive pure memory hydration window to prevent SQLite lag on random access/fast scroll
          try {
            const store = usePlaylistStateStore.getState();
            const windowStart = Math.max(0, idx - 5);
            const windowEnd = Math.min(cardsList.length, idx + 15); // Prefetch up to 15 cards ahead
            
            for (let i = windowStart; i <= windowEnd; i++) {
              const cardId = cardsList[i];
              if (cardId) {
                const cleanId = cardId.split('-loop-')[0];
                const card = store.cardsById[cleanId];
                if (card && !card.isContentFullyHydrated) {
                  store.hydrateCardContentOnDemand(cleanId).catch(() => {});
                }
              }
            }
          } catch (e) {
            console.warn('Hydration window error', e);
          }

          // 2. Prefetch upcoming card images further ahead to ensure zero-lag render transitions
          try {
            const prefetchCount = Math.min(idx + 5, cardsList.length); // Prefetch up to 5 card images ahead
            for (let i = idx + 1; i < prefetchCount; i++) {
              const nextCardId = cardsList[i];
              if (nextCardId) {
                const nextCard = usePlaylistStateStore.getState().cardsById[nextCardId.split('-loop-')[0]];
                if (nextCard && nextCard.image) {
                  ExpoImage.prefetch(nextCard.image).catch(() => {});
                }
              }
            }
          } catch (e) {
            console.warn('Image prefetch failed', e);
          }

          // 3. Trigger handleLoadMore if getting within 6 cards of the end of the stack for seamless scrolling
          if (idx >= cardsList.length - 6) {
            handleLoadMore();
          }
        });
      });
    }
  }, [activeIndex, cardsList]);

  // 1. Organic Breathing Pulse Animation for prefetching overlay
  useEffect(() => {
    if (showFetchingOverlay) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseValue.value = 0.6;
    }
  }, [showFetchingOverlay]);

  const animatedPulseStyle = useAnimatedStyle(() => {
    return {
      opacity: pulseValue.value,
      transform: [{ scale: 0.96 + (pulseValue.value * 0.04) }],
    };
  });

  // 2. Declarative lock/unlock native scrolling gestures are handled directly via FlashListElement scrollEnabled prop



  // 3. Monitor active index approaching boundary to trigger beautiful loading freeze overlay
  useEffect(() => {
    const isCloseToEnd = activeIndex >= cardsList.length - 1;
    if (isCloseToEnd && activeFetching && cardsList.length > 0) {
      if (!showFetchingOverlay) {
        setShowFetchingOverlay(true);
        fetchStartTime.current = Date.now();
        lightHaptic();
      }
    }
  }, [activeIndex, cardsList.length, activeFetching, showFetchingOverlay]);

  // 4. Instant dismissal the very millisecond background prefetching resolves
  useEffect(() => {
    if (!activeFetching && showFetchingOverlay) {
      setShowFetchingOverlay(false);
      lightHaptic();
    }
  }, [activeFetching, showFetchingOverlay]);

  // Clean, high-fidelity overlay toggle without pill warping
  const toggleMenu = () => {
    lightHaptic();
    setIsSettingsOpen(!isSettingsOpen);
  };

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    return (
      <ReelsRenderItem
        cardId={item}
        index={index}
        activeIndex={activeIndex}
        cardHeight={cardHeight}
        width={width}
        activePlaylistId={activePlaylistId}
        isGuest={isGuest}
        stableGoToNext={stableGoToNext}
        stableGoToPrev={stableGoToPrev}
        handleWatchLaterToggleInReels={handleWatchLaterToggleInReels}
        handleProgressUpdateInReels={handleProgressUpdateInReels}
        setPlaylistModalCard={setPlaylistModalCard}
        handleMoreOptionsTrigger={handleMoreOptionsTrigger}
        handleDifficultyStateUpdateInReels={handleDifficultyStateUpdateInReels}
        scrollY={scrollY}
        rnghScrollViewRef={rnghScrollViewRef}
        isActiveCardClassified={isActiveCardClassified}
        feedSessionId={feedSessionIdRef.current}
      />
    );
  }, [
    activeIndex,
    cardHeight,
    width,
    activePlaylistId,
    isGuest,
    stableGoToNext,
    stableGoToPrev,
    handleWatchLaterToggleInReels,
    handleProgressUpdateInReels,
    setPlaylistModalCard,
    handleMoreOptionsTrigger,
    handleDifficultyStateUpdateInReels,
    scrollY,
    rnghScrollViewRef,
    isActiveCardClassified,
  ]);

  const isPlaylistLoading = !!activePlaylistId && playlistCardsLoading;
  const isReelsLoading = isPlaylistLoading;
  const isReelsError = activePlaylistId && playlistCardsError;
  const reelsErrorObj = playlistCardsError as any;

  if (isReelsLoading || !isTransitionReady) {
    return (
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: palette.background }}>
        <ReeWCharacter state="loading" size={90} />
      </View>
    );
  }

  if (isReelsError) {
    return (
      <View className="flex-1 justify-center items-center p-6" style={{ backgroundColor: palette.background }}>
        <Text className="text-lg text-center mb-4 font-medium" style={{ color: palette.textSecondary }}>
          {reelsErrorObj?.message || 'Failed to load reels'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            refetchPlaylistCards();
          }}
          className="bg-[#8B5CF6] px-6 py-3 rounded-xl shadow-sm active:scale-95"
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeCard = cardsList[activeIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }} className="bg-transparent">
      <ThemeBackground style={{ flex: 1 }}>
        <SyncPauseGate />
      

      
      {showTutorial && (
        <FirstFeedTutorial 
          onDismiss={() => {
            setShowTutorial(false);
            if (walkthroughStep === 'reels-tutorial') {
              setWalkthroughStep('point-myspace');
            }
          }}
          isSettingsOpen={isSettingsOpen}
          toggleSettings={toggleMenu}
        />
      )}
      
      {/* Settings & Personalization Overlay */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <ReelsSettingsOverlay
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            playlistName={activePlaybackName}
            sessionTimer={formatTime(sessionTotalTime)}
            questionsRevised={completedCardsCount}
            showReelContentSelect={!isCustomPlayer}
          />
        </Suspense>
      )}

      {/* Premium minimal exit button for focused immersive revision sessions */}
      {isCustomPlayer && (
        <TouchableOpacity
          onPress={() => router.back()} // Exit directly without confirmation for folder/playlist players
          activeOpacity={0.7}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 16,
            zIndex: 95,
            padding: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 22,
            borderWidth: 1,
            borderColor: 'rgba(226, 232, 240, 0.6)',
            width: 38,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <ChevronLeft color="#8B5CF6" size={20} strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* Premium Apple-Style Header Capsule Bar */}
      <View 
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 16,
          zIndex: 90,
          elevation: 90,
          alignItems: 'center',
          pointerEvents: 'box-none',
          gap: 12,
          flexDirection: 'row',
        }}
      >
        {/* RIGHT SIDE: Transparent Settings Cog Icon - Visible in all sessions */}
        <Animated.View style={settingsPulseStyle}>
          <TouchableOpacity
            onPress={toggleMenu}
            activeOpacity={0.7}
            style={{
              padding: 8,
              backgroundColor: 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Settings2 color="#8B5CF6" size={20} strokeWidth={2.5} />
          </TouchableOpacity>
        </Animated.View>

        {/* RIGHT SIDE: ChatGPT AI Assistant Icon */}
        <TouchableOpacity
          onPress={async () => {
            // Only send the currently active card's metadata — NOT the entire feed
            const playlistState = usePlaylistStateStore.getState();
            const currentCleanId = activeCardIdClean;
            const currentCard = currentCleanId ? playlistState.cardsById[currentCleanId] : null;

            // Build a clean, human-readable prompt instead of raw JSON
            const slides = currentCard?.slides || [];
            const slidesText = slides.map((slide: any, i: number) => {
              let section = `\n---\n**Slide ${i + 1}${slide.type ? ` (${slide.type})` : ''}**: ${slide.headline || 'Untitled'}`;
              if (slide.body) section += `\n${slide.body}`;
              if (slide.code) section += `\n\`\`\`\n${slide.code}\n\`\`\``;
              if (Array.isArray(slide.steps)) {
                slide.steps.forEach((step: string, j: number) => {
                  section += `\n  ${j + 1}. ${step}`;
                });
              }
              if (Array.isArray(slide.mistakes)) {
                section += `\n⚠️ Common Mistakes:`;
                slide.mistakes.forEach((m: string) => { section += `\n  ❌ ${m}`; });
              }
              if (slide.keyObservation) section += `\n🔑 Key Observation: ${slide.keyObservation}`;
              if (slide.mentalCompression) section += `\n💡 Mental Compression: ${slide.mentalCompression}`;
              return section;
            }).join('\n');

            // Check which GPT mode the user has selected in settings
            const gptMode = useUserPreferencesStore.getState().preferences.gptPromptMode || 'explanation';

            let prompt: string;

            if (gptMode === 'quiz') {
              // ── TEST ME MODE: Interviewer asks 3 questions one-by-one ──
              prompt = `You are a strict but friendly technical interviewer testing my understanding of the topic below. Follow these rules EXACTLY:

1. Ask me exactly 3 questions, ONE AT A TIME. Do NOT reveal the next question until I answer the current one.
2. After I answer each question, give a BRIEF feedback (2-3 sentences max) on what was correct and what was off or missing. Do NOT write long paragraphs.
3. Then immediately ask the next question.
4. Keep your replies SHORT and STRICT — no lengthy explanations, no hand-holding. Be concise like a real interviewer.
5. After all 3 questions are answered, give a FINAL REPORT in this format:
   - Score: X/3
   - Strengths: (1 line)
   - Gaps: (1 line)
   - Verdict: (Ready / Needs Revision / Weak)

Start now by asking Question 1.

## Topic: ${currentCard?.title || 'Unknown'}
- **Subject**: ${currentCard?.topic || 'N/A'}
- **Difficulty**: ${currentCard?.difficulty || 'N/A'}
${slidesText}`;
            } else {
              // ── EXPLAIN THIS MODE: Teach me like a peer ──
              prompt = `The student has already read these slides.

1. Summarize the key concepts in 3-5 bullets.
2. Mention a few common confusion points.
3. Ask the student what specific doubt they have.

Do not rate, critique, improve, or teach the slides unless the student asks a question.

## ${currentCard?.title || 'Unknown Card'}
- **Topic**: ${currentCard?.topic || 'N/A'}
- **Difficulty**: ${currentCard?.difficulty || 'N/A'}
${slidesText}`;
            }
            
            // Copy full prompt to clipboard first (handles >2000 char prompts that URL truncates)
            await Clipboard.setStringAsync(prompt).catch(err => console.warn('Clipboard failed:', err));

            // Open ChatGPT with the prompt via ?q= deep link — the native ChatGPT app
            // intercepts https://chatgpt.com URLs and stays in-app with the prompt pre-filled.
            // This avoids the chatgpt:// custom scheme which was redirecting to Chrome.
            const appLinkUrl = 'https://chatgpt.com/?q=' + encodeURIComponent(prompt);
            Linking.openURL(appLinkUrl).catch(() => {
              Linking.openURL('https://chatgpt.com/').catch(err => {
                console.error('Failed to open ChatGPT link:', err);
              });
            });
          }}
          activeOpacity={0.7}
          style={{
            padding: 8,
            backgroundColor: 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Image 
            source={require('../../assets/chat-gpt.png')} 
            style={[
              { width: 22, height: 22, resizeMode: 'contain', opacity: 0.9 },
              isMidnight && { tintColor: '#FFFFFF' }
            ]} 
          />
        </TouchableOpacity>
      </View>

      {/* Snappy Continuous Deck Core */}
      <View 
        className="flex-1 justify-center items-center px-2"
        style={{ 
          marginTop: insets.top - 12,
          marginBottom: bottomTabBarHeight - 16,
          position: 'relative',
          width: '100%',
          backgroundColor: 'transparent',
        }}
      >
        {cardsList.length > 0 ? (
          <FlashListElement
            ref={flatListRef}
            data={visibleCardsList}
            renderScrollComponent={renderScrollComponent}
            scrollEnabled={!showPrefetchingPause && !showFetchingOverlay}
            initialScrollIndex={
              initialScrollIndex !== undefined &&
              initialScrollIndex > 0 &&
              initialScrollIndex < visibleCardsList.length
                ? initialScrollIndex
                : undefined
            }
            renderItem={renderItem}
            keyExtractor={(item: any, index: number) => item || `loading-slot-${index}`}
            snapToInterval={Math.round(cardHeight + 16)} // Subpixel Snapping coordinate rounding
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum={true}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={Math.round(cardHeight + 16)}
            drawDistance={Math.round(cardHeight * 6.0)} // Scoped viewport precomputation window
            directionalLockEnabled={true}
            removeClippedSubviews={false}
            getItemType={(item: any) => {
              if (!item) return 'LOADING';
              const card = usePlaylistStateStore.getState()
                .cardsById[item.split('-loop-')[0]];
              return card?.code ? 'CODE_CARD' : 'TEXT_CARD';
            }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handleScrollEnd}
            onScrollEndDrag={handleScrollEnd}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
            contentContainerStyle={{ alignItems: 'center' }}
          />
        ) : (
          <View className="flex-1 justify-center items-center px-10">
            <Text className="text-slate-900 text-lg font-bold mb-1 text-center">
              {activePlaylistId ? 'No reels saved yet' : 'Empty continuous mode'}
            </Text>
            <Text className="text-slate-400 text-xs text-center leading-relaxed">
              {activePlaylistId 
                ? 'Save cards to this playlist while revising to see them here.' 
                : 'Adjust filters or select another playlist/folder to run.'}
            </Text>
            {!activePlaylistId && (
              <TouchableOpacity
                onPress={toggleMenu}
                className="mt-6 bg-[#8B5CF6] px-6 py-2.5 rounded-full shadow-md shadow-violet-500/25 active:scale-95"
              >
                <Text className="text-white font-semibold text-xs">Configure modes</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Immersive high-performance boundary prefetching overlay */}
        {showFetchingOverlay && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: addAlpha(palette.background, 0.95),
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 100, // Sit on top of the list/empty state
            }}
          >
            <ReeWCharacter state="loading" size={90} />
          </View>
        )}

        {/* Premium 1-Second Deck Optimization Overlay */}
        {showPrefetchingPause && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: addAlpha(palette.background, 0.95),
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 100, // Sit on top of the list/empty state
            }}
          >
            <ReeWCharacter state="loading" size={90} />
          </View>
        )}
      </View>

      {/* Floating Add Shortcut */}
      {canManageContent && !isGuest && (
        <TouchableOpacity
          className="absolute left-5 w-11 h-11 rounded-full justify-center items-center z-30 border border-violet-100 shadow-md shadow-violet-100"
          style={{ bottom: bottomTabBarHeight + 12, backgroundColor: '#ffffff' }}
          onPress={() =>
            router.push({
              pathname: '/(protected)/(tabs)/CreateRevisionScreen',
              params: folderIdParam ? { folderId: folderIdParam } : {},
            })
          }
        >
          <Plus color="#8B5CF6" size={20} strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* --- ELITE GLASSMORPHIC STUDY COMPLETION OVERLAY --- */}
      {isStudySessionFinished && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(11, 15, 25, 0.97)', // Deep space navy backdrop
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 999, // Sit on top of everything!
              paddingHorizontal: 32,
            },
          ]}
        >
          <View className="items-center mb-6">
            <ReeWCharacter state="completion" size={150} />
          </View>

          <Text className="text-white text-3xl font-black tracking-tight text-center mb-2 leading-tight">
            Revision Complete!
          </Text>
          <Text className="text-slate-400 text-sm font-semibold text-center mb-8 px-6 leading-normal">
            Outstanding job! You have completed all study material in this revision deck. Mochi Panda is extremely proud of you! 🏆
          </Text>

          {/* Stats grid */}
          <View className="flex-row w-full max-w-[320px] bg-slate-800/40 border border-slate-700/35 rounded-3xl p-5 mb-10 justify-between items-center" style={{ gap: 12 }}>
            <View className="flex-1 items-center">
              <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Cards Studied</Text>
              <Text className="text-[#8B5CF6] text-2xl font-black">{cardsList.length}</Text>
            </View>
            <View style={{ width: 1, height: 32, backgroundColor: 'rgba(148, 163, 184, 0.15)' }} />
            <View className="flex-1 items-center">
              <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Time Elapsed</Text>
              <Text className="text-emerald-400 text-2xl font-black">{(() => {
                const total = useTrackingStore.getState().sessionTotalTime;
                const m = Math.floor(total / 60);
                const s = total % 60;
                return m > 0 ? `${m}m ${s}s` : `${s}s`;
              })()}</Text>
            </View>
          </View>

          {/* Actions */}
          <View className="w-full max-w-[280px] gap-3">
            <TouchableOpacity
              onPress={() => {
                // Revise Again: Reset state and jump back to index 0
                setIsStudySessionFinished(false);
                setNavState({ activeIndex: 0, prevIdx: 0 });
                flatListRef.current?.scrollToIndex({ index: 0, animated: false });
                transitionToCard(0);
              }}
              activeOpacity={0.85}
              className="w-full py-4 rounded-2xl items-center justify-center bg-violet-600"
              style={{
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
                elevation: 3,
              }}
            >
              <Text className="text-white font-bold text-sm">Revise Again</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                // Exit: Go back to folder/playlist screen
                setIsStudySessionFinished(false);
                router.back();
              }}
              activeOpacity={0.8}
              className="w-full py-4 rounded-2xl items-center justify-center border border-slate-700/50 bg-slate-800/10"
            >
              <Text className="text-slate-300 font-bold text-sm">Finish & Exit</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Centralized Playlist Picker Modal */}
      {playlistModalCard !== null && (
        <Suspense fallback={null}>
          <PlaylistPickerModal
            card={playlistModalCard}
            onClose={() => setPlaylistModalCard(null)}
          />
        </Suspense>
      )}

      {/* Immersive Session Exit Confirmation Modal */}
      {isExitModalOpen && (
        <Modal
          transparent={true}
          visible={isExitModalOpen}
          animationType="fade"
          onRequestClose={() => setIsExitModalOpen(false)}
        >
          <View 
            style={{
              flex: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.45)', // Premium dark blur shade
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 320,
                backgroundColor: '#ffffff',
                borderRadius: 30,
                padding: 24,
                alignItems: 'center',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.1,
                shadowRadius: 30,
                elevation: 10,
                borderWidth: 1,
                borderColor: 'rgba(226, 232, 240, 0.8)',
              }}
            >
              {/* Exit Session Title */}
              <Text 
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: '#0F172A',
                  textAlign: 'center',
                  lineHeight: 24,
                  marginBottom: 10,
                }}
              >
                End {activePlaybackName} Revision?
              </Text>
              
              <Text 
                style={{
                  fontSize: 13,
                  color: '#64748B',
                  textAlign: 'center',
                  lineHeight: 18,
                  marginBottom: 24,
                }}
              >
                Your progress is securely synchronized offline-first. Return anytime to resume.
              </Text>

              {/* Confirm Actions */}
              <TouchableOpacity
                onPress={() => setIsExitModalOpen(false)}
                activeOpacity={0.8}
                style={{
                  width: '100%',
                  paddingVertical: 14,
                  backgroundColor: '#8B5CF6',
                  borderRadius: 16,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 8,
                  shadowColor: '#8B5CF6',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 10,
                  elevation: 2,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
                  Continue Revising
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  hasConfirmedExit.current = true;
                  setIsExitModalOpen(false);
                  
                  router.back();
                }}
                activeOpacity={0.7}
                style={{
                  width: '100%',
                  paddingVertical: 14,
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: 'rgba(226, 232, 240, 0.8)',
                  borderRadius: 16,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>
                  End Revision
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}


      </ThemeBackground>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  cardBase: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
});

// =============================================================================
// Lightning-fast Shell: renders the ReeW mascot with lens on the VERY FIRST
// FRAME when the user taps the Reels tab icon during tutorial or normal use.
// The heavy 3800-line ReelsScreenContent only mounts AFTER the navigation
// transition animation completes via InteractionManager.
// =============================================================================
export default function ReelsScreen({ isCustomPlayer = false }: { isCustomPlayer?: boolean }) {
  const evaluateTime = Date.now();
  console.log('[PERF] ReelsScreen: Component evaluated/rendered at:', evaluateTime);
  const palette = useThemePalette();
  const [mountContent, setMountContent] = React.useState(false);

  React.useEffect(() => {
    // Wait for the tab switch animation to fully complete before mounting
    // the heavy ReelsScreenContent — prevents JS thread contention
    const task = InteractionManager.runAfterInteractions(() => {
      setMountContent(true);
    });
    return () => task.cancel();
  }, []);

  if (!mountContent) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: palette.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <ReeWCharacter state="loading" size={90} />
      </View>
    );
  }

  return <ReelsScreenContent isCustomPlayer={isCustomPlayer} />;
}
