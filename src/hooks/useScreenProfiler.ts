/**
 * useScreenProfiler — Drop-in hook for hard screen timing numbers.
 *
 * Usage:  useScreenProfiler('Reels');   // one line, no JSX changes
 *
 * Measures:
 *   • Mount Time        — component render → useEffect fires
 *   • First Paint       — component render → next rAF callback
 *   • Time-to-Interactive — component render → InteractionManager done
 *   • Nav Transition    — transitionStart → transitionEnd (stack screens)
 *
 * All data feeds into __PERF_TIMING__.printReport().
 * Hooks always run (React rules-safe); internals no-op in production.
 */

import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useNavigation } from 'expo-router';
import ScreenTimingProfiler from '@/utils/screenTimingProfiler';

export function useScreenProfiler(screenName: string): void {
  const profiler = __DEV__ ? ScreenTimingProfiler.getInstance() : null;
  const renderStart = useRef(__DEV__ ? performance.now() : 0);
  const navigation = useNavigation();

  // ── Mount Time + First Paint + TTI ────────────────────────────
  useEffect(() => {
    if (!profiler) return;

    // Mount time: render start → first useEffect callback
    const mountTime = performance.now() - renderStart.current;
    profiler.record(screenName, 'mount', mountTime);

    // First paint: render start → next animation frame
    requestAnimationFrame(() => {
      const paintTime = performance.now() - renderStart.current;
      profiler.record(screenName, 'first_paint', paintTime);
    });

    // Time to interactive: render start → all pending interactions done
    const handle = InteractionManager.runAfterInteractions(() => {
      const tti = performance.now() - renderStart.current;
      profiler.record(screenName, 'tti', tti);
    });

    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Navigation transition timing (stack screens only) ─────────
  useEffect(() => {
    if (!profiler || !navigation) return;

    let unsubStart: (() => void) | undefined;
    let unsubEnd: (() => void) | undefined;

    try {
      unsubStart = navigation.addListener('transitionStart' as any, () => {
        profiler.markTransitionStart(screenName);
      });
      unsubEnd = navigation.addListener('transitionEnd' as any, () => {
        profiler.markTransitionEnd(screenName, screenName);
      });
    } catch {
      // Tab navigators don't emit transition events — silently skip
    }

    return () => {
      unsubStart?.();
      unsubEnd?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, screenName]);
}
