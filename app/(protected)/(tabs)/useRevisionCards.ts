/**
 * @file Reusable React Query hooks for managing revision cards.
 * @description This file provides a set of hooks for fetching, creating, updating,
 * and deleting revision cards, with support for loading/error states, pagination,
 * and optimistic updates for a smooth user experience.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import * as revisionService from '../../../src/services/revisionService';
import {
  IRevisionCard as IBaseRevisionCard,
  CreateRevisionCardDTO,
  UpdateRevisionCardDTO,
} from '../../../src/types/revision';
import {
  QueryRevisionCardsInput,
  PaginatedRevisionCards as IServicePaginatedResponse,
} from '../../../src/services/revisionService';

// --- TYPE ENHANCEMENTS ---

/**
 * Represents the 'createdBy' field when it's populated by the backend.
 */
type PopulatedCreator = {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
};

/**
 * Represents the full Revision Card object as returned by the API,
 * with the `createdBy` field populated. This is the type used in the UI.
 */
export type IPopulatedRevisionCard = Omit<IBaseRevisionCard, 'createdBy'> & {
  createdBy: PopulatedCreator;
  // Client-side state for optimistic updates from useProgress hook
  isFavorite?: boolean;
  isDifficult?: boolean;
};

/**
 * Represents the paginated API response with populated revision cards.
 */
export type PaginatedRevisionCards = Omit<IServicePaginatedResponse, 'results'> & {
  results: IPopulatedRevisionCard[];
};

const REVISION_CARDS_QUERY_KEY = 'revisionCards';

// --- HOOKS ---

/**
 * Hook to fetch a paginated and filtered list of revision cards.
 * @param query - The query parameters for filtering and pagination.
 * @returns The result of the query from React Query.
 */
export const useGetRevisionCards = (
  query: QueryRevisionCardsInput
): UseQueryResult<PaginatedRevisionCards, Error> => {
  return useQuery({
    // The query key is an array that uniquely identifies this query.
    // When `query` changes, react-query will refetch the data.
    queryKey: [REVISION_CARDS_QUERY_KEY, query],
    // The query function calls the service to fetch data.
    // We cast the result to our enhanced paginated type.
    queryFn: () => revisionService.getRevisionCards(query) as Promise<PaginatedRevisionCards>,
    // `keepPreviousData` is useful for pagination to keep showing old data while new data loads.
    keepPreviousData: true,
  });
};

/**
 * Hook to create a new revision card.
 * Provides a `mutate` function to trigger the creation.
 * Invalidates the revision cards list on success to refetch and show the new card.
 */
export const useCreateRevisionCard = (): UseMutationResult<
  IPopulatedRevisionCard,
  Error,
  CreateRevisionCardDTO
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revisionService.createRevisionCard,
    onSuccess: () => {
      // Invalidate all queries starting with `REVISION_CARDS_QUERY_KEY` to refetch all pages.
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
    },
  });
};

/**
 * Hook to update an existing revision card with optimistic updates.
 * The UI updates instantly, assuming the API call will succeed.
 */
export const useUpdateRevisionCard = (): UseMutationResult<
  IPopulatedRevisionCard,
  Error,
  { cardId: string; updateData: UpdateRevisionCardDTO }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revisionService.updateRevisionCard,
    onMutate: async ({ cardId, updateData }) => {
      // 1. Cancel any outgoing refetches to prevent them from overwriting our optimistic update.
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });

      // 2. Snapshot the previous state of all relevant queries.
      const previousQueries = queryClient.getQueriesData<PaginatedRevisionCards>([REVISION_CARDS_QUERY_KEY]);

      // 3. Optimistically update the cache.
      queryClient.setQueriesData<PaginatedRevisionCards>([REVISION_CARDS_QUERY_KEY], (oldData) => {
        if (!oldData) return undefined;
        return {
          ...oldData,
          results: oldData.results.map((card) =>
            card._id === cardId ? { ...card, ...updateData } : card
          ),
        };
      });

      // 4. Return a context object with the snapshotted value.
      return { previousQueries };
    },
    // If the mutation fails, roll back to the previous state.
    onError: (err, variables, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
    },
    // Always refetch after error or success to ensure data consistency with the server.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
    },
  });
};

/**
 * Hook to delete a revision card with optimistic updates.
 * The card is removed from the UI instantly.
 */
export const useDeleteRevisionCard = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revisionService.deleteRevisionCard,
    onMutate: async (cardId) => {
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousQueries = queryClient.getQueriesData<PaginatedRevisionCards>([REVISION_CARDS_QUERY_KEY]);
      queryClient.setQueriesData<PaginatedRevisionCards>([REVISION_CARDS_QUERY_KEY], (oldData) => {
        if (!oldData) return undefined;
        return {
          ...oldData,
          results: oldData.results.filter((card) => card._id !== cardId),
          totalResults: oldData.totalResults > 0 ? oldData.totalResults - 1 : 0,
        };
      });
      return { previousQueries };
    },
    onError: (err, variables, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
    },
  });
};