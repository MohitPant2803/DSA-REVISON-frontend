import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { syncTelemetry } from './syncTelemetry';

const DATABASE_NAME = 'dsa_reels.db';
const BACKUP_DATABASE_NAME = 'sqlite_backups/dsa_reels_backup.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isSqliteSupported: boolean | null = null;

/**
 * Robust runtime safety check to detect if the native ExpoSQLite module is linked and functional.
 * Returns false on Web or unlinked/mocked environments to prevent startup crashes.
 */
export function isSQLiteAvailable(): boolean {
  if (isSqliteSupported !== null) return isSqliteSupported;
  try {
    const db = SQLite.openDatabaseSync('temp_check.db');
    db.execSync('PRAGMA user_version;');
    db.closeSync();
    isSqliteSupported = true;
    return true;
  } catch (err: any) {
    console.warn('[SQLite Support Guard] Native SQLite module is not available on this platform/environment. Falling back to in-memory store:', err.message);
    isSqliteSupported = false;
    return false;
  }
}

/**
 * Initializes and retrieves the canonical SQLite database instance.
 * Enforces PRAGMA synchronous = FULL and journal_mode = WAL.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (dbInstance) return dbInstance;
  if (!isSQLiteAvailable()) {
    throw new Error('SQLite native module is not available.');
  }

  try {
    // 1. Establish SQLite Connection synchronously
    dbInstance = SQLite.openDatabaseSync(DATABASE_NAME);

    // 2. Enable WAL & Strict FULL Synchronous durability to prevent data drops
    dbInstance.execSync('PRAGMA journal_mode = WAL;');
    dbInstance.execSync('PRAGMA synchronous = FULL;');
    dbInstance.execSync('PRAGMA foreign_keys = ON;');

    console.log('[SQLite Database] Relational connection established successfully in WAL mode.');
    return dbInstance;
  } catch (err: any) {
    console.error('[SQLite Database Error] Connection crashed:', err.message);
    syncTelemetry.log('failure', `Database boot crashed: ${err.message}`);
    throw err;
  }
}

/**
 * Executes a startup PRAGMA integrity_check.
 * If failed, triggers self-healing salvage and full resync redirection.
 */
export function verifyDatabaseIntegrity(): boolean {
  if (!isSQLiteAvailable()) return false;
  const db = getDatabase();
  try {
    const result = db.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check;');
    const status = result?.integrity_check || 'failed';

    if (status !== 'ok') {
      console.error(`[SQLite Integrity Check] Failed status: ${status}. Triggering salvage recovery.`);
      syncTelemetry.log('failure', `Database integrity corrupt: ${status}`);
      executeDatabaseSalvage();
      return false;
    }

    console.log('[SQLite Integrity Check] Passed successfully.');
    return true;
  } catch (err: any) {
    console.error('[SQLite Integrity Check] Failed to run query:', err.message);
    executeDatabaseSalvage();
    return false;
  }
}

/**
 * Creates a physical backup copy of the database to guard against corruption during delta applications.
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
export function executeDatabaseSalvage(): void {
  if (!isSQLiteAvailable()) return;
  console.warn('[SQLite Salvage] Initiating database restore from backup snapshot...');
  const sourceUri = `${FileSystem.documentDirectory}SQLite/${BACKUP_DATABASE_NAME}`;
  const targetUri = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;

  try {
    // 1. Close current db connection
    if (dbInstance) {
      dbInstance.closeSync();
      dbInstance = null;
    }

    // 2. Restore file
    FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri
    }).then(() => {
      console.log('[SQLite Salvage] Database recovered from backup snapshot successfully.');
    }).catch((err: any) => {
      console.error('[SQLite Salvage Error] Recovery copy crashed:', err.message);
      // Hard wipe and reset to seed
      FileSystem.deleteAsync(targetUri, { idempotent: true });
    });
  } catch (err: any) {
    console.error('[SQLite Salvage Error] Salvage failed:', err.message);
  }
}

/**
 * Executes DDL schema setup and default constraints inside a transaction block.
 */
export function setupDatabaseTables(): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  db.withTransactionSync(() => {
    // A: Device Metadata Table
    db.execSync(`
      CREATE TABLE IF NOT EXISTS device_metadata (
        deviceId TEXT PRIMARY KEY NOT NULL,
        lastIssuedLogicalSequence INTEGER NOT NULL DEFAULT 0,
        installationId TEXT NOT NULL,
        clockEpoch TEXT NOT NULL
      );
    `);

    // B: Separate Cards Metadata
    db.execSync(`
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
    db.execSync(`
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
      const tableInfo = db.getAllSync<any>('PRAGMA table_info(cards_content);');
      const hasSlides = tableInfo.some((col: any) => col.name === 'slides');
      if (!hasSlides) {
        db.execSync('ALTER TABLE cards_content ADD COLUMN slides TEXT;');
        console.log('[SQLite Database] Migration: Added slides column to cards_content table.');
      }
    } catch (migErr: any) {
      console.warn('[SQLite Database Migration Warning] Failed to check/add slides column:', migErr.message);
    }

    // D: Folders Table
    db.execSync(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY NOT NULL,
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
        updatedAt TEXT NOT NULL
      );
    `);

    // E: Playlists Table
    db.execSync(`
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
        updatedAt TEXT NOT NULL
      );
    `);

    // F: Spaced Repetition Card Progress (Logical clocks only)
    db.execSync(`
      CREATE TABLE IF NOT EXISTS card_progress (
        cardId TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        completed INTEGER CHECK(completed IN (0, 1)) DEFAULT 0,
        revisionCount INTEGER DEFAULT 0,
        favorite INTEGER CHECK(favorite IN (0, 1)) DEFAULT 0,
        difficultyState TEXT CHECK(difficultyState IN ('easy', 'medium', 'hard', 'skipped', NULL)),
        revision INTEGER DEFAULT 0,
        favoritePendingSequence INTEGER DEFAULT 0,
        favoriteAckedSequence INTEGER DEFAULT 0,
        favoriteServerSequence INTEGER DEFAULT 0,
        favoriteClockEpoch TEXT,
        difficultyPendingSequence INTEGER DEFAULT 0,
        difficultyAckedSequence INTEGER DEFAULT 0,
        difficultyServerSequence INTEGER DEFAULT 0,
        difficultyClockEpoch TEXT,
        updatedAt TEXT NOT NULL
      );
    `);

    // G: Durable Offline Queue Table
    db.execSync(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY NOT NULL,
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

    // H: Sync Transactions Table
    db.execSync(`
      CREATE TABLE IF NOT EXISTS sync_transactions (
        transactionId TEXT PRIMARY KEY NOT NULL,
        startedAt INTEGER NOT NULL,
        batchPayload TEXT NOT NULL,
        acknowledged INTEGER CHECK(acknowledged IN (0, 1)) DEFAULT 0,
        committed INTEGER CHECK(committed IN (0, 1)) DEFAULT 0
      );
    `);

    // I: Delta Stream Checkpoints Table
    db.execSync(`
      CREATE TABLE IF NOT EXISTS delta_stream_checkpoints (
        transactionId TEXT PRIMARY KEY NOT NULL,
        bucket TEXT NOT NULL,
        revision INTEGER NOT NULL,
        pageNumber INTEGER NOT NULL,
        cursor TEXT,
        updatedAt INTEGER NOT NULL
      );
    `);

    // J: Translations Ledger
    db.execSync(`
      CREATE TABLE IF NOT EXISTS id_translations (
        tempId TEXT PRIMARY KEY NOT NULL,
        realId TEXT NOT NULL,
        mutationId TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
    `);

    // 3. Create High-Performance Indexes
    db.execSync('CREATE INDEX IF NOT EXISTS idx_cards_meta_folder ON cards_metadata(folderId);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_folders_revision ON folders(revision);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_playlists_revision ON playlists(revision);');
    db.execSync('CREATE INDEX IF NOT EXISTS idx_progress_revision ON card_progress(revision);');
  });

  console.log('[SQLite Database] Schema DDL, tables, and high-performance indexes created successfully.');
}

/**
 * Initializes and persists a secure clock epoch UUID on first startup.
 */
export function getOrCreateClockEpoch(): string {
  if (!isSQLiteAvailable()) return 'default-epoch';
  const db = getDatabase();
  try {
    const result = db.getFirstSync<{ clockEpoch: string }>('SELECT clockEpoch FROM device_metadata LIMIT 1;');
    if (result && result.clockEpoch) {
      return result.clockEpoch;
    }

    // Generate new stable UUID epoch
    const newEpoch = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const devId = `device-${Date.now()}`;
    
    db.runSync(
      'INSERT INTO device_metadata (deviceId, lastIssuedLogicalSequence, installationId, clockEpoch) VALUES (?, ?, ?, ?);',
      [devId, 0, devId, newEpoch]
    );

    console.log(`[SQLite Epoch] Created secure clock epoch: ${newEpoch}`);
    return newEpoch;
  } catch (err: any) {
    console.error('[SQLite Epoch Error] Failed to read/create epoch:', err.message);
    return 'default-epoch';
  }
}
