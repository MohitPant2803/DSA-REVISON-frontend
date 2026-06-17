import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import offlineSeed from '../components/constants/offlineSeed.json';
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
  clearOfflineActionsInSQLite,
  isEntityDeletedInSQLite,
} from '../utils/sqliteSyncBridge';
import { getOrCreateClockEpoch } from '../utils/sqliteDatabase';
import { logPersonalAction } from '@/utils/personalActionLogger';
import { sqliteWriteManager } from '../utils/sqliteWriteManager';
import { saveDeletedEntityToSQLite } from '../utils/sqliteSyncBridge';


(global as any).dumpInstrumentState = (checkpointName: string) => {
  try {
    const usePlaylistStateStoreCopy = require('./usePlaylistStateStore').usePlaylistStateStore;
    const useAuthStoreCopy = require('./useAuthStore').useAuthStore;
    const state = usePlaylistStateStoreCopy.getState();
    const auth = useAuthStoreCopy.getState();
    const cardsCount = Object.keys(state.cardsById || {}).length;
    const foldersCount = Object.keys(state.foldersById || {}).length;
    const playlistsCount = Object.keys(state.playlistsById || {}).length;
    
    console.log(`[INSTRUMENT CHECKPOINT] ${checkpointName} | ` + JSON.stringify({
      isFirstTimeSyncInProgress: state.isFirstTimeSyncInProgress,
      bootstrapStatus: state.bootstrapStatus,
      cardsCount,
      foldersCount,
      playlistsCount,
      isAuthenticated: auth.isAuthenticated,
      userId: state.userId
    }));
  } catch (e) {
    console.warn(`[INSTRUMENT CHECKPOINT ERROR] Failed dumping state for: ${checkpointName}`, e);
  }
};

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
    | 'UPDATE_CARD'
    | 'UPDATE_REEL_PREFERENCES'
    | 'UPDATE_RESUME_STATE'
    | 'REGISTER_LOOP'
    | 'UPDATE_STREAK';
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

export type BootstrapStatus = 'not_started' | 'metadata_loading' | 'cards_loading' | 'completed' | 'failed' | 'in_progress';

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
    const activeResumeStates = new Map<string, OfflineAction>();
    
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
      } else if (act === 'UPDATE_RESUME_STATE') {
        const key = `${payload.type}-${payload.id}`;
        activeResumeStates.set(key, action);
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
    } else if (act === 'UPDATE_RESUME_STATE') {
      const key = `${payload.type}-${payload.id}`;
      if (activeResumeStates.get(key) === action) {
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
  // Gracefully self-heal and initialize missing state fields to prevent unnecessary hard resets
  if (!Array.isArray(state.offlineActionQueue)) state.offlineActionQueue = [];
  if (!Array.isArray(state.deadLetterQueue)) state.deadLetterQueue = [];
  if (typeof state.foldersById !== 'object' || state.foldersById === null) state.foldersById = {};
  if (typeof state.playlistsById !== 'object' || state.playlistsById === null) state.playlistsById = {};
  if (typeof state.cardDifficultyMap !== 'object' || state.cardDifficultyMap === null) state.cardDifficultyMap = {};
  if (typeof state.playlistCardOrderMap !== 'object' || state.playlistCardOrderMap === null) state.playlistCardOrderMap = {};
  if (typeof state.notificationFrequency === 'undefined') state.notificationFrequency = 'daily';
  if (!Array.isArray(state.notificationCustomDays)) state.notificationCustomDays = [1, 2, 3, 4, 5, 6, 7];
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
  syncProgressPercentage: number;
  syncProgressStatus: string;
  setSyncProgress: (percentage: number, status: string) => void;
  hasSyncedThisSession: boolean;
  setHasSyncedThisSession: (val: boolean) => void;
  isFirstTimeSyncInProgress: boolean;
  setIsFirstTimeSyncInProgress: (val: boolean) => void;

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
  deletedEntitiesQueue: Array<{ entityId: string; entityType: 'folder' | 'playlist' | 'card'; deletedAt: string; revision: number }>;

  // Phase 0 Migration & Observability
  storeSchemaVersion: number;
  enableRevisionSync: boolean;
  enableStrictContiguity: boolean;
  lastSyncedRevision: number;
  setLastSyncedRevision: (rev: number) => void;
  setRevisionSyncFlags: (flags: { enableRevisionSync: boolean; enableStrictContiguity: boolean }) => void;

  pinnedFolderIds: Set<string>;
  toggleFolderPin: (folderId: string) => Promise<void>;

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
  selectedRootFolderIds: string[];
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  notificationFrequency: 'daily' | 'three_days' | 'custom';
  notificationCustomDays: number[];
  updateNotificationPreferences: (
    enabled: boolean,
    hour: number,
    minute: number,
    frequency?: 'daily' | 'three_days' | 'custom',
    customDays?: number[]
  ) => Promise<void>;

  // Observability & Recovery Metrics
  lastSuccessfulSyncAt: number | null;
  lastCatalogIntegrityCheck: number | null;
  syncFailureCount: number;
  incrementSyncFailure: () => void;
  resetSyncFailure: () => void;
  setLastSuccessfulSyncAt: (timestamp: number) => void;
  setLastCatalogIntegrityCheck: (timestamp: number) => void;

  // Actions
  hydratePlaylistCards: (playlistId: string, cards: IPopulatedRevisionCard[], targetIndex?: number) => Promise<void>;
  hydrateCardContentOnDemand: (cardId: string) => Promise<void>;
  hydrateFolderCardsOnDemand: (folderId: string) => Promise<void>;
  hydratePlaylistCardsOnDemand: (playlistId: string) => Promise<void>;
  checkAndLoadMorePlaylistCards: (playlistId: string, activeIndex: number) => void;
  hydrateSmartCounts: (counts: Record<string, number>) => void;
  setPlaylistCardOrder: (playlistId: string, cardIds: string[]) => Promise<void>;
  hydrateCustomPlaylistOrder: (playlistId: string, cardIds: string[]) => void;
  hydrateAllCustomPlaylistsOrder: (playlists: { id: string; orderedCardIds: string[] }[]) => void;
  setSelectedRootFolderIdsInStore: (folderIds: string[]) => Promise<void>;
  updateReelPreferencesInStore: (folderIds: string[]) => Promise<void>;
  
  // Curation Actions
  toggleCustomPlaylistItemInStore: (playlistId: string, cardId: string, value: boolean) => Promise<void>;
  toggleFavoriteInStore: (cardId: string, value: boolean) => Promise<void>;
  
  // Atomic transactional transfer of a card
  transferCard: (
    cardId: string, 
    cardObj: IPopulatedRevisionCard,
    newState: DifficultyState,
    isOptimistic?: boolean
  ) => Promise<void>;

  // Race-condition-safe atomic rollback on mutation failure
  revertTransfer: (
    cardId: string,
    oldState: DifficultyState,
    failedState: DifficultyState,
    timestamp: number
  ) => Promise<void>;

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
  hydrateFolders: (folders: IFolder[]) => Promise<void>;
  hydratePlaylists: (playlists: ApiPlaylist[]) => Promise<void>;
  createPlaylistInStore: (playlist: ApiPlaylist) => Promise<void>;
  deletePlaylistInStore: (playlistId: string) => Promise<void>;
  updatePlaylistInStore: (playlistId: string, name: string) => Promise<void>;
  createFolderInStore: (folder: IFolder) => Promise<void>;
  deleteFolderInStore: (folderId: string) => Promise<void>;
  updateFolderInStore: (folderId: string, updateData: Partial<IFolder>) => Promise<void>;
  deleteCardInStore: (cardId: string) => Promise<void>;
  
  // Entire Cache Hard Reset for corruption self-healing recovery
  hardResetStore: () => void;
  pruneStaleCache: () => void;

  seniorQuotes: any[];
  setSeniorQuotes: (quotes: any[]) => void;
  currentQuoteIndex: number;
  incrementQuoteIndex: (quotesCount: number) => void;
  latestVersion: string;
  updateUrl: string;
  shareMessage: string;
  dbVersion: string | null;
  deviceId: string;
  logicalClockSequence: number;
  applyQueueRewrite: (newQueue: OfflineAction[]) => void;
}

const DEFAULT_STATE = {
  hasHydrated: false,
  bootstrapStatus: 'not_started' as BootstrapStatus,
  syncStatus: 'synced' as 'synced' | 'syncing' | 'offline',
  syncProgressPercentage: 0,
  syncProgressStatus: 'Idle',
  isLiveSyncPaused: false,
  hasSyncedThisSession: false,
  isFirstTimeSyncInProgress: false,
  syncGenerationId: 0,
  currentRevisionCounter: 0,
  deadLetterQueue: [],
  syncTriggerCount: 0,
  userId: null,
  deletedEntitiesQueue: [],
  storeSchemaVersion: 3,
  enableRevisionSync: false,
  enableStrictContiguity: false,
  lastSyncedRevision: 0,
  deviceId: '',
  logicalClockSequence: 0,
  pinnedFolderIds: new Set<string>(),
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
  selectedRootFolderIds: [],
  notificationsEnabled: true,
  notificationHour: 19,
  notificationMinute: 0,
  notificationFrequency: 'daily' as 'daily' | 'three_days' | 'custom',
  notificationCustomDays: [1, 2, 3, 4, 5, 6, 7],
  offlineActionQueue: [],
  poisonActionIds: [],
  lastSyncedAt: null,
  lastSuccessfulSyncAt: null,
  lastCatalogIntegrityCheck: null,
  syncFailureCount: 0,
  pruneStaleCache: () => {},
  seniorQuotes: [],
  currentQuoteIndex: 0,
  latestVersion: '1.0.5',
  updateUrl: 'https://ree-wise-download-website.vercel.app/',
  shareMessage: "Here's the link of the cool app you were asking about 😉 \n\nhttps://ree-wise-download-website.vercel.app/",
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

/**
 * Derived Hydration Model Helper:
 * Queries SQLite directly and overwrites Zustand's cache, ensuring SQLite remains
 * the absolute, single source of truth across all operations.
 */
export const syncWithSqliteSnapshot = async (userId: string) => {
  try {
    const { loadStateFromSQLite, bulkHydrateAllCardContent } = require('../utils/sqliteSyncBridge');
    const sqliteData = await loadStateFromSQLite(userId);
    if (sqliteData) {
      const { foldersById, playlistsById, cardsById, offlineActionQueue } = sqliteData;
      const currentState = usePlaylistStateStore.getState();

      // Bulk-hydrate all card content during sync reconciliation
      const contentMap = await bulkHydrateAllCardContent();
      if (Object.keys(contentMap).length > 0) {
        Object.keys(cardsById).forEach((cardId) => {
          const content = contentMap[cardId];
          if (content) {
            cardsById[cardId] = {
              ...cardsById[cardId],
              ...content,
              isContentFullyHydrated: true,
            };
          }
        });
      }



      const nextPlaylistCardOrderMap = { ...currentState.playlistCardOrderMap };
      const nextHydratedPlaylists = { ...currentState.hydratedPlaylists };
      Object.keys(playlistsById).forEach((id) => {
        nextHydratedPlaylists[id] = true;
        const p = playlistsById[id];
        if (p && !['easy', 'medium', 'hard', 'skipped'].includes(id)) {
          const cardIds = p.cardIds || p.orderedCardIds || [];
          nextPlaylistCardOrderMap[id] = cardIds.map((cid: string) => cid.split('-loop-')[0]).filter(Boolean);
        }
      });

      const nextDifficultyMap = { ...currentState.cardDifficultyMap };
      Object.keys(cardsById).forEach((cardId) => {
        const card = cardsById[cardId] as any;
        if (card && card.difficultyState) {
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

      // Restore tracking metrics from SQLite before background sync
      try {
        const { loadUserMetricsFromSQLite } = require('../utils/sqliteSyncBridge');
        const { useTrackingStore } = require('./useTrackingStore');
        const metrics = await loadUserMetricsFromSQLite(userId);
        if (metrics) {
          useTrackingStore.getState().setMetrics({
            totalSwipes: metrics.totalSwipes || 0,
            totalScrolls: metrics.totalScrolls || 0,
            unsyncedSwipes: metrics.unsyncedSwipes || 0,
            unsyncedScrolls: metrics.unsyncedScrolls || 0,
          });
          console.log(`[Zustand Snapshot] SQLite user metrics loaded: Swipes=${metrics.totalSwipes}, Scrolls=${metrics.totalScrolls}`);
        }
      } catch (metricsErr: any) {
        console.warn('[Zustand Snapshot] Failed to restore tracking metrics:', metricsErr.message);
      }

       // Restore notification settings from SQLite snapshot
       if ((sqliteData as any).notificationSettings) {
         const ns = (sqliteData as any).notificationSettings;
         usePlaylistStateStore.setState({
           notificationsEnabled: ns.enabled,
           notificationHour: ns.hour,
           notificationMinute: ns.minute,
           notificationFrequency: ns.frequency,
           notificationCustomDays: ns.customDays,
         });

         // Reschedule local push notifications on boot based on SQLite database settings
         try {
           const { scheduleReminders, scheduleStreakWarning, cancelStreakWarning } = require('../services/notificationService');
           if (ns.enabled) {
             scheduleReminders(true, ns.hour, ns.minute, ns.frequency, ns.customDays).catch(() => {});
             const currentStreak = require('./useAuthStore').useAuthStore.getState().user?.streakCount || 0;
             scheduleStreakWarning(currentStreak, 21, 0).catch(() => {});
           } else {
             scheduleReminders(false, ns.hour, ns.minute, ns.frequency, ns.customDays).catch(() => {});
             cancelStreakWarning().catch(() => {});
           }
         } catch (nsErr: any) {
           console.warn('[Zustand Snapshot] Failed to reschedule notifications from loaded settings:', nsErr.message);
         }
       }

       // Restore app config from SQLite snapshot
       if ((sqliteData as any).appConfig) {
         const ac = (sqliteData as any).appConfig;
         usePlaylistStateStore.setState({
           latestVersion: ac.latestVersion || '1.0.5',
           updateUrl: 'https://ree-wise-download-website.vercel.app/',
           shareMessage: "Here's the link of the cool app you were asking about 😉 \n\nhttps://ree-wise-download-website.vercel.app/",
         });
       }

       usePlaylistStateStore.setState({
        foldersById,
        playlistsById,
        cardsById,
        playlistCardOrderMap: nextPlaylistCardOrderMap,
        cardDifficultyMap: nextDifficultyMap,
        hydratedPlaylists: nextHydratedPlaylists,
        offlineActionQueue: offlineActionQueue.length > 0 ? offlineActionQueue : currentState.offlineActionQueue,
        seniorQuotes: sqliteData.seniorQuotes || [],
        currentQuoteIndex: sqliteData.currentQuoteIndex || 0,
        pinnedFolderIds: new Set((sqliteData as any).pinnedFolderIds || []),
      });
    }
  } catch (err: any) {
    console.warn('[Zustand Snapshot] Derived hydration from SQLite snapshot failed:', err.message);
  }
};

// Batched card content hydration to prevent cascading re-renders
let pendingHydrations: Record<string, any> = {};
let hydrationFlushTimer: ReturnType<typeof setTimeout> | null = null;

const flushPendingHydrations = () => {
  const batch = pendingHydrations;
  pendingHydrations = {};
  hydrationFlushTimer = null;
  if (Object.keys(batch).length === 0) return;
  
  usePlaylistStateStore.setState((state) => {
    const nextCardsById = { ...state.cardsById };
    let modified = false;
    Object.entries(batch).forEach(([cardId, content]) => {
      const existing = nextCardsById[cardId];
      if (existing) {
        nextCardsById[cardId] = { ...existing, ...content, isContentFullyHydrated: true };
        modified = true;
      }
    });
    if (!modified) return {};
    return { cardsById: nextCardsById };
  });
};

export const usePlaylistStateStore = create<PlaylistState>()(
  persist(
    (originalSet, get) => {
      const set = (
        nextState: PlaylistState | Partial<PlaylistState> | ((state: PlaylistState) => PlaylistState | Partial<PlaylistState>),
        replace?: boolean
      ) => {
        const prevVal = get().isFirstTimeSyncInProgress;
        let newVal = prevVal;
        if (typeof nextState === 'function') {
          const nextPartial = (nextState as Function)(get());
          if (nextPartial && nextPartial.isFirstTimeSyncInProgress !== undefined) {
            newVal = nextPartial.isFirstTimeSyncInProgress;
          }
        } else if (nextState && (nextState as any).isFirstTimeSyncInProgress !== undefined) {
          newVal = (nextState as any).isFirstTimeSyncInProgress;
        }

        if (prevVal !== newVal) {
          const timestamp = Date.now();
          const stack = new Error().stack || '';
          const lines = stack.split('\n');
          const caller = lines[2] || '';
          console.log(`[INSTRUMENT WRITE] isFirstTimeSyncInProgress | Time: ${timestamp} | Prev: ${prevVal} | New: ${newVal} | Caller: ${caller.trim()}`);
        }
        return originalSet(nextState, replace as any);
      };

      return {
        ...DEFAULT_STATE,

      setHasHydrated: (val) => set({ hasHydrated: val }),
      setBootstrapStatus: (status) => set({ bootstrapStatus: status }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setSyncProgress: (percentage, status) => set({ syncProgressPercentage: percentage, syncProgressStatus: status }),
      setLiveSyncPaused: (val) => set({ isLiveSyncPaused: val }),
      triggerSync: () => set((state) => ({ syncTriggerCount: state.syncTriggerCount + 1 })),
      setHasSyncedThisSession: (val) => set({ hasSyncedThisSession: val }),
      setIsFirstTimeSyncInProgress: (val) => set({ isFirstTimeSyncInProgress: val }),
      setSeniorQuotes: (quotes) => {
        set({ seniorQuotes: quotes });
        const userId = get().userId || 'guest-user';
        const { saveSeniorQuotesToSQLite } = require('../utils/sqliteSyncBridge');
        saveSeniorQuotesToSQLite(quotes, userId).catch((err: any) => {
          console.error('[Zustand Store] Failed to save senior quotes to SQLite:', err.message);
        });
      },
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
      applyQueueRewrite: async (newQueue) => {
        set({ offlineActionQueue: [...newQueue] });
        try {
          const activeUserId = get().userId || 'guest-user';
          await clearOfflineActionsInSQLite(activeUserId);
          const epoch = await getOrCreateClockEpoch();
          for (const a of newQueue) {
            await enqueueActionInSQLite(a, activeUserId, epoch);
          }
        } catch (err: any) {
          console.error('[SQLite Bridge Error] applyQueueRewrite failed:', err.message);
        }
        if (__DEV__) {
          console.log(`[Zustand Store] Atomically rewrote offline queue asynchronously. New size: ${newQueue.length}`);
        }
      },

      hardResetStore: () => {
        console.log('hardResetStore INVOCATION');
        console.warn('[Zustand Store] Hard Reset Triggered due to Storage/Hydration Corruption recovery!');
        set({ ...DEFAULT_STATE, hasHydrated: true });
      },

      hydrateSmartCounts: (counts) => {
        set((state) => {
          if (__DEV__) {
            const systemNames: Record<string, string> = {
              easy: 'Easy',
              medium: 'Medium',
              hard: 'Hard',
              skipped: 'Skipped',
            };
            const mappedCounts: Record<string, number> = {};
            Object.keys(counts).forEach((key) => {
              const displayName = systemNames[key] || state.playlistsById[key]?.name || key;
              mappedCounts[displayName] = counts[key];
            });
            console.log(`[Zustand Hydration] hydrateSmartCounts:`, mappedCounts);
          }
          
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

      setSelectedRootFolderIdsInStore: async (folderIds) => {
        set((state) => ({
          selectedRootFolderIds: folderIds,
          currentRevisionCounter: state.currentRevisionCounter + 1
        }));

        try {
          const { saveReelPreferencesToSQLite } = require('../utils/sqliteSyncBridge');
          const userId = get().userId || 'guest-user';
          await saveReelPreferencesToSQLite(userId, folderIds);
        } catch (err: any) {
          console.error('[Zustand Store] Failed to save reel preferences to SQLite:', err.message);
        }
      },

      updateReelPreferencesInStore: async (folderIds) => {
        // 1. Save optimistically to Zustand store and increment revision counter to trigger immediate in-place re-derive
        set((state) => ({
          selectedRootFolderIds: folderIds,
          currentRevisionCounter: state.currentRevisionCounter + 1
        }));

        // 2. Enqueue offline action for sync
        get().enqueueOfflineAction({
          action: 'UPDATE_REEL_PREFERENCES',
          payload: { selectedRootFolderIds: folderIds },
          timestamp: Date.now(),
        });

        // 3. Save directly to SQLite
        try {
          const { saveReelPreferencesToSQLite } = require('../utils/sqliteSyncBridge');
          const userId = get().userId || 'guest-user';
          await saveReelPreferencesToSQLite(userId, folderIds);
        } catch (err: any) {
          console.error('[Zustand Store] Failed to save reel preferences to SQLite:', err.message);
        }
      },

      updateNotificationPreferences: async (enabled, hour, minute, frequency, customDays) => {
        const currentFrequency = frequency !== undefined ? frequency : get().notificationFrequency;
        const currentCustomDays = customDays !== undefined ? customDays : get().notificationCustomDays;

        set({
          notificationsEnabled: enabled,
          notificationHour: hour,
          notificationMinute: minute,
          notificationFrequency: currentFrequency,
          notificationCustomDays: currentCustomDays,
        });

        // 1. Reschedule local push alerts in Expo
        try {
          const { scheduleReminders, scheduleStreakWarning, cancelStreakWarning } = require('../services/notificationService');
          if (enabled) {
            await scheduleReminders(enabled, hour, minute, currentFrequency, currentCustomDays);
            const currentStreak = require('./useAuthStore').useAuthStore.getState().user?.streakCount || 0;
            await scheduleStreakWarning(currentStreak, 21, 0); // 9:00 PM streak preservation warning
          } else {
            await scheduleReminders(false, hour, minute, currentFrequency, currentCustomDays);
            await cancelStreakWarning();
          }
        } catch (err: any) {
          console.error('[Zustand Store] Failed to update push notifications scheduling:', err.message);
        }

        // 2. Save notification settings to SQLite database
        const userId = get().userId || 'guest-user';
        if (userId === 'guest-user') return; // Guest mode skips SQLite persistence

        try {
          const { saveNotificationPreferencesToSQLite } = require('../utils/sqliteSyncBridge');
          await saveNotificationPreferencesToSQLite(userId, enabled, hour, minute, currentFrequency, currentCustomDays);
        } catch (sqliteErr: any) {
          console.error('[Zustand Store] Failed to save notification settings to SQLite:', sqliteErr.message);
        }
      },

      hydrateCardContentOnDemand: async (cardId) => {
        const cleanId = cardId.split('-loop-')[0];
        const card = get().cardsById[cleanId];
        if (!card || card.isContentFullyHydrated) return;

        if (__DEV__ && get().bootstrapStatus === 'completed') {
          console.log(`[Lazy Hydration] Loading content on demand for card: ${cleanId}`);
        }

        try {
          const { getCardFullContentFromSQLite } = require('../utils/sqliteSyncBridge');
          const content = await getCardFullContentFromSQLite(cleanId);
          if (content) {
            pendingHydrations[cleanId] = content;
            if (!hydrationFlushTimer) {
              hydrationFlushTimer = setTimeout(flushPendingHydrations, 100);
            }
          }
        } catch (err: any) {
          console.error('[Zustand Store] hydrateCardContentOnDemand failed:', err.message);
        }
      },

      hydrateFolderCardsOnDemand: async (folderId) => {
        const userId = get().userId || 'guest-user';
        if (userId === 'guest-user') return; // Guest cards are already fully in-memory and hydrated

        const { getDatabase, isSQLiteAvailable } = require('../utils/sqliteDatabase');
        if (!isSQLiteAvailable()) return;
        
        try {
          const db = getDatabase();
          const rows = await db.getAllAsync(
            `SELECT c.cardId, c.explanation, c.code, c.imageBlobPath, c.imageHash, c.examples, c.slides 
             FROM cards_content c 
             INNER JOIN cards_metadata m ON c.cardId = m.id 
             WHERE m.folderId = ? AND m.isDeleted = 0;`,
            [folderId]
          );
          
          if (rows && rows.length > 0) {
            set((state) => {
              const nextCardsById = { ...state.cardsById };
              let modified = false;
              
              rows.forEach((row: any) => {
                if (!row.cardId) return;
                const cleanId = row.cardId;
                const existing = nextCardsById[cleanId];
                if (existing && !existing.isContentFullyHydrated) {
                  nextCardsById[cleanId] = {
                    ...existing,
                    explanation: row.explanation || '',
                    code: row.code || '',
                    imageBlobPath: row.imageBlobPath || undefined,
                    imageHash: row.imageHash || undefined,
                    examples: row.examples ? JSON.parse(row.examples) : [],
                    slides: row.slides ? JSON.parse(row.slides) : undefined,
                    isContentFullyHydrated: true,
                  } as any;
                  modified = true;
                }
              });
              
              if (modified) {
                return {
                  cardsById: nextCardsById,
                  currentRevisionCounter: state.currentRevisionCounter + 1,
                };
              }
              return {};
            });
          }
        } catch (err: any) {
          console.error('[Zustand Store] hydrateFolderCardsOnDemand failed:', err.message);
        }
      },

      hydratePlaylistCardsOnDemand: async (playlistId) => {
        const userId = get().userId || 'guest-user';
        if (userId === 'guest-user') return; // Guest cards are already fully in-memory and hydrated

        const { getDatabase, isSQLiteAvailable } = require('../utils/sqliteDatabase');
        if (!isSQLiteAvailable()) return;

        try {
          const db = getDatabase();
          const playlist = get().playlistsById[playlistId];
          if (!playlist) return;

          const cardIds = playlist.cardIds || playlist.orderedCardIds || [];
          if (cardIds.length === 0) return;

          const cleanIds = cardIds.map(id => id.split('-loop-')[0]).filter(Boolean);
          const placeholders = cleanIds.map(() => '?').join(',');

          const rows = await db.getAllAsync(
            `SELECT c.cardId, c.explanation, c.code, c.imageBlobPath, c.imageHash, c.examples, c.slides 
             FROM cards_content c 
             WHERE c.cardId IN (${placeholders});`,
            cleanIds
          );

          if (rows && rows.length > 0) {
            set((state) => {
              const nextCardsById = { ...state.cardsById };
              let modified = false;

              rows.forEach((row: any) => {
                if (!row.cardId) return;
                const cleanId = row.cardId;
                const existing = nextCardsById[cleanId];
                if (existing && !existing.isContentFullyHydrated) {
                  nextCardsById[cleanId] = {
                    ...existing,
                    explanation: row.explanation || '',
                    code: row.code || '',
                    imageBlobPath: row.imageBlobPath || undefined,
                    imageHash: row.imageHash || undefined,
                    examples: row.examples ? JSON.parse(row.examples) : [],
                    slides: row.slides ? JSON.parse(row.slides) : undefined,
                    isContentFullyHydrated: true,
                  } as any;
                  modified = true;
                }
              });

              if (modified) {
                return {
                  cardsById: nextCardsById,
                  currentRevisionCounter: state.currentRevisionCounter + 1,
                };
              }
              return {};
            });
          }
        } catch (err: any) {
          console.error('[Zustand Store] hydratePlaylistCardsOnDemand failed:', err.message);
        }
      },

      hydratePlaylistCards: async (playlistId, cards, targetIndex = 0) => {
        const activeUserId = get().userId || 'guest-user';
        const { getDeletedEntityIdsFromSQLite } = require('../utils/sqliteSyncBridge');
        const deletedIds = await getDeletedEntityIdsFromSQLite(activeUserId, 'card');
        const safeCards = cards.filter((card) => {
          if (!card?._id) return false;
          return !deletedIds.has(card._id);
        });

        set((state) => {
          const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
          
          // Define sliding window centered around targetIndex ONLY for the 'all' playlist (reels player)
          const isAll = playlistId === 'all';
          const initialCards = isAll
            ? safeCards.slice(Math.max(0, targetIndex - 10), Math.min(safeCards.length, targetIndex + 20))
            : safeCards;

          const needsHydration = initialCards.some((c) => {
            const cleanId = c._id.split('-loop-')[0];
            return state.cardsById[cleanId] === undefined;
          });

          const existingFullList = state.fullPlaylistCards[playlistId] || [];
          const listChanged = existingFullList.length !== safeCards.length || !safeCards.every((c, i) => {
            const ec = existingFullList[i];
            return ec && ec._id === c._id && ec.updatedAt === c.updatedAt;
          });

          if (!listChanged && !needsHydration) {
            return {}; // Skip redundant state updates and re-renders completely!
          }
          
          // Store complete cards list in memory
          const nextFullPlaylistCards = {
            ...state.fullPlaylistCards,
            [playlistId]: safeCards
          };

          if (__DEV__) {
            const playlistName = state.playlistsById[playlistId]?.name || playlistId;
            console.log(`[Zustand Hydration] hydratePlaylistCards for Playlist: "${playlistName}" | Target index: ${targetIndex} | Hydrating range: ${isAll ? (targetIndex - 10) + ' to ' + (targetIndex + 20) : 'all'} of ${cards.length}`);
          }

          const nextCardsById = { ...state.cardsById };
          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
          const nextHydratedPlaylists = { ...state.hydratedPlaylists, [playlistId]: true };
          const nextHydratedPlaylistCardCounts = {
            ...state.hydratedPlaylistCardCounts,
            [playlistId]: initialCards.length
          };

          // Hydrate the cards in the window (or all cards for custom playlists)
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
          const fullCards = state.fullPlaylistCards[playlistId] || [];
          if (fullCards.length === 0) return {};

          // Load next 20 cards ahead of current position
          const windowStart = Math.max(0, activeIndex - 5);
          const windowEnd = Math.min(fullCards.length, activeIndex + 20);
          const windowCards = fullCards.slice(windowStart, windowEnd);

          // Merge into cardsById — pure memory operation, zero I/O
          const newCardsById: Record<string, IPopulatedRevisionCard> = {};
          windowCards.forEach(card => {
            if (!card || !card._id) return;
            const cleanId = card._id.split('-loop-')[0];
            const existingCard = state.cardsById[cleanId];
            const local = state.cardDifficultyMap[cleanId];
            newCardsById[cleanId] = mergeCardState(local, existingCard, card);
          });

          return {
            cardsById: { ...state.cardsById, ...newCardsById }
          };
        });
      },

      setPlaylistCardOrder: async (playlistId, cardIds) => {
        const state = get();
        const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
        const cleanIds = cleanCardIds(cardIds);
        nextPlaylistCardOrderMap[playlistId] = cleanIds;

        const nextFullPlaylistCards = { ...state.fullPlaylistCards };
        const existingFullList = nextFullPlaylistCards[playlistId];
        if (existingFullList) {
          const cardMap = new Map(existingFullList.map(c => [c._id.split('-loop-')[0], c]));
          const sortedFullList = cleanIds
            .map(id => cardMap.get(id))
            .filter(Boolean);
          nextFullPlaylistCards[playlistId] = sortedFullList as any;
        }

        const nextPlaylists = { ...state.playlistsById };
        let nextRev = state.currentRevisionCounter;
        
        if (nextPlaylists[playlistId]) {
          nextRev = state.currentRevisionCounter + 1;
          nextPlaylists[playlistId] = {
            ...nextPlaylists[playlistId],
            cardIds: cleanIds,
            orderedCardIds: cleanIds,
            dirty: true,
            localRevision: nextRev,
          };
        }

        set({
          playlistCardOrderMap: nextPlaylistCardOrderMap,
          playlistsById: nextPlaylists,
          fullPlaylistCards: nextFullPlaylistCards,
          currentRevisionCounter: nextRev,
        });

        // Persist the reordered card IDs to SQLite database
        const userId = state.userId || 'guest-user';
        const cleanPlaylistId = playlistId.split('-loop-')[0];
        const cardIdsJson = JSON.stringify(cleanIds);
        sqliteWriteManager.enqueue({
          id: `reorder-playlist-${cleanPlaylistId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(
                'UPDATE playlists SET cardIds = ?, updatedAt = ? WHERE id = ? AND userId = ?;',
                [cardIdsJson, new Date().toISOString(), cleanPlaylistId, userId]
              );
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(err => console.error('[SQLite setPlaylistCardOrder Async Error]', err.message));
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

      hydrateAllCustomPlaylistsOrder: (playlists) => {
        set((state) => {
          const nextPlaylistCardOrderMap = { ...state.playlistCardOrderMap };
          const nextHydratedPlaylists = { ...state.hydratedPlaylists };
          let modified = false;

          playlists.forEach(({ id, orderedCardIds }) => {
            if (['easy', 'medium', 'hard', 'skipped'].includes(id)) return;

            const isHydrated = state.hydratedPlaylists[id];
            const isDirty = state.playlistsById[id]?.dirty;
            const hasPending = state.offlineActionQueue.some(
              (a) =>
                (a.action === 'TOGGLE_PLAYLIST_ITEM' && a.payload?.playlistId === id) ||
                (a.action === 'REORDER_PLAYLIST' && a.payload?.playlistId === id)
            );

            if (isHydrated || isDirty || hasPending) return;

            const cleanIds = cleanCardIds(orderedCardIds);
            nextPlaylistCardOrderMap[id] = cleanIds;
            nextHydratedPlaylists[id] = true;
            modified = true;
          });

          if (!modified) return {};

          return {
            playlistCardOrderMap: nextPlaylistCardOrderMap,
            hydratedPlaylists: nextHydratedPlaylists,
          };
        });
      },



      toggleCustomPlaylistItemInStore: async (playlistId, cardId, value) => {
        const state = get();
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

        set({
          playlistCardOrderMap: nextPlaylistCardOrderMap,
          playlistsById: nextPlaylists,
          fullPlaylistCards: nextFullPlaylistCards,
          hydratedPlaylistCardCounts: nextHydratedPlaylistCardCounts,
          currentRevisionCounter: nextRev,
        });

        const userId = state.userId || 'guest-user';
        const cleanPlaylistId = playlistId.split('-loop-')[0];
        const newListJson = JSON.stringify(newList);
        sqliteWriteManager.enqueue({
          id: `toggle-playlist-item-${cleanPlaylistId}-${cardId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(
                'UPDATE playlists SET cardIds = ?, itemCount = ?, updatedAt = ? WHERE id = ? AND userId = ?;',
                [newListJson, newList.length, new Date().toISOString(), cleanPlaylistId, userId]
              );
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(err => console.error('[SQLite toggleCustomPlaylistItemInStore Async Error]', err.message));

        import('@/services/sessionQueueService')
          .then(mod => mod.invalidateSession(playlistId))
          .catch(err => console.error('[Dynamic Import Failure] Invalidate custom playlist session failed:', err));

        try {
          const { useTrackingStore } = require('./useTrackingStore');
          const trackingState = useTrackingStore.getState();
          if (trackingState.reelsSourceType === 'playlist' && trackingState.reelsSourceId === playlistId) {
            trackingState.setReelsSession({
              sessionId: null,
              sessionCards: [],
              activeIndex: 0,
              sourceType: null,
              sourceId: null,
            });
          }
        } catch (e) {
          console.error('[Session Invalidation Error]', e);
        }

      },

      transferCard: async (cardId, cardObj, newState, isOptimistic = true) => {
        const cleanId = cardId.split('-loop-')[0];
        const state = get();
        const oldStateObj = state.cardDifficultyMap[cleanId];
        const oldState = oldStateObj !== undefined 
          ? oldStateObj.difficulty 
          : (cardObj.difficultyState || null);

        if (oldState === newState) return;

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

        const updatedCard = {
          ...(state.cardsById[cleanId] || cardObj),
          _id: cleanId,
          difficultyState: newState,
          currentUserQuestionProgress: qp,
          dirty: isOptimistic,
          localRevision: isOptimistic ? nextRev : undefined,
        };
        nextCardsById[cleanId] = updatedCard;

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

        set({
          cardDifficultyMap: nextDifficultyMap,
          cardsById: nextCardsById,
          playlistCardOrderMap: nextPlaylistCardOrderMap,
          playlistsById: nextPlaylists,
          smartPlaylistDeltaCounts: nextDeltas,
          currentRevisionCounter: isOptimistic ? nextRev : state.currentRevisionCounter,
        });

        // Write the classification state change directly to SQLite to ensure local durability
        if (state.userId && state.userId !== 'guest-user') {
          try {
            const { saveCardProgressToSQLite } = require('../utils/sqliteSyncBridge');
            saveCardProgressToSQLite(cleanId, newState, state.userId).catch((err: any) => {
              console.error('[SQLite Write Error] saveCardProgressToSQLite failed inside transferCard:', err.message);
            });
          } catch (e: any) {
            console.error('[SQLite Write Error] Failed importing saveCardProgressToSQLite inside transferCard:', e.message);
          }
        }

        // Cancel today's streak risk warning since the user just successfully reviewed a card
        try {
          const { cancelStreakWarning } = require('../services/notificationService');
          cancelStreakWarning().catch(() => {});
        } catch {}

        // Invalidate corresponding reels sessions to prevent ghost cards in active playlist playback sessions
        if (oldState) {
          import('@/services/sessionQueueService')
            .then(mod => mod.invalidateSession(oldState))
            .catch(() => {});
        }
        if (newState) {
          import('@/services/sessionQueueService')
            .then(mod => mod.invalidateSession(newState))
            .catch(() => {});
        }

        try {
          const { useTrackingStore } = require('./useTrackingStore');
          const trackingState = useTrackingStore.getState();
          const matchesOld = oldState && trackingState.reelsSourceType === 'playlist' && trackingState.reelsSourceId === oldState;
          const matchesNew = newState && trackingState.reelsSourceType === 'playlist' && trackingState.reelsSourceId === newState;
          
          if (matchesOld || matchesNew) {
            trackingState.setReelsSession({
              sessionId: null,
              sessionCards: [],
              activeIndex: 0,
              sourceType: null,
              sourceId: null,
            });
          }
        } catch (e) {
          console.error('[Session Invalidation Error]', e);
        }
      },

      toggleFavoriteInStore: async (cardId: string, value: boolean) => {
        const state = get();
        const cleanId = cardId.split('-loop-')[0];
        const existing = state.cardsById[cleanId];
        if (!existing) return;

        // 1. Patch Zustand in-memory
        set({
          cardsById: {
            ...state.cardsById,
            [cleanId]: { ...existing, isFavorite: value },
          },
        });

        // 2. Write to SQLite via serialized write manager (same pattern as toggleCustomPlaylistItemInStore)
        const userId = state.userId || 'guest-user';
        const isFavNum = value ? 1 : 0;
        const now = new Date().toISOString();

        sqliteWriteManager.enqueue({
          id: `toggle-favorite-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(`
                INSERT INTO card_progress (
                  cardId, userId, completed, revisionCount, favorite, difficultyState, seenInReels, revision, updatedAt
                ) VALUES (?, ?, 0, 0, ?, NULL, 0, 0, ?)
                ON CONFLICT(cardId, userId) DO UPDATE SET
                  favorite=excluded.favorite,
                  updatedAt=excluded.updatedAt;
              `, [cleanId, userId, isFavNum, now]);
            }
          },
          timestamp: Date.now(),
          priority: 'normal',
        }).catch((err: any) => console.error('[SQLite toggleFavoriteInStore Error]', err.message));
      },

      revertTransfer: async (cardId, oldState, failedState, timestamp) => {
        const state = get();
        const cleanId = cardId.split('-loop-')[0];
        const current = state.cardDifficultyMap[cleanId];

        if (current && current.updatedAt > timestamp) {
          return;
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
        let updatedCard = null;
        if (nextCardsById[cleanId]) {
          const qp = oldState
            ? {
                attemptStatus: oldState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                perceivedDifficultyByUser: oldState === 'skipped' ? null : (oldState as any),
              }
            : null;

          updatedCard = {
            ...nextCardsById[cleanId],
            _id: cleanId,
            difficultyState: oldState,
            currentUserQuestionProgress: qp,
          };
          nextCardsById[cleanId] = updatedCard;
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

        set({
          cardDifficultyMap: nextDifficultyMap,
          cardsById: nextCardsById,
          playlistCardOrderMap: nextPlaylistCardOrderMap,
          playlistsById: nextPlaylists,
          smartPlaylistDeltaCounts: nextDeltas,
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

      enqueueOfflineAction: async (action) => {
        const state = get();
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
        } else if (action.action === 'UPDATE_STREAK') {
          compactedQueue = compactedQueue.filter(
            (a) => a.action !== 'UPDATE_STREAK'
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
        } else if (action.action === 'UPDATE_REEL_PREFERENCES') {
          compactedQueue = compactedQueue.filter((a) => a.action !== 'UPDATE_REEL_PREFERENCES');
        } else if (action.action === 'UPDATE_RESUME_STATE') {
          const { type, id } = action.payload;
          compactedQueue = compactedQueue.filter(
            (a) => !(a.action === 'UPDATE_RESUME_STATE' && a.payload.type === type && a.payload.id === id)
          );
        }

        compactedQueue.push(newAction);

        set({
          offlineActionQueue: compactedQueue,
          currentRevisionCounter: nextRev,
          logicalClockSequence: nextSeq,
        });

        if (__DEV__) {
          console.log(`[Offline Queue] Enqueued in memory with Monotonic Rev ${nextRev} & Logical Seq ${nextSeq}:`, newAction, `| Queue Size: ${compactedQueue.length}`);
        }
      },

      clearOfflineActions: () => {
        set({ offlineActionQueue: [], poisonActionIds: [] });
      },

      removeProcessedActions: (processedIds) => {
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

      hydrateFolders: async (folders) => {
        if (__DEV__) {
          console.log(`[Zustand Hydration] hydrateFolders Triggered | Folders Count: ${folders.length}`);
        }
        const activeUserId = get().userId || 'guest-user';
        const { getDeletedEntityIdsFromSQLite } = require('../utils/sqliteSyncBridge');
        const deletedIds = await getDeletedEntityIdsFromSQLite(activeUserId, 'folder');
        const safeFolders = folders.filter((f) => f?._id && !deletedIds.has(f._id));

        set((state) => {
          const nextFolders = { ...state.foldersById };
          safeFolders.forEach((f) => {
            if (f && f._id) nextFolders[f._id] = f;
          });
          return { foldersById: nextFolders };
        });
      },

      hydratePlaylists: async (playlists) => {
        if (__DEV__) {
          console.log(`[Zustand Hydration] hydratePlaylists Triggered | Playlists Count: ${playlists.length}`);
        }
        const activeUserId = get().userId || 'guest-user';
        const { getDeletedEntityIdsFromSQLite } = require('../utils/sqliteSyncBridge');
        const deletedIds = await getDeletedEntityIdsFromSQLite(activeUserId, 'playlist');
        const safePlaylists = playlists.filter((p) => p?._id && !deletedIds.has(p._id));

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

      createPlaylistInStore: async (playlist) => {
        const state = get();
        const nextRev = state.currentRevisionCounter + 1;
        const newPlaylist = {
          ...playlist,
          dirty: true,
          localRevision: nextRev,
        };

        const nextPlaylists = {
          ...state.playlistsById,
          [playlist._id]: newPlaylist,
        };

        const nextState = {
          ...state,
          playlistsById: nextPlaylists,
          currentRevisionCounter: nextRev,
        };
        logPersonalAction('playlist.created.local', {
          playlistId: playlist._id,
          name: playlist.name,
        }, nextState);

        const nextHydratedPlaylists = {
          ...state.hydratedPlaylists,
          [playlist._id]: true,
        };

        set({
          playlistsById: nextPlaylists,
          currentRevisionCounter: nextRev,
          hydratedPlaylists: nextHydratedPlaylists,
        });

        const userId = state.userId || 'guest-user';
        const cleanId = playlist._id.split('-loop-')[0];
        const cardIdsJson = JSON.stringify(playlist.cardIds || playlist.orderedCardIds || []);
        const now = new Date().toISOString();
        sqliteWriteManager.enqueue({
          id: `create-playlist-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(`
                INSERT INTO playlists (
                  id, userId, name, title, description, color1, color2, itemCount, cardIds, revision, clockEpoch, updatedAt, isDeleted, deletedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null)
                ON CONFLICT(id) DO UPDATE SET
                  name=excluded.name, title=excluded.title, color1=excluded.color1, color2=excluded.color2,
                  itemCount=excluded.itemCount, cardIds=excluded.cardIds, updatedAt=excluded.updatedAt, isDeleted=0;
              `, [
                cleanId,
                userId,
                playlist.name || '',
                playlist.name || '',
                playlist.description || '',
                playlist.color1 || '',
                playlist.color2 || '',
                playlist.itemCount || 0,
                cardIdsJson,
                (playlist as any).revision || 0,
                (playlist as any).clockEpoch || 'default-epoch',
                now
              ]);
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(err => console.error('[SQLite createPlaylistInStore Async Error]', err.message));

      },

      deletePlaylistInStore: async (playlistId) => {
        const state = get();
        const playlist = state.playlistsById[playlistId];
        if (!playlist) return;

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

        set({
          playlistsById: nextPlaylists,
          playlistCardOrderMap: nextOrderMap,
          hydratedPlaylists: nextHydrated,
          fullPlaylistCards: nextFullPlaylistCards,
          hydratedPlaylistCardCounts: nextHydratedCounts,
        });

        const userId = state.userId || 'guest-user';
        const cleanId = playlistId.split('-loop-')[0];
        set((s) => ({
          deletedEntitiesQueue: [
            ...s.deletedEntitiesQueue,
            { entityId: cleanId, entityType: 'playlist', deletedAt: new Date().toISOString(), revision: (playlist as any).revision || 0 }
          ]
        }));

        sqliteWriteManager.enqueue({
          id: `delete-playlist-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync('UPDATE playlists SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?;', [new Date().toISOString(), new Date().toISOString(), cleanId, userId]);
              await db.runAsync(`
                INSERT OR REPLACE INTO deleted_entities (userId, entityId, entityType, deletedAt, revision)
                VALUES (?, ?, 'playlist', ?, 0);
              `, [userId, cleanId, new Date().toISOString()]);
            }
          },
          timestamp: Date.now(),
          priority: 'critical'
        }).catch(err => console.error('[SQLite deletePlaylistInStore Async Error]', err.message));
      },

      updatePlaylistInStore: async (playlistId, name) => {
        const state = get();
        const playlist = state.playlistsById[playlistId];
        if (!playlist) return;
        const nextRev = state.currentRevisionCounter + 1;
        const updatedPlaylist = { ...playlist, name, dirty: true, localRevision: nextRev };

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

        set({
          playlistsById: nextPlaylists,
          currentRevisionCounter: nextRev,
        });

        const userId = state.userId || 'guest-user';
        const cleanId = playlistId.split('-loop-')[0];
        const now = new Date().toISOString();
        sqliteWriteManager.enqueue({
          id: `update-playlist-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(
                'UPDATE playlists SET name = ?, title = ?, updatedAt = ? WHERE id = ? AND userId = ?;',
                [name, name, now, cleanId, userId]
              );
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(err => console.error('[SQLite updatePlaylistInStore Async Error]', err.message));

      },

      createFolderInStore: async (folder) => {
        const nextRev = get().currentRevisionCounter + 1;
        const newFolder = {
          ...folder,
          dirty: true,
          localRevision: nextRev,
        };

        set((state) => {
          return {
            foldersById: {
              ...state.foldersById,
              [folder._id]: newFolder,
            },
            currentRevisionCounter: nextRev,
          };
        });

        const userId = get().userId || 'guest-user';
        const cleanId = folder._id.split('-loop-')[0];
        const cardIdsJson = JSON.stringify(folder.cardIds || []);
        const now = new Date().toISOString();
        sqliteWriteManager.enqueue({
          id: `create-folder-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(`
                INSERT INTO folders (
                  id, userId, title, description, icon, color, createdBy, visibility, "order", parentFolderId, cardIds,
                  revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 0, null)
                ON CONFLICT(id) DO UPDATE SET
                  title=excluded.title, description=excluded.description, icon=excluded.icon, color=excluded.color,
                  parentFolderId=excluded.parentFolderId, cardIds=excluded.cardIds, updatedAt=excluded.updatedAt, isDeleted=0;
              `, [
                cleanId,
                userId,
                folder.title || '',
                folder.description || '',
                folder.icon || 'folder',
                (folder as any).color || '#7c3aed',
                typeof folder.createdBy === 'object' ? JSON.stringify(folder.createdBy) : String(folder.createdBy || ''),
                (folder as any).visibility || 'public',
                (folder as any).order || 0,
                folder.parentFolderId || null,
                cardIdsJson,
                (folder as any).revision || 0,
                (folder as any).clockEpoch || 'default-epoch',
                now
              ]);
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(err => console.error('[SQLite createFolderInStore Async Error]', err.message));

      },

      deleteFolderInStore: async (folderId) => {
        const activeUserId = get().userId || 'guest-user';
        
        // Find all recursive descendants of the folder in the store
        const foldersMap = get().foldersById;
        const childrenMap: Record<string, string[]> = {};
        Object.values(foldersMap).forEach((f: any) => {
          if (f && f.parentFolderId) {
            const pId = f.parentFolderId;
            if (!childrenMap[pId]) childrenMap[pId] = [];
            childrenMap[pId].push(f._id);
          }
        });

        const descendants: string[] = [];
        const queue = [folderId];
        while (queue.length > 0) {
          const curr = queue.shift()!;
          descendants.push(curr);
          const children = childrenMap[curr] || [];
          children.forEach((childId) => {
            if (!descendants.includes(childId) && !queue.includes(childId)) {
              queue.push(childId);
            }
          });
        }

        const descendantsSet = new Set(descendants);

        set((state) => {
          const nextFolders = { ...state.foldersById };
          descendants.forEach((dId) => {
            delete nextFolders[dId];
          });
          
          const nextCards = { ...state.cardsById };
          const nextDifficultyMap = { ...state.cardDifficultyMap };
          const nextOrderMap = { ...state.playlistCardOrderMap };
          const nextPlaylists = { ...state.playlistsById };
          const deletedCardIds: string[] = [];

          Object.keys(nextCards).forEach((key) => {
            const card = nextCards[key];
            if (card) {
              const getFolderIdStr = (fid: any): string => {
                if (typeof fid === 'object' && fid !== null) return String(fid._id || fid.id || '');
                return String(fid || '');
              };
              const cardFolderId = getFolderIdStr(card.folderId);
              const cardRootFolderId = getFolderIdStr(card.rootFolderId);
              const hasSubfolderMatch = card.subfolderIds?.some((id: any) => descendantsSet.has(getFolderIdStr(id))) ?? false;

              if (descendantsSet.has(cardFolderId) || descendantsSet.has(cardRootFolderId) || hasSubfolderMatch) {
                delete nextCards[key];
                deletedCardIds.push(key);
              }
            }
          });

          const nextFullPlaylistCards = { ...state.fullPlaylistCards };
          const nextHydratedPlaylistCardCounts = { ...state.hydratedPlaylistCardCounts };

          const deletedCleanIdsSet = new Set(deletedCardIds.map((id) => id.split('-loop-')[0]));

          deletedCardIds.forEach((cardId) => {
            const cleanId = cardId.split('-loop-')[0];
            delete nextDifficultyMap[cleanId];
          });

          // Clean up card references from all playlists in nextOrderMap in a single pass (O(N) total filtering)
          Object.keys(nextOrderMap).forEach((pId) => {
            const rawIds = nextOrderMap[pId] || [];
            const hasAnyDeleted = rawIds.some((id) => deletedCleanIdsSet.has(id));
            if (hasAnyDeleted) {
              const validIds = rawIds.filter((id) => !deletedCleanIdsSet.has(id));
              nextOrderMap[pId] = validIds;
              
              if (nextPlaylists[pId]) {
                nextPlaylists[pId] = {
                  ...nextPlaylists[pId],
                  itemCount: validIds.length,
                };
              }
            }
          });

          // Clean up card references from fullPlaylistCards and hydratedPlaylistCardCounts in a single pass (O(N) total filtering)
          Object.keys(nextFullPlaylistCards).forEach((pId) => {
            const cards = nextFullPlaylistCards[pId] || [];
            const filtered = cards.filter((c) => c && !deletedCleanIdsSet.has(c._id.split('-loop-')[0]));
            if (filtered.length !== cards.length) {
              nextFullPlaylistCards[pId] = filtered;
              nextHydratedPlaylistCardCounts[pId] = filtered.length;
            }
          });

          return {
            foldersById: nextFolders,
            cardsById: nextCards,
            cardDifficultyMap: nextDifficultyMap,
            playlistCardOrderMap: nextOrderMap,
            playlistsById: nextPlaylists,
            fullPlaylistCards: nextFullPlaylistCards,
            hydratedPlaylistCardCounts: nextHydratedPlaylistCardCounts,
          };
        });

        const nowStr = new Date().toISOString();
        const deletedTombstones = descendants.map((dId) => {
          const cleanId = dId.split('-loop-')[0];
          return { entityId: cleanId, entityType: 'folder' as const, deletedAt: nowStr, revision: 0 };
        });

        set((s) => ({
          deletedEntitiesQueue: [
            ...s.deletedEntitiesQueue,
            ...deletedTombstones
          ]
        }));

        const cleanId = folderId.split('-loop-')[0];
        sqliteWriteManager.enqueue({
          id: `delete-folders-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId: activeUserId,
          data: {
            executor: async (db: any) => {
              const cleanDescendants = descendants.map(dId => dId.split('-loop-')[0]);
              const placeholders = cleanDescendants.map(() => '?').join(',');
              
              // 1. Mark all descendants folders as deleted in SQLite
              await db.runAsync(`UPDATE folders SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE id IN (${placeholders}) AND userId = ?;`, [nowStr, nowStr, ...cleanDescendants, activeUserId]);
              
              // 2. Mark all revision cards in these folders as deleted in SQLite
              await db.runAsync(`UPDATE cards_metadata SET isDeleted = 1, updatedAt = ? WHERE (folderId IN (${placeholders}) OR rootFolderId IN (${placeholders}));`, [nowStr, ...cleanDescendants, ...cleanDescendants]);

              // 3. Write deleted_entities tombstones for all descendants
              for (const cId of cleanDescendants) {
                await db.runAsync(`
                  INSERT OR REPLACE INTO deleted_entities (userId, entityId, entityType, deletedAt, revision)
                  VALUES (?, ?, 'folder', ?, 0);
                `, [activeUserId, cId, nowStr]);
              }
            }
          },
          timestamp: Date.now(),
          priority: 'critical'
        }).catch(err => console.error('[SQLite deleteFolderInStore Async Error]', err.message));
      },

      deleteCardInStore: async (cardId) => {
        const activeUserId = get().userId || 'guest-user';
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

          // 4. Clean up card references from fullPlaylistCards and hydratedPlaylistCardCounts
          const nextFullPlaylistCards = { ...state.fullPlaylistCards };
          const nextHydratedPlaylistCardCounts = { ...state.hydratedPlaylistCardCounts };

          Object.keys(nextFullPlaylistCards).forEach((pId) => {
            const cards = nextFullPlaylistCards[pId] || [];
            const filtered = cards.filter((c) => c && c._id.split('-loop-')[0] !== cleanId);
            if (filtered.length !== cards.length) {
              nextFullPlaylistCards[pId] = filtered;
              nextHydratedPlaylistCardCounts[pId] = filtered.length;
            }
          });

          return {
            cardsById: nextCards,
            cardDifficultyMap: nextDifficultyMap,
            playlistCardOrderMap: nextOrderMap,
            playlistsById: nextPlaylists,
            fullPlaylistCards: nextFullPlaylistCards,
            hydratedPlaylistCardCounts: nextHydratedPlaylistCardCounts,
          };
        });

        const cleanId = cardId.split('-loop-')[0];
        set((s) => ({
          deletedEntitiesQueue: [
            ...s.deletedEntitiesQueue,
            { entityId: cleanId, entityType: 'card', deletedAt: new Date().toISOString(), revision: 0 }
          ]
        }));

        sqliteWriteManager.enqueue({
          id: `delete-card-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId: activeUserId,
          data: {
            executor: async (db: any) => {
              await db.runAsync('UPDATE cards_metadata SET isDeleted = 1, updatedAt = ? WHERE id = ?;', [new Date().toISOString(), cleanId]);
              await db.runAsync('DELETE FROM card_progress WHERE cardId = ? AND userId = ?;', [cleanId, activeUserId]);
              await db.runAsync(`
                INSERT OR REPLACE INTO deleted_entities (userId, entityId, entityType, deletedAt, revision)
                VALUES (?, ?, 'card', ?, 0);
              `, [activeUserId, cleanId, new Date().toISOString()]);
            }
          },
          timestamp: Date.now(),
          priority: 'critical'
        }).catch(err => console.error('[SQLite deleteCardInStore Async Error]', err.message));
      },

      toggleFolderPin: async (folderId: string) => {
        const { getDatabase, isSQLiteAvailable } = require('../utils/sqliteDatabase');
        const nextPinned = new Set(get().pinnedFolderIds);
        let isPinning = false;
        if (nextPinned.has(folderId)) {
          nextPinned.delete(folderId);
        } else {
          nextPinned.add(folderId);
          isPinning = true;
        }
        set({ pinnedFolderIds: nextPinned });
        if (isSQLiteAvailable()) {
          const db = getDatabase();
          const userId = get().userId || 'guest-user';
          try {
            if (isPinning) {
              await db.runAsync('INSERT OR REPLACE INTO pinned_folders (folderId, userId) VALUES (?, ?);', [folderId, userId]);
            } else {
              await db.runAsync('DELETE FROM pinned_folders WHERE folderId = ? AND userId = ?;', [folderId, userId]);
            }
          } catch (err: any) {
            console.warn('[SQLite] Failed to persist pinned folder state:', err.message);
          }
        }
      },

      updateFolderInStore: async (folderId, updateData) => {
        const state = get();
        const folder = state.foldersById[folderId];
        if (!folder) return;
        const nextRev = state.currentRevisionCounter + 1;
        const updatedFolder = { ...folder, ...updateData, dirty: true, localRevision: nextRev } as IFolder;

        set({
          foldersById: {
            ...state.foldersById,
            [folderId]: updatedFolder,
          },
          currentRevisionCounter: nextRev,
        });

        const userId = state.userId || 'guest-user';
        const cleanId = folderId.split('-loop-')[0];
        const now = new Date().toISOString();
        sqliteWriteManager.enqueue({
          id: `update-folder-${cleanId}-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              const keys = Object.keys(updateData);
              if (keys.length === 0) return;
              
              const setClauses = keys.map(k => {
                if (k === 'order') return `"order" = ?`;
                return `${k} = ?`;
              }).join(', ');
              
              const values = keys.map(k => {
                const val = (updateData as any)[k];
                if (typeof val === 'object' && val !== null) return JSON.stringify(val);
                return val;
              });
              
              await db.runAsync(
                `UPDATE folders SET ${setClauses}, updatedAt = ? WHERE id = ? AND userId = ?;`,
                [...values, now, cleanId, userId]
              );
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(err => console.error('[SQLite updateFolderInStore Async Error]', err.message));

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
    };
  },
  {
      name: 'dsa-playlist-state',
      storage: createJSONStorage(() => storageEngine),
      version: 3,
      partialize: (state) => {
        if (state.userId === 'guest-user') {
          return {
            userId: 'guest-user',
            hasHydrated: true,
            bootstrapStatus: 'completed',
          } as any;
        }
        return {
          userId: state.userId,
          offlineActionQueue: state.offlineActionQueue,
          deletedEntitiesQueue: state.deletedEntitiesQueue,
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
          selectedRootFolderIds: state.selectedRootFolderIds,
          notificationsEnabled: state.notificationsEnabled,
          notificationHour: state.notificationHour,
          notificationMinute: state.notificationMinute,
          notificationFrequency: state.notificationFrequency,
          notificationCustomDays: state.notificationCustomDays,
        };
      },
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
        if (__DEV__) console.log('[Zustand Rehydration] Phased Startup Pipeline started...');

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
                console.log(`[Zustand Rehydration Completed] Local Zustand hydrated in ${duration.toFixed(2)}ms.`);
              }

              // Phase 1: Mount UI shell instantly (Zustand storage rehydrated)
              rehydratedState.setHasHydrated(true);

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

const originalSetState = usePlaylistStateStore.setState;
usePlaylistStateStore.setState = (nextState: any, replace?: any) => {
  const prevVal = usePlaylistStateStore.getState().isFirstTimeSyncInProgress;
  let newVal = prevVal;
  if (typeof nextState === 'function') {
    const nextPartial = nextState(usePlaylistStateStore.getState());
    if (nextPartial && nextPartial.isFirstTimeSyncInProgress !== undefined) {
      newVal = nextPartial.isFirstTimeSyncInProgress;
    }
  } else if (nextState && (nextState as any).isFirstTimeSyncInProgress !== undefined) {
    newVal = (nextState as any).isFirstTimeSyncInProgress;
  }

  if (prevVal !== newVal) {
    const timestamp = Date.now();
    const stack = new Error().stack || '';
    const lines = stack.split('\n');
    const caller = lines[2] || '';
    console.log(`[INSTRUMENT WRITE] isFirstTimeSyncInProgress | Time: ${timestamp} | Prev: ${prevVal} | New: ${newVal} | Caller: ${caller.trim()}`);
  }
  return originalSetState(nextState, replace);
};

/**
 * bootstrapHydrateFromSQLite — Hydrates the Zustand store partitions from SQLite.
 *
 * This is the SINGLE AUTHORITATIVE entry point for loading SQLite state on startup
 * or account switch. It runs after Phase 1 (database is initialized and tables created)
 * and Phase 2 (auth session is restored), ensuring no query races.
 */
export function initializeGuestDemoContent() {
  console.log('initializeGuestDemoContent START (Hardcoded Minimal Guest Data)');

  const foldersById: Record<string, any> = {
    '6a1655fab129b168bb16bb1f': {
      _id: '6a1655fab129b168bb16bb1f',
      userId: 'guest-user',
      title: 'DSA',
      description: 'Master Data Structures and Algorithms conceptually.',
      icon: 'code',
      color: '#7C3AED',
      createdBy: 'admin',
      visibility: 'public',
      order: 0,
      parentFolderId: null,
      cardIds: ['guest-card-1'],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-folder-os': {
      _id: 'guest-folder-os',
      userId: 'guest-user',
      title: 'OS',
      description: 'Operating System internals, processes, threads, and memory management.',
      icon: 'brain',
      color: '#EC4899',
      createdBy: 'admin',
      visibility: 'public',
      order: 1,
      parentFolderId: null,
      cardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-folder-cn': {
      _id: 'guest-folder-cn',
      userId: 'guest-user',
      title: 'CN',
      description: 'Computer Networks, TCP/IP stack, routing protocols, and sockets.',
      icon: 'graphs',
      color: '#3B82F6',
      createdBy: 'admin',
      visibility: 'public',
      order: 2,
      parentFolderId: null,
      cardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-folder-sys': {
      _id: 'guest-folder-sys',
      userId: 'guest-user',
      title: 'System Design',
      description: 'High-level system architecture, load balancers, caching, and databases.',
      icon: 'layers',
      color: '#10B981',
      createdBy: 'admin',
      visibility: 'public',
      order: 3,
      parentFolderId: null,
      cardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-folder-case': {
      _id: 'guest-folder-case',
      userId: 'guest-user',
      title: 'Case Study',
      description: 'Interactive business, product, and tech case studies.',
      icon: 'book',
      color: '#F59E0B',
      createdBy: 'admin',
      visibility: 'public',
      order: 4,
      parentFolderId: null,
      cardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-folder-guess': {
      _id: 'guest-folder-guess',
      userId: 'guest-user',
      title: 'Guesstimate',
      description: 'Structured estimations and quantitative problem solving.',
      icon: 'dp',
      color: '#6366F1',
      createdBy: 'admin',
      visibility: 'public',
      order: 5,
      parentFolderId: null,
      cardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-folder-dbms': {
      _id: 'guest-folder-dbms',
      userId: 'guest-user',
      title: 'DBMS',
      description: 'Relational databases, SQL querying, transactions, and indexing.',
      icon: 'database',
      color: '#14B8A6',
      createdBy: 'admin',
      visibility: 'public',
      order: 6,
      parentFolderId: null,
      cardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  };

  const playlistsById: Record<string, any> = {
    'hard': {
      _id: 'hard',
      userId: 'guest-user',
      name: 'Hard Focus',
      title: 'Hard Focus',
      description: 'Showcase: Hard focus-area playlist',
      color1: '#EF4444',
      color2: '#B91C1C',
      itemCount: 3,
      cardIds: ['guest-card-3', 'guest-card-4', 'guest-card-5'],
      orderedCardIds: ['guest-card-3', 'guest-card-4', 'guest-card-5'],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    'guest-custom-playlist': {
      _id: 'guest-custom-playlist',
      userId: 'guest-user',
      name: 'System Design Stack',
      title: 'System Design Stack',
      description: 'Custom learning playlist',
      color1: '#10B981',
      color2: '#047857',
      itemCount: 0,
      cardIds: [],
      orderedCardIds: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  };

  const cardsById: Record<string, any> = {
    'guest-card-1': {
      _id: 'guest-card-1',
      title: 'Reverse Linked List',
      topic: 'LINKED LISTS',
      explanation: 'Iterate through the list shifting adjacent node links backwards using a temporary pointer.',
      code: 'ListNode* prev = nullptr;\nwhile (curr) {\n  ListNode* next = curr->next;\n  curr->next = prev;\n  prev = curr;\n  curr = next;\n}',
      difficulty: 'Easy',
      complexity: 'O(N) Time • O(1) Space',
      examples: [],
      tags: ['Linked List'],
      createdBy: 'admin',
      folderId: '6a1655fab129b168bb16bb1f',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      isFavorite: false,
      difficultyState: null,
      currentUserQuestionProgress: null,
      isContentFullyHydrated: true,
      slides: [
        { headline: 'Reverse Linked List', body: 'Intuition: Iterate through the list shifting adjacent node links backwards using a temporary pointer.' },
        { headline: 'Code Implementation', code: 'ListNode* prev = nullptr;\nwhile (curr) {\n  ListNode* next = curr->next;\n  curr->next = prev;\n  prev = curr;\n  curr = next;\n}' }
      ]
    },
    'guest-card-3': {
      _id: 'guest-card-3',
      title: 'Merge K Sorted Lists',
      topic: 'HEAPS',
      difficulty: 'Hard',
      explanation: 'Combine elements of K sorted linked lists by using a min-heap.',
      examples: [],
      tags: [],
      createdBy: 'admin',
      folderId: '6a1655fab129b168bb16bb1f',
      visibility: 'public',
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      isFavorite: false,
      difficultyState: null,
      currentUserQuestionProgress: null,
      isContentFullyHydrated: true,
    },
    'guest-card-4': {
      _id: 'guest-card-4',
      title: 'Course Schedule II',
      topic: 'GRAPHS',
      difficulty: 'Hard',
      explanation: 'Topological sort using Kahn\'s algorithm (BFS) or DFS to find task order.',
      examples: [],
      tags: [],
      createdBy: 'admin',
      folderId: '6a1655fab129b168bb16bb1f',
      visibility: 'public',
      order: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      isFavorite: false,
      difficultyState: null,
      currentUserQuestionProgress: null,
      isContentFullyHydrated: true,
    },
    'guest-card-5': {
      _id: 'guest-card-5',
      title: '0/1 Knapsack Core',
      topic: 'DYNAMIC PROGRAMMING',
      difficulty: 'Hard',
      explanation: 'Find maximum subset value for limited weight using bottom-up tabulation.',
      examples: [],
      tags: [],
      createdBy: 'admin',
      folderId: '6a1655fab129b168bb16bb1f',
      visibility: 'public',
      order: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      isFavorite: false,
      difficultyState: null,
      currentUserQuestionProgress: null,
      isContentFullyHydrated: true,
    }
  };

  const playlistCardOrderMap: Record<string, string[]> = {
    easy: [],
    medium: [],
    hard: ['guest-card-3', 'guest-card-4', 'guest-card-5'],
    skipped: [],
    likes: [],
    'watch-later': [],
    all: ['guest-card-1'],
  };

  playlistsById['all'] = {
    _id: 'all',
    userId: 'guest-user',
    name: 'All Cards',
    title: 'All Cards',
    description: 'All seeded revision cards',
    cardIds: ['guest-card-1'],
    itemCount: 1,
  };

  const selectedRootFolderIds = ['6a1655fab129b168bb16bb1f', 'guest-folder-os', 'guest-folder-cn', 'guest-folder-sys', 'guest-folder-case', 'guest-folder-guess', 'guest-folder-dbms'];

  usePlaylistStateStore.setState({
    foldersById,
    playlistsById,
    cardsById,
    playlistCardOrderMap,
    selectedRootFolderIds,
    bootstrapStatus: 'completed',
    hasHydrated: true,
  });

  console.log('[Guest Demo Content] Hydrated Zustand memory:', {
    folders: Object.keys(foldersById).length,
    playlists: Object.keys(playlistsById).length,
    cards: Object.keys(cardsById).length,
  });
}

export async function bootstrapHydrateFromSQLite(
  activeUserId: string = 'guest-user',
  serverSwipes: number = 0,
  serverScrolls: number = 0,
  serverStreak: number = 0,
  serverMaxStreak: number = 0,
  serverLastCompletedDate?: string
): Promise<void> {
  console.log('bootstrapHydrateFromSQLite INVOCATION', { activeUserId, serverSwipes, serverScrolls, serverStreak, serverMaxStreak, serverLastCompletedDate });
  if (typeof (global as any).dumpInstrumentState === 'function') {
    (global as any).dumpInstrumentState('4. bootstrapHydrateFromSQLite starts');
  }

  if (activeUserId === 'guest-user') {
    initializeGuestDemoContent();
    
    const { isSQLiteAvailable } = require('../utils/sqliteDatabase');
    const { markAppReady } = require('../utils/appBootstrapGate');
    if (isSQLiteAvailable()) {
      try {
        const { getDatabase } = require('../utils/sqliteDatabase');
        const db = getDatabase();
        db.runAsync('DELETE FROM reel_sessions WHERE userId = ?;', ['guest-user'])
          .catch((err: any) => console.warn('[Guest DB Cleanup] Failed to clear guest sessions:', err.message));
      } catch (e: any) {
        console.warn('[Guest DB Cleanup] Database not initialized yet:', e.message);
      }
    }
    
    markAppReady();
    return;
  }

  const storeState = usePlaylistStateStore.getState();

  // Concurrency guard: avoid duplicate concurrent bootstrap pipelines
  if (
    storeState.bootstrapStatus === 'metadata_loading' ||
    storeState.bootstrapStatus === 'cards_loading' ||
    storeState.bootstrapStatus === 'completed'
  ) {
    console.log(`[Zustand SQLite Hydration] Hydration already in status: ${storeState.bootstrapStatus}. Skipping duplicate invocation.`);
    return;
  }

  console.log(`[Zustand SQLite Hydration] Starting serialization phase for user: ${activeUserId}`);
  usePlaylistStateStore.setState({ bootstrapStatus: 'metadata_loading' });

  const authStore = require('./useAuthStore').useAuthStore;
  const capturedGenId = authStore.getState().sessionGenerationId;

  try {
    const { isSQLiteAvailable } = require('../utils/sqliteDatabase');
    const { whenDatabaseReady, markAppReady } = require('../utils/appBootstrapGate');
    const { interactionScheduler } = require('../utils/interactionScheduler');

    if (isSQLiteAvailable()) {
      // Stage 1: Wait for appBootstrapGate database initialization (Phase 1)
      console.log('[Zustand SQLite Hydration] Waiting for database readiness...');
      await whenDatabaseReady();
      console.log('[Zustand SQLite Hydration] Database ready. Proceeding with loading snapshot.');

      // Stage 2: Load relational partitions from SQLite snapshot
      const { loadStateFromSQLite } = require('../utils/sqliteSyncBridge');
      const sqliteData = await loadStateFromSQLite(activeUserId);

      // Cancel check: if user switched session mid-load, discard loaded state
      if (capturedGenId !== authStore.getState().sessionGenerationId) {
        console.log('[Zustand SQLite Hydration] Aborting hydration commit: session switched mid-load.');
        return;
      }

      if (sqliteData) {
        const { foldersById, playlistsById, offlineActionQueue } = sqliteData;
        const cardsById = sqliteData.cardsMetaPromise ? await sqliteData.cardsMetaPromise : {};
        const currentState = usePlaylistStateStore.getState();

        // Construct playlistCardOrderMap from loaded playlistsById
        const nextPlaylistCardOrderMap = { ...currentState.playlistCardOrderMap };
        const nextHydratedPlaylists = { ...currentState.hydratedPlaylists };
        Object.keys(playlistsById).forEach((id) => {
          nextHydratedPlaylists[id] = true;
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

        // Rotate Senior Quote index exactly once per app launch (Stage 3 rehydration bootstrap)
        let nextQuoteIndex = sqliteData.currentQuoteIndex || 0;
        const quotesCount = sqliteData.seniorQuotes ? sqliteData.seniorQuotes.length : 0;
        if (quotesCount > 0) {
          nextQuoteIndex = (nextQuoteIndex + 1) % quotesCount;
        }

        // Persist nextQuoteIndex durably inside SQLite
        try {
          const { getDatabase } = require('../utils/sqliteDatabase');
          const db = getDatabase();
          await db.runAsync(
            'UPDATE reel_sessions SET currentQuoteIndex = ?, updatedAt = ? WHERE userId = ?;',
            [nextQuoteIndex, new Date().toISOString(), activeUserId]
          );
          console.log(`[Zustand Bootstrap] Rotated quote index to: ${nextQuoteIndex}/${quotesCount} for user ${activeUserId}`);
        } catch (dbErr: any) {
          console.warn('[Zustand Bootstrap] Failed to persist advanced currentQuoteIndex to SQLite:', dbErr.message);
        }

        // Restore/Merge tracking metrics from SQLite before background sync
        try {
          const { loadUserMetricsFromSQLite, saveUserMetricsToSQLite } = require('../utils/sqliteSyncBridge');
          const metrics = await loadUserMetricsFromSQLite(activeUserId);
          
          let sqliteStreak = 0;
          let sqliteMaxStreak = 0;
          let sqliteLastCompletedDate: string | null = null;
          
          if (metrics) {
            sqliteStreak = metrics.streakCount || 0;
            sqliteMaxStreak = metrics.maxStreakCount || 0;
            sqliteLastCompletedDate = metrics.lastCompletedDate || null;
          }
          
          // Merge client-side SQLite stats and server-side MongoDB stats using Max-wins
          let currentStreak = Math.max(sqliteStreak, serverStreak);
          let currentMaxStreak = Math.max(sqliteMaxStreak, serverMaxStreak);
          let lastCompletedDateStr = sqliteLastCompletedDate || serverLastCompletedDate || null;
          
          // Perform Visit streak logic
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];
          
          let streakChanged = false;
          if (lastCompletedDateStr) {
            const lastDate = new Date(lastCompletedDateStr);
            const lastDateStr = lastDate.toISOString().split('T')[0];
            
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            if (lastDateStr === yesterdayStr) {
              currentStreak += 1;
              streakChanged = true;
            } else if (lastDateStr !== todayStr) {
              currentStreak = 1;
              streakChanged = true;
            }
          } else {
            currentStreak = 1;
            streakChanged = true;
          }
          
          if (currentStreak > currentMaxStreak) {
            currentMaxStreak = currentStreak;
            streakChanged = true;
          }
          
          lastCompletedDateStr = today.toISOString();
          
          // Update the authStore User object so the UI is hydrated with the correct streak values immediately
          const authStoreObj = require('./useAuthStore').useAuthStore;
          const currentUserObj = authStoreObj.getState().user;
          if (currentUserObj && currentUserObj.id === activeUserId) {
            authStoreObj.setState({
              user: {
                ...currentUserObj,
                streakCount: currentStreak,
                maxStreakCount: currentMaxStreak,
                lastCompletedDate: lastCompletedDateStr,
              }
            });
          }
          
          const mergedSwipes = Math.max(metrics?.totalSwipes || 0, serverSwipes);
          const mergedScrolls = Math.max(metrics?.totalScrolls || 0, serverScrolls);
          const nextMetrics = {
            totalSwipes: mergedSwipes,
            totalScrolls: mergedScrolls,
            unsyncedSwipes: metrics?.unsyncedSwipes || 0,
            unsyncedScrolls: metrics?.unsyncedScrolls || 0,
            streakCount: currentStreak,
            maxStreakCount: currentMaxStreak,
            lastCompletedDate: lastCompletedDateStr,
          };
          
          await saveUserMetricsToSQLite(activeUserId, nextMetrics);
          useTrackingStore.getState().setMetrics(nextMetrics);
          
          // If the streak was updated (new day visit), enqueue the offline action to sync it
          if (streakChanged) {
            const playlistState = usePlaylistStateStore.getState();
            playlistState.enqueueOfflineAction({
              action: 'UPDATE_STREAK',
              payload: {
                streakCount: currentStreak,
                maxStreakCount: currentMaxStreak,
                lastCompletedDate: lastCompletedDateStr,
              },
              timestamp: Date.now()
            });
            console.log(`[Zustand Bootstrap] Streak incremented/updated locally to: Current=${currentStreak}, Max=${currentMaxStreak}`);
          }
          
          console.log(`[Zustand Bootstrap] SQLite user metrics loaded & merged: Swipes=${mergedSwipes}, Scrolls=${mergedScrolls}`);
        } catch (metricsErr: any) {
          console.warn('[Zustand Bootstrap] Failed to restore tracking metrics:', metricsErr.message);
        }

        if (capturedGenId !== authStore.getState().sessionGenerationId) {
          console.log('[Zustand SQLite Hydration] Aborting hydration commit: session switched mid-load.');
          return;
        }

        usePlaylistStateStore.setState({
          foldersById: { ...currentState.foldersById, ...foldersById },
          playlistsById: { ...currentState.playlistsById, ...playlistsById },
          cardsById: allCards,
          playlistCardOrderMap: nextPlaylistCardOrderMap,
          cardDifficultyMap: nextDifficultyMap,
          hydratedPlaylists: nextHydratedPlaylists,
          offlineActionQueue: offlineActionQueue.length > 0 ? offlineActionQueue : currentState.offlineActionQueue,
          lastSyncedRevision: sqliteData.lastSyncedRevision || 0,
          lastSyncedAt: sqliteData.lastSyncedAt || null,
          selectedRootFolderIds: sqliteData.selectedRootFolderIds && sqliteData.selectedRootFolderIds.length > 0
            ? sqliteData.selectedRootFolderIds
            : (currentState.selectedRootFolderIds || []),
          seniorQuotes: sqliteData.seniorQuotes || [],
          currentQuoteIndex: nextQuoteIndex,
          pinnedFolderIds: new Set(sqliteData.pinnedFolderIds || []),
          ...(sqliteData.notificationSettings ? {
            notificationsEnabled: sqliteData.notificationSettings.enabled,
            notificationHour: sqliteData.notificationSettings.hour,
            notificationMinute: sqliteData.notificationSettings.minute,
            notificationFrequency: sqliteData.notificationSettings.frequency,
            notificationCustomDays: sqliteData.notificationSettings.customDays,
          } : {})
        });
        console.log(`[Zustand SQLite Hydration] Canonical relational tables loaded successfully.`);

        if (sqliteData.reelSession) {
          try {
            const { setSessionMemoryShadow } = require('../utils/reelsFeedOfflineManager');
            setSessionMemoryShadow(sqliteData.reelSession);
          } catch (e: any) {
            console.warn('[Zustand Bootstrap] Failed to set reels session memory shadow:', e.message);
          }
        }

        const nextState = usePlaylistStateStore.getState();
        try {
          const { scheduleReminders, scheduleStreakWarning, cancelStreakWarning } = require('../services/notificationService');
          if (nextState.notificationsEnabled) {
            scheduleReminders(
              true,
              nextState.notificationHour,
              nextState.notificationMinute,
              nextState.notificationFrequency || 'daily',
              nextState.notificationCustomDays || [1, 2, 3, 4, 5, 6, 7]
            ).catch(() => {});
            const currentStreak = require('./useAuthStore').useAuthStore.getState().user?.streakCount || 0;
            scheduleStreakWarning(currentStreak, 21, 0).catch(() => {});
          } else {
            scheduleReminders(
              false,
              nextState.notificationHour,
              nextState.notificationMinute,
              nextState.notificationFrequency || 'daily',
              nextState.notificationCustomDays || [1, 2, 3, 4, 5, 6, 7]
            ).catch(() => {});
            cancelStreakWarning().catch(() => {});
          }
        } catch (notiErr) {
          console.warn('[Zustand Bootstrap] Failed to bootstrap scheduled reminders:', notiErr);
        }
      }

    }

    if (capturedGenId !== authStore.getState().sessionGenerationId) return;

    // Transition to cards loading phase (Phase 3)
    usePlaylistStateStore.setState({ bootstrapStatus: 'cards_loading' });

    // Phase 3: Background card hydration
    console.log('[Zustand SQLite Hydration] Asynchronously bulk-loading all card content into memory...');
    const { bulkHydrateAllCardContent } = require('../utils/sqliteSyncBridge');
    const contentMap = await bulkHydrateAllCardContent();
    const contentCardCount = Object.keys(contentMap).length;

    if (capturedGenId !== authStore.getState().sessionGenerationId) return;

    if (contentCardCount > 0) {
      const latestStoreState = usePlaylistStateStore.getState();
      const cardsByIdCopy = { ...latestStoreState.cardsById };

      Object.keys(cardsByIdCopy).forEach((cardId) => {
        const content = contentMap[cardId];
        if (content) {
          cardsByIdCopy[cardId] = {
            ...cardsByIdCopy[cardId],
            ...content,
            isContentFullyHydrated: true,
          };
        }
      });

      usePlaylistStateStore.setState({ cardsById: cardsByIdCopy });
      console.log(`[Zustand SQLite Hydration] Fully hydrated ${contentCardCount} cards into memory in background.`);
    }

    if (capturedGenId !== authStore.getState().sessionGenerationId) return;
    
    // Transition to completed phase
    usePlaylistStateStore.setState({ bootstrapStatus: 'completed' });
    markAppReady();

    if (typeof (global as any).dumpInstrumentState === 'function') {
      (global as any).dumpInstrumentState('5. bootstrapHydrateFromSQLite completes');
    }

    // Phase 4: Silent sync after interaction settles
    console.log('[Zustand SQLite Hydration] Queueing background sync handshake after startup settles...');
    const finalState = usePlaylistStateStore.getState();
    interactionScheduler.runWhenIdle(() => {
      finalState.triggerSync();
    });

  } catch (sqlErr: any) {
    console.error('[Zustand SQLite Hydration Error] Setup failed:', sqlErr.message);
    usePlaylistStateStore.setState({ bootstrapStatus: 'failed' });
  }
}
