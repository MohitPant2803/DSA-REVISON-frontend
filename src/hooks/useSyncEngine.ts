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
  const currentDelayRef = useRef<number>(2000); // Start backoff retry delay at 2s
  const feedSessionIdRef = useRef<string>(Date.now().toString()); // For server-side idempotency tracking

  const isSyncInFlight = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const syncingStartedAtRef = useRef<number>(0);
  const startupSyncTriggered = useRef(false);

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

  const triggerBackgroundSync = useCallback(async (force?: boolean) => {
    // 1. Enforce the isAuthReady gate check
    if (!isAuthenticated || !isAuthReady) return;

    // Enforce strictly one sync per session (unless forced)
    const state = usePlaylistStateStore.getState();
    if (state.hasSyncedThisSession && !force) {
      if (__DEV__) console.log('[Sync Engine] Already synced this session. Skipping background sync...');
      return;
    }

    // 2. Request Deduplication & Coalescing (prevent parallel sweeps)
    if (isSyncInFlight.current) return;

    // 3. Pause sync check (unless forced via Home screen return)
    if (state.isLiveSyncPaused && !force) {
      if (__DEV__) console.log('[Sync Engine] Live sync is currently paused in interaction zones. Skipping...');
      return;
    }

    // 4. Cooldown protection (no delta sync within 60s unless forced or queue exists)
    const now = Date.now();
    if (!force && state.offlineActionQueue.length === 0 && state.lastSuccessfulSyncAt) {
      const elapsed = now - state.lastSuccessfulSyncAt;
      if (elapsed < 60000) {
        if (__DEV__) console.log(`[Sync Engine] Cooldown active (${Math.round(elapsed / 1000)}s elapsed). Skipping...`);
        return;
      }
    }

    // 5. Stop syncing if app is backgrounded
    if (appStateRef.current !== 'active') return;

    isSyncInFlight.current = true;
    syncTelemetry.logSyncStart(state.offlineActionQueue.length);

    // Immediate Connectivity Check via isNetworkConnected utility
    const isConnected = await isNetworkConnected();
    if (!isConnected) {
      setSyncStatus('offline');
      isSyncInFlight.current = false;
      return;
    }

    setSyncStatus('syncing');
    syncingStartedAtRef.current = Date.now();

    // Delta Sync Swipes & Scrolls to MongoDB
    const { unsyncedSwipes, unsyncedScrolls, clearUnsyncedAnalytics } = useTrackingStore.getState();
    if (unsyncedSwipes > 0 || unsyncedScrolls > 0) {
      try {
        if (__DEV__) console.log('[Sync Engine] Syncing analytics deltas to MongoDB:', { swipes: unsyncedSwipes, scrolls: unsyncedScrolls });
        const res = await api.post('/progress/sync-analytics', { swipes: unsyncedSwipes, scrolls: unsyncedScrolls });
        
        // Update local totals from server response
        const updatedStats = res.data?.data?.result;
        if (updatedStats) {
          useTrackingStore.setState({
            totalSwipes: updatedStats.totalSwipes ?? 0,
            totalScrolls: updatedStats.totalScrolls ?? 0,
          });
        }
        
        clearUnsyncedAnalytics();
        if (__DEV__) console.log('[Sync Engine] Analytics synced successfully.');
      } catch (err) {
        console.error('[Sync Engine] Failed to sync analytics:', err);
      }
    }

    // Capture incremented generation ID for stale snapshot protection
    const activeGen = state.incrementSyncGeneration();

    const startTime = performance.now();
    let cardsCount = 0;
    let foldersCount = 0;
    let playlistsCount = 0;

    try {
      // Pre-sync token validity check (Bug 4)
      const currentToken = useAuthStore.getState().token;
      if (currentToken) {
        try {
          const base64Url = currentToken.split('.')[1];
          const decodeBase64 = (input: string): string => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            const str = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
            let output = '', buffer = 0, bc = 0;
            for (let idx = 0; idx < str.length; idx++) {
              const pos = chars.indexOf(str.charAt(idx));
              if (pos === -1) continue;
              buffer = bc % 4 ? (buffer << 6) + pos : pos;
              if (bc++ % 4) output += String.fromCharCode(255 & (buffer >> ((-2 * bc) & 6)));
            }
            return output;
          };
          const decodedPayload = JSON.parse(decodeBase64(base64Url));
          if (decodedPayload.exp && decodedPayload.exp < Date.now() / 1000) {
            if (__DEV__) console.warn('[SyncEngine] JWT expired. Attempting silent refresh before sync...');
            const refreshed = await useAuthStore.getState().silentTokenRefresh();
            if (!refreshed) {
              if (__DEV__) console.warn('[SyncEngine] Token refresh failed. Aborting sync — user must re-authenticate.');
              currentDelayRef.current = 2000;
              if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
              }
              isSyncInFlight.current = false;
              return;
            }
            if (__DEV__) console.log('[SyncEngine] Token refreshed successfully. Proceeding with sync.');
          }
        } catch (e) {
          // Token decode failed — proceed and let the API call handle it
        }
      }

      // Update bootstrap lifecycle to in_progress if starting cold
      if (bootstrapStatus === 'not_started' || bootstrapStatus === 'failed') {
        setBootstrapStatus('in_progress');
      }

      // High Priority: Process and upload offline enqueued mutations sequentially (Transactional Replay)
      if (state.offlineActionQueue.length > 0) {
        state.compressOfflineQueue();
        const compactedQueue = usePlaylistStateStore.getState().offlineActionQueue;
        
        if (compactedQueue.length > 0) {
          // Extract idempotency keys from queue actions for server-side deduplication (Bug 3)
          const idempotencyKeys = compactedQueue.map((a: any) => a.id);
          const response = await api.post('/sync/actions', {
            actions: compactedQueue,
            idempotencyKeys, // Server should use these to deduplicate CREATE operations
            clientSessionId: feedSessionIdRef.current || Date.now().toString(),
          });
          const { processedIds = [], failedIds = [] } = response.data?.data || {};
          
          if (processedIds.length > 0) {
            state.removeProcessedActions(processedIds);
          }
          if (failedIds.length > 0) {
            state.isolatePoisonActions(failedIds);
          }
        }
      }

      // Medium Priority: Perform delta fetch from server
      const sinceParam = state.lastSyncedAt ? encodeURIComponent(state.lastSyncedAt) : '';
      const response = await api.get(`/sync?since=${sinceParam}`);

      // Proactively sync senior quotes from server to keep local phone cache up-to-date
      try {
        if (__DEV__) console.log('[Sync Engine] Syncing senior quotes from server...');
        const quotesRes = await api.get('/senior-quotes');
        if (quotesRes.data?.success && quotesRes.data?.data && quotesRes.data.data.length > 0) {
          usePlaylistStateStore.getState().setSeniorQuotes(quotesRes.data.data);
          if (__DEV__) console.log(`[Sync Engine] Synced ${quotesRes.data.data.length} senior quotes.`);
        }
      } catch (err) {
        if (__DEV__) console.warn('[Sync Engine] Senior quotes sync failed silently:', err);
      }

      // Stale Snapshot Protection check right at network resolution time!
      const currentState = usePlaylistStateStore.getState();
      if (activeGen !== currentState.syncGenerationId || currentState.isLiveSyncPaused) {
        if (__DEV__) console.log(`[Sync Engine] Stale snapshot discarded. Generation: ${activeGen}. Paused: ${currentState.isLiveSyncPaused}`);
        isSyncInFlight.current = false;
        return;
      }

      const payload = response.data?.data;

      if (payload) {
        const serverDbVersion = payload.dbVersion || 'striver-sde-sheet-v1';
        const currentDbVersion = usePlaylistStateStore.getState().dbVersion;
        
        if (currentDbVersion && serverDbVersion !== currentDbVersion) {
          if (__DEV__) console.warn(`[Sync Engine] DB version mismatch (Server: ${serverDbVersion}, Local: ${currentDbVersion}). Auto-purging stale cache...`);
          
          const localQueue = usePlaylistStateStore.getState().offlineActionQueue;
          usePlaylistStateStore.getState().hardResetStore();
          
          usePlaylistStateStore.setState({
            offlineActionQueue: localQueue,
            dbVersion: serverDbVersion,
            lastSyncedAt: null,
          });
          
          isSyncInFlight.current = false;
          setTimeout(() => {
            triggerBackgroundSync(true);
          }, 100);
          return;
        }

        if (!currentDbVersion) {
          usePlaylistStateStore.setState({ dbVersion: serverDbVersion });
          
          const existingFoldersCount = Object.keys(usePlaylistStateStore.getState().foldersById).length;
          if (existingFoldersCount > 0 && serverDbVersion !== 'striver-sde-sheet-v1') {
            if (__DEV__) console.warn(`[Sync Engine] Existing cache detected without DB version anchor. Purging once to initialize safely under ${serverDbVersion}...`);
            const localQueue = usePlaylistStateStore.getState().offlineActionQueue;
            usePlaylistStateStore.getState().hardResetStore();
            usePlaylistStateStore.setState({
              offlineActionQueue: localQueue,
              dbVersion: serverDbVersion,
              lastSyncedAt: null,
            });
            isSyncInFlight.current = false;
            setTimeout(() => {
              triggerBackgroundSync(true);
            }, 100);
            return;
          }
        }

        const {
          cards = [],
          folders = [],
          playlists = [],
          questionProgress = [],
          progress = [],
        } = payload.delta || {};

        cardsCount = cards.length;
        foldersCount = folders.length;
        playlistsCount = playlists.length;

        const freshState = usePlaylistStateStore.getState();
        const activeQueue = freshState.offlineActionQueue;

        const mergedCards = { ...freshState.cardsById };
        const mergedOrderMap = { ...freshState.playlistCardOrderMap };
        const mergedHydratedPlaylists = { ...freshState.hydratedPlaylists };
        const mergedFolders = { ...freshState.foldersById };
        const mergedPlaylists = { ...freshState.playlistsById };
        const mergedDifficultyMap = { ...freshState.cardDifficultyMap };
        const mergedDeltas = { ...freshState.smartPlaylistDeltaCounts };

        // 1. Process Cards Delta
        if (cards && cards.length > 0) {
          cards.forEach((card: any) => {
            if (!card || !card._id) return;
            const cleanId = card._id.split('-loop-')[0];
            const existingCard = mergedCards[cleanId];
            const local = freshState.cardDifficultyMap[cleanId];
            mergedCards[cleanId] = mergeCardState(local, existingCard, card);
          });

          // Hydrate card order for 'all' playlist
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

        // 2. Process Folders Delta with Optimistic Merger
        if (folders && folders.length > 0) {
          folders.forEach((serverFolder: any) => {
            if (!serverFolder || !serverFolder._id) return;
            const isDirty = isEntityDirty(activeQueue, serverFolder._id);
            const localFolder = freshState.foldersById[serverFolder._id];
            mergedFolders[serverFolder._id] = mergeEntityState(localFolder, serverFolder, isDirty);
          });
        }

        // 3. Process Playlists Delta with Optimistic Merger
        if (playlists && playlists.length > 0) {
          playlists.forEach((serverPlaylist: any) => {
            if (!serverPlaylist || !serverPlaylist._id) return;
            const isDirty = isEntityDirty(activeQueue, serverPlaylist._id);
            
            // Check if there are any pending TOGGLE_PLAYLIST_ITEM or REORDER_PLAYLIST actions for this playlist in the offline queue
            const hasPendingPlaylistAction = activeQueue.some(
              (a) => 
                (a.action === 'TOGGLE_PLAYLIST_ITEM' && a.payload?.playlistId === serverPlaylist._id) ||
                (a.action === 'REORDER_PLAYLIST' && a.payload?.playlistId === serverPlaylist._id)
            );

            const localPlaylist = freshState.playlistsById[serverPlaylist._id];
            mergedPlaylists[serverPlaylist._id] = mergeEntityState(localPlaylist, serverPlaylist, isDirty);

            // Hydrate custom playlist order ONLY if there are no pending local modifications for this playlist!
            if (!['easy', 'medium', 'hard', 'skipped'].includes(serverPlaylist._id)) {
              if (hasPendingPlaylistAction) {
                if (__DEV__) console.log(`[SyncEngine] Skipping server card list for playlist ${serverPlaylist._id} - pending local queue action exists.`);
              } else {
                const cardIds = serverPlaylist.cardIds || serverPlaylist.orderedCardIds || [];
                const cleanIds = cardIds.map((id: string) => id.split('-loop-')[0]).filter(Boolean);
                mergedOrderMap[serverPlaylist._id] = cleanIds;
                mergedHydratedPlaylists[serverPlaylist._id] = true;
              }
            }
          });
        }

        // 4. Process rated card question states (optimistic guard from Phase 1 Bug 3)
        if (questionProgress && questionProgress.length > 0) {
          questionProgress.forEach((qp: any) => {
            const cardId = qp.questionId || qp.cardId || qp.revisionCardId;
            const cardState = qp.perceivedDifficultyByUser || (qp.attemptStatus === 'skipped' ? 'skipped' : null);
            if (cardId && cardState) {
              const cleanId = cardId.split('-loop-')[0];
              const currentLocal = mergedDifficultyMap[cleanId];
              
              if (currentLocal?.optimistic === true) {
                if (__DEV__) console.log(`[SyncEngine] Skipping server state for ${cardId} — active local optimistic override exists.`);
                return; // Preserve user's newer classification
              }

              const oldState = currentLocal !== undefined
                ? currentLocal.difficulty
                : (mergedCards[cleanId]?.difficultyState || null);

              if (oldState === cardState) return;

              if (oldState && ['easy', 'medium', 'hard', 'skipped'].includes(oldState)) {
                mergedDeltas[oldState] = (mergedDeltas[oldState] || 0) - 1;
                if (mergedOrderMap[oldState]) {
                  mergedOrderMap[oldState] = mergedOrderMap[oldState].filter((id) => id !== cleanId);
                }
              }
              if (cardState && ['easy', 'medium', 'hard', 'skipped'].includes(cardState)) {
                mergedDeltas[cardState] = (mergedDeltas[cardState] || 0) + 1;
                const newList = mergedOrderMap[cardState] || [];
                if (!newList.includes(cleanId)) {
                  mergedOrderMap[cardState] = [cleanId, ...newList];
                }
              }

              delete mergedDifficultyMap[cleanId];

              const qpObj = cardState
                ? {
                    attemptStatus: cardState === 'skipped' ? ('skipped' as const) : ('attempted' as const),
                    perceivedDifficultyByUser: cardState === 'skipped' ? null : (cardState as any),
                  }
                : null;

              mergedCards[cleanId] = {
                ...(mergedCards[cleanId] || { _id: cleanId }),
                difficultyState: cardState,
                currentUserQuestionProgress: qpObj,
                dirty: false,
              };
            }
          });
        }

        // 5. Process Favorites / Likes
        if (progress && progress.length > 0) {
          progress.forEach((pr: any) => {
            const cardId = pr.revisionCardId;
            if (cardId) {
              const cleanId = cardId.split('-loop-')[0];
              const queueHasPendingAction = activeQueue.some(
                (a) => (a.payload?.cardId === cleanId) && (a.action === 'TOGGLE_FAVORITE')
              );
              if (queueHasPendingAction) {
                if (__DEV__) console.log(`[SyncEngine] Skipping server favorite state for ${cleanId} — pending queue action exists.`);
                return;
              }
              if (pr.favorite !== undefined) {
                if (mergedCards[cleanId]) {
                  mergedCards[cleanId] = {
                    ...mergedCards[cleanId],
                    isFavorite: pr.favorite,
                  };
                }
                const currentLikes = mergedOrderMap['likes'] || [];
                let newLikes = currentLikes;
                if (pr.favorite) {
                  if (!currentLikes.includes(cleanId)) {
                    newLikes = [cleanId, ...currentLikes];
                  }
                } else {
                  newLikes = currentLikes.filter(id => id !== cleanId);
                }
                mergedOrderMap['likes'] = newLikes;
              }
            }
          });
        }

        // 6. Apply everything in ONE atomic set()
        usePlaylistStateStore.setState({
          cardsById: mergedCards,
          foldersById: mergedFolders,
          playlistsById: mergedPlaylists,
          cardDifficultyMap: mergedDifficultyMap,
          playlistCardOrderMap: mergedOrderMap,
          hydratedPlaylists: mergedHydratedPlaylists,
          smartPlaylistDeltaCounts: mergedDeltas,
          lastSyncedAt: payload.timestamp || new Date().toISOString(),
          lastSuccessfulSyncAt: Date.now(),
          syncStatus: 'synced',
          hasSyncedThisSession: true,
        });

        resetSyncFailure();

        // Verify relationship integrity
        const integrityValid = validateEntityIntegrity();

        if (integrityValid) {
          setBootstrapStatus('completed');
          currentDelayRef.current = 2000; // Reset exponential retry delay on absolute success
        } else {
          setBootstrapStatus('failed');
        }
      }

      // Transition syncStatus to synced safely with min 700ms display filter to avoid rapid layout flickering
      const elapsed = Date.now() - syncingStartedAtRef.current;
      const remaining = Math.max(0, 700 - elapsed);
      setTimeout(() => {
        setSyncStatus('synced');
      }, remaining);

      // Low Priority background updates deferred to run after animations/interactions!
      InteractionManager.runAfterInteractions(() => {
        if (__DEV__) console.log('[Sync Engine] Scheduling low-priority dashboard statistics refresh.');
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      });

      syncTelemetry.logSyncSuccess(performance.now() - startTime, usePlaylistStateStore.getState().offlineActionQueue.length, {
        cards: cardsCount,
        folders: foldersCount,
        playlists: playlistsCount,
      });

    } catch (error: any) {
      // Detect auth failures and stop retrying — the user needs to re-authenticate
      const is401 = error?.status === 401 || error?.response?.status === 401;
      if (is401) {
        console.warn('[SyncEngine] 401 Unauthorized during sync. Stopping retries. User must re-authenticate.');
        // Attempt silent token refresh before giving up
        try {
          const { useAuthStore } = require('@/store/useAuthStore');
          const refreshed = await useAuthStore.getState().silentTokenRefresh();
          if (refreshed) {
            console.log('[SyncEngine] Token refreshed successfully. Will retry on next interval.');
            // Don't schedule immediate retry — let the normal 60s interval pick it up
          }
        } catch (refreshErr) {
          console.warn('[SyncEngine] Silent token refresh failed:', refreshErr);
        }
        // Reset backoff so next legitimate sync attempt starts fresh
        resetSyncFailure();
        currentDelayRef.current = 2000;
        
        isSyncInFlight.current = false;
        return; // DO NOT schedule retry — breaks the infinite loop
      }

      incrementSyncFailure();
      syncTelemetry.logSyncFailure(error, syncFailureCount + 1);

      // Transition bootstrap status to failed if first bootstrap attempt crashes
      if (bootstrapStatus === 'in_progress') {
        setBootstrapStatus('failed');
      }

      // Safe silent backoff retry scheduler cleaned up
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      // Removed automatic background retries to comply with startup-only sync requirement
    } finally {
      isSyncInFlight.current = false;
    }
  }, [
    isAuthenticated,
    isAuthReady,
    bootstrapStatus,
    setBootstrapStatus,
    syncFailureCount,
    incrementSyncFailure,
    resetSyncFailure,
    setLastSuccessfulSyncAt,
    validateEntityIntegrity,
    setSyncStatus,
    hydratePlaylistCards,
    hydrateFolders,
    hydratePlaylists,
    setLastSyncedAt,
    queryClient,
  ]);

  const pendingResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_PAUSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

  const pauseLiveSync = useCallback(() => {
    if (pendingResumeTimeoutRef.current) {
      clearTimeout(pendingResumeTimeoutRef.current);
      pendingResumeTimeoutRef.current = null;
    }
    usePlaylistStateStore.getState().setLiveSyncPaused(true);
    if (__DEV__) console.log('[Sync Engine] Paused live sync status. Pending resumes cancelled.');
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
      if (__DEV__) console.log('[Sync Engine] Resumed live sync status.');
    }, 300);
  }, []);

  // Register the gates on store when hook mounts
  useEffect(() => {
    usePlaylistStateStore.setState({
      pauseSyncGate: pauseLiveSync,
      resumeSyncGate: resumeAndFlush,
    });
    return () => {
      if (pendingResumeTimeoutRef.current) {
        clearTimeout(pendingResumeTimeoutRef.current);
      }
      if (maxPauseTimerRef.current) {
        clearTimeout(maxPauseTimerRef.current); // Clean up safety timer
      }
      usePlaylistStateStore.setState({
        pauseSyncGate: null,
        resumeSyncGate: null,
      });
    };
  }, [pauseLiveSync, resumeAndFlush]);

  // AppState change listener: clean up retry timeout references when backgrounded
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current === 'active' && nextAppState !== 'active') {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        if (__DEV__) console.log('[Sync Engine] App backgrounded. Active delay retries cleared.');
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Reset startup sync tracker if user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      startupSyncTriggered.current = false;
    }
  }, [isAuthenticated]);

  // App Startup / Manual Reset Sync Trigger: Run when authenticated and ready
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const shouldSync = (isAuthenticated && isAuthReady) && (!startupSyncTriggered.current || bootstrapStatus === 'not_started');
    
    if (shouldSync) {
      startupSyncTriggered.current = true;
      if (__DEV__) console.log('[Sync Engine] Triggering sync sweep...');
      timer = setTimeout(() => {
        triggerBackgroundSync(true); // Force to run even if paused/already synced this session
      }, 500); // 500ms delay for state and UI to settle
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, isAuthReady, bootstrapStatus, triggerBackgroundSync]);

  // Listen for network connectivity transitions to perform delayed session sync
  useEffect(() => {
    if (!isAuthenticated || !isAuthReady) return;

    // If already synced this session, do not subscribe to reconnect triggers
    const state = usePlaylistStateStore.getState();
    if (state.hasSyncedThisSession) return;

    if (__DEV__) console.log('[Sync Engine] Subscribing to NetInfo reconnection triggers...');

    const unsubscribe = NetInfo.addEventListener((netState) => {
      const isConnected = netState.isConnected && netState.isInternetReachable !== false;
      const currentState = usePlaylistStateStore.getState();

      if (isConnected && !currentState.hasSyncedThisSession) {
        if (__DEV__) console.log('[Sync Engine] Network transition to ONLINE detected. Syncing...');
        triggerBackgroundSync(true); // force it to run even if paused
      }
    });

    return () => {
      if (__DEV__) console.log('[Sync Engine] Unsubscribing from NetInfo reconnection triggers.');
      unsubscribe();
    };
  }, [isAuthenticated, isAuthReady, triggerBackgroundSync]);

  return { triggerBackgroundSync, validateEntityIntegrity, pauseLiveSync, resumeAndFlush };
}
