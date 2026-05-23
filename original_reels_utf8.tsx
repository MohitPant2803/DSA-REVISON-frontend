import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Dimensions,
  Vibration,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Plus, ChevronLeft } from 'lucide-react-native';
import { useGetRevisionCards, IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { RevisionCard } from './RevisionCard';
import { useUpdateLastViewedCard } from '@/services/useUserProgress';
import { useRole } from '@/hooks/useRole';
import { useQueryClient } from '@tanstack/react-query';
import * as revisionService from '@/services/revisionService';

const { height } = Dimensions.get('window');
const PAGE_SIZE = 6;
const PRELOAD_THRESHOLD = 2;

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(12);
  } else {
    Vibration.vibrate(8);
  }
};

const RevisionCardSkeleton = () => (
  <View className="flex-1 bg-[#0c0c0e] p-6 pt-20" style={{ height }}>
    <View className="opacity-30 gap-4">
      <View className="h-6 w-28 bg-zinc-800 rounded-full" />
      <View className="h-12 w-full bg-zinc-800 rounded-2xl" />
      <View className="h-4 w-full bg-zinc-800/80 rounded-lg" />
      <View className="h-4 w-4/5 bg-zinc-800/80 rounded-lg" />
    </View>
  </View>
);

export default function ReelsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { folderId, topic, tags, difficulty, search } = useLocalSearchParams<{
    folderId?: string;
    topic?: string;
    tags?: string;
    difficulty?: string;
    search?: string;
  }>();

  const [page, setPage] = useState(1);
  const [allCards, setAllCards] = useState<IPopulatedRevisionCard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastHapticIndex = useRef(-1);

  const query = {
    page,
    limit: PAGE_SIZE,
    ...(folderId ? { folderId } : {}),
    ...(topic ? { topic } : {}),
    ...(tags ? { tags } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading, isError, error, refetch, isRefetching } = useGetRevisionCards(query);
  const { mutate: updateLastViewed } = useUpdateLastViewedCard();
  const { canManageContent } = useRole();

  useEffect(() => {
    setPage(1);
    setAllCards([]);
    setActiveIndex(0);
  }, [folderId, topic, tags, difficulty, search]);

  useEffect(() => {
    if (!data?.results) return;
    if (page === 1) {
      setAllCards(data.results);
    } else {
      setAllCards((prev) => {
        const ids = new Set(prev.map((c) => c._id));
        return [...prev, ...data.results.filter((c) => !ids.has(c._id))];
      });
    }
  }, [data, page]);

  const preloadNextPage = useCallback(() => {
    if (!data || page >= data.totalPages) return;
    const nextQuery = { ...query, page: page + 1 };
    queryClient.prefetchQuery({
      queryKey: ['revisionCards', nextQuery],
      queryFn: () => revisionService.getRevisionCards(nextQuery),
    });
  }, [data, page, query, queryClient]);

  useEffect(() => {
    const remaining = allCards.length - activeIndex - 1;
    if (remaining <= PRELOAD_THRESHOLD) {
      if (data && page < data.totalPages && !isLoading) {
        setPage((p) => (p < data.totalPages ? p + 1 : p));
      }
      preloadNextPage();
    }
  }, [activeIndex, allCards.length, data, page, isLoading, preloadNextPage]);

  const onRefresh = useCallback(() => setPage(1), []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null; item: IPopulatedRevisionCard }[] }) => {
      if (viewableItems.length === 0 || viewableItems[0].index == null) return;
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
      const card = viewableItems[0].item;
      updateLastViewed(card._id);
      if (lastHapticIndex.current !== idx) {
        lastHapticIndex.current = idx;
        lightHaptic();
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 80,
  }).current;

  if (isLoading && allCards.length === 0) {
    return (
      <View className="flex-1 bg-[#0c0c0e]">
        <RevisionCardSkeleton />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0c0c0e] p-6">
        <Text className="text-red-300 text-lg text-center mb-4">{error?.message}</Text>
        <TouchableOpacity onPress={() => refetch()} className="bg-violet-600/90 px-8 py-3.5 rounded-full">
          <Text className="text-white font-semibold">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0c0c0e]">
      {navigation.canGoBack() && (
        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute top-14 left-4 z-50 bg-black/40 p-2.5 rounded-full"
        >
          <ChevronLeft color="#e4e4e7" size={22} />
        </TouchableOpacity>
      )}

      <FlatList
        data={allCards}
        renderItem={({ item, index }) => (
          <View style={{ height }}>
            <RevisionCard card={item} currentIndex={index} totalCount={allCards.length} />
          </View>
        )}
        keyExtractor={(item) => item._id}
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={height}
        snapToAlignment="start"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && page === 1}
            onRefresh={onRefresh}
            tintColor="#a1a1aa"
          />
        }
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center px-10" style={{ height: height * 0.8 }}>
            <Text className="text-zinc-200 text-xl font-semibold mb-2 text-center">Nothing to revise yet</Text>
            <Text className="text-zinc-500 text-center leading-relaxed">
              Open a folder in Learn and add cards, or adjust your filters.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(protected)/(tabs)/learn')}
              className="mt-8 bg-zinc-800 px-6 py-3 rounded-full"
            >
              <Text className="text-zinc-200 font-medium">Browse folders</Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          isRefetching && page > 1 ? (
            <View style={{ height: 48 }} className="justify-center items-center">
              <ActivityIndicator color="#71717a" size="small" />
            </View>
          ) : null
        }
      />

      {canManageContent && (
        <TouchableOpacity
          className="absolute bottom-10 right-5 bg-violet-600/95 w-14 h-14 rounded-full justify-center items-center"
          onPress={() =>
            router.push({
              pathname: '/(protected)/(tabs)/CreateRevisionScreen',
              params: folderId ? { folderId } : {},
            })
          }
        >
          <Plus color="#ffffff" size={28} />
        </TouchableOpacity>
      )}
    </View>
  );
}
