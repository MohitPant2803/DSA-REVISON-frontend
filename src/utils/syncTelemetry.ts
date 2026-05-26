interface TelemetryLog {
  timestamp: number;
  type: 'info' | 'success' | 'failure' | 'expiry';
  message: string;
  metadata?: any;
}

const MAX_LOGS = 100;
const logBuffer: TelemetryLog[] = [];

export const syncTelemetry = {
  log: (type: TelemetryLog['type'], message: string, metadata?: any) => {
    const entry: TelemetryLog = {
      timestamp: Date.now(),
      type,
      message,
      metadata,
    };

    logBuffer.unshift(entry);
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.pop();
    }

    // Silent in-memory buffer tracking active for premium observability
  },

  logSyncStart: (queueDepth: number) => {
    syncTelemetry.log('info', `Sync handshake started with queue depth: ${queueDepth}`, { queueDepth });
  },

  logSyncSuccess: (durationMs: number, queueDepth: number, deltaStats: any) => {
    syncTelemetry.log(
      'success',
      `Sync handshake succeeded in ${durationMs.toFixed(0)}ms. Queue flushed.`,
      { durationMs, queueDepth, deltaStats }
    );
  },

  logSyncFailure: (error: any, failureCount: number) => {
    const errorMsg = error?.message || String(error);
    const code = error?.code || error?.status;
    syncTelemetry.log(
      'failure',
      `Sync handshake failed (Consecutive count: ${failureCount}). Error: ${errorMsg}`,
      { code, error }
    );
  },

  logAuthExpiryEvent: (reason: string) => {
    syncTelemetry.log('expiry', `Session soft-expiration triggered: ${reason}`);
  },

  getLogs: () => {
    return [...logBuffer];
  },

  clearLogs: () => {
    logBuffer.length = 0;
  },
};
