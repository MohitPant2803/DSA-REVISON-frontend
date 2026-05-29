import React, { useMemo, useState, useCallback } from 'react';
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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Plus, PlayCircle, Pencil } from 'lucide-react-native';
import { useAuthStore } from '@/store/useAuthStore';
import { useRole } from '@/hooks/useRole';
import { useGetFolder, useGetFolders } from '@/hooks/useFolders';
import { useGetCardsByFolder, useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { FolderCard } from '@/components/FolderCard';
import { SpringPressable } from '@/components/SpringPressable';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { canModifyItem } from '@/utils/permissions';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { normalizeParam } from '@/utils/routeParams';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { SyncPauseGate } from '@/components/SyncPauseGate';
import { useCardDifficultyMap, useCardsById } from '@/hooks/usePlaylistStoreSelectors';
// useSyncEngine removed: sync is mounted at root layout level. This screen uses pauseSyncGate instead.
import { resolveCardState } from '@/utils/resolveCardState';

export default function FolderCardsScreen() {
  // Local-First Architecture: SyncPauseGate pauses sync automatically when focused
  const router = useRouter();
  const params = useLocalSearchParams<{
    folderId: string;
    title?: string;
  }>();
  const folderId = normalizeParam(params.folderId) ?? '';
  const paramTitle = normalizeParam(params.title);
  const { user } = useAuthStore();
  const { canManageContent, role } = useRole();

  const { data: folder } = useGetFolder(folderId || undefined);

  const handleBack = useCallback(() => {
    if (folder?.parentFolderId) {
      router.replace({
        pathname: '/(protected)/folder/[folderId]',
        params: { folderId: folder.parentFolderId },
      });
      return true;
    } else {
      router.replace('/(protected)/(tabs)/learn');
      return true;
    }
  }, [folder, folderId, router]);

  useAppBackHandler(handleBack);
  const { data, isLoading, isError, error, refetch, isRefetching } = useGetCardsByFolder(folderId || undefined, {
    limit: 100,
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
  const cardDifficultyMap = useCardDifficultyMap();
  const cardsById = useCardsById();

  const cards = useMemo(() => {
    const rawCards = data?.results ?? [];
    return rawCards.map((c) => resolveCardState(c, cardDifficultyMap, cardsById));
  }, [data?.results, cardDifficultyMap, cardsById]);
  const subfolders = subfoldersData?.results ?? [];
  const displayTitle = folder?.title || paramTitle || 'Folder';

  const displayCardCount = cards.length;

  const hasCardsToRevise = subfolders.length === 0 && cards.length > 0;
  const isAnyRefetching = isRefetching || isRefetchingSubfolders;

  const handleRefresh = async () => {
    try {
      // Trigger a forced sync flush for pull-to-refresh directly in the store
      usePlaylistStateStore.getState().triggerSync();
    } catch (e) {}
  };

  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const resetFiltersToAll = () => setActiveFilters([]);
  const toggleFilter = (filter: string) => {
    setActiveFilters((prev) => {
      if (prev.includes(filter)) {
        return prev.filter((f) => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  };

  const easyCount = useMemo(() => {
    return cards.filter(
      (c: any) =>
        c.currentUserQuestionProgress?.attemptStatus === 'attempted' &&
        c.currentUserQuestionProgress?.perceivedDifficultyByUser === 'easy'
    ).length;
  }, [cards]);

  const mediumCount = useMemo(() => {
    return cards.filter(
      (c: any) =>
        c.currentUserQuestionProgress?.attemptStatus === 'attempted' &&
        c.currentUserQuestionProgress?.perceivedDifficultyByUser === 'medium'
    ).length;
  }, [cards]);

  const hardCount = useMemo(() => {
    return cards.filter(
      (c: any) =>
        c.currentUserQuestionProgress?.attemptStatus === 'attempted' &&
        c.currentUserQuestionProgress?.perceivedDifficultyByUser === 'hard'
    ).length;
  }, [cards]);

  const skippedCount = useMemo(() => {
    return cards.filter((c: any) => c.currentUserQuestionProgress?.attemptStatus === 'skipped').length;
  }, [cards]);

  const unattemptedCount = useMemo(() => {
    return cards.filter((c: any) => c.currentUserQuestionProgress === null || c.currentUserQuestionProgress === undefined).length;
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (activeFilters.length === 0) return cards;
    return cards.filter((c: any) => {
      const qp = c.currentUserQuestionProgress;
      if (!qp) {
        return activeFilters.includes('unattempted');
      }
      if (qp.attemptStatus === 'skipped') {
        return activeFilters.includes('skipped');
      }
      if (qp.attemptStatus === 'attempted' && qp.perceivedDifficultyByUser) {
        return activeFilters.includes(qp.perceivedDifficultyByUser.toLowerCase());
      }
      return false;
    });
  }, [cards, activeFilters]);

  const startRevising = (startCardId?: string) => {
    if (!folderId) return;
    router.push({
      pathname: '/(protected)/reels-player',
      params: {
        folderId,
        ...(startCardId ? { startCardId } : { shuffle: 'true' }),
        userDifficultyStates: activeFilters.join(','),
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
            pathname: '/(protected)/CreateRevisionScreen',
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
      <SafeAreaView className="flex-1 bg-[#FAF9F7] justify-center items-center px-6">
        <Text className="text-[#64748B] text-center mb-4">Invalid folder link.</Text>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(protected)/(tabs)/learn');
            }
          }}
          className="px-6 py-3 rounded-full bg-violet-500"
        >
          <Text className="text-white">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#FAF9F7]" edges={['top', 'left', 'right']}>
      <SyncPauseGate />
      <View className="flex-row items-center px-4 pt-2 pb-2">
        <TouchableOpacity
          onPress={handleBack}
          className="p-2 mr-2 bg-white rounded-full border"
          style={{ borderColor: 'rgba(148,163,184,0.08)' }}
        >
          <ChevronLeft color="#334155" size={24} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-slate-900 font-bold tracking-tight text-3xl" numberOfLines={1}>
            {displayTitle}
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



      {canManageContent && subfolders.length === 0 && (
        <View className="px-6 mb-3">
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/(protected)/CreateRevisionScreen',
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
        {!(isLoading || isSubfoldersLoading) && !isError && subfolders.length === 0 && (
          <View className="mb-5 bg-white border border-slate-100/80 rounded-[30px] p-5 shadow-sm">
            <Text className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-3">
              Filter Questions
            </Text>
            
            {/* Row 1: Easy, Medium, Hard */}
            <View className="flex-row justify-between mb-3" style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={() => toggleFilter('easy')}
                activeOpacity={0.75}
                className={`flex-1 py-3.5 rounded-2xl items-center border ${
                  activeFilters.includes('easy')
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <Text className={`text-xs font-bold ${activeFilters.includes('easy') ? 'text-emerald-700' : 'text-slate-600'}`}>
                  Easy ({easyCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleFilter('medium')}
                activeOpacity={0.75}
                className={`flex-1 py-3.5 rounded-2xl items-center border ${
                  activeFilters.includes('medium')
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <Text className={`text-xs font-bold ${activeFilters.includes('medium') ? 'text-amber-700' : 'text-slate-600'}`}>
                  Medium ({mediumCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleFilter('hard')}
                activeOpacity={0.75}
                className={`flex-1 py-3.5 rounded-2xl items-center border ${
                  activeFilters.includes('hard')
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <Text className={`text-xs font-bold ${activeFilters.includes('hard') ? 'text-rose-700' : 'text-slate-600'}`}>
                  Hard ({hardCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Row 2: Skipped, Unattempted */}
            <View className="flex-row justify-between" style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={() => toggleFilter('skipped')}
                activeOpacity={0.75}
                className={`flex-1 py-3.5 rounded-2xl items-center border ${
                  activeFilters.includes('skipped')
                    ? 'bg-slate-200 border-slate-300'
                    : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <Text className={`text-xs font-bold ${activeFilters.includes('skipped') ? 'text-slate-800' : 'text-slate-600'}`}>
                  Skipped ({skippedCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleFilter('unattempted')}
                activeOpacity={0.75}
                className={`flex-1 py-3.5 rounded-2xl items-center border ${
                  activeFilters.includes('unattempted')
                    ? 'bg-violet-50 border-violet-200'
                    : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <Text className={`text-xs font-bold ${activeFilters.includes('unattempted') ? 'text-violet-700' : 'text-slate-600'}`}>
                  Unattempted ({unattemptedCount})
                </Text>
              </TouchableOpacity>
            </View>

            {activeFilters.length > 0 && (
              <TouchableOpacity
                onPress={resetFiltersToAll}
                activeOpacity={0.75}
                className="mt-3.5 pt-2 items-center"
              >
                <Text className="text-slate-400 text-xs font-semibold underline">
                  Reset Filters
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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
          <View className="bg-white rounded-[30px] p-8 items-center border border-slate-100">
            <Text className="text-slate-800 font-semibold text-lg mb-2">No cards match</Text>
            <Text className="text-slate-500 text-center text-sm">
              {canManageContent ? 'Add a card or clear filters.' : 'Nothing here yet.'}
            </Text>
          </View>
        ) : filteredCards.length === 0 ? (
          <View className="bg-white rounded-[30px] p-8 items-center border border-slate-100">
            <Text className="text-slate-800 font-semibold text-lg mb-2 text-center">
              No {activeFilters.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(' / ')} cards yet
            </Text>
            <Text className="text-slate-500 text-center text-sm mb-5 leading-normal">
              Start classifying cards inside Reels to build your revision queue.
            </Text>
            <TouchableOpacity
              onPress={resetFiltersToAll}
              className="bg-violet-600 px-6 py-2.5 rounded-full"
            >
              <Text className="text-white font-semibold text-xs">Show All Cards</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredCards.map((card) => {
            const canEdit = user?.id && canModifyItem(role, user.id, card.createdBy);
            return (
              <SpringPressable
                key={card._id}
                onPress={() => startRevising(card._id)}
                onLongPress={() => handleCardActions(card)}
                className="bg-white rounded-[30px] p-5 mb-3.5 border"
                style={{
                  borderColor: 'rgba(148, 163, 184, 0.08)',
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.03,
                  shadowRadius: 18,
                  elevation: 2,
                }}
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-3">
                    <Text className="text-[#8B5CF6] text-[10px] font-semibold uppercase tracking-wider mb-1">
                      {card.topic}
                    </Text>
                    <Text className="text-[#0F172A] font-semibold text-[17px] leading-tight">{card.title}</Text>
                    <View className="flex-row gap-2 mt-2.5">
                      <Text
                        className={`text-xs font-semibold ${
                          card.difficulty === 'Easy'
                            ? 'text-[#0D9488]'
                            : card.difficulty === 'Medium'
                            ? 'text-[#B45309]'
                            : 'text-[#E11D48]'
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
                    <TouchableOpacity 
                      onPress={() => handleCardActions(card)} 
                      className="p-2 bg-[#FAF9F7] rounded-full border border-slate-100"
                    >
                      <Pencil color="#94A3B8" size={14} />
                    </TouchableOpacity>
                  )}
                </View>
              </SpringPressable>
            );
          })
        )}
        <View className="h-16" />
      </ScrollView>
    </SafeAreaView>
  );
}
