/**
 * @file Reusable React Query hooks for fetching user progress data.
 */

import { useQuery, useMutation, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import * as progressService from '../services/progressService';
import { IUserProgress } from '../types/progress';

export const USER_PROGRESS_QUERY_KEY = 'userProgress';

/**
 * Hook to fetch the current user's complete progress profile.
 * @returns The result of the query from React Query.
 */
export const useGetUserProgress = (): UseQueryResult<IUserProgress, Error> => {
  return useQuery({
    queryKey: [USER_PROGRESS_QUERY_KEY],
    queryFn: progressService.getUserProgress,
  });
};

/**
 * Hook to create a mutation for updating the user's last viewed card.
 * This is designed to be a lightweight, "fire-and-forget" mutation.
 */
export const useUpdateLastViewedCard = (): UseMutationResult<
  { message: string },
  Error,
  string
> => {
  return useMutation({
    mutationFn: (cardId: string) => progressService.updateLastViewedCard(cardId),
    onError: (error) => {
      // In a real app, you might log this to a service like Sentry.
      // We don't show a toast because it's a background task and not critical for the user to know if it fails.
      console.error('Failed to update last viewed card:', error.message);
    },
  });
};