import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Plus,
  ArrowRight,
  ChevronRight,
  ListMusic,
  Heart,
  Clock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
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
import { SpringPressable } from '@/components/SpringPressable';

const SURFACE = 'rgba(255,255,255,0.82)';

export default function LearnScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { user } = useAuthStore();
  const { canManageContent, role } = useRole();

  const { data: stats, refetch: refetchStats } = useDashboard();
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

  return (
    <SafeAreaView className="flex-1 bg-[#F8FAFC]" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1 px-5 pt-3 bg-[#F8FAFC]"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefetchAll} tintColor="#8B5CF6" />
        }
      >
        <Text className="text-[#94A3B8] text-[13px] mb-10">
          Good to see you, {firstName}
        </Text>

        {/* 1. Continue Learning */}
        {stats && (
          <View className="mb-12">
            <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight mb-4">
              Continue Learning
            </Text>
            <View
              className="rounded-[28px] border border-slate-100/60 p-7"
              style={{ backgroundColor: SURFACE }}
            >
              <Text className="text-[#64748B] text-[15px] leading-relaxed mb-1">
                {stats.streakCount > 0 ? `${stats.streakCount} day streak · ` : ''}
                {stats.totalRevisions} cards revised
              </Text>
              <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight mb-6">
                Pick up where you left off
              </Text>
              <SpringPressable
                onPress={() => router.push('/(protected)/(tabs)/reels')}
                className="flex-row items-center self-start rounded-full px-6 py-3.5 active:opacity-90"
                style={{ backgroundColor: '#8B5CF6' }}
              >
                <Text className="text-white font-normal text-[15px] mr-1.5">Resume</Text>
                <ArrowRight size={15} color="#ffffff" strokeWidth={2} />
              </SpringPressable>
            </View>
          </View>
        )}

        {/* 2. Popular Sheets */}
        <View className="mb-12">
          <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight mb-4">
            Popular Sheets
          </Text>

          <SearchFilterBar search={search} onSearchChange={setSearch} placeholder="Search sheets..." />

          {canManageContent && (
            <SpringPressable
              onPress={openCreate}
              className="flex-row items-center justify-center rounded-[22px] py-3.5 mb-5 border border-slate-100 active:opacity-90"
              style={{ backgroundColor: SURFACE }}
            >
              <Plus color="#8B5CF6" size={16} strokeWidth={2} />
              <Text className="text-[#64748B] font-normal text-[15px] ml-2">New sheet</Text>
            </SpringPressable>
          )}

          {isLoading && (
            <View className="mb-4">
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  className="rounded-[22px] p-5 border border-slate-100 mb-3 flex-row items-center h-[72px]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
                >
                  <View className="w-11 h-11 rounded-2xl mr-4 bg-slate-100" />
                  <View className="flex-1">
                    <View className="h-3.5 w-28 bg-slate-100 rounded-full mb-2" />
                    <View className="h-3 w-36 bg-slate-100 rounded-full" />
                  </View>
                </View>
              ))}
            </View>
          )}

          {isError && (
            <View
              className="rounded-[22px] p-6 border border-red-100 mb-4"
              style={{ backgroundColor: SURFACE }}
            >
              <Text className="text-red-600 font-normal mb-2">Could not load sheets</Text>
              <Text className="text-[#64748B] text-[15px] mb-4">{error?.message}</Text>
              <SpringPressable onPress={() => refetch()} className="bg-slate-50 rounded-full py-3">
                <Text className="text-slate-600 text-center font-normal">Try again</Text>
              </SpringPressable>
            </View>
          )}

          {!isLoading && !isError && folders.length === 0 && (
            <View
              className="rounded-[22px] p-6 border border-slate-100 items-center"
              style={{ backgroundColor: SURFACE }}
            >
              <Text className="text-[#0F172A] font-normal text-base mb-2 text-center">
                No sheets yet
              </Text>
              <Text className="text-[#64748B] text-center text-[15px] leading-relaxed max-w-[260px]">
                {search
                  ? 'Try a different search.'
                  : canManageContent
                    ? 'Create your first revision collection.'
                    : 'Collections will appear here soon.'}
              </Text>
            </View>
          )}

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

        {/* 3. My Space */}
        {playlists.length > 0 && (
          <View className="mb-12">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight">My Space</Text>
              <TouchableOpacity onPress={() => router.push('/(protected)/(tabs)/personal')}>
                <Text className="text-[#8B5CF6] text-[15px] font-normal">See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {playlists.slice(0, 6).map((pl) => {
                const loops = pl.completedLoops || 0;
                const isLikes = pl.id === 'likes';
                const isWatchLater = pl.id === 'watch-later';
                return (
                  <TouchableOpacity
                    key={pl.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      setActivePlaylistId(pl.id);
                      router.push('/(protected)/(tabs)/reels');
                    }}
                    className="p-5 rounded-[24px] w-[152px] border border-slate-100/60"
                    style={{ backgroundColor: SURFACE }}
                  >
                    {isLikes ? (
                      <Heart color="#f43f5e" fill="#f43f5e" size={17} strokeWidth={1.75} />
                    ) : isWatchLater ? (
                      <Clock color="#3b82f6" size={17} strokeWidth={1.75} />
                    ) : (
                      <ListMusic color={pl.color1} size={17} strokeWidth={1.75} />
                    )}
                    <View className="flex-row items-center mt-4 mb-0.5">
                      <Text className="text-[#0F172A] font-normal text-[15px] flex-1" numberOfLines={2}>
                        {pl.name}
                      </Text>
                      {loops > 0 && (
                        <View className="bg-violet-100 px-1.5 py-0.5 rounded-full ml-1">
                          <Text className="text-violet-600 text-[8px] font-bold">x{loops}</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-[#94A3B8] text-[13px]">{pl.itemCount} cards</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 4. Recent Revision */}
        {stats?.recentlyRevised && stats.recentlyRevised.length > 0 && (
          <View className="mb-8">
            <Text className="text-[#0F172A] text-[22px] font-normal tracking-tight mb-4">
              Recent Revision
            </Text>
            {stats.recentlyRevised.slice(0, 3).map((entry) => {
              if (!entry?.card?.title) return null;
              return (
              <TouchableOpacity
                key={entry.progressId}
                activeOpacity={0.9}
                onPress={() =>
                  router.push({
                    pathname: '/(protected)/(tabs)/reels',
                    params: { search: entry.card.title },
                  })
                }
                className="flex-row items-center justify-between p-5 mb-2.5 rounded-[22px] border border-slate-100/60"
                style={{ backgroundColor: SURFACE }}
              >
                <View className="flex-1 pr-4">
                  <Text className="text-[#94A3B8] text-[13px] mb-0.5">{entry.card.topic}</Text>
                  <Text className="text-[#0F172A] text-[16px] font-normal" numberOfLines={1}>
                    {entry.card.title}
                  </Text>
                </View>
                <ChevronRight color="#CBD5E1" size={18} strokeWidth={1.75} />
              </TouchableOpacity>
            );
            })}
          </View>
        )}
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
