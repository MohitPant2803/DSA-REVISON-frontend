import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { usePlaylistStateStore, OfflineAction } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncTelemetry } from '@/utils/syncTelemetry';
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
function mergeEntityState<T extends { _id: string; updatedAt?: string | number }>(
  local: T | undefined,
  server: T,
  isDirty: boolean
): T {
  if (!local) return server;
  if (isDirty) return local; // Local optimistic changes win
  
  const localTime = new Date(local.updatedAt || 0).getTime();
  const serverTime = new Date(server.updatedAt || 0).getTime();
  return serverTime > localTime ? server : local;
}

export function useSyncEngine() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentDelayRef = useRef<number>(2000); // Start backoff retry delay at 2s

  const isSyncInFlight = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const syncingStartedAtRef = useRef<number>(0);

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
  } = usePlaylistStateStore();

  // Sweep and resolve entity relationship integrity
  const validateEntityIntegrity = useCallback(() => {
    const state = usePlaylistStateStore.getState();
    const cardsById = state.cardsById;
    const playlistsById = { ...state.playlistsById };
    const foldersById = { ...state.foldersById };
    const orderMap = { ...state.playlistCardOrderMap };

    let repaired = false;
    const startTime = performance.now();

    // 1. Verify Playlist Reference Integrity
    Object.keys(playlistsById).forEach((pId) => {
      const playlist = playlistsById[pId];
      if (!playlist) return;

      const rawIds = playlist.cardIds || playlist.orderedCardIds || [];
      const validIds = rawIds.filter((id) => cardsById[id] !== undefined);

      if (rawIds.length !== validIds.length) {
        if (__DEV__) {
          console.warn(`[Integrity Check] Playlist "${playlist.name}" (${pId}) had ${rawIds.length - validIds.length} broken card references. Repairing...`);
        }
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
      const validIds = rawIds.filter((id) => cardsById[id] !== undefined);

      if (rawIds.length !== validIds.length) {
        if (__DEV__) {
          console.warn(`[Integrity Check] Folder "${folder.title}" (${fId}) had ${rawIds.length - validIds.length} broken card references. Repairing...`);
        }
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
      const validIds = rawIds.filter((id) => cardsById[id] !== undefined);
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

  const triggerBackgroundSync = useCallback(async () => {
    // 1. Enforce the isAuthReady gate check
    if (!isAuthenticated || !isAuthReady) return;

    // 2. Request Deduplication & Coalescing (prevent parallel sweeps)
    if (isSyncInFlight.current) return;

    // 3. Stop syncing if app is backgrounded
    if (appStateRef.current !== 'active') return;

    isSyncInFlight.current = true;
    syncTelemetry.logSyncStart(offlineActionQueue.length);

    // Immediate Connectivity Check via NetInfo cached connectivity
    const netState = await NetInfo.fetch();
    if (netState.isConnected === false) {
      setSyncStatus('offline');
      isSyncInFlight.current = false;
      return;
    }

    setSyncStatus('syncing');
    syncingStartedAtRef.current = Date.now();

    const startTime = performance.now();

    try {
      // Update bootstrap lifecycle to in_progress if starting cold
      if (bootstrapStatus === 'not_started' || bootstrapStatus === 'failed') {
        setBootstrapStatus('in_progress');
      }

      // A. Process and upload offline enqueued mutations sequentially (Idempotent replay)
      if (offlineActionQueue.length > 0) {
        await api.post('/sync/actions', { actions: offlineActionQueue });
        clearOfflineActions();
      }

      // B. Perform delta fetch from server
      const sinceParam = lastSyncedAt ? encodeURIComponent(lastSyncedAt) : '';
      const response = await api.get(`/sync?since=${sinceParam}`);
      const payload = response.data?.data;

      let cardsCount = 0;
      let foldersCount = 0;
      let playlistsCount = 0;

      if (payload) {
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

        const state = usePlaylistStateStore.getState();
        const activeQueue = state.offlineActionQueue;

        // Process Cards Delta
        if (cards.length > 0) {
          hydratePlaylistCards('all', cards);
        }

        // Process Folders Delta with Optimistic Merger
        if (folders.length > 0) {
          const mergedFolders: IFolder[] = folders.map((serverFolder: IFolder) => {
            const isDirty = isEntityDirty(activeQueue, serverFolder._id);
            const localFolder = state.foldersById[serverFolder._id];
            return mergeEntityState(localFolder, serverFolder, isDirty);
          });
          hydrateFolders(mergedFolders);
        }

        // Process Playlists Delta with Optimistic Merger
        if (playlists.length > 0) {
          const mergedPlaylists: ApiPlaylist[] = playlists.map((serverPlaylist: ApiPlaylist) => {
            const isDirty = isEntityDirty(activeQueue, serverPlaylist._id);
            const localPlaylist = state.playlistsById[serverPlaylist._id];
            return mergeEntityState(localPlaylist, serverPlaylist, isDirty);
          });
          hydratePlaylists(mergedPlaylists);

          playlists.forEach((p: any) => {
            if (!['easy', 'medium', 'hard', 'skipped'].includes(p._id)) {
              state.hydrateCustomPlaylistOrder(p._id, p.cardIds || p.orderedCardIds || []);
            }
          });
        }

        // Process rated card question states
        questionProgress.forEach((qp: any) => {
          const cardId = qp.questionId;
          const cardState = qp.attemptStatus === 'skipped' ? 'skipped' : qp.perceivedDifficultyByUser;
          if (cardId && cardState) {
            state.transferCard(cardId, {} as any, cardState, false);
          }
        });

        // Process Favorites / Likes
        progress.forEach((pr: any) => {
          const cardId = pr.revisionCardId;
          if (cardId && pr.favorite !== undefined) {
            state.toggleFavoriteInStore(cardId, pr.favorite);
          }
        });

        // Save last sync checkpoints
        setLastSyncedAt(payload.timestamp);
        setLastSuccessfulSyncAt(Date.now());
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

      syncTelemetry.logSyncSuccess(performance.now() - startTime, offlineActionQueue.length, {
        cards: cardsCount,
        folders: foldersCount,
        playlists: playlistsCount,
      });

    } catch (error) {
      incrementSyncFailure();
      syncTelemetry.logSyncFailure(error, syncFailureCount + 1);

      // Transition bootstrap status to failed if first bootstrap attempt crashes
      if (bootstrapStatus === 'in_progress') {
        setBootstrapStatus('failed');
      }

      // Safe silent backoff retry scheduler
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        triggerBackgroundSync();
      }, currentDelayRef.current);

      // Increase delay exponentially, capped at 60s
      currentDelayRef.current = Math.min(60000, currentDelayRef.current * 2);
    } finally {
      isSyncInFlight.current = false;
    }
  }, [
    isAuthenticated,
    isAuthReady,
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
    validateEntityIntegrity,
    setSyncStatus,
  ]);

  // AppState change listener: pause background retry backoffs
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current === 'active' && nextAppState !== 'active') {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        console.log('[Sync Engine] App backgrounded. Paused background retry backoffs.');
      } else if (appStateRef.current !== 'active' && nextAppState === 'active') {
        console.log('[Sync Engine] App activated. Triggering sync.');
        triggerBackgroundSync();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [triggerBackgroundSync]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAuthenticated && isAuthReady) {
      // Initial trigger 2 seconds after startup
      timer = setTimeout(() => {
        triggerBackgroundSync();
      }, 2000);
    }

    // Silent periodic synchronization sweep every 60 seconds
    const interval = setInterval(() => {
      triggerBackgroundSync();
    }, 60000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [isAuthenticated, isAuthReady, triggerBackgroundSync]);

  return { triggerBackgroundSync, validateEntityIntegrity };
}
