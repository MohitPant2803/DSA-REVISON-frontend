/**
 * AppBootstrapGate — Single-Owner Startup Serialization
 *
 * THE authoritative startup pipeline for the entire application.
 * Enforces deterministic initialization order:
 *
 *   Phase 1: Database fully ready (connection + DDL + indexes + migrations)
 *   Phase 2: Auth session restored
 *   Phase 3: Zustand stores hydrated from SQLite
 *   Phase 4: App marked ready → screens can render
 *
 * RULES:
 *   - Only _layout.tsx calls bootstrapApp()
 *   - Nothing queries SQLite before whenDatabaseReady() resolves
 *   - Nothing renders data-dependent screens before whenAppReady() resolves
 *   - No other module initializes the database
 *   - No other module loads SQLite state during startup
 */

import { useState, useEffect } from 'react';

// ─── Phase State ────────────────────────────────────────────────────────────────

export type BootstrapPhase =
  | 'not_started'
  | 'db_initializing'
  | 'db_ready'
  | 'auth_restoring'
  | 'hydrating'
  | 'ready'
  | 'failed';

let currentPhase: BootstrapPhase = 'not_started';

// ─── Promise Gates ──────────────────────────────────────────────────────────────

let dbReadyResolve: (() => void) | null = null;
let appReadyResolve: (() => void) | null = null;

const dbReadyPromise = new Promise<void>((resolve) => {
  dbReadyResolve = resolve;
});

const appReadyPromise = new Promise<void>((resolve) => {
  appReadyResolve = resolve;
});

// ─── Guard: prevent double execution ────────────────────────────────────────────

let hasStartedBootstrap = false;

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the current bootstrap phase synchronously.
 * Use for guards and conditional logic.
 */
export function getBootstrapPhase(): BootstrapPhase {
  return currentPhase;
}

/**
 * Phase 1: Initialize the SQLite database connection and create all tables.
 *
 * This MUST complete before ANY SQLite query is executed anywhere in the app.
 * Called exactly ONCE from _layout.tsx during the serial startup pipeline.
 *
 * Steps:
 *   1. Open SQLite connection (creates file if needed)
 *   2. Set PRAGMAs (WAL, synchronous, foreign keys)
 *   3. Check schema version against SecureStore
 *   4. If mismatch: run integrity check + full DDL + index creation
 *   5. Initialize clock epoch for CRDT sync
 */
export async function initializeDatabase(): Promise<void> {
  if (currentPhase !== 'not_started') {
    // Already started or completed — return the existing promise
    return dbReadyPromise;
  }

  currentPhase = 'db_initializing';

  try {
    const {
      isSQLiteAvailable,
      initializeDatabaseAsync,
      verifyDatabaseIntegrity,
      setupDatabaseTables,
      getOrCreateClockEpoch,
    } = require('./sqliteDatabase');

    if (!isSQLiteAvailable()) {
      console.warn('[AppBootstrap] SQLite native module not available. Skipping DB init.');
      currentPhase = 'db_ready';
      dbReadyResolve?.();
      return;
    }

    // Step 1: Open connection (creates WAL file on first install)
    console.log('[AppBootstrap] Phase 1: Opening SQLite connection...');
    await initializeDatabaseAsync();

    // Step 2: Schema version check — skip heavy DDL if already up to date
    const SecureStore = require('expo-secure-store');
    const SCHEMA_VERSION_KEY = 'sqlite_schema_version';
    const CURRENT_SCHEMA_VERSION = 'v7';
    const storedVersion = await SecureStore.getItemAsync(SCHEMA_VERSION_KEY);

    if (storedVersion !== CURRENT_SCHEMA_VERSION) {
      console.log('[AppBootstrap] Schema version mismatch or first boot. Running full DDL + integrity check...');
      await verifyDatabaseIntegrity();
      await setupDatabaseTables();
      await SecureStore.setItemAsync(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
      console.log('[AppBootstrap] DDL + migrations completed successfully.');
    } else {
      console.log('[AppBootstrap] Schema version matches. Fast boot — skipping DDL.');
    }

    // Step 3: Ensure device identity exists
    await getOrCreateClockEpoch();

    currentPhase = 'db_ready';
    dbReadyResolve?.();
    console.log('[AppBootstrap] ✅ Phase 1 complete: Database fully ready.');
  } catch (err: any) {
    console.error('[AppBootstrap] ❌ CRITICAL: Database initialization failed:', err.message);
    currentPhase = 'failed';
    dbReadyResolve?.(); // Unblock waiters so they can handle the failure gracefully
    throw err;
  }
}

/**
 * Marks the app as fully ready (auth restored + stores hydrated).
 * Called from _layout.tsx after the entire serial pipeline completes.
 */
export function markAppReady(): void {
  if (currentPhase === 'ready') return;
  currentPhase = 'ready';
  appReadyResolve?.();
  console.log('[AppBootstrap] ✅ Phase 4 complete: App fully ready. Screens may render.');
}

/**
 * Returns a promise that resolves when the database is fully initialized
 * (connection open, all tables created, indexes built, migrations done).
 *
 * Any code that calls getDatabase() or runs SQL queries MUST await this first.
 */
export function whenDatabaseReady(): Promise<void> {
  return dbReadyPromise;
}

/**
 * Returns a promise that resolves when the entire app startup is complete
 * (database ready + auth restored + stores hydrated from SQLite).
 *
 * Use this to gate rendering of data-dependent screens.
 */
export function whenAppReady(): Promise<void> {
  return appReadyPromise;
}

/**
 * React hook: returns true only after the database is fully initialized.
 *
 * Components that need SQLite data should use:
 *   const dbReady = useDatabaseReady();
 *   if (!dbReady) return <Skeleton />;
 */
export function useDatabaseReady(): boolean {
  const isAlreadyReady = currentPhase === 'db_ready' || currentPhase === 'hydrating' || currentPhase === 'ready';
  const [ready, setReady] = useState(isAlreadyReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    dbReadyPromise.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

/**
 * React hook: returns true only after the full app bootstrap is complete.
 *
 * Use in screen components that need Zustand store data:
 *   const appReady = useAppReady();
 *   if (!appReady) return <Skeleton />;
 */
export function useAppReady(): boolean {
  const isAlreadyReady = currentPhase === 'ready';
  const [ready, setReady] = useState(isAlreadyReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    appReadyPromise.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}
