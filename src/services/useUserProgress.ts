/**
 * @file Reusable React Query hooks for fetching user progress data.
 */

import { useQuery, useMutation, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import * as progressService from '../services/progressService';

export const USER_PROGRESS_QUERY_KEY = 'userProgress';

/** @deprecated Use useDashboard for stats */
export const useGetUserProgress = () => {
  return useQuery({
    queryKey: [USER_PROGRESS_QUERY_KEY],
    queryFn: progressService.getDashboardStats,
  });
};

/**
 * Hook to create a mutation for updating the user's last viewed card.
 * This is designed to be a lightweight, "fire-and-forget" mutation.
 */
export const useUpdateLastViewedCard = (): UseMutationResult<void, Error, string> => {
  return useMutation({
    mutationFn: (cardId: string) => progressService.updateLastViewedCard(cardId),
    onError: (error) => {
      // In a real app, you might log this to a service like Sentry.
      // We don't show a toast because it's a background task and not critical for the user to know if it fails.
      console.error('Failed to update last viewed card:', error.message);
    },
  });
};