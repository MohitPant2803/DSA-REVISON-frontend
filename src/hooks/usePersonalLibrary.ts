import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import api from '@/services/api';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { PersonalLibrary, LibraryEntry } from '@/types/progress';

export const PERSONAL_LIBRARY_KEY = 'personalLibrary';

export const usePersonalLibrary = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  
  // Stable selector: only triggers re-renders when a favorite is added/removed
  const favoritesKey = usePlaylistStateStore(
    useShallow((s) =>
      Object.values(s.cardsById)
        .filter((c) => c.isFavorite)
        .map((c) => c._id)
        .sort()
        .join(',')
    )
  );

  return useQuery({
    queryKey: [PERSONAL_LIBRARY_KEY, favoritesKey],
    queryFn: (): PersonalLibrary => {
      const storeState = usePlaylistStateStore.getState();
      const cards = Object.values(storeState.cardsById);

      const favorites: LibraryEntry[] = cards
        .filter((c) => c.isFavorite === true)
        .sort((a, b) => {
          const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          if (tB !== tA) return tB - tA;
          return a._id < b._id ? -1 : 1; // stable secondary sort
        })
        .map((c) => ({
          progressId: c._id,
          lastViewedAt: c.updatedAt,
          favorite: true,
          difficult: c.isDifficult ?? false,
          archived: c.isArchived ?? false,
          card: c,
        }));

      return {
        favorites,
        archived: [],
        recentBookmarks: [],
      };
    },
    staleTime: Infinity,
    enabled: isAuthenticated,
  });
};

export const useInvalidatePersonalLibrary = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [PERSONAL_LIBRARY_KEY] });
};

export const useReorderLikes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cardIds: string[]) => {
      const isGuest = useAuthStore.getState().user?.id === 'guest-user';
      if (!isGuest) {
        usePlaylistStateStore.getState().enqueueOfflineAction({
          action: 'REORDER_LIKES',
          payload: { cardIds },
          timestamp: Date.now(),
        });
      }
      return Promise.resolve({ offline: true });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [PERSONAL_LIBRARY_KEY] });
    },
  });
};
