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
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  ListMusic,
  Check,
  Heart,
  MoreVertical,
  Clock,
  RotateCcw,
  Sliders,
  Settings2,
  BrainCircuit,
  Lock,
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
  interpolate,
  runOnJS,
  SharedValue,
  cancelAnimation,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useUpdateCardProgress } from '@/services/useProgress';
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
          right: 8,
          bottom: 70,
          alignItems: 'center',
          backgroundColor: 'transparent',
          gap: 16,
          width: 42,
        }}
      >
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(100, 116, 139, 0.15)' }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(100, 116, 139, 0.15)' }} />
        <BreathingOpacitySkeleton style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(100, 116, 139, 0.15)' }} />
      </View>

    </View>
  );
});

interface ReelsActionRailProps {
  cleanId: string;
  item: IPopulatedRevisionCard;
  isFavorite: boolean;
  isDifficult: boolean;
  isWatchLater: boolean;
  onCardStateUpdate: (cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => void;
  onToggleWatchLater: (cleanId: string) => void;
  onPlaylistPickerTrigger: (card: IPopulatedRevisionCard) => void;
  onMoreOptionsTrigger: (card: IPopulatedRevisionCard, scrollHorizontal: (idx: number) => void) => void;
  scrollHorizontal: (idx?: number) => void;
  isGuest: boolean;
}

const ReelsActionRail = React.memo(({
  cleanId,
  item,
  isFavorite,
  isDifficult,
  isWatchLater,
  onCardStateUpdate,
  onToggleWatchLater,
  onPlaylistPickerTrigger,
  onMoreOptionsTrigger,
  scrollHorizontal,
  isGuest,
}: ReelsActionRailProps) => {
  const handlePress = (action: () => void) => {
    lightHaptic();
    action();
  };

  const completedCardIds = useTrackingStore((state) => state.completedCardIds);
  const toggleCardCompleted = useTrackingStore((state) => state.toggleCardCompleted);
  const isTicked = !!completedCardIds[cleanId];

  const watchScale = useSharedValue(1);
  const tickScale = useSharedValue(1);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      return;
    }
    watchScale.value = withSequence(
      withSpring(1.12, { damping: 18, stiffness: 180 }),
      withSpring(1, { damping: 15, stiffness: 120 })
    );
  }, [isWatchLater]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    tickScale.value = withSequence(
      withSpring(1.12, { damping: 18, stiffness: 180 }),
      withSpring(1, { damping: 15, stiffness: 120 })
    );
  }, [isTicked]);

  const watchStyle = useAnimatedStyle(() => ({
    transform: [{ scale: watchScale.value }],
  }));

  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tickScale.value }],
  }));

  const handleTickPress = async () => {
    lightHaptic();
    toggleCardCompleted(cleanId);
    
    if (!isGuest) {
      try {
        await userCardStateService.incrementRevision(cleanId);
      } catch (err) {
        console.error('[Increment Revision Error]', err);
      }
    }

    Toast.show({
      type: 'success',
      text1: isTicked ? 'Removed revision mark' : 'Revised 🎯',
      text2: isTicked ? 'Revision state reverted.' : 'Revision marked successfully.',
      position: 'top',
      visibilityTime: 1200,
    });
  };

  return (
    <View 
      style={{
        position: 'absolute',
        right: 8,
        bottom: 70,
        alignItems: 'center',
        backgroundColor: 'transparent',
        gap: 12,
        zIndex: 50,
      }}
    >
      {/* Primary check/tick button: Elegant emerald check icon */}
      <TouchableOpacity 
        onPress={handleTickPress}
        activeOpacity={0.65}
        className="p-2.5 rounded-full active:scale-75"
        style={{
          backgroundColor: isTicked ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
          borderWidth: 1,
          borderColor: isTicked ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
        }}
        accessibilityLabel={isTicked ? "Mark as Uncompleted" : "Mark as Completed"}
        accessibilityRole="button"
        accessibilityState={{ selected: isTicked }}
      >
        <Animated.View style={tickStyle}>
          <Check 
            color={isTicked ? "#10B981" : "#64748B"} 
            size={20} 
            strokeWidth={isTicked ? 3.5 : 2} 
          />
        </Animated.View>
      </TouchableOpacity>

      {/* Revise Later Button (Watch Later) */}
      <TouchableOpacity 
        onPress={() => handlePress(() => onToggleWatchLater(cleanId))}
        activeOpacity={0.65}
        className="p-2 rounded-full active:scale-75"
        accessibilityLabel={isWatchLater ? "Remove from Revise Later" : "Add to Revise Later"}
        accessibilityRole="button"
        accessibilityState={{ selected: isWatchLater }}
      >
        <Animated.View style={watchStyle}>
          <Clock 
            color={isWatchLater ? "#3B82F6" : "#64748B"} 
            size={18} 
            strokeWidth={2.25} 
          />
        </Animated.View>
      </TouchableOpacity>

      {/* Add to Playlist Button */}
      <TouchableOpacity 
        onPress={() => handlePress(() => onPlaylistPickerTrigger(item))}
        activeOpacity={0.65}
        className="p-2 rounded-full active:scale-75"
        accessibilityLabel="Add to Playlist"
        accessibilityRole="button"
      >
        <ListMusic color="#64748B" size={18} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.cleanId === nextProps.cleanId &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.isDifficult === nextProps.isDifficult &&
    prevProps.isWatchLater === nextProps.isWatchLater &&
    prevProps.item._id === nextProps.item._id
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
}

interface SlideCardWrapperProps {
  slide: ISlide;
  indexInDeck: number;
  activeSlideIndexSV: SharedValue<number>;
  slideDragX: SharedValue<number>;
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
  cardHeight,
  width,
  zIndex,
  renderSlideContent,
}: SlideCardWrapperProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    const activeIdx = activeSlideIndexSV.value;
    const delta = indexInDeck - activeIdx;

    // Direct finger tracking for active card (delta === 0)
    if (delta === 0) {
      return {
        transform: [
          { translateX: slideDragX.value },
          { translateY: 0 },
          { scale: 1 },
          { rotate: '0deg' },
        ],
        opacity: 1,
      };
    }

    // Next card (preview) – static appearance under active card (no pop animation)
    if (delta === 1) {
      return {
        transform: [
          { translateX: 0 },
          { translateY: 0 },
          { scale: 1 },
          { rotate: '0deg' },
        ],
        opacity: 1,
      };
    }

    // Previous card – slides in from the left only on right swipe
    if (delta === -1) {
      const translateX = -width + Math.max(0, slideDragX.value);
      const isVisible = slideDragX.value > 0;
      return {
        transform: [
          { translateX },
          { translateY: 0 },
          { scale: 1 },
          { rotate: '0deg' },
        ],
        opacity: isVisible ? 1 : 0,
      };
    }

    // All other cards – hidden
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
          paddingHorizontal: 24,
          paddingTop: 64,
          paddingBottom: 24,
          overflow: 'hidden',
          zIndex,
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
}: ReelItemProps) => {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [prevId, setPrevId] = useState(item._id);
  const { preferences } = useUserPreferencesStore();

  const [prevPrefsKey, setPrevPrefsKey] = useState(
    `${preferences.hideCertainBlockTypes?.join(',')}-${preferences.explanationFlowOrder?.join(',')}`
  );
  
  const slideDragX = useSharedValue(0);
  const activeSlideIndexSV = useSharedValue(0);
  const isTransitioning = useSharedValue(false);
  const isMounted = useRef(true);

  const currentPrefsKey = `${preferences.hideCertainBlockTypes?.join(',')}-${preferences.explanationFlowOrder?.join(',')}`;

  // Synchronous state and translation value reset on card recycle or preference change
  if (item._id !== prevId || currentPrefsKey !== prevPrefsKey) {
    setPrevId(item._id);
    setPrevPrefsKey(currentPrefsKey);
    setActiveSlideIndex(0);
    cancelAnimation(slideDragX);
    slideDragX.value = 0;
    activeSlideIndexSV.value = 0;
    isTransitioning.value = false;
  }

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cancelAnimation(slideDragX);
    };
  }, [item._id, currentPrefsKey]);

  useEffect(() => {
    activeSlideIndexSV.value = activeSlideIndex;
    // Reset translation and transition locks after the index change has been committed to prevent layout jumping/flickering
    slideDragX.value = 0;
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

  // Strict direction lock for zero lag horizontal drag
  const horizontalGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      if (isTransitioning.value) return;
    })
    .onUpdate((event) => {
      if (isTransitioning.value) return;
      // Direct physical tracking with zero delayed interpolation
      slideDragX.value = event.translationX;
    })
    .onEnd((event) => {
      if (isTransitioning.value) return;
      
      const SWIPE_THRESHOLD_X = CARD_WIDTH * 0.16;
      const VELOCITY_THRESHOLD = 350;
      const transX = slideDragX.value;
      const velX = event.velocityX;

      if (transX < 0) {
        // Dragging Left -> Move Forward to Next Slide
        if (activeSlideIndex < slides.length - 1 && (Math.abs(transX) > SWIPE_THRESHOLD_X || Math.abs(velX) > VELOCITY_THRESHOLD)) {
          isTransitioning.value = true;
          slideDragX.value = withSpring(
            -width * 1.3,
            {
              damping: 20,
              stiffness: 360,
              mass: 0.35,
            },
            (finished) => {
              if (finished) {
                runOnJS(handleSwipeComplete)();
              }
            }
          );
        } else {
          isTransitioning.value = true;
          slideDragX.value = withSpring(
            0,
            { damping: 20, stiffness: 360, mass: 0.35 },
            () => {
              isTransitioning.value = false;
            }
          );
        }
      } else {
        // Dragging Right -> Move Backward to Previous Slide
        if (activeSlideIndex > 0 && (Math.abs(transX) > SWIPE_THRESHOLD_X || Math.abs(velX) > VELOCITY_THRESHOLD)) {
          isTransitioning.value = true;
          slideDragX.value = withSpring(
            width,
            {
              damping: 20,
              stiffness: 360,
              mass: 0.35,
            },
            (finished) => {
              if (finished) {
                runOnJS(handleSwipePrevComplete)();
              }
            }
          );
        } else {
          isTransitioning.value = true;
          slideDragX.value = withSpring(
            0,
            { damping: 20, stiffness: 360, mass: 0.35 },
            () => {
              isTransitioning.value = false;
            }
          );
        }
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
      }}
    >
      <GestureDetector gesture={horizontalGesture}>
        <View
          style={{
            width: CARD_WIDTH,
            height: cardHeight,
            position: 'relative',
          }}
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
                cardHeight={cardHeight}
                width={width}
                zIndex={zIndex}
                renderSlideContent={renderSlideContent}
              />
            );
          })}
        </View>
      </GestureDetector>

      {/* Premium Glassmorphic Vertical Action Rail */}
      <ReelsActionRail
        cleanId={cleanId}
        item={item}
        isFavorite={isFavorite}
        isDifficult={isDifficult}
        isWatchLater={isWatchLater}
        onCardStateUpdate={onCardStateUpdate}
        onToggleWatchLater={onToggleWatchLater}
        onPlaylistPickerTrigger={onPlaylistPickerTrigger}
        onMoreOptionsTrigger={onMoreOptionsTrigger}
        scrollHorizontal={scrollHorizontal}
        isGuest={isGuest}
      />
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item._id === nextProps.item._id &&
    prevProps.activeIndex === nextProps.activeIndex &&
    prevProps.index === nextProps.index &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.activePlaylistId === nextProps.activePlaylistId
  );
});

const ReelItem = React.memo((props: ReelItemProps) => {
  const isActiveReel = props.index === props.activeIndex;

  if (!isActiveReel) {
    return (
      <View 
        style={{ 
          height: props.cardHeight, 
          alignSelf: 'center', 
          width: CARD_WIDTH,
          marginBottom: 16,
          backgroundColor: 'transparent',
        }}
      >
        <View
          style={[
            styles.cardBase,
            {
              width: CARD_WIDTH,
              height: props.cardHeight,
              paddingHorizontal: 24,
              paddingTop: 64,
              paddingBottom: 24,
              overflow: 'hidden',
            }
          ]}
        >
          <ConceptCardPreview
            card={props.item}
            activePlaylistId={props.activePlaylistId}
            onViewExplanation={() => {}}
          />
        </View>
      </View>
    );
  }

  return <ActiveReelItem {...props} />;
}, (prevProps, nextProps) => {
  return (
    prevProps.item._id === nextProps.item._id &&
    prevProps.activeIndex === nextProps.activeIndex &&
    prevProps.index === nextProps.index &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.width === nextProps.width &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.activePlaylistId === nextProps.activePlaylistId
  );
});

export default function ReelsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
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
  }>();

  const folderIdParam = normalizeParam(params.folderId);
  const topicParam = normalizeParam(params.topic);
  const tagsParam = normalizeParam(params.tags);
  const difficultyParam = normalizeParam(params.difficulty);
  const searchParam = normalizeParam(params.search);
  const startCardIdParam = normalizeParam(params.startCardId);

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
  useEffect(() => {
    const currentStartTime = useTrackingStore.getState().sessionStartTime;
    if (!currentStartTime) {
      startSession();
    }
    const interval = setInterval(() => {
      updateSessionTime();
    }, 1000);
    return () => {
      clearInterval(interval);
      updateSessionTime();
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
  }, [allCards, currentMode, watchLaterCardIds, activePlaylistId]);

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
      return list;
    }
    return displayedCards;
  }, [isSessionActive, sessionCards, displayedCards, currentMode, watchLaterCardIds]);


  // Reset index 0 on mode changes
  useEffect(() => {
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

    let isMounted = true;

    const initSession = async () => {
      setSessionLoading(true);
      setSessionError(null);
      try {
        let sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater';
        let sourceId: string;

        if (activePlaylistId) {
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
          sourceType = 'folder';
          sourceId = folderIdParam!;
        }

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
  }, [folderIdParam, activePlaylistId, isSessionActive, sessionRetryCount]);

  // Swipe swiping index sync & nearby card buffering
  const handleSessionSwipe = useCallback(async (newIndex: number) => {
    if (!sessionId) return;
    try {
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
  }, [sessionId]);

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
            return {
              ...card,
              isFavorite: fresh.isFavorite,
              isDifficult: fresh.isDifficult,
              isArchived: fresh.isArchived,
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
  }, []);

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

    // 1. Optimistic state update
    handleCardStateUpdate(cardId, action, value);

    // 2. Sync to DB
    updateProgressMutation.mutate(
      { cardId, action, value },
      {
        onError: (err) => {
          console.error(`[MUTATION ERROR]`, err);
          handleCardStateUpdate(cardId, action, !value);
        }
      }
    );

    if (action === 'favorite') {
      userCardStateService.toggleLike(cardId).catch(console.error);
      const currentActivePlaylistId = useBookmarkStore.getState().activePlaylistId;
      if (currentActivePlaylistId && currentActivePlaylistId !== 'likes' && currentActivePlaylistId !== 'watch-later') {
        togglePlaylistItem.mutate({
          playlistId: currentActivePlaylistId,
          revisionCardId: cardId,
          isInPlaylist: !value, // if it was marked true, remove (isInPlaylist = false now true)
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
    toggleWatchLater(cardId);
    if (!isGuest) {
      userCardStateService.toggleWatchLater(cardId).catch(console.error);
    }
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    queryClient.invalidateQueries({ queryKey: ['playlistDetail', 'watch-later'] });
  }, [isGuest, toggleWatchLater, queryClient]);

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
    const nextIdx = (activeIndex + 1) % listLength;
    flatListRef.current?.scrollToIndex({
      index: nextIdx,
      animated: true,
    });
    setNavState({ activeIndex: nextIdx, prevIdx: activeIndex });
    transitionToCard(nextIdx);
  }, [activeIndex, cardsList.length, transitionToCard]);

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
    if (cardsList.length > 0 && activeIndex > 0 && !hasScrolledToInitial.current) {
      hasScrolledToInitial.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: activeIndex,
          animated: false,
        });
      }, 100);
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

  const activeCard = displayedCards[activeIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1 }} className="bg-[#F5F5F7]">
      
      {/* Settings & Personalization Overlay */}
      {isSettingsOpen && (
        <ReelsSettingsOverlay
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          playlistName={activePlaybackName}
          sessionTimer={formatTime(sessionTotalTime)}
          questionsRevised={completedCardsCount}
        />
      )}

      {/* Premium Apple-Style Header Capsule Bar */}
      <View 
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 16,
          right: 16,
          zIndex: 90,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          pointerEvents: 'box-none',
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
            renderItem={({ item, index }) => {
              if (!item) {
                return (
                  <View 
                    style={{ 
                      height: cardHeight, 
                      alignSelf: 'center', 
                      width: width * 0.97, 
                      marginBottom: 16 
                    }}
                  >
                    <ReelItemSkeleton cardHeight={cardHeight} width={width} />
                  </View>
                );
              }

              const isSuperAdmin = user?.email === 'mohit.pant@1828@gmail.com';
              const canEdit = isSuperAdmin || (user?.id ? canModifyItem(role as UserRole, user.id, item.createdBy) : false);
              const isFavorite = !!item.isFavorite || (!!activePlaylistId && activePlaylistId !== 'likes');

              return (
                <ReelItem
                  item={item}
                  index={index}
                  activeIndex={activeIndex}
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
                />
              );
            }}
            keyExtractor={(item, index) => item?._id || `loading-slot-${index}`}
            snapToInterval={cardHeight + 16}
            snapToAlignment="center"
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
              const yOffset = event.nativeEvent.contentOffset.y;
              const index = Math.round(yOffset / (cardHeight + 16));
              if (index !== activeIndex && index >= 0 && index < cardsList.length) {
                setNavState({ activeIndex: index, prevIdx: activeIndex });
                transitionToCard(index);
              }
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
