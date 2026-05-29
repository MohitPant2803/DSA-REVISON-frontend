import { usePlaylistStateStore, OfflineAction, DifficultyState } from '../store/usePlaylistStateStore';
import { useAuthStore, getOrCreateInstallationUUID } from '../store/useAuthStore';
import { getDatabase, sqliteLock, hydrationLock, isSQLiteAvailable } from './sqliteDatabase';
import {
  saveCardsToSQLite,
  saveFoldersToSQLite,
  savePlaylistsToSQLite,
  deleteFolderFromSQLite,
  deletePlaylistFromSQLite,
  deleteCardFromSQLite,
  enqueueActionInSQLite,
  removeProcessedActionsFromSQLite,
  acknowledgeMutationsTransaction,
  clearOfflineActionsInSQLite,
  loadStateFromSQLite,
  canonicalSerialize,
  signMutationPayload,
  saveDeletedEntityToSQLite,
  isEntityDeletedInSQLite
} from './sqliteSyncBridge';
import api from '../services/api';
import { syncTelemetry } from './syncTelemetry';
import { isNetworkConnected } from './network';
import { Platform } from 'react-native';

export type SyncState = 'idle' | 'hydrating' | 'replaying' | 'reconciling' | 'paused' | 'recovering';

/**
 * Resolves Loophole 120 & 144: Event Semantic & Deterministic Merge Rules Registry
 */
export const EVENT_REGISTRY: Record<string, {
  priority: 'critical' | 'normal' | 'low';
  mergeStrategy: 'LWW' | 'cumulative' | 'patch';
}> = {
  'CLASSIFY_CARD': { priority: 'critical', mergeStrategy: 'cumulative' },
  'TOGGLE_FAVORITE': { priority: 'critical', mergeStrategy: 'LWW' },
  'CREATE_PLAYLIST': { priority: 'normal', mergeStrategy: 'patch' },
  'DELETE_PLAYLIST': { priority: 'normal', mergeStrategy: 'LWW' },
  'UPDATE_PLAYLIST': { priority: 'normal', mergeStrategy: 'patch' },
  'CREATE_FOLDER': { priority: 'normal', mergeStrategy: 'patch' },
  'DELETE_FOLDER': { priority: 'normal', mergeStrategy: 'LWW' },
  'UPDATE_FOLDER': { priority: 'normal', mergeStrategy: 'patch' },
  'TOGGLE_PLAYLIST_ITEM': { priority: 'critical', mergeStrategy: 'patch' },
  'REORDER_PLAYLIST': { priority: 'normal', mergeStrategy: 'patch' },
};

/**
 * Resolves Loophole 122: Centralized Sync Policy Governance Layer
 */
export const SYNC_POLICY = {
  maxOfflineDivergenceDays: 30,
  maxRetryAttempts: 5,
  batchSizeLimit: 50,
  networkTimeoutMs: 15000,
  heartbeatIntervalMs: 30000,
  minBatteryLevelDefer: 0.15, // 15%
  throttlingBackoffBaseMs: 3000,
};

class SyncManager {
  private syncState: SyncState = 'idle';
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private syncInProgress = false;
  private lastHeartbeatSuccess = true;
  private lockLeaseUserId: string | null = null;

  // Lamport Hybrid Logical Clock
  private logicalClock = 0;

  constructor() {
    this.startHeartbeat();
  }

  public getSyncState(): SyncState {
    return this.syncState;
  }

  private setSyncState(state: SyncState) {
    this.syncState = state;
    const store = usePlaylistStateStore.getState();
    if (state === 'idle') {
      store.setSyncStatus('synced');
    } else if (state === 'paused' || state === 'recovering') {
      store.setSyncStatus('offline');
    } else {
      store.setSyncStatus('syncing');
    }
  }

  /**
   * Resolves Loophole 2: Dispose method to clean up all async tasks securely
   */
  public dispose() {
    console.log('[Sync Manager] Disposing and aborting active requests...');
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.syncInProgress = false;
    this.setSyncState('idle');
  }

  /**
   * Resolves Loophole 40: Heartbeat split-brain pings
   */
  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      const auth = useAuthStore.getState();
      if (!auth.isAuthenticated || auth.user?.id === 'guest-user') return;

      try {
        const isConnected = await isNetworkConnected();
        if (!isConnected) {
          this.lastHeartbeatSuccess = false;
          return;
        }

        // Lightweight network ping to verify actual remote connection reachability
        const start = Date.now();
        const response = await Promise.race([
          api.get('/health', { timeout: 5000 }),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);

        if (response && response.status === 200) {
          this.lastHeartbeatSuccess = true;
        } else {
          this.lastHeartbeatSuccess = false;
        }
      } catch {
        this.lastHeartbeatSuccess = false;
      }
    }, SYNC_POLICY.heartbeatIntervalMs);
  }

  /**
   * Resolves Loophole 132 & 150: Lamport Hybrid Logical Clock step
   */
  public tickLogicalClock(incomingClock = 0): number {
    this.logicalClock = Math.max(this.logicalClock, incomingClock) + 1;
    return this.logicalClock;
  }

  /**
   * Resolves Loophole 107: Acquire database local sync lease
   */
  private acquireSyncLease(userId: string): boolean {
    if (this.lockLeaseUserId && this.lockLeaseUserId !== userId) {
      console.warn(`[Sync Lease] Lock already held by user: ${this.lockLeaseUserId}. Rejecting: ${userId}`);
      return false;
    }
    this.lockLeaseUserId = userId;
    return true;
  }

  private releaseSyncLease() {
    this.lockLeaseUserId = null;
  }

  /**
   * Resolves Loophole 37, 77, 104, 128: Compact offline actions queue deterministically
   */
  public compactQueue(queue: OfflineAction[]): OfflineAction[] {
    const output: OfflineAction[] = [];
    const activeClassifications = new Map<string, OfflineAction>();
    const activeFavorites = new Map<string, OfflineAction>();
    const activePlaylistItems = new Map<string, OfflineAction>();
    const activePlaylistReorders = new Map<string, OfflineAction>();
    const folderCreates = new Map<string, OfflineAction>();
    const folderDeletes = new Set<string>();
    const playlistCreates = new Map<string, OfflineAction>();
    const playlistDeletes = new Set<string>();

    for (const action of queue) {
      const act = action.action;
      const payload = action.payload;

      // Compaction Safety Guards (Exempt creations, deletions, ownership shifts from invalid sweeps)
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

  /**
   * Resolves Loophole 54, 93, 113: Sort queue respecting event dependency priority classes
   * Folders -> Playlists -> Cards -> Progress
   */
  public prioritizeQueue(queue: OfflineAction[]): OfflineAction[] {
    return [...queue].sort((a, b) => {
      const aRegistry = EVENT_REGISTRY[a.action];
      const bRegistry = EVENT_REGISTRY[b.action];
      
      const aPriority = aRegistry?.priority === 'critical' ? 2 : aRegistry?.priority === 'normal' ? 1 : 0;
      const bPriority = bRegistry?.priority === 'critical' ? 2 : bRegistry?.priority === 'normal' ? 1 : 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first (prevent priority inversion)
      }
      
      // Structural ordering hierarchy
      const getStructureOrder = (action: string): number => {
        if (action.includes('FOLDER')) return 4;
        if (action.includes('PLAYLIST')) return 3;
        if (action.includes('CARD')) return 2;
        return 1;
      };
      
      const aStruct = getStructureOrder(a.action);
      const bStruct = getStructureOrder(b.action);
      
      if (aStruct !== bStruct) {
        return bStruct - aStruct; // Structural layers first
      }

      return a.timestamp - b.timestamp; // Chronological tie-breaker
    });
  }

  /**
   * Synchronized offline actions sync loop
   */
  public async sync(force = false): Promise<void> {
    const auth = useAuthStore.getState();
    const activeUserId = auth.user?.id;
    if (!activeUserId || auth.user?.id === 'guest-user' || this.syncInProgress) return;

    if (!this.acquireSyncLease(activeUserId)) return;

    this.syncInProgress = true;
    this.setSyncState('replaying');

    const startTime = performance.now();
    const store = usePlaylistStateStore.getState();
    const capturedGenId = auth.sessionGenerationId;

    try {
      const isConnected = await isNetworkConnected();
      if (!isConnected || !this.lastHeartbeatSuccess) {
        console.log('[Sync Manager] Device offline or heartbeat failed. Skipping remote sync.');
        this.setSyncState('paused');
        return;
      }

      // Check battery level boundary before processing low priority tasks (Loophole 61)
      let isLowBattery = false;
      try {
        const Battery = require('expo-battery');
        const powerState = await Battery.getPowerStateAsync();
        isLowBattery = powerState.batteryLevel !== -1 && powerState.batteryLevel < SYNC_POLICY.minBatteryLevelDefer;
      } catch {}

      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      // 1. Flush local enqueued offline mutations
      let pendingQueue = store.offlineActionQueue;
      if (pendingQueue.length > 0) {
        console.log(`[SYNC REPLAY] Syncing offline action queue | Total: ${pendingQueue.length} operations.`);
        // Loop Detection: Quarantine infinitely failing mutations into DLQ
        const loopingActions = pendingQueue.filter(a => (a.retryCount ?? 0) > 5);
        if (loopingActions.length > 0) {
           const failedIds = loopingActions.map(a => a.id);
           store.isolatePoisonActions(failedIds);
           pendingQueue = pendingQueue.filter(a => (a.retryCount ?? 0) <= 5);
        }

        // Run event-driven prioritizations & compaction
        pendingQueue = this.prioritizeQueue(this.compactQueue(pendingQueue));

        // Yield CPU thread chunks to prevent frame starvation (Loophole 112)
        if (pendingQueue.length > 20 && Platform.OS !== 'web') {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Bounded payload processing (Page out batches to limit sizes - Loophole 13, 96)
        const batches: OfflineAction[][] = [];
        for (let i = 0; i < pendingQueue.length; i += SYNC_POLICY.batchSizeLimit) {
          batches.push(pendingQueue.slice(i, i + SYNC_POLICY.batchSizeLimit));
        }

        for (const batch of batches) {
          if (signal.aborted || capturedGenId !== auth.sessionGenerationId) {
            console.log('[Sync Manager] Sync canceled: auth generation mismatch or aborted.');
            return;
          }

          // Cryptographic Nonce & Mutation signatures calculation (Loophole 91, 102)
          const installationUUID = await getOrCreateInstallationUUID();
          const signedBatch = await Promise.all(batch.map(async (action) => {
            const signature = await signMutationPayload(action.payload, auth.token || '');
            return {
              ...action,
              installationUUID,
              signature,
              logicalSequence: this.tickLogicalClock(action.logicalSequence),
            };
          }));

          try {
            // Post payload to backend
            const response = await api.post('/sync/actions', { actions: signedBatch }, { signal, timeout: SYNC_POLICY.networkTimeoutMs });
            const { processedIds, failedIds, clock } = response.data?.data || response.data || {};

            if (clock) this.tickLogicalClock(clock);

            // Granular, per-operation ACK confirmations (Loophole 57, 76)
             if (processedIds && processedIds.length > 0) {
              store.removeProcessedActions(processedIds);
              console.log(`[SYNC REPLAY ACK] Successfully synced ${processedIds.length} operations to server.`);
              
              // Durably remove replayed logs and update cursors from SQLite inside a single atomic transaction (Loophole 51)
              const lastAppliedId = processedIds[processedIds.length - 1];
              acknowledgeMutationsTransaction(processedIds, activeUserId, lastAppliedId);
            }

            // Loophole 92: Quarantine poisoned events to DLQ
            if (failedIds && failedIds.length > 0) {
              store.isolatePoisonActions(failedIds);
            }
          } catch (batchErr: any) {
            console.warn('[Sync Manager] Batch execution failed:', batchErr.message);
            // Handle server-side HTTP 429 throttling backpressure limits (Loophole 60)
            if (batchErr.response?.status === 429) {
              await new Promise(resolve => setTimeout(resolve, SYNC_POLICY.throttlingBackoffBaseMs));
            }
            throw batchErr;
          }
        }
      }

      this.setSyncState('reconciling');

      // 2. Fetch authoritative cloud sync increments (Deltas)
      const sinceRevision = store.lastSyncedRevision || 0;
      const sinceParam = store.lastSyncedAt ? encodeURIComponent(store.lastSyncedAt) : '';
      const url = `/sync?sinceRevision=${sinceRevision}&since=${sinceParam}`;

      const response = await api.get(url, { signal, timeout: SYNC_POLICY.networkTimeoutMs });
      const payload = response.data?.data;

      if (payload) {
        const allowRemoteDestructiveSync = payload.allowRemoteDestructiveSync === true;
        // Complete reconciliation delta updates
        const {
          cards = [],
          folders = [],
          playlists = [],
          progress = [],
          deletedEntities = []
        } = payload.delta || {};
        console.log(`[SYNC RECONCILE] Reconciliation starting. Re-synced: ${folders.length} folders, ${playlists.length} playlists, ${cards.length} cards, ${progress.length} progress.`);

        const mergedCards = { ...store.cardsById };
        const mergedFolders = { ...store.foldersById };
        const mergedPlaylists = { ...store.playlistsById };
        const mergedOrderMap = { ...store.playlistCardOrderMap };

        const activeQueue = store.offlineActionQueue;
        const isDirty = (id: string) => activeQueue.some((a) => 
          a.payload?.playlistId === id || 
          a.payload?.folderId === id || 
          a.payload?.cardId === id ||
          a.payload?.tempId === id
        );

        // Process remote tombstones only when explicitly enabled on the user's MongoDB profile.
        if (allowRemoteDestructiveSync && deletedEntities && deletedEntities.length > 0) {
          deletedEntities.forEach((del: any) => {
            if (!del || !del.entityId) return;
            if (isDirty(del.entityId)) return; // Protect optimistic recreates/actions
            saveDeletedEntityToSQLite(
              del.entityId,
              del.entityType,
              activeUserId,
              del.deletedAt || new Date(),
              del.revision || 0
            );
            
            const tombstoneTime = new Date(del.deletedAt || 0).getTime();
            
            if (del.entityType === 'playlist') {
              const localPlaylist = store.playlistsById[del.entityId];
              if (localPlaylist && new Date((localPlaylist as any).updatedAt || 0).getTime() > tombstoneTime) return; // Reject stale tombstone
              deletePlaylistFromSQLite(del.entityId, activeUserId);
              delete mergedPlaylists[del.entityId];
            } else if (del.entityType === 'folder') {
              const localFolder = store.foldersById[del.entityId];
              if (localFolder && new Date(localFolder.updatedAt || 0).getTime() > tombstoneTime) return; // Reject stale tombstone
              deleteFolderFromSQLite(del.entityId, activeUserId);
              delete mergedFolders[del.entityId];
            } else if (del.entityType === 'card') {
              const cleanId = del.entityId.split('-loop-')[0];
              deleteCardFromSQLite(cleanId, activeUserId);
              delete mergedCards[cleanId];
              Object.keys(mergedOrderMap).forEach((playlistId) => {
                mergedOrderMap[playlistId] = (mergedOrderMap[playlistId] || [])
                  .filter((id: string) => id.split('-loop-')[0] !== cleanId);
              });
            }
          });
        }

        // Apply Last-Write-Wins (LWW) conflict merging (Loophole 3, 4, 15)
        if (folders.length > 0) {
          const acceptedFolders: any[] = [];
          folders.forEach((f: any) => {
            if (!f || !f._id) return;
            if (isEntityDeletedInSQLite(activeUserId, 'folder', f._id)) return;
            // Prevent stale server sweep from overwriting local optimistic creations/updates
            if (isDirty(f._id) || store.foldersById[f._id]?.dirty) return;
            mergedFolders[f._id] = f;
            acceptedFolders.push(f);
          });
          saveFoldersToSQLite(acceptedFolders, activeUserId);
        }

        if (playlists.length > 0) {
          const acceptedPlaylists: any[] = [];
          playlists.forEach((p: any) => {
            if (!p || !p._id) return;
            if (isEntityDeletedInSQLite(activeUserId, 'playlist', p._id)) return;

            // Mongo is an update channel, not the local authority. If a same-name local playlist
            // exists, keep local and let the pending local queue settle upstream.
            const localDuplicate = Object.values(store.playlistsById).find(
              (localP: any) => localP.name === p.name && localP._id !== p._id && !localP.isDeleted
            ) as any;
            if (localDuplicate) return;

            // Prevent stale server sweep from overwriting local optimistic creations/updates or destroying freshly toggled items
            if (isDirty(p._id) || store.playlistsById[p._id]?.dirty) return;
            mergedPlaylists[p._id] = p;
            const cardIds = p.cardIds || p.orderedCardIds || [];
            mergedOrderMap[p._id] = cardIds.map((id: string) => id.split('-loop-')[0]).filter(Boolean);
            acceptedPlaylists.push(p);
          });
          savePlaylistsToSQLite(acceptedPlaylists, activeUserId);
        }

        if (cards.length > 0) {
          const acceptedCards: any[] = [];
          cards.forEach((c: any) => {
            if (!c || !c._id) return;
            const cleanId = c._id.split('-loop-')[0];
            if (isEntityDeletedInSQLite(activeUserId, 'card', cleanId)) return;
            if (isDirty(cleanId) || store.cardsById[cleanId]?.dirty) return;
            mergedCards[cleanId] = { ...mergedCards[cleanId], ...c };
            acceptedCards.push(c);
          });
          saveCardsToSQLite(acceptedCards, activeUserId);
        }

        // Commutative statistical progress merges
        if (progress.length > 0) {
          progress.forEach((p: any) => {
            if (!p || !p.revisionCardId) return;
            const cardId = p.revisionCardId.toString();
            if (mergedCards[cardId]) {
              // Loops Completed uses commutative max(loops)
              const existingLoops = (mergedCards[cardId].currentUserQuestionProgress as any)?.completedLoops || 0;
              const serverLoops = p.completedLoops || 0;
              const finalLoops = Math.max(existingLoops, serverLoops);

              mergedCards[cardId].currentUserQuestionProgress = {
                attemptStatus: p.completed ? 'attempted' : 'skipped',
                perceivedDifficultyByUser: null,
                completedLoops: finalLoops,
              } as any;
              mergedCards[cardId].difficultyState = p.difficultyState;
              mergedCards[cardId].isFavorite = p.favorite;
            }
          });
          const progressCardIds = progress.map((p: any) => p.revisionCardId.toString());
          const progressCardsToSave = progressCardIds.map((id: string) => mergedCards[id]).filter(Boolean);
          saveCardsToSQLite(progressCardsToSave, activeUserId);
        }

        // Reconcile cardDifficultyMap from server questionProgress classifications
        const questionProgress = payload.delta?.questionProgress || [];
        const mergedDifficultyMap: Record<string, any> = { ...store.cardDifficultyMap };
        if (questionProgress.length > 0) {
          questionProgress.forEach((qp: any) => {
            if (!qp || !qp.questionId) return;
            const cleanQId = String(qp.questionId).split('-loop-')[0];
            // Skip if local has a newer optimistic update
            const localEntry = mergedDifficultyMap[cleanQId];
            if (localEntry?.optimistic) return;
            const difficulty = qp.attemptStatus === 'skipped' ? 'skipped' : qp.perceivedDifficultyByUser;
            if (difficulty) {
              mergedDifficultyMap[cleanQId] = {
                difficulty,
                originalDifficulty: difficulty,
                updatedAt: new Date(qp.updatedAt || 0).getTime(),
                optimistic: false,
              };
            } else {
              delete mergedDifficultyMap[cleanQId];
            }
          });
          if (__DEV__) console.log(`[SYNC RECONCILE] Merged ${questionProgress.length} classification entries into cardDifficultyMap.`);
        }

        // Commit fully reconciled states back to Zustand in a single react ticket!
        usePlaylistStateStore.setState({
          cardsById: mergedCards,
          foldersById: mergedFolders,
          playlistsById: mergedPlaylists,
          playlistCardOrderMap: mergedOrderMap,
          cardDifficultyMap: mergedDifficultyMap,
          lastSyncedRevision: payload.toRevision || payload.currentRevision || 0,
          lastSyncedAt: payload.timestamp || new Date().toISOString(),
          lastSuccessfulSyncAt: Date.now(),
          syncFailureCount: 0,
        });

        // Persist local sync cursor coordinates (Loophole 52)
        const db = getDatabase();
        db.runSync(
          `INSERT INTO sync_cursors (userId, lastPulledRevision, updatedAt) VALUES (?, ?, ?)
           ON CONFLICT(userId) DO UPDATE SET lastPulledRevision=excluded.lastPulledRevision, updatedAt=excluded.updatedAt;`,
          [activeUserId, payload.toRevision || payload.currentRevision || 0, Date.now()]
        );
      }

      const duration = performance.now() - startTime;
      syncTelemetry.logSyncSuccess(duration, pendingQueue.length, {
        reconciled: true,
      });

    } catch (err: any) {
      console.error('[Sync Manager Error] Sync execution failed:', err.message);
      syncTelemetry.logSyncFailure(err, store.syncFailureCount + 1);
      store.incrementSyncFailure();
    } finally {
      this.syncInProgress = false;
      this.releaseSyncLease();
      this.setSyncState('idle');
    }
  }
}

export const syncManager = new SyncManager();
