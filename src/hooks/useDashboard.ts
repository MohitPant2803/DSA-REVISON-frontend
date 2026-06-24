import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import type { DashboardStats, LibraryEntry } from '@/types/progress';

export const DASHBOARD_QUERY_KEY = 'dashboardStats';

export const useDashboard = () => {
  // Stable selector: only triggers when total revision count or top 10 active cards list changes
  const dashboardKey = usePlaylistStateStore(
    (s) => {
      const cards = Object.values(s.cardsById);
      const revCount = cards.filter(
        (c) => c.difficultyState != null && c.difficultyState !== 'skipped'
      ).length;
      const recent = cards
        .filter((c) => c.updatedAt != null)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10)
        .map((c) => c._id)
        .join(',');
      return `${revCount}-${recent}`;
    }
  );

  return useQuery({
    queryKey: [DASHBOARD_QUERY_KEY, dashboardKey],
    queryFn: (): DashboardStats => {
      const storeState = usePlaylistStateStore.getState();
      const cards = Object.values(storeState.cardsById);

      const totalRevisions = cards.filter(
        (c) => c.difficultyState != null && c.difficultyState !== 'skipped'
      ).length;

      const recentlyRevised: LibraryEntry[] = cards
        .filter((c) => c.updatedAt != null)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 10)
        .map((c) => ({
          progressId: c._id,
          lastViewedAt: c.updatedAt,
          favorite: c.isFavorite ?? false,
          difficult: c.isDifficult ?? false,
          archived: c.isArchived ?? false,
          card: c,
        }));

      return {
        streakCount: 1,
        totalRevisions,
        recentlyRevised,
        weakTopics: [],
        consistencyByDay: [],
        lastCompletedDate: undefined,
        totalSwipes: 0,
        totalScrolls: 0,
        totalTimeSpent: 0,
        favoritesCount: 0,
        difficultCount: 0,
        totalCardsAvailable: 0,
      };
    },
    staleTime: Infinity,
  });
};
