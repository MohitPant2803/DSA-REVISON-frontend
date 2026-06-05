import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  RefreshControl,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus,
  ArrowRight,
  ChevronRight,
  ListMusic,
  Heart,
  Clock,
  Sparkles,
  Flame,
  Brain,
  Zap,
  Skull,
  Activity,
} from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useRole } from '@/hooks/useRole';
import {
  useGetFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
} from '@/hooks/useFolders';
import { useDashboard } from '@/hooks/useDashboard';
import Svg, { Circle } from 'react-native-svg';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePlaylists } from '@/hooks/usePlaylists';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { theme } from '@/theme';
import { FolderCard } from '@/components/FolderCard';
import { FolderFormModal } from '@/components/FolderFormModal';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import type { CreateFolderDTO, IFolder } from '@/types/folder';
import { canModifyItem } from '@/utils/permissions';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { GlassPanel } from '@/components/motion/GlassPanel';
import { SuperchargedPressable } from '@/components/motion/SuperchargedPressable';
import { CinematicFadeIn } from '@/components/motion/CinematicFadeIn';
import api from '@/services/api';
import { useUIStore } from '@/store/useUIStore';
import { interactionScheduler } from '@/utils/interactionScheduler';
import { transitionScheduler } from '@/utils/transitionScheduler';
import { ReeWCharacter } from '@/components/ReeWCharacter';
import { ThemeBackground } from '@/components/ThemeBackground';
import { useThemePalette } from '@/hooks/useThemePalette';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
  FadeInUp,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Global session state to ensure cinematic animations only play the first time 
// the user visits the Learn screen per app session.
let globalHasPlayedLearnAnimation = (globalThis as any).__hasPlayedLearnAnimation || false;
let globalQuotesList: any[] = [];



// Staggered Chained Card Drag-Chain Momentum Component with Stretch and Compress Physics
const StaggeredCard = ({
  children,
  index,
  timelineProgress,
}: {
  children: React.ReactNode;
  index: number;
  timelineProgress: SharedValue<number>;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Staggered start trigger to slow down and smoothen the ascent
    // Card 0 starts at 38, Card 1 at 48, Card 2 at 58... Capped at 75% to prevent cards being lost at bottom!
    const startT = Math.min(75, 38 + index * 10);

    // Start completely off-screen from the bottom
    const startY = height + index * 60;
    const settleY = 0;

    // Normalize timeline progress for this specific card (0.0 to 1.0)
    const rawProgress = (timelineProgress.value - startT) / (100 - startT);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));

    // Reduced acceleration (Ease-In-Out Quadratic) for a calming, peaceful motion
    const easeProgress = clampedProgress < 0.5 
      ? 2 * clampedProgress * clampedProgress 
      : 1 - Math.pow(-2 * clampedProgress + 2, 2) / 2;

    const translateY = startY - (startY - settleY) * easeProgress;

 

    return {
      transform: [{ translateY }],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
};

const FolderCardSkeleton = () => {
  const palette = useThemePalette();
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.4, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const skeletonStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.skeletonCard, skeletonStyle, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={[styles.skeletonTitle, { backgroundColor: palette.inputBg }]} />
      <View style={[styles.skeletonSub, { backgroundColor: palette.inputBg }]} />
      <View style={[styles.skeletonBar, { backgroundColor: palette.inputBg }]} />
    </Animated.View>
  );
};

export default function LearnScreen() {
  useAppBackHandler();
  const palette = useThemePalette();
  
  const [isTransitionReady, setIsTransitionReady] = useState(true);

  useFocusEffect(
    useCallback(() => {
      interactionScheduler.registerInteraction(); // UI priority block
      usePlaylistStateStore.getState().setLiveSyncPaused(false);
      
      setIsTransitionReady(true);
      return () => {
        // Keep screen mounted to ensure instant back navigation switch!
      };
    }, [])
  );

  const screenOpacity = useSharedValue(globalHasPlayedLearnAnimation ? 0 : 1);

  useEffect(() => {
    if (globalHasPlayedLearnAnimation) {
      screenOpacity.value = withTiming(1, { duration: 600 });
    }
  }, []);

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { preferences } = useOnboardingStore();
  const { canManageContent, role } = useRole();
  const { setHasAppBeenAnimated } = useUIStore();
  const syncStatus = usePlaylistStateStore((s) => s.syncStatus);

  const { data: stats, refetch: refetchStats, isRefetching: isStatsRefetching } = useDashboard();
  const { setActivePlaylistId } = useBookmarkStore();
  const { data: playlists = [] } = usePlaylists();

  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<IFolder | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useGetFolders({
    limit: 100,
    search: search.trim() || undefined,
  });

  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();

  const folders = useMemo(() => data?.results ?? [], [data]);

  // Explicit cinematic loading phases
  const [phase, setPhase] = useState<'typing' | 'authorReveal' | 'contentReady' | 'settled'>(globalHasPlayedLearnAnimation ? 'settled' : 'typing');
  const [showAuthor, setShowAuthor] = useState(globalHasPlayedLearnAnimation);
  const [isTypingComplete, setIsTypingComplete] = useState(globalHasPlayedLearnAnimation);
  const [displayedMessage, setDisplayedMessage] = useState('');
  const [seniorModalVisible, setSeniorModalVisible] = useState(false);

  // Dynamic MongoDB Quote integration with Zustand Local-First Persistence
  const cachedQuotes = usePlaylistStateStore((s) => s.seniorQuotes);
  const setSeniorQuotes = usePlaylistStateStore((s) => s.setSeniorQuotes);
  const [quotesList, setQuotesList] = useState<any[]>(cachedQuotes || []);

  useEffect(() => {
    if (user?.id === 'guest-user') {
      // Strictly bypass network requests for guest users to remain completely offline
      return;
    }
    const fetchQuotes = async () => {
      try {
        const response = await api.get('/senior-quotes');
        if (response.data?.success && response.data?.data && response.data.data.length > 0) {
          const freshQuotes = response.data.data;
          setSeniorQuotes(freshQuotes);
          setQuotesList(freshQuotes);
        }
      } catch (err) {
        // Safe silent background catch to comply with offline-first guidelines
      }
    };
    fetchQuotes();
  }, [setSeniorQuotes, user?.id]);

  // Selected Quote Selection for Ghost Typing - sequential rotation per user entry
  const [selectedQuote, setSelectedQuote] = useState<any>(null);

  useEffect(() => {
    if (!quotesList || quotesList.length === 0) return;

    const store = usePlaylistStateStore.getState();

    // If we have already selected a quote in this mount, keep it, but reactively
    // update the reference if its author or text has changed in the refreshed list.
    if (selectedQuote) {
      const updatedQuote = quotesList.find((q) => q._id === selectedQuote._id);
      if (updatedQuote && (updatedQuote.author !== selectedQuote.author || updatedQuote.text !== selectedQuote.text)) {
        setSelectedQuote(updatedQuote);
      }
      return;
    }

    let index = store.currentQuoteIndex;

    // Safety bounds check: if out of bounds, reset back to 0th index
    if (index >= quotesList.length || index < 0) {
      index = 0;
      usePlaylistStateStore.setState({ currentQuoteIndex: 0 });
    }

    const quote = quotesList[index];
    setSelectedQuote(quote);

    // Increment index so the next app entry shows the next quote
    store.incrementQuoteIndex(quotesList.length);
  }, [quotesList, selectedQuote]);

  const authorName = selectedQuote?.author || selectedQuote?.name || selectedQuote?.studentName || "Senior Author";

  // Master timeline progress representation (0% to 100%)
  const timelineProgress = useSharedValue(globalHasPlayedLearnAnimation ? 100 : 0);

  // Math-calibrated center offset so the quote is drawn exactly in the vertical center of the screen
  const quoteInitialY = 245;

  const cursorOpacity = useSharedValue(globalHasPlayedLearnAnimation ? 0 : 1);
  const authorOpacity = useSharedValue(globalHasPlayedLearnAnimation ? 1 : 0);

  // ReeW wobbly 3-jump entry animation values
  const reewTranslateX = useSharedValue(globalHasPlayedLearnAnimation ? 0 : 220);
  const reewTranslateY = useSharedValue(0);
  const reewScaleX = useSharedValue(1);
  const reewScaleY = useSharedValue(1);

  const reewEntryStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: reewTranslateX.value },
      { translateY: reewTranslateY.value },
      { scaleX: reewScaleX.value },
      { scaleY: reewScaleY.value },
    ],
  }));

  // Trigger bottom tab bar slide up as soon as typewriter ends/author reveal starts
  useEffect(() => {
    if (phase === 'settled' || phase === 'authorReveal') {
      setHasAppBeenAnimated(true);
    }
    if (phase === 'authorReveal' || phase === 'contentReady' || phase === 'settled') {
      if (phase === 'settled' && !globalHasPlayedLearnAnimation) {
        // Trigger wobbly 3-jump entry sequence for ReeW!
        const jumpDuration = 420;
        const landingPause = 70;
        
        // Jump 1: Translate from 220 to 140
        reewTranslateX.value = withTiming(140, { duration: jumpDuration, easing: Easing.linear });
        reewTranslateY.value = withSequence(
          withTiming(-45, { duration: jumpDuration * 0.5, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: jumpDuration * 0.5, easing: Easing.in(Easing.quad) })
        );
        reewScaleX.value = withSequence(
          withTiming(0.96, { duration: jumpDuration * 0.5 }),
          withTiming(1.04, { duration: jumpDuration * 0.5 }),
          withSpring(1, { damping: 12 })
        );
        reewScaleY.value = withSequence(
          withTiming(1.04, { duration: jumpDuration * 0.5 }),
          withTiming(0.96, { duration: jumpDuration * 0.5 }),
          withSpring(1, { damping: 12 })
        );
 
        // Jump 2: starts after Jump 1 completes
        setTimeout(() => {
          reewTranslateX.value = withTiming(70, { duration: jumpDuration, easing: Easing.linear });
          reewTranslateY.value = withSequence(
            withTiming(-32, { duration: jumpDuration * 0.5, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: jumpDuration * 0.5, easing: Easing.in(Easing.quad) })
          );
          reewScaleX.value = withSequence(
            withTiming(0.97, { duration: jumpDuration * 0.5 }),
            withTiming(1.03, { duration: jumpDuration * 0.5 }),
            withSpring(1, { damping: 12 })
          );
          reewScaleY.value = withSequence(
            withTiming(1.03, { duration: jumpDuration * 0.5 }),
            withTiming(0.97, { duration: jumpDuration * 0.5 }),
            withSpring(1, { damping: 12 })
          );
        }, jumpDuration + landingPause);
 
        // Jump 3: starts after Jump 2 completes
        setTimeout(() => {
          reewTranslateX.value = withTiming(0, { duration: jumpDuration, easing: Easing.linear });
          reewTranslateY.value = withSequence(
            withTiming(-20, { duration: jumpDuration * 0.5, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: jumpDuration * 0.5, easing: Easing.in(Easing.quad) })
          );
          reewScaleX.value = withSequence(
            withTiming(0.98, { duration: jumpDuration * 0.5 }),
            withTiming(1.02, { duration: jumpDuration * 0.5 }),
            withSpring(1, { damping: 14, stiffness: 150 })
          );
          reewScaleY.value = withSequence(
            withTiming(1.02, { duration: jumpDuration * 0.5 }),
            withTiming(0.98, { duration: jumpDuration * 0.5 }),
            withSpring(1, { damping: 14, stiffness: 150 })
          );
        }, (jumpDuration + landingPause) * 2);

        globalHasPlayedLearnAnimation = true;
      }
    }

    if (globalHasPlayedLearnAnimation) {
      setShowAuthor(true);
      authorOpacity.value = 1;
    } else if (phase === 'authorReveal' || phase === 'contentReady') {
      // Handled during authorReveal and contentReady timeline transitions
    } else {
      setShowAuthor(false);
      authorOpacity.value = 0;
    }
  }, [phase]);

  // 1. Initial Soft Entry & Ambient Variable Typing Engine
  useEffect(() => {
    // If quotes are not yet loaded from DB, remain completely quiet, clean, and empty
    if (!selectedQuote || !selectedQuote.text) {
      return;
    }

    // If we have already animated once this session, snap to the finished layout instantly
    if (globalHasPlayedLearnAnimation) {
      setDisplayedMessage(selectedQuote.text);
      setIsTypingComplete(true);
      timelineProgress.value = 100;
      cursorOpacity.value = 0;
      return;
    }

    let isActive = true;
    
    // Reset timeline progress on quote change
    timelineProgress.value = 0;

    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 300 }),
        withTiming(1, { duration: 300 })
      ),
      -1,
      true
    );

    let index = 0;
    setDisplayedMessage('');
    setIsTypingComplete(false);

    let timer: NodeJS.Timeout;

    // Recursive variable typing pace generator for realistic human pacing
    const typeNextChar = () => {
      if (!isActive) return;

      if (index < selectedQuote.text.length) {
        // Type 2 characters at a time to reduce CPU re-render storms during boot
        const nextIdx = Math.min(selectedQuote.text.length, index + 2);
        setDisplayedMessage(selectedQuote.text.substring(0, nextIdx));
        index = nextIdx;
        
        // Calculate typing progress and assign to master timeline (0% to 30%)
        const currentProgress = (index / selectedQuote.text.length) * 30;
        timelineProgress.value = currentProgress;
        
        // Pacing irregularity (timing variation) for natural human typing feel
        const randomDelay = 60 + Math.random() * 20;
        timer = setTimeout(typeNextChar, randomDelay);
      } else {
        timelineProgress.value = 30;
        setIsTypingComplete(true);
      }
    };

    // Soft delay before start typing
    const startDelay = setTimeout(() => {
      if (isActive) typeNextChar();
    }, 0);

    return () => {
      isActive = false;
      clearTimeout(startDelay);
      if (timer) clearTimeout(timer);
    };
  }, [selectedQuote]);

  // 3. State-Driven Loading Check
  useEffect(() => {
    if (phase === 'settled') return;

    if (isTypingComplete) {
      if (globalHasPlayedLearnAnimation) {
        setPhase('settled');
      } else {
        setPhase('authorReveal');
      }
    }
  }, [isTypingComplete]);

  // Intermediate cinematic stage: Reveal author in center immediately after typewriter
  useEffect(() => {
    if (phase === 'authorReveal') {
      setShowAuthor(true);
      authorOpacity.value = withTiming(1, { 
        duration: 400, 
        easing: Easing.out(Easing.ease) 
      });

      const timer = setTimeout(() => {
        setPhase('contentReady');
      }, 500); // 400ms fade-in + 100ms pause for calm breathing room

      return () => clearTimeout(timer);
    }
  }, [phase]);

  // 4. Content Reveal Transition with Premium Easing (Text pulls cards upward)
  useEffect(() => {
    if (phase === 'contentReady') {
      // Luxurious cinematic workspace assembly timeline animation (T = 30 to 100)
      timelineProgress.value = withTiming(100, {
        duration: 1400, // Luxurious 1400ms folder reveal animation
        easing: Easing.bezier(0.25, 1, 0.5, 1), // Soothing easeOutCubic curve
      });

      const timer = setTimeout(() => {
        setPhase('settled');
      }, 2400); // 1400ms (animation ends) + 1000ms (1-second delay) to prevent startup lagging/thread contention

      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Master Orchestrated Reanimated Style Mappings
  const welcomeAnimatedStyle = useAnimatedStyle(() => {
    const startT = 38;
    const rawProgress = (timelineProgress.value - startT) / (100 - startT);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    // Reduced acceleration (Ease-In-Out Quadratic) for a calming, peaceful motion
    const easeProgress = clampedProgress < 0.5 
      ? 2 * clampedProgress * clampedProgress 
      : 1 - Math.pow(-2 * clampedProgress + 2, 2) / 2;

    const opacity = interpolate(
      timelineProgress.value,
      [0, startT, 100],
      [0.15, 0.15, 1.0],
      'clamp'
    );
    const translateY = 15 - 15 * easeProgress;
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const quoteAnimatedStyle = useAnimatedStyle(() => {
    const startT = 38;
    const rawProgress = (timelineProgress.value - startT) / (100 - startT);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    // Reduced acceleration (Ease-In-Out Quadratic) for a calming, peaceful motion
    const easeProgress = clampedProgress < 0.5 
      ? 2 * clampedProgress * clampedProgress 
      : 1 - Math.pow(-2 * clampedProgress + 2, 2) / 2;

    const translateY = quoteInitialY - quoteInitialY * easeProgress;
    return {
      transform: [{ translateY }],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const startT = 38;
    const rawProgress = (timelineProgress.value - startT) / (100 - startT);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    // Reduced acceleration (Ease-In-Out Quadratic) for a calming, peaceful motion
    const easeProgress = clampedProgress < 0.5 
      ? 2 * clampedProgress * clampedProgress 
      : 1 - Math.pow(-2 * clampedProgress + 2, 2) / 2;

    const opacity = interpolate(
      timelineProgress.value,
      [0, startT, 100],
      [0, 0, 1],
      'clamp'
    );
    const translateY = 30 - 30 * easeProgress;
    return {
      opacity,
      transform: [{ translateY }],
    };
  });



  const cursorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  const authorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: authorOpacity.value,
  }));

  const handleRefetchAll = () => {
    refetch();
    refetchStats();
  };

  const openCreate = () => {
    setEditingFolder(null);
    setModalVisible(true);
  };

  const openEdit = (folder: IFolder) => {
    setEditingFolder(folder);
    setModalVisible(true);
  };

  const handleFolderLongPress = (folder: IFolder) => {
    if (!user?.id || !canModifyItem(role, user.id, folder.createdBy)) return;
    Alert.alert(folder.title, 'Choose an action', [
      { text: 'Edit', onPress: () => openEdit(folder) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete folder', 'All cards in this folder will be removed.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteFolder.mutate(folder._id),
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSubmit = (payload: CreateFolderDTO) => {
    if (editingFolder) {
      updateFolder.mutate(
        { folderId: editingFolder._id, updateData: payload },
        {
          onSuccess: () => {
            setModalVisible(false);
            setEditingFolder(null);
          },
        }
      );
    } else {
      createFolder.mutate(payload, {
        onSuccess: () => {
          setModalVisible(false);
          refetch();
        },
      });
    }
  };

  const isGuest = user?.id === 'guest-user';
  const firstName = isGuest ? 'Guest' : (user?.name?.split(' ')[0] || 'there');
  const streak = stats?.streakCount ?? 4;
  const cardsRevised = stats?.totalRevisions ?? 24;

  const weakTopics = useMemo(() => {
    if (preferences.weakTopics && preferences.weakTopics.length > 0) {
      return preferences.weakTopics;
    }
    return ['Dynamic Programming', 'Graphs', 'Trees'];
  }, [preferences.weakTopics]);

  if (!isTransitionReady) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}>
        <View style={{ marginBottom: 36 }}>
          <View style={{ width: 180, height: 32, backgroundColor: '#E2E8F0', borderRadius: 8, marginBottom: 12 }} />
          <View style={{ width: '90%', height: 20, backgroundColor: '#F1F5F9', borderRadius: 6, marginBottom: 6 }} />
          <View style={{ width: '60%', height: 20, backgroundColor: '#F1F5F9', borderRadius: 6 }} />
        </View>
        <FolderCardSkeleton />
        <FolderCardSkeleton />
        <FolderCardSkeleton />
      </View>
    );
  }

  return (
    <ThemeBackground>
      <View style={{ flex: 1, backgroundColor: 'transparent', paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <Animated.View style={[{ flex: 1 }, screenAnimatedStyle]}>
        {/* Main Scrollable Content */}
        <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 24, paddingTop: 24 }}
        refreshControl={
          <RefreshControl 
            refreshing={isRefetching || isStatsRefetching} 
            onRefresh={handleRefetchAll} 
            tintColor="#8B5CF6" 
          />
        }
        scrollEnabled={true}
      >
        {/* Top welcome line and centered quote anchor */}
        <View style={styles.headerBlock}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Animated.Text style={[styles.welcomeText, welcomeAnimatedStyle, { color: palette.textPrimary }]}>
              Welcome back, {firstName}
            </Animated.Text>
            <Animated.View style={reewEntryStyle}>
              <ReeWCharacter state="zen" size={72} />
            </Animated.View>
          </View>
          
          {/* ONE Persistent, continuous Quote block that slides upward with 100% object permanence */}
          {selectedQuote && (
            <Animated.View style={[styles.headerQuoteContainer, quoteAnimatedStyle]}>
              <Text style={[styles.greetingSub, { color: palette.textSecondary }]}>
                {displayedMessage}
                {!isTypingComplete && (
                  <Animated.Text style={[styles.cursor, cursorAnimatedStyle, { color: palette.accent }]}>|</Animated.Text>
                )}
              </Text>
              
              {/* Senior Attribution rendered gently to occupy layout space permanently, avoiding folder layout displacement */}
              <Animated.View 
                style={[
                  styles.headerAuthorContainer, 
                  authorAnimatedStyle
                ]}
                pointerEvents={showAuthor ? 'auto' : 'none'}
              >
                <TouchableOpacity 
                  onPress={() => setSeniorModalVisible(true)} 
                  activeOpacity={0.6}
                >
                  <Text style={[styles.headerAuthorText, { color: palette.accent }]}>— {authorName}</Text>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          )}
          

        </View>

        {/* Section Header Row softly fades and slides upward */}
        <Animated.View style={contentAnimatedStyle}>
          <View style={styles.sectionHeaderRow}>
            <View />
            {canManageContent && (
              <TouchableOpacity 
                onPress={openCreate} 
                style={[
                  styles.addSheetBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  }
                ]}
              >
                <Plus color={palette.textSecondary} size={15} strokeWidth={2.2} />
                <Text style={[styles.addSheetText, { color: palette.textSecondary }]}>New journal</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Render collections list with staggered drag-chain momentum effects directly in ScrollView to avoid parent clipping and fade delays */}
        <View style={styles.collectionsList}>
          {isLoading ? (
            <>
              <FolderCardSkeleton />
              <FolderCardSkeleton />
              <FolderCardSkeleton />
            </>
          ) : (
            folders.map((folder, index) => {
              return (
                <StaggeredCard key={folder._id} index={index} timelineProgress={timelineProgress}>
                  <FolderCard
                    folder={folder}
                    hideCardCount={true}
                    onPress={() =>
                      router.push({
                        pathname: '/(protected)/folder/[folderId]',
                        params: { folderId: folder._id, title: folder.title },
                      })
                    }
                    onLongPress={() => handleFolderLongPress(folder)}
                  />
                </StaggeredCard>
              );
            })
          )}
        </View>
      </ScrollView>

      <FolderFormModal
        visible={modalVisible}
        folder={editingFolder}
        onClose={() => {
          setModalVisible(false);
          setEditingFolder(null);
        }}
        onSubmit={handleSubmit}
        isLoading={createFolder.isPending || updateFolder.isPending}
      />

      {/* 3. Senior Details Glassmorphism Overlay */}
      {seniorModalVisible && selectedQuote && (
        <Animated.View 
          entering={FadeIn.duration(300)} 
          exiting={FadeOut.duration(200)} 
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={[
              styles.modalBackground,
              { backgroundColor: palette.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(15, 23, 42, 0.35)' }
            ]} 
            activeOpacity={1} 
            onPress={() => setSeniorModalVisible(false)} 
          />
          <Animated.View 
            entering={FadeIn.duration(200)} 
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                shadowColor: palette.isDark ? '#000000' : '#0F172A',
              }
            ]}
          >
            {/* Frosted Glass accent top line */}
            <View style={[styles.modalStripe, { backgroundColor: palette.accent }]} />
            
            <View style={styles.modalContent}>
              <Text style={[styles.modalQuote, { color: palette.textSecondary }]}>"{selectedQuote.text}"</Text>
              
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              
              <Text style={[styles.seniorName, { color: palette.textPrimary }]}>{authorName}</Text>
              
              <View style={styles.detailsBlock}>
                {selectedQuote.collegeName ? <Text style={[styles.detailValue, { color: palette.textSecondary }]}>{selectedQuote.collegeName}</Text> : null}
                {selectedQuote.branch ? <Text style={[styles.detailValue, { color: palette.textSecondary }]}>{selectedQuote.branch}</Text> : null}
                {selectedQuote.yearOfGraduation ? <Text style={[styles.detailValue, { color: palette.textSecondary }]}>{selectedQuote.yearOfGraduation}</Text> : null}
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.closeBtn, { backgroundColor: palette.accent }]} 
              onPress={() => setSeniorModalVisible(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
      </Animated.View>
    </View>
  </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F7', // Warm soft cream canvas
  },
  headerBlock: {
    marginBottom: 36, // Increased by 30% for breathing space
  },
  tagWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.10)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  tagText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginLeft: 6,
  },
  welcomeText: {
    color: '#0F172A', // High-contrast title
    fontSize: 30,
    fontWeight: 'bold', // Always bold
    letterSpacing: -0.5,
  },
  greetingSub: {
    color: '#475569', // Soft calming slate gray throughout
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: -0.15,
  },
  section: {
    marginBottom: 48, // Spacing increased by 30% to let cards "rest"
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16, // Breathing room below titles
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: '#475569',
    fontSize: 13,
    marginTop: -8,
    marginBottom: 20,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroPanel: {
    backgroundColor: '#FFFFFF', // Clean White Card
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0', // Light Grey Border
    padding: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 18,
    elevation: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.0,
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
  },
  pillIcon: {
    marginRight: 10,
  },
  metricVal: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  metricLbl: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  masterLauncher: {
    backgroundColor: '#8B5CF6', // The ONE intentional accent color on screen
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  launcherText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridItem: {
    width: (width - 60) / 3,
    marginHorizontal: 6,
    height: 84, // Sleeker and compact height since subtext is removed
    borderRadius: 24,
  },
  gridGlass: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    padding: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 1,
  },
  gridLabel: {
    color: '#475569', // Soft contrast secondary focus text
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  gridSub: {
    color: '#64748B',
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  weakChip: {
    margin: 4,
    borderRadius: 100,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    color: '#475569', // Muted slate gray instead of loud lavender accent
    fontSize: 12,
    fontWeight: '600',
  },
  addSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  addSheetText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  collectionsList: {
    marginTop: 22,
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    marginBottom: 16,
    height: 120,
    justifyContent: 'center',
  },
  skeletonTitle: {
    backgroundColor: '#F1F5F9',
    height: 18,
    borderRadius: 4,
    width: '60%',
    marginBottom: 10,
  },
  skeletonSub: {
    backgroundColor: '#F1F5F9',
    height: 12,
    borderRadius: 3,
    width: '40%',
    marginBottom: 16,
  },
  skeletonBar: {
    backgroundColor: '#F1F5F9',
    height: 8,
    borderRadius: 2,
    width: '100%',
  },
  // Refined Cinematic Ghost Loading Experience
  cursor: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '300',
  },
  // ONE Persistent, continuous Quote block that slides upward with 100% object permanence
  headerQuoteContainer: {
    marginTop: 8,
    position: 'relative',
    maxWidth: 600,
  },
  headerAuthorContainer: {
    alignSelf: 'flex-end',
    marginTop: 6,
  },
  headerAuthorText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)', // Sleek dark overlay
  },
  modalCard: {
    width: width * 0.85,
    maxWidth: 420,
    backgroundColor: '#FAF9F7',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 10,
    overflow: 'hidden',
  },
  modalStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#8B5CF6',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 6,
  },
  modalContent: {
    marginBottom: 24,
  },
  modalQuote: {
    color: '#475569',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    marginBottom: 16,
  },
  seniorName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  detailsBlock: {
    gap: 4,
  },
  detailValue: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
