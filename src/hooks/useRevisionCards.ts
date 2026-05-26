import { useMemo } from 'react';
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
  const cardsById = usePlaylistStateStore((s) => s.cardsById);

  const cardList = useMemo(() => {
    let list = Object.values(cardsById);

    if (query?.folderId) {
      list = list.filter((c) => {
        if (!c) return false;
        const fid = typeof c.folderId === 'object' && c.folderId !== null ? c.folderId._id : c.folderId;
        return fid === query.folderId || c.rootFolderId === query.folderId || c.subfolderIds?.includes(query.folderId!);
      });
    }

    if (query?.search) {
      const s = query.search.toLowerCase();
      list = list.filter((c) => c && (c.title.toLowerCase().includes(s) || c.topic.toLowerCase().includes(s)));
    }

    return list.sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [cardsById, query?.folderId, query?.search]);

  const queryResult = useQuery({
    queryKey: ['revisionCards', query],
    queryFn: async () => {
      try {
        const paginated = await revisionService.getRevisionCards(query || {});
        if (paginated && paginated.results) {
          usePlaylistStateStore.getState().hydratePlaylistCards('all', paginated.results);
        }
        return paginated;
      } catch (err) {
        return {
          results: cardList,
          page: 1,
          limit: 100,
          totalPages: 1,
          totalResults: cardList.length,
        } as PaginatedRevisionCards;
      }
    },
    staleTime: 1000 * 60,
  });

  const hasLocal = cardList.length > 0;

  return {
    data: hasLocal ? {
      results: cardList,
      page: 1,
      limit: 100,
      totalPages: 1,
      totalResults: cardList.length,
    } as PaginatedRevisionCards : queryResult.data,
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
    enabled: !!cardId,
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
    enabled: !!folderId,
    staleTime: 1000 * 30,
  });

  const hasLocal = filteredCards.length > 0;

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
        action: 'CREATE_FOLDER',
        payload: { tempId, dto },
        timestamp: Date.now(),
      });

      try {
        const card = await revisionService.createRevisionCard(dto);
        usePlaylistStateStore.setState((state) => {
          const nextCards = { ...state.cardsById };
          delete nextCards[tempId];
          nextCards[card._id] = card;
          return { cardsById: nextCards };
        });
        return card;
      } catch (error) {
        if (__DEV__) console.warn('[Offline Mode] Card created locally. Sync queued.', error);
        return tempCard;
      }
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
        action: 'UPDATE_FOLDER',
        payload: { cardId, updateData },
        timestamp: Date.now(),
      });

      try {
        const card = await revisionService.updateRevisionCard({ cardId, updateData });
        return card;
      } catch (error) {
        if (__DEV__) console.warn('[Offline Mode] Card updated locally. Sync queued.', error);
        return { _id: cardId, ...updateData } as any;
      }
    },
  });
};

export const useDeleteRevisionCard = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async (cardId: string) => {
      // 1. Optimistic Delete local cache
      usePlaylistStateStore.setState((state) => {
        const nextCards = { ...state.cardsById };
        delete nextCards[cardId];
        return { cardsById: nextCards };
      });

      // 2. Enqueue action
      enqueueOfflineAction({
        action: 'DELETE_FOLDER',
        payload: { cardId },
        timestamp: Date.now(),
      });

      try {
        await revisionService.deleteRevisionCard(cardId);
      } catch (error) {
        if (__DEV__) console.warn('[Offline Mode] Card deleted locally. Sync queued.', error);
      }
    },
  });
};
