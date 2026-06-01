/**
 * @file High-performance, production-safe profiling utility.
 * Logs warnings if synchronous execution blocks the JavaScript thread.
 */

const DEFAULT_SLOW_THRESHOLD_MS = 16; // 1 frame (16.6ms at 60Hz)
const VISIBLE_STUTTER_THRESHOLD_MS = 50; // Visible lag block

const activeProfiles = new Map<string, number>();

export const profiler = {
  /**
   * Starts a named profile session.
   */
  start(label: string): void {
    if (__DEV__) {
      activeProfiles.set(label, performance.now());
    }
  },

  /**
   * Ends a named profile session and returns elapsed time.
   * Warns if it exceeds the slow threshold.
   */
  end(label: string, slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS): number {
    if (!__DEV__) return 0;

    const startTime = activeProfiles.get(label);
    if (startTime === undefined) {
      return 0;
    }

    activeProfiles.delete(label);
    const duration = performance.now() - startTime;

    if (duration > VISIBLE_STUTTER_THRESHOLD_MS) {
      console.warn(
        `🚨 [PROFILER] VISIBLE STUTTER: "${label}" took ${duration.toFixed(2)}ms! (Limit: ${VISIBLE_STUTTER_THRESHOLD_MS}ms) - Blocks main UI thread.`
      );
    } else if (duration > slowThresholdMs) {
      console.warn(
        `⚠️ [PROFILER] SLOW OPERATION: "${label}" took ${duration.toFixed(2)}ms. (Limit: ${slowThresholdMs}ms)`
      );
    }

    return duration;
  },

  /**
   * Runs an asynchronous callback and profiles its duration.
   */
  async profileAsync<T>(
    label: string,
    callback: () => Promise<T>,
    slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
  ): Promise<T> {
    const start = performance.now();
    try {
      return await callback();
    } finally {
      const duration = performance.now() - start;
      if (duration > VISIBLE_STUTTER_THRESHOLD_MS) {
        console.warn(
          `🚨 [PROFILER] VISIBLE STUTTER (Async): "${label}" took ${duration.toFixed(2)}ms! (Limit: ${VISIBLE_STUTTER_THRESHOLD_MS}ms)`
        );
      } else if (duration > slowThresholdMs) {
        console.warn(
          `⚠️ [PROFILER] SLOW OPERATION (Async): "${label}" took ${duration.toFixed(2)}ms. (Limit: ${slowThresholdMs}ms)`
        );
      }
    }
  },

  /**
   * Runs a synchronous callback and profiles its duration.
   */
  profileSync<T>(
    label: string,
    callback: () => T,
    slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
  ): T {
    const start = performance.now();
    try {
      return callback();
    } finally {
      const duration = performance.now() - start;
      if (duration > VISIBLE_STUTTER_THRESHOLD_MS) {
        console.warn(
          `🚨 [PROFILER] VISIBLE STUTTER (Sync): "${label}" took ${duration.toFixed(2)}ms! (Limit: ${VISIBLE_STUTTER_THRESHOLD_MS}ms)`
        );
      } else if (duration > slowThresholdMs) {
        console.warn(
          `⚠️ [PROFILER] SLOW OPERATION (Sync): "${label}" took ${duration.toFixed(2)}ms. (Limit: ${slowThresholdMs}ms)`
        );
      }
    }
  },
};
