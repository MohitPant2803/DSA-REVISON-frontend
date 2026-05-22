import React, { useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Plus, PlayCircle, Pencil } from 'lucide-react-native';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import { useGetFolder, useGetFolders } from '@/hooks/useFolders';
import { useGetCardsByFolder, useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { FolderCard } from '@/components/FolderCard';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { canModifyItem } from '@/utils/permissions';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { normalizeParam } from '@/utils/routeParams';

export default function FolderCardsScreen() {
  useAppBackHandler();
  const router = useRouter();
  const params = useLocalSearchParams<{
    folderId: string;
    title?: string;
  }>();
  const folderId = normalizeParam(params.folderId) ?? '';
  const paramTitle = normalizeParam(params.title);
  const { user } = useAuthStore();
  const { canManageContent, role } = useRole();

  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<string | undefined>();
  const [tag, setTag] = useState<string | undefined>();

  const { data: folder } = useGetFolder(folderId || undefined);
  const { data, isLoading, isError, error, refetch, isRefetching } = useGetCardsByFolder(folderId || undefined, {
    limit: 100,
    search: search.trim() || undefined,
    topic,
    difficulty,
    tags: tag,
    excludeSlides: 'true',
  });

  // Query child subfolders of the current folder
  const {
    data: subfoldersData,
    isLoading: isSubfoldersLoading,
    refetch: refetchSubfolders,
    isRefetching: isRefetchingSubfolders,
  } = useGetFolders({
    parentFolderId: folderId,
    limit: 100,
  });

  const deleteCard = useDeleteRevisionCard();

  const cards = data?.results ?? [];
  const subfolders = subfoldersData?.results ?? [];
  const displayTitle = folder?.title || paramTitle || 'Folder';

  const totalSubfolderCards = useMemo(() => {
    return subfolders.reduce((acc, sub) => acc + (sub.cardCount ?? 0), 0);
  }, [subfolders]);

  const displayCardCount = subfolders.length > 0
    ? totalSubfolderCards
    : (folder?.cardCount ?? cards.length);

  const hasCardsToRevise = cards.length > 0 || totalSubfolderCards > 0;
  const isAnyRefetching = isRefetching || isRefetchingSubfolders;

  const topics = useMemo(
    () => [...new Set(cards.map((c) => c.topic).filter(Boolean))],
    [cards]
  );
  const tags = useMemo(
    () => [...new Set(cards.flatMap((c) => c.tags || []))],
    [cards]
  );

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchSubfolders()]);
  };

  const startRevising = (startCardId?: string) => {
    if (!folderId) return;
    router.push({
      pathname: '/(protected)/(tabs)/reels',
      params: {
        folderId,
        topic: topic ?? '',
        difficulty: difficulty ?? '',
        tags: tag ?? '',
        search: search.trim(),
        ...(startCardId ? { startCardId } : {}),
      },
    });
  };

  const handleCardActions = (card: IPopulatedRevisionCard) => {
    if (!user?.id || !canModifyItem(role, user.id, card.createdBy)) return;
    Alert.alert(card.title, undefined, [
      {
        text: 'Edit',
        onPress: () =>
          router.push({
            pathname: '/(protected)/(tabs)/CreateRevisionScreen',
            params: { cardId: card._id, folderId },
          }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete card', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteCard.mutate(card._id) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!folderId) {
    return (
      <SafeAreaView className="flex-1 bg-[#F8FAFC] justify-center items-center px-6">
        <Text className="text-[#64748B] text-center mb-4">Invalid folder link.</Text>
        <TouchableOpacity onPress={() => router.back()} className="px-6 py-3 rounded-full bg-violet-500">
          <Text className="text-white">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F7]" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-2 mr-2 bg-white rounded-full border border-slate-100"
        >
          <ChevronLeft color="#334155" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-slate-900 text-xl font-bold tracking-tight" numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text className="text-slate-500 text-sm font-semibold">
            {subfolders.length > 0 ? `${subfolders.length} collections` : `${displayCardCount} cards`}
          </Text>
        </View>
        {hasCardsToRevise && (
          <TouchableOpacity
            onPress={() => startRevising()}
            className="flex-row items-center bg-violet-600 px-4 py-2.5 rounded-full"
          >
            <PlayCircle color="#fff" size={18} />
            <Text className="text-white font-semibold text-sm ml-1.5">Revise</Text>
          </TouchableOpacity>
        )}
      </View>

      {subfolders.length === 0 && (
        <View className="px-6">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            topic={topic}
            onTopicChange={setTopic}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            tag={tag}
            onTagChange={setTag}
            topics={topics}
            tags={tags}
            placeholder="Search cards..."
          />
        </View>
      )}

      {canManageContent && subfolders.length === 0 && (
        <View className="px-6 mb-3">
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/(protected)/(tabs)/CreateRevisionScreen',
                params: { folderId },
              })
            }
            className="flex-row items-center justify-center bg-white border border-slate-200 rounded-full py-3"
          >
            <Plus color="#7c3aed" size={18} />
            <Text className="text-violet-700 font-semibold ml-2">Add card</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        className="flex-1 px-6"
        refreshControl={
          <RefreshControl refreshing={isAnyRefetching} onRefresh={handleRefresh} tintColor="#7c3aed" />
        }
      >
        {isLoading || isSubfoldersLoading ? (
          <ActivityIndicator size="large" color="#7c3aed" className="mt-12" />
        ) : isError ? (
          <View className="bg-white rounded-2xl p-6 mb-6">
            <Text className="text-red-600 font-medium">{error?.message}</Text>
            <TouchableOpacity onPress={handleRefresh} className="mt-4">
              <Text className="text-violet-600 font-medium text-center">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : subfolders.length > 0 ? (
          <View className="mt-2">
            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">
              Sub-Collections
            </Text>
            {subfolders.map((sub) => (
              <FolderCard
                key={sub._id}
                folder={sub}
                onPress={() =>
                  router.push({
                    pathname: '/(protected)/folder/[folderId]',
                    params: { folderId: sub._id, title: sub.title },
                  })
                }
              />
            ))}
          </View>
        ) : cards.length === 0 ? (
          <View className="bg-white rounded-[28px] p-8 items-center border border-slate-100">
            <Text className="text-slate-800 font-semibold text-lg mb-2">No cards match</Text>
            <Text className="text-slate-500 text-center text-sm">
              {canManageContent ? 'Add a card or clear filters.' : 'Nothing here yet.'}
            </Text>
          </View>
        ) : (
          cards.map((card) => {
            const canEdit = user?.id && canModifyItem(role, user.id, card.createdBy);
            return (
              <TouchableOpacity
                key={card._id}
                activeOpacity={0.9}
                onPress={() => startRevising(card._id)}
                onLongPress={() => handleCardActions(card)}
                className="bg-white rounded-[24px] p-5 mb-3 border border-slate-100"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-3">
                    <Text className="text-violet-600 text-[10px] font-bold uppercase tracking-widest mb-1">
                      {card.topic}
                    </Text>
                    <Text className="text-slate-900 font-semibold text-lg leading-tight">{card.title}</Text>
                    <View className="flex-row gap-2 mt-2">
                      <Text
                        className={`text-xs font-semibold ${
                          card.difficulty === 'Easy'
                            ? 'text-emerald-600'
                            : card.difficulty === 'Medium'
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {card.difficulty}
                      </Text>
                      {card.complexity && (
                        <Text className="text-slate-400 text-xs font-mono">{card.complexity}</Text>
                      )}
                    </View>
                  </View>
                  {canEdit && (
                    <TouchableOpacity onPress={() => handleCardActions(card)} className="p-2 bg-slate-50 rounded-full">
                      <Pencil color="#64748b" size={16} />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View className="h-16" />
      </ScrollView>
    </SafeAreaView>
  );
}
