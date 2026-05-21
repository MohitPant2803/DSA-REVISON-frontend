import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import {
  useGetFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
} from '@/hooks/useFolders';
import { FolderCard } from '@/components/FolderCard';
import { FolderFormModal } from '@/components/FolderFormModal';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import type { CreateFolderDTO, IFolder } from '@/types/folder';
import { canModifyItem } from '@/utils/permissions';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

export default function LearnScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { user } = useAuthStore();
  const { canManageContent, role } = useRole();

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
    console.log('[LearnScreen] Submitting Folder Payload:', payload);
    if (editingFolder) {
      updateFolder.mutate(
        { folderId: editingFolder._id, updateData: payload },
        { 
          onSuccess: () => { 
            console.log('[LearnScreen] Folder updated successfully');
            setModalVisible(false); 
            setEditingFolder(null); 
          },
          onError: (err) => console.error('[LearnScreen] Update error:', err)
        }
      );
    } else {
      createFolder.mutate(payload, { 
        onSuccess: () => {
          console.log('[LearnScreen] Folder created successfully');
          setModalVisible(false);
          refetch(); // Immediate state sync
        },
        onError: (err) => console.error('[LearnScreen] Creation error:', err)
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F7]" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1 px-6 pt-6"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7c3aed" />
        }
      >
        <Animated.View entering={FadeInDown.duration(400)} className="mb-6">
          <Text className="text-slate-500 text-sm font-medium mb-1">Learn</Text>
          <Text className="text-slate-900 text-3xl font-bold tracking-tight mb-2">Revision folders</Text>
          <Text className="text-slate-500 text-base leading-relaxed">
            Open a folder, browse cards, then swipe to revise at your own pace.
          </Text>
        </Animated.View>

        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search folders..."
        />

        {canManageContent && (
          <TouchableOpacity
            onPress={openCreate}
            activeOpacity={0.85}
            className="flex-row items-center justify-center bg-violet-600 rounded-full py-3.5 mb-6"
          >
            <Plus color="#fff" size={20} />
            <Text className="text-white font-semibold text-base ml-2">New folder</Text>
          </TouchableOpacity>
        )}

        {isLoading && (
          <ActivityIndicator size="large" color="#7c3aed" className="py-16" />
        )}

        {isError && (
          <View className="bg-white rounded-2xl p-6 border border-red-100 mb-6">
            <Text className="text-red-600 font-medium mb-2">Could not load folders</Text>
            <Text className="text-slate-500 text-sm mb-4">{error?.message}</Text>
            <TouchableOpacity onPress={() => refetch()} className="bg-slate-100 rounded-full py-3">
              <Text className="text-slate-700 text-center font-medium">Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && folders.length === 0 && (
          <View className="bg-white rounded-[28px] p-8 border border-slate-100 items-center">
            <Text className="text-slate-800 font-semibold text-lg mb-2">No folders found</Text>
            <Text className="text-slate-500 text-center text-sm">
              {search ? 'Try a different search.' : canManageContent ? 'Create your first folder.' : 'Check back soon.'}
            </Text>
          </View>
        )}

        {folders.map((folder, index) => (
          <Animated.View key={folder._id} entering={FadeInDown.delay(index * 40).duration(280)}>
            <FolderCard
              folder={folder}
              // Assuming folder.cardCount will be available from the backend
              // cardCount={folder.cardCount} // Uncomment and pass this prop when available
              onPress={() =>
                router.push({
                  pathname: '/(protected)/folder/[folderId]',
                  params: { folderId: folder._id, title: folder.title },
                })
              }
              onLongPress={() => handleFolderLongPress(folder)}
            />
          </Animated.View>
        ))}
        <View className="h-12" />
      </ScrollView>

      <FolderFormModal
        visible={modalVisible}
        folder={editingFolder}
        onClose={() => { setModalVisible(false); setEditingFolder(null); }}
        onSubmit={handleSubmit}
        isLoading={createFolder.isPending || updateFolder.isPending}
      />
    </SafeAreaView>
  );
}
