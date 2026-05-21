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
import { useGetFolder } from '@/hooks/useFolders';
import { useGetCardsByFolder, useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { canModifyItem } from '@/utils/permissions';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

export default function FolderCardsScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { folderId, title: paramTitle } = useLocalSearchParams<{
    folderId: string;
    title?: string;
  }>();
  const { user } = useAuthStore();
  const { canManageContent, role } = useRole();

  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<string | undefined>();
  const [tag, setTag] = useState<string | undefined>();

  const { data: folder } = useGetFolder(folderId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useGetCardsByFolder(folderId, {
    limit: 100,
    search: search.trim() || undefined,
    topic,
    difficulty,
    tags: tag,
  });
  const deleteCard = useDeleteRevisionCard();

  const cards = data?.results ?? [];
  const displayTitle = folder?.title || paramTitle || 'Folder';

  const topics = useMemo(
    () => [...new Set(cards.map((c) => c.topic).filter(Boolean))],
    [cards]
  );
  const tags = useMemo(
    () => [...new Set(cards.flatMap((c) => c.tags || []))],
    [cards]
  );

  const startRevising = () => {
    router.push({
      pathname: '/(protected)/(tabs)/reels',
      params: {
        folderId,
        topic: topic ?? '',
        difficulty: difficulty ?? '',
        tags: tag ?? '',
        search: search.trim(),
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
          <Text className="text-slate-500 text-sm">{folder?.cardCount ?? cards.length} cards</Text>
        </View>
        {cards.length > 0 && (
          <TouchableOpacity
            onPress={startRevising}
            className="flex-row items-center bg-violet-600 px-4 py-2.5 rounded-full"
          >
            <PlayCircle color="#fff" size={18} />
            <Text className="text-white font-semibold text-sm ml-1.5">Revise</Text>
          </TouchableOpacity>
        )}
      </View>

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

      {canManageContent && (
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
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7c3aed" />
        }
      >
        {isLoading && <ActivityIndicator size="large" color="#7c3aed" className="mt-12" />}
        {isError && (
          <View className="bg-white rounded-2xl p-6 mb-6">
            <Text className="text-red-600 font-medium">{error?.message}</Text>
            <TouchableOpacity onPress={() => refetch()} className="mt-4">
              <Text className="text-violet-600 font-medium text-center">Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isLoading && !isError && cards.length === 0 && (
          <View className="bg-white rounded-[28px] p-8 items-center border border-slate-100">
            <Text className="text-slate-800 font-semibold text-lg mb-2">No cards match</Text>
            <Text className="text-slate-500 text-center text-sm">
              {canManageContent ? 'Add a card or clear filters.' : 'Nothing here yet.'}
            </Text>
          </View>
        )}
        {cards.map((card) => {
          const canEdit = user?.id && canModifyItem(role, user.id, card.createdBy);
          return (
            <TouchableOpacity
              key={card._id}
              activeOpacity={0.9}
              onPress={startRevising}
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
        })}
        <View className="h-16" />
      </ScrollView>
    </SafeAreaView>
  );
}
