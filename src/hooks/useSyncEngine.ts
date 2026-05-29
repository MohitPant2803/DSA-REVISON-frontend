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
  deleteCardFromSQLite,
  saveDeletedEntityToSQLite,
  isEntityDeletedInSQLite,
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

  // Comprehensive fallback: fully re-download canonical catalog and overwrite store (Loophole 64)
  const executeFullResync = useCallback(async (forcedByChecksum = false) => {
    const user = useAuthStore.getState().user;
    if (!user || user.id === 'guest-user') return;
    if (isSyncInFlight.current) return;
    const currentGenerationId = useAuthStore.getState().sessionGenerationId;
    isSyncInFlight.current = true;
    setSyncStatus('syncing');
    
    const startTime = performance.now();
    syncTelemetry.log('info', `Flicker-Free Shadow Cache Full Resync initiated. Reason: ${forcedByChecksum ? 'Checksum Mismatch' : 'Compaction / Direct Request'}`);

    try {
      const freshState = usePlaylistStateStore.getState();
      const activeUserId = useAuthStore.getState().user?.id || 'guest-user';
      
      // Request complete clean revision fetch
      const response = await api.get('/sync?sinceRevision=0&since=');
      const payload = response.data?.data;
      console.log('[DEBUG] Playlists in payload:', JSON.stringify(payload?.delta?.playlists ?? 'undefined'));

      if (payload) {
        const allowRemoteDestructiveSync = payload.allowRemoteDestructiveSync === true;
        const activeQueue = freshState.offlineActionQueue;
        const isDirty = (id: string) => activeQueue.some((a) =>
          a.payload?.playlistId === id ||
          a.payload?.folderId === id ||
          a.payload?.cardId === id ||
          a.payload?.tempId === id
        );

        // Local-first shadow structures: start from Zustand/SQLite truth, then accept Mongo as additive sync input.
        const shadowCards = { ...freshState.cardsById };
        const shadowFolders = { ...freshState.foldersById };
        const shadowPlaylists = { ...freshState.playlistsById };
        const shadowOrderMap: Record<string, string[]> = {
          ...freshState.playlistCardOrderMap,
          all: freshState.playlistCardOrderMap.all || Object.keys(freshState.cardsById),
          likes: freshState.playlistCardOrderMap.likes || [],
          'watch-later': freshState.playlistCardOrderMap['watch-later'] || [],
          easy: freshState.playlistCardOrderMap.easy || [],
          medium: freshState.playlistCardOrderMap.medium || [],
          hard: freshState.playlistCardOrderMap.hard || [],
          skipped: freshState.playlistCardOrderMap.skipped || [],
        };

        if (allowRemoteDestructiveSync) {
          payload.delta?.deletedEntities?.forEach((del: any) => {
            if (!del?.entityId || !del?.entityType) return;
            saveDeletedEntityToSQLite(
              del.entityId,
              del.entityType,
              activeUserId,
              del.deletedAt || new Date(),
              del.revision || 0
            );
          });

          payload.delta?.deletedEntities?.forEach((del: any) => {
            if (!del?.entityId) return;
            const cleanId = del.entityId.split('-loop-')[0];
            if (del.entityType === 'playlist') {
              delete shadowPlaylists[cleanId];
              delete shadowOrderMap[cleanId];
            } else if (del.entityType === 'folder') {
              delete shadowFolders[cleanId];
            } else if (del.entityType === 'card') {
              delete shadowCards[cleanId];
              Object.keys(shadowOrderMap).forEach((key) => {
                shadowOrderMap[key] = (shadowOrderMap[key] || []).filter((id) => id.split('-loop-')[0] !== cleanId);
              });
            }
          });
        }

        payload.delta?.cards?.forEach((c: any) => {
          if (!c?._id) return;
          const cleanId = c._id.split('-loop-')[0];
          if (isEntityDeletedInSQLite(activeUserId, 'card', cleanId) || isDirty(cleanId) || shadowCards[cleanId]?.dirty) return;
          const localTime = new Date(shadowCards[cleanId]?.updatedAt || 0).getTime();
          const remoteTime = new Date(c.updatedAt || 0).getTime();
          if (!shadowCards[cleanId] || remoteTime > localTime) {
            shadowCards[cleanId] = { ...shadowCards[cleanId], ...c };
          }
        });

        payload.delta?.folders?.forEach((f: any) => {
          if (!f?._id) return;
          if (isEntityDeletedInSQLite(activeUserId, 'folder', f._id) || isDirty(f._id) || shadowFolders[f._id]?.dirty) return;
          const localTime = new Date(shadowFolders[f._id]?.updatedAt || 0).getTime();
          const remoteTime = new Date(f.updatedAt || 0).getTime();
          if (!shadowFolders[f._id] || remoteTime > localTime) {
            shadowFolders[f._id] = { ...shadowFolders[f._id], ...f };
          }
        });

        payload.delta?.playlists?.forEach((p: any) => {
          if (!p?._id) return;
          if (isEntityDeletedInSQLite(activeUserId, 'playlist', p._id) || isDirty(p._id) || shadowPlaylists[p._id]?.dirty) return;
          const cardIds = (p.cardIds || p.orderedCardIds || []).map((id: string) => id.split('-loop-')[0]).filter(Boolean);
          const localTime = new Date((shadowPlaylists[p._id] as any)?.updatedAt || 0).getTime();
          const remoteTime = new Date(p.updatedAt || 0).getTime();

          if (!shadowPlaylists[p._id] || remoteTime > localTime) {
            shadowPlaylists[p._id] = { ...shadowPlaylists[p._id], ...p, cardIds, orderedCardIds: cardIds };
            shadowOrderMap[p._id] = cardIds;
          }
        });

        // Map playlist collections
        Object.values(shadowPlaylists).forEach((p: any) => {
          if (!p?._id) return;
          const cardIds = p.cardIds || p.orderedCardIds || [];
          shadowOrderMap[p._id] = cardIds.map((id: string) => id.split('-loop-')[0]).filter(Boolean);
        });

        // 100% Data Preservation: Merge optimistic clicks currently enqueued in the actions queue
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
          } else if (act === 'CREATE_PLAYLIST' && pl.tempId) {
            // Restore newly created playlist that hasn't synced yet
            const pId = pl.tempId;
            const existing = freshState.playlistsById[pId];
            if (existing) {
              shadowPlaylists[pId] = existing;
              if (!shadowOrderMap[pId]) shadowOrderMap[pId] = freshState.playlistCardOrderMap[pId] || [];
            }
          } else if (act === 'DELETE_PLAYLIST' && pl.playlistId) {
            // Re-apply pending deletion
            delete shadowPlaylists[pl.playlistId];
            delete shadowOrderMap[pl.playlistId];
          } else if (act === 'CREATE_FOLDER' && pl.tempId) {
            const fId = pl.tempId;
            if (freshState.foldersById[fId]) {
              shadowFolders[fId] = freshState.foldersById[fId];
            }
          } else if (act === 'DELETE_FOLDER' && pl.folderId) {
            delete shadowFolders[pl.folderId];
          } else if (act === 'UPDATE_PLAYLIST' && pl.playlistId) {
            if (shadowPlaylists[pl.playlistId] && pl.name) {
               shadowPlaylists[pl.playlistId].name = pl.name;
            }
          }
        });

        if ((global as any).__syncAborted) {
          if (__DEV__) console.log('[Sync Engine] Cancellation: Aborting full resync SQLite and state writes.');
          return;
        }

        // Resolves Loophole: Session Generation Guard against zombie hydration leakage
        if (useAuthStore.getState().sessionGenerationId !== currentGenerationId) {
           console.error('[Sync Engine] Zombie Hydration Blocked! The session shifted while resyncing.');
           return;
        }

        // Rebuild cardDifficultyMap from server questionProgress to restore focus area classifications
        const shadowDifficultyMap: Record<string, any> = { ...freshState.cardDifficultyMap };
        const questionProgress = payload.delta?.questionProgress || [];
        if (questionProgress.length > 0) {
          questionProgress.forEach((qp: any) => {
            if (!qp || !qp.questionId) return;
            const cleanQId = String(qp.questionId).split('-loop-')[0];
            const difficulty = qp.attemptStatus === 'skipped' ? 'skipped' : qp.perceivedDifficultyByUser;
            if (difficulty) {
              shadowDifficultyMap[cleanQId] = {
                difficulty,
                originalDifficulty: difficulty,
                updatedAt: new Date(qp.updatedAt || 0).getTime(),
                optimistic: false,
              };
            } else {
              delete shadowDifficultyMap[cleanQId];
            }
          });
          console.log(`[Shadow Cache Swap] Hydrated cardDifficultyMap from ${questionProgress.length} server classifications.`);
        }

        // FIX 3: Mirror the delta.progress merge that syncManager.sync() does
        const deltaProgress = payload.delta?.progress || [];
        if (deltaProgress.length > 0) {
          deltaProgress.forEach((p: any) => {
            if (!p || !p.revisionCardId) return;
            const cardId = p.revisionCardId.toString();
            if (shadowCards[cardId]) {
              const existingLoops = (shadowCards[cardId].currentUserQuestionProgress as any)?.completedLoops || 0;
              const serverLoops = p.completedLoops || 0;
              shadowCards[cardId] = {
                ...shadowCards[cardId],
                difficultyState: p.difficultyState ?? shadowCards[cardId].difficultyState,
                isFavorite: p.favorite ?? shadowCards[cardId].isFavorite,
                currentUserQuestionProgress: {
                  attemptStatus: p.completed ? 'attempted' : 'skipped',
                  perceivedDifficultyByUser: null,
                  completedLoops: Math.max(existingLoops, serverLoops),
                } as any,
              };
              // Keep shadowDifficultyMap consistent with progress data
              if (p.difficultyState && !shadowDifficultyMap[cardId]?.optimistic) {
                shadowDifficultyMap[cardId] = {
                  difficulty: p.difficultyState,
                  originalDifficulty: p.difficultyState,
                  updatedAt: new Date(p.updatedAt || 0).getTime(),
                  optimistic: false,
                };
              }
            }
          });
          console.log(`[Shadow Cache Swap] Merged ${deltaProgress.length} progress entries into cards.`);
        }

        // FIX 1: Stamp difficultyState from shadowDifficultyMap onto card objects before SQLite save
        Object.entries(shadowDifficultyMap).forEach(([cardId, diffEntry]) => {
          if (shadowCards[cardId] && diffEntry?.difficulty) {
            shadowCards[cardId] = {
              ...shadowCards[cardId],
              difficultyState: diffEntry.difficulty,
            };
          }
        });

        // Persist to SQLite canonical storage (AFTER all stamps are applied)
        try {
          saveCardsToSQLite(Object.values(shadowCards), activeUserId);
          saveFoldersToSQLite(Object.values(shadowFolders), activeUserId);
          savePlaylistsToSQLite(Object.values(shadowPlaylists), activeUserId);

          // Durably update sync cursor in SQLite so we don't re-download full catalog on next launch
          const { getDatabase } = require('@/utils/sqliteDatabase');
          const db = getDatabase();
          db.runSync(
            `INSERT INTO sync_cursors (userId, lastPulledRevision, updatedAt) VALUES (?, ?, ?)
             ON CONFLICT(userId) DO UPDATE SET lastPulledRevision=excluded.lastPulledRevision, updatedAt=excluded.updatedAt;`,
            [activeUserId, payload.toRevision || payload.currentRevision || 0, Date.now()]
          );
        } catch (sqlErr: any) {
          console.error('[SQLite Sync Engine Error] Full resync SQLite persistence failed:', sqlErr.message);
        }

        // Swap caches instantly in a single React tick!
        usePlaylistStateStore.setState({
          cardsById: shadowCards,
          foldersById: shadowFolders,
          playlistsById: shadowPlaylists,
          playlistCardOrderMap: shadowOrderMap,
          cardDifficultyMap: shadowDifficultyMap,
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
      triggerBackgroundSyncRef.current?.(false);
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
        const activeUserId = useAuthStore.getState().user?.id || 'guest-user';
        
        const existingCards = state.cardsById || {};
        const existingFolders = state.foldersById || {};
        const existingPlaylists = state.playlistsById || {};
        const existingOrderMap = state.playlistCardOrderMap || {};

        const nextCards = { ...existingCards };
        const nextFolders = { ...existingFolders };
        const nextPlaylists = { ...existingPlaylists };
        const nextOrderMap = { ...existingOrderMap };

        offlineSeed.folders.forEach((f: any) => {
          if (isEntityDeletedInSQLite(activeUserId, 'folder', f._id)) return;
          nextFolders[f._id] = f;
        });

        offlineSeed.playlists.forEach((p: any) => {
          if (isEntityDeletedInSQLite(activeUserId, 'playlist', p._id)) return;
          nextPlaylists[p._id] = p;
          if (!nextOrderMap[p._id]) {
            nextOrderMap[p._id] = (p.cardIds || [])
              .filter((id: string) => !isEntityDeletedInSQLite(activeUserId, 'card', id));
          }
        });

        offlineSeed.revisionCards.forEach((c: any) => {
          if (isEntityDeletedInSQLite(activeUserId, 'card', c._id)) return;
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

        const allCardIds = offlineSeed.revisionCards
          .map((c: any) => c._id)
          .filter((id: string) => !isEntityDeletedInSQLite(activeUserId, 'card', id));
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

        if ((global as any).__syncAborted) {
          if (__DEV__) console.log('[Sync Engine] Cancellation: Aborting local seeding SQLite and state writes.');
          return;
        }

        // Persist local seed values to SQLite canonical storage
        try {
          saveCardsToSQLite(Object.values(nextCards), activeUserId);
          saveFoldersToSQLite(Object.values(nextFolders), activeUserId);
          savePlaylistsToSQLite(Object.values(nextPlaylists), activeUserId);
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
          try {
            const freshState = usePlaylistStateStore.getState();
            const isFreshSession = !freshState.lastSyncedRevision || freshState.lastSyncedRevision === 0;
            if (isFreshSession) {
              if (__DEV__) console.log('[Sync Engine] Fresh authenticated session. Executing Full Resync...');
              isSyncInFlight.current = false;
              await executeFullResync(false);
            } else {
              const { syncManager } = require('../utils/syncManager');
              await syncManager.sync(force);
            }

            // --- SYNC SWIPE & SCROLL ANALYTICS ---
            const trackingStore = require('../store/useTrackingStore').useTrackingStore;
            const trackingState = trackingStore.getState();
            const unsyncedSwipes = trackingState.unsyncedSwipes || 0;
            const unsyncedScrolls = trackingState.unsyncedScrolls || 0;
            // Sync if there are unsynced metrics OR if local totals are uninitialized (fresh install / new device pull)
            if (unsyncedSwipes > 0 || unsyncedScrolls > 0 || (trackingState.totalSwipes === 0 && trackingState.totalScrolls === 0)) {
              if (__DEV__) console.log(`[Sync Engine] Syncing absolute analytics totals... Swipes: ${trackingState.totalSwipes}, Scrolls: ${trackingState.totalScrolls}`);
              try {
                const response = await api.post('/progress/sync-analytics', {
                  swipes: trackingState.totalSwipes,
                  scrolls: trackingState.totalScrolls,
                });
                const result = response.data?.data?.result || response.data?.result;
                if (result) {
                  const activeUserId = useAuthStore.getState().user?.id || 'guest-user';
                  const nextMetrics = {
                    totalSwipes: result.totalSwipes || 0,
                    totalScrolls: result.totalScrolls || 0,
                    unsyncedSwipes: 0,
                    unsyncedScrolls: 0,
                  };
                  
                  // Update SQLite & Zustand instantly
                  const { saveUserMetricsToSQLite } = require('../utils/sqliteSyncBridge');
                  saveUserMetricsToSQLite(activeUserId, nextMetrics);
                  trackingStore.getState().setMetrics(nextMetrics);
                  
                  if (__DEV__) console.log('[Sync Engine] Absolute analytics totals successfully synced and aggregated.');
                }
              } catch (analyticsErr: any) {
                console.warn('[Sync Engine] Failed to sync absolute analytics totals:', analyticsErr.message);
              }
            }
          } catch (syncErr: any) {
            console.warn('[Sync Hook] Manager sync cycle error:', syncErr.message);
            incrementSyncFailure();
            scheduleRetry();
          }
        }
      }

      setTimeout(() => {
        setSyncStatus('synced');
        usePlaylistStateStore.setState({ hasSyncedThisSession: true });
        resetSyncFailure();
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      }, 500);

    } catch (err) {
      console.error('[Offline Sync] Background sync cycle aborted:', err);
      setBootstrapStatus('failed');
      setSyncStatus('offline');
      incrementSyncFailure();
      scheduleRetry();
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

  const syncTriggerCount = usePlaylistStateStore((s) => s.syncTriggerCount);

  useEffect(() => {
    if (syncTriggerCount > 0) {
      if (__DEV__) console.log('[Sync Engine] Manual sync trigger received. Flushing...');
      triggerBackgroundSyncRef.current?.(true);
    }
  }, [syncTriggerCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (__DEV__) console.log('[Sync Engine] App entering foreground. Triggering opportunistic sync...');
        triggerBackgroundSyncRef.current?.(false);
      } else if (appStateRef.current === 'active' && nextAppState !== 'active') {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        // Eagerly trigger full background sync (playlists, folders, and analytics) when the app closes or goes to background
        if (__DEV__) console.log('[Sync Engine] App closing / suspending. Triggering full background sync flush...');
        triggerBackgroundSyncRef.current?.(false);
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
        triggerBackgroundSyncRef.current?.(false);
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
        triggerBackgroundSyncRef.current?.(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, isAuthReady]);

  return { triggerBackgroundSync, validateEntityIntegrity, executeFullResync };
}

/**
 * Fast synchronous-like standalone absolute metrics sync for App Close, Suspend, and Logout.
 * Only fires a sync call if there are unsynced changes to push.
 */
export async function syncAnalyticsOnly(): Promise<void> {
  const auth = useAuthStore.getState();
  const activeUserId = auth.user?.id;
  if (!activeUserId || activeUserId === 'guest-user' || !auth.isAuthenticated) return;

  const trackingStore = require('../store/useTrackingStore').useTrackingStore;
  const trackingState = trackingStore.getState();
  const unsyncedSwipes = trackingState.unsyncedSwipes || 0;
  const unsyncedScrolls = trackingState.unsyncedScrolls || 0;

  if (unsyncedSwipes > 0 || unsyncedScrolls > 0) {
    if (__DEV__) console.log(`[Sync Engine] Standalone absolute metrics sync triggered... Swipes: ${trackingState.totalSwipes}, Scrolls: ${trackingState.totalScrolls}`);
    try {
      const response = await api.post('/progress/sync-analytics', {
        swipes: trackingState.totalSwipes,
        scrolls: trackingState.totalScrolls,
      });
      const result = response.data?.data?.result || response.data?.result;
      if (result) {
        const nextMetrics = {
          totalSwipes: result.totalSwipes || 0,
          totalScrolls: result.totalScrolls || 0,
          unsyncedSwipes: 0,
          unsyncedScrolls: 0,
        };
        const { saveUserMetricsToSQLite } = require('../utils/sqliteSyncBridge');
        saveUserMetricsToSQLite(activeUserId, nextMetrics);
        trackingStore.getState().setMetrics(nextMetrics);
        if (__DEV__) console.log('[Sync Engine] Standalone absolute metrics sync succeeded.');
      }
    } catch (err: any) {
      console.warn('[Sync Engine] Standalone absolute metrics sync failed:', err.message);
      throw err; // Propagate to let caller handle timeout or retry if needed
    }
  }
}
