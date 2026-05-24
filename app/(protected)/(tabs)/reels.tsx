import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
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
import * as reelsFeedService from '@/services/reelsFeedService';
import * as userCardStateService from '@/services/userCardStateService';
import { ConceptCardPreview, getSlidesForCard } from '@/components/ConceptCardPreview';
import { FirstFeedTutorial } from '@/components/onboarding/FirstFeedTutorial';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width * 0.97;
const PAGE_SIZE = 15; // Increased page size for smoother continuous reel buffering

// Premium physical spring snapping parameters (Spotify / Apple physics)
const SPRING_CONFIG = {
  damping: 28,
  stiffness: 160,
  mass: 0.8,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
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
  membership?: Record<string, boolean>;
  onDifficultyStateUpdate: (state: 'easy' | 'medium' | 'hard' | 'skipped') => void;
  onPlaylistPickerTrigger: (card: IPopulatedRevisionCard) => void;
  isGuest: boolean;
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
  membership,
  onDifficultyStateUpdate,
  onPlaylistPickerTrigger,
  isGuest,
}: ReelsActionRailProps) => {
  const currentDifficulty = item.difficultyState;
  const shouldPulse = !currentDifficulty;
  const isSaved = Object.values(membership ?? {}).some(Boolean);

  return (
    <View 
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
});

interface ReelItemProps {
  item: IPopulatedRevisionCard;
  index: number;
  activeIndex: number;
  goToNextCard: () => void;
  goToPrevCard: () => void;
  cardHeight: number;
  width: number;
  isFavorite: boolean;
  activePlaylistId: string | null;
  isGuest: boolean;
  canEdit: boolean;
  onToggleWatchLater: (cleanId: string) => void;
  onCardStateUpdate: (cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => void;
  onPlaylistPickerTrigger: (card: IPopulatedRevisionCard) => void;
  onMoreOptionsTrigger: (card: IPopulatedRevisionCard, scrollHorizontal: (idx: number) => void) => void;
  onDifficultyStateUpdate: (cardId: string, state: 'easy' | 'medium' | 'hard' | 'skipped') => void;
  isActiveCardClassified?: boolean;
  membership?: Record<string, boolean>;
}

interface SlideCardWrapperProps {
  slide: ISlide;
  indexInDeck: number;
  activeSlideIndexSV: SharedValue<number>;
  slideDragX: SharedValue<number>;
  prevSlideDragX: SharedValue<number>;
  cardHeight: number;
  width: number;
  zIndex: number;
  renderSlideContent: (slide: ISlide, index: number) => React.ReactNode;
}

const SlideCardWrapper = React.memo(({
  slide,
  indexInDeck,
  activeSlideIndexSV,
  slideDragX,
  prevSlideDragX,
  cardHeight,
  width,
  zIndex,
  renderSlideContent,
}: SlideCardWrapperProps) => {
  // =========================================================================
  // Onboarding-style card stack animation:
  // - Active card (delta=0): Drags left only (forward swipe). No right drag.
  // - Next card (delta=1): Sits underneath, scales up as active card is swiped away.
  // - Previous card (delta=-1): Slides OVER active card from the left on back swipe.
  //   It starts offscreen at -width and translates to 0. zIndex is higher than active.
  // - First card cannot swipe right, last card cannot swipe left.
  // =========================================================================
  const animatedStyle = useAnimatedStyle(() => {
    const activeIdx = activeSlideIndexSV.value;
    const delta = indexInDeck - activeIdx;

    // Active card: only tracks left drag (forward). Right drag is handled by previous card.
    if (delta === 0) {
      // Only allow negative (left) translation for the active card during drag
      const tx = Math.min(0, slideDragX.value);
      const rotate = `${tx / 25}deg`;
      return {
        transform: [
          { translateX: tx },
          { translateY: 0 },
          { scale: 1 },
          { rotate: rotate },
        ],
        opacity: 1,
        zIndex: 10,
      };
    }

    // Next card: scales up and fades in as the active card is swiped left
    if (delta === 1) {
      const activeTx = slideDragX.value;
      const progress = Math.min(Math.abs(Math.min(0, activeTx)) / (width * 0.6), 1.0);
      const scale = 0.93 + (0.07 * progress);
      const cardOpacity = 0.5 + (0.5 * progress);
      return {
        transform: [
          { translateX: 0 },
          { translateY: 0 },
          { scale: scale },
          { rotate: '0deg' },
        ],
        opacity: cardOpacity,
        zIndex: 9,
      };
    }

    // Previous card: slides OVER the active card from the left
    if (delta === -1) {
      // prevSlideDragX carries the previous card's translation during back navigation
      const tx = prevSlideDragX.value;
      return {
        transform: [
          { translateX: tx },
          { translateY: 0 },
          { scale: 1 },
          { rotate: `${tx / 25}deg` },
        ],
        opacity: 1,
        zIndex: 20, // Above active card so it slides OVER
      };
    }

    // Older swiped-off cards (delta < -1)
    if (delta < -1) {
      return {
        transform: [
          { translateX: slideDragX.value },
          { translateY: 0 },
          { scale: 1 },
          { rotate: '0deg' },
        ],
        opacity: 0,
        zIndex: 0,
      };
    }

    // Future cards (delta > 1): hidden
    return {
      transform: [
        { translateX: 0 },
        { translateY: 0 },
        { scale: 0.93 },
        { rotate: '0deg' },
      ],
      opacity: 0,
      zIndex: 0,
    };
  });

  return (
    <Animated.View
      style={[
        styles.cardBase,
        {
          width: width * 0.97,
          height: cardHeight,
          position: 'absolute',
          paddingHorizontal: 24,
          paddingTop: 64,
          paddingBottom: 24,
          overflow: 'hidden',
        },
        animatedStyle,
      ]}
    >
      {renderSlideContent(slide, indexInDeck)}
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
  membership,
}: ReelItemProps) => {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const { preferences } = useUserPreferencesStore();

  const slideDragX = useSharedValue(0);
  const prevSlideDragX = useSharedValue(-width - 100); // Previous card starts offscreen left
  const cardTranslateY = useSharedValue(0);
  const lockPillColor = useSharedValue(0);
  const activeSlideIndexSV = useSharedValue(0);
  const isTransitioning = useSharedValue(false);
  const isMounted = useRef(true);

  const currentPrefsKey = `${preferences.hideCertainBlockTypes?.join(',')}-${preferences.explanationFlowOrder?.join(',')}`;

  // Reset translation and active slide index when the card item changes or preferences change.
  // This MUST be inside a useEffect to prevent Reanimated "Reading from value during render" 
  // warnings and React "Expected static flag was missing" internal crashes.
  useEffect(() => {
    setActiveSlideIndex(0);
    cancelAnimation(slideDragX);
    cancelAnimation(prevSlideDragX);
    slideDragX.value = 0;
    prevSlideDragX.value = -width - 100;
    cardTranslateY.value = 0;
    activeSlideIndexSV.value = 0;
    isTransitioning.value = false;
  }, [item._id, currentPrefsKey, width]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cancelAnimation(slideDragX);
      cancelAnimation(prevSlideDragX);
      cancelAnimation(cardTranslateY);
      cancelAnimation(lockPillColor);
      cancelAnimation(activeSlideIndexSV);
    };
  }, [item._id, currentPrefsKey]);

  useEffect(() => {
    activeSlideIndexSV.value = activeSlideIndex;
    // Reset translation and transition locks after the index change has been committed to prevent layout jumping/flickering
    slideDragX.value = 0;
    prevSlideDragX.value = -width - 100; // Previous card resets offscreen left
    isTransitioning.value = false;
  }, [activeSlideIndex]);

  // Subscribe to watchLater state locally to stabilize parent's renderItem
  const watchLaterCardIds = useTrackingStore((state) => state.watchLaterCardIds);
  const cleanId = item._id.split('-loop-')[0];
  const isWatchLater = watchLaterCardIds.includes(cleanId);

  const slides = useMemo(() => {
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
    
    return introSlide ? [introSlide, ...otherSlides] : otherSlides;
  }, [item, preferences.hideCertainBlockTypes, preferences.explanationFlowOrder]);

  const handleSwipeComplete = () => {
    if (!isMounted.current) return;
    
    // If the reel is no longer active, abort state changes to prevent unmounted/inactive React updates
    if (index !== activeIndex) {
      setTimeout(() => {
        slideDragX.value = 0;
        isTransitioning.value = false;
      }, 0);
      return;
    }
    
    setTimeout(() => {
      if (isMounted.current) {
        setActiveSlideIndex((prev) => prev + 1);
        lightHaptic();
      }
    }, 0);
  };

  const handleSwipePrevComplete = () => {
    if (!isMounted.current) return;
    
    if (index !== activeIndex) {
      setTimeout(() => {
        slideDragX.value = 0;
        isTransitioning.value = false;
      }, 0);
      return;
    }
    
    setTimeout(() => {
      if (isMounted.current) {
        setActiveSlideIndex((prev) => prev - 1);
        lightHaptic();
      }
    }, 0);
  };

  // Handle explicit horizontal jump actions (e.g. from menu or explicit buttons)
  const scrollHorizontal = useCallback((idx?: number) => {
    const targetIdx = idx ?? 0;
    if (targetIdx >= 0 && targetIdx < slides.length) {
      if (isTransitioning.value) return;
      isTransitioning.value = true;
      slideDragX.value = 0;
      setActiveSlideIndex(targetIdx);
      isTransitioning.value = false;
      lightHaptic();
    }
  }, [slides.length, index, activeIndex]);

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
    .enabled(!isClassified)
    .onUpdate((event) => {
      // Elastic resistance cap at -40px on swipe up, 40px on swipe down
      if (event.translationY < 0) {
        cardTranslateY.value = Math.max(-40, event.translationY * 0.25);
      } else {
        cardTranslateY.value = Math.min(40, event.translationY * 0.25);
      }
    })
    .onEnd(() => {
      cardTranslateY.value = withSpring(0, {
        damping: 15,
        stiffness: 220,
      });
      runOnJS(lightHaptic)();
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
  // =========================================================================
  const horizontalGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      if (isTransitioning.value) return;
    })
    .onUpdate((event) => {
      if (isTransitioning.value) return;
      const dx = event.translationX;

      if (dx < 0) {
        // Dragging Left -> Move Forward: drag the active card left
        if (activeSlideIndex < slides.length - 1) {
          slideDragX.value = dx;
        }
      }
      // Right drag: no finger tracking — back swipe is committed on release only
    })
    .onEnd((event) => {
      if (isTransitioning.value) return;
      
      const SWIPE_THRESHOLD_X = CARD_WIDTH * 0.16;
      const VELOCITY_THRESHOLD = 350;
      const transX = event.translationX;
      const velX = event.velocityX;

      if (transX < 0) {
        // ---- LEFT SWIPE: Push active card off-screen to the left ----
        if (activeSlideIndex < slides.length - 1 && (Math.abs(transX) > SWIPE_THRESHOLD_X || Math.abs(velX) > VELOCITY_THRESHOLD)) {
          isTransitioning.value = true;
          slideDragX.value = withTiming(
            -width - 100,
            { duration: 300 },
            (finished) => {
              if (finished) {
                runOnJS(handleSwipeComplete)();
              }
            }
          );
        } else {
          // Cancel: snap active card back
          slideDragX.value = withSpring(
            0,
            { damping: 20, stiffness: 360, mass: 0.35 },
          );
        }
      } else if (transX > 0) {
        // ---- RIGHT SWIPE: Pull previous card OVER current card from the left ----
        if (activeSlideIndex > 0 && (Math.abs(transX) > SWIPE_THRESHOLD_X || Math.abs(velX) > VELOCITY_THRESHOLD)) {
          isTransitioning.value = true;
          // Position the previous card offscreen to the left
          prevSlideDragX.value = -width - 100;
          // Animate it sliding right over the current card to position 0
          prevSlideDragX.value = withTiming(0, { duration: 300 }, (finished) => {
            if (finished) {
              runOnJS(handleSwipePrevComplete)();
            }
          });
        } else {
          // No valid back swipe, just reset
          slideDragX.value = withSpring(
            0,
            { damping: 20, stiffness: 360, mass: 0.35 },
          );
        }
      } else {
        // No movement — reset
        slideDragX.value = withSpring(
          0,
          { damping: 20, stiffness: 360, mass: 0.35 },
        );
      }
    });

  const renderSlideContent = (slide: typeof slides[0], indexInDeck: number) => {
    if (indexInDeck === 0) {
      return (
        <ConceptCardPreview
          card={item}
          activePlaylistId={activePlaylistId}
          onViewExplanation={scrollHorizontal}
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
            if (Math.abs(delta) > 1) return null;

            let zIndex = 0;
            if (delta === 0) zIndex = 2;
            else if (delta === 1) zIndex = 1;
            else if (delta === -1) zIndex = 3;

            return (
              <SlideCardWrapper
                key={`slide-${indexInDeck}`}
                slide={slide}
                indexInDeck={indexInDeck}
                activeSlideIndexSV={activeSlideIndexSV}
                slideDragX={slideDragX}
                prevSlideDragX={prevSlideDragX}
                cardHeight={cardHeight}
                width={width}
                zIndex={zIndex}
                renderSlideContent={renderSlideContent}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>

      {/* Premium Glassmorphic Vertical Action Rail - completely outside gesture ownership */}
      <ReelsActionRail
        cleanId={cleanId}
        item={item}
        membership={membership}
        onDifficultyStateUpdate={(state) => onDifficultyStateUpdate(cleanId, state)}
        onPlaylistPickerTrigger={onPlaylistPickerTrigger}
        isGuest={isGuest}
      />
    </View>
  );
});

interface InactiveReelItemProps {
  item: IPopulatedRevisionCard;
  index: number;
  activeIndex: number;
  cardHeight: number;
  activePlaylistId: string | null;
  isActiveCardClassified: boolean;
}

const InactiveReelItem = React.memo(({
  item,
  index,
  activeIndex,
  cardHeight,
  activePlaylistId,
  isActiveCardClassified
}: InactiveReelItemProps) => {
  const isNextCard = index === activeIndex + 1;
  const isLockedNextCard = isNextCard && !isActiveCardClassified;

  const animatedCardStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 0.93 }],
      opacity: 0.5,
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
    >
      <Animated.View
        style={[
          styles.cardBase,
          {
            width: CARD_WIDTH,
            height: cardHeight,
            paddingHorizontal: 24,
            paddingTop: 64,
            paddingBottom: 24,
            overflow: 'hidden',
          },
          animatedCardStyle,
        ]}
      >
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
      </Animated.View>
    </View>
  );
});

const ReelItem = React.memo((props: ReelItemProps) => {
  const isActiveReel = props.index === props.activeIndex;

  if (!isActiveReel) {
    return (
      <InactiveReelItem
        item={props.item}
        index={props.index}
        activeIndex={props.activeIndex}
        cardHeight={props.cardHeight}
        activePlaylistId={props.activePlaylistId}
        isActiveCardClassified={props.isActiveCardClassified ?? true}
      />
    );
  }

  return <ActiveReelItem {...props} />;
});

export default function ReelsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [showTutorial, setShowTutorial] = useState(false);

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

  const folderIdParam = normalizeParam(params.folderId);
  const topicParam = normalizeParam(params.topic);
  const tagsParam = normalizeParam(params.tags);
  const difficultyParam = normalizeParam(params.difficulty);
  const searchParam = normalizeParam(params.search);
  const startCardIdParam = normalizeParam(params.startCardId);
  const difficultyStatesParam = normalizeParam(params.userDifficultyStates);

  const [page, setPage] = useState(1);
  const [allCards, setAllCards] = useState<IPopulatedRevisionCard[]>([]);
  const [navState, setNavState] = useState({ activeIndex: 0, prevIdx: -1 });
  const activeIndex = navState.activeIndex;
  const prevIdx = navState.prevIdx;
  const shuffledOrderRef = useRef<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const hasScrolledToInitial = useRef(false);
  const sessionStartCardId = useRef<string | null>(null);
  const recentCardIdsRef = useRef<string[]>([]);

  const { activePlaylistId, setActivePlaylistId } = useBookmarkStore();
  const { data: playlists = [] } = usePlaylists();
  const { data: foldersData } = useGetFolders({ limit: 100 });

  // Zustand scalable tracking store
  const currentMode = useTrackingStore((state) => state.currentMode);
  const infiniteLoop = useTrackingStore((state) => state.infiniteLoop);
  const watchLaterCardIds = useTrackingStore((state) => state.watchLaterCardIds);
  const loopsCompleted = useTrackingStore((state) => state.loopsCompleted);
  const sessionTotalTime = useTrackingStore((state) => state.sessionTotalTime);
  const completedCardsCount = useTrackingStore((state) => state.completedCardsCount);

  const setMode = useTrackingStore((state) => state.setMode);
  const setInfiniteLoop = useTrackingStore((state) => state.setInfiniteLoop);
  const toggleWatchLater = useTrackingStore((state) => state.toggleWatchLater);
  const setWatchLater = useTrackingStore((state) => state.setWatchLater);
  const startSession = useTrackingStore((state) => state.startSession);
  const updateSessionTime = useTrackingStore((state) => state.updateSessionTime);
  const markCardCompleted = useTrackingStore((state) => state.markCardCompleted);
  const resetSession = useTrackingStore((state) => state.resetSession);

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
  const [sessionCards, setSessionCards] = useState<(IPopulatedRevisionCard | null)[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryCount, setSessionRetryCount] = useState(0);

  // Decide if playback session is active
  const isGuest = user?.id === 'guest-user';
  const isSessionActive = !isGuest;
  const isReelsFeedActive = isSessionActive && !folderIdParam && !activePlaylistId;

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

  const bottomTabBarHeight = insets.bottom + 72;
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
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
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
          const loopedCards = baseCards.map(c => ({ ...c, _id: c._id + `-loop-${prev.length}` }));
          return [...prev, ...loopedCards];
        });
      }
    } else {
      if (playlistCards.length > 0) {
        handleLoopComplete();
        setAllCards(prev => {
          const loopedCards = playlistCards.map(c => ({ ...c, _id: c._id + `-loop-${prev.length}` }));
          return [...prev, ...loopedCards];
        });
      }
    }
  };

  // User and Guest flags are managed at the top of ReelsScreen

  // Apply continuous filters for the 5 modes
  const displayedCards = useMemo(() => {
    let list = [...allCards].filter(Boolean).filter((card: any) => card && card._id);

    // Filter duplicates generated by paging loop unless sequential
    const seenIds = new Set<string>();
    list = list.filter(card => {
      if (!card || !card._id) return false;
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

    if (currentMode === 'difficult') {
      return list.filter((c) => c.isDifficult);
    }
    if (currentMode === 'favorites') {
      return list.filter((c) => c.isFavorite);
    }
    if (currentMode === 'watchLater') {
      return list.filter((c) => watchLaterCardIds.includes(c._id.split('-loop-')[0]));
    }
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
        return shuffled;
      }
      
      const cardMap = new Map(list.map(c => [c._id, c]));
      return shuffledOrderRef.current.map(id => cardMap.get(id)).filter(Boolean) as IPopulatedRevisionCard[];
    }
    
    return list;
  }, [allCards, currentMode, watchLaterCardIds, activePlaylistId, difficultyStatesParam]);

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

  // Unified card list rendered by FlashList
  const cardsList = useMemo(() => {
    if (isSessionActive) {
      let list = [...sessionCards];
      if (currentMode === 'difficult') {
        list = list.filter((c) => !c || c.isDifficult);
      } else if (currentMode === 'favorites') {
        list = list.filter((c) => !c || c.isFavorite);
      } else if (currentMode === 'watchLater') {
        list = list.filter((c) => !c || watchLaterCardIds.includes(c._id.split('-loop-')[0]));
      }
      // Apply difficulty states filters
      if (difficultyStatesParam) {
        const activeStates = difficultyStatesParam.split(',').filter(Boolean);
        if (activeStates.length > 0) {
          list = list.filter((c) => !c || (c.difficultyState && activeStates.includes(c.difficultyState)));
        }
      }
      return list;
    }
    return displayedCards;
  }, [isSessionActive, sessionCards, displayedCards, currentMode, watchLaterCardIds, difficultyStatesParam]);

  const activeCardItem = cardsList[activeIndex];
  const activeCardId = activeCardItem ? activeCardItem._id : null;
  const { data: membership = {} } = useCardPlaylistMembership(activeCardId, !isGuest);

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
      const cleanId = activeItem._id.split('-loop-')[0];
      const currentCompletedIds = useTrackingStore.getState().completedCardIds;
      if (!currentCompletedIds[cleanId]) {
        markCardCompleted(cleanId);
      }
      if (!isGuest) {
        userCardStateService.markViewed(cleanId).catch(console.error);
      }
    }
  }, [activeIndex, cardsList, markCardCompleted, isGuest]);

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
      .filter((card: any) => card && card._id);
      
    setAllCards((prevCards) => {
      if (prevCards.length === 0) return cardsToSet;
      
      const updatedCardsMap = new Map(cardsToSet.map((c: any) => [c._id, c]));
      return prevCards.map((card) => {
        const fresh = updatedCardsMap.get(card._id);
        if (fresh) {
          const baseId = card._id.split('-loop-')[0];
          const isActiveCard = card._id === activeCardId || baseId === activeCardId?.split('-loop-')[0];
          return {
            ...card,
            isFavorite: fresh.isFavorite,
            isDifficult: fresh.isDifficult,
            isArchived: fresh.isArchived,
            // Protect active card from stale background overwrites
            difficultyState: isActiveCard ? card.difficultyState : fresh.difficultyState,
            currentUserQuestionProgress: isActiveCard ? card.currentUserQuestionProgress : fresh.currentUserQuestionProgress,
            // Sync other properties
            title: fresh.title,
            explanation: fresh.explanation,
            topic: fresh.topic,
            difficulty: fresh.difficulty,
            complexity: fresh.complexity,
            code: fresh.code,
            examples: fresh.examples,
            slides: fresh.slides,
          };
        }
        return card;
      });
    });
  }, [playlistCards, activeCardId]);

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
        if (isReelsFeedActive) {
          console.log('[Reels Feed Init Debug]');
          const slice = await reelsFeedService.getReelFeedSlice();
          
          if (!isMounted) return;
          setSessionId('reels-feed-active');
          
          const initialCards: (IPopulatedRevisionCard | null)[] = new Array(slice.queueLength).fill(null);
          slice.cardsSlice.forEach((c, idx) => {
            initialCards[slice.startIdx + idx] = c;
          });
          setSessionCards(initialCards);
          setNavState({ activeIndex: slice.currentIndex, prevIdx: -1 });
          setSessionLoading(false);
          return;
        }

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

        // Populate sessionCards
        const initialCards: (IPopulatedRevisionCard | null)[] = new Array(slice.orderedCardIds.length).fill(null);
        slice.cardsSlice.forEach(c => {
          const idx = slice.orderedCardIds.indexOf(c._id);
          if (idx !== -1) {
            initialCards[idx] = c;
          }
        });
        setSessionCards(initialCards);

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
  const handleSessionSwipe = useCallback(async (newIndex: number) => {
    if (!sessionId) return;
    try {
      if (isReelsFeedActive) {
        await reelsFeedService.updateReelIndex(newIndex, Date.now());
        const slice = await reelsFeedService.getReelFeedSlice();
        
        setSessionCards(prev => {
          const next = [...prev];
          if (next.length !== slice.queueLength) {
            next.length = slice.queueLength;
          }
          slice.cardsSlice.forEach((c, idx) => {
            next[slice.startIdx + idx] = c;
          });
          return next;
        });
        return;
      }

      await sessionQueueService.updateSessionIndex(sessionId, newIndex);
      const slice = await sessionQueueService.getSessionCardsSlice(sessionId);
      
      setSessionCards(prev => {
        const next = [...prev];
        if (next.length !== slice.orderedCardIds.length) {
          next.length = slice.orderedCardIds.length;
        }
        
        const cardMap = new Map<string, IPopulatedRevisionCard>();
        prev.forEach(c => {
          if (c) cardMap.set(c._id, c);
        });
        slice.cardsSlice.forEach(c => {
          if (c) cardMap.set(c._id, c);
        });
        
        for (let i = 0; i < slice.orderedCardIds.length; i++) {
          const id = slice.orderedCardIds[i];
          next[i] = cardMap.get(id) || null;
        }
        return next;
      });
    } catch (err) {
      console.error('[Session Swipe Update Error]', err);
    }
  }, [sessionId, isReelsFeedActive]);

  // Session-specific shuffle handler
  const handleToggleShuffleInSession = async (shuffleValue: boolean) => {
    if (!sessionId) return;
    try {
      const updatedSession = await sessionQueueService.toggleSessionShuffle(sessionId, shuffleValue);
      const slice = await sessionQueueService.getSessionCardsSlice(sessionId);
      
      const initialCards: (IPopulatedRevisionCard | null)[] = new Array(slice.orderedCardIds.length).fill(null);
      slice.cardsSlice.forEach(c => {
        const idx = slice.orderedCardIds.indexOf(c._id);
        if (idx !== -1) {
          initialCards[idx] = c;
        }
      });
      setSessionCards(initialCards);
      
      setNavState({ activeIndex: slice.currentIndex, prevIdx: -1 });
    } catch (err) {
      console.error('[Session Shuffle Toggle Error]', err);
    }
  };

  // Prompt resume state correctly on loaded cards (for non-session / guest playback)
  useEffect(() => {
    if (isSessionActive) return;
    if (displayedCards.length === 0) {
      if (activeIndex !== 0) setNavState({ activeIndex: 0, prevIdx: -1 });
      return;
    }
    
    if (!hasPromptedResume.current) {
      if (startCardIdParam) {
        const targetIndex = displayedCards.findIndex(c => c._id === startCardIdParam);
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
          if (targetIndex >= displayedCards.length || displayedCards[targetIndex]._id !== resumeCardId) {
            const foundIdx = displayedCards.findIndex(c => c._id === resumeCardId);
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

    if (activeIndex >= displayedCards.length && displayedCards.length > 0) {
      setNavState({ activeIndex: displayedCards.length - 1, prevIdx: -1 });
    }
  }, [displayedCards, activePlaylistId, folderIdParam, isSessionActive]);

  // Stable parent callback to handle instant, non-flickering, optimistic state updates
  const handleCardStateUpdate = useCallback((cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => {
    const currentActivePlaylistId = useBookmarkStore.getState().activePlaylistId;
    setAllCards((prevCards) => {
      if (currentActivePlaylistId === 'likes' && action === 'favorite' && !value) {
        return prevCards.filter((card) => card._id.split('-loop-')[0] !== cardId);
      }
      return prevCards.map((card) => {
        const baseId = card._id.split('-loop-')[0];
        if (baseId === cardId) {
          const key = action === 'favorite' ? 'isFavorite' : action === 'difficult' ? 'isDifficult' : 'isArchived';
          return { ...card, [key]: value };
        }
        return card;
      });
    });

    setSessionCards((prevCards) => {
      if (currentActivePlaylistId === 'likes' && action === 'favorite' && !value) {
        return prevCards.filter((card) => !card || card._id.split('-loop-')[0] !== cardId);
      }
      return prevCards.map((card) => {
        if (!card) return card;
        const baseId = card._id.split('-loop-')[0];
        if (baseId === cardId) {
          const key = action === 'favorite' ? 'isFavorite' : action === 'difficult' ? 'isDifficult' : 'isArchived';
          return { ...card, [key]: value };
        }
        return card;
      });
    });
  }, []);

  // Synchronize and merge new/updated API pages to the continuous deck
  useEffect(() => {
    if (activePlaylistId || !data?.results) return;
    
    if (allCards.length === 0) {
      setAllCards(data.results);
      setNavState({ activeIndex: 0, prevIdx: -1 });
    } else {
      setAllCards((prevCards) => {
        // Map updated results for direct lookup
        const updatedCardsMap = new Map(data.results.map((c: any) => [c._id, c]));

        // Merge progress fields of existing loaded cards
        const mergedCards = prevCards.map((card) => {
          const baseId = card._id.split('-loop-')[0];
          const fresh = updatedCardsMap.get(baseId) || updatedCardsMap.get(card._id);
          if (fresh) {
            const isActiveCard = card._id === activeCardId || baseId === activeCardId?.split('-loop-')[0];
            return {
              ...card,
              isFavorite: fresh.isFavorite,
              isDifficult: fresh.isDifficult,
              isArchived: fresh.isArchived,
              // Protect active card from stale background overwrites
              difficultyState: isActiveCard ? card.difficultyState : fresh.difficultyState,
              currentUserQuestionProgress: isActiveCard ? card.currentUserQuestionProgress : fresh.currentUserQuestionProgress,
              // Sync other base data too if changed
              title: fresh.title,
              explanation: fresh.explanation,
              topic: fresh.topic,
              difficulty: fresh.difficulty,
              complexity: fresh.complexity,
              code: fresh.code,
              examples: fresh.examples,
              slides: fresh.slides,
            };
          }
          return card;
        });

        // Find cards in the fresh results that are not in mergedCards yet (by base ID)
        const existingIds = new Set(mergedCards.map((c) => c._id.split('-loop-')[0]));
        const newCards = data.results.filter((c: any) => !existingIds.has(c._id));

        if (newCards.length === 0) {
          return mergedCards;
        }
        return [...mergedCards, ...newCards];
      });
    }
  }, [activePlaylistId, data?.results, activeCardId]);

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
    
    const currentList = isSessionActive ? cardsList : displayedCards;
    if (currentList[nextIdx] && !isGuest) {
      viewTimeoutRef.current = setTimeout(() => {
        const activeItem = currentList[nextIdx];
        if (!activeItem) return;
        const cleanCardId = activeItem._id.split('-loop-')[0];
        const id = activePlaylistId || folderIdParam;
        
        if (id) {
          syncResumeState(
            activePlaylistId ? 'playlist' : 'folder',
            id,
            {
              resumeCardId: cleanCardId,
              resumeIndex: nextIdx,
              resumeScrollOffset: 0,
            }
          );
        }
      }, 600);
    }
    lightHaptic();
    setNavState({ activeIndex: nextIdx, prevIdx: -1 });
  };

  useEffect(() => {
    return () => {
      if (viewTimeoutRef.current) clearTimeout(viewTimeoutRef.current);
    };
  }, [folderIdParam, activePlaylistId]);

  const handleProgressUpdateInReels = useCallback((cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => {
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

    const cleanId = cardId.split('-loop-')[0];

    // 1. Optimistic state update
    handleCardStateUpdate(cleanId, action, value);

    // 2. Sync to DB
    updateProgressMutation.mutate(
      { cardId: cleanId, action, value },
      {
        onError: (err) => {
          console.error(`[MUTATION ERROR]`, err);
          handleCardStateUpdate(cleanId, action, !value);
        }
      }
    );

    if (action === 'favorite') {
      userCardStateService.toggleLike(cleanId).catch(console.error);
      const currentActivePlaylistId = useBookmarkStore.getState().activePlaylistId;
      if (currentActivePlaylistId && currentActivePlaylistId !== 'likes' && currentActivePlaylistId !== 'watch-later') {
        togglePlaylistItem.mutate({
          playlistId: currentActivePlaylistId,
          revisionCardId: cleanId,
          isInPlaylist: !value, // if it was marked true, remove
        });
      }
    }

    Toast.show({
      type: 'success',
      text1: value ? `Marked as ${action}` : `Removed from ${action}`,
      position: 'top',
      visibilityTime: 1200,
    });
  }, [isGuest, handleCardStateUpdate]);

  const handleWatchLaterToggleInReels = useCallback((cardId: string) => {
    lightHaptic();
    const cleanId = cardId.split('-loop-')[0];
    toggleWatchLater(cleanId);
    if (!isGuest) {
      userCardStateService.toggleWatchLater(cleanId).catch(console.error);
    }
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    queryClient.invalidateQueries({ queryKey: ['playlistDetail', 'watch-later'] });
  }, [isGuest, toggleWatchLater, queryClient]);

  const handleDifficultyStateUpdateInReels = useCallback((cardId: string, state: 'easy' | 'medium' | 'hard' | 'skipped') => {
    lightHaptic();
    const cleanId = cardId.split('-loop-')[0];
    
    const targetCard = cardsList.find((c) => c && c._id.split('-loop-')[0] === cleanId);
    const activeCurrently = targetCard?.difficultyState === state;
    const resolvedNewState = activeCurrently ? null : state;

    // 1. Optimistic update of local React state instantly to unlock vertical swipe locks
    setAllCards((prevCards) =>
      prevCards.map((card) => {
        const baseId = card._id.split('-loop-')[0];
        if (baseId === cleanId) {
          const qp = resolvedNewState
            ? {
                attemptStatus: resolvedNewState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                perceivedDifficultyByUser: resolvedNewState === 'skipped' ? null : (resolvedNewState as any),
              }
            : null;
          return { ...card, difficultyState: resolvedNewState, currentUserQuestionProgress: qp };
        }
        return card;
      })
    );

    setSessionCards((prevCards) =>
      prevCards.map((card) => {
        if (!card) return card;
        const baseId = card._id.split('-loop-')[0];
        if (baseId === cleanId) {
          const qp = resolvedNewState
            ? {
                attemptStatus: resolvedNewState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                perceivedDifficultyByUser: resolvedNewState === 'skipped' ? null : (resolvedNewState as any),
              }
            : null;
          return { ...card, difficultyState: resolvedNewState, currentUserQuestionProgress: qp };
        }
        return card;
      })
    );

    // 2. Persist to database instantly
    if (!isGuest) {
      updateDifficultyStateMutation.mutate({ cardId: cleanId, difficultyState: resolvedNewState });
    }

    Toast.show({
      type: 'success',
      text1: resolvedNewState ? `Classified as ${resolvedNewState.toUpperCase()}! 🔥` : 'Classification cleared! 🧹',
      text2: 'Revision state synchronized.',
      position: 'top',
      visibilityTime: 1200,
    });
  }, [isGuest, updateDifficultyStateMutation, cardsList, allCards, sessionCards]);

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
            params: { cardId: card._id, folderId, card: JSON.stringify(card) },
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
              onPress: () => deleteCard(card._id),
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
      const activeCard = cardsList[activeIndex];
      if (activeCard) {
        sessionStartCardId.current = activeCard._id;
      }
    }
  }, [cardsList, activeIndex]);

  useEffect(() => {
    sessionStartCardId.current = null;
  }, [folderIdParam, activePlaylistId]);

  const goToNextCard = useCallback(() => {
    const listLength = cardsList.length;
    if (listLength === 0) return;

    const currentCard = cardsList[activeIndex];
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

  // Listen to activeIndex changes to sync session, prefetch images, and handle infinite pagination load
  useEffect(() => {
    if (cardsList.length > 0 && activeIndex >= 0 && activeIndex < cardsList.length) {
      const idx = activeIndex;

      // Keep track of the last 3 visited card IDs
      const currentCardId = cardsList[idx]?._id;
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
          const nextCard = cardsList[i];
          if (nextCard && nextCard.image) {
            ExpoImage.prefetch(nextCard.image).catch(() => {});
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
        {/* Render ReelsSettingsOverlay inside error screen if open */}
        {isSettingsOpen && (
          <ReelsSettingsOverlay
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            playlistName={activePlaybackName}
            sessionTimer={formatTime(sessionTotalTime)}
            questionsRevised={completedCardsCount}
            showReelContentSelect={isReelsFeedActive}
          />
        )}

        <Text className="text-[#64748B] text-lg text-center mb-4 font-medium">
          {sessionError 
            ? sessionError 
            : activePlaylistId 
              ? 'Could not load playlist' 
              : error?.message || 'An error occurred'}
        </Text>
        
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
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
            className="px-6 py-3.5 rounded-full bg-[#8B5CF6] shadow-md shadow-violet-500/20 active:scale-[0.98]"
          >
            <Text className="text-white font-medium">Try again</Text>
          </TouchableOpacity>

          {isReelsFeedActive && (
            <TouchableOpacity
              onPress={() => setIsSettingsOpen(true)}
              className="px-6 py-3.5 rounded-full bg-[#E2E8F0] border border-[#CBD5E1] active:scale-[0.98]"
            >
              <Text className="text-[#0F172A] font-medium">Choose Folders</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const activeCard = cardsList[activeIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1 }} className="bg-[#F5F5F7]">
      
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
          showReelContentSelect={isReelsFeedActive}
        />
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
        }}
      >
        {/* RIGHT SIDE: Transparent Settings Cog Icon */}
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
            lightHaptic();
            const activeCard = cardsList[activeIndex];
            if (!activeCard) {
              Toast.show({
                type: 'error',
                text1: 'Card not loaded',
                text2: 'Please wait for the card to load before asking ChatGPT.',
                position: 'top'
              });
              return;
            }
            
            const mode = useUserPreferencesStore.getState().preferences.gptPromptMode || 'explanation';
            
            let fullContext = activeCard.explanation || '';
            if (activeCard.code) {
              fullContext += `\n\nCode:\n${activeCard.code}`;
            }
            
            if (activeCard.slides && activeCard.slides.length > 0) {
              fullContext += `\n\nAdditional Slides Context:\n`;
              activeCard.slides.forEach((slide, idx) => {
                fullContext += `\n[Slide ${idx + 1}: ${slide.headline}]\n`;
                if (slide.body) fullContext += `${slide.body}\n`;
                if (slide.code) fullContext += `Code:\n${slide.code}\n`;
                if (slide.blocks && Array.isArray(slide.blocks)) {
                  slide.blocks.forEach((block: any) => {
                    if (block.text) fullContext += `${block.text}\n`;
                    if (block.code) fullContext += `Code:\n${block.code}\n`;
                  });
                }
              });
            }
            
            let fullPrompt = '';
            if (mode === 'explanation') {
              fullPrompt = `Explain this concept in detail: ${activeCard.title}.\nContext: ${fullContext}`;
            } else {
              fullPrompt = `Test me on this topic: ${activeCard.title}.\nAsk me a challenging question based on this context: ${fullContext}`;
            }

            // If prompt is too large, it will crash Android's intent launcher. 
            // So we copy the full prompt to the clipboard and launch the app normally.
            const isLarge = fullPrompt.length > 1500;
            
            if (isLarge) {
              await Clipboard.setStringAsync(fullPrompt);
              Toast.show({
                type: 'success',
                text1: 'Prompt Copied!',
                text2: 'Context is large. Copied to clipboard, just paste it in ChatGPT!',
                position: 'top',
                visibilityTime: 4000,
              });
            }

            // Launch the native ChatGPT app if installed, otherwise fallback to web URL
            const nativeUrl = isLarge 
              ? 'chatgpt://' 
              : `chatgpt://chat?q=${encodeURIComponent(fullPrompt)}`;
            const webUrl = isLarge 
              ? 'https://chatgpt.com/' 
              : `https://chatgpt.com/?q=${encodeURIComponent(fullPrompt)}`;

            Linking.openURL(nativeUrl).catch(() => {
              // Native app link failed or not installed, fallback to web browser
              Linking.openURL(webUrl).catch(err => {
                console.error('Failed to open ChatGPT URL:', err);
                Toast.show({
                  type: 'error',
                  text1: 'Cannot open ChatGPT',
                  text2: 'Please check your browser or app settings.',
                  position: 'top'
                });
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
        }}
      >
        {cardsList.length > 0 ? (
          <FlatList
            ref={flatListRef}
            data={cardsList}
            scrollEnabled={true}
            initialScrollIndex={activeIndex > 0 ? activeIndex : undefined}
            renderItem={({ item, index }) => {
              const isWithinRenderWindow = Math.abs(index - activeIndex) <= 4;
              if (!isWithinRenderWindow) {
                return <View style={{ height: cardHeight + 16, width: width * 0.97 }} />;
              }

              if (!item) {
                return (
                  <View 
                    style={{ 
                      height: cardHeight, 
                      alignSelf: 'center', 
                      width: width * 0.97, 
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
                  >
                    <ReelItemSkeleton cardHeight={cardHeight} width={width} />
                  </View>
                );
              }

              const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
              const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, item.createdBy) : false);
              const isFavorite = !!item.isFavorite || (!!activePlaylistId && activePlaylistId !== 'likes');
              
              const activeCardItem = cardsList[activeIndex];
              const isActiveCardClassified = activeCardItem ? (activeCardItem.difficultyState !== null && activeCardItem.difficultyState !== undefined) : true;

              return (
                <ReelItem
                  item={item}
                  index={index}
                  activeIndex={activeIndex}
                  isActiveCardClassified={isActiveCardClassified}
                  goToNextCard={stableGoToNext}
                  goToPrevCard={stableGoToPrev}
                  cardHeight={cardHeight}
                  width={width}
                  isFavorite={isFavorite}
                  activePlaylistId={activePlaylistId}
                  isGuest={isGuest}
                  canEdit={canEdit}
                  onToggleWatchLater={handleWatchLaterToggleInReels}
                  onCardStateUpdate={handleProgressUpdateInReels}
                  onPlaylistPickerTrigger={setPlaylistModalCard}
                  onMoreOptionsTrigger={handleMoreOptionsTrigger}
                  onDifficultyStateUpdate={handleDifficultyStateUpdateInReels}
                  membership={index === activeIndex ? membership : undefined}
                />
              );
            }}
            keyExtractor={(item, index) => item?._id || `loading-slot-${index}`}
            snapToInterval={cardHeight + 16}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum={true}
            showsVerticalScrollIndicator={false}
            windowSize={3}
            maxToRenderPerBatch={2}
            removeClippedSubviews={Platform.OS === 'android'}
            getItemLayout={(data, index) => ({
              length: cardHeight + 16,
              offset: (cardHeight + 16) * index,
              index,
            })}
            onScroll={(event) => {
              if (activeIndex > 0 && !hasScrolledToInitial.current) return;
            }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const yOffset = event.nativeEvent.contentOffset.y;
              const index = Math.round(yOffset / (cardHeight + 16));
              if (index !== activeIndex && index >= 0 && index < cardsList.length) {
                setNavState({ activeIndex: index, prevIdx: activeIndex });
                transitionToCard(index);
              }
            }}
            style={{ width: '100%', height: '100%' }}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  cardBase: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 3,
  },
});
