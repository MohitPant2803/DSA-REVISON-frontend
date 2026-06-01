/**
 * PROFILING HOOKS FOR PERFORMANCE MEASUREMENT
 * 
 * Usage:
 *   - useProfileMount('ComponentName') - measure component mount time
 *   - useProfileFocus('ScreenName') - measure focus/blur cycle
 *   - profileQuery(queryKey, duration) - log query timings
 */

import { useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { perfProfiler } from './performanceProfiler';

export function useProfileMount(componentName: string) {
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      perfProfiler.profileMount(componentName);
      mounted.current = true;

      return () => {
        perfProfiler.profileMountEnd(componentName);
      };
    }
  }, [componentName]);
}

export function useProfileFocus(screenName: string) {
  useFocusEffect(() => {
    perfProfiler.profileFocusStart(screenName);

    return () => {
      perfProfiler.profileFocusEnd(screenName);
    };
  });
}

export function profileQuery(queryKey: string | string[], duration: number) {
  const key = Array.isArray(queryKey) ? queryKey.join('/') : queryKey;
  perfProfiler.profileQueryEvaluation(key, duration);
}

export function logPerformanceReport() {
  const report = perfProfiler.getReport();
  console.log('=== PERFORMANCE REPORT ===', report);
  return report;
}
