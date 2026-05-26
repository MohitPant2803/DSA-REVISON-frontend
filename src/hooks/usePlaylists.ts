import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as playlistService from '@/services/playlistService';
import * as revisionService from '@/services/revisionService';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { usePlaylistCards as useStorePlaylistCards } from '@/hooks/usePlaylistStoreSelectors';
import type { ApiPlaylist } from '@/services/playlistService';

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

export function mapApiPlaylist(p: ApiPlaylist, index = 0): UIPlaylist {
  const [fallback1, fallback2] = PRESET_COLORS[index % PRESET_COLORS.length];
  return {
    id: p._id,
    name: p.name,
    color1: p.color1 || fallback1,
    color2: p.color2 || fallback2,
    itemCount: p.itemCount ?? 0,
    completedLoops: p.completedLoops ?? useTrackingStore.getState().loopsCompleted[p._id] ?? 0,
    orderedCardIds: p.cardIds ?? p.orderedCardIds ?? [],
  };
}

// 1. Authoritative Local-First Hybrid Reads for Playlists
export const usePlaylists = () => {
  const playlistsById = usePlaylistStateStore((s) => s.playlistsById);
  const hydratePlaylists = usePlaylistStateStore((s) => s.hydratePlaylists);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const uiPlaylists = useMemo(() => {
    if (!isAuthenticated) {
      return [
        { id: 'easy', name: 'Easy', color1: '#10B981', color2: '#059669', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['easy'] ?? 0, orderedCardIds: [] },
        { id: 'medium', name: 'Medium', color1: '#F59E0B', color2: '#D97706', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['medium'] ?? 0, orderedCardIds: [] },
        { id: 'hard', name: 'Hard', color1: '#EF4444', color2: '#DC2626', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['hard'] ?? 0, orderedCardIds: [] },
        { id: 'skipped', name: 'Skipped', color1: '#64748B', color2: '#475569', itemCount: 0, completedLoops: useTrackingStore.getState().loopsCompleted['skipped'] ?? 0, orderedCardIds: [] },
      ];
    }
    return Object.values(playlistsById).map((p, i) => mapApiPlaylist(p, i));
  }, [playlistsById, isAuthenticated]);

  const queryResult = useQuery({
    queryKey: [PLAYLISTS_KEY, isAuthenticated],
    queryFn: async () => {
      if (!isAuthenticated) return uiPlaylists;
      try {
        const list = await playlistService.getPlaylists();
        if (list) {
          hydratePlaylists(list);
        }
        return list.map((p, i) => mapApiPlaylist(p, i));
      } catch (err) {
        return uiPlaylists;
      }
    },
    enabled: isAuthenticated && !hasSyncedThisSession && !isGuest,
    staleTime: 1000 * 60,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const hasLocal = hasHydrated || !isAuthenticated;

  return {
    data: hasLocal ? uiPlaylists : queryResult.data || [],
    isLoading: queryResult.isLoading && !hasLocal,
    isError: queryResult.isError && !hasLocal,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
};

export const usePlaylistCardIds = (playlistId: string | null, enabled = true) => {
  const orderMap = usePlaylistStateStore((s) => s.playlistCardOrderMap);
  const playlistsById = usePlaylistStateStore((s) => s.playlistsById);

  const cardIds = useMemo(() => {
    if (!playlistId || !enabled) return [];
    if (orderMap[playlistId]) return orderMap[playlistId];
    return playlistsById[playlistId]?.cardIds ?? playlistsById[playlistId]?.orderedCardIds ?? [];
  }, [playlistId, enabled, orderMap, playlistsById]);

  return {
    data: cardIds,
    isLoading: false,
    isError: false,
    error: null,
    refetch: async () => {},
  };
};

export const usePlaylistCards = (playlistId: string | null) => {
  const storeCards = useStorePlaylistCards(playlistId || '');
  const hydratePlaylistCards = usePlaylistStateStore((s) => s.hydratePlaylistCards);
  const hydratedPlaylists = usePlaylistStateStore((s) => s.hydratedPlaylists);
  const hasSyncedThisSession = usePlaylistStateStore((s) => s.hasSyncedThisSession);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId || '');
  const isHydrated = playlistId ? !!hydratedPlaylists[playlistId] : false;

  const queryResult = useQuery({
    queryKey: [PLAYLIST_DETAIL_KEY, playlistId, 'cards'],
    queryFn: async (): Promise<IPopulatedRevisionCard[]> => {
      if (!playlistId) return [];
      try {
        const detail = await playlistService.getPlaylistById(playlistId);
        if (!detail) return [];

        let cards: IPopulatedRevisionCard[] = [];
        if (detail.items && detail.items.length && typeof detail.items[0] === 'object') {
          cards = detail.items as IPopulatedRevisionCard[];
        } else if (detail.cardIds && detail.cardIds.length) {
          cards = await revisionService.getRevisionCardsByIds(detail.cardIds);
        }

        // Always hydrate in local-first cache, even if count is 0, to set hydratedPlaylists flag
        hydratePlaylistCards(playlistId, cards);
        return cards;
      } catch (err) {
        return storeCards;
      }
    },
    enabled: !!playlistId && !hasSyncedThisSession && !isGuest,
    staleTime: 1000 * 30,
  });

  const hasHydrated = usePlaylistStateStore((s) => s.hasHydrated);
  const hasLocal = hasHydrated;

  return {
    data: hasLocal ? storeCards : queryResult.data || [],
    isLoading: queryResult.isLoading && !hasLocal,
    isError: queryResult.isError && !hasLocal,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
};

// 2. Optimistic mutations enqueuing offline mutations
export const useCreatePlaylist = () => {
  const createPlaylistInStore = usePlaylistStateStore((s) => s.createPlaylistInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async (name: string) => {
      const count = Object.keys(usePlaylistStateStore.getState().playlistsById).length;
      const [color1, color2] = PRESET_COLORS[count % PRESET_COLORS.length];
      const tempId = `temp-playlist-${Date.now()}`;
      
      const tempPlaylist: ApiPlaylist = {
        _id: tempId,
        name,
        color1,
        color2,
        itemCount: 0,
        cardIds: [],
        orderedCardIds: [],
      };

      // 1. Optimistic update in Zustand store (always)
      createPlaylistInStore(tempPlaylist);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'CREATE_PLAYLIST',
        payload: { tempId, name, color1, color2 },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useCreatePlaylist] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve(tempPlaylist);
    },
  });
};

export const useDeletePlaylist = () => {
  const deletePlaylistInStore = usePlaylistStateStore((s) => s.deletePlaylistInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async (playlistId: string) => {
      // 1. Optimistic delete in Zustand store
      deletePlaylistInStore(playlistId);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'DELETE_PLAYLIST',
        payload: { playlistId },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useDeletePlaylist] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve();
    },
  });
};

export const useUpdatePlaylist = () => {
  const updatePlaylistInStore = usePlaylistStateStore((s) => s.updatePlaylistInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async ({ playlistId, name }: { playlistId: string; name: string }) => {
      // 1. Optimistic update in Zustand store
      updatePlaylistInStore(playlistId, name);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'UPDATE_PLAYLIST',
        payload: { playlistId, name },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useUpdatePlaylist] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve({ _id: playlistId, name } as ApiPlaylist);
    },
  });
};

export const useDuplicatePlaylist = () => {
  const createPlaylistInStore = usePlaylistStateStore((s) => s.createPlaylistInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async (playlistId: string) => {
      const source = usePlaylistStateStore.getState().playlistsById[playlistId];
      if (!source) throw new Error('Playlist not found in local cache');

      const tempId = `temp-playlist-dup-${Date.now()}`;
      const tempPlaylist: ApiPlaylist = {
        ...source,
        _id: tempId,
        name: `${source.name} (Copy)`,
      };

      // 1. Optimistic update
      createPlaylistInStore(tempPlaylist);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'CREATE_PLAYLIST',
        payload: { tempId, name: tempPlaylist.name, color1: tempPlaylist.color1, color2: tempPlaylist.color2, cardIds: tempPlaylist.cardIds },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useDuplicatePlaylist] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve(tempPlaylist);
    },
  });
};

export const useTogglePlaylistItem = () => {
  const queryClient = useQueryClient();
  const toggleCustomPlaylistItemInStore = usePlaylistStateStore((s) => s.toggleCustomPlaylistItemInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

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
      const nextValue = !isInPlaylist;
      
      // 1. Optimistic Toggle
      toggleCustomPlaylistItemInStore(playlistId, revisionCardId, nextValue);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'TOGGLE_PLAYLIST_ITEM',
        payload: { playlistId, cardId: revisionCardId, value: nextValue },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useTogglePlaylistItem] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve();
    },
  });
};

export const useReorderPlaylist = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async ({ playlistId, cardIds }: { playlistId: string; cardIds: string[] }) => {
      // 1. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'REORDER_PLAYLIST',
        payload: { playlistId, cardIds },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useReorderPlaylist] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve({ _id: playlistId, cardIds } as ApiPlaylist);
    },
    onError: (_, { playlistId }) => {
      // Rollback to previous state on failure
      const previousIds = usePlaylistStateStore.getState().playlistCardOrderMap[playlistId];
      if (previousIds) {
        usePlaylistStateStore.getState().setPlaylistCardOrder(playlistId, previousIds);
      }
    },
  });
};
