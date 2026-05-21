/**
 * @file Reusable React Query hook for managing user progress on revision cards.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as progressService from '../services/progressService';
import { PaginatedRevisionCards, IPopulatedRevisionCard } from '@/hooks/useRevisionCards';

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
      await queryClient.cancelQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      const previousQueries = queryClient.getQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] });

      queryClient.setQueriesData<PaginatedRevisionCards>({ queryKey: [REVISION_CARDS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return;

        const newResults = oldData.results.map((card) => {
          if (card._id === cardId) {
            const updatedCard: OptimisticCard = { ...card };
            if (action === 'favorite') updatedCard.isFavorite = value;
            if (action === 'difficult') updatedCard.isDifficult = value;
            if (action === 'archived') updatedCard.isArchived = value;
            return updatedCard;
          }
          return card;
        });

        return { ...oldData, results: newResults };
      });

      return { previousQueries };
    },

    onError: (err, variables, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: 'Your action could not be saved. Please try again.',
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [REVISION_CARDS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['personalLibrary'] });
    },
  });
};