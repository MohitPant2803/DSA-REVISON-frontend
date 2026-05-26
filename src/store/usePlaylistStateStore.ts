import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageEngine } from '../utils/StorageEngine';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useTrackingStore } from './useTrackingStore';
import { mergeCardState } from '@/utils/resolveCardState';
import type { IFolder } from '@/types/folder';
import type { ApiPlaylist } from '@/services/playlistService';

export interface OfflineAction {
  id: string;
  action: 
    | 'CLASSIFY_CARD' 
    | 'TOGGLE_FAVORITE' 
    | 'TOGGLE_PLAYLIST_ITEM' 
    | 'REORDER_PLAYLIST' 
    | 'REORDER_LIKES'
    | 'CREATE_PLAYLIST'
    | 'DELETE_PLAYLIST'
    | 'UPDATE_PLAYLIST'
    | 'CREATE_FOLDER'
    | 'DELETE_FOLDER'
    | 'UPDATE_FOLDER';
  payload: any;
  timestamp: number;
}

export type DifficultyState = 'easy' | 'medium' | 'hard' | 'skipped' | null;

export interface LocalCardState {
  difficulty: DifficultyState;
  originalDifficulty: DifficultyState;
  updatedAt: number;
  optimistic: boolean;
}

export type BootstrapStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

interface PlaylistState {
  // Hydration Gate & Status Boundaries
  hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;
  bootstrapStatus: BootstrapStatus;
  setBootstrapStatus: (status: BootstrapStatus) => void;
  syncStatus: 'synced' | 'syncing' | 'offline';
  setSyncStatus: (status: 'synced' | 'syncing' | 'offline') => void;

  // Authoritative Cache Entities
  foldersById: Record<string, IFolder>;
  playlistsById: Record<string, ApiPlaylist>;
  cardsById: Record<string, IPopulatedRevisionCard>;
  
  // Interactive Mappings
  cardDifficultyMap: Record<string, LocalCardState>;
  playlistCardOrderMap: Record<string, string[]>;
  initialSmartCounts: Record<string, number>;
  smartPlaylistDeltaCounts: Record<string, number>;
  hydratedPlaylists: Record<string, boolean>;

  // Observability & Recovery Metrics
  lastSuccessfulSyncAt: number | null;
  lastCatalogIntegrityCheck: number | null;
  syncFailureCount: number;
  incrementSyncFailure: () => void;
  resetSyncFailure: () => void;
  setLastSuccessfulSyncAt: (timestamp: number) => void;
  setLastCatalogIntegrityCheck: (timestamp: number) => void;

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
    newState: DifficultyState,
    isOptimistic?: boolean
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

  // Persistent Offline Action Queue & Compaction
  offlineActionQueue: OfflineAction[];
  enqueueOfflineAction: (action: Omit<OfflineAction, 'id'>) => void;
  clearOfflineActions: () => void;
  lastSyncedAt: string | null;
  setLastSyncedAt: (timestamp: string) => void;

  // Local-First Entity Mutation Caches (Phase 3 & 4)
  hydrateFolders: (folders: IFolder[]) => void;
  hydratePlaylists: (playlists: ApiPlaylist[]) => void;
  createPlaylistInStore: (playlist: ApiPlaylist) => void;
  deletePlaylistInStore: (playlistId: string) => void;
  updatePlaylistInStore: (playlistId: string, name: string) => void;
  createFolderInStore: (folder: IFolder) => void;
  deleteFolderInStore: (folderId: string) => void;
  updateFolderInStore: (folderId: string, updateData: Partial<IFolder>) => void;
  
  // Entire Cache Hard Reset for corruption self-healing recovery
  hardResetStore: () => void;
}

const DEFAULT_STATE = {
  hasHydrated: false,
  bootstrapStatus: 'not_started' as BootstrapStatus,
  syncStatus: 'synced' as 'synced' | 'syncing' | 'offline',
  foldersById: {},
  playlistsById: {},
  cardsById: {},
  cardDifficultyMap: {},
  playlistCardOrderMap: {},
  initialSmartCounts: {},
  smartPlaylistDeltaCounts: { easy: 0, medium: 0, hard: 0, skipped: 0 },
  hydratedPlaylists: {},
  offlineActionQueue: [],
  lastSyncedAt: null,
  lastSuccessfulSyncAt: null,
  lastCatalogIntegrityCheck: null,
  syncFailureCount: 0,
};

export const usePlaylistStateStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setHasHydrated: (val) => set({ hasHydrated: val }),
      setBootstrapStatus: (status) => set({ bootstrapStatus: status }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      incrementSyncFailure: () => set((state) => ({ syncFailureCount: state.syncFailureCount + 1 })),
      resetSyncFailure: () => set({ syncFailureCount: 0 }),
      setLastSuccessfulSyncAt: (timestamp) => set({ lastSuccessfulSyncAt: timestamp }),
      setLastCatalogIntegrityCheck: (timestamp) => set({ lastCatalogIntegrityCheck: timestamp }),
      setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

      hardResetStore: () => {
        console.warn('[Zustand Store] Hard Reset Triggered due to Storage/Hydration Corruption recovery!');
        set({ ...DEFAULT_STATE, hasHydrated: true });
      },

      hydrateSmartCounts: (counts) => {
        set((state) => {
          if (__DEV__) console.log(`[Zustand] hydrateSmartCounts:`, counts);
          const nextCounts = { ...state.initialSmartCounts, ...counts };
          const nextDifficultyMap = { ...state.cardDifficultyMap };
          
          Object.keys(nextDifficultyMap).forEach((cardId) => {
            const entry = nextDifficultyMap[cardId];
            if (entry && !entry.optimistic) {
              delete nextDifficultyMap[cardId];
            }
          });

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
          if (__DEV__) console.log(`[Zustand] hydratePlaylistCards for Playlist: "${playlistId}" | Count: ${cards.length}`);
          const nextCardsById = { ...state.cardsById };
          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
          const nextHydratedPlaylists = { ...state.hydratedPlaylists, [playlistId]: true };

          cards.forEach((card) => {
            if (!card || !card._id) return;
            const cleanId = card._id.split('-loop-')[0];
            const existingCard = nextCardsById[cleanId];
            const local = state.cardDifficultyMap[cleanId];
            
            nextCardsById[cleanId] = mergeCardState(local, existingCard, card);
          });

          const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
          if (!isSmart) {
            const cleanIds = cards.map((c) => c._id.split('-loop-')[0]).filter(Boolean);
            const existingOrder = nextPlaylistCardOrderMap[playlistId];

            if (!existingOrder) {
              nextPlaylistCardOrderMap[playlistId] = cleanIds;
            } else {
              const existingSet = new Set(existingOrder);
              const newIds = cleanIds.filter((id) => !existingSet.has(id));
              nextPlaylistCardOrderMap[playlistId] = [...existingOrder, ...newIds];
            }
          }

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

      transferCard: (cardId, cardObj, newState, isOptimistic = true) => {
        set((state) => {
          const cleanId = cardId.split('-loop-')[0];
          const oldStateObj = state.cardDifficultyMap[cleanId];
          const oldState = oldStateObj !== undefined 
            ? oldStateObj.difficulty 
            : (cardObj.difficultyState || null);

          if (oldState === newState) return {};

          const nextDeltas = { ...state.smartPlaylistDeltaCounts };
          const nextDifficultyMap = { ...state.cardDifficultyMap };

          if (isOptimistic) {
            const originalDifficulty = oldStateObj !== undefined
              ? oldStateObj.originalDifficulty
              : oldState;

            const timestamp = Date.now();
            if (oldState && ['easy', 'medium', 'hard', 'skipped'].includes(oldState)) {
              nextDeltas[oldState] = (nextDeltas[oldState] || 0) - 1;
            }
            if (newState && ['easy', 'medium', 'hard', 'skipped'].includes(newState)) {
              nextDeltas[newState] = (nextDeltas[newState] || 0) + 1;
            }

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
          } else {
            // Server-confirmed sync: clear out local optimistic state if it matches or is finalized
            delete nextDifficultyMap[cleanId];
          }

          const nextCardsById = { ...state.cardsById };
          const qp = newState
            ? {
                attemptStatus: newState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                perceivedDifficultyByUser: newState === 'skipped' ? null : (newState as any),
              }
            : null;

          nextCardsById[cleanId] = {
            ...(state.cardsById[cleanId] || cardObj),
            _id: cleanId,
            difficultyState: newState,
            currentUserQuestionProgress: qp,
          };

          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
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
          const current = state.cardDifficultyMap[cleanId];

          if (current && current.updatedAt > timestamp) {
            return {};
          }

          const currentState = current ? current.difficulty : failedState;
          const originalDifficulty = current ? current.originalDifficulty : oldState;

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
            const qp = oldState
              ? {
                  attemptStatus: oldState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                  perceivedDifficultyByUser: oldState === 'skipped' ? null : (oldState as any),
                }
              : null;

            nextCardsById[cleanId] = {
              ...nextCardsById[cleanId],
              _id: cleanId,
              difficultyState: oldState,
              currentUserQuestionProgress: qp,
            };
          }

          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
          if (failedState && nextPlaylistCardOrderMap[failedState]) {
            nextPlaylistCardOrderMap[failedState] = nextPlaylistCardOrderMap[failedState].filter((id) => id !== cleanId);
          }
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

      offlineActionQueue: [],
      enqueueOfflineAction: (action) => {
        set((state) => {
          let actionId;
          try {
            const Crypto = require('expo-crypto');
            actionId = Crypto.randomUUID();
          } catch {
            actionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          }
          const newAction: OfflineAction = {
            ...action,
            id: actionId,
          };

          let compactedQueue = [...state.offlineActionQueue];

          if (action.action === 'CLASSIFY_CARD') {
            const { cardId } = action.payload;
            compactedQueue = compactedQueue.filter(
              (a) => !(a.action === 'CLASSIFY_CARD' && a.payload.cardId === cardId)
            );
          } else if (action.action === 'TOGGLE_FAVORITE') {
            const { cardId } = action.payload;
            compactedQueue = compactedQueue.filter(
              (a) => !(a.action === 'TOGGLE_FAVORITE' && a.payload.cardId === cardId)
            );
          } else if (action.action === 'TOGGLE_PLAYLIST_ITEM') {
            const { playlistId, cardId } = action.payload;
            compactedQueue = compactedQueue.filter(
              (a) => !(a.action === 'TOGGLE_PLAYLIST_ITEM' && a.payload.playlistId === playlistId && a.payload.cardId === cardId)
            );
          } else if (action.action === 'REORDER_PLAYLIST') {
            const { playlistId } = action.payload;
            compactedQueue = compactedQueue.filter(
              (a) => !(a.action === 'REORDER_PLAYLIST' && a.payload.playlistId === playlistId)
            );
          } else if (action.action === 'REORDER_LIKES') {
            compactedQueue = compactedQueue.filter((a) => a.action !== 'REORDER_LIKES');
          } else if (action.action === 'UPDATE_PLAYLIST') {
            const { playlistId } = action.payload;
            compactedQueue = compactedQueue.filter(
              (a) => !(a.action === 'UPDATE_PLAYLIST' && a.payload.playlistId === playlistId)
            );
          } else if (action.action === 'UPDATE_FOLDER') {
            const { folderId } = action.payload;
            compactedQueue = compactedQueue.filter(
              (a) => !(a.action === 'UPDATE_FOLDER' && a.payload.folderId === folderId)
            );
          }

          compactedQueue.push(newAction);
          if (__DEV__) {
            console.log(`[Offline Queue] Enqueued and compacted action:`, newAction, `| Queue Size: ${compactedQueue.length}`);
          }
          return {
            offlineActionQueue: compactedQueue,
          };
        });
      },

      clearOfflineActions: () => {
        set({ offlineActionQueue: [] });
      },

      hydrateFolders: (folders) => {
        set((state) => {
          const nextFolders = { ...state.foldersById };
          folders.forEach((f) => {
            if (f && f._id) nextFolders[f._id] = f;
          });
          return { foldersById: nextFolders };
        });
      },

      hydratePlaylists: (playlists) => {
        set((state) => {
          const nextPlaylists = { ...state.playlistsById };
          playlists.forEach((p) => {
            if (p && p._id) nextPlaylists[p._id] = p;
          });
          return { playlistsById: nextPlaylists };
        });
      },

      createPlaylistInStore: (playlist) => {
        set((state) => ({
          playlistsById: {
            ...state.playlistsById,
            [playlist._id]: playlist,
          },
        }));
      },

      deletePlaylistInStore: (playlistId) => {
        set((state) => {
          const nextPlaylists = { ...state.playlistsById };
          delete nextPlaylists[playlistId];
          return { playlistsById: nextPlaylists };
        });
      },

      updatePlaylistInStore: (playlistId, name) => {
        set((state) => {
          const playlist = state.playlistsById[playlistId];
          if (!playlist) return {};
          return {
            playlistsById: {
              ...state.playlistsById,
              [playlistId]: { ...playlist, name },
            },
          };
        });
      },

      createFolderInStore: (folder) => {
        set((state) => ({
          foldersById: {
            ...state.foldersById,
            [folder._id]: folder,
          },
        }));
      },

      deleteFolderInStore: (folderId) => {
        set((state) => {
          const nextFolders = { ...state.foldersById };
          delete nextFolders[folderId];
          
          const nextCards = { ...state.cardsById };
          Object.keys(nextCards).forEach((key) => {
            const card = nextCards[key];
            if (card && (card.folderId === folderId || card.rootFolderId === folderId || card.subfolderIds?.includes(folderId))) {
              delete nextCards[key];
            }
          });

          return { foldersById: nextFolders, cardsById: nextCards };
        });
      },

      updateFolderInStore: (folderId, updateData) => {
        set((state) => {
          const folder = state.foldersById[folderId];
          if (!folder) return {};
          return {
            foldersById: {
              ...state.foldersById,
              [folderId]: { ...folder, ...updateData } as IFolder,
            },
          };
        });
      },
    }),
    {
      name: 'dsa-playlist-state',
      storage: createJSONStorage(() => storageEngine),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (__DEV__) console.log(`[Schema Migration] Migrating from version ${version} to 2`);
        if (version < 2) {
          return {
            ...persistedState,
            bootstrapStatus: 'not_started',
            foldersById: persistedState.foldersById || {},
            playlistsById: persistedState.playlistsById || {},
            hydratedPlaylists: persistedState.hydratedPlaylists || {},
            syncFailureCount: 0,
            lastSuccessfulSyncAt: null,
            lastCatalogIntegrityCheck: null,
          };
        }
        return persistedState;
      },
      onRehydrateStorage: (state) => {
        const startTime = performance.now();
        if (__DEV__) console.log('[Zustand Rehydration] Hydration started...');

        return (rehydratedState, error) => {
          if (error) {
            console.error('[Zustand Rehydration Error] Safe rehydration crashed:', error);
            if (state) {
              state.hardResetStore();
            }
          } else if (rehydratedState) {
            const duration = performance.now() - startTime;
            if (__DEV__) {
              console.log(`[Zustand Rehydration Completed] Took ${duration.toFixed(2)}ms.`);
            }
            rehydratedState.setHasHydrated(true);
          }
        };
      },
    }
  )
);
