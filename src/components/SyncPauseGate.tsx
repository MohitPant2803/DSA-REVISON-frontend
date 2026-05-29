import { useEffect } from 'react';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';

/**
 * Zero-render component that pauses sync when mounted
 * and resumes sync on unmount. Place inside any interaction zone screen.
 * This directly sets the isLiveSyncPaused state in the Zustand store.
 * Because it has no selectors, it is a pure zero-render component that
 * never rerenders, completely preventing recursive update crashes.
 */
export function SyncPauseGate() {
  useEffect(() => {
    usePlaylistStateStore.getState().setLiveSyncPaused(true);
    return () => {
      usePlaylistStateStore.getState().setLiveSyncPaused(false);
    };
  }, []);

  return null; // Zero render — no DOM output
}
