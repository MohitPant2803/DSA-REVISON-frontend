import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  RefreshControl,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
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
import { useRouter } from 'expo-router';
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
import { useFolderLoops } from '@/services/useUserProgress';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePlaylists } from '@/hooks/usePlaylists';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useBiometricReauth } from '@/hooks/useBiometricReauth';
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

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
let globalHasPlayedLearnAnimation = false;
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
    <Animated.View style={[styles.skeletonCard, skeletonStyle]}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonSub} />
      <View style={styles.skeletonBar} />
    </Animated.View>
  );
};

export default function LearnScreen() {
  useAppBackHandler();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isSessionExpired } = useAuthStore();
  const { triggerBiometricReauth } = useBiometricReauth();
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
  const { data: folderLoopsData } = useFolderLoops();

  const folders = useMemo(() => data?.results ?? [], [data]);

  // Explicit cinematic loading phases
  const [phase, setPhase] = useState<'typing' | 'authorReveal' | 'waitingForContent' | 'contentReady' | 'timeoutWarning' | 'settled'>(globalHasPlayedLearnAnimation ? 'settled' : 'typing');
  const [showAuthor, setShowAuthor] = useState(globalHasPlayedLearnAnimation);
  const [isTypingComplete, setIsTypingComplete] = useState(globalHasPlayedLearnAnimation);
  const [isWarningStarted, setIsWarningStarted] = useState(false);
  const [displayedMessage, setDisplayedMessage] = useState('');
  const [seniorModalVisible, setSeniorModalVisible] = useState(false);

  // Dynamic MongoDB Quote integration
  const [quotesList, setQuotesList] = useState<any[]>(globalQuotesList);

  useEffect(() => {
    const fetchQuotes = async () => {
      if (globalQuotesList.length > 0) return; // Retrieve from cached global to prevent blank flashes
      try {
        // Prepend is omitted because api baseURL already concludes with /api
        const response = await api.get('/senior-quotes');
        if (response.data?.success && response.data?.data && response.data.data.length > 0) {
          globalQuotesList = response.data.data;
          setQuotesList(globalQuotesList);
        }
      } catch (err) {
        console.warn('Failed to fetch senior quotes from DB:', err);
      }
    };
    fetchQuotes();
  }, []);

  // Selected Quote Selection for Ghost Typing - deterministically shifts to the next quote every 12 hours (at 12:00 AM and 12:00 PM)
  const selectedQuote = useMemo(() => {
    if (!quotesList || quotesList.length === 0) {
      return {
        text: "",
        author: "",
        collegeName: "",
        branch: "",
        yearOfGraduation: 2026
      };
    }
    const twelveHourIntervals = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
    return quotesList[twelveHourIntervals % quotesList.length];
  }, [quotesList]);

  const authorName = selectedQuote?.author || selectedQuote?.name || selectedQuote?.studentName || "Senior Author";

  // Master timeline progress representation (0% to 100%)
  const timelineProgress = useSharedValue(globalHasPlayedLearnAnimation ? 100 : 0);

  // Math-calibrated center offset so the quote is drawn exactly in the vertical center of the screen
  const quoteInitialY = 245;

  const cursorOpacity = useSharedValue(globalHasPlayedLearnAnimation ? 0 : 1);
  const authorOpacity = useSharedValue(globalHasPlayedLearnAnimation ? 1 : 0);

  // Reveal senior author gently exactly 0.5s after animations settle
  useEffect(() => {
    if (phase === 'settled') {
      setHasAppBeenAnimated(true);
      if (!globalHasPlayedLearnAnimation) {
        globalHasPlayedLearnAnimation = true;
      }
    } else if (globalHasPlayedLearnAnimation) {
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
      setDisplayedMessage('');
      setIsTypingComplete(globalHasPlayedLearnAnimation);
      timelineProgress.value = globalHasPlayedLearnAnimation ? 100 : 0;
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
        withTiming(0, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1,
      true
    );

    let index = 0;
    setDisplayedMessage('');
    setIsTypingComplete(false);
    setIsWarningStarted(false);

    let timer: NodeJS.Timeout;

    // Recursive variable typing pace generator for realistic human pacing
    const typeNextChar = () => {
      if (!isActive) return;

      if (index < selectedQuote.text.length) {
        setDisplayedMessage(selectedQuote.text.substring(0, index + 1));
        index++;
        
        // Calculate typing progress and assign to master timeline (0% to 30%)
        const currentProgress = (index / selectedQuote.text.length) * 30;
        timelineProgress.value = currentProgress;
        
        // Pacing irregularity (timing variation) between 25ms and 55ms
        const randomDelay = 25 + Math.random() * 30;
        timer = setTimeout(typeNextChar, randomDelay);
      } else {
        timelineProgress.value = 30;
        setIsTypingComplete(true);
      }
    };

    // Soft delay before start typing
    const startDelay = setTimeout(() => {
      if (isActive) typeNextChar();
    }, 400);

    return () => {
      isActive = false;
      clearTimeout(startDelay);
      if (timer) clearTimeout(timer);
    };
  }, [selectedQuote]);

  // 2. Continuous Typewriter Timeout Warning with Natural Pause
  useEffect(() => {
    let isActive = true;
    let timer: NodeJS.Timeout;
    
    if (phase === 'timeoutWarning' && isTypingComplete && !isWarningStarted) {
      setIsWarningStarted(true);
      
      // Natural, patient 1-second pause to imply system waiting calmly
      timer = setTimeout(() => {
        if (!isActive) return;
        
        const warningText = "  Check your internet connection. Still trying to prepare your workspace...";
        let index = 0;
        
        const typeWarningChar = () => {
          if (!isActive) return;
          
          if (index < warningText.length) {
            setDisplayedMessage(selectedQuote.text + warningText.substring(0, index + 1));
            index++;
            // Dynamic variable pacing for error flow
            const randomDelay = 30 + Math.random() * 35;
            timer = setTimeout(typeWarningChar, randomDelay);
          }
        };
        
        typeWarningChar();
      }, 1000);
    }

    return () => {
      isActive = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, isTypingComplete, isWarningStarted]);

  // 3. State-Driven Loading Check
  const isDataReady = !isLoading && data !== undefined;

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
        duration: 800, 
        easing: Easing.out(Easing.ease) 
      });

      const timer = setTimeout(() => {
        if (isDataReady) {
          setPhase('contentReady');
        } else {
          setPhase('waitingForContent');
        }
      }, 1100); // 800ms fade-in + 300ms pause for calm breathing room

      return () => clearTimeout(timer);
    }
  }, [phase, isDataReady]);

  useEffect(() => {
    if ((phase === 'waitingForContent' || phase === 'timeoutWarning') && isDataReady) {
      setPhase('contentReady');
    }
  }, [isDataReady, phase]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (phase === 'waitingForContent') {
      timer = setTimeout(() => {
        setPhase('timeoutWarning');
      }, 10000); // 10-second network fallback
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  // 4. Content Reveal Transition with Premium Easing (Text pulls cards upward)
  useEffect(() => {
    if (phase === 'contentReady') {
      // Luxurious cinematic workspace assembly timeline animation (T = 30 to 100)
      timelineProgress.value = withTiming(100, {
        duration: 2500, // Reduced pace for a smoother, calmer meditative motion
        easing: Easing.bezier(0.25, 1, 0.5, 1), // Soothing easeOutCubic curve
      });

      const timer = setTimeout(() => {
        setPhase('settled');
      }, 2500);

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

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
            <Animated.Text style={[styles.welcomeText, welcomeAnimatedStyle]}>
              Welcome back, {firstName}
            </Animated.Text>
            
            {/* Elegant inline sync status indicator dot */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(148, 163, 184, 0.05)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 }}>
              <View 
                style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: 4, 
                  backgroundColor: 
                    syncStatus === 'synced' ? theme.colors.status.success :
                    syncStatus === 'syncing' ? theme.colors.status.info :
                    theme.colors.status.warning,
                }} 
              />
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>
                {syncStatus === 'synced' ? 'Synced' :
                 syncStatus === 'syncing' ? 'Syncing...' :
                 'Offline'}
              </Text>
            </View>
          </View>
          
          {/* ONE Persistent, continuous Quote block that slides upward with 100% object permanence */}
          <Animated.View style={[styles.headerQuoteContainer, quoteAnimatedStyle]}>
            <Text style={styles.greetingSub}>
              {displayedMessage}
              {(!isTypingComplete || (phase === 'timeoutWarning' && displayedMessage.length < (selectedQuote.text.length + 72))) && (
                <Animated.Text style={[styles.cursor, cursorAnimatedStyle]}>|</Animated.Text>
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
                <Text style={styles.headerAuthorText}>— {authorName}</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
          
          {/* Soft Session Expired warning banner */}
          {isSessionExpired && (
            <Animated.View 
              entering={FadeInUp.duration(400)}
              exiting={FadeOut.duration(300)}
              style={{
                backgroundColor: '#FEF3C7',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#FCD34D',
                padding: 16,
                marginTop: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#78350F' }}>
                  Sync Suspended
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#92400E', marginTop: 2 }}>
                  Your session expired. Verify your identity to resume progress backup.
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  const success = await triggerBiometricReauth();
                  if (!success) {
                    Alert.alert('Authentication Required', 'Please sign in to continue.', [
                      { text: 'Sign In', onPress: async () => {
                          const { logout } = useAuthStore.getState();
                          await logout();
                          router.replace('/(auth)/login');
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]);
                  }
                }}
                style={{
                  backgroundColor: '#78350F',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                  Unlock
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* Section Header Row softly fades and slides upward */}
        <Animated.View style={contentAnimatedStyle}>
          <View style={styles.sectionHeaderRow}>
            <View />
            {canManageContent && (
              <TouchableOpacity onPress={openCreate} style={styles.addSheetBtn}>
                <Plus color="#64748B" size={15} strokeWidth={2.2} />
                <Text style={styles.addSheetText}>New journal</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Render collections list with staggered drag-chain momentum effects directly in ScrollView to avoid parent clipping and fade delays */}
        <View style={styles.collectionsList}>
          {isLoading || phase === 'waitingForContent' ? (
            <>
              <FolderCardSkeleton />
              <FolderCardSkeleton />
              <FolderCardSkeleton />
            </>
          ) : (
            folders.map((folder, index) => {
              const completedLoops = folderLoopsData?.find((f: any) => f.folderId === folder._id)?.completedLoops || 0;
              return (
                <StaggeredCard key={folder._id} index={index} timelineProgress={timelineProgress}>
                  <FolderCard
                    folder={folder}
                    completedLoops={completedLoops}
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
      {seniorModalVisible && (
        <Animated.View 
          entering={FadeIn.duration(300)} 
          exiting={FadeOut.duration(200)} 
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalBackground} 
            activeOpacity={1} 
            onPress={() => setSeniorModalVisible(false)} 
          />
          <Animated.View 
            entering={FadeIn.duration(200)} 
            style={styles.modalCard}
          >
            {/* Frosted Glass accent top line */}
            <View style={styles.modalStripe} />
            
            <View style={styles.modalContent}>
              <Text style={styles.modalQuote}>"{selectedQuote.text}"</Text>
              
              <View style={styles.divider} />
              
              <Text style={styles.seniorName}>{authorName}</Text>
              
              <View style={styles.detailsBlock}>
                <Text style={styles.detailValue}>{selectedQuote.collegeName}</Text>
                <Text style={styles.detailValue}>{selectedQuote.branch}</Text>
                <Text style={styles.detailValue}>{selectedQuote.yearOfGraduation}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => setSeniorModalVisible(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F7', // Warm off-white canvas
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
    color: '#000000', // Always pure black
    fontSize: 30,
    fontWeight: 'bold', // Always bold
    letterSpacing: -0.5,
  },
  greetingSub: {
    color: '#64748B', // Soft calming slate gray throughout
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
    color: '#64748B',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.10)',
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
    color: '#94A3B8',
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
    borderColor: 'rgba(148, 163, 184, 0.10)',
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
    color: '#64748B', // Soft contrast secondary focus text
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
    borderColor: 'rgba(148, 163, 184, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.015,
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
    color: '#64748B', // Muted slate gray instead of loud lavender accent
    fontSize: 12,
    fontWeight: '600',
  },
  addSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.015,
    shadowRadius: 8,
    elevation: 1,
  },
  addSheetText: {
    color: '#64748B',
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
    borderColor: 'rgba(148, 163, 184, 0.1)',
    padding: 24,
    marginBottom: 16,
    height: 120,
    justifyContent: 'center',
  },
  skeletonTitle: {
    backgroundColor: '#E2E8F0',
    height: 18,
    borderRadius: 4,
    width: '60%',
    marginBottom: 10,
  },
  skeletonSub: {
    backgroundColor: '#E2E8F0',
    height: 12,
    borderRadius: 3,
    width: '40%',
    marginBottom: 16,
  },
  skeletonBar: {
    backgroundColor: '#E2E8F0',
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
