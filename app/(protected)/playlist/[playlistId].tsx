import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Vibration,
  StyleSheet,
  Pressable,
  InteractionManager,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, PlayCircle, Shuffle, Play, FastForward, GripVertical, Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import { useTrackingStore } from '@/store/useTrackingStore';
import { usePlaylistCards, useReorderPlaylist, usePlaylists } from '@/hooks/usePlaylists';
import { usePersonalLibrary, useReorderLikes } from '@/hooks/usePersonalLibrary';
import { useGetCardsByFolder } from '@/hooks/useRevisionCards';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { normalizeParam } from '@/utils/routeParams';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { SyncPauseGate } from '@/components/SyncPauseGate';
import { usePlaylistCards as useStorePlaylistCards } from '@/hooks/usePlaylistStoreSelectors';
import { resolveCardState } from '@/utils/resolveCardState';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedStyle, withSpring, FadeInUp, FadeOut, useSharedValue, withTiming, runOnJS, cancelAnimation, withRepeat, withSequence, SharedValue } from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
import AsyncStorage from '@react-native-async-storage/async-storage';
import { transitionScheduler } from '@/utils/transitionScheduler';
import { ThemeBackground } from '@/components/ThemeBackground';
import { useThemePalette } from '@/hooks/useThemePalette';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
import { GlassPanel } from '@/components/motion/GlassPanel';
import { ReeWCharacter } from '@/components/ReeWCharacter';
import { addAlpha } from '@/theme/themePalettes';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(5);
  }
};

interface CardItemProps {
  card: IPopulatedRevisionCard;
  drag: () => void;
  isActive: boolean;
  startRevising: (shuffle?: boolean, resume?: boolean, startCardId?: string) => void;
}

const CardItem = React.memo(({ card, drag, isActive, startRevising }: CardItemProps) => {
  if (!card || !card._id) return null;
  const palette = useThemePalette();
  const step = useWalkthroughStore(s => s.step);
  const isWalkthroughActive = step !== 'none';

  return (
    <ScaleDecorator activeScale={1.0}>
      <TouchableOpacity
        activeOpacity={isActive ? 1 : 0.85}
        onPress={() => !isActive && !isWalkthroughActive && startRevising(false, false, card._id)}
        disabled={isActive || isWalkthroughActive}
        onLongPress={() => {
          if (isWalkthroughActive && step !== 'playlist-reorder') return;
          lightHaptic();
          drag();
        }}
        delayLongPress={150}
        style={[
          styles.cardWrapper,
          { 
            backgroundColor: palette.surface, 
            borderColor: isActive ? palette.accent : palette.border,
            shadowColor: palette.shadow,
            shadowOpacity: palette.isDark ? 0.25 : 0.05,
          }
        ]}
      >
        <View className="flex-1 justify-center">
          <Text className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: palette.accent }}>
            {card.topic}
          </Text>
          <Text className="font-semibold text-lg leading-tight" style={{ color: palette.textPrimary }} numberOfLines={1}>
            {card.title}
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Text
              className="text-xs font-semibold"
              style={{
                color: card.difficulty === 'Easy'
                  ? palette.success
                  : card.difficulty === 'Medium'
                  ? palette.warning
                  : palette.error
              }}
            >
              {card.difficulty}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.card._id === nextProps.card._id &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.topic === nextProps.card.topic &&
    prevProps.card.difficulty === nextProps.card.difficulty
  );
});

const { width: screenWidth } = Dimensions.get('window');

const ConfettiParticle = ({ p, progress }: { p: any; progress: SharedValue<number> }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const x = Math.cos(p.angleRad) * p.distance * progress.value;
    const y = Math.sin(p.angleRad) * p.distance * progress.value - (50 * progress.value);
    
    let opacity = 1;
    if (progress.value < 0.7) {
      opacity = 1 - 0.2 * (progress.value / 0.7);
    } else {
      opacity = 0.8 - 0.8 * ((progress.value - 0.7) / 0.3);
    }
    if (opacity < 0) opacity = 0;
    if (opacity > 1) opacity = 1;

    let scale = 0;
    if (progress.value < 0.2) {
      scale = 1.2 * (progress.value / 0.2);
    } else {
      scale = 1.2 - 1.2 * ((progress.value - 0.2) / 0.8);
    }
    if (scale < 0) scale = 0;

    const rotate = `${p.rotateStart + progress.value * (p.rotateEnd - p.rotateStart)}deg`;

    return {
      transform: [{ translateX: x }, { translateY: y }, { scale }, { rotate }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          left: '20%',
          top: '50%',
          width: p.size,
          height: p.size,
          borderRadius: p.isCircle ? p.size / 2 : 2,
          backgroundColor: p.color,
        },
      ]}
    />
  );
};

const ConfettiBlast = () => {
  const progress = useSharedValue(0);
  const palette = useThemePalette();

  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200 });
  }, []);

  const numParticles = 30;
  const particles = useMemo(() => {
    const colors = [palette.accent, palette.error, palette.info, palette.success, palette.warning];
    return Array.from({ length: numParticles }).map((_, i) => {
      const angle = (i / numParticles) * 360 + (Math.random() * 20 - 10);
      const angleRad = (angle * Math.PI) / 180;
      const distance = 80 + Math.random() * 120;
      const size = 6 + Math.random() * 8;
      const color = colors[i % colors.length];
      const isCircle = Math.random() > 0.5;
      const rotateStart = Math.random() * 360;
      const rotateEnd = rotateStart + 360 + Math.random() * 360;
      return {
        angleRad,
        distance,
        size,
        color,
        isCircle,
        rotateStart,
        rotateEnd,
      };
    });
  }, [palette]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <ConfettiParticle key={i} p={p} progress={progress} />
      ))}
    </View>
  );
};

export default function PlaylistCardsScreen() {
  const router = useRouter();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();


  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    playlistId: string;
  }>();
  const playlistId = normalizeParam(params.playlistId) ?? '';
  const isLikes = playlistId === 'likes';


  
  const { user, logout } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  
  const GUEST_PLAYLIST_CARDS: IPopulatedRevisionCard[] = useMemo(() => [
    {
      _id: 'guest-card-3',
      title: 'Merge K Sorted Lists',
      topic: 'HEAPS',
      difficulty: 'Hard',
      explanation: 'Combine elements of K sorted linked lists by using a min-heap.',
      examples: [],
      tags: [],
      createdBy: { _id: 'admin', name: 'Admin', email: 'admin@dsa-reels.com', avatarUrl: '' },
      folderId: '6a1655fab129b168bb16bb1f',
      visibility: 'public',
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      _id: 'guest-card-4',
      title: 'Course Schedule II',
      topic: 'GRAPHS',
      difficulty: 'Hard',
      explanation: 'Topological sort using Kahn\'s algorithm (BFS) or DFS to find task order.',
      examples: [],
      tags: [],
      createdBy: { _id: 'admin', name: 'Admin', email: 'admin@dsa-reels.com', avatarUrl: '' },
      folderId: '6a1655fab129b168bb16bb1f',
      visibility: 'public',
      order: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      _id: 'guest-card-5',
      title: '0/1 Knapsack Core',
      topic: 'DYNAMIC PROGRAMMING',
      difficulty: 'Hard',
      explanation: 'Find maximum subset value for limited weight using bottom-up tabulation.',
      examples: [],
      tags: [],
      createdBy: { _id: 'admin', name: 'Admin', email: 'admin@dsa-reels.com', avatarUrl: '' },
      folderId: '6a1655fab129b168bb16bb1f',
      visibility: 'public',
      order: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ], []);

  const { setActivePlaylistId } = useBookmarkStore();
  const { data: playlists } = usePlaylists();
  

  const playlist = playlists?.find(p => p.id === playlistId);

  // Normal playlist hook
  const { data: cardsData, isLoading: cardsLoading, isError: cardsIsError, error: cardsError, refetch: refetchCards } = usePlaylistCards(isLikes || isGuest ? null : playlistId);
  // Likes hook
  const { data: libraryData, isLoading: libraryLoading, isError: libraryIsError, error: libraryError, refetch: refetchLibrary } = usePersonalLibrary();
  
  const isLoading = isGuest ? false : (isLikes ? libraryLoading : cardsLoading);
  const isError = isGuest ? false : (isLikes ? libraryIsError : cardsIsError);
  const error = isGuest ? null : (isLikes ? libraryError : cardsError);
  const refetch = isLikes ? refetchLibrary : refetchCards;

  const reorderPlaylist = useReorderPlaylist();
  const reorderLikes = useReorderLikes();

  const hydratePlaylistCards = usePlaylistStateStore((state) => state.hydratePlaylistCards);
  const setPlaylistCardOrder = usePlaylistStateStore((state) => state.setPlaylistCardOrder);
  const storeCards = useStorePlaylistCards(playlistId);
  const bootstrapStatus = usePlaylistStateStore((state) => state.bootstrapStatus);
  const isBootstrapReady = bootstrapStatus === 'completed';
  console.log(`[Playlist Screen Render] playlistId="${playlistId}", storeCards.length=${storeCards?.length}, isLikes=${isLikes}, bootstrapStatus=${bootstrapStatus}`);

  const favoritesKey = isLikes
    ? (libraryData?.favorites ?? []).map(f => f.card?._id).filter(Boolean).join(',')
    : '';

  useEffect(() => {
    if (isGuest) return;
    if (isLikes && libraryData?.favorites) {
      const favCards = libraryData.favorites
        .filter(f => f != null && f.card != null && typeof f.card === 'object' && '_id' in f.card)
        .map(f => f.card) as IPopulatedRevisionCard[];
      hydratePlaylistCards(playlistId, favCards.filter(Boolean).filter(c => c && c._id));
    }
  }, [favoritesKey, isLikes, playlistId, hydratePlaylistCards, isGuest]);

  const [localCards, setLocalCards] = useState<IPopulatedRevisionCard[]>(() => {
    const initial = isGuest ? GUEST_PLAYLIST_CARDS : (storeCards || []);
    console.log(`[Playlist Screen State Initializer] initialCards.length=${initial.length}`);
    return initial;
  });

  useEffect(() => {
    if (isGuest) {
      const loadCards = async () => {
        try {
          const val = await AsyncStorage.getItem(`guest-playlist-${playlistId}-cards`);
          if (val) {
            setLocalCards(JSON.parse(val));
          } else {
            setLocalCards(GUEST_PLAYLIST_CARDS);
          }
        } catch (e) {
          setLocalCards(GUEST_PLAYLIST_CARDS);
        }
      };
      loadCards();
    }
  }, [isGuest, playlistId, GUEST_PLAYLIST_CARDS]);

  useFocusEffect(
    useCallback(() => {
      console.log(`[Playlist Screen Focus] playlistId="${playlistId}", storeCards.length=${storeCards?.length}, localCards.length=${localCards.length}`);
      if (playlistId && playlistId !== 'all') {
        usePlaylistStateStore.getState().hydratePlaylistCardsOnDemand(playlistId).catch((err) => {
          console.error(`[Playlist Screen Focus] hydratePlaylistCardsOnDemand failed:`, err);
        });
      }

      // Safety check: if focus screen contains empty localCards but storeCards has items, sync immediately
      if (storeCards && storeCards.length > 0 && localCards.length === 0) {
        console.log(`[Playlist Screen Focus] Syncing empty localCards with storeCards (${storeCards.length} items)`);
        setLocalCards(storeCards);
      }

      // Scroll to last tapped card when returning from reels-player
      if (lastTappedCardIdRef.current && localCards.length > 0 && listRef.current) {
        const idx = localCards.findIndex(c => c._id?.split('-loop-')[0] === lastTappedCardIdRef.current);
        if (idx > 0) {
          InteractionManager.runAfterInteractions(() => {
            try {
              listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.3 });
            } catch (e) {
              // Fallback: scroll to offset
              listRef.current?.scrollToOffset?.({ offset: idx * 104, animated: false });
            }
          });
        }
      }
    }, [playlistId, localCards, storeCards])
  );

  const [undoVisible, setUndoVisible] = useState(false);

  const { step, setStep, completeWalkthrough, isComplete } = useWalkthroughStore();
  const isWalkthroughActive = step !== 'none';

  const handleBack = useCallback(() => {
    if (playlistId === 'hard' && !isComplete) {
      return true;
    }
    if (router.canGoBack()) {
      router.back();
      return true;
    }
    router.replace('/(protected)/(tabs)/personal');
    return true;
  }, [router, playlistId, isComplete]);

  useAppBackHandler(handleBack);

  // Local copy for smooth transitions
  const [localStep, setLocalStep] = useState(step);
  const panelOpacity = useSharedValue(1);

  useEffect(() => {
    if (step !== localStep) {
      panelOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) {
          runOnJS(setLocalStep)(step);
          panelOpacity.value = withTiming(1, { duration: 250 });
        }
      });
    }
  }, [step]);

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
  }));

  const reminderScale = useSharedValue(1);
  const reminderGlow = useSharedValue(0);

  useEffect(() => {
    if (localStep === 'playlist-reminder') {
      reminderScale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 600 }),
          withTiming(1.0, { duration: 600 })
        ),
        -1,
        true
      );
      reminderGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0.2, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(reminderScale);
      cancelAnimation(reminderGlow);
      reminderScale.value = 1;
      reminderGlow.value = 0;
    }
    return () => {
      cancelAnimation(reminderScale);
      cancelAnimation(reminderGlow);
    };
  }, [localStep]);

  const reminderAnimatedStyle = useAnimatedStyle(() => {
    const isReminderStep = localStep === 'playlist-reminder';
    return {
      transform: [{ scale: reminderScale.value }],
      borderColor: isReminderStep ? 'transparent' : palette.border,
      shadowColor: isReminderStep ? palette.accent : 'transparent',
      shadowOffset: isReminderStep ? { width: 0, height: 0 } : { width: 0, height: 0 },
      shadowOpacity: isReminderStep ? 0.65 * reminderGlow.value : 0,
      shadowRadius: isReminderStep ? 16 : 0,
      elevation: isReminderStep ? 4 : 0,
    };
  });

  const reminderGlowStyle = useAnimatedStyle(() => ({
    opacity: reminderGlow.value,
  }));

  useEffect(() => {
    if (playlistId === 'hard' && step === 'myspace-hard-focus') {
      setStep('playlist-reorder');
    }
  }, [playlistId, step, setStep]);
  const [lastRemoved, setLastRemoved] = useState<{
    card: IPopulatedRevisionCard;
    index: number;
    originalDifficulty?: any;
  } | null>(null);

  const swipeableRefs = useRef<Map<string, any>>(new Map());
  const listRef = useRef<any>(null);
  const lastTappedCardIdRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);
  const isOptimisticUpdateRef = useRef(false);

  // Auto-hide Undo banner after 5 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (undoVisible) {
      timer = setTimeout(() => {
        setUndoVisible(false);
        setLastRemoved(null);
      }, 5000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [undoVisible]);

  useEffect(() => {
    if (isGuest) return;
    if (storeCards) {
      const currentIds = localCards.map(c => c?._id).join(',');
      const nextIds = storeCards.map(c => c?._id).join(',');
      console.log(`[Playlist Screen Sync useEffect] currentIds="${currentIds}", nextIds="${nextIds}", isOptimistic=${isOptimisticUpdateRef.current}`);
      
      if (isOptimisticUpdateRef.current) {
        const storeCleanIds = storeCards.map(c => c?._id?.split('-loop-')[0]).join(',');
        const localCleanIds = localCards.map(c => c?._id?.split('-loop-')[0]).join(',');
        if (storeCleanIds === localCleanIds) {
          isOptimisticUpdateRef.current = false;
        }
        return;
      }
      
      if (currentIds !== nextIds) {
        console.log(`[Playlist Screen Sync useEffect] Updating localCards! nextIds="${nextIds}"`);
        setLocalCards(storeCards);
      }
      isLoadingMoreRef.current = false;
    }
  }, [storeCards, isGuest]);



  const handleSwipeRemove = useCallback((card: IPopulatedRevisionCard) => {
    lightHaptic();
    const cleanId = card._id.split('-loop-')[0];
    
    // Close the Swipeable row
    const ref = swipeableRefs.current.get(cleanId);
    if (ref) {
      ref.close();
    }

    if (step === 'playlist-remove') {
      setStep('playlist-reminder');
    }

    const currentIndex = localCards.findIndex(c => {
      const cId = c?._id ? c._id.split('-loop-')[0] : '';
      return cId === cleanId;
    });
    if (currentIndex === -1) return;

    const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
    setLastRemoved({
      card,
      index: currentIndex,
      originalDifficulty: isSmart ? (playlistId as any) : undefined,
    });

    isOptimisticUpdateRef.current = true;
    // Remove locally
    const nextCards = localCards.filter(c => {
      const cId = c?._id ? c._id.split('-loop-')[0] : '';
      return cId !== cleanId;
    });
    setLocalCards(nextCards);

    if (isGuest) {
      setUndoVisible(true);
      return;
    }

    // Apply store changes optimistically
    if (isSmart) {
      usePlaylistStateStore.getState().transferCard(cleanId, card as any, null, true);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'CLASSIFY_CARD',
        payload: { cardId: cleanId, state: null },
        timestamp: Date.now(),
      });
    } else {
      usePlaylistStateStore.getState().toggleCustomPlaylistItemInStore(playlistId, cleanId, false);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'TOGGLE_PLAYLIST_ITEM',
        payload: { playlistId, cardId: cleanId, value: false },
        timestamp: Date.now(),
      });
    }

    setUndoVisible(true);
  }, [localCards, playlistId]);

  const handleUndo = useCallback(() => {
    if (!lastRemoved) return;
    lightHaptic();

    const { card, index, originalDifficulty } = lastRemoved;
    const cleanId = card._id.split('-loop-')[0];

    isOptimisticUpdateRef.current = true;
    // Restore locally
    const nextCards = [...localCards];
    nextCards.splice(index, 0, card);
    setLocalCards(nextCards);

    if (isGuest) {
      setLastRemoved(null);
      setUndoVisible(false);
      return;
    }

    // Restore store
    const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
    if (isSmart && originalDifficulty) {
      usePlaylistStateStore.getState().transferCard(cleanId, card as any, originalDifficulty, true);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'CLASSIFY_CARD',
        payload: { cardId: cleanId, state: originalDifficulty },
        timestamp: Date.now(),
      });
    } else {
      usePlaylistStateStore.getState().toggleCustomPlaylistItemInStore(playlistId, cleanId, true);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'TOGGLE_PLAYLIST_ITEM',
        payload: { playlistId, cardId: cleanId, value: true },
        timestamp: Date.now(),
      });
    }

    // Restore custom order if applicable
    const draggedIds = nextCards.map(c => c._id);
    usePlaylistStateStore.getState().setPlaylistCardOrder(playlistId, draggedIds);

    // Clean up
    setLastRemoved(null);
    setUndoVisible(false);
  }, [lastRemoved, localCards, playlistId, isGuest]);

  const displayTitle = isLikes ? 'Revised' : (playlist?.name || 'Playlist');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime'>(
    Platform.OS === 'ios' ? 'datetime' : 'date'
  );
  const [selectedDate, setSelectedDate] = useState(new Date());

  const closeDatePicker = useCallback(() => {
    setShowDatePicker(false);
    if (step === 'playlist-reminder') {
      setStep('playlist-happy');
    }
  }, [step, setStep]);

  const confirmReminderScheduling = useCallback(async (date: Date) => {
    if (date.getTime() <= Date.now()) {
      Alert.alert('Scheduled Time Error', 'Please select a future date and time.');
      return;
    }

    try {
      const { schedulePlaylistRevisionReminder } = require('@/services/notificationService');
      const identifier = await schedulePlaylistRevisionReminder(displayTitle, date);
      
      if (identifier) {
        const dateString = date.toLocaleDateString(undefined, { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
        const timeString = date.toLocaleTimeString(undefined, { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        Alert.alert(
          'Revision Scheduled',
          `Your ${displayTitle} revision has been scheduled for ${dateString} at ${timeString}.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Scheduling Failed', 'Could not schedule notification. Please check permissions.');
      }
    } catch (err: any) {
      console.error('Failed to schedule playlist revision reminder:', err);
      Alert.alert('Scheduling Error', 'An unexpected error occurred.');
    }
  }, [displayTitle]);

  const handlePickerChange = useCallback((event: any, date?: Date) => {
    if (event.type === 'dismissed') {
      closeDatePicker();
      return;
    }

    if (Platform.OS === 'android') {
      if (pickerMode === 'date' && date) {
        setSelectedDate(date);
        setPickerMode('time');
        setShowDatePicker(false); // temporary close, don't trigger walkthrough advance
        setTimeout(() => {
          setShowDatePicker(true);
        }, 120);
      } else if (pickerMode === 'time' && date) {
        closeDatePicker(); // final close, trigger walkthrough advance
        const finalDate = new Date(selectedDate);
        finalDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
        confirmReminderScheduling(finalDate);
      }
    } else {
      // iOS
      if (date) {
        setSelectedDate(date);
      }
    }
  }, [pickerMode, selectedDate, confirmReminderScheduling, closeDatePicker]);

  const openRevisionReminderPicker = useCallback(() => {
    if (step !== 'playlist-reminder' && step !== 'none') return;
    lightHaptic();
    setSelectedDate(new Date());
    setPickerMode(Platform.OS === 'ios' ? 'datetime' : 'date');
    setShowDatePicker(true);
  }, [step]);

  const pendingOrderRef = useRef<IPopulatedRevisionCard[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pendingOrderRef.current = [];
    };
  }, []);

  const commitOrder = useCallback((data: IPopulatedRevisionCard[]) => {
    isOptimisticUpdateRef.current = true;
    // 1. Commit immediately to local state so visual positions settle
    setLocalCards(data);

    if (step === 'playlist-reorder') {
      setStep('playlist-remove');
    }

    if (isGuest) return;

    // 2. Map and update store/backend
    const draggedIds = data.map(c => c._id);
    const originalIds = usePlaylistStateStore.getState().playlistCardOrderMap[playlistId] || [];
    const draggedSet = new Set(draggedIds);
    const missingIds = originalIds.filter(id => !draggedSet.has(id));
    const finalIds = [...draggedIds, ...missingIds];

    setPlaylistCardOrder(playlistId, finalIds);

    // Invalidate stale reels session so reels load in the new order
    const trackingState = useTrackingStore.getState();
    if (trackingState.reelsSourceId === playlistId) {
      useTrackingStore.setState({
        reelsSessionId: null,
        reelsSessionCards: [],
        reelsActiveIndex: 0,
        reelsSourceType: null,
        reelsSourceId: null,
      });
    }

    if (isLikes) {
      reorderLikes.mutate(finalIds);
    } else if (['easy', 'medium', 'hard', 'skipped'].includes(playlistId)) {
      // Smart focus areas are manual-ordered local-first! No backend mutation.
    } else {
      reorderPlaylist.mutate({ playlistId, cardIds: finalIds });
    }
  }, [playlistId, isLikes, setPlaylistCardOrder, reorderLikes, reorderPlaylist, queryClient, isGuest]);

  const handleDragEnd = useCallback(({ data }: { data: IPopulatedRevisionCard[] }) => {
    pendingOrderRef.current = data;

    // Use InteractionManager to defer state updates until React Native layout interactions complete
    InteractionManager.runAfterInteractions(() => {
      if (!pendingOrderRef.current.length) return;
      commitOrder(pendingOrderRef.current);
      pendingOrderRef.current = [];
    });
  }, [commitOrder]);

  const startRevising = useCallback((shuffle = false, resume = false, startCardId?: string) => {
    if (!playlistId) return;

    if (localCards.length === 0) {
      Alert.alert('No cards to revise', 'Add cards to this playlist before starting a run.');
      return;
    }
    setActivePlaylistId(playlistId);
    lastTappedCardIdRef.current = startCardId?.split('-loop-')[0] || null;
    router.push({
      pathname: '/(protected)/reels-player',
      params: {
        playlistId,
        shuffle: shuffle ? 'true' : 'false',
        startCardId: startCardId || '',
      },
    });
  }, [playlistId, localCards.length, setActivePlaylistId, router]);

  const renderItem = useCallback(({ item: card, drag, isActive }: RenderItemParams<IPopulatedRevisionCard>) => {
    if (!card || !card._id) return null;
    const cleanId = card._id.split('-loop-')[0];

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current.set(cleanId, ref);
          }
        }}
        enabled={!isWalkthroughActive || step === 'playlist-remove'}
        activeOffsetX={[-3, 30]}
        failOffsetY={[-10, 10]}
        renderRightActions={() => (
          <TouchableOpacity
            onPress={() => handleSwipeRemove(card)}
            activeOpacity={0.8}
            style={{
              backgroundColor: addAlpha(palette.error, 0.12),
              justifyContent: 'center',
              alignItems: 'center',
              width: 70,
              height: 104,
              borderRadius: 24,
              marginBottom: 12,
              marginLeft: 8,
              borderWidth: 1,
              borderColor: addAlpha(palette.error, 0.25),
            }}
          >
            <Text style={{ color: palette.error, fontWeight: 'bold', fontSize: 12 }}>Remove</Text>
          </TouchableOpacity>
        )}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            handleSwipeRemove(card);
          }
        }}
      >
        <CardItem
          card={card}
          drag={drag}
          isActive={isActive}
          startRevising={startRevising}
        />
      </Swipeable>
    );
  }, [startRevising, handleSwipeRemove, palette, isWalkthroughActive, step]);

  if (!playlistId) {
    return (
      <ThemeBackground>
        <SafeAreaView className="flex-1 justify-center items-center px-6" style={{ backgroundColor: 'transparent' }}>
          <Text className="text-center mb-4" style={{ color: palette.textSecondary }}>Invalid playlist link.</Text>
          <TouchableOpacity onPress={handleBack} className="px-6 py-3 rounded-full" style={{ backgroundColor: palette.accent }}>
            <Text style={{ color: palette.isDark ? palette.textPrimary : palette.surface }}>Go back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  const handleBackdropPress = async () => {
    lightHaptic();
    if (localStep === 'playlist-reorder') {
      setStep('playlist-remove');
    } else if (localStep === 'playlist-remove') {
      setStep('playlist-reminder');
    } else if (localStep === 'playlist-reminder') {
      // Do nothing: only the revision reminder button itself is clickable in this step
    } else if (localStep === 'playlist-happy') {
      await completeWalkthrough();
      if (user?.id === 'guest-user') {
        const { useAuthStore } = require('@/store/useAuthStore');
        await useAuthStore.getState().logout();
        router.replace('/(auth)/login');
      } else {
        router.replace('/(protected)/(tabs)/learn');
      }
    }
  };

  return (
    <ThemeBackground>
      <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }} edges={['top', 'left', 'right']}>
        <SyncPauseGate />
        <View className="flex-row items-center px-4 pt-2 pb-2">
          {!(playlistId === 'hard' && !isComplete) && (
            <TouchableOpacity
              onPress={handleBack}
              className="p-2 mr-2 rounded-full border"
              style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
            >
              <ChevronLeft color={palette.textSecondary} size={24} />
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <Text className="text-xl font-bold tracking-tight" style={{ color: palette.textPrimary }} numberOfLines={1}>
              {displayTitle}
            </Text>
            <Text className="text-sm font-semibold" style={{ color: palette.textSecondary }}>
              {localCards.length} cards
            </Text>
          </View>
        </View>

        <View 
          className="flex-row px-4 mt-2 gap-2 mb-4"
          style={{ zIndex: localStep === 'playlist-reminder' ? 9995 : 1 }}
        >
          <TouchableOpacity
            onPress={() => startRevising(false, false)}
            disabled={['playlist-reorder', 'playlist-remove', 'playlist-reminder', 'playlist-happy'].includes(localStep)}
            className="flex-1 flex-row items-center justify-center py-3 rounded-2xl"
            style={{ backgroundColor: palette.accent, opacity: ['playlist-reorder', 'playlist-remove', 'playlist-reminder', 'playlist-happy'].includes(localStep) ? 0.5 : 1 }}
          >
            <Play color={palette.isDark ? palette.textPrimary : palette.surface} size={18} />
            <Text className="font-semibold text-sm ml-2" style={{ color: palette.isDark ? palette.textPrimary : palette.surface }}>Run in Order</Text>
          </TouchableOpacity>
          <AnimatedTouchableOpacity
            onPress={openRevisionReminderPicker}
            disabled={localStep !== 'playlist-reminder' && localStep !== 'none'}
            className="flex-1 flex-row items-center justify-center border py-3 rounded-2xl"
            style={[
              {
                backgroundColor: palette.surface,
                position: 'relative',
                overflow: 'hidden',
              },
              reminderAnimatedStyle
            ]}
          >
            {localStep === 'playlist-reminder' && (
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    borderRadius: 16,
                    borderWidth: 2.5,
                    borderColor: palette.accent,
                  },
                  reminderGlowStyle
                ]}
              />
            )}
            <Calendar color={localStep === 'playlist-reminder' ? palette.accent : palette.textPrimary} size={18} />
            <Text className="font-semibold text-sm ml-2" style={{ color: localStep === 'playlist-reminder' ? palette.accent : palette.textPrimary }}>Revision Reminder</Text>
          </AnimatedTouchableOpacity>
        </View>

      {(isLoading && localCards.length === 0) || (!isGuest && !isBootstrapReady && localCards.length === 0) || (!isGuest && localCards.length === 0 && storeCards && storeCards.length > 0) ? (
        <ActivityIndicator size="large" color={palette.accent} className="mt-12" />
      ) : isError && localCards.length === 0 ? (
        <View className="rounded-2xl p-6 mb-6 mx-4 border" style={{ backgroundColor: palette.surface, borderColor: palette.border }}>
          <Text className="font-medium" style={{ color: palette.error }}>{error?.message}</Text>
          <TouchableOpacity onPress={() => refetch()} className="mt-4">
            <Text className="font-medium text-center" style={{ color: palette.accent }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : localCards.length === 0 ? (
        <View className="rounded-[28px] p-8 items-center border mx-4" style={{ backgroundColor: palette.surface, borderColor: palette.border }}>
          <Text className="font-semibold text-lg mb-2" style={{ color: palette.textPrimary }}>No reels saved yet</Text>
          <Text className="text-center text-sm" style={{ color: palette.textSecondary }}>
            Favorite cards to add them to this playlist.
          </Text>
        </View>
      ) : (
        <DraggableFlatList
          ref={listRef}
          data={localCards}
          extraData={localCards}
          onDragEnd={handleDragEnd}
          keyExtractor={(item, index) => item?._id ? item._id.split('-loop-')[0] : `playlist-item-${index}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          activationDistance={20}
          dragItemOverflow={false}
          removeClippedSubviews={true}
          windowSize={3}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={100}
          getItemLayout={(_, index) => ({
            length: 104,
            offset: 104 * index,
            index,
          })}
          onEndReached={() => {
            if (playlistId === 'all' && !isLoadingMoreRef.current) {
              isLoadingMoreRef.current = true;
              usePlaylistStateStore.getState().checkAndLoadMorePlaylistCards(playlistId, localCards.length - 1);
            }
          }}
          onEndReachedThreshold={0.4}
        />
      )}

      {undoVisible && lastRemoved && (
        <Animated.View
          entering={FadeInUp.duration(300)}
          exiting={FadeOut.duration(200)}
          style={{
            position: 'absolute',
            bottom: 30,
            left: 20,
            right: 20,
            backgroundColor: palette.surface,
            borderRadius: 20,
            paddingVertical: 14,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: palette.isDark ? 0.3 : 0.1,
            shadowRadius: 16,
            elevation: 6,
            zIndex: 999,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '600' }}>
            Card removed from playlist
          </Text>
          <TouchableOpacity
            onPress={handleUndo}
            activeOpacity={0.8}
            style={{
              backgroundColor: palette.accent,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: palette.isDark ? palette.textPrimary : palette.surface, fontSize: 12, fontWeight: '700' }}>
              Undo
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={closeDatePicker}>
          <View style={{
            flex: 1,
            backgroundColor: palette.overlayBg,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}>
            <View style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: palette.surface,
              borderRadius: 32,
              padding: 20,
              alignItems: 'center',
              shadowColor: palette.shadow,
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.15,
              shadowRadius: 28,
              elevation: 8,
              borderWidth: 1,
              borderColor: palette.border,
            }}>
              {/* Cute Dynamic Themed Header Icon */}
              <View 
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: palette.accentBg,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <Calendar color={palette.accent} size={24} strokeWidth={2.2} />
              </View>

              <Text style={{
                fontSize: 16,
                fontWeight: '900',
                color: palette.textPrimary,
                marginBottom: 16,
                letterSpacing: -0.2,
              }}>Schedule Revision</Text>
              
              <DateTimePicker
                value={selectedDate}
                mode="datetime"
                display="inline"
                onChange={handlePickerChange}
                style={{ width: '100%' }}
                themeVariant={palette.isDark ? 'dark' : 'light'}
                accentColor={palette.accent}
              />

              <View style={{
                flexDirection: 'row',
                gap: 12,
                marginTop: 20,
                width: '100%',
              }}>
                <TouchableOpacity 
                  onPress={closeDatePicker} 
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: palette.inputBg,
                    borderWidth: 1,
                    borderColor: palette.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: palette.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    closeDatePicker();
                    confirmReminderScheduling(selectedDate);
                  }} 
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: palette.accent,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: palette.isDark ? palette.textPrimary : palette.surface }}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode={pickerMode as 'date' | 'time'}
          display="default"
          onChange={handlePickerChange}
          accentColor={palette.accent}
        />
      )}

      {/* Tutorial backdrop overlays blocking invalid clicks and forwarding to handleBackdropPress */}
      {['playlist-reminder', 'playlist-happy'].includes(localStep) && (
        <Pressable
          onPress={handleBackdropPress}
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: addAlpha(palette.shadow, 0.01),
            zIndex: 9990,
          }}
        />
      )}

      {/* Dynamic guidance tutorial message panel */}
      {['playlist-reorder', 'playlist-remove', 'playlist-reminder', 'playlist-happy'].includes(localStep) && (
        <View style={{
          position: 'absolute',
          bottom: '30%',
          left: 16,
          right: 16,
          zIndex: 10000, // Make sure panel sits on top of the backdrop overlays
        }}>
          <Pressable onPress={handleBackdropPress}>
            <GlassPanel style={{
              width: '100%',
              padding: 20,
              borderRadius: 32,
              borderColor: palette.border,
              borderWidth: 1.5,
              backgroundColor: addAlpha(palette.surface, 0.95),
              shadowColor: palette.shadow,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.08,
              shadowRadius: 20,
              elevation: 6,
            }} intensity={30} tint={palette.isDark ? "dark" : "light"}>
              <Animated.View style={[{ width: '100%' }, panelAnimatedStyle]}>
                {localStep === 'playlist-happy' && <ConfettiBlast />}

              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <View style={{ marginRight: 16 }}>
                  <ReeWCharacter
                    state={
                      localStep === 'playlist-reorder'
                        ? 'sort_reew'
                        : localStep === 'playlist-remove'
                          ? 'smirk'
                          : localStep === 'playlist-reminder'
                            ? 'coffee_break'
                            : 'celebrating'
                    }
                    size={72}
                  />
                </View>
                <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
                  {localStep === 'playlist-reorder' && (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '800', lineHeight: 24, textAlign: 'left', color: palette.textPrimary }}>
                        {"I long press the card and then reorder it to customize my revision sequence!"}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', opacity: 0.6, letterSpacing: 0.5, marginTop: 4, color: palette.textMuted }}>
                        Tap anywhere to continue
                      </Text>
                    </>
                  )}
                  {localStep === 'playlist-remove' && (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '800', lineHeight: 24, textAlign: 'left', color: palette.textPrimary }}>
                        {"I swipe left on the card I no longer want in the playlist to remove it."}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', opacity: 0.6, letterSpacing: 0.5, marginTop: 4, color: palette.textMuted }}>
                        Tap anywhere to continue
                      </Text>
                    </>
                  )}
                  {localStep === 'playlist-reminder' && (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '800', lineHeight: 24, textAlign: 'left', color: palette.textPrimary }}>
                        {"I use the revision reminder for revision. Open the revision reminder!"}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', opacity: 0.6, letterSpacing: 0.5, marginTop: 4, color: palette.accent }}>
                        tap the revision reminder
                      </Text>
                    </>
                  )}
                  {localStep === 'playlist-happy' && (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '900', textAlign: 'left', color: palette.accent }}>
                        {"Happy ReeWising!!"}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', opacity: 0.6, letterSpacing: 0.5, marginTop: 4, color: palette.textMuted }}>
                        Tap anywhere to continue
                      </Text>
                    </>
                  )}
                </View>
              </View>
              </Animated.View>
            </GlassPanel>
          </Pressable>
        </View>
      )}
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
    height: 104,
  },
  cardActive: {
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  }
});
