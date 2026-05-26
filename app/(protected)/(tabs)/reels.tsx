"use no compiler";
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
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
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { Image as ExpoImage } from 'expo-image';
import { useGetRevisionCards, IPopulatedRevisionCard, ISlide } from '@/hooks/useRevisionCards';
import { useGetFolders } from '@/hooks/useFolders';
import { RevisionCard } from './RevisionCard';
import { useUpdateLastViewedCard, useFolderLoops } from '@/services/useUserProgress';
import { ReelsSettingsOverlay } from '@/components/SettingsOverlay';
import { PlaylistPickerModal } from '@/components/PlaylistPickerModal';
import { useShallow } from 'zustand/react/shallow';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useResumeStore } from '@/store/useResumeStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { useProgressSync } from '@/hooks/useProgressSync';
import { useRole } from '@/hooks/useRole';
import { useQueryClient } from '@tanstack/react-query';
import * as revisionService from '@/services/revisionService';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
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
import * as sessionQueueService from '@/services/sessionQueueService';
import * as userCardStateService from '@/services/userCardStateService';
import { ConceptCardPreview, getSlidesForCard } from '@/components/ConceptCardPreview';
import { FirstFeedTutorial } from '@/components/onboarding/FirstFeedTutorial';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

// Global slides cache to store pre-compiled and pre-sorted slide arrays by card ID
const slidesCache = new Map<string, any[]>();
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

// Premium physical spring snapping parameters (Spotify / Apple physics)
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 250,
  mass: 1.0,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const OFFSCREEN_X = -width - 120;

// Premium study-focused highly damped snap spring config
const PEACEFUL_SPRING_CONFIG = {
  damping: 34,
  stiffness: 140,
  mass: 1.0,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

// Tight critically damped snap spring configuration matching standard Apple/TikTok tight snapping
const TIGHT_SNAP_SPRING = {
  damping: 22,
  stiffness: 300,
  mass: 0.8,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const lightHaptic = () => {
  InteractionManager.runAfterInteractions(() => {
    if (Platform.OS === 'android') {
      Vibration.vibrate(12);
    } else {
      Vibration.vibrate(8);
    }
  });
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
        },
      ]}
    >
      <View style={{ gap: 20 }}>
        {/* Mock Badge Header capsules */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <BreathingOpacitySkeleton style={{ width: 64, height: 20, borderRadius: 10, backgroundColor: 'rgba(139, 92, 246, 0.15)' }} />
          <BreathingOpacitySkeleton style={{ width: 72, height: 20, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.15)' }} />
          <BreathingOpacitySkeleton style={{ width: 52, height: 20, borderRadius: 10, backgroundColor: 'rgba(100, 116, 139, 0.15)' }} />
        </View>

        {/* Mock Title Multi-line layout */}
        <View style={{ gap: 8, marginTop: 12 }}>
          <BreathingOpacitySkeleton style={{ width: '85%', height: 28, borderRadius: 8, backgroundColor: 'rgba(15, 23, 42, 0.1)' }} />
          <BreathingOpacitySkeleton style={{ width: '65%', height: 28, borderRadius: 8, backgroundColor: 'rgba(15, 23, 42, 0.1)' }} />
        </View>

        {/* Mock Explanation block */}
        <View style={{ gap: 6, marginTop: 12 }}>
          <BreathingOpacitySkeleton style={{ width: '95%', height: 14, borderRadius: 4, backgroundColor: 'rgba(15, 23, 42, 0.06)' }} />
          <BreathingOpacitySkeleton style={{ width: '90%', height: 14, borderRadius: 4, backgroundColor: 'rgba(15, 23, 42, 0.06)' }} />
          <BreathingOpacitySkeleton style={{ width: '75%', height: 14, borderRadius: 4, backgroundColor: 'rgba(15, 23, 42, 0.06)' }} />
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
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(139, 92, 246, 0.08)',
            paddingHorizontal: 20,
          }}
        >
          <BreathingOpacitySkeleton style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(139, 92, 246, 0.5)' }} />
          <BreathingOpacitySkeleton style={{ width: 180, height: 12, borderRadius: 3, backgroundColor: 'rgba(139, 92, 246, 0.15)', marginLeft: 10 }} />
          <BreathingOpacitySkeleton style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(139, 92, 246, 0.3)', marginLeft: 'auto' }} />
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
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0, 0, 0, 0.1)' }} />
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
  const handlePress = () => {
    lightHaptic();
    onPress();
  };

  const displayColor = isActive ? activeColor : 'rgba(0, 0, 0, 0.85)';

  return (
    <Pressable
      onPress={handlePress}
      style={{ alignItems: 'center', marginBottom: 12 }}
    >
      <View style={{ position: 'relative' }}>
        {/* Main Action Capsule Button */}
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'transparent',
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

      <Text
        style={{
          fontSize: 8.5,
          fontWeight: '900',
          color: isActive ? activeColor : 'rgba(0, 0, 0, 0.6)',
          marginTop: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const ReelsActionRail = React.memo(({
  cleanId,
  item,
  onDifficultyStateUpdate,
  onPlaylistPickerTrigger,
  isGuest,
  isDisabled = false, // Set default to false
}: ReelsActionRailProps) => {
  const currentDifficulty = item.difficultyState;
  const shouldPulse = !currentDifficulty;

  const { data: membership } = useCardPlaylistMembership(cleanId, !isGuest);
  const isSaved = useMemo(() => {
    if (!membership) return false;
    return Object.keys(membership).some(id => 
      !['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(id) && membership[id]
    );
  }, [membership]);

  return (
    <View 
      pointerEvents={isDisabled ? 'none' : 'auto'} // Disable touch captures for inactive cards during scroll
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
        icon={Flame}
        activeColor="#10B981"
        isActive={currentDifficulty === 'easy'}
        onPress={() => onDifficultyStateUpdate('easy')}
        shouldPulse={shouldPulse}
        pulseDelay={0}
      />

      <ClassificationButton
        label="Medium"
        icon={Zap}
        activeColor="#F59E0B"
        isActive={currentDifficulty === 'medium'}
        onPress={() => onDifficultyStateUpdate('medium')}
        shouldPulse={shouldPulse}
        pulseDelay={250}
      />

      <ClassificationButton
        label="Hard"
        icon={Skull}
        activeColor="#EF4444"
        isActive={currentDifficulty === 'hard'}
        onPress={() => onDifficultyStateUpdate('hard')}
        shouldPulse={shouldPulse}
        pulseDelay={500}
      />

      <ClassificationButton
        label="Skipped"
        icon={SkipForward}
        activeColor="#64748B"
        isActive={currentDifficulty === 'skipped'}
        onPress={() => onDifficultyStateUpdate('skipped')}
        shouldPulse={shouldPulse}
        pulseDelay={750}
      />

      {/* Futuristic Sleek Separator Line */}
      <View style={{ width: 24, height: 1, backgroundColor: 'rgba(0, 0, 0, 0.15)', marginVertical: 6, marginBottom: 12 }} />

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
    prevProps.item.difficultyState === nextProps.item.difficultyState &&
    prevProps.item._id === nextProps.item._id &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.isDisabled === nextProps.isDisabled // Added comparator check
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
  scrollEnabled?: boolean;
  onScrollEnabledChange?: (enabled: boolean) => void;
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
          backgroundColor: isLastSlide ? '#F0F9FF' : '#ffffff', // Very light ice blue background
          borderColor: isLastSlide ? 'rgba(234, 179, 8, 0.15)' : 'rgba(226, 232, 240, 0.8)', // Warm cohesive gold border
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
  scrollEnabled = true,
  onScrollEnabledChange,
}: ActiveReelItemProps) => {
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

  // Subscribe to watchLater state locally to stabilize parent's renderItem
  const watchLaterCardIds = useTrackingStore((state) => state.watchLaterCardIds);
  const cleanId = item._id.split('-loop-')[0];
  const isWatchLater = watchLaterCardIds.includes(cleanId);

  const slides = useMemo(() => {
    const cacheKey = `${item._id}-${currentPrefsKey}`;
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
    lockPillColor.value = withTiming(isClassified ? 1 : 0, { duration: 400 });
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
    .activeOffsetY([-10, 100000]) // Only capture upward swipes (translationY < -10) to block scrolling down
    .failOffsetX([-10, 10])
    .enabled(false)
    .onUpdate((event) => {
      // Elastic resistance cap at -40px on swipe up, 40px on swipe down
      if (event.translationY < 0) {
        cardTranslateY.value = Math.max(-40, event.translationY * 0.25);
      } else {
        cardTranslateY.value = Math.min(40, event.translationY * 0.25);
      }
    })
    .onEnd(() => {
      // 4. Cancel animations: rapid physical snap-back for uncommitted vertical tugs
      cardTranslateY.value = withSpring(0, {
        damping: 16,
        stiffness: 400,
        mass: 0.6
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
  const SWIPE_THRESHOLD_X = CARD_WIDTH * 0.08;
  const VELOCITY_THRESHOLD = 200;

  const horizontalGesture = Gesture.Pan()
    // Prominent vertical lock: horizontal engagement box and deep failOffsetY window
    .activeOffsetX([-4, 4])
    .failOffsetY([-40, 40])
    .onStart((event) => {
      // Anti-race conditions: ignore new gesture starts if already transitioning
      if (isTransitioning.value) return;

      const absVX = Math.abs(event.velocityX);
      const absVY = Math.abs(event.velocityY);

      // Prominent angle arbitration: if the swipe is prominently vertical (Y velocity is more than 1.5x of X velocity),
      // treat it as a vertical reel swipe and fail the horizontal gesture. Otherwise, treat it strictly as a horizontal deck swipe.
      if (absVY > absVX * 1.5) {
        gestureLock.value = 'failed';
        return;
      }

      cancelAnimation(slideDragX);
      cancelAnimation(prevSlideDragX);
      cancelAnimation(cardTranslateY);
      
      // Lock the horizontal axis permanently for this gesture
      gestureLock.value = 'horizontal'; 
      
      // Reset swipe completion lock for this new horizontal gesture
      runOnJS(resetSwipeLock)();
      
      // Disable parent vertical scroll list ONLY after lock is confirmed
      if (onScrollEnabledChange) {
        runOnJS(onScrollEnabledChange)(false);
      }
    })
    .onUpdate((event) => {
      if (isTransitioning.value) return;
      if (gestureLock.value !== 'horizontal') return;

      const dx = event.translationX;
      const vx = event.velocityX;
      
      // Blend raw translation with velocity (momentum physics term) so that the active drag tracks fingertip with a fluid, paper-like lightness
      const predictiveDx = dx + (vx * 0.02);

      if (dx < 0) {
        // Dragging Left -> Move Forward
        if (activeSlideIndex < slides.length - 1) {
          slideDragX.value = predictiveDx;
        } else {
          // Elastic boundary stretch (last slide dragging left)
          slideDragX.value = dx * 0.25;
        }
      } else if (dx > 0) {
        // Dragging Right -> Move Backward
        if (activeSlideIndex > 0) {
          prevSlideDragX.value = -width + predictiveDx;
        } else {
          // Elastic boundary stretch (first slide dragging right)
          slideDragX.value = dx * 0.25;
        }
      }
    })
    .onEnd((event) => {
      if (isTransitioning.value) return;
      if (gestureLock.value !== 'horizontal') return;
      
      const transX = event.translationX;
      const velX = event.velocityX;
      
      // Velocity projection: evaluate where the card will end up based on physical momentum
      const projectedX = transX + velX * 0.18;

      // Velocity-aware animation durations for physically accurate settling
      const commitDuration = Math.max(120, Math.min(220, 240 - Math.abs(velX) * 0.08));

      // Elastic, fast, zero sluggishness critically damped snapping spring
      const cancelSpring = { damping: 20, stiffness: 350, mass: 0.7 };

      if (transX < 0) {
        // ---- LEFT SWIPE ----
        if (activeSlideIndex < slides.length - 1 && (projectedX < -SWIPE_THRESHOLD_X || velX < -VELOCITY_THRESHOLD)) {
          isTransitioning.value = true;
          // Velocity-based exit distance: fast flicks travel further offscreen
          const exitDistance = Math.max(-width - 350, -width - Math.abs(velX) * 0.15);
          slideDragX.value = withTiming(
            exitDistance,
            { duration: commitDuration },
            (finished) => {
              if (finished) {
                runOnJS(handleSwipeComplete)();
              }
            }
          );
        } else {
          // Cancel: snap active card back
          slideDragX.value = withSpring(0, cancelSpring);
        }
      } else if (transX > 0) {
        // ---- RIGHT SWIPE ----
        if (activeSlideIndex > 0 && (projectedX > SWIPE_THRESHOLD_X || velX > VELOCITY_THRESHOLD)) {
          isTransitioning.value = true;
          // Animate it sliding right over the current card to position 0
          prevSlideDragX.value = withTiming(0, { duration: commitDuration }, (finished) => {
            if (finished) {
              runOnJS(handleSwipePrevComplete)();
            }
          });
        } else {
          // Cancel: snap previous card back offscreen
          prevSlideDragX.value = withSpring(-width - 100, cancelSpring);
          // Also reset active slide elastic right-drag spring if any
          slideDragX.value = withSpring(0, cancelSpring);
        }
      } else {
        // Reset both
        slideDragX.value = withSpring(0, cancelSpring);
        prevSlideDragX.value = withSpring(-width - 100, cancelSpring);
      }
    })
    .onFinalize(() => {
      gestureLock.value = 'undecided';
      if (onScrollEnabledChange) {
        runOnJS(onScrollEnabledChange)(true);
      }
    });

  const renderSlideContent = (slide: typeof slides[0], indexInDeck: number) => {
    if (indexInDeck === 0) {
      return (
        <ConceptCardPreview
          card={item}
          activePlaylistId={activePlaylistId}
          onViewExplanation={scrollHorizontal}
          scrollEnabled={scrollEnabled}
        />
      );
    }
    return (
      <RevisionCard
        slide={{
          card: item,
          slideIndex: indexInDeck,
          totalSlides: slides.length,
          type: slide.type,
          headline: slide.headline,
          body: slide.body,
          code: slide.code,
        }}
        currentIndex={indexInDeck}
        totalCount={slides.length}
        scrollEnabled={scrollEnabled}
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
        // 🚨 CRITICAL REELS DESIGN LOCK: DO NOT ALTER OR SHIFT WITHOUT DOUBLE-CHECKING!
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
      <GestureDetector gesture={Gesture.Exclusive(horizontalGesture, verticalGesture)}>
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
                renderSlideContent={renderSlideContent}
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
      />
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item._id === nextProps.item._id &&
    prevProps.item.difficultyState === nextProps.item.difficultyState &&
    prevProps.activeIndex === nextProps.activeIndex &&
    prevProps.index === nextProps.index &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.scrollEnabled === nextProps.scrollEnabled &&
    prevProps.isActiveCardClassified === nextProps.isActiveCardClassified
  );
});

interface InactiveReelItemProps {
  item: IPopulatedRevisionCard;
  index: number;
  activeIndex: number;
  cardHeight: number;
  activePlaylistId: string | null;
  isActiveCardClassified: boolean;
  isGuest: boolean; // Add isGuest to ensure slide-comparators match exactly
  shadowProgress: SharedValue<number>;
}

const InactiveReelItem = React.memo(({
  item,
  index,
  activeIndex,
  cardHeight,
  activePlaylistId,
  isActiveCardClassified,
  isGuest,
  shadowProgress,
}: InactiveReelItemProps) => {
  const isNextCard = index === activeIndex + 1;
  const isLockedNextCard = false;

  const animatedCardStyle = useAnimatedStyle(() => {
    const shadowOpacity = 0.04 * shadowProgress.value;
    const elevation = 3 * shadowProgress.value;
    return {
      transform: [{ scale: 1.0 }],
      opacity: 1.0, // Promoted to fully solid, solid surface
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      shadowOpacity,
      elevation,
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: isLockedNextCard ? 1 : 0,
    };
  });

  return (
    <View 
      style={{ 
        height: cardHeight, 
        alignSelf: 'center', 
        width: CARD_WIDTH,
        marginBottom: 16,
        backgroundColor: 'transparent',
        overflow: 'visible',
        top: 22,
      }}
    >
      <Animated.View
        style={[
          styles.cardBase,
          {
            width: CARD_WIDTH,
            height: cardHeight,
          },
          animatedCardStyle,
        ]}
      >
        {/* Compositor-First Separation: Corner rounding and clipping nested securely inside */}
        <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 }}>
            {/* Card Content Backdrop */}
            <Animated.View style={{ flex: 1, opacity: isLockedNextCard ? 0.12 : 1 }}>
              <ConceptCardPreview
                card={item}
                activePlaylistId={activePlaylistId}
                onViewExplanation={() => {}}
              />
            </Animated.View>

            {/* Lock Blur Overlay */}
            <Animated.View
              style={[StyleSheet.absoluteFillObject, overlayStyle]}
              pointerEvents={isLockedNextCard ? 'auto' : 'none'}
            >
              {Platform.OS === 'ios' ? (
                (() => {
                  try {
                    const { BlurView } = require('expo-blur');
                    return (
                      <BlurView
                        intensity={25}
                        tint="dark"
                        style={StyleSheet.absoluteFillObject}
                      />
                    );
                  } catch {
                    return (
                      <View 
                        style={[
                          StyleSheet.absoluteFillObject, 
                          { backgroundColor: 'rgba(15, 23, 42, 0.75)' }
                        ]} 
                      />
                    );
                  }
                })()
              ) : (
                <View 
                  style={[
                    StyleSheet.absoluteFillObject, 
                    { backgroundColor: 'rgba(15, 23, 42, 0.75)' }
                  ]} 
                />
              )}

              {/* Lock Indicator in center */}
              <View 
                style={{
                  ...StyleSheet.absoluteFillObject,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  }}
                >
                  <Lock color="#94A3B8" size={24} strokeWidth={2.5} />
                </View>
                <Text
                  style={{
                    color: '#94A3B8',
                    fontSize: 12,
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                  }}
                >
                  Locked Next Problem
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
      </Animated.View>

      {/* Render persistent Action Rail on inactive card viewport slots to ensure zero visual pop-in */}
      <ReelsActionRail
        cleanId={item._id.split('-loop-')[0]}
        item={item}
        onDifficultyStateUpdate={() => {}}
        onPlaylistPickerTrigger={() => {}}
        isGuest={isGuest}
        isDisabled={true} // Lock clicks on inactive items during scroll
      />
    </View>
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

  if (!isActiveReel) {
    return (
      <InactiveReelItem
        item={item}
        index={props.index}
        activeIndex={props.activeIndex}
        cardHeight={props.cardHeight}
        activePlaylistId={props.activePlaylistId}
        isActiveCardClassified={props.isActiveCardClassified ?? true}
        isGuest={props.isGuest} // Pass isGuest to allow membership query stabilization
        shadowProgress={shadowProgress}
      />
    );
  }

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
    prevProps.activeIndex === nextProps.activeIndex &&
    prevProps.index === nextProps.index &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.scrollEnabled === nextProps.scrollEnabled &&
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
  scrollEnabled,
  handleScrollEnabledChange,
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
  scrollEnabled: boolean;
  handleScrollEnabledChange: (enabled: boolean) => void;
  isActiveCardClassified: boolean;
  feedSessionId: string;
}) => {
  if (!cardId) {
    return (
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
    );
  }

  return (
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
      scrollEnabled={scrollEnabled}
      onScrollEnabledChange={handleScrollEnabledChange}
    />
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.cardId === nextProps.cardId &&
    prevProps.activeIndex === nextProps.activeIndex &&
    prevProps.index === nextProps.index &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.activePlaylistId === nextProps.activePlaylistId &&
    prevProps.scrollEnabled === nextProps.scrollEnabled &&
    prevProps.isActiveCardClassified === nextProps.isActiveCardClassified
  );
});

export default function ReelsScreen({ isCustomPlayer = false }: { isCustomPlayer?: boolean }) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // Local-First Architecture: SyncPauseGate pauses sync automatically when focused

  const [showTutorial, setShowTutorial] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const hasConfirmedExit = useRef(false);
  const feedSessionIdRef = useRef(Date.now().toString());

  // High-fidelity UI-thread scroll offset tracking
  const scrollY = useSharedValue(0);

  const handleScroll = useCallback((event: any) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  }, []);

  // Immersive Navigation Lock: Intercept swipe back, hardware back, and navigation removals
  useEffect(() => {
    if (!isCustomPlayer) return;

    // Disable swipe-back gesture on iOS so users are kept in immersive revision mode
    navigation.setOptions({
      gestureEnabled: false,
    });

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

  useEffect(() => {
    const checkTutorialStatus = async () => {
      try {
        const isComplete = await AsyncStorage.getItem('dsa-reels-tutorial-complete');
        if (!isComplete) {
          setShowTutorial(true);
        }
      } catch (e) {}
    };
    checkTutorialStatus();
  }, []);

  const { user } = useAuthStore();
  const { canManageContent, role } = useRole();
  
  // Custom hook for unified resume syncing and loop mutations
  const { syncResumeState, syncLoopCompletion } = useProgressSync();

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

  const [page, setPage] = useState(1);
  const [allCards, setAllCards] = useState<string[]>([]);
  const [navState, setNavState] = useState({ activeIndex: 0, prevIdx: -1 });
  const activeIndex = navState.activeIndex;
  const prevIdx = navState.prevIdx;
  const shuffledOrderRef = useRef<string[]>([]);
  const flatListRef = useRef<any>(null);

  const disableScrollNatively = useCallback(() => {
    try {
      const scrollableNode = flatListRef.current?.getScrollableNode();
      if (scrollableNode && typeof scrollableNode.setNativeProps === 'function') {
        scrollableNode.setNativeProps({ scrollEnabled: false });
      } else if (flatListRef.current && typeof flatListRef.current.setNativeProps === 'function') {
        flatListRef.current.setNativeProps({ scrollEnabled: false });
      }
    } catch (e) {
      console.warn('Native scroll locking was bypassed:', e);
    }
  }, []);

  const enableScrollNatively = useCallback(() => {
    try {
      const scrollableNode = flatListRef.current?.getScrollableNode();
      if (scrollableNode && typeof scrollableNode.setNativeProps === 'function') {
        scrollableNode.setNativeProps({ scrollEnabled: true });
      } else if (flatListRef.current && typeof flatListRef.current.setNativeProps === 'function') {
        flatListRef.current.setNativeProps({ scrollEnabled: true });
      }
    } catch (e) {
      console.warn('Native scroll unlocking was bypassed:', e);
    }
  }, []);

  const handleScrollEnabledChange = useCallback((enabled: boolean) => {
    setScrollEnabled(enabled);
    if (enabled) {
      enableScrollNatively();
      // Snap back to activeIndex to prevent any drift from diagonal swipes
      flatListRef.current?.scrollToIndex({
        index: activeIndex,
        animated: true,
      });
    } else {
      disableScrollNatively();
    }
  }, [enableScrollNatively, disableScrollNatively, activeIndex]);
  const hasScrolledToInitial = useRef(false);
  const sessionStartCardId = useRef<string | null>(null);
  const recentCardIdsRef = useRef<string[]>([]);

  const { activePlaylistId: storedPlaylistId, setActivePlaylistId } = useBookmarkStore();
  const activePlaylistId = isCustomPlayer ? storedPlaylistId : null;
  const { data: playlists = [] } = usePlaylists();
  const { data: foldersData } = useGetFolders({ limit: 100 });

  // Zustand scalable tracking store
  const {
    currentMode,
    infiniteLoop,
    watchLaterCardIds,
    loopsCompleted,
    sessionTotalTime,
    completedCardsCount,
  } = useTrackingStore(
    useShallow((state) => ({
      currentMode: state.currentMode,
      infiniteLoop: state.infiniteLoop,
      watchLaterCardIds: state.watchLaterCardIds,
      loopsCompleted: state.loopsCompleted,
      sessionTotalTime: state.sessionTotalTime,
      completedCardsCount: state.completedCardsCount,
    }))
  );

  const {
    setMode,
    setInfiniteLoop,
    toggleWatchLater,
    setWatchLater,
    startSession,
    updateSessionTime,
    markCardCompleted,
    resetSession,
  } = useTrackingStore();

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

  // SessionQueue playback variables
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCards, setSessionCards] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryCount, setSessionRetryCount] = useState(0);

  // Decide if playback session is active
  const isGuest = user?.id === 'guest-user';
  const isSessionActive = !isGuest && (!!folderIdParam || !!activePlaylistId);

  const [showRunConfig, setShowRunConfig] = useState(false);

  // Premium settings overlay state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Resume Engine
  const {
    getFolderProgress,
    getPlaylistProgress,
    clearFolderProgress,
    clearPlaylistProgress,
  } = useResumeStore();
  const hasPromptedResume = useRef(false);

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
  const pendingProgressRef = useRef<{
    type: 'folder' | 'playlist';
    id: string;
    resumeCardId: string;
    resumeIndex: number;
  } | null>(null);
  const pendingSessionSyncRef = useRef<{
    sessionId: string;
    newIndex: number;
  } | null>(null);

  const bottomTabBarHeight = isCustomPlayer ? (insets.bottom + 16) : (insets.bottom + 72);
  const cardHeight = (height - insets.top - bottomTabBarHeight) * 0.98; 

  // Memoize query object to ensure stable queryKey references in React Query
  const query = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(folderIdParam ? { folderId: folderIdParam } : {}),
    ...(topicParam ? { topic: topicParam } : {}),
    ...(tagsParam ? { tags: tagsParam } : {}),
    ...(difficultyParam ? { difficulty: difficultyParam } : {}),
    ...(searchParam ? { search: searchParam } : {}),
  }), [page, folderIdParam, topicParam, tagsParam, difficultyParam, searchParam]);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetRevisionCards(query);

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

  const handleLoopComplete = () => {
    const type = activePlaylistId ? 'playlist' : 'folder';
    const id = activePlaylistId || folderIdParam || 'all';
    const cardsViewed = activePlaylistId ? playlistCards.length : data?.totalResults || 0;
    
    // Call the sync hook to record loop completion offline-first
    syncLoopCompletion(type, id, cardsViewed);
  };

  const handleLoadMore = () => {
    if (isSessionActive) return;
    if (!infiniteLoop) return;

    if (!activePlaylistId) {
      if (data && page < data.totalPages && !isFetching && !isLoading) {
        setPage((prev) => prev + 1);
      } else if (data && page >= data.totalPages && !isFetching) {
        handleLoopComplete();
        const originalCount = data.totalResults;
        setAllCards(prev => {
          const baseCards = prev.slice(0, originalCount);
          const loopedCards = baseCards.map(id => id + `-loop-${prev.length}`);
          return [...prev, ...loopedCards];
        });
      }
    } else {
      if (playlistCards.length > 0) {
        handleLoopComplete();
        setAllCards(prev => {
          const loopedCards = playlistCards.map(c => c._id + `-loop-${prev.length}`);
          return [...prev, ...loopedCards];
        });
      }
    }
  };

  // User and Guest flags are managed at the top of ReelsScreen

  // Unified card list computed dynamically on the store using a highly stable shallow-compared selector
  const cardsList = usePlaylistStateStore(
    useShallow((s) => {
      let listIds = isSessionActive 
        ? sessionCards 
        : allCards;

      // Filter and map based on s.cardsById
      let list = listIds.map(id => s.cardsById[id.split('-loop-')[0]]).filter(Boolean);

      // Apply local-first playlist filters to prevent stale server sessions showing removed cards
      if (activePlaylistId) {
        if (['easy', 'medium', 'hard', 'skipped'].includes(activePlaylistId)) {
          list = list.filter((c) => c.difficultyState === activePlaylistId);
        } else if (activePlaylistId === 'likes') {
          list = list.filter((c) => c.isFavorite);
        } else if (activePlaylistId === 'watch-later') {
          const watchLaterIds = useTrackingStore.getState().watchLaterCardIds;
          list = list.filter((c) => watchLaterIds.includes(c._id.split('-loop-')[0]));
        } else {
          const validIds = new Set(s.playlistCardOrderMap[activePlaylistId] || []);
          list = list.filter((c) => validIds.has(c._id.split('-loop-')[0]));
        }
      }

      // Filter duplicates generated by paging loop unless sequential
      const seenIds = new Set<string>();
      list = list.filter(card => {
        const cleanId = card._id.split('-loop-')[0];
        if (seenIds.has(cleanId) && currentMode !== 'sequential') {
          return false;
        }
        seenIds.add(cleanId);
        return true;
      });

      // Apply difficulty states filters from parameters (from Folder)
      if (difficultyStatesParam) {
        const activeStates = difficultyStatesParam.split(',').filter(Boolean);
        if (activeStates.length > 0) {
          list = list.filter((c: any) => c.difficultyState && activeStates.includes(c.difficultyState));
        }
      }

      // Apply mode filters
      if (currentMode === 'difficult') {
        list = list.filter((c) => c.isDifficult);
      } else if (currentMode === 'favorites') {
        list = list.filter((c) => c.isFavorite);
      } else if (currentMode === 'watchLater') {
        list = list.filter((c) => watchLaterCardIds.includes(c._id.split('-loop-')[0]));
      } else if (currentMode === 'shuffle') {
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
      const listIdsSet = new Set(list.map(c => c._id));
      return listIds.filter(id => listIdsSet.has(id.split('-loop-')[0]));
    })
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
      if (!isGuest) {
        userCardStateService.markViewed(cleanId).catch(console.error);
      }
    }
  }, [activeIndex, cardsList, markCardCompleted, isGuest]);

  // Hydrate watchLater list from backend on mount
  useEffect(() => {
    if (isGuest) return;
    const fetchWatchLater = async () => {
      try {
        const data = await userCardStateService.getWatchLaterCards(1, 100);
        const cardIds = data.results.map((c) => c._id);
        setWatchLater(cardIds);
      } catch (err) {
        console.error('[Hydrate Watch Later Error]', err);
      }
    };
    fetchWatchLater();
  }, [isGuest]);

  // Reset standard queries when parameters change
  useEffect(() => {
    hasPromptedResume.current = false;
    hasScrolledToInitial.current = false;
    startSession(); // Start a fresh session when playback source/folder/playlist changes
    if (!activePlaylistId) {
      setPage(1);
      setAllCards([]);
      setNavState({ activeIndex: 0, prevIdx: -1 });
    }
  }, [folderIdParam, topicParam, tagsParam, difficultyParam, searchParam, activePlaylistId, startCardIdParam]);

  // Load playlist cards according to custom drag order
  useEffect(() => {
    if (!activePlaylistId) return;
    
    let cardsToSet = [...playlistCards]
      .filter(Boolean)
      .map((card: any) => card._id);
    setAllCards(cardsToSet);
  }, [playlistCards]);

  // Reset activeIndex and clear cards only when the active playlist actually changes
  const prevPlaylistId = useRef<string | null>(null);
  useEffect(() => {
    if (activePlaylistId && activePlaylistId !== prevPlaylistId.current) {
      setNavState({ activeIndex: 0, prevIdx: -1 });
      setAllCards([]);
      prevPlaylistId.current = activePlaylistId;
    }
  }, [activePlaylistId]);

  // Session initialization useEffect
  useEffect(() => {
    if (!isSessionActive) {
      setSessionId(null);
      setSessionCards([]);
      return;
    }

    // CRITICAL: If folderIdParam is explicitly provided, synchronously clear any stale
    // activePlaylistId to prevent race conditions where the session init tries to start
    // a playlist session (possibly for an empty source) before the cleanup useEffect fires.
    if (folderIdParam && activePlaylistId) {
      setActivePlaylistId(null);
      return; // The state change will re-trigger this useEffect with activePlaylistId = null
    }

    let isMounted = true;

    const initSession = async () => {
      setSessionLoading(true);
      setSessionError(null);
      try {
        let sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater';
        let sourceId: string;

        // PRIORITY: folderIdParam always takes precedence over activePlaylistId
        if (folderIdParam) {
          sourceType = 'folder';
          sourceId = folderIdParam;
        } else if (activePlaylistId) {
          if (activePlaylistId === 'likes') {
            sourceType = 'liked';
            sourceId = user!.id;
          } else if (activePlaylistId === 'watch-later') {
            sourceType = 'watchLater';
            sourceId = user!.id;
          } else {
            sourceType = 'playlist';
            sourceId = activePlaylistId;
          }
        } else {
          // Fallback — should not reach here due to isSessionActive guard
          setSessionLoading(false);
          return;
        }

        console.log('[Session Init Debug]', {
          folderIdParam,
          activePlaylistId,
          startCardIdParam,
          isSessionActive,
          sessionRetryCount
        });

        const isShuffle = currentMode === 'shuffle';
        const session = await sessionQueueService.startSession(sourceType, sourceId, isShuffle);
        
        if (!isMounted) return;
        setSessionId(session._id);
        
        const slice = await sessionQueueService.getSessionCardsSlice(session._id);
        if (!isMounted) return;

        // Hydrate session cards in store
        if (slice.cardsSlice) {
          usePlaylistStateStore.getState().hydratePlaylistCards('all', slice.cardsSlice);
        }
        setSessionCards(slice.orderedCardIds);

        // Resume session logic:
        const sourceKey = activePlaylistId || folderIdParam!;
        const progress = activePlaylistId 
          ? getPlaylistProgress(sourceKey) 
          : getFolderProgress(sourceKey);

        let targetIndex = slice.currentIndex;

        if (startCardIdParam) {
          const foundIdx = slice.orderedCardIds.indexOf(startCardIdParam);
          if (foundIdx !== -1) {
            targetIndex = foundIdx;
            await sessionQueueService.updateSessionIndex(session._id, targetIndex);
          }
          setNavState({ activeIndex: targetIndex, prevIdx: -1 });
        } else if (progress && (progress.resumeIndex > 0 || (progress as any).lastIndex > 0)) {
          const resumeIdx = (progress as any).lastIndex !== undefined ? (progress as any).lastIndex : progress.resumeIndex;
          const resumeCardId = (progress as any).lastCardId || progress.resumeCardId;

          let foundIdx = -1;
          if (resumeCardId) {
            foundIdx = slice.orderedCardIds.indexOf(resumeCardId);
          }
          if (foundIdx === -1 && resumeIdx < slice.orderedCardIds.length) {
            foundIdx = resumeIdx;
          }

          if (foundIdx > 0) {
            Alert.alert(
              'Resume Session',
              'Would you like to resume where you left off or start fresh?',
              [
                {
                  text: 'Start Fresh',
                  style: 'cancel',
                  onPress: () => {
                    if (activePlaylistId) clearPlaylistProgress(sourceKey);
                    else clearFolderProgress(sourceKey);
                    
                    setNavState({ activeIndex: 0, prevIdx: -1 });
                    sessionQueueService.updateSessionIndex(session._id, 0).catch(console.error);
                  }
                },
                {
                  text: 'Resume',
                  onPress: () => {
                    setNavState({ activeIndex: foundIdx, prevIdx: -1 });
                    sessionQueueService.updateSessionIndex(session._id, foundIdx).catch(console.error);
                    Toast.show({
                      type: 'info',
                      text1: 'Resuming from where you left',
                      position: 'top',
                      visibilityTime: 1500,
                    });
                  }
                }
              ]
            );
          }
        } else {
          setNavState({ activeIndex: targetIndex, prevIdx: -1 });
        }

      } catch (err: any) {
        console.error('[Session Initialization Error]', err);
        if (isMounted) {
          setSessionError(err.message || 'Failed to start playback session');
          const errorMessage = err.response?.data?.message || err.data?.message || err.message;
          if (errorMessage === 'The selected source has no cards to play') {
            setSessionCards([]);
            setSessionError(null);
          } else {
            setSessionError(errorMessage || 'Failed to start playback session');
          }
        }
      } finally {
        if (isMounted) {
          setSessionLoading(false);
        }
      }
    };

    initSession();

    return () => {
      isMounted = false;
    };
  }, [folderIdParam, activePlaylistId, isSessionActive, sessionRetryCount, startCardIdParam]);

  // Swipe swiping index sync & nearby card buffering
  const sessionSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSessionSwipe = useCallback(async (newIndex: number) => {
    if (!sessionId) return;

    // Track as pending session sync
    pendingSessionSyncRef.current = {
      sessionId,
      newIndex,
    };

    // 1. Queue server index sync in background (debounced)
    if (sessionSyncTimeoutRef.current) {
      clearTimeout(sessionSyncTimeoutRef.current);
    }
    sessionSyncTimeoutRef.current = setTimeout(() => {
      sessionQueueService.updateSessionIndex(sessionId, newIndex)
        .then(() => {
          pendingSessionSyncRef.current = null;
        })
        .catch((err) => {
          console.error('[Session Background Sync Error]', err);
        });
    }, 800); // 800ms debounce ensures rapid swipes do not flood the server

    // 2. Local-first buffer check:
    // Verify if upcoming adjacent cards are already hydrated in memory.
    // Check 10 cards ahead and 4 cards behind for seamless non-buffering continuity.
    const hasAheadCards = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(offset => {
      const targetIdx = newIndex + offset;
      if (targetIdx < sessionCards.length) {
        const id = sessionCards[targetIdx];
        return usePlaylistStateStore.getState().cardsById[id.split('-loop-')[0]] !== undefined;
      }
      return true;
    });

    const hasBehindCards = [1, 2, 3, 4].every(offset => {
      const targetIdx = newIndex - offset;
      if (targetIdx >= 0) {
        const id = sessionCards[targetIdx];
        return usePlaylistStateStore.getState().cardsById[id.split('-loop-')[0]] !== undefined;
      }
      return true;
    });

    // 3. Trigger API query only if a buffer slot is empty (cold start/scroll boundary)
    if (!hasAheadCards || !hasBehindCards) {
      try {
        const slice = await sessionQueueService.getSessionCardsSlice(sessionId);
        if (slice.cardsSlice) {
          usePlaylistStateStore.getState().hydratePlaylistCards('all', slice.cardsSlice);
        }
        setSessionCards(slice.orderedCardIds);
      } catch (err) {
        console.error('[Session Swipe Buffer Error]', err);
      }
    }
  }, [sessionId, sessionCards]);

  // Session-specific shuffle handler
  const handleToggleShuffleInSession = async (shuffleValue: boolean) => {
    if (!sessionId) return;
    try {
      const updatedSession = await sessionQueueService.toggleSessionShuffle(sessionId, shuffleValue);
      const slice = await sessionQueueService.getSessionCardsSlice(sessionId);
      
      if (slice.cardsSlice) {
        usePlaylistStateStore.getState().hydratePlaylistCards('all', slice.cardsSlice);
      }
      setSessionCards(slice.orderedCardIds);
      
      setNavState({ activeIndex: slice.currentIndex, prevIdx: -1 });
    } catch (err) {
      console.error('[Session Shuffle Toggle Error]', err);
    }
  };

  // Prompt resume state correctly on loaded cards (for non-session / guest playback)
  useEffect(() => {
    if (isSessionActive) return;
    if (cardsList.length === 0) {
      if (activeIndex !== 0) setNavState({ activeIndex: 0, prevIdx: -1 });
      return;
    }
    
    if (!hasPromptedResume.current) {
      if (startCardIdParam) {
        const targetIndex = cardsList.findIndex(id => id.split('-loop-')[0] === startCardIdParam);
        if (targetIndex !== -1) {
          hasPromptedResume.current = true;
          setNavState({ activeIndex: targetIndex, prevIdx: -1 });
        } else if (!isLoading && !playlistCardsLoading) {
          hasPromptedResume.current = true;
        }
        return;
      }

      const id = activePlaylistId || folderIdParam;
      if (id) {
        const progress = activePlaylistId 
          ? getPlaylistProgress(id) 
          : getFolderProgress(id);

        if (progress && (progress.resumeIndex > 0 || (progress as any).lastIndex > 0)) {
          hasPromptedResume.current = true;
          const resumeIdx = (progress as any).lastIndex !== undefined ? (progress as any).lastIndex : progress.resumeIndex;
          const resumeCardId = (progress as any).lastCardId || progress.resumeCardId;

          let targetIndex = resumeIdx;
          if (targetIndex >= cardsList.length || cardsList[targetIndex].split('-loop-')[0] !== resumeCardId) {
            const foundIdx = cardsList.findIndex(id => id.split('-loop-')[0] === resumeCardId);
            if (foundIdx !== -1) {
              targetIndex = foundIdx;
            } else {
              targetIndex = 0; 
            }
          }

          if (targetIndex > 0) {
            Alert.alert(
              'Resume Session',
              'Would you like to resume where you left off or start fresh?',
              [
                {
                  text: 'Start Fresh',
                  style: 'cancel',
                  onPress: () => {
                    if (activePlaylistId) clearPlaylistProgress(id);
                    else clearFolderProgress(id);
                    setNavState({ activeIndex: 0, prevIdx: -1 });
                  }
                },
                {
                  text: 'Resume',
                  onPress: () => {
                    setNavState({ activeIndex: targetIndex, prevIdx: -1 });
                    Toast.show({
                      type: 'info',
                      text1: 'Resuming from where you left',
                      position: 'top',
                      visibilityTime: 1500,
                    });
                  }
                }
              ]
            );
          }
        } else {
          hasPromptedResume.current = true;
        }
      }
    }

    if (activeIndex >= cardsList.length && cardsList.length > 0) {
      setNavState({ activeIndex: cardsList.length - 1, prevIdx: -1 });
    }
  }, [cardsList, activePlaylistId, folderIdParam, isSessionActive]);

  // Stable parent callback to handle instant, non-flickering, optimistic state updates
  const handleCardStateUpdate = useCallback((cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => {
    const currentActivePlaylistId = activePlaylistId;
    setAllCards((prevCards) => {
      if (currentActivePlaylistId === 'likes' && action === 'favorite' && !value) {
        return prevCards.filter((id) => id.split('-loop-')[0] !== cardId);
      }
      return prevCards;
    });

    setSessionCards((prevCards) => {
      if (currentActivePlaylistId === 'likes' && action === 'favorite' && !value) {
        return prevCards.filter((id) => id.split('-loop-')[0] !== cardId);
      }
      return prevCards;
    });
  }, [activePlaylistId]);

  // Synchronize and merge new/updated API pages to the continuous deck
  useEffect(() => {
    if (activePlaylistId || !data?.results) return;
    
    if (allCards.length === 0) {
      setAllCards(data.results);
      setNavState({ activeIndex: 0, prevIdx: -1 });
    } else {
      setAllCards((prevCards) => {
        const existingSet = new Set(prevCards.map(id => id.split('-loop-')[0]));
        const newIds = data.results.filter((id: string) => !existingSet.has(id.split('-loop-')[0]));
        if (newIds.length === 0) return prevCards;
        return [...prevCards, ...newIds];
      });
    }
  }, [activePlaylistId, data?.results]);

  // Prefetch adjacent pagination pages in background
  useEffect(() => {
    if (activePlaylistId || !data || page >= data.totalPages) return;
    const pagesToPrefetch = Math.min(2, data.totalPages - page);
    for (let i = 1; i <= pagesToPrefetch; i++) {
      const prefetchPage = page + i;
      const nextQuery = { ...query, page: prefetchPage };
      queryClient.prefetchQuery({
        queryKey: ['revisionCards', nextQuery],
        queryFn: () => revisionService.getRevisionCards(nextQuery),
      });
    }
  }, [page, data?.totalPages, activePlaylistId]);

  // Unified transition coordinator with background sync
  const transitionToCard = (nextIdx: number) => {
    if (viewTimeoutRef.current) clearTimeout(viewTimeoutRef.current);
    
    const currentList = cardsList;
    if (currentList[nextIdx] && !isGuest) {
      const activeItem = currentList[nextIdx];
      const cleanCardId = activeItem.split('-loop-')[0];
      const id = activePlaylistId || folderIdParam;
      const type: 'folder' | 'playlist' = activePlaylistId ? 'playlist' : 'folder';
      
      if (id) {
        pendingProgressRef.current = {
          type,
          id,
          resumeCardId: cleanCardId,
          resumeIndex: nextIdx,
        };

        viewTimeoutRef.current = setTimeout(() => {
          syncResumeState(type, id, {
            resumeCardId: cleanCardId,
            resumeIndex: nextIdx,
            resumeScrollOffset: 0,
          });
          pendingProgressRef.current = null;
        }, 600);
      }
    }
    setNavState({ activeIndex: nextIdx, prevIdx: -1 });
  };

  useEffect(() => {
    return () => {
      // Flush pending local progress save synchronously on unmount
      if (pendingProgressRef.current) {
        const { type, id, resumeCardId, resumeIndex } = pendingProgressRef.current;
        syncResumeState(type, id, {
          resumeCardId,
          resumeIndex,
          resumeScrollOffset: 0,
        });
      }

      // Flush pending session index sync on unmount
      if (pendingSessionSyncRef.current) {
        const { sessionId, newIndex } = pendingSessionSyncRef.current;
        sessionQueueService.updateSessionIndex(sessionId, newIndex).catch((err) => {
          console.error('[Session Background Sync Flush Error]', err);
        });
      }

      if (viewTimeoutRef.current) clearTimeout(viewTimeoutRef.current);
      if (sessionSyncTimeoutRef.current) clearTimeout(sessionSyncTimeoutRef.current);
      if (isCustomPlayer) {
        setActivePlaylistId(null);
      }
    };
  }, [folderIdParam, activePlaylistId, isCustomPlayer]);

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

    // 1. Optimistic state update in local arrays
    handleCardStateUpdate(cleanId, action, value);

    // Optimistic update directly in Zustand store!
    if (action === 'favorite') {
      usePlaylistStateStore.getState().toggleFavoriteInStore(cleanId, value);
    } else if (action === 'difficult') {
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

    // 2. Sync to DB
    updateProgressMutation.mutate(
      { cardId: cleanId, action, value },
      {
        onError: (err) => {
          console.error(`[MUTATION ERROR]`, err);
          handleCardStateUpdate(cleanId, action, !value);
          if (action === 'favorite') {
            usePlaylistStateStore.getState().toggleFavoriteInStore(cleanId, !value);
          } else if (action === 'difficult') {
            const cardObj = usePlaylistStateStore.getState().cardsById[cleanId] || {};
            usePlaylistStateStore.getState().transferCard(cleanId, cardObj, !value ? 'hard' : null);
          } else if (action === 'archived') {
            usePlaylistStateStore.setState((state) => {
              const existing = state.cardsById[cleanId];
              if (!existing) return {};
              return {
                cardsById: {
                  ...state.cardsById,
                  [cleanId]: { ...existing, isArchived: !value },
                },
              };
            });
          }
        }
      }
    );

    if (action === 'favorite') {
      userCardStateService.toggleLike(cleanId).catch(console.error);
      const currentActivePlaylistId = activePlaylistId;
      if (currentActivePlaylistId && currentActivePlaylistId !== 'likes' && currentActivePlaylistId !== 'watch-later') {
        togglePlaylistItem.mutate({
          playlistId: currentActivePlaylistId,
          revisionCardId: cleanId,
          isInPlaylist: !value, // if it was marked true, remove (isInPlaylist = false now true)
        });
      }
    }
  }, [isGuest, handleCardStateUpdate, activePlaylistId, togglePlaylistItem]);

  const handleWatchLaterToggleInReels = useCallback((cardId: string) => {
    const cleanId = cardId.split('-loop-')[0];
    lightHaptic();
    toggleWatchLater(cleanId);
    if (!isGuest) {
      userCardStateService.toggleWatchLater(cleanId).catch(console.error);
    }
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    queryClient.invalidateQueries({ queryKey: ['playlistDetail', 'watch-later'] });
  }, [isGuest, toggleWatchLater, queryClient]);

  const handleDifficultyStateUpdateInReels = useCallback((cardId: string, state: 'easy' | 'medium' | 'hard' | 'skipped') => {
    lightHaptic();
    
    const targetCard = usePlaylistStateStore.getState().cardsById[cardId];
    const activeCurrently = targetCard?.difficultyState === state;
    const resolvedNewState = activeCurrently ? null : state;

    // 1. Optimistic update of local Zustand store instantly to unlock vertical swipe locks & trigger cell rerender
    const cardObj = usePlaylistStateStore.getState().cardsById[cardId] || {};
    usePlaylistStateStore.getState().transferCard(cardId, cardObj, resolvedNewState);

    // 2. Persist to database instantly
    if (!isGuest) {
      updateDifficultyStateMutation.mutate({ cardId, difficultyState: resolvedNewState });
    }
  }, [isGuest, updateDifficultyStateMutation]);

  const handleMoreOptionsTrigger = useCallback((card: IPopulatedRevisionCard, scrollHorizontal: (idx: number) => void) => {
    const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
    const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, card.createdBy) : false);

    const options: any[] = [
      {
        text: '💻 Code Walkthrough',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'code');
          scrollHorizontal(idx !== -1 ? idx : 0);
        },
      },
      {
        text: '📊 Trace Dry Run',
        onPress: () => {
          const slides = getSlidesForCard(card);
          const idx = slides.findIndex((s) => s.type === 'dryrun');
          scrollHorizontal(idx !== -1 ? idx : 0);
        },
      },
      {
        text: card.isArchived ? '🔓 Unhide Card' : '📦 Hide Card (Archive)',
        onPress: () => handleProgressUpdateInReels(card._id, 'archived', !card.isArchived),
      },
    ];

    if (canEdit) {
      options.push({
        text: '✍️ Edit Card',
        onPress: () => {
          const folderId = typeof card.folderId === 'object' ? card.folderId._id : card.folderId;
          router.push({
            pathname: '/(protected)/(tabs)/CreateRevisionScreen',
            params: { cardId: card._id.split('-loop-')[0], folderId, card: JSON.stringify(card) },
          });
        }
      });
      options.push({
        text: '🗑️ Delete Card',
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

    const nextIdx = (activeIndex + 1) % listLength;
    flatListRef.current?.scrollToIndex({
      index: nextIdx,
      animated: true,
    });
    setNavState({ activeIndex: nextIdx, prevIdx: activeIndex });
    transitionToCard(nextIdx);
  }, [activeIndex, cardsList, transitionToCard]);

  const goToPrevCard = useCallback(() => {
    const listLength = cardsList.length;
    if (listLength === 0) return;
    const prevIdxLoc = (activeIndex - 1 + listLength) % listLength;
    flatListRef.current?.scrollToIndex({
      index: prevIdxLoc,
      animated: true,
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
    const index = Math.round(yOffset / Math.round(cardHeight + 16));
    if (index !== activeIndex && index >= 0 && index < cardsList.length) {
      setNavState({ activeIndex: index, prevIdx: activeIndex });
      transitionToCard(index);
    }
  }, [activeIndex, cardsList.length, cardHeight, transitionToCard]);

  // Hydration Mount Scrolling
  useEffect(() => {
    if (cardsList.length > 0 && !hasScrolledToInitial.current) {
      if (activeIndex > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: activeIndex,
            animated: false,
          });
          setTimeout(() => {
            hasScrolledToInitial.current = true;
          }, 50);
        }, 100);
      } else {
        hasScrolledToInitial.current = true;
      }
    }
  }, [cardsList.length, activeIndex]);

  // Auto-pop reels-player when switching away to another tab
  useEffect(() => {
    if (!isCustomPlayer) return;

    const unsubscribe = navigation.addListener('blur', () => {
      // If we are a custom reels player inside the tabs navigator, and the tab loses focus (blur event),
      // immediately pop back so that the user's Home/My Space page resets back to the original folder/playlist!
      router.back();
    });

    return unsubscribe;
  }, [navigation, isCustomPlayer]);

  // Analytics: Track dynamic vertical scrolls
  const isFirstScrollMount = useRef(true);
  useEffect(() => {
    if (isFirstScrollMount.current) {
      isFirstScrollMount.current = false;
      return;
    }
    if (!hasScrolledToInitial.current) return;
    
    useTrackingStore.getState().incrementScroll();
  }, [activeIndex]);

  // Listen to activeIndex changes to sync session, prefetch images, and handle infinite pagination load
  useEffect(() => {
    if (cardsList.length > 0 && activeIndex >= 0 && activeIndex < cardsList.length) {
      const idx = activeIndex;

      // Keep track of the last 3 visited card IDs
      const currentCardId = cardsList[idx];
      if (currentCardId) {
        recentCardIdsRef.current = [
          currentCardId,
          ...recentCardIdsRef.current.filter(id => id !== currentCardId).slice(0, 2)
        ].filter(Boolean);
      }

      // 1. Sync session swipe
      if (isSessionActive && sessionId) {
        handleSessionSwipe(idx);
      }

      // 2. Prefetch upcoming card images
      try {
        const prefetchCount = Math.min(idx + 3, cardsList.length);
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

      // 3. Trigger handleLoadMore if getting within 3 cards of the end of the stack
      if (idx >= cardsList.length - 3) {
        handleLoadMore();
      }
    }
  }, [activeIndex, cardsList, isSessionActive, sessionId, handleSessionSwipe]);

  // Clean, high-fidelity overlay toggle without pill warping
  const toggleMenu = () => {
    lightHaptic();
    setIsSettingsOpen(!isSettingsOpen);
  };

  const isPlaylistLoading = !!activePlaylistId && playlistCardsLoading;

  if (isLoading || isPlaylistLoading || (isSessionActive && sessionLoading)) {
    return (
      <View className="flex-1 bg-[#F5F5F7]" style={{ paddingTop: insets.top || 48 }}>
        <ReelItemSkeleton cardHeight={cardHeight} width={width} />
      </View>
    );
  }

  if (isError || (activePlaylistId && playlistCardsError) || (isSessionActive && sessionError)) {
    return (
      <View className="flex-1 justify-center items-center bg-[#F8FAFC] p-6">
        <Text className="text-[#64748B] text-lg text-center mb-4 font-medium">
          {sessionError 
            ? sessionError 
            : activePlaylistId 
              ? 'Could not load playlist' 
              : error?.message || 'An error occurred'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (isSessionActive && sessionError) {
              setSessionRetryCount(prev => prev + 1);
            } else if (activePlaylistId) {
              refetchPlaylistCards();
            } else {
              refetch();
            }
          }}
          className="px-8 py-3.5 rounded-full bg-[#8B5CF6] shadow-md shadow-violet-500/20 active:scale-[0.98]"
        >
          <Text className="text-white font-medium">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeCard = cardsList[activeIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F5F5F7' }} className="bg-[#F5F5F7]">
      <SyncPauseGate />
      
      {showTutorial && (
        <FirstFeedTutorial onDismiss={() => setShowTutorial(false)} />
      )}
      
      {/* Settings & Personalization Overlay */}
      {isSettingsOpen && (
        <ReelsSettingsOverlay
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          playlistName={activePlaybackName}
          sessionTimer={formatTime(sessionTotalTime)}
          questionsRevised={completedCardsCount}
          showReelContentSelect={!isCustomPlayer}
        />
      )}

      {/* Premium minimal exit button for focused immersive revision sessions */}
      {isCustomPlayer && (
        <TouchableOpacity
          onPress={() => setIsExitModalOpen(true)} // Open modal directly to ensure Reels screen remains fully active in the background
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

        {/* RIGHT SIDE: ChatGPT AI Assistant Icon */}
        <TouchableOpacity
          onPress={async () => {
            const activeCardId = cardsList[activeIndex];
            if (!activeCardId) return;
            const activeCardItem = usePlaylistStateStore.getState().cardsById[activeCardId.split('-loop-')[0]];
            if (!activeCardItem) return;

            const slides = getSlidesForCard(activeCardItem);
            const slidesContent = slides.map((slide, i) => {
              const bodyStr = slide.body ? `\nBody: ${slide.body}` : '';
              const codeStr = slide.code ? `\nCode: ${slide.code}` : '';
              const blocksStr = slide.blocks ? `\nData: ${JSON.stringify(slide.blocks)}` : '';
              return `[Slide ${i+1} - ${slide.type || 'content'}]\nHeadline: ${slide.headline}${bodyStr}${codeStr}${blocksStr}`;
            }).join('\n\n');

            const prompt = `Please explain this DSA problem to me:\n\nTitle: ${activeCardItem.title}\nTopic: ${activeCardItem.topic}\nDifficulty: ${activeCardItem.difficulty}\n\nExplanation:\n${activeCardItem.explanation}\n\nCode:\n${activeCardItem.code || 'N/A'}\n\n--- SLIDES DATA ---\n${slidesContent}\n------------------\n\nPlease analyze this fully.`;
            
            // Fire clipboard asynchronously without blocking the UI thread
            Clipboard.setStringAsync(prompt).catch(err => console.warn('Clipboard failed:', err));

            // To fully automate the pasting, we encode the entire massive prompt into the App Link.
            // Note: If the payload is extremely large, Android may rarely truncate it, but this allows 1-tap automation!
            const appLinkUrl = 'https://chatgpt.com/?q=' + encodeURIComponent(prompt);

            Linking.openURL(appLinkUrl).catch(e => {
              console.error('Deep link failed:', e);
              // Fallback directly to web version if nothing intercepts it
              Linking.openURL('https://chatgpt.com/').catch(err => console.error(err));
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
            source={require('../../../assets/chat-gpt.png')} 
            style={{ width: 22, height: 22, resizeMode: 'contain', opacity: 0.9 }} 
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
          backgroundColor: '#F5F5F7', // Explicitly lock container background
        }}
      >
        {cardsList.length > 0 ? (
          <FlashListElement
            ref={flatListRef}
            data={cardsList}
            scrollEnabled={scrollEnabled}
            renderItem={({ item, index }: { item: any; index: number }) => {
              const activeCardId = cardsList[activeIndex];
              const activeCardItem = activeCardId ? usePlaylistStateStore.getState().cardsById[activeCardId.split('-loop-')[0]] : null;
              const isActiveCardClassified = activeCardItem ? (activeCardItem.difficultyState !== null && activeCardItem.difficultyState !== undefined) : true;

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
                  scrollEnabled={scrollEnabled}
                  handleScrollEnabledChange={handleScrollEnabledChange}
                  isActiveCardClassified={isActiveCardClassified}
                  feedSessionId={feedSessionIdRef.current}
                />
              );
            }}
            keyExtractor={(item: any, index: number) => item || `loading-slot-${index}`}
            snapToInterval={Math.round(cardHeight + 16)} // Subpixel Snapping coordinate rounding
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum={true}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={Math.round(cardHeight + 16)}
            drawDistance={Math.round(cardHeight * 1.5)} // Scoped viewport precomputation window
            removeClippedSubviews={Platform.OS === 'android'} // Android memory containment, off-screen optimization
            getItemType={(item: any) => {
              if (!item) return 'LOADING';
              const card = usePlaylistStateStore.getState().cardsById[item.split('-loop-')[0]];
              return card && card.code ? 'CODE_SLIDE' : 'TEXT_SLIDE';
            }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handleScrollEnd}
            onScrollEndDrag={handleScrollEnd}
            style={{ width: '100%', height: '100%', backgroundColor: '#F5F5F7' }}
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

      {/* Centralized Playlist Picker Modal */}
      {playlistModalCard !== null && (
        <PlaylistPickerModal
          card={playlistModalCard}
          onClose={() => setPlaylistModalCard(null)}
        />
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
