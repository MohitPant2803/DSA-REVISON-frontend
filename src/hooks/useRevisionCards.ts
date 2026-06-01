import { useShallow } from 'zustand/react/shallow';
import { useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
        list = list.filter((c) => {
          if (!c) return false;
          const fid = typeof c.folderId === 'object' && c.folderId !== null ? c.folderId._id : c.folderId;
          return fid === query.folderId || c.rootFolderId === query.folderId || c.subfolderIds?.includes(query.folderId!);
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
      try {
        const paginated = await revisionService.getRevisionCards(query || {});
        if (paginated && paginated.results) {
          usePlaylistStateStore.getState().hydratePlaylistCards('all', paginated.results);
        }
        return {
          ...paginated,
          results: paginated.results?.map(c => c._id) || [],
        };
      } catch (err) {
        return {
          results: cardIds,
          page: 1,
          limit: 100,
          totalPages: 1,
          totalResults: cardIds.length,
        } as any;
      }
    },
    enabled: !hasSyncedThisSession && !isGuest,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'stale',
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const hasLocal = hasHydrated || cardIds.length > 0;

  return {
    data: hasLocal ? {
      results: cardIds,
      page: 1,
      limit: 100,
      totalPages: 1,
      totalResults: cardIds.length,
    } as any : {
      ...queryResult.data,
      results: queryResult.data?.results?.map((c: any) => typeof c === 'string' ? c : c._id) || [],
    },
    isLoading: queryResult.isLoading && !hasLocal,
    isError: queryResult.isError && !hasLocal,
    isFetching: queryResult.isFetching,
    error: queryResult.error,
    refetch: queryResult.refetch,
    isRefetching: queryResult.isRefetching,
  };
};

export const useGetRevisionCard = (cardId: string | undefined) => {
  const card = usePlaylistStateStore((s) => cardId ? s.cardsById[cardId] : undefined);
  const hydratePlaylistCards = usePlaylistStateStore((s) => s.hydratePlaylistCards);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const queryResult = useQuery({
    queryKey: ['revisionCards', 'detail', cardId],
    queryFn: async () => {
      if (!cardId) return null;
      try {
        const data = await revisionService.getRevisionCardById(cardId);
        if (data) {
          hydratePlaylistCards('all', [data]);
        }
        return data;
      } catch (err) {
        return card || null;
      }
    },
    enabled: !!cardId && !hasSyncedThisSession && !isGuest,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    data: card || queryResult.data,
    isLoading: queryResult.isLoading && !card,
    isError: queryResult.isError && !card,
    isFetching: queryResult.isFetching,
    error: queryResult.error,
    refetch: queryResult.refetch,
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
    return Object.values(cardsById)
      .filter((c) => {
        if (!c) return false;
        const fid = typeof c.folderId === 'object' && c.folderId !== null ? c.folderId._id : c.folderId;
        return fid === folderId || c.rootFolderId === folderId || c.subfolderIds?.includes(folderId!);
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [cardsById, folderId]);

  const queryResult = useQuery({
    queryKey: ['cards_folder', folderId, query],
    queryFn: async () => {
      if (!folderId) return { results: [], page: 1, limit: 100, totalPages: 1, totalResults: 0 };
      try {
        const paginated = await revisionService.getCardsByFolder(folderId, query);
        if (paginated && paginated.results) {
          hydratePlaylistCards(folderId, paginated.results);
        }
        return paginated;
      } catch (err) {
        return {
          results: filteredCards,
          page: 1,
          limit: 100,
          totalPages: 1,
          totalResults: filteredCards.length,
        } as PaginatedRevisionCards;
      }
    },
    enabled: !!folderId && !hasSyncedThisSession && !isGuest,
    staleTime: 1000 * 60 * 10,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const hasLocal = hasHydrated || filteredCards.length > 0;

  return {
    data: hasLocal ? {
      results: filteredCards,
      page: 1,
      limit: 100,
      totalPages: 1,
      totalResults: filteredCards.length,
    } as PaginatedRevisionCards : queryResult.data,
    isLoading: queryResult.isLoading && !hasLocal,
    isError: queryResult.isError && !hasLocal,
    isFetching: queryResult.isFetching,
    error: queryResult.error,
    refetch: queryResult.refetch,
    isRefetching: queryResult.isRefetching,
  };
};

// 2. Mutations
export const useCreateRevisionCard = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (dto: CreateRevisionCardDTO) => {
      const tempId = `temp-card-${Date.now()}`;
      const tempCard: IPopulatedRevisionCard = {
        _id: tempId,
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
        cardsById: { ...state.cardsById, [tempId]: tempCard },
      }));

      // 2. Enqueue offline action
      enqueueOfflineAction({
        action: 'CREATE_CARD',
        payload: { tempId, dto },
        timestamp: Date.now(),
      });

      return Promise.resolve(tempCard);
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
