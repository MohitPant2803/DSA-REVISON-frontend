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
import { SafeAreaView } from 'react-native-safe-area-context';
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

const SAMPLE_QUOTES = [
  {
    text: "DSA is not a sprint, it's a marathon. Focus on pattern matching over rote memorization.",
    author: "Abhinav Sharma",
    collegeName: "IIT Delhi",
    branch: "Computer Science",
    yearOfGraduation: 2024
  },
  {
    text: "Notice how problems are built. Dynamic Programming is just subproblem sorting. Stay consistent!",
    author: "Riya Patel",
    collegeName: "NSUT",
    branch: "Information Technology",
    yearOfGraduation: 2023
  },
  {
    text: "Don't count the problems you solve; make the problems you solve count. Solve 150 high-quality ones deeply.",
    author: "Mohit Pant",
    collegeName: "DTU",
    branch: "Electronics & Communication",
    yearOfGraduation: 2025
  },
  {
    text: "The silent hours you spend understanding the graph traversal will pay off when you least expect it.",
    author: "Sneha Reddy",
    collegeName: "BITS Pilani",
    branch: "Computer Science",
    yearOfGraduation: 2024
  },
  {
    text: "Calm minds learn faster. When you get stuck, step away, breathe, and look at the recursion tree.",
    author: "Vikram Malhotra",
    collegeName: "IIIT Hyderabad",
    branch: "Computer Science",
    yearOfGraduation: 2023
  }
];

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
    // Card 0 starts at 38, Card 1 at 43, Card 2 at 48... Capped at 65% to prevent cards being lost at bottom!
    const startT = Math.min(65, 38 + index * 5);

    // Reduced starting distance to slow down visual velocity (380 + index * 60)
    const startY = 380 + index * 60;
    const settleY = 0;

    // Direct linear eased interpolation to prevent any blinking, adjustments, or shifts
    const translateY = interpolate(
      timelineProgress.value,
      [startT, 100],
      [startY, settleY],
      'clamp'
    );

    const opacity = interpolate(
      timelineProgress.value,
      [startT, startT + 10],
      [0, 1],
      'clamp'
    );

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
};

export default function LearnScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { user } = useAuthStore();
  const { preferences } = useOnboardingStore();
  const { canManageContent, role } = useRole();

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
  const [phase, setPhase] = useState<'typing' | 'waitingForContent' | 'contentReady' | 'timeoutWarning' | 'settled'>('typing');
  const [showAuthor, setShowAuthor] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [isWarningStarted, setIsWarningStarted] = useState(false);
  const [displayedMessage, setDisplayedMessage] = useState('');
  const [seniorModalVisible, setSeniorModalVisible] = useState(false);

  // Dynamic MongoDB Quote integration with client-side fallbacks
  const [quotesList, setQuotesList] = useState<any[]>(SAMPLE_QUOTES);

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        // Prepend is omitted because api baseURL already concludes with /api
        const response = await api.get('/senior-quotes');
        if (response.data?.success && response.data?.data && response.data.data.length > 0) {
          setQuotesList(response.data.data);
        }
      } catch (err) {
        console.warn('Failed to fetch senior quotes from DB:', err);
      }
    };
    fetchQuotes();
  }, []);

  // Selected Quote Selection for Ghost Typing - deterministically shifts to the next quote every 12 hours (at 12:00 AM and 12:00 PM)
  const selectedQuote = useMemo(() => {
    const twelveHourIntervals = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
    return quotesList[twelveHourIntervals % quotesList.length];
  }, [quotesList]);

  // Master timeline progress representation (0% to 100%)
  const timelineProgress = useSharedValue(0);

  // Math-calibrated center offset so the quote is drawn exactly in the vertical center of the screen
  const quoteInitialY = 245;

  const cursorOpacity = useSharedValue(1);
  const authorOpacity = useSharedValue(0);

  // Reveal senior author gently exactly 0.5s after animations settle
  useEffect(() => {
    if (phase === 'settled') {
      const t = setTimeout(() => {
        setShowAuthor(true);
        authorOpacity.value = withTiming(1, { duration: 2500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      }, 500);
      return () => clearTimeout(t);
    } else {
      setShowAuthor(false);
      authorOpacity.value = 0;
    }
  }, [phase]);

  // 1. Initial Soft Entry & Ambient Variable Typing Engine
  useEffect(() => {
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
      if (index < selectedQuote.text.length) {
        setDisplayedMessage((prev) => prev + selectedQuote.text.charAt(index));
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
      typeNextChar();
    }, 400);

    return () => {
      clearTimeout(startDelay);
      if (timer) clearTimeout(timer);
    };
  }, [selectedQuote]);

  // 2. Continuous Typewriter Timeout Warning with Natural Pause
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (phase === 'timeoutWarning' && isTypingComplete && !isWarningStarted) {
      setIsWarningStarted(true);
      
      // Natural, patient 1-second pause to imply system waiting calmly
      timer = setTimeout(() => {
        const warningText = "  Check your internet connection. Still trying to prepare your workspace...";
        let index = 0;
        
        const typeWarningChar = () => {
          if (index < warningText.length) {
            setDisplayedMessage((prev) => prev + warningText.charAt(index));
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
      if (timer) clearTimeout(timer);
    };
  }, [phase, isTypingComplete, isWarningStarted]);

  // 3. State-Driven Loading Check
  const isDataReady = !isLoading && data !== undefined;

  useEffect(() => {
    if (phase === 'settled') return;

    if (isTypingComplete) {
      if (isDataReady) {
        setPhase('contentReady');
      } else {
        setPhase('waitingForContent');
      }
    }
  }, [isTypingComplete, isDataReady, phase]);

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
        duration: 1800, // 1800ms of smooth meditative motion
        easing: Easing.bezier(0.25, 1, 0.5, 1), // Soothing easeOutCubic curve
      });

      const timer = setTimeout(() => {
        setPhase('settled');
      }, 1800);

      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Master Orchestrated Reanimated Style Mappings
  const welcomeAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      timelineProgress.value,
      [0, 60, 100],
      [0.15, 0.15, 1.0],
      'clamp'
    );
    const translateY = interpolate(
      timelineProgress.value,
      [0, 60, 100],
      [15, 15, 0],
      'clamp'
    );
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const quoteAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      timelineProgress.value,
      [0, 60, 100],
      [quoteInitialY, quoteInitialY, 0],
      'clamp'
    );
    return {
      transform: [{ translateY }],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      timelineProgress.value,
      [60, 100],
      [0, 1],
      'clamp'
    );
    const translateY = interpolate(
      timelineProgress.value,
      [60, 100],
      [30, 0],
      'clamp'
    );
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Main Scrollable Content */}
      <ScrollView
        className="flex-1 px-6 pt-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={
          <RefreshControl 
            refreshing={isRefetching || isStatsRefetching} 
            onRefresh={handleRefetchAll} 
            tintColor="#8B5CF6" 
            enabled={phase === 'settled'} // Always mounted, only enabled when settled to completely remove ScrollView recreations/flickers
          />
        }
        scrollEnabled={phase === 'settled'}
      >
        {/* Top welcome line and centered quote anchor */}
        <View style={styles.headerBlock}>
          <Animated.Text style={[styles.welcomeText, welcomeAnimatedStyle]}>
            Welcome back, {firstName}
          </Animated.Text>
          
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
                <Text style={styles.headerAuthorText}>— {selectedQuote.author}</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
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
          {folders.map((folder, index) => {
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
          })}
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
              
              <Text style={styles.seniorName}>{selectedQuote.author}</Text>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailValue}>{selectedQuote.collegeName}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailValue}>{selectedQuote.branch}</Text>
              </View>
              
              <View style={styles.detailRow}>
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
    </SafeAreaView>
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.06)',
  },
  detailLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
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
