/**
 * PERFORMANCE METRICS: Before/After SQLite Architecture Changes
 * 
 * Tracks:
 * - Sync phase timings (bootstrap, delta, full resync)
 * - Write queue metrics (coalesce rate, latency, errors)
 * - Entity counts and change metrics
 * - Startup time and responsiveness
 */

export interface SyncPhaseMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  entityCount?: {
    cards?: number;
    folders?: number;
    playlists?: number;
  };
  status: 'started' | 'completed' | 'failed';
  error?: string;
}

export interface WriteMetricsSnapshot {
  timestamp: number;
  totalOperations: number;
  coalescedOperations: number;
  errorCount: number;
  averageQueueWaitMs: number;
  maxTransactionMs: number;
  queueSize: number;
}

export interface StartupMetrics {
  coldStartMs: number;
  hydrateMs: number;
  bootstrapMs: number;
  firstDeltaSyncMs?: number;
  appReadyMs: number;
  phases: SyncPhaseMetrics[];
}

/**
 * Singleton performance tracker for sync operations
 */
export class SyncPerformanceTracker {
  private static instance: SyncPerformanceTracker;

  private phases: Map<string, SyncPhaseMetrics> = new Map();
  private startupMetrics: StartupMetrics | null = null;
  private appStartTime = 0;
  private lastPhaseTime = 0;
  private writeMetricsHistory: WriteMetricsSnapshot[] = [];

  private readonly HISTORY_LIMIT = 100; // Keep last 100 metric snapshots

  private constructor() {
    this.appStartTime = Date.now();
  }

  static getInstance(): SyncPerformanceTracker {
    if (!SyncPerformanceTracker.instance) {
      SyncPerformanceTracker.instance = new SyncPerformanceTracker();
    }
    return SyncPerformanceTracker.instance;
  }

  /**
   * Mark start of a sync phase
   */
  startPhase(name: string): string {
    const id = `${name}-${Date.now()}`;
    this.phases.set(id, {
      name,
      startTime: Date.now(),
      status: 'started',
    });
    this.lastPhaseTime = Date.now();
    
    if (__DEV__) console.log(`[PERF] Phase started: ${name}`);
    return id;
  }

  /**
   * Mark end of a sync phase with optional entity counts
   */
  endPhase(
    id: string,
    status: 'completed' | 'failed' = 'completed',
    entityCount?: { cards?: number; folders?: number; playlists?: number },
    error?: string
  ): SyncPhaseMetrics | null {
    const phase = this.phases.get(id);
    if (!phase) {
      console.warn('[PERF] Phase not found:', id);
      return null;
    }

    const now = Date.now();
    phase.endTime = now;
    phase.duration = now - phase.startTime;
    phase.status = status;
    if (entityCount) phase.entityCount = entityCount;
    if (error) phase.error = error;

    if (__DEV__) {
      const statusEmoji = status === 'completed' ? '✅' : '❌';
      console.log(`[PERF] Phase ${statusEmoji}: ${phase.name} | Duration: ${phase.duration}ms | Entities: ${JSON.stringify(entityCount || {})}`);
    }

    return phase;
  }

  /**
   * Record write manager metrics
   */
  recordWriteMetrics(writeMetrics: any): void {
    const snapshot: WriteMetricsSnapshot = {
      timestamp: Date.now(),
      totalOperations: writeMetrics.totalOps || 0,
      coalescedOperations: writeMetrics.coalescedOps || 0,
      errorCount: writeMetrics.errorCount || 0,
      averageQueueWaitMs: writeMetrics.queueWaitMs || 0,
      maxTransactionMs: writeMetrics.transactionMs || 0,
      queueSize: 0, // Will be updated separately
    };

    this.writeMetricsHistory.push(snapshot);
    if (this.writeMetricsHistory.length > this.HISTORY_LIMIT) {
      this.writeMetricsHistory.shift();
    }
  }

  /**
   * Calculate aggregate metrics across all phases
   */
  getAggregateMetrics(): {
    totalDuration: number;
    phaseCount: number;
    failedPhases: number;
    totalEntities: { cards: number; folders: number; playlists: number };
    averagePhaseTime: number;
  } {
    const phases = Array.from(this.phases.values());
    const totalDuration = phases.reduce((sum, p) => sum + (p.duration || 0), 0);
    const failedPhases = phases.filter((p) => p.status === 'failed').length;

    let totalCards = 0, totalFolders = 0, totalPlaylists = 0;
    phases.forEach((p) => {
      if (p.entityCount) {
        totalCards += p.entityCount.cards || 0;
        totalFolders += p.entityCount.folders || 0;
        totalPlaylists += p.entityCount.playlists || 0;
      }
    });

    return {
      totalDuration,
      phaseCount: phases.length,
      failedPhases,
      totalEntities: { cards: totalCards, folders: totalFolders, playlists: totalPlaylists },
      averagePhaseTime: phases.length > 0 ? totalDuration / phases.length : 0,
    };
  }

  /**
   * Get detailed report of all phases
   */
  getDetailedReport(): {
    appStartTime: number;
    elapsedMs: number;
    phases: SyncPhaseMetrics[];
    writeMetricsHistory: WriteMetricsSnapshot[];
    aggregate: any;
  } {
    const phases = Array.from(this.phases.values());
    const elapsedMs = Date.now() - this.appStartTime;

    return {
      appStartTime: this.appStartTime,
      elapsedMs,
      phases,
      writeMetricsHistory: this.writeMetricsHistory,
      aggregate: this.getAggregateMetrics(),
    };
  }

  /**
   * Get startup metrics (if available)
   */
  getStartupMetrics(): StartupMetrics | null {
    if (!this.startupMetrics) {
      const phases = Array.from(this.phases.values());
      const bootstrapPhase = phases.find((p) => p.name.includes('Bootstrap'));
      const deltaPhase = phases.find((p) => p.name.includes('Delta'));

      this.startupMetrics = {
        coldStartMs: Date.now() - this.appStartTime,
        hydrateMs: 0,
        bootstrapMs: bootstrapPhase?.duration || 0,
        firstDeltaSyncMs: deltaPhase?.duration || 0,
        appReadyMs: Date.now() - this.appStartTime,
        phases,
      };
    }
    return this.startupMetrics;
  }

  /**
   * Clear all metrics (e.g., on logout)
   */
  clear(): void {
    this.phases.clear();
    this.writeMetricsHistory = [];
    this.startupMetrics = null;
    this.appStartTime = Date.now();
  }

  /**
   * Log a summary to console
   */
  logSummary(): void {
    const report = this.getDetailedReport();
    const startup = this.getStartupMetrics();

    console.log('================================');
    console.log('📊 SYNC PERFORMANCE REPORT');
    console.log('================================');
    console.log(`App Started: ${new Date(report.appStartTime).toLocaleTimeString()}`);
    console.log(`Total Elapsed: ${report.elapsedMs}ms`);

    if (startup) {
      console.log(`\n⏱️ STARTUP TIMELINE:`);
      console.log(`  Cold Start: ${startup.coldStartMs}ms`);
      console.log(`  Bootstrap: ${startup.bootstrapMs}ms`);
      console.log(`  First Delta Sync: ${startup.firstDeltaSyncMs}ms`);
      console.log(`  App Ready: ${startup.appReadyMs}ms`);
    }

    const agg = report.aggregate;
    console.log(`\n📈 AGGREGATE METRICS:`);
    console.log(`  Total Phases: ${agg.phaseCount}`);
    console.log(`  Failed Phases: ${agg.failedPhases}`);
    console.log(`  Total Duration: ${agg.totalDuration}ms`);
    console.log(`  Avg Phase Time: ${agg.averagePhaseTime.toFixed(1)}ms`);
    console.log(`  Total Entities: Cards=${agg.totalEntities.cards}, Folders=${agg.totalEntities.folders}, Playlists=${agg.totalEntities.playlists}`);

    console.log(`\n🔄 SYNC PHASES:`);
    report.phases.forEach((phase) => {
      const statusEmoji = phase.status === 'completed' ? '✅' : '❌';
      console.log(`  ${statusEmoji} ${phase.name}: ${phase.duration}ms`);
      if (phase.entityCount) {
        console.log(`     Entities: ${JSON.stringify(phase.entityCount)}`);
      }
      if (phase.error) {
        console.log(`     Error: ${phase.error}`);
      }
    });

    if (report.writeMetricsHistory.length > 0) {
      const lastWrite = report.writeMetricsHistory[report.writeMetricsHistory.length - 1];
      console.log(`\n✍️ WRITE METRICS (Latest):`);
      console.log(`  Total Operations: ${lastWrite.totalOperations}`);
      console.log(`  Coalesced Operations: ${lastWrite.coalescedOperations}`);
      console.log(`  Error Count: ${lastWrite.errorCount}`);
      console.log(`  Avg Queue Wait: ${lastWrite.averageQueueWaitMs}ms`);
      console.log(`  Max Transaction: ${lastWrite.maxTransactionMs}ms`);
    }

    console.log('================================\n');
  }
}

export const syncPerformanceTracker = SyncPerformanceTracker.getInstance();
