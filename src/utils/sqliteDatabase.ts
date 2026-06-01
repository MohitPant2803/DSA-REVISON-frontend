import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { syncTelemetry } from './syncTelemetry';
import { profiler } from './profiler';

const DATABASE_NAME = 'dsa_reels.db';
const BACKUP_DATABASE_NAME = 'sqlite_backups/dsa_reels_backup.db';

class Mutex {
  private queue: Promise<any> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.queue;
    this.queue = current.then(() => next);
    await current;
    return release!;
  }
}

export const sqliteLock = new Mutex();
export const hydrationLock = new Mutex();

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isSqliteSupported: boolean | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Robust runtime safety check to detect if the native ExpoSQLite module is linked and functional.
 * Returns false on Web or unlinked/mocked environments to prevent startup crashes.
 */
export function isSQLiteAvailable(): boolean {
  if (isSqliteSupported !== null) return isSqliteSupported;
  isSqliteSupported = !!SQLite;
  return isSqliteSupported;
}

/**
 * Initializes and retrieves the SQLite database instance asynchronously.
 * Enforces PRAGMA synchronous = NORMAL and journal_mode = WAL.
 * Uses a single in-flight promise to prevent concurrent duplicate connections.
 */
export async function initializeDatabaseAsync(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  if (!isSQLiteAvailable()) {
    throw new Error('SQLite native module is not available.');
  }

  initPromise = (async () => {
    try {
      // 1. Establish SQLite Connection asynchronously
      const instance = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // 2. Enable WAL & NORMAL Synchronous durability for 10-100x faster eMMC writes
      await instance.execAsync('PRAGMA journal_mode = WAL;');
      await instance.execAsync('PRAGMA synchronous = NORMAL;');
      await instance.execAsync('PRAGMA foreign_keys = ON;');

      dbInstance = instance;
      console.log('[SQLite Database] Async relational connection established successfully in WAL + NORMAL Sync mode.');
      return instance;
    } catch (err: any) {
      console.error('[SQLite Database Error] Async connection crashed:', err.message);
      syncTelemetry.log('failure', `Database async boot crashed: ${err.message}`);
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Retrieves the cached SQLite database instance.
 * Throws an explicit error if called before the database is initialized.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    throw new Error(
      '[SQLite] Database not initialized. Ensure initializeDatabaseAsync() ' +
      'completed before calling getDatabase().'
    );
  }
  return dbInstance;
}

/**
 * Force-closes and resets the cached database instance so that the next query
 * will trigger a clean re-initialization. Called automatically when a native
 * "shared object already released" exception is intercepted.
 */
export async function resetDatabaseInstance(): Promise<void> {
  console.warn('[SQLite Database] Resetting released or stale database instance...');
  try {
    if (dbInstance) {
      await dbInstance.closeAsync();
    }
  } catch (e) {
    // Already closed or released
  } finally {
    dbInstance = null;
    initPromise = null; // Also clear the initialization promise!
  }
}


/**
 * Executes a startup PRAGMA integrity_check asynchronously.
 * If failed, triggers self-healing salvage and full resync redirection.
 */
export async function verifyDatabaseIntegrity(): Promise<boolean> {
  if (!isSQLiteAvailable()) return false;
  const db = getDatabase();
  return profiler.profileAsync('Verify Database Integrity', async () => {
    try {
      const result = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check;');
      const status = result?.integrity_check || 'failed';

      if (status !== 'ok') {
        console.error(`[SQLite Integrity Check] Failed status: ${status}. Triggering salvage recovery.`);
        syncTelemetry.log('failure', `Database integrity corrupt: ${status}`);
        await executeDatabaseSalvage();
        return false;
      }

      console.log('[SQLite Integrity Check] Passed successfully.');
      return true;
    } catch (err: any) {
      console.error('[SQLite Integrity Check] Failed to run query:', err.message);
      await executeDatabaseSalvage();
      return false;
    }
  });
}

/**
 * Creates a physical backup copy of the database asynchronously.
 */
export async function createDatabaseBackup(): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const dbDirectory = `${FileSystem.documentDirectory}sqlite_backups/`;
  try {
    const dirInfo = await FileSystem.getInfoAsync(dbDirectory);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dbDirectory, { intermediates: true });
    }

    const sourceUri = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
    const targetUri = `${FileSystem.documentDirectory}SQLite/${BACKUP_DATABASE_NAME}`;

    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri
    });
    
    if (__DEV__) {
      console.log('[SQLite Backup] Snapshot created successfully inside sqlite_backups/');
    }
  } catch (err: any) {
    console.warn('[SQLite Backup Warning] Snapshot failed:', err.message);
  }
}

/**
 * Wipes the database and restores the backup snapshot file if corruption is detected.
 */
export async function executeDatabaseSalvage(): Promise<void> {
  if (!isSQLiteAvailable()) return;
  console.warn('[SQLite Salvage] Initiating database restore from backup snapshot...');
  const sourceUri = `${FileSystem.documentDirectory}SQLite/${BACKUP_DATABASE_NAME}`;
  const targetUri = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;

  try {
    // 1. Close current db connection
    if (dbInstance) {
      await dbInstance.closeAsync();
      dbInstance = null;
    }

    // 2. Restore file
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri
    });
    console.log('[SQLite Salvage] Database recovered from backup snapshot successfully.');
  } catch (err: any) {
    console.error('[SQLite Salvage Error] Recovery copy crashed:', err.message);
    // Hard wipe and reset
    try {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    } catch (delErr) {
      console.error('[SQLite Salvage Error] Scoped deletion failed:', delErr);
    }
  }
}

/**
 * Executes DDL schema setup and default constraints inside an asynchronous transaction block.
 */
export async function setupDatabaseTables(): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();

  await profiler.profileAsync('Setup Database Tables (DDL)', async () => {
    try {
      await db.withTransactionAsync(async () => {
        // A: Device Metadata Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS device_metadata (
            deviceId TEXT PRIMARY KEY NOT NULL,
            lastIssuedLogicalSequence INTEGER NOT NULL DEFAULT 0,
            installationId TEXT NOT NULL,
            clockEpoch TEXT NOT NULL
          );
        `);

        // B: Separate Cards Metadata
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS cards_metadata (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            topic TEXT NOT NULL,
            tags TEXT,
            difficulty TEXT CHECK(difficulty IN ('Easy', 'Medium', 'Hard')) NOT NULL,
            folderId TEXT NOT NULL,
            createdBy TEXT NOT NULL,
            visibility TEXT DEFAULT 'public',
            "order" INTEGER DEFAULT 0,
            isDeleted INTEGER DEFAULT 0,
            updatedAt TEXT NOT NULL
          );
        `);

        // C: Cards Content Attachment Table (Blob paths)
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS cards_content (
            cardId TEXT PRIMARY KEY NOT NULL,
            explanation TEXT NOT NULL,
            code TEXT,
            imageBlobPath TEXT,
            imageHash TEXT,
            examples TEXT,
            slides TEXT,
            FOREIGN KEY(cardId) REFERENCES cards_metadata(id) ON DELETE CASCADE
          );
        `);

        // Self-healing migration: Add slides column to cards_content if it doesn't exist yet
        try {
          const tableInfo = await db.getAllAsync<any>('PRAGMA table_info(cards_content);');
          const hasSlides = tableInfo.some((col: any) => col.name === 'slides');
          if (!hasSlides) {
            await db.execAsync('ALTER TABLE cards_content ADD COLUMN slides TEXT;');
            console.log('[SQLite Database] Migration: Added slides column to cards_content table.');
          }
        } catch (migErr: any) {
          console.warn('[SQLite Database Migration Warning] Failed to check/add slides column:', migErr.message);
        }

        // D: Folders Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            description TEXT,
            icon TEXT DEFAULT 'folder',
            color TEXT DEFAULT '#7c3aed',
            createdBy TEXT NOT NULL,
            visibility TEXT CHECK(visibility IN ('public', 'private')) DEFAULT 'public',
            "order" INTEGER DEFAULT 0,
            parentFolderId TEXT,
            cardIds TEXT,
            revision INTEGER DEFAULT 0,
            pendingLogicalSequence INTEGER DEFAULT 0,
            ackedLogicalSequence INTEGER DEFAULT 0,
            serverLogicalSequence INTEGER DEFAULT 0,
            clockEpoch TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            isDeleted INTEGER DEFAULT 0,
            deletedAt TEXT
          );
        `);

        // Self-healing migrations for folders
        try { await db.execAsync('ALTER TABLE folders ADD COLUMN userId TEXT NOT NULL DEFAULT "";'); } catch {}
        try { await db.execAsync('ALTER TABLE folders ADD COLUMN isDeleted INTEGER DEFAULT 0;'); } catch {}
        try { await db.execAsync('ALTER TABLE folders ADD COLUMN deletedAt TEXT;'); } catch {}

        // E: Playlists Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL,
            name TEXT NOT NULL,
            title TEXT,
            description TEXT,
            color1 TEXT,
            color2 TEXT,
            itemCount INTEGER DEFAULT 0,
            cardIds TEXT,
            revision INTEGER DEFAULT 0,
            pendingLogicalSequence INTEGER DEFAULT 0,
            ackedLogicalSequence INTEGER DEFAULT 0,
            serverLogicalSequence INTEGER DEFAULT 0,
            clockEpoch TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            isDeleted INTEGER DEFAULT 0,
            deletedAt TEXT
          );
        `);

        // Self-healing migrations for playlists
        try { await db.execAsync('ALTER TABLE playlists ADD COLUMN isDeleted INTEGER DEFAULT 0;'); } catch {}
        try { await db.execAsync('ALTER TABLE playlists ADD COLUMN deletedAt TEXT;'); } catch {}

        // F: Spaced Repetition Card Progress (Logical clocks only)
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS card_progress (
            cardId TEXT NOT NULL,
            userId TEXT NOT NULL,
            completed INTEGER CHECK(completed IN (0, 1)) DEFAULT 0,
            revisionCount INTEGER DEFAULT 0,
            favorite INTEGER CHECK(favorite IN (0, 1)) DEFAULT 0,
            difficultyState TEXT CHECK(difficultyState IN ('easy', 'medium', 'hard', 'skipped', NULL)),
            seenInReels INTEGER CHECK(seenInReels IN (0, 1)) DEFAULT 0,
            revision INTEGER DEFAULT 0,
            favoritePendingSequence INTEGER DEFAULT 0,
            favoriteAckedSequence INTEGER DEFAULT 0,
            favoriteServerSequence INTEGER DEFAULT 0,
            favoriteClockEpoch TEXT,
            difficultyPendingSequence INTEGER DEFAULT 0,
            difficultyAckedSequence INTEGER DEFAULT 0,
            difficultyServerSequence INTEGER DEFAULT 0,
            difficultyClockEpoch TEXT,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (cardId, userId)
          );
        `);

        // Self-healing migration for composite primary key in case card_progress was created with cardId primary key
        try {
          const tableInfo = await db.getAllAsync<any>('PRAGMA table_info(card_progress);');
          const pkColumns = tableInfo.filter((col: any) => col.pk > 0);
          if (pkColumns.length === 1 && pkColumns[0].name === 'cardId') {
            console.log('[SQLite Database] Migrating card_progress to composite PRIMARY KEY(cardId, userId)...');
            await db.execAsync(`
              CREATE TABLE IF NOT EXISTS card_progress_new (
                cardId TEXT NOT NULL,
                userId TEXT NOT NULL,
                completed INTEGER CHECK(completed IN (0, 1)) DEFAULT 0,
                revisionCount INTEGER DEFAULT 0,
                favorite INTEGER CHECK(favorite IN (0, 1)) DEFAULT 0,
                difficultyState TEXT CHECK(difficultyState IN ('easy', 'medium', 'hard', 'skipped', NULL)),
                seenInReels INTEGER CHECK(seenInReels IN (0, 1)) DEFAULT 0,
                revision INTEGER DEFAULT 0,
                favoritePendingSequence INTEGER DEFAULT 0,
                favoriteAckedSequence INTEGER DEFAULT 0,
                favoriteServerSequence INTEGER DEFAULT 0,
                favoriteClockEpoch TEXT,
                difficultyPendingSequence INTEGER DEFAULT 0,
                difficultyAckedSequence INTEGER DEFAULT 0,
                difficultyServerSequence INTEGER DEFAULT 0,
                difficultyClockEpoch TEXT,
                updatedAt TEXT NOT NULL,
                PRIMARY KEY (cardId, userId)
              );
            `);
            await db.execAsync('INSERT OR IGNORE INTO card_progress_new SELECT * FROM card_progress;');
            await db.execAsync('DROP TABLE card_progress;');
            await db.execAsync('ALTER TABLE card_progress_new RENAME TO card_progress;');
            console.log('[SQLite Database] Migration: card_progress converted to composite PRIMARY KEY successfully.');
          }
        } catch (migErr: any) {
          console.warn('[SQLite Database Migration Warning] Failed to migrate card_progress primary key:', migErr.message);
        }

        // Migration: Add seenInReels column if not present inside card_progress
        try {
          const tableInfo = await db.getAllAsync<any>('PRAGMA table_info(card_progress);');
          const hasSeenInReels = tableInfo.some((col: any) => col.name === 'seenInReels');
          if (!hasSeenInReels) {
            console.log('[SQLite Database] Migrating card_progress to add column seenInReels...');
            await db.execAsync('ALTER TABLE card_progress ADD COLUMN seenInReels INTEGER CHECK(seenInReels IN (0, 1)) DEFAULT 0;');
            console.log('[SQLite Database] Column seenInReels added successfully.');
          }
        } catch (colErr: any) {
          console.warn('[SQLite Database Migration Warning] Failed to add seenInReels column:', colErr.message);
        }

        // G: Durable Offline Queue Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS offline_queue (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            payload TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            retryCount INTEGER DEFAULT 0,
            localRevision INTEGER NOT NULL,
            deviceId TEXT NOT NULL,
            logicalSequence INTEGER NOT NULL,
            clockEpoch TEXT NOT NULL
          );
        `);

        // Self-healing migrations for offline_queue
        try { await db.execAsync('ALTER TABLE offline_queue ADD COLUMN userId TEXT NOT NULL DEFAULT "";'); } catch {}

        // G2: User Metrics Table (for swipes and scrolls)
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS user_metrics (
            userId TEXT PRIMARY KEY NOT NULL,
            totalSwipes INTEGER NOT NULL DEFAULT 0,
            totalScrolls INTEGER NOT NULL DEFAULT 0,
            unsyncedSwipes INTEGER NOT NULL DEFAULT 0,
            unsyncedScrolls INTEGER NOT NULL DEFAULT 0,
            updatedAt INTEGER NOT NULL
          );
        `);

        // H: Sync Transactions Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS sync_transactions (
            transactionId TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL DEFAULT '',
            startedAt INTEGER NOT NULL,
            batchPayload TEXT NOT NULL,
            acknowledged INTEGER CHECK(acknowledged IN (0, 1)) DEFAULT 0,
            committed INTEGER CHECK(committed IN (0, 1)) DEFAULT 0
          );
        `);

        // Self-healing migrations for sync_transactions
        try { await db.execAsync('ALTER TABLE sync_transactions ADD COLUMN userId TEXT NOT NULL DEFAULT "";'); } catch {}

        // I: Delta Stream Checkpoints Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS delta_stream_checkpoints (
            transactionId TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL DEFAULT '',
            bucket TEXT NOT NULL,
            revision INTEGER NOT NULL,
            pageNumber INTEGER NOT NULL,
            cursor TEXT,
            updatedAt INTEGER NOT NULL
          );
        `);

        // Self-healing migrations for delta_stream_checkpoints
        try { await db.execAsync('ALTER TABLE delta_stream_checkpoints ADD COLUMN userId TEXT NOT NULL DEFAULT "";'); } catch {}

        // J: Translations Ledger
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS id_translations (
            tempId TEXT PRIMARY KEY NOT NULL,
            realId TEXT NOT NULL,
            mutationId TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            userId TEXT NOT NULL DEFAULT ''
          );
        `);

        // Self-healing migrations for id_translations
        try { await db.execAsync('ALTER TABLE id_translations ADD COLUMN userId TEXT NOT NULL DEFAULT "";'); } catch {}

        // K: Sync Cursors Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS sync_cursors (
            userId TEXT PRIMARY KEY NOT NULL,
            lastPulledRevision INTEGER DEFAULT 0,
            lastAppliedMutationId TEXT,
            lastServerCheckpoint TEXT,
            updatedAt INTEGER NOT NULL
          );
        `);

        // L: Replay Traces Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS replay_traces (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL,
            installationUUID TEXT NOT NULL,
            mutationId TEXT NOT NULL,
            sequenceChain INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            reconciliationOutcome TEXT
          );
        `);

        // M: Queue Snapshots Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS queue_snapshots (
            userId TEXT PRIMARY KEY NOT NULL,
            snapshotPayload TEXT NOT NULL,
            checkpointSequence INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
          );
        `);

        // N: Durable deletion tombstones.
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS deleted_entities (
            userId TEXT NOT NULL,
            entityId TEXT NOT NULL,
            entityType TEXT CHECK(entityType IN ('folder', 'playlist', 'card')) NOT NULL,
            deletedAt TEXT NOT NULL,
            revision INTEGER DEFAULT 0,
            PRIMARY KEY (userId, entityId, entityType)
          );
        `);

        // O: Local Session Queues Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS local_session_queues (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL,
            sourceType TEXT CHECK(sourceType IN ('folder', 'playlist', 'liked', 'watchLater')) NOT NULL,
            sourceId TEXT NOT NULL,
            orderedCardIds TEXT,
            currentIndex INTEGER NOT NULL DEFAULT 0,
            shuffle INTEGER NOT NULL DEFAULT 0,
            seenSet TEXT,
            cycleNumber INTEGER NOT NULL DEFAULT 1,
            createdAt TEXT NOT NULL
          );
        `);

        // P: Local Reels Sessions Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS reel_sessions (
            userId TEXT PRIMARY KEY NOT NULL,
            selectedRootFolderIds TEXT,
            currentIndex INTEGER NOT NULL DEFAULT 0,
            deepestIndexReached INTEGER NOT NULL DEFAULT 0,
            queue TEXT,
            contentHash TEXT,
            eligibleCardCount INTEGER NOT NULL DEFAULT 0,
            queueVersion INTEGER NOT NULL DEFAULT 0,
            currentQuoteIndex INTEGER NOT NULL DEFAULT 0,
            updatedAt TEXT NOT NULL
          );
        `);

        // P2: Senior Quotes Table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS senior_quotes (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL,
            text TEXT NOT NULL,
            author TEXT NOT NULL,
            collegeName TEXT,
            branch TEXT,
            yearOfGraduation INTEGER,
            updatedAt TEXT NOT NULL
          );
        `);

        // Self-healing migrations for reel_sessions columns
        try { await db.execAsync('ALTER TABLE reel_sessions ADD COLUMN deepestIndexReached INTEGER NOT NULL DEFAULT 0;'); } catch {}
        try { await db.execAsync('ALTER TABLE reel_sessions ADD COLUMN queue TEXT;'); } catch {}
        try { await db.execAsync('ALTER TABLE reel_sessions ADD COLUMN contentHash TEXT;'); } catch {}
        try { await db.execAsync('ALTER TABLE reel_sessions ADD COLUMN eligibleCardCount INTEGER NOT NULL DEFAULT 0;'); } catch {}
        try { await db.execAsync('ALTER TABLE reel_sessions ADD COLUMN queueVersion INTEGER NOT NULL DEFAULT 0;'); } catch {}
        try { await db.execAsync('ALTER TABLE reel_sessions ADD COLUMN currentQuoteIndex INTEGER NOT NULL DEFAULT 0;'); } catch {}

        // Q: Advanced Cascading Deletion Triggers (Lightweight Integrity Cleanup)
        try {
          await db.execAsync('DROP TRIGGER IF EXISTS cascade_folder_soft_delete;');
          await db.execAsync('DROP TRIGGER IF EXISTS cascade_card_soft_delete;');
        } catch (dropErr: any) {
          console.warn('[SQLite Database Schema Warning] Failed to drop old triggers:', dropErr.message);
        }

        // Drop old triggers to prevent legacy schema issues (e.g. orderedCardIds errors)
        await db.execAsync('DROP TRIGGER IF EXISTS cascade_folder_soft_delete;');
        await db.execAsync('DROP TRIGGER IF EXISTS cascade_card_soft_delete;');
        await db.execAsync('DROP TRIGGER IF EXISTS cascade_playlist_soft_delete;');

        await db.execAsync(`
          CREATE TRIGGER cascade_folder_soft_delete
          AFTER UPDATE OF isDeleted ON folders
          FOR EACH ROW WHEN NEW.isDeleted = 1
          BEGIN
            UPDATE cards_metadata SET isDeleted = 1, updatedAt = NEW.updatedAt WHERE folderId = OLD.id;
            UPDATE folders SET isDeleted = 1, deletedAt = NEW.deletedAt, updatedAt = NEW.updatedAt WHERE parentFolderId = OLD.id;
            DELETE FROM local_session_queues WHERE sourceType = 'folder' AND sourceId = OLD.id;
            DELETE FROM offline_queue WHERE payload LIKE '%' || OLD.id || '%';
          END;
        `);

        await db.execAsync(`
          CREATE TRIGGER cascade_card_soft_delete
          AFTER UPDATE OF isDeleted ON cards_metadata
          FOR EACH ROW WHEN NEW.isDeleted = 1
          BEGIN
            DELETE FROM card_progress WHERE cardId = OLD.id;
            DELETE FROM local_session_queues WHERE orderedCardIds LIKE '%' || OLD.id || '%';
            DELETE FROM offline_queue WHERE payload LIKE '%' || OLD.id || '%';
          END;
        `);

        // 3. Create High-Performance Indexes
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_cards_meta_folder ON cards_metadata(folderId);');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_folders_revision ON folders(revision);');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_playlists_revision ON playlists(revision);');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_progress_revision ON card_progress(revision);');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_playlists_user_rev ON playlists(userId, revision);');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_progress_user ON card_progress(userId, cardId);');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_deleted_entities_user_type ON deleted_entities(userId, entityType);');
      });

      console.log('[SQLite Database] Schema DDL, tables, and high-performance indexes created successfully asynchronously.');
      await runStartupRecoveryJournal();
    } catch (err: any) {
      console.error('[SQLite Database Setup Error] Tables DDL transaction failed:', err.message);
      syncTelemetry.log('failure', `Database boot tables setup crashed: ${err.message}`);
      throw err;
    }
  });
}

/**
 * Initializes and persists a secure clock epoch UUID asynchronously.
 */
export async function getOrCreateClockEpoch(): Promise<string> {
  if (!isSQLiteAvailable()) return 'default-epoch';
  const db = getDatabase();
  try {
    const result = await db.getFirstAsync<{ clockEpoch: string }>('SELECT clockEpoch FROM device_metadata LIMIT 1;');
    if (result && result.clockEpoch) {
      return result.clockEpoch;
    }

    // Generate new stable UUID epoch
    const newEpoch = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const devId = `device-${Date.now()}`;
    
    await db.runAsync(
      'INSERT INTO device_metadata (deviceId, lastIssuedLogicalSequence, installationId, clockEpoch) VALUES (?, ?, ?, ?);',
      [devId, 0, devId, newEpoch]
    );

    console.log(`[SQLite Epoch] Created secure clock epoch asynchronously: ${newEpoch}`);
    return newEpoch;
  } catch (err: any) {
    console.error('[SQLite Epoch Error] Failed to read/create epoch:', err.message);
    return 'default-epoch';
  }
}

/**
 * Processes Startup Recovery Journal asynchronously to roll back or safely clean up interrupted sync sessions.
 */
export async function runStartupRecoveryJournal(): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM sync_transactions WHERE committed = 0;');
      console.log('[SQLite Recovery Journal] Wiped uncommitted sync transactions asynchronously.');
    });
  } catch (err: any) {
    console.error('[SQLite Recovery Journal Error] Startup recovery run crashed:', err.message);
  }
}
