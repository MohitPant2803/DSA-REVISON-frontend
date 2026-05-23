import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import * as playlistService from '@/services/playlistService';
import * as revisionService from '@/services/revisionService';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { getPersonalLibrary } from '@/services/progressService';
import { useTrackingStore } from '@/store/useTrackingStore';

export const PLAYLISTS_KEY = 'playlists';
export const PLAYLIST_DETAIL_KEY = 'playlistDetail';

const PRESET_COLORS = [
  ['#818cf8', '#c084fc'],
  ['#34d399', '#3b82f6'],
  ['#fbbf24', '#f87171'],
  ['#a78bfa', '#f472b6'],
  ['#38bdf8', '#818cf8'],
];

export interface UIPlaylist {
  id: string;
  name: string;
  color1: string;
  color2: string;
  itemCount: number;
  completedLoops?: number;
  orderedCardIds?: string[];
}

export function mapApiPlaylist(p: playlistService.ApiPlaylist, index = 0): UIPlaylist {
  const [fallback1, fallback2] = PRESET_COLORS[index % PRESET_COLORS.length];
  return {
    id: p._id,
    name: p.name,
    color1: p.color1 || fallback1,
    color2: p.color2 || fallback2,
    itemCount: p.itemCount ?? 0,
    completedLoops: p.completedLoops ?? useTrackingStore.getState().loopsCompleted[p._id] ?? 0,
    orderedCardIds: p.orderedCardIds ?? [],
  };
}

export const usePlaylists = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [PLAYLISTS_KEY, isAuthenticated],
    queryFn: async () => {
      let uiPlaylists: UIPlaylist[] = [];

      if (isAuthenticated) {
        // Get custom and smart playlists from backend
        const list = await playlistService.getPlaylists().catch((err) => {
          console.warn('[usePlaylists] Failed to fetch custom playlists', err);
          return [];
        });
        uiPlaylists = list.map((p, i) => mapApiPlaylist(p, i));
      } else {
        // Guest mode offline-safe smart playlists
        uiPlaylists = [
          { id: 'easy', name: 'Easy', color1: '#10B981', color2: '#059669', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['easy'] ?? 0, orderedCardIds: [] },
          { id: 'medium', name: 'Medium', color1: '#F59E0B', color2: '#D97706', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['medium'] ?? 0, orderedCardIds: [] },
          { id: 'hard', name: 'Hard', color1: '#EF4444', color2: '#DC2626', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['hard'] ?? 0, orderedCardIds: [] },
          { id: 'skipped', name: 'Skipped', color1: '#64748B', color2: '#475569', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['skipped'] ?? 0, orderedCardIds: [] },
        ];
      }

      return uiPlaylists;
    },
    staleTime: 1000 * 60,
    retry: 2,
  });
};

export const usePlaylistCardIds = (playlistId: string | null, enabled = true) => {
  return useQuery({
    queryKey: [PLAYLIST_DETAIL_KEY, playlistId, 'ids'],
    queryFn: async () => {
      const detail = await playlistService.getPlaylistById(playlistId!);
      return detail?.cardIds ?? [];
    },
    enabled: !!playlistId && enabled,
    staleTime: 1000 * 30,
  });
};

export const usePlaylistCards = (playlistId: string | null) => {
  return useQuery({
    queryKey: [PLAYLIST_DETAIL_KEY, playlistId, 'cards'],
    queryFn: async (): Promise<IPopulatedRevisionCard[]> => {
      if (!playlistId) return [];
      const detail = await playlistService.getPlaylistById(playlistId!);
      if (!detail) return [];
      
      // Dynamic populated items loading for smart playlists
      if (detail.items && detail.items.length && typeof detail.items[0] === 'object') {
        return detail.items as IPopulatedRevisionCard[];
      }
      
      if (!detail.cardIds || !detail.cardIds.length) return [];
      return revisionService.getRevisionCardsByIds(detail.cardIds);
    },
    enabled: !!playlistId,
    staleTime: 1000 * 30,
  });
};

export const useCreatePlaylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      const count = (qc.getQueryData<UIPlaylist[]>([PLAYLISTS_KEY]) ?? []).length;
      const [color1, color2] = PRESET_COLORS[count % PRESET_COLORS.length];
      return playlistService.createPlaylist({ name, color1, color2 });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY] });
    },
  });
};

export const useDeletePlaylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: playlistService.deletePlaylist,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY] });
    },
  });
};

export const useUpdatePlaylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, name }: { playlistId: string; name: string }) =>
      playlistService.updatePlaylist(playlistId, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY] });
    },
  });
};

export const useDuplicatePlaylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (playlistId: string) => playlistService.duplicatePlaylist(playlistId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY] });
    },
  });
};


export const useTogglePlaylistItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      playlistId,
      revisionCardId,
      isInPlaylist,
    }: {
      playlistId: string;
      revisionCardId: string;
      isInPlaylist: boolean;
    }) => {
      if (isInPlaylist) {
        await playlistService.removeFromPlaylist(playlistId, revisionCardId);
      } else {
        await playlistService.addToPlaylist(playlistId, revisionCardId);
      }
    },
    onMutate: async ({ playlistId, revisionCardId, isInPlaylist }) => {
      await qc.cancelQueries({ queryKey: [PLAYLISTS_KEY] });
      await qc.cancelQueries({ queryKey: [PLAYLISTS_KEY, 'membership', revisionCardId] });
      await qc.cancelQueries({ queryKey: [PLAYLIST_DETAIL_KEY, playlistId, 'cards'] });

      const previousPlaylists = qc.getQueryData<UIPlaylist[]>([PLAYLISTS_KEY]);
      const previousMembership = qc.getQueryData<Record<string, boolean>>([PLAYLISTS_KEY, 'membership', revisionCardId]);
      const previousCards = qc.getQueryData<IPopulatedRevisionCard[]>([PLAYLIST_DETAIL_KEY, playlistId, 'cards']);

      // Optimistically update the playlists key
      if (previousPlaylists) {
        qc.setQueryData(
          [PLAYLISTS_KEY],
          previousPlaylists.map((pl) => {
            if (pl.id === playlistId) {
              const currentIds = pl.orderedCardIds ?? [];
              const newIds = isInPlaylist
                ? currentIds.filter((id) => id !== revisionCardId)
                : [...currentIds, revisionCardId];
              return {
                ...pl,
                itemCount: Math.max(0, isInPlaylist ? pl.itemCount - 1 : pl.itemCount + 1),
                orderedCardIds: newIds,
              };
            }
            return pl;
          })
        );
      }

      // Optimistically update the membership key
      if (previousMembership) {
        qc.setQueryData([PLAYLISTS_KEY, 'membership', revisionCardId], {
          ...previousMembership,
          [playlistId]: !isInPlaylist,
        });
      } else {
        qc.setQueryData([PLAYLISTS_KEY, 'membership', revisionCardId], {
          [playlistId]: !isInPlaylist,
        });
      }

      // Optimistically update the playlist cards list if removing
      if (previousCards && isInPlaylist) {
        qc.setQueryData(
          [PLAYLIST_DETAIL_KEY, playlistId, 'cards'],
          previousCards.filter((c) => c._id !== revisionCardId)
        );
      }

      return { previousPlaylists, previousMembership, previousCards };
    },
    onError: (err, variables, context) => {
      if (context?.previousPlaylists) {
        qc.setQueryData([PLAYLISTS_KEY], context.previousPlaylists);
      }
      if (context?.previousMembership) {
        qc.setQueryData([PLAYLISTS_KEY, 'membership', variables.revisionCardId], context.previousMembership);
      }
      if (context?.previousCards) {
        qc.setQueryData([PLAYLIST_DETAIL_KEY, variables.playlistId, 'cards'], context.previousCards);
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY] });
      qc.invalidateQueries({ queryKey: [PLAYLIST_DETAIL_KEY, variables.playlistId] });
      qc.invalidateQueries({ queryKey: [PLAYLISTS_KEY, 'membership', variables.revisionCardId] });
    },
  });
};

export const useReorderPlaylist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ playlistId, cardIds }: { playlistId: string; cardIds: string[] }) => {
      return playlistService.reorderPlaylist(playlistId, cardIds);
    },
    onMutate: async ({ playlistId, cardIds }) => {
      // Optimistically update the UI
      await qc.cancelQueries({ queryKey: [PLAYLIST_DETAIL_KEY, playlistId, 'cards'] });
      
      const previousCards = qc.getQueryData<IPopulatedRevisionCard[]>([PLAYLIST_DETAIL_KEY, playlistId, 'cards']);
      
      if (previousCards) {
        // Reorder previous cards based on new cardIds
        const newCards = cardIds.map(id => previousCards.find(c => c._id === id)).filter(Boolean) as IPopulatedRevisionCard[];
        qc.setQueryData([PLAYLIST_DETAIL_KEY, playlistId, 'cards'], newCards);
      }
      
      return { previousCards };
    },
    onError: (err, { playlistId }, context) => {
      if (context?.previousCards) {
        qc.setQueryData([PLAYLIST_DETAIL_KEY, playlistId, 'cards'], context.previousCards);
      }
    },
    onSettled: (data, err, { playlistId }) => {
      qc.invalidateQueries({ queryKey: [PLAYLIST_DETAIL_KEY, playlistId] });
    },
  });
};
