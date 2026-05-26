import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';

/**
 * Zero-render component that pauses sync when mounted/focused
 * and resumes sync on blur. Place inside any interaction zone screen.
 * This isolates the Zustand subscription from the parent component tree,
 * preventing unnecessary rerenders of heavy screen components.
 */
export function SyncPauseGate() {
  const pauseSyncGate = usePlaylistStateStore((s) => s.pauseSyncGate);
  const resumeSyncGate = usePlaylistStateStore((s) => s.resumeSyncGate);

  useFocusEffect(
    useCallback(() => {
      pauseSyncGate?.();
      return () => {
        resumeSyncGate?.();
      };
    }, [pauseSyncGate, resumeSyncGate])
  );

  return null; // Zero render — no DOM output
}
