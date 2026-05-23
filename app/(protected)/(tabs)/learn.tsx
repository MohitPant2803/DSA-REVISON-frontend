import React, { useState, useMemo } from 'react';
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

const { width } = Dimensions.get('window');

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

  // Retrieve selected weak topics dynamically from onboarding store
  const weakTopics = useMemo(() => {
    if (preferences.weakTopics && preferences.weakTopics.length > 0) {
      return preferences.weakTopics;
    }
    return ['Dynamic Programming', 'Graphs', 'Trees']; // Fallback seeding
  }, [preferences.weakTopics]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1 px-6 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching || isStatsRefetching} onRefresh={handleRefetchAll} tintColor="#8B5CF6" />
        }
      >
        
        {/* Futuristic Dashboard Header */}
        <CinematicFadeIn delay={100} style={styles.headerBlock}>
          <View style={styles.tagWrapper}>
            <Sparkles color="#8B5CF6" size={13} />
            <Text style={styles.tagText}>REVISION OPERATING SYSTEM</Text>
          </View>
          <Text style={styles.welcomeText}>Welcome back, {firstName}</Text>
          <Text style={styles.greetingSub}>AI personalization engine is synchronized.</Text>
        </CinematicFadeIn>

        {/* 1. HERO COMPONENT: Today's Momentum */}
        <CinematicFadeIn delay={250} style={styles.section}>
          <GlassPanel style={styles.heroPanel} intensity={18} tint="dark">
            <View style={styles.heroHeader}>
              <Activity color="#8B5CF6" size={16} />
              <Text style={styles.heroTitle}>TODAY'S HABIT MOMENTUM</Text>
            </View>

            <View style={styles.metricsRow}>
              {/* Streak Pill */}
              <View style={styles.metricPill}>
                <Flame color="#EF4444" size={24} style={styles.pillIcon} />
                <View>
                  <Text style={styles.metricVal}>{streak} Days</Text>
                  <Text style={styles.metricLbl}>Active Streak</Text>
                </View>
              </View>

              {/* Count Pill */}
              <View style={styles.metricPill}>
                <Brain color="#10B981" size={24} style={styles.pillIcon} />
                <View>
                  <Text style={styles.metricVal}>{cardsRevised} Cards</Text>
                  <Text style={styles.metricLbl}>Revised Total</Text>
                </View>
              </View>
            </View>

            {/* Glowing Master Launcher Pressable */}
            <SuperchargedPressable
              onPress={() => router.push('/(protected)/(tabs)/reels')}
              activeScale={0.96}
              style={styles.masterLauncher}
            >
              <Text style={styles.launcherText}>Start Active Recall Feed</Text>
              <ArrowRight color="#FFFFFF" size={16} strokeWidth={2} />
            </SuperchargedPressable>
          </GlassPanel>
        </CinematicFadeIn>

        {/* 2. DYNAMIC OS COMPILER QUICK ACTION GRID */}
        <CinematicFadeIn delay={350} style={styles.section}>
          <Text style={styles.sectionTitle}>Compilers & Playbacks</Text>
          <View style={styles.grid}>
            
            {/* Grid 1: Continue Revision */}
            <SuperchargedPressable
              onPress={() => router.push('/(protected)/(tabs)/reels')}
              style={styles.gridItem}
            >
              <GlassPanel style={styles.gridGlass} intensity={14} tint="dark">
                <Clock color="#8B5CF6" size={20} />
                <Text style={styles.gridLabel}>Continue Revision</Text>
                <Text style={styles.gridSub}>Resume last session</Text>
              </GlassPanel>
            </SuperchargedPressable>

            {/* Grid 2: Explain to GPT */}
            <SuperchargedPressable
              onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { shuffle: 'true' } })}
              style={styles.gridItem}
            >
              <GlassPanel style={styles.gridGlass} intensity={14} tint="dark">
                <Brain color="#6366F1" size={20} />
                <Text style={styles.gridLabel}>Explain to GPT</Text>
                <Text style={styles.gridSub}>Speech AI comparisons</Text>
              </GlassPanel>
            </SuperchargedPressable>

            {/* Grid 3: Hard Problems */}
            <SuperchargedPressable
              onPress={() => router.push({ pathname: '/(protected)/(tabs)/reels', params: { difficultyStates: 'hard' } })}
              style={styles.gridItem}
            >
              <GlassPanel style={styles.gridGlass} intensity={14} tint="dark">
                <Skull color="#EF4444" size={20} />
                <Text style={styles.gridLabel}>Hard Problems</Text>
                <Text style={styles.gridSub}>Target weak scheduled cards</Text>
              </GlassPanel>
            </SuperchargedPressable>
          </View>
        </CinematicFadeIn>

        {/* 3. ALGORITHMIC PAIN POINTS (Seed parameters visualizer) */}
        <CinematicFadeIn delay={450} style={styles.section}>
          <Text style={styles.sectionTitle}>Active Seeding Pain Points</Text>
          <Text style={styles.sectionSubtitle}>These topics are weighted 40% more frequently in active recall loops.</Text>
          <View style={styles.chipRow}>
            {weakTopics.map((topic, idx) => (
              <GlassPanel key={topic} style={styles.weakChipGlass} intensity={12} tint="dark">
                <View style={styles.chipContent}>
                  <Zap color="#8B5CF6" size={13} />
                  <Text style={styles.chipText}>{topic}</Text>
                </View>
              </GlassPanel>
            ))}
          </View>
        </CinematicFadeIn>

        {/* 4. REVISION COLLECTIONS (Sheets) */}
        <CinematicFadeIn delay={550} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Revision Sheets</Text>
            {canManageContent && (
              <TouchableOpacity onPress={openCreate} style={styles.addSheetBtn}>
                <Plus color="#8B5CF6" size={16} />
                <Text style={styles.addSheetText}>New Sheet</Text>
              </TouchableOpacity>
            )}
          </View>

          <SearchFilterBar search={search} onSearchChange={setSearch} placeholder="Search revision sheets..." />

          {/* Render collections grid list */}
          <View style={styles.collectionsList}>
            {folders.map((folder) => {
              const completedLoops = folderLoopsData?.find((f: any) => f.folderId === folder._id)?.completedLoops || 0;
              return (
                <FolderCard
                  key={folder._id}
                  folder={folder}
                  completedLoops={completedLoops}
                  onPress={() =>
                    router.push({
                      pathname: '/(protected)/folder/[folderId]',
                      params: { folderId: folder._id, title: folder.title },
                    })
                  }
                  onLongPress={() => handleFolderLongPress(folder)}
                />
              );
            })}
          </View>
        </CinematicFadeIn>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19', // Dark premium spatial operating system canvas
  },
  headerBlock: {
    marginBottom: 28,
  },
  tagWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
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
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: 'normal',
    letterSpacing: -0.5,
  },
  greetingSub: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'normal',
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 13,
    marginTop: -8,
    marginBottom: 16,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroPanel: {
    padding: 24,
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
    marginLeft: 8,
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
    marginRight: 12,
  },
  metricVal: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
  },
  metricLbl: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 1,
  },
  masterLauncher: {
    backgroundColor: '#8B5CF6',
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  launcherText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
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
    height: 105,
    borderRadius: 22,
  },
  gridGlass: {
    padding: 14,
    height: '100%',
    justifyContent: 'space-between',
  },
  gridLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
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
  weakChipGlass: {
    margin: 4,
    borderRadius: 16,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  addSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  addSheetText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  collectionsList: {
    marginTop: 16,
  },
});
