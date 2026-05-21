/**
 * @file Service layer for user progress operations.
 * @description This file contains functions to interact with the backend API
 * for tracking and fetching user revision progress.
 */

import { IUserProgress } from '../types/progress';

// import apiClient from './apiClient'; // Assuming a pre-configured axios instance

/**
 * Fetches the complete progress profile for the current user.
 * @returns A promise that resolves with the user's progress data.
 */
export const getUserProgress = async (): Promise<IUserProgress> => {
  console.log('Fetching user progress from API...');
  // In a real app, this would be:
  // const { data } = await apiClient.get('/progress');
  // return data;

  // Mock data for demonstration
  await new Promise((resolve) => setTimeout(resolve, 700));
  return {
    _id: 'progress123',
    userId: 'user123',
    cards: [], // This would be populated in a real scenario
    streak: { current: 5, longest: 12, lastRevisedDate: '2023-10-26' },
    lastViewedCardId: 'card_id_for_continue_learning', // A sample card ID
    dailyGoal: 10,
    revisionsToday: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

// Defines the types of progress actions a user can take.
export type ProgressAction = 'favorite' | 'difficult';

/**
 * Updates the user's progress for a specific card.
 * @param cardId - The ID of the card to update progress for.
 * @param action - The type of progress action (e.g., 'favorite').
 * @param value - The new state for the action (true to set, false to unset).
 * @returns A promise that resolves with a success message.
 */
export const updateUserProgress = async (
  cardId: string,
  action: ProgressAction,
  value: boolean
): Promise<{ message: string }> => {
  // In a real app, this would make a POST/PATCH request to your backend.
  // e.g., const { data } = await apiClient.post('/user/progress', { cardId, action, value });
  console.log(`Syncing progress for card ${cardId}: ${action} -> ${value}`);

  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay
  return { message: 'Progress updated successfully' };
};

/**
 * Updates the last card viewed by the user.
 * @param cardId - The ID of the card that was last viewed.
 * @returns A promise that resolves with a success message.
 */
export const updateLastViewedCard = async (cardId: string): Promise<{ message: string }> => {
  // This is a "fire-and-forget" operation on the client, so we don't need to show loading states.
  // The backend will handle this update.
  // e.g., await apiClient.post('/progress/last-viewed', { cardId });
  console.log(`Syncing last viewed card: ${cardId}`);

  await new Promise((resolve) => setTimeout(resolve, 300));
  return { message: 'Last viewed card updated' };
};