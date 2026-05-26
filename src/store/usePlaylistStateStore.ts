import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { InteractionManager } from 'react-native';
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
  retryCount?: number;
  localRevision?: number;
}

export type DifficultyState = 'easy' | 'medium' | 'hard' | 'skipped' | null;

export interface LocalCardState {
  difficulty: DifficultyState;
  originalDifficulty: DifficultyState;
  updatedAt: number;
  optimistic: boolean;
  dirty?: boolean;
  localRevision?: number;
}

export type BootstrapStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

// Action-Aware Entity Compression Helper Function
export function compressQueue(queue: OfflineAction[]): OfflineAction[] {
  const output: OfflineAction[] = [];
  const activeClassifications = new Map<string, OfflineAction>();
  const activeFavorites = new Map<string, OfflineAction>();
  const activePlaylistItems = new Map<string, OfflineAction>();
  const activePlaylistReorders = new Map<string, OfflineAction>();
  const folderCreates = new Map<string, OfflineAction>(); // tempFolderId -> CREATE_FOLDER action
  const folderDeletes = new Set<string>(); // folderId deleted
  const playlistCreates = new Map<string, OfflineAction>(); // tempPlaylistId -> CREATE_PLAYLIST action
  const playlistDeletes = new Set<string>(); // playlistId deleted
  
  for (const action of queue) {
    const act = action.action;
    const payload = action.payload;
    
    if (act === 'CLASSIFY_CARD') {
      activeClassifications.set(payload.cardId, action);
    } else if (act === 'TOGGLE_FAVORITE') {
      activeFavorites.set(payload.cardId, action);
    } else if (act === 'TOGGLE_PLAYLIST_ITEM') {
      const key = `${payload.playlistId}-${payload.cardId}`;
      activePlaylistItems.set(key, action);
    } else if (act === 'REORDER_PLAYLIST') {
      activePlaylistReorders.set(payload.playlistId, action);
    } else if (act === 'CREATE_FOLDER') {
      folderCreates.set(payload.tempId, action);
    } else if (act === 'DELETE_FOLDER') {
      const fId = payload.folderId;
      if (folderCreates.has(fId)) {
        folderCreates.delete(fId);
      } else {
        folderDeletes.add(fId);
      }
    } else if (act === 'CREATE_PLAYLIST') {
      playlistCreates.set(payload.tempId, action);
    } else if (act === 'DELETE_PLAYLIST') {
      const pId = payload.playlistId;
      if (playlistCreates.has(pId)) {
        playlistCreates.delete(pId);
      } else {
        playlistDeletes.add(pId);
      }
    } else {
      output.push(action);
    }
  }
  
  const finalQueue: OfflineAction[] = [];
  folderCreates.forEach(a => finalQueue.push(a));
  playlistCreates.forEach(a => finalQueue.push(a));
  
  for (const action of queue) {
    const act = action.action;
    const payload = action.payload;
    
    if (act === 'CLASSIFY_CARD') {
      if (activeClassifications.get(payload.cardId) === action) {
        finalQueue.push(action);
      }
    } else if (act === 'TOGGLE_FAVORITE') {
      if (activeFavorites.get(payload.cardId) === action) {
        finalQueue.push(action);
      }
    } else if (act === 'TOGGLE_PLAYLIST_ITEM') {
      const key = `${payload.playlistId}-${payload.cardId}`;
      if (activePlaylistItems.get(key) === action) {
        finalQueue.push(action);
      }
    } else if (act === 'REORDER_PLAYLIST') {
      if (activePlaylistReorders.get(payload.playlistId) === action) {
        finalQueue.push(action);
      }
    } else if (act === 'DELETE_FOLDER') {
      if (folderDeletes.has(payload.folderId)) {
        finalQueue.push(action);
        folderDeletes.delete(payload.folderId);
      }
    } else if (act === 'DELETE_PLAYLIST') {
      if (playlistDeletes.has(payload.playlistId)) {
        finalQueue.push(action);
        playlistDeletes.delete(payload.playlistId);
      }
    } else if (act !== 'CREATE_FOLDER' && act !== 'CREATE_PLAYLIST') {
      if (output.includes(action)) {
        finalQueue.push(action);
      }
    }
  }
  
  return finalQueue.sort((a, b) => a.timestamp - b.timestamp);
}

interface PlaylistState {
  // Hydration Gate & Status Boundaries
  hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;
  bootstrapStatus: BootstrapStatus;
  setBootstrapStatus: (status: BootstrapStatus) => void;
  syncStatus: 'synced' | 'syncing' | 'offline';
  setSyncStatus: (status: 'synced' | 'syncing' | 'offline') => void;

  // Local-First Sync Coordination flags
  isLiveSyncPaused: boolean;
  setLiveSyncPaused: (val: boolean) => void;
  syncGenerationId: number;
  incrementSyncGeneration: () => number;
  currentRevisionCounter: number;
  deadLetterQueue: OfflineAction[];
  pauseSyncGate: (() => void) | null;
  resumeSyncGate: (() => void) | null;

  // Authoritative Cache Entities
  foldersById: Record<string, IFolder & { dirty?: boolean; localRevision?: number }>;
  playlistsById: Record<string, ApiPlaylist & { dirty?: boolean; localRevision?: number }>;
  cardsById: Record<string, IPopulatedRevisionCard & { dirty?: boolean; localRevision?: number }>;
  
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
  removeProcessedActions: (processedIds: string[]) => void;
  isolatePoisonActions: (failedIds: string[]) => void;
  compressOfflineQueue: () => void;
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
  deleteCardInStore: (cardId: string) => void;
  
  // Entire Cache Hard Reset for corruption self-healing recovery
  hardResetStore: () => void;
  pruneStaleCache: () => void;
}

const DEFAULT_STATE = {
  hasHydrated: false,
  bootstrapStatus: 'not_started' as BootstrapStatus,
  syncStatus: 'synced' as 'synced' | 'syncing' | 'offline',
  isLiveSyncPaused: false,
  syncGenerationId: 0,
  currentRevisionCounter: 0,
  deadLetterQueue: [],
  pauseSyncGate: null,
  resumeSyncGate: null,
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
  pruneStaleCache: () => {},
};

export const usePlaylistStateStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setHasHydrated: (val) => set({ hasHydrated: val }),
      setBootstrapStatus: (status) => set({ bootstrapStatus: status }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setLiveSyncPaused: (val) => set({ isLiveSyncPaused: val }),
      incrementSyncGeneration: () => {
        const next = get().syncGenerationId + 1;
        set({ syncGenerationId: next });
        return next;
      },
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
          const cleanIds = cardIds.map(id => id.split('-loop-')[0]).filter(Boolean);
          nextPlaylistCardOrderMap[playlistId] = cleanIds;

          const nextPlaylists = { ...state.playlistsById };
          if (nextPlaylists[playlistId]) {
            const nextRev = state.currentRevisionCounter + 1;
            nextPlaylists[playlistId] = {
              ...nextPlaylists[playlistId],
              cardIds: cleanIds,
              orderedCardIds: cleanIds,
              dirty: true,
              localRevision: nextRev,
            };
            return {
              playlistCardOrderMap: nextPlaylistCardOrderMap,
              playlistsById: nextPlaylists,
              currentRevisionCounter: nextRev,
            };
          }

          return {
            playlistCardOrderMap: nextPlaylistCardOrderMap,
          };
        });
      },

      hydrateCustomPlaylistOrder: (playlistId, cardIds) => {
        set((state) => {
          const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
          if (isSmart) return {};

          const isHydrated = state.hydratedPlaylists[playlistId];
          const isDirty = state.playlistsById[playlistId]?.dirty;
          const hasPending = state.offlineActionQueue.some(
            (a) =>
              (a.action === 'TOGGLE_PLAYLIST_ITEM' && a.payload?.playlistId === playlistId) ||
              (a.action === 'REORDER_PLAYLIST' && a.payload?.playlistId === playlistId)
          );

          if (isHydrated || isDirty || hasPending) {
            return {};
          }

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
          const nextRev = state.currentRevisionCounter + 1;
          if (nextCardsById[cleanId]) {
            nextCardsById[cleanId] = {
              ...nextCardsById[cleanId],
              isFavorite: value,
              dirty: true,
              localRevision: nextRev,
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
            currentRevisionCounter: nextRev,
          };
        });
      },

      toggleWatchLaterInStore: (cardId, value) => {
        set((state) => {
          const cleanId = cardId.split('-loop-')[0];
          const nextCardsById = { ...state.cardsById };
          const nextRev = state.currentRevisionCounter + 1;
          if (nextCardsById[cleanId]) {
            nextCardsById[cleanId] = {
              ...nextCardsById[cleanId],
              isWatchLater: value,
              dirty: true,
              localRevision: nextRev,
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
            currentRevisionCounter: nextRev,
          };
        });
      },

      toggleCustomPlaylistItemInStore: (playlistId, cardId, value) => {
        set((state) => {
          const cleanId = cardId.split('-loop-')[0];
          const nextRev = state.currentRevisionCounter + 1;
          const nextPlaylists = { ...state.playlistsById };
          
          const currentList = state.playlistCardOrderMap[playlistId] || [];
          let newList = currentList;
          if (value) {
            if (!currentList.includes(cleanId)) {
              newList = [cleanId, ...currentList];
            }
          } else {
            newList = currentList.filter(id => id !== cleanId);
          }

          if (nextPlaylists[playlistId]) {
            nextPlaylists[playlistId] = {
              ...nextPlaylists[playlistId],
              cardIds: newList,
              orderedCardIds: newList,
              itemCount: newList.length,
              dirty: true,
              localRevision: nextRev,
            };
          }

          const nextPlaylistCardOrderMap = {
            ...state.playlistCardOrderMap,
            [playlistId]: newList,
          };
          return {
            playlistCardOrderMap: nextPlaylistCardOrderMap,
            playlistsById: nextPlaylists,
            currentRevisionCounter: nextRev,
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
          const nextRev = state.currentRevisionCounter + 1;

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
                optimistic: true,
                dirty: true,
                localRevision: nextRev,
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
            dirty: isOptimistic,
            localRevision: isOptimistic ? nextRev : undefined,
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

          const nextPlaylists = { ...state.playlistsById };
          if (oldState && nextPlaylists[oldState]) {
            nextPlaylists[oldState] = {
              ...nextPlaylists[oldState],
              itemCount: Math.max(0, (nextPlaylists[oldState].itemCount ?? 0) - 1),
            };
          }
          if (newState && nextPlaylists[newState]) {
            nextPlaylists[newState] = {
              ...nextPlaylists[newState],
              itemCount: (nextPlaylists[newState].itemCount ?? 0) + 1,
            };
          }

          return {
            cardDifficultyMap: nextDifficultyMap,
            cardsById: nextCardsById,
            playlistCardOrderMap: nextPlaylistCardOrderMap,
            playlistsById: nextPlaylists,
            smartPlaylistDeltaCounts: nextDeltas,
            currentRevisionCounter: isOptimistic ? nextRev : state.currentRevisionCounter,
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

          const nextPlaylists = { ...state.playlistsById };
          if (currentState && nextPlaylists[currentState]) {
            nextPlaylists[currentState] = {
              ...nextPlaylists[currentState],
              itemCount: Math.max(0, (nextPlaylists[currentState].itemCount ?? 0) - 1),
            };
          }
          if (oldState && nextPlaylists[oldState]) {
            nextPlaylists[oldState] = {
              ...nextPlaylists[oldState],
              itemCount: (nextPlaylists[oldState].itemCount ?? 0) + 1,
            };
          }

          return {
            cardDifficultyMap: nextDifficultyMap,
            cardsById: nextCardsById,
            playlistCardOrderMap: nextPlaylistCardOrderMap,
            playlistsById: nextPlaylists,
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
          const nextRev = state.currentRevisionCounter + 1;
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
            localRevision: nextRev,
            retryCount: 0,
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
            console.log(`[Offline Queue] Enqueued with Monotonic Rev ${nextRev}:`, newAction, `| Queue Size: ${compactedQueue.length}`);
          }
          return {
            offlineActionQueue: compactedQueue,
            currentRevisionCounter: nextRev,
          };
        });
      },

      clearOfflineActions: () => {
        set({ offlineActionQueue: [] });
      },

      removeProcessedActions: (processedIds) => {
        set((state) => {
          const idsSet = new Set(processedIds);
          const nextQueue = state.offlineActionQueue.filter((a) => !idsSet.has(a.id));
          if (__DEV__) {
            console.log(`[Offline Queue] Removed ${processedIds.length} acknowledged actions. Remaining: ${nextQueue.length}`);
          }
          return { offlineActionQueue: nextQueue };
        });
      },

      isolatePoisonActions: (failedIds) => {
        set((state) => {
          const failedSet = new Set(failedIds);
          const nextQueue: OfflineAction[] = [];
          const nextDLQ = [...state.deadLetterQueue];

          state.offlineActionQueue.forEach((a) => {
            if (failedSet.has(a.id)) {
              const retry = (a.retryCount || 0) + 1;
              if (retry > 3) {
                nextDLQ.push({ ...a, retryCount: retry });
                if (__DEV__) {
                  console.warn(`[Poison Queue] Action ${a.action} (${a.id}) isolated to Dead Letter Queue after 3 failures.`);
                }
              } else {
                nextQueue.push({ ...a, retryCount: retry });
              }
            } else {
              nextQueue.push(a);
            }
          });

          return {
            offlineActionQueue: nextQueue,
            deadLetterQueue: nextDLQ,
          };
        });
      },

      compressOfflineQueue: () => {
        set((state) => {
          const compressed = compressQueue(state.offlineActionQueue);
          if (__DEV__) {
            console.log(`[Offline Queue] Entity-Aware Compaction complete: ${state.offlineActionQueue.length} -> ${compressed.length}`);
          }
          return { offlineActionQueue: compressed };
        });
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
          const activeQueue = state.offlineActionQueue;

          playlists.forEach((p) => {
            if (!p || !p._id) return;

            const localPlaylist = state.playlistsById[p._id];
            const isDirty = localPlaylist?.dirty;
            const hasPendingAction = activeQueue.some(
              (a) =>
                (a.payload?.playlistId === p._id) ||
                (a.payload?.tempId === p._id)
            );

            if (isDirty || hasPendingAction) {
              return;
            }

            nextPlaylists[p._id] = p;
          });
          return { playlistsById: nextPlaylists };
        });
      },

      createPlaylistInStore: (playlist) => {
        set((state) => {
          const nextRev = state.currentRevisionCounter + 1;
          return {
            playlistsById: {
              ...state.playlistsById,
              [playlist._id]: {
                ...playlist,
                dirty: true,
                localRevision: nextRev,
              },
            },
            currentRevisionCounter: nextRev,
          };
        });
      },

      deletePlaylistInStore: (playlistId) => {
        set((state) => {
          const nextPlaylists = { ...state.playlistsById };
          delete nextPlaylists[playlistId];
          
          const nextOrderMap = { ...state.playlistCardOrderMap };
          delete nextOrderMap[playlistId];
          
          const nextHydrated = { ...state.hydratedPlaylists };
          delete nextHydrated[playlistId];

          return {
            playlistsById: nextPlaylists,
            playlistCardOrderMap: nextOrderMap,
            hydratedPlaylists: nextHydrated,
          };
        });
      },

      updatePlaylistInStore: (playlistId, name) => {
        set((state) => {
          const playlist = state.playlistsById[playlistId];
          if (!playlist) return {};
          const nextRev = state.currentRevisionCounter + 1;
          return {
            playlistsById: {
              ...state.playlistsById,
              [playlistId]: { ...playlist, name, dirty: true, localRevision: nextRev },
            },
            currentRevisionCounter: nextRev,
          };
        });
      },

      createFolderInStore: (folder) => {
        set((state) => {
          const nextRev = state.currentRevisionCounter + 1;
          return {
            foldersById: {
              ...state.foldersById,
              [folder._id]: {
                ...folder,
                dirty: true,
                localRevision: nextRev,
              },
            },
            currentRevisionCounter: nextRev,
          };
        });
      },

      deleteFolderInStore: (folderId) => {
        set((state) => {
          const nextFolders = { ...state.foldersById };
          delete nextFolders[folderId];
          
          const nextCards = { ...state.cardsById };
          const nextDifficultyMap = { ...state.cardDifficultyMap };
          const nextOrderMap = { ...state.playlistCardOrderMap };
          const nextPlaylists = { ...state.playlistsById };
          const deletedCardIds: string[] = [];

          Object.keys(nextCards).forEach((key) => {
            const card = nextCards[key];
            if (card && (card.folderId === folderId || card.rootFolderId === folderId || card.subfolderIds?.includes(folderId))) {
              delete nextCards[key];
              deletedCardIds.push(key);
            }
          });

          deletedCardIds.forEach((cardId) => {
            const cleanId = cardId.split('-loop-')[0];
            delete nextDifficultyMap[cleanId];
            
            // Clean up card references from all playlists
            Object.keys(nextOrderMap).forEach((pId) => {
              const rawIds = nextOrderMap[pId] || [];
              if (rawIds.includes(cleanId)) {
                const validIds = rawIds.filter((id) => id !== cleanId);
                nextOrderMap[pId] = validIds;
                
                if (nextPlaylists[pId]) {
                  nextPlaylists[pId] = {
                    ...nextPlaylists[pId],
                    itemCount: validIds.length,
                  };
                }
              }
            });
          });

          return {
            foldersById: nextFolders,
            cardsById: nextCards,
            cardDifficultyMap: nextDifficultyMap,
            playlistCardOrderMap: nextOrderMap,
            playlistsById: nextPlaylists,
          };
        });
      },

      deleteCardInStore: (cardId) => {
        set((state) => {
          const cleanId = cardId.split('-loop-')[0];
          
          // 1. Delete from cardsById
          const nextCards = { ...state.cardsById };
          delete nextCards[cleanId];
          
          // 2. Delete from cardDifficultyMap
          const nextDifficultyMap = { ...state.cardDifficultyMap };
          delete nextDifficultyMap[cleanId];

          // 3. Delete from playlistCardOrderMap and update playlistsById itemCount
          const nextOrderMap = { ...state.playlistCardOrderMap };
          const nextPlaylists = { ...state.playlistsById };
          
          Object.keys(nextOrderMap).forEach((pId) => {
            const rawIds = nextOrderMap[pId] || [];
            if (rawIds.includes(cleanId)) {
              const validIds = rawIds.filter((id) => id !== cleanId);
              nextOrderMap[pId] = validIds;
              
              // Also update denormalized counts in playlistsById
              if (nextPlaylists[pId]) {
                nextPlaylists[pId] = {
                  ...nextPlaylists[pId],
                  itemCount: validIds.length,
                };
              }
            }
          });

          return {
            cardsById: nextCards,
            cardDifficultyMap: nextDifficultyMap,
            playlistCardOrderMap: nextOrderMap,
            playlistsById: nextPlaylists,
          };
        });
      },

      updateFolderInStore: (folderId, updateData) => {
        set((state) => {
          const folder = state.foldersById[folderId];
          if (!folder) return {};
          const nextRev = state.currentRevisionCounter + 1;
          return {
            foldersById: {
              ...state.foldersById,
              [folderId]: { ...folder, ...updateData, dirty: true, localRevision: nextRev } as IFolder,
            },
            currentRevisionCounter: nextRev,
          };
        });
      },

      pruneStaleCache: () => {
        // Run lazily after active interactions to keep UI/JS thread at 60 FPS
        InteractionManager.runAfterInteractions(() => {
          set((state) => {
            const MAX_CARDS_CACHE = 500;
            const TARGET_CACHE_SIZE = 200;
            const cardEntries = Object.entries(state.cardsById);
            
            if (cardEntries.length <= MAX_CARDS_CACHE) {
              return {}; // No pruning needed
            }

            // Sort by updatedAt descending, keep newest 200 (TARGET_CACHE_SIZE)
            const sorted = cardEntries.sort(([, a], [, b]) => {
              const timeA = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
              const timeB = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
              return timeB - timeA;
            });

            const pruned: Record<string, any> = {};
            for (let i = 0; i < TARGET_CACHE_SIZE && i < sorted.length; i++) {
              pruned[sorted[i][0]] = sorted[i][1];
            }

            const removedCount = cardEntries.length - TARGET_CACHE_SIZE;
            console.log(`[Store] Lazy-Pruned ${removedCount} stale cards from cache. ${TARGET_CACHE_SIZE} retained.`);
            return { cardsById: pruned };
          });
        });
      },
    }),
    {
      name: 'dsa-playlist-state',
      storage: createJSONStorage(() => storageEngine),
      version: 2,
      partialize: (state) => ({
        offlineActionQueue: state.offlineActionQueue,
        deadLetterQueue: state.deadLetterQueue,
        currentRevisionCounter: state.currentRevisionCounter,
        foldersById: state.foldersById,
        playlistsById: state.playlistsById,
        cardDifficultyMap: state.cardDifficultyMap,
        playlistCardOrderMap: state.playlistCardOrderMap,
        lastSyncedAt: state.lastSyncedAt,
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
        lastCatalogIntegrityCheck: state.lastCatalogIntegrityCheck,
        cardsById: state.cardsById,
        hydratedPlaylists: state.hydratedPlaylists,
        initialSmartCounts: state.initialSmartCounts,
        smartPlaylistDeltaCounts: state.smartPlaylistDeltaCounts,
      }),
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
