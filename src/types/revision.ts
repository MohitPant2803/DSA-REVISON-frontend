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

export type Complexity = string;

export type CardVisibility = 'public' | 'private';

export interface ISlide {
  type?: string;
  headline: string;
  body?: string;
  code?: string;
  blocks?: Array<any>;
}

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
  rootFolderId?: string;
  subfolderIds?: string[];
  createdBy: string;
  visibility: CardVisibility;
  order: number;
  slides?: ISlide[];
  createdAt: string;
  updatedAt: string;
}

export interface ICurrentUserQuestionProgress {
  attemptStatus: 'attempted' | 'skipped';
  perceivedDifficultyByUser: 'easy' | 'medium' | 'hard' | null;
}

export interface IPopulatedRevisionCard extends Omit<IRevisionCard, 'createdBy' | 'folderId'> {
  createdBy: PopulatedUser;
  folderId: FolderRef | string;
  isFavorite?: boolean;
  isDifficult?: boolean;
  isArchived?: boolean;
  difficultyState?: 'easy' | 'medium' | 'hard' | 'skipped' | null;
  currentUserQuestionProgress?: ICurrentUserQuestionProgress | null;
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
  slides?: ISlide[];
};

export type UpdateRevisionCardDTO = Partial<CreateRevisionCardDTO>;

export interface PaginatedRevisionCards {
  results: IPopulatedRevisionCard[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}
