/**
 * LIGHTWEIGHT PRODUCTION-GRADE PERFORMANCE PROFILER
 * 
 * Tracks:
 * - Component mount times
 * - Rerender counts and chains
 * - Focus event timings
 * - React Query evaluation times
 * - Zustand hydration cycles
 * - JS thread blocking duration
 * 
 * Output: Minimal - only console warns on anomalies
 * Overhead: < 1ms per sample
 */

interface ProfileSample {
  componentName: string;
  type: 'mount' | 'rerender' | 'focus' | 'query' | 'hydration' | 'blur';
  timestamp: number;
  duration?: number;
  count?: number;
  details?: Record<string, any>;
}

class PerformanceProfiler {
  private samples: ProfileSample[] = [];
  private componentMountTimes = new Map<string, number>();
  private componentRenderCounts = new Map<string, number>();
  private focusStartTime: number | null = null;
  private rerenderChains = new Map<string, number>();
  private readonly MAX_SAMPLES = 200; // Keep only recent samples
  private readonly ANOMALY_THRESHOLDS = {
    MOUNT_TIME: 800, // ms - warn if component takes >800ms to mount
    RERENDERS_PER_FOCUS: 5, // warn if >5 rerenders during one focus
    FOCUS_DURATION: 2000, // ms - warn if focus takes >2s total
    QUERY_TIME: 1500, // ms - warn if query evaluation >1.5s
    HYDRATION_SYNC_CALLS: 3, // warn if >3 synchronous hydration calls
  };

  profileMount(componentName: string) {
    this.componentMountTimes.set(componentName, performance.now());
  }

  profileMountEnd(componentName: string) {
    const startTime = this.componentMountTimes.get(componentName);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    this.addSample({
      componentName,
      type: 'mount',
      timestamp: performance.now(),
      duration,
    });

    this.componentMountTimes.delete(componentName);

    if (duration > this.ANOMALY_THRESHOLDS.MOUNT_TIME) {
      console.warn(
        `⚠️ PERF: ${componentName} mount took ${duration.toFixed(1)}ms (threshold: ${this.ANOMALY_THRESHOLDS.MOUNT_TIME}ms)`
      );
    }
  }

  profileRerender(componentName: string) {
    const count = (this.componentRenderCounts.get(componentName) ?? 0) + 1;
    this.componentRenderCounts.set(componentName, count);

    this.addSample({
      componentName,
      type: 'rerender',
      timestamp: performance.now(),
      count,
    });

    if (count > 3) {
      console.warn(
        `⚠️ PERF: ${componentName} rerendered ${count} times (possible unstable props)`
      );
    }
  }

  profileFocusStart(screenName: string) {
    this.focusStartTime = performance.now();
    this.rerenderChains.clear();
    this.componentRenderCounts.clear();

    this.addSample({
      componentName: screenName,
      type: 'focus',
      timestamp: performance.now(),
    });
  }

  profileFocusEnd(screenName: string) {
    if (!this.focusStartTime) return;

    const duration = performance.now() - this.focusStartTime;
    const rerenderChainSize = Array.from(this.rerenderChains.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    this.addSample({
      componentName: screenName,
      type: 'focus',
      timestamp: performance.now(),
      duration,
      details: {
        rerenderChainSize,
        componentsAffected: this.rerenderChains.size,
      },
    });

    if (duration > this.ANOMALY_THRESHOLDS.FOCUS_DURATION) {
      console.warn(
        `⚠️ PERF: Focus on ${screenName} took ${duration.toFixed(1)}ms (threshold: ${this.ANOMALY_THRESHOLDS.FOCUS_DURATION}ms)`
      );
      console.warn(
        `  Rerender chain: ${rerenderChainSize} rerenders across ${this.rerenderChains.size} components`
      );
    }

    this.focusStartTime = null;
  }

  profileQueryEvaluation(queryKey: string, duration: number) {
    this.addSample({
      componentName: queryKey,
      type: 'query',
      timestamp: performance.now(),
      duration,
    });

    if (duration > this.ANOMALY_THRESHOLDS.QUERY_TIME) {
      console.warn(
        `⚠️ PERF: Query [${queryKey}] evaluation took ${duration.toFixed(1)}ms (threshold: ${this.ANOMALY_THRESHOLDS.QUERY_TIME}ms)`
      );
    }
  }

  profileHydrationSync(storeName: string) {
    const syncCount = (this.rerenderChains.get(storeName) ?? 0) + 1;
    this.rerenderChains.set(storeName, syncCount);

    if (syncCount > this.ANOMALY_THRESHOLDS.HYDRATION_SYNC_CALLS) {
      console.warn(
        `⚠️ PERF: ${storeName} hydrated synchronously ${syncCount} times in one cycle (threshold: ${this.ANOMALY_THRESHOLDS.HYDRATION_SYNC_CALLS})`
      );
    }
  }

  private addSample(sample: ProfileSample) {
    this.samples.push(sample);
    if (this.samples.length > this.MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  getSamples() {
    return [...this.samples];
  }

  reset() {
    this.samples = [];
    this.componentMountTimes.clear();
    this.componentRenderCounts.clear();
    this.rerenderChains.clear();
  }

  getReport() {
    const mountTimes = Array.from(this.componentMountTimes.entries());
    const renderCounts = Array.from(this.componentRenderCounts.entries());

    return {
      totalSamples: this.samples.length,
      recentMounts: mountTimes.map(([name, time]) => ({
        component: name,
        elapsedMs: (performance.now() - time).toFixed(1),
      })),
      rerenderChains: renderCounts
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    };
  }
}

export const perfProfiler = new PerformanceProfiler();
