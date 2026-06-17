import { useShallow } from 'zustand/react/shallow';
import { useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { getAllDescendantFolderIds } from '@/utils/folderHelpers';
import * as revisionService from '@/services/revisionService';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import type {
  CreateRevisionCardDTO,
  IPopulatedRevisionCard,
  UpdateRevisionCardDTO,
  ISlide,
  PaginatedRevisionCards,
} from '@/types/revision';
import type { QueryRevisionCardsInput } from '@/services/revisionService';

// Crucial: Re-exporting these type interfaces for codebase compatibility
export type { IPopulatedRevisionCard, PaginatedRevisionCards, ISlide };
export type { QueryRevisionCardsInput } from '@/services/revisionService';

// 1. Local-First Hybrid Read hooks for Revision Cards
export const useGetRevisionCards = (query?: QueryRevisionCardsInput) => {
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');
  const cardIds = usePlaylistStateStore(
    useShallow((s) => {
      let list = Object.values(s.cardsById);

      if (query?.folderId) {
        const descendantIds = getAllDescendantFolderIds(query.folderId, s.foldersById);
        list = list.filter((c) => {
          if (!c) return false;
          const fid = typeof c.folderId === 'object' && c.folderId !== null ? c.folderId._id : c.folderId;
          return descendantIds.has(fid) || (c.rootFolderId && descendantIds.has(c.rootFolderId));
        });
      }

      if (query?.search) {
        const sVal = query.search.toLowerCase();
        list = list.filter((c) => c && (c.title.toLowerCase().includes(sVal) || c.topic.toLowerCase().includes(sVal)));
      }

      return list.sort((a, b) => (a.order || 0) - (b.order || 0)).map((c) => c._id);
    })
  );

  const queryResult = useQuery({
    queryKey: ['revisionCards', query],
    queryFn: async () => {
      return {
        results: cardIds,
        page: 1,
        limit: 100,
        totalPages: 1,
        totalResults: cardIds.length,
      };
    },
    enabled: false,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);

  return {
    data: {
      results: cardIds,
      page: 1,
      limit: 100,
      totalPages: 1,
      totalResults: cardIds.length,
    },
    isLoading: !hasHydrated,
    isError: false,
    isFetching: false,
    error: null,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[useGetRevisionCards] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
    isRefetching: queryResult.isRefetching,
  };
};

export const useGetRevisionCard = (cardId: string | undefined) => {
  const card = usePlaylistStateStore((s) => cardId ? s.cardsById[cardId] : undefined);

  useEffect(() => {
    if (cardId && card && !card.isContentFullyHydrated) {
      usePlaylistStateStore.getState().hydrateCardContentOnDemand(cardId).catch((err) => {
        console.warn(`[useGetRevisionCard] Failed on-demand content hydration for card: ${cardId}`, err.message);
      });
    }
  }, [cardId, card]);

  const queryResult = useQuery({
    queryKey: ['revisionCards', 'detail', cardId],
    queryFn: async () => {
      return card || null;
    },
    enabled: false,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);

  return {
    data: card || null,
    isLoading: !hasHydrated && !card,
    isError: false,
    isFetching: false,
    error: null,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[useGetRevisionCard] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
  };
};

export const useGetCardsByFolder = (
  folderId: string | undefined,
  query?: QueryRevisionCardsInput
) => {
  const cardsById = usePlaylistStateStore((s) => s.cardsById);
  const hydratePlaylistCards = usePlaylistStateStore((s) => s.hydratePlaylistCards);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const filteredCards = useMemo(() => {
    if (!folderId) return [];
    const descendantIds = getAllDescendantFolderIds(folderId, usePlaylistStateStore.getState().foldersById);
    return Object.values(cardsById)
      .filter((c) => {
        if (!c) return false;
        const fid = typeof c.folderId === 'object' && c.folderId !== null ? c.folderId._id : c.folderId;
        return descendantIds.has(fid) || (c.rootFolderId && descendantIds.has(c.rootFolderId));
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [cardsById, folderId]);

  const queryResult = useQuery({
    queryKey: ['cards_folder', folderId, query],
    queryFn: async () => {
      return {
        results: filteredCards,
        page: 1,
        limit: 100,
        totalPages: 1,
        totalResults: filteredCards.length,
      } as PaginatedRevisionCards;
    },
    enabled: false,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);

  return {
    data: {
      results: filteredCards,
      page: 1,
      limit: 100,
      totalPages: 1,
      totalResults: filteredCards.length,
    } as PaginatedRevisionCards,
    isLoading: !hasHydrated && filteredCards.length === 0,
    isError: false,
    isFetching: false,
    error: null,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[useGetCardsByFolder] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
    isRefetching: queryResult.isRefetching,
  };
};

// 2. Mutations
export const useCreateRevisionCard = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (dto: CreateRevisionCardDTO) => {
      const uuid = Crypto.randomUUID();
      const card: IPopulatedRevisionCard = {
        _id: uuid,
        title: dto.title,
        topic: dto.topic,
        explanation: dto.explanation,
        code: dto.code || '',
        image: dto.image || '',
        tags: dto.tags || [],
        difficulty: dto.difficulty,
        complexity: dto.complexity || '',
        examples: dto.examples || [],
        folderId: dto.folderId,
        createdBy: user 
          ? { _id: user.id, name: user.name, email: user.email, role: user.role } 
          : { _id: 'guest', name: 'Guest', email: '' },
        visibility: dto.visibility || 'public',
        order: dto.order || 0,
        slides: dto.slides || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Optimistic Update Local Zustand Store immediately
      usePlaylistStateStore.setState((state) => ({
        cardsById: { ...state.cardsById, [uuid]: card },
      }));

      // 2. Enqueue offline action
      enqueueOfflineAction({
        action: 'CREATE_CARD',
        payload: { cardId: uuid, dto: { ...dto, _id: uuid } },
        timestamp: Date.now(),
      });

      return Promise.resolve(card);
    },
  });
};

export const useUpdateRevisionCard = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async ({ cardId, updateData }: { cardId: string; updateData: UpdateRevisionCardDTO }) => {
      // 1. Optimistic update
      usePlaylistStateStore.setState((state) => {
        const existing = state.cardsById[cardId];
        if (!existing) return {};
        return {
          cardsById: {
            ...state.cardsById,
            [cardId]: { ...existing, ...updateData } as IPopulatedRevisionCard,
          },
        };
      });

      // 2. Enqueue offline action
      enqueueOfflineAction({
        action: 'UPDATE_CARD',
        payload: { cardId, updateData },
        timestamp: Date.now(),
      });

      return Promise.resolve({ _id: cardId, ...updateData } as any);
    },
  });
};

export const useDeleteRevisionCard = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);
  const deleteCardInStore = usePlaylistStateStore((s) => s.deleteCardInStore);

  return useMutation({
    mutationFn: async (cardId: string) => {
      // 1. Centralized deletion and relationship cleanup in store
      deleteCardInStore(cardId);

      // 2. Enqueue action
      enqueueOfflineAction({
        action: 'DELETE_CARD',
        payload: { cardId },
        timestamp: Date.now(),
      });

      return Promise.resolve();
    },
  });
};
