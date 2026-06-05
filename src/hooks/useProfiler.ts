/**
 * PROFILING HOOKS FOR PERFORMANCE MEASUREMENT
 * 
 * Usage:
 *   - useProfileMount('ComponentName') - measure component mount time
 *   - useProfileFocus('ScreenName') - measure focus/blur cycle
 *   - profileQuery(queryKey, duration) - log query timings
 */

import { perfProfiler } from '@/utils/performanceProfiler';

export function profileQuery(queryKey: string | string[], duration: number) {
  const key = Array.isArray(queryKey) ? queryKey.join('/') : queryKey;
  perfProfiler.profileQueryEvaluation(key, duration);
}

export function logPerformanceReport() {
  const report = perfProfiler.getReport();
  console.log('=== PERFORMANCE REPORT ===', report);
  return report;
}
