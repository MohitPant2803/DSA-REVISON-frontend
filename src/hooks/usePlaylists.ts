import { useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as playlistService from '@/services/playlistService';
import * as revisionService from '@/services/revisionService';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useAuthStore } from '@/store/useAuthStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useShallow } from 'zustand/react/shallow';
import { usePlaylistCards as useStorePlaylistCards } from '@/hooks/usePlaylistStoreSelectors';
import type { ApiPlaylist } from '@/services/playlistService';
import { resolveCardState } from '@/utils/resolveCardState';

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

export const SYSTEM_PLAYLISTS = [
  { id: 'easy', name: 'Easy', color1: '#10B981', color2: '#059669', description: 'Dynamic list of cards you marked as Easy' },
  { id: 'medium', name: 'Medium', color1: '#F59E0B', color2: '#D97706', description: 'Dynamic list of cards you marked as Medium' },
  { id: 'hard', name: 'Hard', color1: '#EF4444', color2: '#DC2626', description: 'Dynamic list of cards you marked as Hard' },
  { id: 'skipped', name: 'Skipped', color1: '#64748B', color2: '#475569', description: 'Dynamic list of cards you skipped' },
];

export function buildSystemPlaylists() {
  const state = usePlaylistStateStore.getState();
  const cardDifficultyMap = state.cardDifficultyMap;

  return SYSTEM_PLAYLISTS.map(p => {
    const playlistId = p.id;
    
    // Resolve current count dynamically from loaded store cards
    const resolved = Object.keys(state.cardsById)
      .map((cardId) => state.cardsById[cardId])
      .filter((card: any) => card && !card.isDeleted)
      .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById))
      .filter((resolvedCard) => resolvedCard.difficultyState === playlistId);

    // Deduplicate by title to match actual playlist contents
    const seenTitles = new Set<string>();
    const itemCount = resolved.filter((card) => {
      if (!card.title) return false;
      const titleKey = card.title.trim().toLowerCase();
      if (seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      return true;
    }).length;
    
    return {
      ...p,
      itemCount,
      completedLoops: useTrackingStore.getState().loopsCompleted[p.id] ?? 0,
      orderedCardIds: [],
    };
  });
}

// 1. Authoritative Local-First Hybrid Reads for Playlists
export const usePlaylists = () => {
  const playlistsById = usePlaylistStateStore(useShallow((s) => s.playlistsById));
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const lastUiPlaylistsRef = useRef<UIPlaylist[]>([]);

  const uiPlaylists = useMemo(() => {
    const smart = buildSystemPlaylists();

    if (!isAuthenticated && !isGuest) {
      return smart;
    }

    const localPlaylists = Object.values(playlistsById)
      .filter((p: any) => !p.isDeleted && p.kind !== 'system' && !p.systemKey)
      .map((p, i) => mapApiPlaylist(p, i));
    const customPlaylists = localPlaylists.filter(
      (p) => !['easy', 'medium', 'hard', 'skipped'].includes(p.id)
    );

    const nextPlaylists = [...smart, ...customPlaylists];
    
    // Stabilize reference by doing a deep primitive check of playlist objects
    const prevPlaylists = lastUiPlaylistsRef.current;
    const isShallowEqual =
      prevPlaylists.length === nextPlaylists.length &&
      prevPlaylists.every((p, idx) => {
        const np = nextPlaylists[idx];
        return (
          p.id === np.id &&
          p.name === np.name &&
          p.color1 === np.color1 &&
          p.color2 === np.color2 &&
          p.itemCount === np.itemCount &&
          p.completedLoops === np.completedLoops &&
          (p.orderedCardIds?.length === np.orderedCardIds?.length &&
            (p.orderedCardIds || []).every((id, i) => id === np.orderedCardIds?.[i]))
        );
      });

    if (isShallowEqual) {
      return prevPlaylists;
    }
    lastUiPlaylistsRef.current = nextPlaylists;
    return nextPlaylists;
  }, [playlistsById, isAuthenticated, isGuest]);

  const queryResult = useQuery({
    queryKey: [PLAYLISTS_KEY, isAuthenticated],
    queryFn: async () => {
      return uiPlaylists;
    },
    enabled: false,
  });

  return {
    data: uiPlaylists,
    isLoading: false,
    isError: false,
    isFetched: true,
    error: null,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[usePlaylists] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
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
  const isGuest = useAuthStore((s) => s.user?.id === 'guest-user');

  const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId || '');
  const isHydrated = playlistId ? !!hydratedPlaylists[playlistId] : false;

  const queryResult = useQuery({
    queryKey: [PLAYLIST_DETAIL_KEY, playlistId, 'cards'],
    queryFn: async () => {
      if (isGuest || isSmart || !playlistId) return storeCards;
      try {
        const { getPlaylistById } = require('@/services/playlistService');
        const data = await getPlaylistById(playlistId);
        const cards = data.items || [];
        await hydratePlaylistCards(playlistId, cards);
        return cards;
      } catch (err) {
        console.warn('[usePlaylistCards] Fetch failed, returning store cards:', err);
        return storeCards;
      }
    },
    enabled: !!playlistId && !isGuest && !isSmart,
    staleTime: 1000 * 60 * 10,
  });

  const hasLocal = isSmart || isGuest ? true : isHydrated;

  return {
    data: hasLocal && storeCards.length > 0 ? storeCards : queryResult.data || storeCards,
    isLoading: queryResult.isLoading && !hasLocal && storeCards.length === 0,
    isError: queryResult.isError && storeCards.length === 0,
    error: queryResult.error,
    refetch: async () => {
      try {
        const { syncManager } = require('@/utils/syncManager');
        await syncManager.sync(true);
      } catch (err) {
        console.warn('[usePlaylistCards] Refetch sync failed:', err);
      }
      return queryResult.refetch();
    },
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
      const uuid = Crypto.randomUUID();
      
      const playlist: ApiPlaylist = {
        _id: uuid,
        name,
        color1,
        color2,
        itemCount: 0,
        cardIds: [],
        orderedCardIds: [],
      };

      // 1. Optimistic update in Zustand store (always)
      createPlaylistInStore(playlist);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'CREATE_PLAYLIST',
        payload: { playlistId: uuid, name, color1, color2, cardIds: [] },
        timestamp: Date.now(),
      });
      console.log(`[MUTATION] CREATE_PLAYLIST | ID: ${uuid} | Name: ${name}`);
      return Promise.resolve(playlist);
    },
  });
};

export const useDeletePlaylist = () => {
  const deletePlaylistInStore = usePlaylistStateStore((s) => s.deletePlaylistInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async (playlistId: string) => {
      const playlistName = usePlaylistStateStore.getState().playlistsById[playlistId]?.name || playlistId;
      // 1. Optimistic delete in Zustand store
      deletePlaylistInStore(playlistId);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'DELETE_PLAYLIST',
        payload: { playlistId },
        timestamp: Date.now(),
      });
      console.log(`[MUTATION] DELETE_PLAYLIST | Name: "${playlistName}" | ID: ${playlistId}`);
      return Promise.resolve();
    },
  });
};

export const useUpdatePlaylist = () => {
  const updatePlaylistInStore = usePlaylistStateStore((s) => s.updatePlaylistInStore);
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async ({ playlistId, name }: { playlistId: string; name: string }) => {
      const oldName = usePlaylistStateStore.getState().playlistsById[playlistId]?.name || playlistId;
      // 1. Optimistic update in Zustand store
      updatePlaylistInStore(playlistId, name);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'UPDATE_PLAYLIST',
        payload: { playlistId, name },
        timestamp: Date.now(),
      });
      console.log(`[MUTATION] UPDATE_PLAYLIST | ID: ${playlistId} | Old Name: "${oldName}" -> New Name: "${name}"`);
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

      const uuid = Crypto.randomUUID();
      const playlist: ApiPlaylist = {
        ...source,
        _id: uuid,
        name: `${source.name} (Copy)`,
      };

      // 1. Optimistic update
      createPlaylistInStore(playlist);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'CREATE_PLAYLIST',
        payload: { playlistId: uuid, name: playlist.name, color1: playlist.color1, color2: playlist.color2, cardIds: playlist.cardIds },
        timestamp: Date.now(),
      });
      if (__DEV__) console.log('[useDuplicatePlaylist] Local-first mode active. Enqueued for later sync.');
      return Promise.resolve(playlist);
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
      
      const playlistName = usePlaylistStateStore.getState().playlistsById[playlistId]?.name || playlistId;
      const cardTitle = usePlaylistStateStore.getState().cardsById[revisionCardId]?.title || revisionCardId;

      // 1. Optimistic Toggle
      toggleCustomPlaylistItemInStore(playlistId, revisionCardId, nextValue);

      // 2. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'TOGGLE_PLAYLIST_ITEM',
        payload: { playlistId, cardId: revisionCardId, value: nextValue },
        timestamp: Date.now(),
      });
      console.log(`[MUTATION] TOGGLE_PLAYLIST_ITEM | Playlist: "${playlistName}" | Card: "${cardTitle}" | Value: ${nextValue}`);
      return Promise.resolve();
    },
  });
};

export const useReorderPlaylist = () => {
  const enqueueOfflineAction = usePlaylistStateStore((s) => s.enqueueOfflineAction);

  return useMutation({
    mutationFn: async ({ playlistId, cardIds }: { playlistId: string; cardIds: string[] }) => {
      const playlistName = usePlaylistStateStore.getState().playlistsById[playlistId]?.name || playlistId;
      // 1. Enqueue action for later sync
      enqueueOfflineAction({
        action: 'REORDER_PLAYLIST',
        payload: { playlistId, cardIds },
        timestamp: Date.now(),
      });
      console.log(`[MUTATION] REORDER_PLAYLIST | Name: "${playlistName}" | ID: ${playlistId} | Cards: ${cardIds.length}`);
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
