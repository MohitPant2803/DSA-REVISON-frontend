/**
 * ScreenTimingProfiler — Collects hard timing numbers for every screen.
 *
 * Measures per-screen:
 *   • Mount Time        — component function → first useEffect fires
 *   • First Paint       — component function → first requestAnimationFrame
 *   • Time-to-Interactive — component function → InteractionManager completes
 *   • Nav Transition    — transitionStart → transitionEnd (stack screens only)
 *
 * Measures globally:
 *   • JS FPS            — frames per second via requestAnimationFrame loop
 *   • Dropped Frames    — frames that exceeded 1.5× the 16.67ms budget
 *
 * ─── Usage from Metro console / React Native Debugger ───
 *   __PERF_TIMING__.printReport()       — formatted summary
 *   __PERF_TIMING__.startFPSMonitor()   — begin FPS tracking
 *   __PERF_TIMING__.stopFPSMonitor()    — stop FPS tracking
 *   __PERF_TIMING__.clear()             — reset all collected data
 *
 * All operations no-op in production builds.
 */

import { InteractionManager } from 'react-native';

type MetricType = 'mount' | 'first_paint' | 'tti' | 'transition' | 'fps' | 'dropped_frames';

interface PerfEntry {
  screen: string;
  type: MetricType;
  value: number;
  timestamp: number;
}

const IS_DEV = !!__DEV__;

class ScreenTimingProfiler {
  private static instance: ScreenTimingProfiler;

  private entries: PerfEntry[] = [];
  private fpsRunning = false;
  private fpsRafId: number | null = null;
  private fpsFrameCount = 0;
  private fpsLastTick = 0;
  private lastFrameTs = 0;
  private transitionStarts = new Map<string, number>();

  static getInstance(): ScreenTimingProfiler {
    if (!ScreenTimingProfiler.instance) {
      ScreenTimingProfiler.instance = new ScreenTimingProfiler();
    }
    return ScreenTimingProfiler.instance;
  }

  // ── Record a single metric ────────────────────────────────────

  record(screen: string, type: MetricType, value: number): void {
    if (!IS_DEV) return;
    this.entries.push({ screen, type, value, timestamp: Date.now() });

    const tag: Record<MetricType, string> = {
      mount:          '⏱️  MOUNT',
      first_paint:    '🎨  PAINT',
      tti:            '🏃  TTI  ',
      transition:     '🚀  TRANS',
      fps:            '📊  FPS  ',
      dropped_frames: '⚠️  DROP ',
    };
    const unit = type === 'fps' ? 'fps' : type === 'dropped_frames' ? 'frames' : 'ms';
    console.log(`[PERF] ${tag[type]}  ${screen.padEnd(22)} ${value.toFixed(1)} ${unit}`);
  }

  // ── FPS Monitor (requestAnimationFrame loop) ──────────────────

  startFPSMonitor(): void {
    if (!IS_DEV || this.fpsRunning) return;
    this.fpsRunning = true;
    this.fpsFrameCount = 0;
    this.fpsLastTick = performance.now();
    this.lastFrameTs = performance.now();
    this._fpsTick();
    console.log('[PERF] 📊 FPS monitor started — logging every second');
  }

  stopFPSMonitor(): void {
    this.fpsRunning = false;
    if (this.fpsRafId !== null) cancelAnimationFrame(this.fpsRafId);
    this.fpsRafId = null;
    console.log('[PERF] 📊 FPS monitor stopped');
  }

  private _fpsTick = (): void => {
    if (!this.fpsRunning) return;
    const now = performance.now();
    this.fpsFrameCount++;

    // Detect dropped frames: frame took > 1.5× the 16.67ms budget
    const delta = now - this.lastFrameTs;
    if (delta > 25) {
      const dropped = Math.floor(delta / 16.67) - 1;
      if (dropped > 0) {
        this.record('Global', 'dropped_frames', dropped);
      }
    }
    this.lastFrameTs = now;

    // Report FPS every ~1 second
    const elapsed = now - this.fpsLastTick;
    if (elapsed >= 1000) {
      const fps = Math.round((this.fpsFrameCount * 1000) / elapsed);
      this.record('Global', 'fps', fps);
      this.fpsFrameCount = 0;
      this.fpsLastTick = now;
    }

    this.fpsRafId = requestAnimationFrame(this._fpsTick);
  };

  // ── Navigation transition helpers ─────────────────────────────

  markTransitionStart(key: string): void {
    if (!IS_DEV) return;
    this.transitionStarts.set(key, performance.now());
  }

  markTransitionEnd(key: string, screenName: string): void {
    if (!IS_DEV) return;
    const start = this.transitionStarts.get(key);
    if (start != null) {
      this.record(screenName, 'transition', performance.now() - start);
      this.transitionStarts.delete(key);
    }
  }

  // ── Formatted report ──────────────────────────────────────────

  printReport(): void {
    if (this.entries.length === 0) {
      console.log('[PERF] No metrics collected yet. Navigate between screens to collect data.');
      return;
    }

    const grouped = new Map<string, PerfEntry[]>();
    for (const e of this.entries) {
      if (!grouped.has(e.screen)) grouped.set(e.screen, []);
      grouped.get(e.screen)!.push(e);
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              REEWISE PERFORMANCE REPORT                     ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');

    const metricOrder: MetricType[] = ['mount', 'first_paint', 'tti', 'transition', 'fps', 'dropped_frames'];
    const label: Record<MetricType, string> = {
      mount:          '⏱️  Mount Time      ',
      first_paint:    '🎨  First Paint     ',
      tti:            '🏃  Time to Interact',
      transition:     '🚀  Nav Transition  ',
      fps:            '📊  JS FPS          ',
      dropped_frames: '⚠️  Dropped Frames  ',
    };

    for (const [screen, entries] of grouped) {
      lines.push(`📱 ${screen}`);
      lines.push('─'.repeat(60));

      for (const type of metricOrder) {
        const vals = entries.filter(e => e.type === type);
        if (vals.length === 0) continue;
        const values = vals.map(v => v.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        if (type === 'fps') {
          lines.push(`  ${label[type]}  avg=${avg.toFixed(0)}fps   min=${min.toFixed(0)}fps   (${vals.length} samples)`);
        } else if (type === 'dropped_frames') {
          const total = values.reduce((a, b) => a + b, 0);
          lines.push(`  ${label[type]}  total=${total} frames   (${vals.length} jank events)`);
        } else {
          lines.push(`  ${label[type]}  avg=${avg.toFixed(1)}ms   min=${min.toFixed(1)}ms   max=${max.toFixed(1)}ms   (${vals.length}×)`);
        }
      }
      lines.push('');
    }

    lines.push(`📅 Collected ${this.entries.length} total data points`);
    lines.push('');

    console.log(lines.join('\n'));
  }

  // ── Clear ─────────────────────────────────────────────────────

  clear(): void {
    this.entries = [];
    console.log('[PERF] Metrics cleared.');
  }
}

// Expose to dev console globally
if (IS_DEV) {
  (global as any).__PERF_TIMING__ = ScreenTimingProfiler.getInstance();
  console.log('[PERF] 💡 Screen timing profiler ready. Commands:');
  console.log('[PERF]    __PERF_TIMING__.printReport()       — view summary');
  console.log('[PERF]    __PERF_TIMING__.startFPSMonitor()   — track FPS + jank');
  console.log('[PERF]    __PERF_TIMING__.stopFPSMonitor()    — stop FPS tracking');
  console.log('[PERF]    __PERF_TIMING__.clear()             — reset all data');
}

export default ScreenTimingProfiler;
