import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Vibration,
  StyleSheet,
  Pressable,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, PlayCircle, Shuffle, Play, FastForward, GripVertical } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import { useTrackingStore } from '@/store/useTrackingStore';
import { usePlaylistCards, useReorderPlaylist, usePlaylists } from '@/hooks/usePlaylists';
import { usePersonalLibrary, useReorderLikes } from '@/hooks/usePersonalLibrary';
import { useGetCardsByFolder } from '@/hooks/useRevisionCards';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { normalizeParam } from '@/utils/routeParams';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { SyncPauseGate } from '@/components/SyncPauseGate';
import { usePlaylistCards as useStorePlaylistCards } from '@/hooks/usePlaylistStoreSelectors';
import { resolveCardState } from '@/utils/resolveCardState';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedStyle, withSpring, FadeInUp, FadeOut } from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(5);
  }
};

interface CardItemProps {
  card: IPopulatedRevisionCard;
  drag: () => void;
  isActive: boolean;
  startRevising: (shuffle?: boolean, resume?: boolean, startCardId?: string) => void;
}

const CardItem = React.memo(({ card, drag, isActive, startRevising }: CardItemProps) => {
  if (!card || !card._id) return null;
  return (
    <ScaleDecorator activeScale={1.0}>
      <TouchableOpacity
        activeOpacity={isActive ? 1 : 0.85}
        onPress={() => !isActive && startRevising(false, false, card._id)}
        disabled={isActive}
        onLongPress={() => {
          lightHaptic();
          drag();
        }}
        delayLongPress={150}
        style={[
          styles.cardWrapper,
          isActive && styles.cardActive
        ]}
      >
        <View className="flex-1 justify-center">
          <Text className="text-violet-600 text-[10px] font-bold uppercase tracking-widest mb-1">
            {card.topic}
          </Text>
          <Text className="text-slate-900 font-semibold text-lg leading-tight" numberOfLines={1}>
            {card.title}
          </Text>
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
          </View>
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.card._id === nextProps.card._id &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.topic === nextProps.card.topic &&
    prevProps.card.difficulty === nextProps.card.difficulty &&
    prevProps.startRevising === nextProps.startRevising
  );
});

export default function PlaylistCardsScreen() {
  const router = useRouter();

  const handleBack = useCallback(() => {
    router.replace('/(protected)/(tabs)/personal');
    return true;
  }, [router]);

  useAppBackHandler(handleBack);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    playlistId: string;
  }>();
  const playlistId = normalizeParam(params.playlistId) ?? '';
  const isLikes = playlistId === 'likes';
  
  const { user } = useAuthStore();
  const { setActivePlaylistId } = useBookmarkStore();
  const { data: playlists } = usePlaylists();
  
  const playlist = playlists?.find(p => p.id === playlistId);

  // Normal playlist hook
  const { data: cardsData, isLoading: cardsLoading, isError: cardsIsError, error: cardsError, refetch: refetchCards } = usePlaylistCards(isLikes ? null : playlistId);
  // Likes hook
  const { data: libraryData, isLoading: libraryLoading, isError: libraryIsError, error: libraryError, refetch: refetchLibrary } = usePersonalLibrary();
  
  const isLoading = isLikes ? libraryLoading : cardsLoading;
  const isError = isLikes ? libraryIsError : cardsIsError;
  const error = isLikes ? libraryError : cardsError;
  const refetch = isLikes ? refetchLibrary : refetchCards;

  const reorderPlaylist = useReorderPlaylist();
  const reorderLikes = useReorderLikes();

  const hydratePlaylistCards = usePlaylistStateStore((state) => state.hydratePlaylistCards);
  const setPlaylistCardOrder = usePlaylistStateStore((state) => state.setPlaylistCardOrder);
  const storeCards = useStorePlaylistCards(playlistId);

  useEffect(() => {
    if (isLikes && libraryData?.favorites) {
      const favCards = libraryData.favorites
        .filter(f => f != null && f.card != null && typeof f.card === 'object' && '_id' in f.card)
        .map(f => f.card) as IPopulatedRevisionCard[];
      hydratePlaylistCards(playlistId, favCards.filter(Boolean).filter(c => c && c._id));
    }
  }, [libraryData, isLikes, playlistId, hydratePlaylistCards]);

  const [localCards, setLocalCards] = useState<IPopulatedRevisionCard[]>([]);
  const [undoVisible, setUndoVisible] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<{
    card: IPopulatedRevisionCard;
    index: number;
    originalDifficulty?: any;
  } | null>(null);

  const swipeableRefs = useRef<Map<string, any>>(new Map());
  const isLoadingMoreRef = useRef(false);

  // Auto-hide Undo banner after 5 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (undoVisible) {
      timer = setTimeout(() => {
        setUndoVisible(false);
        setLastRemoved(null);
      }, 5000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [undoVisible]);

  useEffect(() => {
    if (storeCards) {
      const currentIds = localCards.map(c => c?._id).join(',');
      const nextIds = storeCards.map(c => c?._id).join(',');
      if (currentIds !== nextIds) {
        setLocalCards(storeCards);
      }
      isLoadingMoreRef.current = false;
    }
  }, [storeCards]);

  const handleSwipeRemove = useCallback((card: IPopulatedRevisionCard) => {
    lightHaptic();
    const cleanId = card._id.split('-loop-')[0];
    
    // Close the Swipeable row
    const ref = swipeableRefs.current.get(cleanId);
    if (ref) {
      ref.close();
    }

    const currentIndex = localCards.findIndex(c => c._id === card._id);
    if (currentIndex === -1) return;

    const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
    setLastRemoved({
      card,
      index: currentIndex,
      originalDifficulty: isSmart ? (playlistId as any) : undefined,
    });

    // Remove locally
    const nextCards = localCards.filter(c => c._id !== card._id);
    setLocalCards(nextCards);

    // Apply store changes optimistically
    if (isSmart) {
      usePlaylistStateStore.getState().transferCard(cleanId, card as any, null, true);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'CLASSIFY_CARD',
        payload: { cardId: cleanId, state: null },
        timestamp: Date.now(),
      });
    } else {
      usePlaylistStateStore.getState().toggleCustomPlaylistItemInStore(playlistId, cleanId, false);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'TOGGLE_PLAYLIST_ITEM',
        payload: { playlistId, cardId: cleanId, value: false },
        timestamp: Date.now(),
      });
    }

    setUndoVisible(true);
  }, [localCards, playlistId]);

  const handleUndo = useCallback(() => {
    if (!lastRemoved) return;
    lightHaptic();

    const { card, index, originalDifficulty } = lastRemoved;
    const cleanId = card._id.split('-loop-')[0];

    // Restore locally
    const nextCards = [...localCards];
    nextCards.splice(index, 0, card);
    setLocalCards(nextCards);

    // Restore store
    const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
    if (isSmart && originalDifficulty) {
      usePlaylistStateStore.getState().transferCard(cleanId, card as any, originalDifficulty, true);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'CLASSIFY_CARD',
        payload: { cardId: cleanId, state: originalDifficulty },
        timestamp: Date.now(),
      });
    } else {
      usePlaylistStateStore.getState().toggleCustomPlaylistItemInStore(playlistId, cleanId, true);
      usePlaylistStateStore.getState().enqueueOfflineAction({
        action: 'TOGGLE_PLAYLIST_ITEM',
        payload: { playlistId, cardId: cleanId, value: true },
        timestamp: Date.now(),
      });
    }

    // Restore custom order if applicable
    const draggedIds = nextCards.map(c => c._id);
    usePlaylistStateStore.getState().setPlaylistCardOrder(playlistId, draggedIds);

    // Clean up
    setLastRemoved(null);
    setUndoVisible(false);
  }, [lastRemoved, localCards, playlistId]);

  const displayTitle = isLikes ? 'Revised' : (playlist?.name || 'Playlist');

  const pendingOrderRef = useRef<IPopulatedRevisionCard[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pendingOrderRef.current = [];
    };
  }, []);

  const commitOrder = useCallback((data: IPopulatedRevisionCard[]) => {
    // 1. Commit immediately to local state so visual positions settle
    setLocalCards(data);

    // 2. Map and update store/backend
    const draggedIds = data.map(c => c._id);
    const originalIds = usePlaylistStateStore.getState().playlistCardOrderMap[playlistId] || [];
    const draggedSet = new Set(draggedIds);
    const missingIds = originalIds.filter(id => !draggedSet.has(id));
    const finalIds = [...draggedIds, ...missingIds];

    setPlaylistCardOrder(playlistId, finalIds);

    if (isLikes) {
      reorderLikes.mutate(finalIds);
    } else if (playlistId === 'watch-later') {
      useTrackingStore.getState().setWatchLater(finalIds);
      queryClient.invalidateQueries({ queryKey: ['playlistDetail', playlistId] });
    } else if (['easy', 'medium', 'hard', 'skipped'].includes(playlistId)) {
      // Smart focus areas are manual-ordered local-first! No backend mutation.
    } else {
      reorderPlaylist.mutate({ playlistId, cardIds: finalIds });
    }
  }, [playlistId, isLikes, setPlaylistCardOrder, reorderLikes, reorderPlaylist, queryClient]);

  const handleDragEnd = useCallback(({ data }: { data: IPopulatedRevisionCard[] }) => {
    pendingOrderRef.current = data;

    // Use InteractionManager to defer state updates until React Native layout interactions complete
    InteractionManager.runAfterInteractions(() => {
      if (!pendingOrderRef.current.length) return;
      commitOrder(pendingOrderRef.current);
      pendingOrderRef.current = [];
    });
  }, [commitOrder]);

  const startRevising = useCallback((shuffle = false, resume = false, startCardId?: string) => {
    if (!playlistId) return;
    if (localCards.length === 0) {
      Alert.alert('No cards to revise', 'Add cards to this playlist before starting a run.');
      return;
    }
    setActivePlaylistId(playlistId);
    router.push({
      pathname: '/(protected)/reels-player',
      params: {
        playlistId,
        shuffle: shuffle ? 'true' : 'false',
        startCardId: startCardId || '',
      },
    });
  }, [playlistId, localCards.length, setActivePlaylistId, router]);

  const renderItem = useCallback(({ item: card, drag, isActive }: RenderItemParams<IPopulatedRevisionCard>) => {
    if (!card || !card._id) return null;
    const cleanId = card._id.split('-loop-')[0];

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current.set(cleanId, ref);
          }
        }}
        renderRightActions={() => (
          <TouchableOpacity
            onPress={() => handleSwipeRemove(card)}
            activeOpacity={0.8}
            style={{
              backgroundColor: '#FEE2E2',
              justifyContent: 'center',
              alignItems: 'center',
              width: 70,
              height: 104,
              borderRadius: 24,
              marginBottom: 12,
              marginLeft: 8,
              borderWidth: 1,
              borderColor: '#FCA5A5',
            }}
          >
            <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12 }}>Remove</Text>
          </TouchableOpacity>
        )}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            handleSwipeRemove(card);
          }
        }}
      >
        <CardItem
          card={card}
          drag={drag}
          isActive={isActive}
          startRevising={startRevising}
        />
      </Swipeable>
    );
  }, [startRevising, handleSwipeRemove]);

  if (!playlistId) {
    return (
      <SafeAreaView className="flex-1 bg-[#F8FAFC] justify-center items-center px-6">
        <Text className="text-[#64748B] text-center mb-4">Invalid playlist link.</Text>
        <TouchableOpacity onPress={handleBack} className="px-6 py-3 rounded-full bg-violet-500">
          <Text className="text-white">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F8FAFC]" edges={['top', 'left', 'right']}>
      <SyncPauseGate />
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <TouchableOpacity
          onPress={handleBack}
          className="p-2 mr-2 bg-white rounded-full border border-slate-100"
        >
          <ChevronLeft color="#334155" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-slate-900 text-xl font-bold tracking-tight" numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text className="text-slate-500 text-sm font-semibold">
            {localCards.length} cards
          </Text>
        </View>
      </View>

      <View className="flex-row px-4 mt-2 gap-2 mb-4">
        <TouchableOpacity
          onPress={() => startRevising(false, false)}
          className="flex-1 flex-row items-center justify-center bg-violet-600 py-3 rounded-2xl"
        >
          <Play color="#fff" size={18} />
          <Text className="text-white font-semibold text-sm ml-2">Run in Order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => startRevising(true, false)}
          className="flex-1 flex-row items-center justify-center bg-white border border-slate-200 py-3 rounded-2xl"
        >
          <Shuffle color="#0F172A" size={18} />
          <Text className="text-slate-900 font-semibold text-sm ml-2">Shuffle</Text>
        </TouchableOpacity>
      </View>

      {isLoading && localCards.length === 0 ? (
        <ActivityIndicator size="large" color="#7c3aed" className="mt-12" />
      ) : isError && localCards.length === 0 ? (
        <View className="bg-white rounded-2xl p-6 mb-6 mx-4">
          <Text className="text-red-600 font-medium">{error?.message}</Text>
          <TouchableOpacity onPress={() => refetch()} className="mt-4">
            <Text className="text-violet-600 font-medium text-center">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : localCards.length === 0 ? (
        <View className="bg-white rounded-[28px] p-8 items-center border border-slate-100 mx-4">
          <Text className="text-slate-800 font-semibold text-lg mb-2">No reels saved yet</Text>
          <Text className="text-slate-500 text-center text-sm">
            Favorite cards to add them to this playlist.
          </Text>
        </View>
      ) : (
        <DraggableFlatList
          data={localCards}
          extraData={localCards}
          onDragEnd={handleDragEnd}
          keyExtractor={(item) => item?._id ? item._id.split('-loop-')[0] : `playlist-item-${Math.random()}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          activationDistance={20}
          dragItemOverflow={false}
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({
            length: 116,
            offset: 116 * index,
            index,
          })}
          onEndReached={() => {
            if (playlistId && !isLoadingMoreRef.current) {
              isLoadingMoreRef.current = true;
              usePlaylistStateStore.getState().checkAndLoadMorePlaylistCards(playlistId, localCards.length - 1);
            }
          }}
          onEndReachedThreshold={0.4}
        />
      )}

      {undoVisible && lastRemoved && (
        <Animated.View
          entering={FadeInUp.duration(300)}
          exiting={FadeOut.duration(200)}
          style={{
            position: 'absolute',
            bottom: 30,
            left: 20,
            right: 20,
            backgroundColor: '#1E293B',
            borderRadius: 20,
            paddingVertical: 14,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 6,
            zIndex: 999,
          }}
        >
          <Text style={{ color: '#F1F5F9', fontSize: 13, fontWeight: '600' }}>
            Card removed from playlist
          </Text>
          <TouchableOpacity
            onPress={handleUndo}
            activeOpacity={0.8}
            style={{
              backgroundColor: '#8B5CF6',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
              Undo
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
    height: 104,
  },
  cardActive: {
    backgroundColor: '#fff',
    borderColor: '#C4B5FD',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  }
});
