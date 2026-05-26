import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

let consecutiveWriteFailures = 0;
let hasWarnedAboutSize = false;

const DEBOUNCE_DELAY_MS = 1500;
const pendingWrites = new Map<string, string>();
const pendingResolves = new Map<string, Array<() => void>>();
let debounceTimeout: NodeJS.Timeout | null = null;

export interface StorageEngine {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Development mode metrics and logging wrapper
const logDevMetrics = (operation: string, key: string, startTime: number, sizeBytes?: number) => {
  // Silent background storage metrics
};

/**
 * Flush all pending writes immediately and resolve all waiting promises.
 */
export async function flushPendingWrites(): Promise<void> {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }

  if (pendingWrites.size === 0) {
    return;
  }

  const startTime = performance.now();
  // Clone current pending writes and clear the map immediately to prevent race conditions during async write
  const writesToFlush = Array.from(pendingWrites.entries());
  pendingWrites.clear();

  const resolvesToCall = new Map(pendingResolves);
  pendingResolves.clear();

  try {
    if (writesToFlush.length === 1) {
      const [key, value] = writesToFlush[0];
      const sizeBytes = value.length * 2; // UTF-16 encoding
      if (sizeBytes > 5 * 1024 * 1024 && !hasWarnedAboutSize) {
        hasWarnedAboutSize = true;
        console.error(`[StorageEngine] ⚠️ CRITICAL: Store size ${(sizeBytes / 1024 / 1024).toFixed(1)}MB approaching 6MB AsyncStorage limit for key "${key}". Data loss risk!`);
      }
      await AsyncStorage.setItem(key, value);
      logDevMetrics('SET', key, startTime, value.length);
    } else {
      // Use multiSet for batching
      await AsyncStorage.multiSet(writesToFlush);
      writesToFlush.forEach(([key, value]) => {
        logDevMetrics('SET_BATCH', key, startTime, value.length);
      });
    }
    consecutiveWriteFailures = 0; // Reset on success
  } catch (error) {
    consecutiveWriteFailures++;
    console.error(`[StorageEngine] ❌ Batch Write FAILED (failure #${consecutiveWriteFailures}):`, error);
    
    // Put writes back in pending map so they aren't lost
    writesToFlush.forEach(([key, value]) => {
      if (!pendingWrites.has(key)) {
        pendingWrites.set(key, value);
      }
    });

    // To be safe, trigger emergency store pruning if consecutive write failures >= 3
    if (consecutiveWriteFailures >= 3) {
      console.error('[StorageEngine] 🚨 3 consecutive write failures. Triggering emergency store pruning.');
      try {
        const { usePlaylistStateStore } = require('@/store/usePlaylistStateStore');
        usePlaylistStateStore.getState().pruneStaleCache?.();
      } catch {}
    }
  } finally {
    // Resolve all promises waiting for these keys
    resolvesToCall.forEach((resolvers) => {
      resolvers.forEach((resolve) => resolve());
    });
  }
}

// AppState change listener to guarantee flush on app exit/backgrounding
AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
  if (nextAppState === 'inactive' || nextAppState === 'background') {
    if (__DEV__) {
      console.log(`[StorageEngine] App state changed to ${nextAppState}. Flushing pending writes immediately.`);
    }
    flushPendingWrites().catch((err) => {
      console.error('[StorageEngine] Failed to flush pending writes on app state change:', err);
    });
  }
});

export const storageEngine: StorageEngine = {
  async getItem(key: string): Promise<string | null> {
    // 1. Read-after-write consistency: check pending writes first
    if (pendingWrites.has(key)) {
      return pendingWrites.get(key) || null;
    }
    
    const startTime = performance.now();
    try {
      const val = await AsyncStorage.getItem(key);
      logDevMetrics('GET', key, startTime, val ? val.length : 0);
      return val;
    } catch (error) {
      console.error(`[StorageEngine Error] Failed to read key "${key}" from storage:`, error);
      // Corruption recovery fallback: Return null rather than crashing app startup
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (typeof value !== 'string') {
      throw new Error(`Serialization Guard: value must be a string, got ${typeof value}`);
    }

    // Stage in memory buffer
    pendingWrites.set(key, value);

    // Schedule debounced flush
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    return new Promise<void>((resolve) => {
      // Track resolver for this key
      if (!pendingResolves.has(key)) {
        pendingResolves.set(key, []);
      }
      pendingResolves.get(key)!.push(resolve);

      debounceTimeout = setTimeout(async () => {
        await flushPendingWrites();
      }, DEBOUNCE_DELAY_MS);
    });
  },

  async removeItem(key: string): Promise<void> {
    // If there's a pending write, remove it
    pendingWrites.delete(key);
    pendingResolves.delete(key);

    const startTime = performance.now();
    try {
      await AsyncStorage.removeItem(key);
      logDevMetrics('REMOVE', key, startTime);
    } catch (error) {
      console.error(`[StorageEngine Error] Failed to remove key "${key}" from storage:`, error);
      // Fail gracefully
    }
  },
};
