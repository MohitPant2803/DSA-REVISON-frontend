import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import { getPersonalLibrary } from '@/services/progressService';
import { useAuthStore } from '@/store/useAuthStore';

export const PERSONAL_LIBRARY_KEY = 'personalLibrary';

export const usePersonalLibrary = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [PERSONAL_LIBRARY_KEY],
    queryFn: getPersonalLibrary,
    staleTime: 1000 * 60,
    enabled: isAuthenticated,
    retry: 2,
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
      await api.post('/progress/reorder-likes', { cardIds });
    },
    onMutate: async (cardIds) => {
      await qc.cancelQueries({ queryKey: [PERSONAL_LIBRARY_KEY] });
      const previous = qc.getQueryData<any>([PERSONAL_LIBRARY_KEY]);
      if (previous && previous.favorites) {
        // Optimistic update
        const newFavorites = cardIds.map(id => previous.favorites.find((f: any) => f.card?._id === id)).filter(Boolean);
        qc.setQueryData([PERSONAL_LIBRARY_KEY], { ...previous, favorites: newFavorites });
      }
      return { previous };
    },
    onError: (err, newOrder, context) => {
      if (context?.previous) {
        qc.setQueryData([PERSONAL_LIBRARY_KEY], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [PERSONAL_LIBRARY_KEY] });
    },
  });
};
