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
        className="flex-1 px-6 pt-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching || isStatsRefetching} onRefresh={handleRefetchAll} tintColor="#8B5CF6" />
        }
      >
        
        {/* Calm Tactile Header */}
        <CinematicFadeIn delay={100} style={styles.headerBlock}>
          <Text style={styles.welcomeText}>Welcome back, {firstName}</Text>
          <Text style={styles.greetingSub}>A quiet space to notice patterns — no rush, no rankings.</Text>
        </CinematicFadeIn>





        {/* 4. REVISION JOURNALS */}
        <CinematicFadeIn delay={550} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View />
            {canManageContent && (
              <TouchableOpacity onPress={openCreate} style={styles.addSheetBtn}>
                <Plus color="#64748B" size={15} strokeWidth={2.2} />
                <Text style={styles.addSheetText}>New journal</Text>
              </TouchableOpacity>
            )}
          </View>

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
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  greetingSub: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 20,
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
    marginTop: 16,
  },
});
