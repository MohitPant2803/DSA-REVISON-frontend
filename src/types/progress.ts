/**
 * @file Centralized TypeScript types for User Revision Progress.
 * @description This file defines the data structures for tracking a user's
 * learning progress, including streaks, individual card status, and session data.
 * This enables features like "Continue Learning", "Streaks", and "Difficult Cards".
 */

// The actions a user can perform on a card that we want to track.
export type ProgressAction = 'favorite' | 'difficult' | 'revised';

/**
 * Represents the progress status for a single revision card for a specific user.
 * This would typically be a sub-document within a user's progress record.
 */
export interface ICardProgress {
  cardId: string; // Reference to IRevisionCard['_id']
  isFavorite: boolean;
  isDifficult: boolean;
  lastRevisedAt?: string; // ISO 8601 date string
  revisionCount: number;
  // Future properties for spaced repetition could go here (e.g., easeFactor, interval)
}

/**
 * Represents the user's daily revision streak.
 */
export interface IRevisionStreak {
  current: number;
  longest: number;
  lastRevisedDate?: string; // The date (YYYY-MM-DD) of the last revision.
}

/**
 * Represents the complete progress data for a single user.
 * This is designed to be stored as a single document in a 'userProgress' collection,
 * linked to a user.
 */
export interface IUserProgress {
  _id: string; // A unique ID for the progress document itself.
  userId: string; // The ID of the user this progress belongs to.
  cards: ICardProgress[]; // An array of progress records for each card the user has interacted with.
  streak: IRevisionStreak;
  lastViewedCardId?: string; // For the "Continue Learning" feature
  dailyGoal: number;
  revisionsToday: number;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}

/**
 * Data Transfer Object (DTO) for updating a specific card's progress.
 */
export type UpdateCardProgressDTO = Pick<ICardProgress, 'cardId' | 'isFavorite' | 'isDifficult'>;