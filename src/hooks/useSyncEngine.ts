import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { useShallow } from 'zustand/react/shallow';
import { usePlaylistStateStore, OfflineAction } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { AppState, AppStateStatus, InteractionManager } from 'react-native';
import { isNetworkConnected } from '@/utils/network';
import NetInfo from '@react-native-community/netinfo';
import { syncTelemetry } from '@/utils/syncTelemetry';
import { mergeCardState } from '@/utils/resolveCardState';
import type { IFolder } from '@/types/folder';
import type { ApiPlaylist } from '@/services/playlistService';
import offlineSeed from '../constants/offlineSeed.json';
import {
  saveCardsToSQLite,
  saveFoldersToSQLite,
  savePlaylistsToSQLite,
  deleteFolderFromSQLite,
  deletePlaylistFromSQLite,
} from '@/utils/sqliteSyncBridge';


// Entity dirty check: returns true if there is a pending action in the offline queue for this entity
const isEntityDirty = (queue: OfflineAction[], entityId: string): boolean => {
  return queue.some((a) => {
    if (!a.payload) return false;
    if (a.payload.cardId === entityId) return true;
    if (a.payload.playlistId === entityId) return true;
    if (a.payload.folderId === entityId) return true;
    if (a.payload.tempId === entityId) return true;
    return false;
  });
};

// Helper: Calculate deterministic SHA-256 local catalog checksum
const calculateLocalChecksum = async (playlistsById: any, foldersById: any): Promise<string> => {
  const playlistIds = Object.keys(playlistsById).sort();
  const folderIds = Object.keys(foldersById).sort();
  const hashInput = JSON.stringify({ playlistIds, folderIds });
  try {
    const Crypto = require('expo-crypto');
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      hashInput
    );
  } catch (err) {
    // Simple robust deterministic fallback hash if expo-crypto is unavailable
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
};

// Conflict-Free Merge policy: local optimistic changes win over server updates
function mergeEntityState<T extends { _id: string; updatedAt?: string | number; dirty?: boolean; localRevision?: number }>(
  local: T | undefined,
  server: T,
  isDirty: boolean
): T {
  if (!local) return server;
  if (isDirty || local.dirty) return local; // Local optimistic changes win
  
  const localTime = new Date(local.updatedAt || 0).getTime();
  const serverTime = new Date(server.updatedAt || 0).getTime();
  return serverTime > localTime ? server : local;
}

export function useSyncEngine() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentDelayRef = useRef<number>(2000); // Backoff base
  const isSyncInFlight = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const startupSyncTriggered = useRef(false);

  // Ref to resolve mutual recursion between scheduleRetry and triggerBackgroundSync in TS
  const triggerBackgroundSyncRef = useRef<((force?: boolean) => Promise<void>) | null>(null);

  const {
    offlineActionQueue,
    clearOfflineActions,
    lastSyncedAt,
    setLastSyncedAt,
    hydratePlaylistCards,
    hydrateFolders,
    hydratePlaylists,
    bootstrapStatus,
    setBootstrapStatus,
    syncFailureCount,
    incrementSyncFailure,
    resetSyncFailure,
    setLastSuccessfulSyncAt,
    setLastCatalogIntegrityCheck,
    setSyncStatus,
    lastSyncedRevision,
    setLastSyncedRevision,
    enableRevisionSync,
    enableStrictContiguity,
    applyQueueRewrite
  } = usePlaylistStateStore(
    useShallow((s) => ({
      offlineActionQueue: s.offlineActionQueue,
      clearOfflineActions: s.clearOfflineActions,
      lastSyncedAt: s.lastSyncedAt,
      setLastSyncedAt: s.setLastSyncedAt,
      hydratePlaylistCards: s.hydratePlaylistCards,
      hydrateFolders: s.hydrateFolders,
      hydratePlaylists: s.hydratePlaylists,
      bootstrapStatus: s.bootstrapStatus,
      setBootstrapStatus: s.setBootstrapStatus,
      syncFailureCount: s.syncFailureCount,
      incrementSyncFailure: s.incrementSyncFailure,
      resetSyncFailure: s.resetSyncFailure,
      setLastSuccessfulSyncAt: s.setLastSuccessfulSyncAt,
      setLastCatalogIntegrityCheck: s.setLastCatalogIntegrityCheck,
      setSyncStatus: s.setSyncStatus,
      lastSyncedRevision: s.lastSyncedRevision,
      setLastSyncedRevision: s.setLastSyncedRevision,
      enableRevisionSync: s.enableRevisionSync,
      enableStrictContiguity: s.enableStrictContiguity,
      applyQueueRewrite: s.applyQueueRewrite
    }))
  );

  // Sweep and resolve entity relationship integrity
  const validateEntityIntegrity = useCallback(() => {
    const state = usePlaylistStateStore.getState();
    const playlistsById = { ...state.playlistsById };
    const foldersById = { ...state.foldersById };
    const orderMap = { ...state.playlistCardOrderMap };

    let repaired = false;

    // 1. Verify Playlist Reference Integrity
    Object.keys(playlistsById).forEach((pId) => {
      const playlist = playlistsById[pId];
      if (!playlist) return;

      const rawIds = playlist.cardIds || playlist.orderedCardIds || [];
      const validIds = rawIds.filter(Boolean);

      if (rawIds.length !== validIds.length) {
        playlistsById[pId] = {
          ...playlist,
          cardIds: validIds,
          orderedCardIds: validIds,
          itemCount: validIds.length,
        };
        repaired = true;
      }
    });

    // 2. Verify Folder Reference Integrity
    Object.keys(foldersById).forEach((fId) => {
      const folder = foldersById[fId];
      if (!folder) return;

      const rawIds = folder.cardIds || [];
      const validIds = rawIds.filter(Boolean);

      if (rawIds.length !== validIds.length) {
        foldersById[fId] = {
          ...folder,
          cardIds: validIds,
          cardCount: validIds.length,
        };
        repaired = true;
      }
    });

    // 3. Verify Order Map Integrity
    Object.keys(orderMap).forEach((key) => {
      const rawIds = orderMap[key] || [];
      const validIds = rawIds.filter(Boolean);
      if (rawIds.length !== validIds.length) {
        orderMap[key] = validIds;
        repaired = true;
      }
    });

    if (repaired) {
      usePlaylistStateStore.setState({
        playlistsById,
        foldersById,
        playlistCardOrderMap: orderMap,
      });
    }

    setLastCatalogIntegrityCheck(Date.now());
    return true;
  }, [setLastCatalogIntegrityCheck]);

  // Flicker-Free shadow cache swap full resync routine
  const executeFullResync = useCallback(async (forcedByChecksum = false) => {
    if (isSyncInFlight.current) return;
    isSyncInFlight.current = true;
    setSyncStatus('syncing');
    
    const startTime = performance.now();
    syncTelemetry.log('info', `Flicker-Free Shadow Cache Full Resync initiated. Reason: ${forcedByChecksum ? 'Checksum Mismatch' : 'Compaction / Direct Request'}`);

    try {
      const freshState = usePlaylistStateStore.getState();
      
      // Request complete clean revision fetch
      const response = await api.get('/sync?sinceRevision=0&since=');
      const payload = response.data?.data;

      if (payload) {
        // Hydrate background shadow structures to prevent white flashes and layout jumps
        const shadowCards = { ...payload.delta?.cards?.reduce((acc: any, c: any) => {
          if (c && c._id) acc[c._id.split('-loop-')[0]] = c;
          return acc;
        }, {}) };

        const shadowFolders = { ...payload.delta?.folders?.reduce((acc: any, f: any) => {
          if (f && f._id) acc[f._id] = f;
          return acc;
        }, {}) };

        const shadowPlaylists = { ...payload.delta?.playlists?.reduce((acc: any, p: any) => {
          if (p && p._id) acc[p._id] = p;
          return acc;
        }, {}) };

        const shadowOrderMap: Record<string, string[]> = {
          all: Object.keys(shadowCards),
          likes: [],
          'watch-later': [],
          easy: [],
          medium: [],
          hard: [],
          skipped: []
        };

        // Map playlist collections
        payload.delta?.playlists?.forEach((p: any) => {
          if (!p || !p._id) return;
          if (!['easy', 'medium', 'hard', 'skipped'].includes(p._id)) {
            const cardIds = p.cardIds || p.orderedCardIds || [];
            shadowOrderMap[p._id] = cardIds.map((id: string) => id.split('-loop-')[0]).filter(Boolean);
          }
        });

        // 100% Data Preservation: Merge optimistic clicks currently enqueued in the actions queue
        const activeQueue = freshState.offlineActionQueue;
        activeQueue.forEach((action) => {
          const act = action.action;
          const pl = action.payload;
          if (act === 'CLASSIFY_CARD' && pl.cardId && shadowCards[pl.cardId]) {
            shadowCards[pl.cardId].difficultyState = pl.state;
          } else if (act === 'TOGGLE_FAVORITE' && pl.cardId && shadowCards[pl.cardId]) {
            shadowCards[pl.cardId].isFavorite = pl.value;
          } else if (act === 'TOGGLE_PLAYLIST_ITEM' && pl.playlistId && pl.cardId) {
            const pId = pl.playlistId;
            if (shadowOrderMap[pId]) {
              if (pl.value && !shadowOrderMap[pId].includes(pl.cardId)) {
                shadowOrderMap[pId].push(pl.cardId);
              } else if (!pl.value) {
                shadowOrderMap[pId] = shadowOrderMap[pId].filter(id => id !== pl.cardId);
              }
            }
          }
        });

        // Persist to SQLite canonical storage
        try {
          saveCardsToSQLite(Object.values(shadowCards));
          saveFoldersToSQLite(Object.values(shadowFolders));
          savePlaylistsToSQLite(Object.values(shadowPlaylists));
        } catch (sqlErr: any) {
          console.error('[SQLite Sync Engine Error] Full resync SQLite persistence failed:', sqlErr.message);
        }

        // Swap caches instantly in a single React tick!
        usePlaylistStateStore.setState({
          cardsById: shadowCards,
          foldersById: shadowFolders,
          playlistsById: shadowPlaylists,
          playlistCardOrderMap: shadowOrderMap,
          lastSyncedRevision: payload.toRevision || payload.currentRevision || 0,
          lastSyncedAt: payload.timestamp || new Date().toISOString(),
          lastSuccessfulSyncAt: Date.now(),
          syncFailureCount: 0,
        });

        const duration = performance.now() - startTime;
        syncTelemetry.logSyncSuccess(duration, activeQueue.length, {
          totalPlaylistsCount: Object.keys(shadowPlaylists).length,
          totalFoldersCount: Object.keys(shadowFolders).length,
          shadowCacheSwap: true
        });
        
        if (__DEV__) {
          console.log(`[Shadow Cache Swap] Atomic swap completed in ${duration.toFixed(2)}ms. Flicker avoided!`);
        }
      }
    } catch (err: any) {
      console.error('[Shadow Cache Swap] Full resync failed:', err.message);
      syncTelemetry.logSyncFailure(err, usePlaylistStateStore.getState().syncFailureCount + 1);
      usePlaylistStateStore.getState().incrementSyncFailure();
    } finally {
      isSyncInFlight.current = false;
      setSyncStatus('synced');
    }
  }, [setSyncStatus]);

  // Exponential Backoff retry scheduler
  const scheduleRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    const state = usePlaylistStateStore.getState();
    const attempts = state.syncFailureCount;
    
    const baseDelay = 2000;
    const maxDelay = 60000;
    const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempts));
    const jitter = Math.floor(Math.random() * 1000) - 500;
    const jitteredDelay = Math.max(1000, delay + jitter);

    if (__DEV__) {
      console.log(`[Sync Engine Backoff] Scheduling retry in ${jitteredDelay}ms (Attempt #${attempts + 1})`);
    }

    retryTimeoutRef.current = setTimeout(() => {
      triggerBackgroundSyncRef.current?.(true);
    }, jitteredDelay);
  }, []);

  const triggerBackgroundSync = useCallback(async (force?: boolean) => {
    const isGuest = useAuthStore.getState().user?.id === 'guest-user';
    const hasAccess = isAuthenticated || isGuest;
    if (!hasAccess || !isAuthReady) return;

    if (isSyncInFlight.current) return;

    isSyncInFlight.current = true;
    setSyncStatus('syncing');
    setBootstrapStatus('in_progress');

    try {
      const state = usePlaylistStateStore.getState();
      const currentDbVersion = state.dbVersion;
      const targetDbVersion = offlineSeed.dbVersion;

      // Check if we need local seeding
      const needsSeeding = force || !currentDbVersion || currentDbVersion !== targetDbVersion || Object.keys(state.cardsById).length === 0 || !state.cardsById['6a1655fbb129b168bb16bb45']?.slides;

      if (needsSeeding) {
        if (__DEV__) console.log(`[Offline Sync] Local seeding triggered. Version: ${currentDbVersion} -> ${targetDbVersion}`);
        
        const existingCards = state.cardsById || {};
        const existingFolders = state.foldersById || {};
        const existingPlaylists = state.playlistsById || {};
        const existingOrderMap = state.playlistCardOrderMap || {};

        const nextCards = { ...existingCards };
        const nextFolders = { ...existingFolders };
        const nextPlaylists = { ...existingPlaylists };
        const nextOrderMap = { ...existingOrderMap };

        offlineSeed.folders.forEach((f: any) => {
          nextFolders[f._id] = f;
        });

        offlineSeed.playlists.forEach((p: any) => {
          nextPlaylists[p._id] = p;
          if (!nextOrderMap[p._id]) {
            nextOrderMap[p._id] = p.cardIds || [];
          }
        });

        offlineSeed.revisionCards.forEach((c: any) => {
          const existingCard = existingCards[c._id] as any;
          if (existingCard) {
            nextCards[c._id] = {
              ...c,
              difficultyState: existingCard.difficultyState !== undefined ? existingCard.difficultyState : c.difficultyState,
              isFavorite: existingCard.isFavorite !== undefined ? existingCard.isFavorite : c.isFavorite,
              isWatchLater: existingCard.isWatchLater !== undefined ? existingCard.isWatchLater : c.isWatchLater,
              currentUserQuestionProgress: existingCard.currentUserQuestionProgress || c.currentUserQuestionProgress,
            } as any;
          } else {
            nextCards[c._id] = c as any;
          }
        });

        const allCardIds = offlineSeed.revisionCards.map((c: any) => c._id);
        nextOrderMap['all'] = allCardIds;

        ['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].forEach(key => {
          if (!nextOrderMap[key]) {
            nextOrderMap[key] = [];
          }
        });

        let seniorQuotes = state.seniorQuotes;
        if ((offlineSeed as any).seniorQuotes && (offlineSeed as any).seniorQuotes.length > 0) {
          seniorQuotes = (offlineSeed as any).seniorQuotes;
        }

        // Calculate the highest updatedAt in offlineSeed as the safe bootstrap sync checkpoint
        let maxSeedTime = new Date(0);
        offlineSeed.revisionCards.forEach((c: any) => {
          if (c.updatedAt) {
            const t = new Date(c.updatedAt);
            if (t > maxSeedTime) maxSeedTime = t;
          }
        });
        const safeBootstrapCheckpoint = maxSeedTime.getTime() > 0 ? maxSeedTime.toISOString() : new Date(0).toISOString();

        // Persist local seed values to SQLite canonical storage
        try {
          saveCardsToSQLite(Object.values(nextCards));
          saveFoldersToSQLite(Object.values(nextFolders));
          savePlaylistsToSQLite(Object.values(nextPlaylists));
        } catch (sqlErr: any) {
          console.error('[SQLite Sync Engine Error] Local seeding SQLite persistence failed:', sqlErr.message);
        }

        usePlaylistStateStore.setState({
          cardsById: nextCards,
          foldersById: nextFolders,
          playlistsById: nextPlaylists,
          playlistCardOrderMap: nextOrderMap,
          seniorQuotes,
          dbVersion: targetDbVersion,
          lastSyncedAt: safeBootstrapCheckpoint,
          lastSyncedRevision: 0, // Reset revision sweep to ensure a clean delta sync sweep
          lastSuccessfulSyncAt: Date.now(),
        });
      }

      validateEntityIntegrity();
      setBootstrapStatus('completed');
      setLastSuccessfulSyncAt(Date.now());
      if (!isAuthenticated || isGuest) {
        setLastSyncedAt(new Date().toISOString());
      }

      // --- ONLINE SERVER SWEEP ---
      if (isAuthenticated && !isGuest) {
        const isConnected = await isNetworkConnected();
        if (isConnected) {
          syncTelemetry.logSyncStart(offlineActionQueue.length);
          const flushStart = performance.now();

          // 1. Flush pending enqueued offline actions
          const pendingActions = usePlaylistStateStore.getState().offlineActionQueue;
          if (pendingActions.length > 0) {
            if (__DEV__) console.log(`[Sync Engine] Flushing ${pendingActions.length} enqueued offline actions...`);
            try {
              const flushResponse = await api.post('/sync/actions', { actions: pendingActions });
              const { processedIds, failedIds } = flushResponse.data?.data || flushResponse.data || {};
              
              if (processedIds && processedIds.length > 0) {
                usePlaylistStateStore.getState().removeProcessedActions(processedIds);
              }
              if (failedIds && failedIds.length > 0) {
                usePlaylistStateStore.getState().isolatePoisonActions(failedIds);
              }
            } catch (flushErr) {
              console.warn('[Sync Engine] Failed to flush enqueued actions queue:', flushErr);
              throw flushErr;
            }
          }

          // 2. Strict contiguous sweep query
          try {
            const freshState = usePlaylistStateStore.getState();
            const sinceRevision = freshState.lastSyncedRevision || 0;
            const sinceParam = freshState.lastSyncedAt ? encodeURIComponent(freshState.lastSyncedAt) : '';

            // Handle Phase 0 feature flag toggling
            const url = freshState.enableRevisionSync
              ? `/sync?sinceRevision=${sinceRevision}&since=${sinceParam}`
              : `/sync?since=${sinceParam}`;

            const response = await api.get(url);
            const payload = response.data?.data;

            if (payload) {
              // Compaction redirect validation check
              if (payload.requiresFullResync) {
                if (__DEV__) console.log('[Sync Engine] Compaction window limit reached. Triggering Shadow Cache Full Resync.');
                isSyncInFlight.current = false;
                await executeFullResync();
                return;
              }

              const serverDbVersion = payload.dbVersion || targetDbVersion;
              const {
                cards = [],
                folders = [],
                playlists = [],
                progress = [],
                deletedEntities = []
              } = payload.delta || {};

              const mergedCards = { ...freshState.cardsById };
              const mergedOrderMap = { ...freshState.playlistCardOrderMap };
              const mergedHydratedPlaylists = { ...freshState.hydratedPlaylists };
              const mergedFolders = { ...freshState.foldersById };
              const mergedPlaylists = { ...freshState.playlistsById };

              // A: Process deletions tombstones delta
              if (deletedEntities && deletedEntities.length > 0) {
                deletedEntities.forEach((del: any) => {
                  if (!del || !del.entityId) return;
                  if (del.entityType === 'playlist') {
                    delete mergedPlaylists[del.entityId];
                    delete mergedOrderMap[del.entityId];
                    delete mergedHydratedPlaylists[del.entityId];
                  } else if (del.entityType === 'folder') {
                    delete mergedFolders[del.entityId];
                  }
                });
              }

              // B: Merge Cards
              if (cards && cards.length > 0) {
                cards.forEach((card: any) => {
                  if (!card || !card._id) return;
                  const cleanId = card._id.split('-loop-')[0];
                  const existingCard = mergedCards[cleanId];
                  const local = freshState.cardDifficultyMap[cleanId];
                  mergedCards[cleanId] = mergeCardState(local, existingCard, card);
                });

                const cleanIds = cards.map((c: any) => c._id?.split('-loop-')[0]).filter(Boolean);
                const existingOrder = mergedOrderMap['all'];
                if (!existingOrder) {
                  mergedOrderMap['all'] = cleanIds;
                } else {
                  const existingSet = new Set(existingOrder);
                  const newIds = cleanIds.filter((id: string) => !existingSet.has(id));
                  mergedOrderMap['all'] = [...existingOrder, ...newIds];
                }
                mergedHydratedPlaylists['all'] = true;
              }

              // C: Merge Folders
              if (folders && folders.length > 0) {
                folders.forEach((serverFolder: any) => {
                  if (!serverFolder || !serverFolder._id) return;
                  const local = mergedFolders[serverFolder._id];
                  const isDirty = isEntityDirty(freshState.offlineActionQueue, serverFolder._id);
                  mergedFolders[serverFolder._id] = mergeEntityState(local, serverFolder, isDirty);
                });
              }

              // D: Merge Playlists
              if (playlists && playlists.length > 0) {
                playlists.forEach((serverPlaylist: any) => {
                  if (!serverPlaylist || !serverPlaylist._id) return;
                  const local = mergedPlaylists[serverPlaylist._id];
                  const isDirty = isEntityDirty(freshState.offlineActionQueue, serverPlaylist._id);
                  mergedPlaylists[serverPlaylist._id] = mergeEntityState(local, serverPlaylist, isDirty);

                  if (!['easy', 'medium', 'hard', 'skipped'].includes(serverPlaylist._id)) {
                    const cardIds = serverPlaylist.cardIds || serverPlaylist.orderedCardIds || [];
                    const cleanIds = cardIds.map((id: string) => id.split('-loop-')[0]).filter(Boolean);
                    mergedOrderMap[serverPlaylist._id] = cleanIds;
                    mergedHydratedPlaylists[serverPlaylist._id] = true;
                  }
                });
              }

              // E: CRDT-lite logical sequence conflict progress merging
              if (progress && progress.length > 0) {
                progress.forEach((p: any) => {
                  if (!p || !p.revisionCardId) return;
                  const cardId = p.revisionCardId.toString();
                  const localDiff = freshState.cardDifficultyMap[cardId];

                  // Difficulty state conflict clock resolution
                  const serverDiffSeq = p.difficultyLogicalSequence || 0;
                  const localDiffSeq = (localDiff as any)?.difficultyLogicalSequence || 0;
                  
                  if (!localDiff || serverDiffSeq > localDiffSeq) {
                    if (mergedCards[cardId]) {
                      mergedCards[cardId].difficultyState = p.difficultyState;
                    }
                    if (p.difficultyState) {
                      const list = mergedOrderMap[p.difficultyState] || [];
                      if (!list.includes(cardId)) {
                        mergedOrderMap[p.difficultyState] = [cardId, ...list];
                      }
                    }
                  }

                  // Favorite state conflict clock resolution
                  const serverFavSeq = p.favoriteLogicalSequence || 0;
                  const localFavSeq = (localDiff as any)?.favoriteLogicalSequence || 0;

                  if (serverFavSeq > localFavSeq) {
                    if (mergedCards[cardId]) {
                      mergedCards[cardId].isFavorite = p.favorite;
                    }
                    const likesList = mergedOrderMap['likes'] || [];
                    if (p.favorite && !likesList.includes(cardId)) {
                      mergedOrderMap['likes'] = [cardId, ...likesList];
                    } else if (!p.favorite) {
                      mergedOrderMap['likes'] = likesList.filter(id => id !== cardId);
                    }
                  }
                });
              }

              // SQLite persistence writes
              try {
                // A: Handle deletions
                if (deletedEntities && deletedEntities.length > 0) {
                  deletedEntities.forEach((del: any) => {
                    if (!del || !del.entityId) return;
                    if (del.entityType === 'playlist') {
                      deletePlaylistFromSQLite(del.entityId);
                    } else if (del.entityType === 'folder') {
                      deleteFolderFromSQLite(del.entityId);
                    }
                  });
                }
                
                // B: Handle updates/insertions
                if (cards && cards.length > 0) {
                  const updatedCardsList = cards.map((c: any) => {
                    const cleanId = c._id.split('-loop-')[0];
                    return mergedCards[cleanId] || c;
                  });
                  saveCardsToSQLite(updatedCardsList);
                }
                if (folders && folders.length > 0) {
                  saveFoldersToSQLite(folders);
                }
                if (playlists && playlists.length > 0) {
                  savePlaylistsToSQLite(playlists);
                }
                if (progress && progress.length > 0) {
                  const progressCardIds = progress.map((p: any) => p.revisionCardId.toString());
                  const progressCardsToSave = progressCardIds.map((id: string) => mergedCards[id]).filter(Boolean);
                  saveCardsToSQLite(progressCardsToSave);
                }
              } catch (sqlErr: any) {
                console.error('[SQLite Sync Engine Error] Delta sync SQLite persistence failed:', sqlErr.message);
              }

              // Save everything in one single atomic transaction update
              usePlaylistStateStore.setState({
                cardsById: mergedCards,
                foldersById: mergedFolders,
                playlistsById: mergedPlaylists,
                playlistCardOrderMap: mergedOrderMap,
                hydratedPlaylists: mergedHydratedPlaylists,
                dbVersion: serverDbVersion,
                lastSyncedRevision: payload.toRevision || payload.currentRevision || 0,
                lastSyncedAt: payload.timestamp || new Date().toISOString(),
                lastSuccessfulSyncAt: Date.now(),
                syncFailureCount: 0,
              });

              // F: Cryptographic Fingerprint Checksum Auditing
              if (freshState.enableStrictContiguity && payload.checksum) {
                const localChecksum = await calculateLocalChecksum(mergedPlaylists, mergedFolders);
                if (localChecksum !== payload.checksum) {
                  if (__DEV__) {
                    console.warn(`[Checksum Audit] Checksum Mismatch! Local: ${localChecksum} | Server: ${payload.checksum}. Initiating shadow self-healing.`);
                  }
                  isSyncInFlight.current = false;
                  await executeFullResync(true);
                  return;
                }
              }

              const duration = performance.now() - flushStart;
              syncTelemetry.logSyncSuccess(duration, pendingActions.length, {
                cardsDelta: cards.length,
                foldersDelta: folders.length,
                playlistsDelta: playlists.length
              });
              resetSyncFailure();
            }
          } catch (serverErr: any) {
            console.warn('[Sync Engine] Online dynamic fetch failed:', serverErr.message);
            incrementSyncFailure();
            scheduleRetry();
            throw serverErr;
          }
        }
      }

      setTimeout(() => {
        setSyncStatus('synced');
        usePlaylistStateStore.setState({ hasSyncedThisSession: true });
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      }, 500);

    } catch (err) {
      console.error('[Offline Sync] Background sync cycle aborted:', err);
      setBootstrapStatus('failed');
      setSyncStatus('offline');
    } finally {
      isSyncInFlight.current = false;
    }
  }, [
    isAuthenticated,
    isAuthReady,
    bootstrapStatus,
    setBootstrapStatus,
    setLastSuccessfulSyncAt,
    validateEntityIntegrity,
    setSyncStatus,
    setLastSyncedAt,
    queryClient,
    executeFullResync,
    scheduleRetry,
    incrementSyncFailure,
    resetSyncFailure,
    offlineActionQueue.length
  ]);

  // Synchronously assign ref to solve circular dependency
  triggerBackgroundSyncRef.current = triggerBackgroundSync;

  const pendingResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseLiveSync = useCallback(() => {
    if (pendingResumeTimeoutRef.current) {
      clearTimeout(pendingResumeTimeoutRef.current);
      pendingResumeTimeoutRef.current = null;
    }
    usePlaylistStateStore.getState().setLiveSyncPaused(true);
    if (__DEV__) console.log('[Sync Engine] Paused live sync status.');
    if (maxPauseTimerRef.current) {
      clearTimeout(maxPauseTimerRef.current);
      maxPauseTimerRef.current = null;
    }
  }, []);

  const resumeAndFlush = useCallback(() => {
    if (maxPauseTimerRef.current) {
      clearTimeout(maxPauseTimerRef.current);
      maxPauseTimerRef.current = null;
    }
    if (pendingResumeTimeoutRef.current) {
      clearTimeout(pendingResumeTimeoutRef.current);
    }
    pendingResumeTimeoutRef.current = setTimeout(() => {
      usePlaylistStateStore.getState().setLiveSyncPaused(false);
      if (__DEV__) console.log('[Sync Engine] Resumed live sync. Flushing...');
      triggerBackgroundSyncRef.current?.(true);
    }, 500);
  }, []);

  useEffect(() => {
    usePlaylistStateStore.setState({
      pauseSyncGate: pauseLiveSync,
      resumeSyncGate: resumeAndFlush,
    });
    return () => {
      if (pendingResumeTimeoutRef.current) clearTimeout(pendingResumeTimeoutRef.current);
      if (maxPauseTimerRef.current) clearTimeout(maxPauseTimerRef.current);
      usePlaylistStateStore.setState({
        pauseSyncGate: null,
        resumeSyncGate: null,
      });
    };
  }, [pauseLiveSync, resumeAndFlush]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current === 'active' && nextAppState !== 'active') {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      }
      appStateRef.current = nextAppState;
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      startupSyncTriggered.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const isGuest = useAuthStore.getState().user?.id === 'guest-user';
    const shouldSync = (isAuthenticated || isGuest) && isAuthReady && (!startupSyncTriggered.current || bootstrapStatus === 'not_started');
    
    if (shouldSync) {
      startupSyncTriggered.current = true;
      timer = setTimeout(() => {
        triggerBackgroundSyncRef.current?.(true);
      }, 500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, isAuthReady, bootstrapStatus]);

  useEffect(() => {
    if (!isAuthenticated || !isAuthReady) return;

    const state = usePlaylistStateStore.getState();
    if (state.hasSyncedThisSession) return;

    const unsubscribe = NetInfo.addEventListener((netState) => {
      const isConnected = netState.isConnected && netState.isInternetReachable !== false;
      const currentState = usePlaylistStateStore.getState();

      if (isConnected && !currentState.hasSyncedThisSession) {
        triggerBackgroundSyncRef.current?.(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, isAuthReady]);

  useEffect(() => {
    const isGuest = useAuthStore.getState().user?.id === 'guest-user';
    if (!isAuthenticated || isGuest || !isAuthReady) return;
    if (offlineActionQueue.length === 0 || usePlaylistStateStore.getState().isLiveSyncPaused) return;

    const timer = setTimeout(() => {
      triggerBackgroundSyncRef.current?.(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [offlineActionQueue.length, isAuthenticated, isAuthReady]);

  return { triggerBackgroundSync, validateEntityIntegrity, pauseLiveSync, resumeAndFlush, executeFullResync };
}
