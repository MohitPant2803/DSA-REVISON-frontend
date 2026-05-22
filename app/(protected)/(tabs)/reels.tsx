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
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { FlashList } from '@shopify/flash-list';
const TypedFlashList = FlashList as any;
import { useGetRevisionCards, IPopulatedRevisionCard, ISlide } from '@/hooks/useRevisionCards';
import { useGetFolders } from '@/hooks/useFolders';
import { RevisionCard } from './RevisionCard';
import { useUpdateLastViewedCard, useFolderLoops } from '@/services/useUserProgress';
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
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useUpdateCardProgress } from '@/services/useProgress';
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canModifyItem, UserRole } from '@/utils/permissions';
import { normalizeParam } from '@/utils/routeParams';
import { usePlaylists, usePlaylistCards, useTogglePlaylistItem } from '@/hooks/usePlaylists';
import { useCardPlaylistMembership } from '@/hooks/usePlaylistMembership';
import * as sessionQueueService from '@/services/sessionQueueService';
import * as userCardStateService from '@/services/userCardStateService';
import { ConceptCardPreview, getSlidesForCard } from '@/components/ConceptCardPreview';

const { width, height } = Dimensions.get('window');
const PAGE_SIZE = 15; // Increased page size for smoother continuous reel buffering

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
    Vibration.vibrate(8);
  }
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Premium circular progress ring around loop count
const ProgressRing = ({ radius = 18, stroke = 3, progress = 0 }) => {
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
};

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

export default function ReelsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { canManageContent } = useRole();
  
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

  const flashListRef = useRef<any>(null);
  const [page, setPage] = useState(1);
  const [allCards, setAllCards] = useState<IPopulatedRevisionCard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const shuffledOrderRef = useRef<string[]>([]);

  const { activePlaylistId, setActivePlaylistId } = useBookmarkStore();
  const { data: playlists = [] } = usePlaylists();

  // Zustand scalable tracking store
  const {
    currentMode,
    infiniteLoop,
    watchLaterCardIds,
    sessionStartTime,
    sessionTotalTime,
    completedCardsCount,
    completedCardIds, // Added for stable completion checks
    loopsCompleted,
    setMode,
    setInfiniteLoop,
    toggleWatchLater,
    setWatchLater,
    startSession,
    updateSessionTime,
    markCardCompleted,
    resetSession,
  } = useTrackingStore();

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

  // Premium static filter button and overlay states
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  // Local state for fullscreen presentation slider
  const [activePlacard, setActivePlacard] = useState<IPopulatedRevisionCard | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isPPTVisible, setIsPPTVisible] = useState(false);

  // Presentation transitions shared values
  const modalOpacity = useSharedValue(0);
  const modalScale = useSharedValue(0.92);
  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const pptDragX = useSharedValue(0);
  const viewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bottomTabBarHeight = insets.bottom + 72;
  const cardHeight = height - insets.top - bottomTabBarHeight - 64; 

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
  const { data: foldersData } = useGetFolders({ limit: 100 });

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
    if (!sessionStartTime) {
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

  // Memoized adjacent card preloading to ensure zero slide latency
  const preloadedSlides = useMemo(() => {
    const preloaded: Record<string, ISlide[]> = {};
    const indicesToPreload = [activeIndex - 1, activeIndex, activeIndex + 1];
    indicesToPreload.forEach(idx => {
      if (idx >= 0 && idx < cardsList.length) {
        const card = cardsList[idx];
        if (card && card._id) {
          preloaded[card._id] = getSlidesForCard(card);
        }
      }
    });
    return preloaded;
  }, [activeIndex, cardsList]);

  // Scroll to index 0 on mode changes
  useEffect(() => {
    setActiveIndex(0);
    flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [currentMode]);

  // Track completed cards per session & mark as viewed
  useEffect(() => {
    if (cardsList.length > 0 && cardsList[activeIndex]) {
      const activeItem = cardsList[activeIndex];
      if (!activeItem) return;
      const cleanId = activeItem._id.split('-loop-')[0];
      if (!completedCardIds[cleanId]) {
        markCardCompleted(cleanId);
      }
      if (!isGuest) {
        userCardStateService.markViewed(cleanId).catch(console.error);
      }
    }
  }, [activeIndex, cardsList, completedCardIds, markCardCompleted, isGuest]);

  // Reset standard queries when parameters change
  useEffect(() => {
    hasPromptedResume.current = false;
    startSession(); // Start a fresh session when playback source/folder/playlist changes
    if (!activePlaylistId) {
      setPage(1);
      setAllCards([]);
      setActiveIndex(0);
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
      setActiveIndex(0);
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
                    
                    setActiveIndex(0);
                    sessionQueueService.updateSessionIndex(session._id, 0).catch(console.error);
                  }
                },
                {
                  text: 'Resume',
                  onPress: () => {
                    setActiveIndex(foundIdx);
                    sessionQueueService.updateSessionIndex(session._id, foundIdx).catch(console.error);
                    setTimeout(() => {
                      const listLength = isSessionActive ? sessionCards.length : displayedCards.length;
                      if (foundIdx >= 0 && foundIdx < listLength) {
                        flashListRef.current?.scrollToIndex({ index: foundIdx, animated: false });
                      }
                    }, 300);
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
          setActiveIndex(targetIndex);
          setTimeout(() => {
            const listLength = isSessionActive ? sessionCards.length : displayedCards.length;
            if (targetIndex >= 0 && targetIndex < listLength) {
              flashListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
            }
          }, 300);
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
      
      setActiveIndex(slice.currentIndex);
      if (slice.currentIndex >= 0 && slice.currentIndex < slice.orderedCardIds.length) {
        flashListRef.current?.scrollToIndex({ index: slice.currentIndex, animated: true });
      }
    } catch (err) {
      console.error('[Session Shuffle Toggle Error]', err);
    }
  };

  // Prompt resume state correctly on loaded cards (for non-session / guest playback)
  useEffect(() => {
    if (isSessionActive) return;
    if (displayedCards.length === 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      return;
    }
    
    if (!hasPromptedResume.current) {
      if (startCardIdParam) {
        const targetIndex = displayedCards.findIndex(c => c._id === startCardIdParam);
        if (targetIndex !== -1) {
          hasPromptedResume.current = true;
          setActiveIndex(targetIndex);
          setTimeout(() => {
            flashListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
          }, 300);
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
                    setActiveIndex(0);
                  }
                },
                {
                  text: 'Resume',
                  onPress: () => {
                    setActiveIndex(targetIndex);
                    setTimeout(() => {
                      const listLength = isSessionActive ? sessionCards.length : displayedCards.length;
                      if (targetIndex >= 0 && targetIndex < listLength) {
                        flashListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
                      }
                    }, 300);
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
      setActiveIndex(displayedCards.length - 1);
    }
  }, [displayedCards, activePlaylistId, folderIdParam, isSessionActive]);

  // Stable parent callback to handle instant, non-flickering, optimistic state updates
  const handleCardStateUpdate = useCallback((cardId: string, action: 'favorite' | 'difficult' | 'archived', value: boolean) => {
    setAllCards((prevCards) => {
      if (activePlaylistId === 'likes' && action === 'favorite' && !value) {
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
  }, [activePlaylistId]);

  // Synchronize and merge new/updated API pages to the continuous deck
  useEffect(() => {
    if (activePlaylistId || !data?.results) return;
    
    if (allCards.length === 0) {
      setAllCards(data.results);
      setActiveIndex(0);
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
    setActiveIndex(nextIdx);
    if (nextIdx >= 0 && nextIdx < cardsList.length) {
      flashListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    }
  };

  useEffect(() => {
    return () => {
      if (viewTimeoutRef.current) clearTimeout(viewTimeoutRef.current);
    };
  }, []);

  const animateSlideChange = (direction: 'next' | 'prev', callback: () => void) => {
    const outX = direction === 'next' ? -24 : 24;
    slideX.value = withTiming(outX, { duration: 120 }, (finished) => {
      if (finished) {
        runOnJS(callback)();
        slideX.value = direction === 'next' ? 24 : -24;
        slideX.value = withTiming(0, { duration: 180 });
      }
    });
  };

  const nextSlide = () => {
    if (activePlacard) {
      const slides = preloadedSlides[activePlacard._id] || getSlidesForCard(activePlacard);
      if (activeSlideIndex + 1 < slides.length) {
        animateSlideChange('next', () => {
          setActiveSlideIndex(activeSlideIndex + 1);
        });
      }
    }
  };

  const prevSlide = () => {
    if (activeSlideIndex > 0) {
      animateSlideChange('prev', () => {
        setActiveSlideIndex(activeSlideIndex - 1);
      });
    }
  };

  const openPPT = (card: IPopulatedRevisionCard, initialIndex = 0) => {
    lightHaptic();
    setActivePlacard(card);
    setActiveSlideIndex(initialIndex);
    setIsPPTVisible(true);
    modalOpacity.value = withTiming(1, { duration: 220 });
    modalScale.value = withTiming(1, { duration: 220 });
  };

  const closePPT = () => {
    lightHaptic();
    modalOpacity.value = withTiming(0, { duration: 200 });
    modalScale.value = withTiming(0.98, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setActivePlacard)(null);
        runOnJS(setActiveSlideIndex)(0);
        runOnJS(setIsPPTVisible)(false);
      }
    });
  };

  const pptPanGesture = Gesture.Pan()
    .onUpdate((event) => {
      pptDragX.value = event.translationX;
    })
    .onEnd((event) => {
      const swipeThreshold = width * 0.18;
      const velocityThreshold = 500;
      if (activePlacard) {
        const slides = preloadedSlides[activePlacard._id] || getSlidesForCard(activePlacard);
        if (pptDragX.value < -swipeThreshold || event.velocityX < -velocityThreshold) {
          if (activeSlideIndex + 1 < slides.length) {
            pptDragX.value = 0;
            runOnJS(nextSlide)();
          } else {
            pptDragX.value = withSpring(0);
          }
        } else if (pptDragX.value > swipeThreshold || event.velocityX > velocityThreshold) {
          if (activeSlideIndex > 0) {
            pptDragX.value = 0;
            runOnJS(prevSlide)();
          } else {
            pptDragX.value = withSpring(0);
          }
        } else {
          pptDragX.value = withSpring(0);
        }
      } else {
        pptDragX.value = withSpring(0);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
  }));

  const mainPptStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: modalScale.value },
      { translateX: slideX.value + pptDragX.value * 0.3 },
    ],
    opacity: modalOpacity.value,
  }));

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length > 0) {
      const idx = viewableItems[0].index;
      if (idx !== null && idx !== undefined) {
        setActiveIndex(idx);
        
        if (isSessionActive && sessionId) {
          handleSessionSwipe(idx);
        }
      }
    }
  }, [isSessionActive, sessionId, handleSessionSwipe]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 }).current;

  // Clean, high-fidelity overlay toggle without pill warping
  const toggleMenu = () => {
    lightHaptic();
    setIsMenuOpen(!isMenuOpen);
  };

  const isPlaylistLoading = !!activePlaylistId && playlistCardsLoading;

  if (isLoading || isPlaylistLoading || (isSessionActive && sessionLoading)) {
    return (
      <View className="flex-1 bg-[#F8FAFC] justify-center items-center">
        <ActivityIndicator color="#8B5CF6" size="large" />
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

  const activeSlides = activePlacard
    ? (preloadedSlides[activePlacard._id] || getSlidesForCard(activePlacard)).map((s, idx, arr) => ({
        ...s,
        card: activePlacard,
        slideIndex: idx,
        totalSlides: arr.length,
      }))
    : [];

  return (
    <GestureHandlerRootView style={{ flex: 1 }} className="bg-[#F5F5F7]">
      
      {/* Premium Glassmorphic Static Filter Trigger Button */}
      <View 
        style={{
          position: 'absolute',
          top: insets.top + 12,
          right: 16,
          zIndex: 90,
          width: 130,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.12)',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 2,
          overflow: 'hidden',
        }}
      >
        <TouchableOpacity 
          onPress={toggleMenu} 
          className="flex-row items-center gap-1.5 w-full h-full justify-center px-3"
          activeOpacity={0.7}
        >
          <Settings2 color="#8B5CF6" size={13} strokeWidth={2.5} />
          <Text className="text-slate-800 text-[10px] font-extrabold uppercase tracking-wider">
            {currentMode === 'sequential' ? '🔄 SEQ' : currentMode === 'shuffle' ? '🔀 SHUF' : currentMode === 'difficult' ? '🎯 DIFF' : currentMode === 'favorites' ? '❤️ FAV' : '🕒 LATE'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Premium Glassmorphic Classy Dashboard Overlay */}
      {isMenuOpen && (
        <View 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 150,
          }}
        >
          {/* Dismiss backdrop on click outside */}
          <TouchableOpacity 
            style={StyleSheet.absoluteFillObject} 
            activeOpacity={1} 
            onPress={toggleMenu} 
          />

          <View 
            style={{
              width: width - 32,
              height: height * 0.7,
              borderRadius: 24,
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              borderWidth: 1,
              borderColor: 'rgba(241, 245, 249, 0.8)',
              padding: 22,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 30,
              elevation: 12,
            }}
          >
            <View className="flex-row items-center justify-between mb-5">
              <View>
                <Text className="text-[#0F172A] text-lg font-bold tracking-tight">Run Dashboard</Text>
                <Text className="text-slate-400 text-xs mt-0.5">Continuous reel controls</Text>
              </View>
              <TouchableOpacity
                onPress={toggleMenu}
                className="bg-slate-100 p-2 rounded-full"
              >
                <X color="#64748B" size={16} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Session Real-time Trackers */}
            <View className="bg-[#F8FAFC] border border-slate-100/80 rounded-2xl p-4 mb-5 flex-row justify-around">
              <View className="items-center">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">⏱️ Duration</Text>
                <Text className="text-slate-800 text-[15px] font-bold">{formatTime(sessionTotalTime)}</Text>
              </View>
              <View className="h-8 w-px bg-slate-200 self-center" />
              <View className="items-center">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">🃏 Finished</Text>
                <Text className="text-slate-800 text-[15px] font-bold">{completedCardsCount} cards</Text>
              </View>
              <View className="h-8 w-px bg-slate-200 self-center" />
              <View className="items-center">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">🔄 Runs</Text>
                <Text className="text-slate-800 text-[15px] font-bold">x{displayLoops}</Text>
              </View>
            </View>

            <Text className="text-[#0F172A] text-[13px] font-bold uppercase tracking-wider text-slate-400 mb-2">Modes</Text>
            <ScrollView showsVerticalScrollIndicator={false} className="flex-1 mb-4">
              {(
                [
                  { id: 'sequential', label: 'Sequential', desc: 'Order of playlist/sheet', icon: '🔄', color: '#8B5CF6' },
                  { id: 'shuffle', label: 'Shuffle', desc: 'Random order', icon: '🔀', color: '#ec4899' },
                  { id: 'difficult', label: 'Difficult Only', desc: 'Starred difficult cards', icon: '🎯', color: '#f59e0b' },
                  { id: 'favorites', label: 'Favorites Only', desc: 'Saved favorite cards', icon: '❤️', color: '#ef4444' },
                  { id: 'watchLater', label: 'Watch Later Only', desc: 'Queued to read later', icon: '🕒', color: '#3b82f6' },
                ] as const
              ).map((mode) => {
                const isActive = currentMode === mode.id;
                return (
                  <TouchableOpacity
                    key={mode.id}
                    onPress={() => {
                      setMode(mode.id);
                      lightHaptic();
                      if (isSessionActive) {
                        if (mode.id === 'shuffle') {
                          handleToggleShuffleInSession(true);
                        } else if (mode.id === 'sequential') {
                          handleToggleShuffleInSession(false);
                        }
                      }
                    }}
                    className={`flex-row items-center justify-between p-3 mb-1.5 rounded-xl border ${
                      isActive ? 'bg-violet-50/50 border-violet-200/60' : 'bg-[#F8FAFC]/80 border-slate-100/50'
                    } active:opacity-85`}
                  >
                    <View className="flex-row items-center gap-2.5 flex-1">
                      <View 
                        className="w-8 h-8 rounded-lg justify-center items-center"
                        style={{ backgroundColor: isActive ? `${mode.color}15` : '#f1f5f9' }}
                      >
                        <Text className="text-sm">{mode.icon}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className={`font-semibold text-xs ${isActive ? 'text-[#0F172A]' : 'text-slate-700'}`}>{mode.label}</Text>
                        <Text className="text-slate-400 text-[10px] mt-0.5" numberOfLines={1}>{mode.desc}</Text>
                      </View>
                    </View>
                    <View
                      className={`w-4 h-4 rounded-full border items-center justify-center ${
                        isActive ? 'bg-violet-500 border-violet-500' : 'border-slate-300'
                      }`}
                    >
                      {isActive && <Check color="#fff" size={9} strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Loop toggle block */}
            <View className="flex-row items-center justify-between p-3.5 mb-4 rounded-2xl bg-[#F8FAFC] border border-slate-100/80">
              <View className="flex-1 pr-3">
                <Text className="text-[#0F172A] font-semibold text-xs">🔄 Infinite Looping</Text>
                <Text className="text-slate-400 text-[10px] mt-0.5">Continuous auto-restart</Text>
              </View>
              <Switch
                value={infiniteLoop}
                onValueChange={(val) => {
                  setInfiniteLoop(val);
                  lightHaptic();
                }}
                trackColor={{ false: '#e2e8f0', true: '#c084fc' }}
                thumbColor={infiniteLoop ? '#8B5CF6' : '#94a3b8'}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>

            {/* Premium controls footer */}
            <View className="flex-row gap-2.5 mt-auto">
              <TouchableOpacity
                onPress={() => {
                  resetSession();
                  lightHaptic();
                  Toast.show({ type: 'info', text1: 'Session statistics reset!' });
                }}
                className="flex-1 py-3 rounded-xl items-center border border-slate-200 flex-row justify-center gap-1 bg-white active:scale-95"
              >
                <RotateCcw color="#64748B" size={13} />
                <Text className="text-slate-600 font-semibold text-xs">Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleMenu}
                className="flex-[1.5] py-3 rounded-xl items-center bg-[#8B5CF6] active:scale-95"
              >
                <Text className="text-white font-semibold text-xs">Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Dynamic Progress indicator header */}
      <View className="absolute top-12 left-5 right-5 z-40 flex-row items-center gap-2.5 pr-[160px]">
        {/* Back button */}
        {navigation.canGoBack() && (
          <TouchableOpacity
            onPress={() => router.back()}
            className="bg-white/95 p-2 rounded-full border border-slate-100/50 shadow-sm"
          >
            <ChevronLeft color="#0F172A" size={16} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
        
        {/* Unified progress linear timeline */}
        <View className="h-1 rounded-full bg-slate-200/50 overflow-hidden flex-1">
          <View
            className="h-full bg-violet-500 rounded-full"
            style={{ width: `${cardsList.length > 0 ? ((activeIndex + 1) / cardsList.length) * 100 : 0}%` }}
          />
        </View>

        {/* Progress Ring around loops */}
        {displayLoops > 0 && (
          <View className="flex-row items-center bg-white/90 border border-slate-100 rounded-full pr-2.5 pl-1.5 py-0.5 gap-1.5 shadow-sm">
            <ProgressRing
              radius={8}
              stroke={1.5}
              progress={cardsList.length > 0 ? (activeIndex + 1) / cardsList.length : 0}
            />
            <Text className="text-violet-600 text-[9px] font-black tracking-wider uppercase">L-{displayLoops}</Text>
          </View>
        )}
      </View>

      {/* Playlist Indicator Overlay */}
      {activePlaylistId && (
        <View
          className="absolute top-[88px] left-5 right-5 z-40 flex-row items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-100"
          style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
        >
          <View className="flex-row items-center gap-2 flex-1 pr-2">
            <ListMusic color="#8B5CF6" size={14} strokeWidth={2.5} />
            <Text className="text-[#0F172A] font-semibold text-[12px] flex-1" numberOfLines={1}>
              {playlists.find((p) => p.id === activePlaylistId)?.name || 'Playlist'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setActivePlaylistId(null);
              lightHaptic();
            }}
            className="p-1 bg-slate-100 rounded-full"
          >
            <X color="#94A3B8" size={11} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {/* Snappy Continuous Deck Core */}
      <View 
        className="flex-1 justify-center items-center px-4"
        style={{ 
          marginTop: insets.top + (activePlaylistId ? 96 : 56),
          marginBottom: bottomTabBarHeight - 12,
        }}
      >
        {cardsList.length > 0 ? (
          <TypedFlashList
            ref={flashListRef}
            data={cardsList}
            keyExtractor={(item: any, index: number) => item?._id || `skeleton-${index}`}
            style={{ alignSelf: 'stretch', flex: 1 }}
            estimatedItemSize={cardHeight + 16}
            showsVerticalScrollIndicator={false}
            snapToInterval={cardHeight + 16}
            decelerationRate="fast"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.8}
            renderItem={({ item, index }: any) => {
              if (isSessionActive && !item) {
                return (
                  <View style={[styles.cardBase, { height: cardHeight, marginBottom: 16, alignSelf: 'center', width: width - 24, justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text className="text-slate-400 text-xs mt-4">Preloading card...</Text>
                  </View>
                );
              }
              if (!item || !item._id) return null;
              return (
                <View style={[styles.cardBase, { height: cardHeight, marginBottom: 16, alignSelf: 'center', width: width - 24 }]}>
                  <ConceptCardPreview
                    card={item}
                    isWatchLater={watchLaterCardIds.includes(item._id.split('-loop-')[0])}
                    onToggleWatchLater={() => {
                      lightHaptic();
                      const cleanId = item._id.split('-loop-')[0];
                      toggleWatchLater(cleanId);
                      if (!isGuest) {
                        userCardStateService.toggleWatchLater(cleanId).catch(console.error);
                      }
                      queryClient.invalidateQueries({ queryKey: ['playlists'] });
                      queryClient.invalidateQueries({ queryKey: ['playlistDetail', 'watch-later'] });
                    }}
                    onViewExplanation={(idx) => openPPT(item, idx)}
                    onCardStateUpdate={handleCardStateUpdate}
                    activePlaylistId={activePlaylistId}
                  />
                </View>
              );
            }}
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

      {/* Cinematic Slide walkthoughs presentation overlay */}
      {isPPTVisible && activePlacard && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { zIndex: 1000 }, backdropStyle]}
          className="bg-slate-950/40 justify-center items-center"
        >
          <TouchableOpacity
            onPress={closePPT}
            className="absolute top-14 right-5 z-50 p-2.5 rounded-full items-center justify-center w-9 h-9 border border-white/20 bg-black/30"
          >
            <X color="#ffffff" size={16} strokeWidth={2.5} />
          </TouchableOpacity>

          <View className="flex-row items-center justify-center w-full px-3 relative">
            <TouchableOpacity
              onPress={prevSlide}
              disabled={activeSlideIndex === 0}
              className={`absolute left-2 z-50 p-3 rounded-full items-center justify-center w-9 h-9 border border-white/10 bg-black/40 ${
                activeSlideIndex === 0 ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <ChevronLeft color="#ffffff" size={16} strokeWidth={2.5} />
            </TouchableOpacity>

            <GestureDetector gesture={pptPanGesture}>
              <Animated.View
                style={[
                  {
                    width: width - 24,
                    height: height - insets.top - insets.bottom - 110,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 32,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                    padding: 24,
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.12,
                    shadowRadius: 28,
                    elevation: 12,
                  },
                  mainPptStyle,
                ]}
              >
                {activeSlides.length > 0 && (
                  <RevisionCard
                    slide={activeSlides[activeSlideIndex]}
                    currentIndex={activeSlideIndex}
                    totalCount={activeSlides.length}
                    onContinuePress={activeSlideIndex + 1 < activeSlides.length ? nextSlide : undefined}
                  />
                )}
              </Animated.View>
            </GestureDetector>

            <TouchableOpacity
              onPress={nextSlide}
              disabled={activeSlideIndex === activeSlides.length - 1}
              className={`absolute right-2 z-50 p-3 rounded-full items-center justify-center w-9 h-9 border border-white/10 bg-black/40 ${
                activeSlideIndex === activeSlides.length - 1 ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <ChevronRight color="#ffffff" size={16} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View className="absolute bottom-10 flex-row gap-1.5 items-center justify-center z-40">
            {activeSlides.map((_, idx) => (
              <IndicatorDot key={idx} isActive={idx === activeSlideIndex} />
            ))}
          </View>
        </Animated.View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  cardBase: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 26,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 2,
  },
});
