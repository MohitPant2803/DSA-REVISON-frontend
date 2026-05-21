/**
 * @file Centralized TypeScript types for Revision Cards.
 * @description This file defines the core data structures for revision cards,
 * including the main interface and DTOs (Data Transfer Objects) for
 * creating and updating cards. This promotes type safety and consistency
 * across the application.
 */

// Defines the possible difficulty levels for a card.
// Using `as const` creates a readonly tuple, allowing us to derive a string literal type from it.
export const DifficultyLevels = ['Easy', 'Medium', 'Hard'] as const;

// The `Difficulty` type is a union of the string literals from `DifficultyLevels`.
// This ensures that `difficulty` can only be one of these three values.
export type Difficulty = (typeof DifficultyLevels)[number];

/**
 * Represents the complete structure of a Revision Card as stored in the database
 * and returned from the API.
 */
export interface IRevisionCard {
  _id: string;
  title: string;
  topic: string;
  explanation: string;
  code?: string;
  image?: string;
  tags: string[];
  difficulty: Difficulty;
  createdBy: string; // Should be a user's ID (e.g., MongoDB ObjectId string)
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}

/**
 * Data Transfer Object (DTO) for creating a new revision card.
 * It omits database-generated fields like _id, createdAt, and updatedAt.
 * `createdBy` is also omitted as it's typically added on the server from the authenticated user's session.
 */
export type CreateRevisionCardDTO = Omit<IRevisionCard, '_id' | 'createdAt' | 'updatedAt' | 'createdBy'>;

/**
 * Data Transfer Object (DTO) for updating an existing revision card.
 * All fields are made optional, as an update operation might only modify a subset of the card's properties.
 */
export type UpdateRevisionCardDTO = Partial<CreateRevisionCardDTO>;