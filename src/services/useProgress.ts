/**
 * @file Reusable React Query hook for managing user progress on revision cards.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as progressService from '../services/progressService';
import { PaginatedRevisionCards, IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useBookmarkStore } from '@/store/useBookmarkStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { PersonalLibrary, LibraryEntry } from '@/types/progress';

const REVISION_CARDS_QUERY_KEY = 'revisionCards';

// Extend the card type for optimistic updates on the client
export type OptimisticCard = IPopulatedRevisionCard & {
  isFavorite?: boolean;
  isDifficult?: boolean;
};

/**
 * Hook to update user progress on a card (e.g., favorite, mark as difficult).
 * Implements optimistic updates for a seamless UX.
 */
export const useUpdateCardProgress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cardId, action, value }: { cardId: string; action: progressService.ProgressAction; value: boolean }) =>
      progressService.updateUserProgress(cardId, action, value),

    onMutate: async ({ cardId, action, value }) => {
      // 1. Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      
      const activePlaylistId = useBookmarkStore.getState().activePlaylistId;
      if (activePlaylistId) {
        await queryClient.cancelQueries({ queryKey: ['playlistDetail', activePlaylistId, 'cards'] });
      }
      await queryClient.cancelQueries({ queryKey: ['personalLibrary'] });

      // 2. Snapshot current values
      const previousRevisionCards = queryClient.getQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousPlaylistCards = activePlaylistId
        ? queryClient.getQueryData<IPopulatedRevisionCard[]>(['playlistDetail', activePlaylistId, 'cards'])
        : null;
      const previousLibrary = queryClient.getQueryData<PersonalLibrary>(['personalLibrary']);

      // 3. Optimistically update revisionCards query data
      queryClient.setQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return;
        return {
          ...oldData,
          results: oldData.results.map((card) => {
            if (card._id === cardId) {
              const updatedCard: OptimisticCard = { ...card };
              if (action === 'favorite') updatedCard.isFavorite = value;
              if (action === 'difficult') updatedCard.isDifficult = value;
              if (action === 'archived') updatedCard.isArchived = value;
              return updatedCard;
            }
            return card;
          }),
        };
      });

      // 4. Optimistically update active playlist cards
      if (activePlaylistId) {
        queryClient.setQueryData<IPopulatedRevisionCard[]>(['playlistDetail', activePlaylistId, 'cards'], (oldCards) => {
          if (!oldCards) return;

          // If we are in the 'likes' playlist and we unfavorite a card, remove it from the deck
          if (activePlaylistId === 'likes' && action === 'favorite' && !value) {
            return oldCards.filter((c) => c._id !== cardId);
          }

          return oldCards.map((card) => {
            if (card._id === cardId) {
              const updatedCard = { ...card };
              if (action === 'favorite') updatedCard.isFavorite = value;
              if (action === 'difficult') updatedCard.isDifficult = value;
              if (action === 'archived') updatedCard.isArchived = value;
              return updatedCard;
            }
            return card;
          });
        });
      }

      // 5. Optimistically update personal library
      if (previousLibrary) {
        queryClient.setQueryData<PersonalLibrary>(['personalLibrary'], (oldLibrary) => {
          if (!oldLibrary) return;
          let newFavorites = [...(oldLibrary.favorites ?? [])];

          if (action === 'favorite') {
            if (value) {
              const exists = newFavorites.some((f) => f.card?._id === cardId);
              if (!exists) {
                let foundCard: IPopulatedRevisionCard | undefined;
                for (const [, cache] of previousRevisionCards) {
                  const c = cache?.results?.find((r) => r._id === cardId);
                  if (c) {
                    foundCard = c;
                    break;
                  }
                }
                if (!foundCard && previousPlaylistCards) {
                  foundCard = previousPlaylistCards.find((c) => c._id === cardId);
                }

                if (foundCard) {
                  const entry: LibraryEntry = {
                    progressId: `temp-${Date.now()}`,
                    lastViewedAt: new Date().toISOString(),
                    favorite: true,
                    card: { ...foundCard, isFavorite: true },
                  };
                  newFavorites = [entry, ...newFavorites];
                }
              }
            } else {
              newFavorites = newFavorites.filter((f) => f.card?._id !== cardId);
            }
          }

          return {
            ...oldLibrary,
            favorites: newFavorites,
          };
        });
      }

      return { previousRevisionCards, previousPlaylistCards, previousLibrary, activePlaylistId };
    },

    onError: (err: any, variables, context) => {
      const isOffline = !err.status || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('timeout');

      if (isOffline) {
        usePlaylistStateStore.getState().enqueueOfflineAction({
          action: 'TOGGLE_FAVORITE',
          payload: { cardId: variables.cardId, value: variables.value },
          timestamp: Date.now()
        });

        // Optimistically set the local Zustand state for likes
        usePlaylistStateStore.getState().toggleFavoriteInStore(variables.cardId, variables.value);
        return;
      }

      if (context?.previousRevisionCards) {
        context.previousRevisionCards.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      if (context?.activePlaylistId && context?.previousPlaylistCards) {
        queryClient.setQueryData(['playlistDetail', context.activePlaylistId, 'cards'], context.previousPlaylistCards);
      }
      if (context?.previousLibrary) {
        queryClient.setQueryData(['personalLibrary'], context.previousLibrary);
      }
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: 'Your action could not be saved. Please try again.',
      });
    },

    onSettled: (data, error, variables, context) => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['personalLibrary'] });
      if (context?.activePlaylistId) {
        queryClient.invalidateQueries({ queryKey: ['playlistDetail', context.activePlaylistId, 'cards'] });
      }
    },
  });
};

export const useUpdatePlaylistMembership = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cardId, addToPlaylist, removeFromPlaylist }: { cardId: string; addToPlaylist?: string; removeFromPlaylist?: string }) =>
      progressService.updatePlaylistMembership(cardId, addToPlaylist, removeFromPlaylist),
    onMutate: async ({ cardId, addToPlaylist, removeFromPlaylist }) => {
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousQueries = queryClient.getQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] });

      queryClient.setQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return;
        return {
          ...oldData,
          results: oldData.results.map((c) => {
            if (c._id === cardId) {
              const playlists = new Set((c as any).playlists || []);
              if (addToPlaylist) playlists.add(addToPlaylist);
              if (removeFromPlaylist) playlists.delete(removeFromPlaylist);
              return { ...c, playlists: Array.from(playlists) };
            }
            return c;
          }),
        };
      });

      // Also optimistically update useCardPlaylistMembership
      const membershipKey = ['playlists', 'membership', cardId];
      await queryClient.cancelQueries({ queryKey: membershipKey });
      const prevMembership = queryClient.getQueryData<Record<string, boolean>>(membershipKey);
      
      queryClient.setQueryData<Record<string, boolean>>(membershipKey, (old) => {
        const next = { ...old };
        if (addToPlaylist) next[addToPlaylist] = true;
        if (removeFromPlaylist) next[removeFromPlaylist] = false;
        return next;
      });

      return { previousQueries, prevMembership, membershipKey };
    },
    onError: (err: any, variables, context) => {
      const isOffline = !err.status || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('timeout');

      if (isOffline) {
        usePlaylistStateStore.getState().enqueueOfflineAction({
          action: 'TOGGLE_PLAYLIST_ITEM',
          payload: {
            playlistId: variables.addToPlaylist || variables.removeFromPlaylist,
            cardId: variables.cardId,
            value: !!variables.addToPlaylist
          },
          timestamp: Date.now()
        });

        // Optimistically set the local Zustand state for playlist membership
        const playlistId = variables.addToPlaylist || variables.removeFromPlaylist;
        if (playlistId) {
          usePlaylistStateStore.getState().toggleCustomPlaylistItemInStore(playlistId, variables.cardId, !!variables.addToPlaylist);
        }
        return;
      }

      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      if (context?.prevMembership) {
        queryClient.setQueryData(context.membershipKey, context.prevMembership);
      }
    },
    onSettled: (data, err, variables) => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'membership', variables.cardId] });
    },
  });
};

export const useUpdateDifficultyState = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cardId, difficultyState }: { cardId: string; difficultyState: 'easy' | 'medium' | 'hard' | 'skipped' | null }) =>
      progressService.updateDifficultyState(cardId, difficultyState),

    onMutate: async ({ cardId, difficultyState }) => {
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      
      const activePlaylistId = useBookmarkStore.getState().activePlaylistId;
      if (activePlaylistId) {
        await queryClient.cancelQueries({ queryKey: ['playlistDetail', activePlaylistId, 'cards'] });
      }
      await queryClient.cancelQueries({ queryKey: ['personalLibrary'] });

      const previousRevisionCards = queryClient.getQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousPlaylistCards = activePlaylistId
        ? queryClient.getQueryData<IPopulatedRevisionCard[]>(['playlistDetail', activePlaylistId, 'cards'])
        : null;
      const previousLibrary = queryClient.getQueryData<PersonalLibrary>(['personalLibrary']);

      queryClient.setQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return;
        return {
          ...oldData,
          results: oldData.results.map((card) => {
            if (card._id === cardId) {
              const qp = difficultyState
                ? {
                    attemptStatus: difficultyState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                    perceivedDifficultyByUser: difficultyState === 'skipped' ? null : (difficultyState as any),
                  }
                : null;
              return { ...card, difficultyState, currentUserQuestionProgress: qp };
            }
            return card;
          }),
        };
      });

      if (activePlaylistId) {
        queryClient.setQueryData<IPopulatedRevisionCard[]>(['playlistDetail', activePlaylistId, 'cards'], (oldCards) => {
          if (!oldCards) return;
          return oldCards.map((card) => {
            if (card._id === cardId) {
              const qp = difficultyState
                ? {
                    attemptStatus: difficultyState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                    perceivedDifficultyByUser: difficultyState === 'skipped' ? null : (difficultyState as any),
                  }
                : null;
              return { ...card, difficultyState, currentUserQuestionProgress: qp };
            }
            return card;
          });
        });
      }

      return { previousRevisionCards, previousPlaylistCards, previousLibrary, activePlaylistId };
    },

    onError: (err: any, variables, context) => {
      const isOffline = !err.status || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('timeout');

      if (isOffline) {
        usePlaylistStateStore.getState().enqueueOfflineAction({
          action: 'CLASSIFY_CARD',
          payload: { cardId: variables.cardId, state: variables.difficultyState },
          timestamp: Date.now()
        });

        // Also update local Zustand persistent ratings in store!
        const cardObj = queryClient.getQueryData<IPopulatedRevisionCard[]>(['playlistDetail', context?.activePlaylistId, 'cards'])?.find(c => c._id === variables.cardId) || {} as any;
        usePlaylistStateStore.getState().transferCard(variables.cardId, cardObj, variables.difficultyState);
        return;
      }

      if (context?.previousRevisionCards) {
        context.previousRevisionCards.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      if (context?.activePlaylistId && context?.previousPlaylistCards) {
        queryClient.setQueryData(['playlistDetail', context.activePlaylistId, 'cards'], context.previousPlaylistCards);
      }
      if (context?.previousLibrary) {
        queryClient.setQueryData(['personalLibrary'], context.previousLibrary);
      }
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: 'Could not update difficulty state.',
      });
    },

    onSettled: (data, error, variables, context) => {
        // Preserve optimistic UI for difficulty state by invalidating dependent queries reactively
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        queryClient.invalidateQueries({ queryKey: ['personalLibrary'] });
        queryClient.invalidateQueries({ queryKey: ['playlists'] });
        queryClient.invalidateQueries({ queryKey: ['playlistDetail'] });
        queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      },
  });
};