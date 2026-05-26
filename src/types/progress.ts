import type { IPopulatedRevisionCard } from './revision';

export interface WeakTopic {
  topic: string;
  count: number;
  lastSeen?: string;
}

export interface ConsistencyDay {
  date: string;
  sessions: number;
}

export interface LibraryEntry {
  progressId: string;
  lastViewedAt: string;
  favorite?: boolean;
  difficult?: boolean;
  archived?: boolean;
  card: IPopulatedRevisionCard;
}

export interface DashboardStats {
  streakCount: number;
  lastCompletedDate?: string;
  totalSwipes?: number;
  totalScrolls?: number;
  totalRevisions: number;
  totalTimeSpent: number;
  favoritesCount: number;
  difficultCount: number;
  totalCardsAvailable: number;
  recentlyRevised: LibraryEntry[];
  weakTopics: WeakTopic[];
  consistencyByDay: ConsistencyDay[];
}

export interface PersonalLibrary {
  favorites: LibraryEntry[];
  archived: LibraryEntry[];
  recentBookmarks: LibraryEntry[];
}

export interface IUserProgress {
  _id: string;
  userId: string;
  cards: unknown[];
  streak: { current: number; longest: number; lastRevisedDate?: string };
  lastViewedCardId?: string;
  dailyGoal: number;
  revisionsToday: number;
  createdAt: string;
  updatedAt: string;
}
