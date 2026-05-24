import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';

export function useSyncEngine() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const {
    offlineActionQueue,
    clearOfflineActions,
    lastSyncedAt,
    setLastSyncedAt,
    hydratePlaylistCards,
    hydrateCustomPlaylistOrder,
  } = usePlaylistStateStore();

  const triggerBackgroundSync = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      console.log('[Sync Engine] Starting background sync check...');
      
      // 1. Process and upload any pending offline actions in the queue
      if (offlineActionQueue.length > 0) {
        console.log(`[Sync Engine] Uploading ${offlineActionQueue.length} offline actions...`);
        await api.post('/sync/actions', { actions: offlineActionQueue });
        clearOfflineActions();
        console.log('[Sync Engine] Offline queue successfully cleared on server.');
      }

      // 2. Fetch delta changes from the server since the lastSync timestamp
      const sinceParam = lastSyncedAt ? encodeURIComponent(lastSyncedAt) : '';
      const response = await api.get(`/sync?since=${sinceParam}`);
      const payload = response.data?.data;

      if (payload) {
        console.log('[Sync Engine] Received delta sync payload:', payload);

        const { cards = [], playlists = [], questionProgress = [], progress = [] } = payload.delta || {};

        // Hydrate all new/changed cards in Zustand
        if (cards.length > 0) {
          hydratePlaylistCards('all', cards);
        }

        // Hydrate playlist orders and custom properties
        playlists.forEach((p: any) => {
          if (!['easy', 'medium', 'hard', 'skipped'].includes(p._id)) {
            hydrateCustomPlaylistOrder(p._id, p.cardIds || p.orderedCardIds || []);
          }
        });

        // Hydrate smart playlist rated card states
        questionProgress.forEach((qp: any) => {
          const cardId = qp.questionId;
          const state = qp.attemptStatus === 'skipped' ? 'skipped' : qp.perceivedDifficultyByUser;
          if (cardId && state) {
            usePlaylistStateStore.getState().transferCard(cardId, {} as any, state);
          }
        });

        // Hydrate likes/favorites
        progress.forEach((pr: any) => {
          const cardId = pr.revisionCardId;
          if (cardId && pr.favorite !== undefined) {
            usePlaylistStateStore.getState().toggleFavoriteInStore(cardId, pr.favorite);
          }
        });

        // Record the new synced timestamp
        setLastSyncedAt(payload.timestamp);

        // Invalidate React Query pools to trigger local UI updates
        queryClient.invalidateQueries({ queryKey: ['playlists'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        queryClient.invalidateQueries({ queryKey: ['personalLibrary'] });
        console.log('[Sync Engine] Synchronization completed successfully!');
      }
    } catch (error) {
      console.warn('[Sync Engine Background Skip] Connection offline or server queue full. Retrying later.', error);
    }
  }, [
    isAuthenticated,
    offlineActionQueue,
    clearOfflineActions,
    lastSyncedAt,
    setLastSyncedAt,
    hydratePlaylistCards,
    hydrateCustomPlaylistOrder,
    queryClient,
  ]);

  useEffect(() => {
    // 1. Initial trigger on app startup / authentication
    if (isAuthenticated) {
      triggerBackgroundSync();
    }

    // 2. Periodic sync every 60 seconds
    const interval = setInterval(() => {
      if (isAuthenticated) {
        triggerBackgroundSync();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isAuthenticated, triggerBackgroundSync]);

  return { triggerBackgroundSync };
}
