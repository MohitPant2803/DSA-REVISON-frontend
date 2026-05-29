import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { InteractionManager } from 'react-native';
import { storageEngine } from '../utils/StorageEngine';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { useTrackingStore } from './useTrackingStore';
import { mergeCardState } from '@/utils/resolveCardState';
import type { IFolder } from '@/types/folder';
import type { ApiPlaylist } from '@/services/playlistService';
import {
  saveFoldersToSQLite,
  deleteFolderFromSQLite,
  savePlaylistsToSQLite,
  deletePlaylistFromSQLite,
  saveCardsToSQLite,
  deleteCardFromSQLite,
  enqueueActionInSQLite,
  removeProcessedActionsFromSQLite,
  clearOfflineActionsInSQLite,
  isEntityDeletedInSQLite,
} from '../utils/sqliteSyncBridge';
import { getOrCreateClockEpoch } from '../utils/sqliteDatabase';
import { logPersonalAction } from '@/utils/personalActionLogger';


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
    | 'UPDATE_FOLDER'
    | 'CREATE_CARD'
    | 'DELETE_CARD'
    | 'UPDATE_CARD';
  payload: any;
  timestamp: number;
  retryCount?: number;
  localRevision?: number;
  deviceId?: string;
  logicalSequence?: number;
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

export function validateStoreShape(state: any): boolean {
  if (!state) return false;
  if (!Array.isArray(state.offlineActionQueue)) return false;
  if (!Array.isArray(state.deadLetterQueue)) return false;
  if (typeof state.foldersById !== 'object' || state.foldersById === null) return false;
  if (typeof state.playlistsById !== 'object' || state.playlistsById === null) return false;
  if (typeof state.cardDifficultyMap !== 'object' || state.cardDifficultyMap === null) return false;
  if (typeof state.playlistCardOrderMap !== 'object' || state.playlistCardOrderMap === null) return false;
  return true;
}

interface PlaylistState {
  // Hydration Gate & Status Boundaries
  hasHydrated: boolean;
  setHasHydrated: (val: boolean) => void;
  bootstrapStatus: BootstrapStatus;
  setBootstrapStatus: (status: BootstrapStatus) => void;
  syncStatus: 'synced' | 'syncing' | 'offline';
  setSyncStatus: (status: 'synced' | 'syncing' | 'offline') => void;
  hasSyncedThisSession: boolean;
  setHasSyncedThisSession: (val: boolean) => void;

  // Local-First Sync Coordination flags
  isLiveSyncPaused: boolean;
  setLiveSyncPaused: (val: boolean) => void;
  syncGenerationId: number;
  incrementSyncGeneration: () => number;
  currentRevisionCounter: number;
  deadLetterQueue: OfflineAction[];
  syncTriggerCount: number;
  triggerSync: () => void;
  userId: string | null;

  // Phase 0 Migration & Observability
  storeSchemaVersion: number;
  enableRevisionSync: boolean;
  enableStrictContiguity: boolean;
  lastSyncedRevision: number;
  setLastSyncedRevision: (rev: number) => void;
  setRevisionSyncFlags: (flags: { enableRevisionSync: boolean; enableStrictContiguity: boolean }) => void;

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
  fullPlaylistCards: Record<string, IPopulatedRevisionCard[]>;
  hydratedPlaylistCardCounts: Record<string, number>;

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
  checkAndLoadMorePlaylistCards: (playlistId: string, activeIndex: number) => void;
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
  poisonActionIds: string[];
  enqueueOfflineAction: (action: Omit<OfflineAction, 'id' | 'retryCount' | 'localRevision' | 'deviceId' | 'logicalSequence'>) => void;
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

  seniorQuotes: any[];
  setSeniorQuotes: (quotes: any[]) => void;
  currentQuoteIndex: number;
  incrementQuoteIndex: (quotesCount: number) => void;
  dbVersion: string | null;
  deviceId: string;
  logicalClockSequence: number;
  applyQueueRewrite: (newQueue: OfflineAction[]) => void;
}

const DEFAULT_STATE = {
  hasHydrated: false,
  bootstrapStatus: 'not_started' as BootstrapStatus,
  syncStatus: 'synced' as 'synced' | 'syncing' | 'offline',
  isLiveSyncPaused: false,
  hasSyncedThisSession: false,
  syncGenerationId: 0,
  currentRevisionCounter: 0,
  deadLetterQueue: [],
  syncTriggerCount: 0,
  userId: null,
  storeSchemaVersion: 3,
  enableRevisionSync: false,
  enableStrictContiguity: false,
  lastSyncedRevision: 0,
  deviceId: '',
  logicalClockSequence: 0,
  foldersById: {},
  playlistsById: {},
  cardsById: {},
  cardDifficultyMap: {},
  playlistCardOrderMap: {},
  initialSmartCounts: {},
  smartPlaylistDeltaCounts: { easy: 0, medium: 0, hard: 0, skipped: 0 },
  hydratedPlaylists: {},
  fullPlaylistCards: {},
  hydratedPlaylistCardCounts: {},
  offlineActionQueue: [],
  poisonActionIds: [],
  lastSyncedAt: null,
  lastSuccessfulSyncAt: null,
  lastCatalogIntegrityCheck: null,
  syncFailureCount: 0,
  pruneStaleCache: () => {},
  seniorQuotes: [
    {
      _id: "6a13357421b348638d89b061",
      text: "It's a marathon to be endured, not a sprint to be ran.",
      author: "Mohit Pant",
      collegeName: "IIT KGP",
      branch: "Mining",
      yearOfGraduation: 2027
    }
  ],
  currentQuoteIndex: 0,
  dbVersion: null,
};

const cleanCardIds = (cardIds: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];

  cardIds.forEach((id) => {
    const cleanId = String(id || '').split('-loop-')[0];
    if (!cleanId || seen.has(cleanId)) return;
    seen.add(cleanId);
    output.push(cleanId);
  });

  return output;
};

export const usePlaylistStateStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setHasHydrated: (val) => set({ hasHydrated: val }),
      setBootstrapStatus: (status) => set({ bootstrapStatus: status }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setLiveSyncPaused: (val) => set({ isLiveSyncPaused: val }),
      triggerSync: () => set((state) => ({ syncTriggerCount: state.syncTriggerCount + 1 })),
      setHasSyncedThisSession: (val) => set({ hasSyncedThisSession: val }),
      setSeniorQuotes: (quotes) => set({ seniorQuotes: quotes }),
      incrementQuoteIndex: (quotesCount) => {
        set((state) => {
          const nextIndex = state.currentQuoteIndex + 1;
          return {
            currentQuoteIndex: nextIndex >= quotesCount ? 0 : nextIndex
          };
        });
      },
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
      setLastSyncedRevision: (rev) => set({ lastSyncedRevision: rev }),
      setRevisionSyncFlags: (flags) => set({ enableRevisionSync: flags.enableRevisionSync, enableStrictContiguity: flags.enableStrictContiguity }),
      applyQueueRewrite: (newQueue) => {
        set({ offlineActionQueue: [...newQueue] });
        try {
          const activeUserId = get().userId || 'guest-user';
          clearOfflineActionsInSQLite(activeUserId);
          const epoch = getOrCreateClockEpoch();
          newQueue.forEach(a => enqueueActionInSQLite(a, activeUserId, epoch));
        } catch (err: any) {
          console.error('[SQLite Bridge Error] applyQueueRewrite failed:', err.message);
        }
        if (__DEV__) {
          console.log(`[Zustand Store] Atomically rewrote offline queue. New size: ${newQueue.length}`);
        }
      },

      hardResetStore: () => {
        console.warn('[Zustand Store] Hard Reset Triggered due to Storage/Hydration Corruption recovery!');
        set({ ...DEFAULT_STATE, hasHydrated: true });
      },

      hydrateSmartCounts: (counts) => {
        set((state) => {
          if (__DEV__) console.log(`[Zustand] hydrateSmartCounts:`, counts);
          
          // Deduct current optimistic deltas from the incoming counts to get the correct base counts.
          // This avoids double-counting since the incoming counts are computed (base + delta).
          const adjustedCounts: Record<string, number> = {};
          let changed = false;

          Object.keys(counts).forEach((key) => {
            const passedCount = counts[key];
            const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(key);

            if (isSmart) {
              const delta = state.smartPlaylistDeltaCounts[key] || 0;
              const baseCount = Math.max(0, passedCount - delta);
              adjustedCounts[key] = baseCount;

              if (state.initialSmartCounts[key] !== baseCount) {
                changed = true;
              }
            } else {
              adjustedCounts[key] = passedCount;
              if (state.initialSmartCounts[key] !== passedCount) {
                changed = true;
              }
            }
          });

          // Avoid triggering unnecessary store state updates if the counts are identical.
          if (!changed) {
            return {};
          }

          const nextCounts = { ...state.initialSmartCounts, ...adjustedCounts };
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
          const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
          const activeUserId = state.userId || 'guest-user';
          const safeCards = cards.filter((card) => {
            if (!card?._id) return false;
            return !isEntityDeletedInSQLite(activeUserId, 'card', card._id);
          });
          
          // Store complete cards list in memory
          const nextFullPlaylistCards = {
            ...state.fullPlaylistCards,
            [playlistId]: safeCards
          };

          const initialLoadCount = Math.min(20, safeCards.length);
          const initialCards = safeCards.slice(0, initialLoadCount);

          if (__DEV__) {
            console.log(`[Zustand] hydratePlaylistCards for Playlist: "${playlistId}" | Initial count hydrated: ${initialLoadCount} of ${cards.length}`);
          }

          const nextCardsById = { ...state.cardsById };
          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
          const nextHydratedPlaylists = { ...state.hydratedPlaylists, [playlistId]: true };
          const nextHydratedPlaylistCardCounts = {
            ...state.hydratedPlaylistCardCounts,
            [playlistId]: initialLoadCount
          };

          // Hydrate the initial 20 cards
          initialCards.forEach((card) => {
            if (!card || !card._id) return;
            const cleanId = card._id.split('-loop-')[0];
            const existingCard = nextCardsById[cleanId];
            const local = state.cardDifficultyMap[cleanId];
            
            nextCardsById[cleanId] = mergeCardState(local, existingCard, card);
          });

          if (!isSmart) {
            const cleanIds = cleanCardIds(safeCards.map((c) => c._id));
            nextPlaylistCardOrderMap[playlistId] = cleanIds;
          }

          return {
            cardsById: nextCardsById,
            playlistCardOrderMap: nextPlaylistCardOrderMap,
            hydratedPlaylists: nextHydratedPlaylists,
            fullPlaylistCards: nextFullPlaylistCards,
            hydratedPlaylistCardCounts: nextHydratedPlaylistCardCounts,
          };
        });
      },

      checkAndLoadMorePlaylistCards: (playlistId, activeIndex) => {
        set((state) => {
          const fullCards = state.fullPlaylistCards[playlistId];
          if (!fullCards || fullCards.length === 0) return {};

          const hydratedCount = state.hydratedPlaylistCardCounts[playlistId] || 0;
          const totalCards = fullCards.length;

          if (hydratedCount >= totalCards) return {};

          const remainingCount = totalCards - hydratedCount;
          const remainingFromActive = hydratedCount - activeIndex;

          // When less than 10 cards remain in the hydrated portion
          if (remainingFromActive < 10) {
            // "if less that 10 card remains then take as many as left"
            const loadCount = remainingCount < 10 ? remainingCount : 10;
            const nextHydratedCount = hydratedCount + loadCount;
            
            const newCardsToHydrate = fullCards.slice(hydratedCount, nextHydratedCount);
            
            if (__DEV__) {
              console.log(`[Zustand Store] Lazy hydrating next ${loadCount} cards. Hydrated: ${nextHydratedCount}/${totalCards}. Remaining: ${remainingCount - loadCount}`);
            }

            const nextCardsById = { ...state.cardsById };
            const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
            const nextHydratedPlaylistCardCounts = {
              ...state.hydratedPlaylistCardCounts,
              [playlistId]: nextHydratedCount
            };

            newCardsToHydrate.forEach((card) => {
              if (!card || !card._id) return;
              const cleanId = card._id.split('-loop-')[0];
              const existingCard = nextCardsById[cleanId];
              const local = state.cardDifficultyMap[cleanId];
              
              nextCardsById[cleanId] = mergeCardState(local, existingCard, card);
            });

            const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
            if (!isSmart) {
              const cleanIds = newCardsToHydrate.map((c) => c._id.split('-loop-')[0]).filter(Boolean);
              const existingOrder = nextPlaylistCardOrderMap[playlistId] || [];
              const existingSet = new Set(existingOrder);
              const newIds = cleanIds.filter((id) => !existingSet.has(id));
              nextPlaylistCardOrderMap[playlistId] = [...existingOrder, ...newIds];
            }

            return {
              cardsById: nextCardsById,
              playlistCardOrderMap: nextPlaylistCardOrderMap,
              hydratedPlaylistCardCounts: nextHydratedPlaylistCardCounts,
            };
          }

          return {};
        });
      },

      setPlaylistCardOrder: (playlistId, cardIds) => {
        set((state) => {
          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
          const cleanIds = cleanCardIds(cardIds);
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
            try {
              savePlaylistsToSQLite([nextPlaylists[playlistId]], state.userId || 'guest-user');
            } catch (err: any) {
              console.error('[SQLite Bridge Error] setPlaylistCardOrder failed to save to SQLite:', err.message);
            }
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

          const cleanIds = cleanCardIds(cardIds);
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

          if (!value) {
            import('@/services/sessionQueueService')
              .then(mod => mod.invalidateSession('likes'))
              .catch(err => console.error('[Dynamic Import Failure] Invalidate likes session failed:', err));
          }

          try {
            if (nextCardsById[cleanId]) {
              saveCardsToSQLite([nextCardsById[cleanId]], state.userId || 'guest-user');
            }
          } catch (err: any) {
            console.error('[SQLite Bridge Error] toggleFavoriteInStore failed:', err.message);
          }

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

          if (!value) {
            import('@/services/sessionQueueService')
              .then(mod => mod.invalidateSession('watch-later'))
              .catch(err => console.error('[Dynamic Import Failure] Invalidate watch-later session failed:', err));
          }

          try {
            if (nextCardsById[cleanId]) {
              saveCardsToSQLite([nextCardsById[cleanId]], state.userId || 'guest-user');
            }
          } catch (err: any) {
            console.error('[SQLite Bridge Error] toggleWatchLaterInStore failed:', err.message);
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
          
          const currentList = cleanCardIds(state.playlistCardOrderMap[playlistId] || []);
          let newList = currentList;
          if (value) {
            if (!currentList.includes(cleanId)) {
              newList = [...currentList, cleanId];
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
          const nextFullPlaylistCards = { ...state.fullPlaylistCards };
          const nextHydratedPlaylistCardCounts = { ...state.hydratedPlaylistCardCounts };

          if (!value && nextFullPlaylistCards[playlistId]) {
            nextFullPlaylistCards[playlistId] = nextFullPlaylistCards[playlistId]
              .filter((card) => card?._id?.split('-loop-')[0] !== cleanId);
            nextHydratedPlaylistCardCounts[playlistId] = Math.min(
              nextHydratedPlaylistCardCounts[playlistId] || 0,
              nextFullPlaylistCards[playlistId].length
            );
          } else if (value && state.cardsById[cleanId] && nextFullPlaylistCards[playlistId]) {
            const exists = nextFullPlaylistCards[playlistId]
              .some((card) => card?._id?.split('-loop-')[0] === cleanId);
            if (!exists) {
              nextFullPlaylistCards[playlistId] = [
                ...nextFullPlaylistCards[playlistId],
                state.cardsById[cleanId],
              ];
              nextHydratedPlaylistCardCounts[playlistId] = nextFullPlaylistCards[playlistId].length;
            }
          }

          // If a card was removed, invalidate active session queue to avoid out of bounds crash
          if (!value) {
            import('@/services/sessionQueueService')
              .then(mod => mod.invalidateSession(playlistId))
              .catch(err => console.error('[Dynamic Import Failure] Invalidate custom playlist session failed:', err));
          }

          try {
            if (nextPlaylists[playlistId]) {
              savePlaylistsToSQLite([nextPlaylists[playlistId]], state.userId || 'guest-user');
            }
          } catch (err: any) {
            console.error('[SQLite Bridge Error] toggleCustomPlaylistItemInStore failed:', err.message);
          }

          return {
            playlistCardOrderMap: nextPlaylistCardOrderMap,
            playlistsById: nextPlaylists,
            fullPlaylistCards: nextFullPlaylistCards,
            hydratedPlaylistCardCounts: nextHydratedPlaylistCardCounts,
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

          try {
            saveCardsToSQLite([nextCardsById[cleanId]], state.userId || 'guest-user');
          } catch (err: any) {
            console.error('[SQLite Bridge Error] transferCard failed:', err.message);
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

          try {
            if (nextCardsById[cleanId]) {
              saveCardsToSQLite([nextCardsById[cleanId]], state.userId || 'guest-user');
            }
          } catch (err: any) {
            console.error('[SQLite Bridge Error] revertTransfer failed:', err.message);
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

      enqueueOfflineAction: (action) => {
        set((state) => {
          const nextRev = state.currentRevisionCounter + 1;
          const nextSeq = state.logicalClockSequence + 1;
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
            deviceId: state.deviceId || 'unknown-device',
            logicalSequence: nextSeq,
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

          try {
            const activeUserId = state.userId || 'guest-user';
            clearOfflineActionsInSQLite(activeUserId);
            const epoch = getOrCreateClockEpoch();
            compactedQueue.forEach(a => enqueueActionInSQLite(a, activeUserId, epoch));
          } catch (err: any) {
            console.error('[SQLite Bridge Error] enqueueOfflineAction failed:', err.message);
          }

          if (__DEV__) {
            console.log(`[Offline Queue] Enqueued with Monotonic Rev ${nextRev} & Logical Seq ${nextSeq}:`, newAction, `| Queue Size: ${compactedQueue.length}`);
          }

          setTimeout(() => {
            try {
              const { flushPendingWrites } = require('@/utils/StorageEngine');
              flushPendingWrites();
            } catch {}
          }, 0);

          return {
            offlineActionQueue: compactedQueue,
            currentRevisionCounter: nextRev,
            logicalClockSequence: nextSeq,
          };
        });
      },

      clearOfflineActions: () => {
        try {
          clearOfflineActionsInSQLite(get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] clearOfflineActions failed:', err.message);
        }
        set({ offlineActionQueue: [], poisonActionIds: [] });
      },

      removeProcessedActions: (processedIds) => {
        try {
          removeProcessedActionsFromSQLite(processedIds, get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] removeProcessedActions failed:', err.message);
        }
        set((state) => {
          const idsSet = new Set(processedIds);
          const nextPlaylists = { ...state.playlistsById };
          const nextFolders = { ...state.foldersById };
          const nextCards = { ...state.cardsById };
          const nextDifficultyMap = { ...state.cardDifficultyMap };

          state.offlineActionQueue.forEach((a) => {
            if (!idsSet.has(a.id)) return;
            const payload = a.payload;
            if (!payload) return;

            if (a.action === 'CREATE_PLAYLIST' || a.action === 'UPDATE_PLAYLIST' || a.action === 'TOGGLE_PLAYLIST_ITEM' || a.action === 'REORDER_PLAYLIST') {
              const pId = payload.playlistId || payload.tempId;
              if (pId && nextPlaylists[pId]) {
                nextPlaylists[pId] = { ...nextPlaylists[pId], dirty: false, localRevision: undefined };
              }
            } else if (a.action === 'DELETE_PLAYLIST') {
              const pId = payload.playlistId;
              if (pId) {
                delete nextPlaylists[pId];
              }
            } else if (a.action === 'CREATE_FOLDER' || a.action === 'UPDATE_FOLDER') {
              const fId = payload.folderId || payload.tempId || payload.dto?._id;
              if (fId && nextFolders[fId]) {
                nextFolders[fId] = { ...nextFolders[fId], dirty: false, localRevision: undefined };
              }
            } else if (a.action === 'CLASSIFY_CARD' || a.action === 'TOGGLE_FAVORITE') {
              const cId = payload.cardId;
              if (cId) {
                if (nextCards[cId]) {
                  nextCards[cId] = { ...nextCards[cId], dirty: false, localRevision: undefined };
                }
                if (nextDifficultyMap[cId]) {
                  nextDifficultyMap[cId] = { ...nextDifficultyMap[cId], optimistic: false, dirty: false };
                }
              }
            }
          });

          const nextQueue = state.offlineActionQueue.filter((a) => !idsSet.has(a.id));
          if (__DEV__) {
            console.log(`[Offline Queue] Removed ${processedIds.length} acknowledged actions. Remaining: ${nextQueue.length}`);
          }

          setTimeout(() => {
            try {
              const { flushPendingWrites } = require('@/utils/StorageEngine');
              flushPendingWrites();
            } catch {}
          }, 0);

          return { 
            offlineActionQueue: nextQueue,
            playlistsById: nextPlaylists,
            foldersById: nextFolders,
            cardsById: nextCards,
            cardDifficultyMap: nextDifficultyMap
          };
        });
      },

      isolatePoisonActions: (failedIds) => {
        set((state) => {
          const idsSet = new Set(failedIds);
          let nextPoison = [...state.poisonActionIds];
          let nextQueue = [...state.offlineActionQueue];
          
          state.offlineActionQueue.forEach((a) => {
            if (idsSet.has(a.id)) {
              if (!nextPoison.includes(a.id)) nextPoison.push(a.id);
            }
          });
          nextQueue = state.offlineActionQueue.filter(a => !idsSet.has(a.id));
          return { poisonActionIds: nextPoison, offlineActionQueue: nextQueue };
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
        const activeUserId = get().userId || 'guest-user';
        const safeFolders = folders.filter((f) => f?._id && !isEntityDeletedInSQLite(activeUserId, 'folder', f._id));
        try {
          saveFoldersToSQLite(safeFolders, activeUserId);
        } catch (err: any) {
          console.error('[SQLite Bridge Error] hydrateFolders failed:', err.message);
        }
        set((state) => {
          const nextFolders = { ...state.foldersById };
          safeFolders.forEach((f) => {
            if (f && f._id) nextFolders[f._id] = f;
          });
          return { foldersById: nextFolders };
        });
      },

      hydratePlaylists: (playlists) => {
        const activeUserId = get().userId || 'guest-user';
        const safePlaylists = playlists.filter((p) => p?._id && !isEntityDeletedInSQLite(activeUserId, 'playlist', p._id));
        try {
          savePlaylistsToSQLite(safePlaylists, activeUserId);
        } catch (err: any) {
          console.error('[SQLite Bridge Error] hydratePlaylists failed:', err.message);
        }
        set((state) => {
          const nextPlaylists = { ...state.playlistsById };
          const activeQueue = state.offlineActionQueue;

          safePlaylists.forEach((p) => {
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
        const nextRev = get().currentRevisionCounter + 1;
        const newPlaylist = {
          ...playlist,
          dirty: true,
          localRevision: nextRev,
        };
        try {
          savePlaylistsToSQLite([newPlaylist], get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] createPlaylistInStore failed:', err.message);
        }
        set((state) => {
          const nextState = {
            ...state,
            playlistsById: {
              ...state.playlistsById,
              [playlist._id]: newPlaylist,
            },
            currentRevisionCounter: nextRev,
          };
          logPersonalAction('playlist.created.local', {
            playlistId: playlist._id,
            name: playlist.name,
          }, nextState);
          return {
            playlistsById: nextState.playlistsById,
            currentRevisionCounter: nextRev,
          };
        });
      },

      deletePlaylistInStore: (playlistId) => {
        try {
          deletePlaylistFromSQLite(playlistId, get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] deletePlaylistInStore failed:', err.message);
        }
        set((state) => {
          const playlist = state.playlistsById[playlistId];
          if (!playlist) return {};

          const nextPlaylists = {
            ...state.playlistsById,
            [playlistId]: {
              ...playlist,
              isDeleted: true,
              deletedAt: new Date().toISOString(),
            }
          };
          
          const nextOrderMap = { ...state.playlistCardOrderMap };
          delete nextOrderMap[playlistId];
          
          const nextHydrated = { ...state.hydratedPlaylists };
          delete nextHydrated[playlistId];
          const nextFullPlaylistCards = { ...state.fullPlaylistCards };
          delete nextFullPlaylistCards[playlistId];
          const nextHydratedCounts = { ...state.hydratedPlaylistCardCounts };
          delete nextHydratedCounts[playlistId];

          const nextState = {
            ...state,
            playlistsById: nextPlaylists,
            playlistCardOrderMap: nextOrderMap,
            hydratedPlaylists: nextHydrated,
            fullPlaylistCards: nextFullPlaylistCards,
            hydratedPlaylistCardCounts: nextHydratedCounts,
          };
          logPersonalAction('playlist.deleted.local', {
            playlistId,
            name: playlist.name,
          }, nextState);
          return {
            playlistsById: nextPlaylists,
            playlistCardOrderMap: nextOrderMap,
            hydratedPlaylists: nextHydrated,
            fullPlaylistCards: nextFullPlaylistCards,
            hydratedPlaylistCardCounts: nextHydratedCounts,
          };
        });
      },

      updatePlaylistInStore: (playlistId, name) => {
        set((state) => {
          const playlist = state.playlistsById[playlistId];
          if (!playlist) return {};
          const nextRev = state.currentRevisionCounter + 1;
          const updatedPlaylist = { ...playlist, name, dirty: true, localRevision: nextRev };
          try {
            savePlaylistsToSQLite([updatedPlaylist], state.userId || 'guest-user');
          } catch (err: any) {
            console.error('[SQLite Bridge Error] updatePlaylistInStore failed:', err.message);
          }
          const nextPlaylists = {
            ...state.playlistsById,
            [playlistId]: updatedPlaylist,
          };
          const nextState = {
            ...state,
            playlistsById: nextPlaylists,
            currentRevisionCounter: nextRev,
          };
          logPersonalAction('playlist.updated.local', {
            playlistId,
            name,
          }, nextState);
          return {
            playlistsById: nextPlaylists,
            currentRevisionCounter: nextRev,
          };
        });
      },

      createFolderInStore: (folder) => {
        const nextRev = get().currentRevisionCounter + 1;
        const newFolder = {
          ...folder,
          dirty: true,
          localRevision: nextRev,
        };
        try {
          saveFoldersToSQLite([newFolder], get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] createFolderInStore failed:', err.message);
        }
        set((state) => {
          return {
            foldersById: {
              ...state.foldersById,
              [folder._id]: newFolder,
            },
            currentRevisionCounter: nextRev,
          };
        });
      },

      deleteFolderInStore: (folderId) => {
        try {
          deleteFolderFromSQLite(folderId, get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] deleteFolderInStore failed:', err.message);
        }
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
        try {
          deleteCardFromSQLite(cardId, get().userId || 'guest-user');
        } catch (err: any) {
          console.error('[SQLite Bridge Error] deleteCardInStore failed:', err.message);
        }
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
          const updatedFolder = { ...folder, ...updateData, dirty: true, localRevision: nextRev } as IFolder;
          try {
            saveFoldersToSQLite([updatedFolder], state.userId || 'guest-user');
          } catch (err: any) {
            console.error('[SQLite Bridge Error] updateFolderInStore failed:', err.message);
          }
          return {
            foldersById: {
              ...state.foldersById,
              [folderId]: updatedFolder,
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
      version: 3,
      partialize: (state) => ({
        userId: state.userId,
        offlineActionQueue: state.offlineActionQueue,
        poisonActionIds: state.poisonActionIds,
        deadLetterQueue: state.deadLetterQueue,
        currentRevisionCounter: state.currentRevisionCounter,
        foldersById: state.foldersById,
        playlistsById: state.playlistsById,
        cardDifficultyMap: state.cardDifficultyMap,
        playlistCardOrderMap: state.playlistCardOrderMap,
        lastSyncedAt: state.lastSyncedAt,
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
        lastCatalogIntegrityCheck: state.lastCatalogIntegrityCheck,
        hydratedPlaylists: state.hydratedPlaylists,
        initialSmartCounts: state.initialSmartCounts,
        smartPlaylistDeltaCounts: state.smartPlaylistDeltaCounts,
        seniorQuotes: state.seniorQuotes,
        currentQuoteIndex: state.currentQuoteIndex,
        dbVersion: state.dbVersion,
        storeSchemaVersion: state.storeSchemaVersion,
        enableRevisionSync: state.enableRevisionSync,
        enableStrictContiguity: state.enableStrictContiguity,
        lastSyncedRevision: state.lastSyncedRevision,
        deviceId: state.deviceId,
        logicalClockSequence: state.logicalClockSequence,
        fullPlaylistCards: state.fullPlaylistCards,
        hydratedPlaylistCardCounts: state.hydratedPlaylistCardCounts,
      }),
      migrate: (persistedState: any, version: number) => {
        if (__DEV__) console.log(`[Schema Migration] Migrating from version ${version} to 3`);
        let state = { ...persistedState };
        if (version < 2) {
          state = {
            ...state,
            bootstrapStatus: 'not_started',
            foldersById: state.foldersById || {},
            playlistsById: state.playlistsById || {},
            hydratedPlaylists: state.hydratedPlaylists || {},
            syncFailureCount: 0,
            lastSuccessfulSyncAt: null,
            lastCatalogIntegrityCheck: null,
          };
        }
        if (version < 3) {
          state = {
            ...state,
            storeSchemaVersion: 3,
            enableRevisionSync: false,
            enableStrictContiguity: false,
            lastSyncedRevision: 0,
            offlineActionQueue: state.offlineActionQueue || [],
            poisonActionIds: [],
          };
        }
        return state;
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
            // Run shape validation audit
            if (!validateStoreShape(rehydratedState)) {
              console.error('[Zustand Rehydration] Store shape validation FAILED! Triggering self-healing hard reset.');
              rehydratedState.hardResetStore();
            } else {
              const duration = performance.now() - startTime;
              if (__DEV__) {
                console.log(`[Zustand Rehydration Completed] Took ${duration.toFixed(2)}ms.`);
              }

                // 1. Verify integrity & Setup SQLite Tables
                (async () => {
                  try {
                    const { isSQLiteAvailable, verifyDatabaseIntegrity, setupDatabaseTables } = require('../utils/sqliteDatabase');
                    if (isSQLiteAvailable()) {
                      verifyDatabaseIntegrity();
                      setupDatabaseTables();
                      const epoch = getOrCreateClockEpoch();
                      
                      const activeUserId = rehydratedState.userId || 'guest-user';
                      const authStore = require('./useAuthStore').useAuthStore;
                      const capturedGenId = authStore.getState().sessionGenerationId;
                      
                      // 2. Load latest relational state from SQLite canonical truth
                      const { loadStateFromSQLite } = require('../utils/sqliteSyncBridge');
                      const sqliteData = await loadStateFromSQLite(activeUserId);
                      
                      // Cancel guard check: if session changed mid-load, discard loaded state
                      if (capturedGenId !== authStore.getState().sessionGenerationId) {
                        console.log('[Zustand SQLite Rehydration] Aborting hydration commit: session switched mid-load.');
                        return;
                      }

                      if (sqliteData) {
                        const { foldersById, playlistsById, cardsById, offlineActionQueue } = sqliteData;
                        const currentState = usePlaylistStateStore.getState();

                        // Construct playlistCardOrderMap from loaded playlistsById
                        const nextPlaylistCardOrderMap = { ...currentState.playlistCardOrderMap };
                        Object.keys(playlistsById).forEach((id) => {
                          const p = playlistsById[id];
                          if (p && !['easy', 'medium', 'hard', 'skipped'].includes(id)) {
                            const cardIds = p.cardIds || p.orderedCardIds || [];
                            nextPlaylistCardOrderMap[id] = cardIds.map((cid: string) => cid.split('-loop-')[0]).filter(Boolean);
                          }
                        });

                        // Rebuild cardDifficultyMap from persisted card difficultyState values
                        const allCards = { ...currentState.cardsById, ...cardsById };
                        const nextDifficultyMap: Record<string, any> = { ...currentState.cardDifficultyMap };
                        Object.keys(allCards).forEach((cardId) => {
                          const card = allCards[cardId] as any;
                          if (card && card.difficultyState) {
                            // Only set if there's no existing optimistic entry
                            if (!nextDifficultyMap[cardId]?.optimistic) {
                              nextDifficultyMap[cardId] = {
                                difficulty: card.difficultyState,
                                originalDifficulty: card.difficultyState,
                                updatedAt: new Date(card.updatedAt || 0).getTime(),
                                optimistic: false,
                              };
                            }
                          }
                        });

                        usePlaylistStateStore.setState({
                          foldersById: { ...currentState.foldersById, ...foldersById },
                          playlistsById: { ...currentState.playlistsById, ...playlistsById },
                          cardsById: allCards,
                          playlistCardOrderMap: nextPlaylistCardOrderMap,
                          cardDifficultyMap: nextDifficultyMap,
                          offlineActionQueue: offlineActionQueue.length > 0 ? offlineActionQueue : currentState.offlineActionQueue,
                          lastSyncedRevision: sqliteData.lastSyncedRevision || 0,
                          lastSyncedAt: sqliteData.lastSyncedAt || null,
                        });
                        console.log(`[Zustand SQLite Rehydration] Canonical relational tables loaded successfully. Classifications: ${Object.keys(nextDifficultyMap).length} | Revision: ${sqliteData.lastSyncedRevision || 0}`);
                      }
                    }
                  } catch (sqlErr: any) {
                    console.error('[Zustand SQLite Rehydration Error] Setup failed:', sqlErr.message);
                  } finally {
                    // Set hasHydrated to true in the finally block so that it is guaranteed to run after SQLite loads,
                    // even if there is an error in the SQLite process!
                    const latestState = usePlaylistStateStore.getState();
                    latestState.setHasHydrated(true);
                  }
                })();
              
              // Auto-generate stable deviceId if not present
              if (!rehydratedState.deviceId) {
                let devId;
                try {
                  const Crypto = require('expo-crypto');
                  devId = Crypto.randomUUID();
                } catch {
                  devId = `device-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                }
                usePlaylistStateStore.setState({ deviceId: devId });
                console.log(`[Zustand DeviceId] Generated stable deviceId: ${devId}`);
              }
            }
          }
        };
      },
    }
  )
);
