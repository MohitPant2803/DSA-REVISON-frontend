import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useScreenProfiler } from '@/hooks/useScreenProfiler';
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
import { useDeleteRevisionCard } from '@/hooks/useRevisionCards';
import { FolderCard } from '@/components/FolderCard';
import { SpringPressable } from '@/components/SpringPressable';
import { canModifyItem } from '@/utils/permissions';
import { interactionScheduler } from '@/utils/interactionScheduler';
import { transitionScheduler } from '@/utils/transitionScheduler';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { normalizeParam } from '@/utils/routeParams';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { SyncPauseGate } from '@/components/SyncPauseGate';
import { useFolderCards, useFolderDifficultyCounts, useResolvedFolderCards, useCardFavorite, useCardDifficulty } from '@/hooks/usePlaylistStoreSelectors';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { FlashList } from '@shopify/flash-list';
import { useShallow } from 'zustand/react/shallow';
import { ThemeBackground } from '@/components/ThemeBackground';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

const FlashListElement = FlashList as any;

const folderCardKeyExtractor = (item: any) => item._id;

interface FolderCardListItemProps {
  card: IPopulatedRevisionCard;
  canEdit: boolean;
  startRevising: (cardId?: string) => void;
  handleCardActions: (card: IPopulatedRevisionCard) => void;
}

const FolderCardListItem = React.memo(({ card, canEdit, startRevising, handleCardActions }: FolderCardListItemProps) => {
  const isFavorite = useCardFavorite(card._id);
  const difficultyState = useCardDifficulty(card._id);
  const palette = useThemePalette();

  const handlePress = useCallback(() => {
    startRevising(card._id);
  }, [startRevising, card._id]);

  const handleLongPress = useCallback(() => {
    handleCardActions(card);
  }, [handleCardActions, card]);

  const handleEdit = useCallback(() => {
    handleCardActions(card);
  }, [handleCardActions, card]);

  return (
    <SpringPressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      className="rounded-[30px] p-5 mb-3.5 border"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: palette.isDark ? 0.2 : 0.03,
        shadowRadius: 18,
        elevation: 2,
      }}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-3">
          <Text className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: palette.accent }}>
            {card.topic}
          </Text>
          <Text className="font-semibold text-[17px] leading-tight" style={{ color: palette.textPrimary }}>{card.title}</Text>
          <View className="flex-row gap-2.5 mt-2.5 items-center">
            <Text
              className="text-xs font-semibold"
              style={{
                color: card.difficulty === 'Easy'
                  ? palette.success
                  : card.difficulty === 'Medium'
                  ? palette.warning
                  : palette.error
              }}
            >
              {card.difficulty}
            </Text>
            {card.complexity && (
              <Text className="text-xs font-mono" style={{ color: palette.textSecondary }}>{card.complexity}</Text>
            )}
            {isFavorite && (
              <Text className="text-xs font-bold" style={{ color: palette.error }}>★ Favorite</Text>
            )}
            {difficultyState && (
              <Text className="text-xs font-semibold capitalize" style={{ color: palette.textSecondary }}>• {difficultyState}</Text>
            )}
          </View>
        </View>
        {canEdit && (
          <TouchableOpacity 
            onPress={handleEdit} 
            className="p-2 rounded-full border"
            style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
          >
            <Pencil color={palette.textSecondary} size={14} />
          </TouchableOpacity>
        )}
      </View>
    </SpringPressable>
  );
}, (prevProps, nextProps) => {
  // Return true if props are equal (SKIP render), false to re-render
  return (
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.card._id === nextProps.card._id &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.topic === nextProps.card.topic &&
    prevProps.card.difficulty === nextProps.card.difficulty &&
    prevProps.card.complexity === nextProps.card.complexity
  );
});

export default function FolderCardsScreen() {
  useScreenProfiler('Folder');
  const router = useRouter();
  const palette = useThemePalette();
  const params = useLocalSearchParams<{
    folderId: string;
    title?: string;
  }>();
  const folderId = normalizeParam(params.folderId) ?? '';
  const paramTitle = normalizeParam(params.title);
  const user = useAuthStore(s => s.user);
  const { canManageContent, role } = useRole();
  const setActiveFolderId = useBookmarkStore(s => s.setActiveFolderId);

  useFocusEffect(
    useCallback(() => {
      if (folderId) {
        usePlaylistStateStore.getState().hydrateFolderCardsOnDemand(folderId).catch(() => {});
      }
    }, [folderId])
  );

  const localFolder = usePlaylistStateStore(
    useCallback((state) => state.foldersById[folderId], [folderId])
  );

  const displayFolder = localFolder;

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return true;
    }
    router.replace('/(protected)/(tabs)/learn');
    return true;
  }, [router]);

  useAppBackHandler(handleBack);

  useFocusEffect(useCallback(() => {
    interactionScheduler.registerInteraction();
  }, []));

  const deleteCard = useDeleteRevisionCard();

  // O(1) stable counts selector
  const counts = useFolderDifficultyCounts(folderId);
  const { easy: easyCount, medium: mediumCount, hard: hardCount, skipped: skippedCount, unattempted: unattemptedCount } = counts;

  // Use Zustand directly for instant rendering (no React Query delays)
  const cards = useResolvedFolderCards(folderId);

  const foldersById = usePlaylistStateStore(useShallow((state) => state.foldersById));
  const subfolders = useMemo(() => {
    return Object.values(foldersById)
      .filter((f: any) => f && f.parentFolderId === folderId && !f.isDeleted)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [foldersById, folderId]);

  const displayTitle = displayFolder?.title || paramTitle || 'Folder';

  const bootstrapStatus = usePlaylistStateStore(s => s.bootstrapStatus);
  const isStoreLoading = bootstrapStatus === 'not_started' || bootstrapStatus === 'metadata_loading';

  const hasCardsToRevise = subfolders.length === 0 && cards.length > 0;

  const handleRefresh = async () => {
    try {
      transitionScheduler.schedule({
        name: 'folder-sync',
        fn: () => usePlaylistStateStore.getState().triggerSync(),
        priority: 'low',
      });
    } catch (e) {}
  };

  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  
  const resetFiltersToAll = useCallback(() => setActiveFilters([]), []);
  
  const toggleFilter = useCallback((filter: string) => {
    setActiveFilters((prev) => {
      if (prev.includes(filter)) {
        return prev.filter((f) => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  }, []);

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

  const startRevising = useCallback((startCardId?: string) => {
    if (!folderId) return;
    setActiveFolderId(folderId);
    router.push({
      pathname: '/(protected)/reels-player',
      params: {
        folderId,
        ...(startCardId ? { startCardId } : { shuffle: 'true' }),
        userDifficultyStates: activeFilters.join(','),
      },
    });
  }, [folderId, setActiveFolderId, router, activeFilters]);

  const handleCardActions = useCallback((card: IPopulatedRevisionCard) => {
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
  }, [user?.id, role, folderId, router, deleteCard]);

  if (!folderId) {
    return (
      <ThemeBackground>
        <SafeAreaView className="flex-1 justify-center items-center px-6" style={{ backgroundColor: 'transparent' }}>
          <Text className="text-center mb-4" style={{ color: palette.textSecondary }}>Invalid folder link.</Text>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(protected)/(tabs)/learn');
              }
            }}
            className="px-6 py-3 rounded-full"
            style={{ backgroundColor: palette.accent }}
          >
            <Text style={{ color: palette.isDark ? palette.textPrimary : palette.surface, fontWeight: 'bold' }}>Go back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  return (
    <ThemeBackground>
      <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }} edges={['top', 'left', 'right']}>
        <SyncPauseGate />
        <View className="flex-row items-center px-4 pt-2 pb-2">
          <TouchableOpacity
            onPress={handleBack}
            className="p-2 mr-2 rounded-full border"
            style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
          >
            <ChevronLeft color={palette.textSecondary} size={24} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="font-bold tracking-tight text-3xl" style={{ color: palette.textPrimary }} numberOfLines={1}>
              {displayTitle}
            </Text>
          </View>
          {hasCardsToRevise && (
            <TouchableOpacity
              onPress={() => startRevising()}
              className="flex-row items-center px-4 py-2.5 rounded-full"
              style={{ backgroundColor: palette.accent }}
            >
              <PlayCircle color={palette.isDark ? palette.textPrimary : palette.surface} size={18} />
              <Text className="font-semibold text-sm ml-1.5" style={{ color: palette.isDark ? palette.textPrimary : palette.surface }}>Revise</Text>
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
              className="flex-row items-center justify-center border rounded-full py-3"
              style={{ backgroundColor: palette.surface, borderColor: palette.border }}
            >
              <Plus color={palette.accent} size={18} />
              <Text className="font-semibold ml-2" style={{ color: palette.accent }}>Add card</Text>
            </TouchableOpacity>
          </View>
        )}

        {isStoreLoading && cards.length === 0 && subfolders.length === 0 ? (
          <ActivityIndicator size="large" color={palette.accent} className="mt-12" />
        ) : subfolders.length > 0 ? (
          <ScrollView
            className="flex-1 px-6"
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={palette.accent} />
            }
            scrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
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
          </ScrollView>
        ) : (
          <View style={{ flex: 1, width: '100%' }}>
            <FlashListElement
              data={filteredCards}
              renderItem={({ item }: { item: any }) => (
                <FolderCardListItem
                  card={item}
                  canEdit={user?.id ? canModifyItem(role, user.id, item.createdBy) : false}
                  startRevising={startRevising}
                  handleCardActions={handleCardActions}
                />
              )}
              estimatedItemSize={116}
              keyExtractor={folderCardKeyExtractor}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
              showsVerticalScrollIndicator={true}
              scrollEnabled={true}
              refreshControl={
                <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={palette.accent} />
              }
              ListHeaderComponent={
                cards.length === 0 ? null : (
                  <View 
                    className="mb-5 border rounded-[30px] p-5 shadow-sm mt-2"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                  >
                    <Text className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: palette.textSecondary }}>
                      Filter Questions
                    </Text>
                    
                    {/* Row 1: Easy, Medium, Hard */}
                    <View className="flex-row justify-between mb-3" style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => toggleFilter('easy')}
                        activeOpacity={0.75}
                        className="flex-1 py-3.5 rounded-2xl items-center border"
                        style={{
                          backgroundColor: activeFilters.includes('easy') ? addAlpha(palette.success, 0.08) : palette.inputBg,
                          borderColor: activeFilters.includes('easy') ? addAlpha(palette.success, 0.2) : palette.border,
                        }}
                      >
                        <Text 
                          className="text-xs font-bold" 
                          style={{ color: activeFilters.includes('easy') ? palette.success : palette.textSecondary }}
                        >
                          Easy ({easyCount})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => toggleFilter('medium')}
                        activeOpacity={0.75}
                        className="flex-1 py-3.5 rounded-2xl items-center border"
                        style={{
                          backgroundColor: activeFilters.includes('medium') ? addAlpha(palette.warning, 0.08) : palette.inputBg,
                          borderColor: activeFilters.includes('medium') ? addAlpha(palette.warning, 0.2) : palette.border,
                        }}
                      >
                        <Text 
                          className="text-xs font-bold" 
                          style={{ color: activeFilters.includes('medium') ? palette.warning : palette.textSecondary }}
                        >
                          Medium ({mediumCount})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => toggleFilter('hard')}
                        activeOpacity={0.75}
                        className="flex-1 py-3.5 rounded-2xl items-center border"
                        style={{
                          backgroundColor: activeFilters.includes('hard') ? addAlpha(palette.error, 0.08) : palette.inputBg,
                          borderColor: activeFilters.includes('hard') ? addAlpha(palette.error, 0.2) : palette.border,
                        }}
                      >
                        <Text 
                          className="text-xs font-bold" 
                          style={{ color: activeFilters.includes('hard') ? palette.error : palette.textSecondary }}
                        >
                          Hard ({hardCount})
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2: Skipped, Unattempted */}
                    <View className="flex-row justify-between" style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => toggleFilter('skipped')}
                        activeOpacity={0.75}
                        className="flex-1 py-3.5 rounded-2xl items-center border"
                        style={{
                          backgroundColor: activeFilters.includes('skipped') ? palette.accentBg : palette.inputBg,
                          borderColor: activeFilters.includes('skipped') ? palette.accent : palette.border,
                        }}
                      >
                        <Text 
                          className="text-xs font-bold" 
                          style={{ color: activeFilters.includes('skipped') ? palette.accent : palette.textSecondary }}
                        >
                          Skipped ({skippedCount})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => toggleFilter('unattempted')}
                        activeOpacity={0.75}
                        className="flex-1 py-3.5 rounded-2xl items-center border"
                        style={{
                          backgroundColor: activeFilters.includes('unattempted') ? palette.accentBg : palette.inputBg,
                          borderColor: activeFilters.includes('unattempted') ? palette.accent : palette.border,
                        }}
                      >
                        <Text 
                          className="text-xs font-bold" 
                          style={{ color: activeFilters.includes('unattempted') ? palette.accent : palette.textSecondary }}
                        >
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
                        <Text className="text-xs font-semibold underline" style={{ color: palette.textSecondary }}>
                          Reset Filters
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              }
              ListEmptyComponent={
                cards.length === 0 ? (
                  <View 
                    className="rounded-[30px] p-8 items-center border mt-2"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                  >
                    <Text className="font-semibold text-lg mb-2" style={{ color: palette.textPrimary }}>No cards match</Text>
                    <Text className="text-center text-sm" style={{ color: palette.textSecondary }}>
                      {canManageContent ? 'Add a card or clear filters.' : 'Nothing here yet.'}
                    </Text>
                  </View>
                ) : (
                  <View 
                    className="rounded-[30px] p-8 items-center border mt-2"
                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                  >
                    <Text className="font-semibold text-lg mb-2 text-center" style={{ color: palette.textPrimary }}>
                      No {activeFilters.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(' / ')} cards yet
                    </Text>
                    <Text className="text-center text-sm mb-5 leading-normal" style={{ color: palette.textSecondary }}>
                      Start classifying cards inside Reels to build your revision queue.
                    </Text>
                    <TouchableOpacity
                      onPress={resetFiltersToAll}
                      className="px-6 py-2.5 rounded-full"
                      style={{ backgroundColor: palette.accent }}
                    >
                      <Text style={{ color: palette.isDark ? palette.textPrimary : palette.surface, fontWeight: '600', fontSize: 12 }}>Show All Cards</Text>
                    </TouchableOpacity>
                  </View>
                )
              }
            />
          </View>
        )}
      </SafeAreaView>
    </ThemeBackground>
  );
}
