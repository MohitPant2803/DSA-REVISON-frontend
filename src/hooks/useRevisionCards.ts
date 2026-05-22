import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import * as revisionService from '@/services/revisionService';
import type {
  CreateRevisionCardDTO,
  IPopulatedRevisionCard,
  UpdateRevisionCardDTO,
  ISlide,
} from '@/types/revision';
import type { QueryRevisionCardsInput } from '@/services/revisionService';
import type { PaginatedRevisionCards } from '@/types/revision';

export type { IPopulatedRevisionCard, PaginatedRevisionCards, ISlide };
export type { QueryRevisionCardsInput } from '@/services/revisionService';

const REVISION_CARDS_QUERY_KEY = 'revisionCards';

export const useGetRevisionCards = (
  query: QueryRevisionCardsInput
): UseQueryResult<PaginatedRevisionCards, Error> => {
  return useQuery({
    queryKey: [REVISION_CARDS_QUERY_KEY, query],
    queryFn: () => revisionService.getRevisionCards(query),
    placeholderData: keepPreviousData,
  });
};

export const useGetRevisionCard = (cardId: string | undefined) => {
  return useQuery({
    queryKey: [REVISION_CARDS_QUERY_KEY, 'detail', cardId],
    queryFn: () => revisionService.getRevisionCardById(cardId!),
    enabled: !!cardId,
  });
};

export const useGetCardsByFolder = (
  folderId: string | undefined,
  query?: QueryRevisionCardsInput
) => {
  return useQuery({
    queryKey: [REVISION_CARDS_QUERY_KEY, 'folder', folderId, query],
    queryFn: () => revisionService.getCardsByFolder(folderId!, query),
    enabled: !!folderId,
    placeholderData: keepPreviousData,
  });
};

export const useCreateRevisionCard = (): UseMutationResult<
  IPopulatedRevisionCard,
  Error,
  CreateRevisionCardDTO
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revisionService.createRevisionCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
    },
  });
};

export const useUpdateRevisionCard = (): UseMutationResult<
  IPopulatedRevisionCard,
  Error,
  { cardId: string; updateData: UpdateRevisionCardDTO }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revisionService.updateRevisionCard,
    onMutate: async ({ cardId, updateData }) => {
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousQueries = queryClient.getQueriesData<PaginatedRevisionCards>({
        queryKey: [REVISION_CARDS_QUERY_KEY],
      });
      queryClient.setQueriesData<PaginatedRevisionCards>(
        { queryKey: [REVISION_CARDS_QUERY_KEY] },
        (oldData) => {
          if (!oldData) return undefined;
          return {
            ...oldData,
            results: oldData.results.map((card) =>
              card._id === cardId ? { ...card, ...updateData } : card
            ),
          };
        }
      );
      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      context?.previousQueries?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
    },
  });
};

export const useDeleteRevisionCard = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revisionService.deleteRevisionCard,
    onMutate: async (cardId) => {
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousQueries = queryClient.getQueriesData<PaginatedRevisionCards>({
        queryKey: [REVISION_CARDS_QUERY_KEY],
      });
      queryClient.setQueriesData<PaginatedRevisionCards>(
        { queryKey: [REVISION_CARDS_QUERY_KEY] },
        (oldData) => {
          if (!oldData) return undefined;
          return {
            ...oldData,
            results: oldData.results.filter((card) => card._id !== cardId),
            totalResults: oldData.totalResults > 0 ? oldData.totalResults - 1 : 0,
          };
        }
      );
      return { previousQueries };
    },
    onError: (_err, _vars, context) => {
      context?.previousQueries?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
    },
  });
};
