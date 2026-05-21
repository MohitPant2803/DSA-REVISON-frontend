import type { PopulatedUser } from './folder';

export const DifficultyLevels = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DifficultyLevels)[number];

export const ComplexityLevels = [
  'O(1)',
  'O(log n)',
  'O(n)',
  'O(n log n)',
  'O(n²)',
  'O(n³)',
  'O(2^n)',
] as const;
export type Complexity = (typeof ComplexityLevels)[number];

export type CardVisibility = 'public' | 'private';

export interface FolderRef {
  _id: string;
  title: string;
  icon?: string;
  color?: string;
}

export interface IRevisionCard {
  _id: string;
  title: string;
  topic: string;
  explanation: string;
  code?: string;
  image?: string;
  tags: string[];
  difficulty: Difficulty;
  complexity?: Complexity;
  examples: string[];
  folderId: string | FolderRef;
  createdBy: string;
  visibility: CardVisibility;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface IPopulatedRevisionCard extends Omit<IRevisionCard, 'createdBy' | 'folderId'> {
  createdBy: PopulatedUser;
  folderId: FolderRef | string;
  isFavorite?: boolean;
  isDifficult?: boolean;
  isArchived?: boolean;
}

export type CreateRevisionCardDTO = {
  title: string;
  topic: string;
  explanation: string;
  code?: string;
  image?: string;
  tags: string[];
  difficulty: Difficulty;
  complexity?: Complexity;
  examples: string[];
  folderId: string;
  visibility?: CardVisibility;
  order?: number;
};

export type UpdateRevisionCardDTO = Partial<CreateRevisionCardDTO>;

export interface PaginatedRevisionCards {
  results: IPopulatedRevisionCard[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}
