export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  preferences?: UserPreferences;
  stats?: UserStats;
  createdAt: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  dailyGoalCount?: number;
}

export interface UserStats {
  totalProblemsSolved: number;
  currentStreak: number;
  totalXp: number;
}