import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useTrackingStore } from './useTrackingStore';
import { mergeCardState } from '@/utils/resolveCardState';

export interface OfflineAction {
  id: string;
  action: 'CLASSIFY_CARD' | 'TOGGLE_FAVORITE' | 'TOGGLE_PLAYLIST_ITEM' | 'REORDER_PLAYLIST' | 'REORDER_LIKES';
  payload: any;
  timestamp: number;
}


export type DifficultyState = 'easy' | 'medium' | 'hard' | 'skipped' | null;

export interface LocalCardState {
  difficulty: DifficultyState;
  originalDifficulty: DifficultyState; // Enforces absolute starting pre-session difficulty
  updatedAt: number;
  optimistic: boolean;
}

interface PlaylistState {
  // Authoritative normalized cache of card objects
  cardsById: Record<string, IPopulatedRevisionCard>;
  
  // Authoritative interactive session difficulty mappings
  cardDifficultyMap: Record<string, LocalCardState>;

  // Authoritative manual order of card IDs for custom playlists/folders
  playlistCardOrderMap: Record<string, string[]>;

  // One-time hydration safety guards (tracks if playlist has been loaded initially)
  hydratedPlaylists: Record<string, boolean>;

  // Dynamic dashboard counts hydration fallback
  initialSmartCounts: Record<string, number>;

  // Authoritative O(1) incremental session delta counts
  smartPlaylistDeltaCounts: Record<string, number>;

  // Actions
  hydratePlaylistCards: (playlistId: string, cards: IPopulatedRevisionCard[]) => void;
  hydrateSmartCounts: (counts: Record<string, number>) => void;
  setPlaylistCardOrder: (playlistId: string, cardIds: string[]) => void;
  hydrateCustomPlaylistOrder: (playlistId: string, cardIds: string[]) => void;
  
  // Curation Actions
  toggleFavoriteInStore: (cardId: string, value: boolean) => void;
  toggleWatchLaterInStore: (cardId: string, value: boolean) => void;
  toggleCustomPlaylistItemInStore: (playlistId: string, cardId: string, value: boolean) => void;
  
  // Atomic transactional transfer of a card
  transferCard: (
    cardId: string, 
    cardObj: IPopulatedRevisionCard,
    newState: DifficultyState
  ) => void;

  // Race-condition-safe atomic rollback on mutation failure
  revertTransfer: (
    cardId: string,
    oldState: DifficultyState,
    failedState: DifficultyState,
    timestamp: number
  ) => void;

  // Reconcile optimistic classification with server confirmation
  reconcileServerState: (cardId: string, serverState: DifficultyState) => void;

  // Evicts resolved optimistic state mappings to clean memory
  cleanupResolvedState: () => void;

  // Offline Actions
  offlineActionQueue: OfflineAction[];
  enqueueOfflineAction: (action: Omit<OfflineAction, 'id'>) => void;
  clearOfflineActions: () => void;
  lastSyncedAt: string | null;
  setLastSyncedAt: (timestamp: string) => void;
}

export const usePlaylistStateStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      cardsById: {},
      cardDifficultyMap: {},
      playlistCardOrderMap: {},
      hydratedPlaylists: {},
      initialSmartCounts: {},
      smartPlaylistDeltaCounts: { easy: 0, medium: 0, hard: 0, skipped: 0 },
      offlineActionQueue: [],
      lastSyncedAt: null,
      setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

  hydrateSmartCounts: (counts) => {
    set((state) => {
      console.log(`[DIAGNOSTIC - HYDRATION] hydrateSmartCounts | Incoming counts:`, counts);
      const nextCounts = { ...state.initialSmartCounts, ...counts };
      
      // Automatic Self-Healing Eviction:
      // Remove all fully confirmed (non-optimistic) cards from session mapping to free memory,
      // and re-calibrate deltas from remaining optimistic cards.
      const nextDifficultyMap = { ...state.cardDifficultyMap };
      
      Object.keys(nextDifficultyMap).forEach((cardId) => {
        const entry = nextDifficultyMap[cardId];
        if (entry && !entry.optimistic) {
          delete nextDifficultyMap[cardId];
        }
      });

      // Recalculate deltas from remaining active optimistic items
      const nextDeltas: Record<string, number> = { easy: 0, medium: 0, hard: 0, skipped: 0 };
      Object.keys(nextDifficultyMap).forEach((cardId) => {
        const entry = nextDifficultyMap[cardId];
        const orig = entry.originalDifficulty;
        const curr = entry.difficulty;
        
        if (orig && ['easy', 'medium', 'hard', 'skipped'].includes(orig)) {
          nextDeltas[orig] = (nextDeltas[orig] || 0) - 1;
        }
        if (curr && ['easy', 'medium', 'hard', 'skipped'].includes(curr)) {
          nextDeltas[curr] = (nextDeltas[curr] || 0) + 1;
        }
      });

      return { 
        initialSmartCounts: nextCounts,
        cardDifficultyMap: nextDifficultyMap,
        smartPlaylistDeltaCounts: nextDeltas,
      };
    });
  },

  hydratePlaylistCards: (playlistId, cards) => {
    set((state) => {
      console.log(`[DIAGNOSTIC - HYDRATION] hydratePlaylistCards for Playlist ID: "${playlistId}" | Cards count: ${cards.length} | Time: ${Date.now()}`);
      const nextCardsById = { ...state.cardsById };
      const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
      const nextHydratedPlaylists = { ...state.hydratedPlaylists };

      // 1. Merge into normalized cardsById lookup using centralized robust reconciliation
      cards.forEach((card) => {
        if (!card || !card._id) return;
        const cleanId = card._id.split('-loop-')[0];
        const existingCard = nextCardsById[cleanId];
        const local = state.cardDifficultyMap[cleanId];
        
        nextCardsById[cleanId] = mergeCardState(local, existingCard, card);
      });

      // 2. Map custom playlist IDs safely (smart playlists are derived virtual structures)
      const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
      if (!isSmart) {
        const cleanIds = cards.map((c) => c._id.split('-loop-')[0]).filter(Boolean);
        const existingOrder = nextPlaylistCardOrderMap[playlistId];

        if (!existingOrder) {
          nextPlaylistCardOrderMap[playlistId] = cleanIds;
        } else {
          // Merge-safe and append-safe: append any newly loaded server cards (pagination)
          // without duplicating or overwriting the existing custom manual reorder!
          const existingSet = new Set(existingOrder);
          const newIds = cleanIds.filter((id) => !existingSet.has(id));
          nextPlaylistCardOrderMap[playlistId] = [...existingOrder, ...newIds];
        }
      }

      nextHydratedPlaylists[playlistId] = true;

      return {
        cardsById: nextCardsById,
        playlistCardOrderMap: nextPlaylistCardOrderMap,
        hydratedPlaylists: nextHydratedPlaylists,
      };
    });
  },

  setPlaylistCardOrder: (playlistId, cardIds) => {
    set((state) => {
      const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
      nextPlaylistCardOrderMap[playlistId] = cardIds.map(id => id.split('-loop-')[0]).filter(Boolean);

      return {
        playlistCardOrderMap: nextPlaylistCardOrderMap,
      };
    });
  },

  hydrateCustomPlaylistOrder: (playlistId, cardIds) => {
    set((state) => {
      const cleanIds = cardIds.map(id => id.split('-loop-')[0]).filter(Boolean);
      const nextPlaylistCardOrderMap = {
        ...state.playlistCardOrderMap,
        [playlistId]: cleanIds,
      };
      const nextHydratedPlaylists = {
        ...state.hydratedPlaylists,
        [playlistId]: true,
      };
      return {
        playlistCardOrderMap: nextPlaylistCardOrderMap,
        hydratedPlaylists: nextHydratedPlaylists,
      };
    });
  },

  toggleFavoriteInStore: (cardId, value) => {
    set((state) => {
      const cleanId = cardId.split('-loop-')[0];
      const nextCardsById = { ...state.cardsById };
      if (nextCardsById[cleanId]) {
        nextCardsById[cleanId] = {
          ...nextCardsById[cleanId],
          isFavorite: value,
        };
      }
      const currentList = state.playlistCardOrderMap['likes'] || [];
      let newList = currentList;
      if (value) {
        if (!currentList.includes(cleanId)) {
          newList = [cleanId, ...currentList];
        }
      } else {
        newList = currentList.filter(id => id !== cleanId);
      }
      const nextPlaylistCardOrderMap = {
        ...state.playlistCardOrderMap,
        'likes': newList,
      };
      return {
        cardsById: nextCardsById,
        playlistCardOrderMap: nextPlaylistCardOrderMap,
      };
    });
  },

  toggleWatchLaterInStore: (cardId, value) => {
    set((state) => {
      const cleanId = cardId.split('-loop-')[0];
      const nextCardsById = { ...state.cardsById };
      if (nextCardsById[cleanId]) {
        nextCardsById[cleanId] = {
          ...nextCardsById[cleanId],
          isWatchLater: value,
        } as any;
      }
      const currentList = state.playlistCardOrderMap['watch-later'] || [];
      let newList = currentList;
      if (value) {
        if (!currentList.includes(cleanId)) {
          newList = [cleanId, ...currentList];
        }
      } else {
        newList = currentList.filter(id => id !== cleanId);
      }
      const nextPlaylistCardOrderMap = {
        ...state.playlistCardOrderMap,
        'watch-later': newList,
      };
      
      // Keep useTrackingStore in sync
      const trackingState = useTrackingStore.getState();
      if (value && !trackingState.watchLaterCardIds.includes(cleanId)) {
        trackingState.setWatchLater([cleanId, ...trackingState.watchLaterCardIds]);
      } else if (!value && trackingState.watchLaterCardIds.includes(cleanId)) {
        trackingState.setWatchLater(trackingState.watchLaterCardIds.filter(id => id !== cleanId));
      }

      return {
        cardsById: nextCardsById,
        playlistCardOrderMap: nextPlaylistCardOrderMap,
      };
    });
  },

  toggleCustomPlaylistItemInStore: (playlistId, cardId, value) => {
    set((state) => {
      const cleanId = cardId.split('-loop-')[0];
      const currentList = state.playlistCardOrderMap[playlistId] || [];
      let newList = currentList;
      if (value) {
        if (!currentList.includes(cleanId)) {
          newList = [cleanId, ...currentList];
        }
      } else {
        newList = currentList.filter(id => id !== cleanId);
      }
      const nextPlaylistCardOrderMap = {
        ...state.playlistCardOrderMap,
        [playlistId]: newList,
      };
      return {
        playlistCardOrderMap: nextPlaylistCardOrderMap,
      };
    });
  },

  transferCard: (cardId, cardObj, newState) => {
    set((state) => {
      const cleanId = cardId.split('-loop-')[0];
      const oldStateObj = state.cardDifficultyMap[cleanId];
      const oldState = oldStateObj !== undefined 
        ? oldStateObj.difficulty 
        : (cardObj.difficultyState || null);

      console.log(`[DIAGNOSTIC - STORE] >>> transferCard Transaction | Card ID: ${cleanId} | "${oldState}" -> "${newState}"`);

      if (oldState === newState) return {}; // No change

      const originalDifficulty = oldStateObj !== undefined
        ? oldStateObj.originalDifficulty
        : oldState;

      const timestamp = Date.now();
      
      // Calculate O(1) smart delta counts atomically
      const nextDeltas = { ...state.smartPlaylistDeltaCounts };
      if (oldState && ['easy', 'medium', 'hard', 'skipped'].includes(oldState)) {
        nextDeltas[oldState] = (nextDeltas[oldState] || 0) - 1;
      }
      if (newState && ['easy', 'medium', 'hard', 'skipped'].includes(newState)) {
        nextDeltas[newState] = (nextDeltas[newState] || 0) + 1;
      }

      // Self-Healing Eviction: If card has returned back to its original pre-session state,
      // we can evict it from session mappings to save memory!
      const nextDifficultyMap = { ...state.cardDifficultyMap };
      if (newState === originalDifficulty) {
        delete nextDifficultyMap[cleanId];
      } else {
        nextDifficultyMap[cleanId] = {
          difficulty: newState,
          originalDifficulty,
          updatedAt: timestamp,
          optimistic: true
        };
      }

      const nextCardsById = { ...state.cardsById };
      
      // Derive and align progress object referentially inside transfer transaction
      const qp = newState
        ? {
            attemptStatus: newState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
            perceivedDifficultyByUser: newState === 'skipped' ? null : (newState as any),
          }
        : null;

      nextCardsById[cleanId] = {
        ...(state.cardsById[cleanId] || cardObj),
        _id: cleanId, // Force canonical clean ID in the cache!
        difficultyState: newState,
        currentUserQuestionProgress: qp,
      };

      // Custom playlists (likes, watch-later) ordering adjustments
      const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };

      // If the playlist has a stored order for "likes" or "watch-later", adjust accordingly
      if (oldState && nextPlaylistCardOrderMap[oldState]) {
        nextPlaylistCardOrderMap[oldState] = nextPlaylistCardOrderMap[oldState].filter((id) => id !== cleanId);
      }

      if (newState && nextPlaylistCardOrderMap[newState]) {
        const newList = nextPlaylistCardOrderMap[newState] || [];
        if (!newList.includes(cleanId)) {
          nextPlaylistCardOrderMap[newState] = [cleanId, ...newList];
        }
      }

      return {
        cardDifficultyMap: nextDifficultyMap,
        cardsById: nextCardsById,
        playlistCardOrderMap: nextPlaylistCardOrderMap,
        smartPlaylistDeltaCounts: nextDeltas,
      };
    });
  },

  revertTransfer: (cardId, oldState, failedState, timestamp) => {
    set((state) => {
      const cleanId = cardId.split('-loop-')[0];
      console.log(`[DIAGNOSTIC - STORE] !!! revertTransfer Rolled back | Card ID: ${cleanId} from "${failedState}" -> "${oldState}"`);
      const current = state.cardDifficultyMap[cleanId];

      // Discard stale rollbacks if the user has already executed a newer classification
      if (current && current.updatedAt > timestamp) {
        return {};
      }

      const currentState = current ? current.difficulty : failedState;
      const originalDifficulty = current ? current.originalDifficulty : oldState;

      // Safe deltas rollback atomically
      const nextDeltas = { ...state.smartPlaylistDeltaCounts };
      if (currentState && ['easy', 'medium', 'hard', 'skipped'].includes(currentState)) {
        nextDeltas[currentState] = (nextDeltas[currentState] || 0) - 1;
      }
      if (oldState && ['easy', 'medium', 'hard', 'skipped'].includes(oldState)) {
        nextDeltas[oldState] = (nextDeltas[oldState] || 0) + 1;
      }

      const nextDifficultyMap = { ...state.cardDifficultyMap };
      if (oldState === originalDifficulty) {
        delete nextDifficultyMap[cleanId];
      } else {
        nextDifficultyMap[cleanId] = {
          difficulty: oldState,
          originalDifficulty,
          updatedAt: Date.now(),
          optimistic: false,
        };
      }

      const nextCardsById = { ...state.cardsById };
      if (nextCardsById[cleanId]) {
        // Derive and align progress object referentially inside rollback transaction
        const qp = oldState
          ? {
              attemptStatus: oldState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
              perceivedDifficultyByUser: oldState === 'skipped' ? null : (oldState as any),
            }
          : null;

        nextCardsById[cleanId] = {
          ...nextCardsById[cleanId],
          _id: cleanId, // Force canonical clean ID in the cache!
          difficultyState: oldState,
          currentUserQuestionProgress: qp,
        };
      }

      const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };

      // Revert failed list additions
      if (failedState && nextPlaylistCardOrderMap[failedState]) {
        nextPlaylistCardOrderMap[failedState] = nextPlaylistCardOrderMap[failedState].filter((id) => id !== cleanId);
      }

      // Restore to old list
      if (oldState && nextPlaylistCardOrderMap[oldState]) {
        const oldList = nextPlaylistCardOrderMap[oldState] || [];
        if (!oldList.includes(cleanId)) {
          nextPlaylistCardOrderMap[oldState] = [cleanId, ...oldList];
        }
      }

      return {
        cardDifficultyMap: nextDifficultyMap,
        cardsById: nextCardsById,
        playlistCardOrderMap: nextPlaylistCardOrderMap,
        smartPlaylistDeltaCounts: nextDeltas,
      };
    });
  },

  reconcileServerState: (cardId, serverState) => {
    set((state) => {
      const cleanId = cardId.split('-loop-')[0];
      const current = state.cardDifficultyMap[cleanId];
      if (!current) return {};

      // Mark as confirmed (optimistic: false)
      const nextDifficultyMap = {
        ...state.cardDifficultyMap,
        [cleanId]: { ...current, optimistic: false },
      };

      return {
        cardDifficultyMap: nextDifficultyMap,
      };
    });
  },

  cleanupResolvedState: () => {
    set((state) => {
      const nextDifficultyMap = { ...state.cardDifficultyMap };
      let changed = false;

      Object.keys(nextDifficultyMap).forEach((key) => {
        if (!nextDifficultyMap[key].optimistic) {
          delete nextDifficultyMap[key];
          changed = true;
        }
      });

      return changed ? { cardDifficultyMap: nextDifficultyMap } : {};
    });
  },

  enqueueOfflineAction: (action) => {
    set((state) => {
      const newAction: OfflineAction = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };
      console.log(`[Offline Queue] Enqueued offline action:`, newAction);
      return {
        offlineActionQueue: [...state.offlineActionQueue, newAction],
      };
    });
  },

  clearOfflineActions: () => {
    set({ offlineActionQueue: [] });
  },
}),
{
  name: 'dsa-playlist-state',
  storage: createJSONStorage(() => AsyncStorage),
}
)
);
