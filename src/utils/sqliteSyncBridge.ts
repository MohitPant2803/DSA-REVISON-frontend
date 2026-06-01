import { getDatabase, isSQLiteAvailable, sqliteLock, getOrCreateClockEpoch } from './sqliteDatabase';
import { OfflineAction } from '../store/usePlaylistStateStore';
import type { IFolder } from '@/types/folder';
import type { ApiPlaylist } from '@/services/playlistService';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import * as SecureStore from 'expo-secure-store';
import { profiler } from './profiler';

const ENCRYPTION_KEY_STORE_KEY = 'offline_queue_encryption_key';
export type DeletedEntityType = 'folder' | 'playlist' | 'card';

export interface LocalDeletedEntity {
  userId: string;
  entityId: string;
  entityType: DeletedEntityType;
  deletedAt: string;
  revision: number;
}

let cachedEncryptionKey: string | null = null;

/**
 * Resolves Loophole 82 & 103: Retrieve or rotate encryption key and cache it
 */
export async function initializeEncryptionKey(): Promise<string> {
  if (cachedEncryptionKey) return cachedEncryptionKey;
  try {
    let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_KEY);
    if (!key) {
      key = `k-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, key);
    }
    cachedEncryptionKey = key;
    return key;
  } catch {
    cachedEncryptionKey = 'default-fallback-key';
    return 'default-fallback-key';
  }
}

// Eagerly trigger caching in background on module load
initializeEncryptionKey().catch((err) => {
  console.warn('[SQLite Encryption] eager initialization warning:', err);
});

async function getOrCreateEncryptionKey(): Promise<string> {
  return await initializeEncryptionKey();
}

/**
 * Basic pure JS stream cipher (XOR-based) for lightweight payload encryption
 */
function encryptDecryptPayload(payload: string, key: string): string {
  let result = '';
  for (let i = 0; i < payload.length; i++) {
    result += String.fromCharCode(payload.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

/**
 * Encrypt a payload
 */
export async function encryptPayload(payload: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const cipher = encryptDecryptPayload(payload, key);
  try {
    const Buffer = require('buffer').Buffer;
    return Buffer.from(cipher, 'binary').toString('base64');
  } catch {
    return btoa(unescape(encodeURIComponent(cipher)));
  }
}

/**
 * Decrypt a payload
 */
export async function decryptPayload(cipherText: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  let binary = '';
  try {
    const Buffer = require('buffer').Buffer;
    binary = Buffer.from(cipherText, 'base64').toString('binary');
  } catch {
    binary = decodeURIComponent(escape(atob(cipherText)));
  }
  return encryptDecryptPayload(binary, key);
}

/**
 * Decrypt a payload synchronously using cached key
 */
export function decryptPayloadSync(cipherText: string): string {
  const key = cachedEncryptionKey || 'default-fallback-key';
  let binary = '';
  try {
    const Buffer = require('buffer').Buffer;
    binary = Buffer.from(cipherText, 'base64').toString('binary');
  } catch {
    try {
      binary = decodeURIComponent(escape(atob(cipherText)));
    } catch {
      binary = cipherText;
    }
  }
  return encryptDecryptPayload(binary, key);
}

/**
 * Resolves Loophole 103: Rotate encryption key and re-encrypt offline queue
 */
export async function rotateQueueEncryptionKey(): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync('Rotate Queue Encryption Key', async () => {
    const release = await sqliteLock.acquire();
    try {
      const oldKey = await getOrCreateEncryptionKey();
      const newKey = `k-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      const rows = await db.getAllAsync<any>('SELECT id, payload FROM offline_queue;');
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          let binary = '';
          try {
            const Buffer = require('buffer').Buffer;
            binary = Buffer.from(row.payload, 'base64').toString('binary');
          } catch {
            binary = decodeURIComponent(escape(atob(row.payload)));
          }
          const plain = encryptDecryptPayload(binary, oldKey);
          const cipher = encryptDecryptPayload(plain, newKey);
          let b64 = '';
          try {
            const Buffer = require('buffer').Buffer;
            b64 = Buffer.from(cipher, 'binary').toString('base64');
          } catch {
            b64 = btoa(unescape(encodeURIComponent(cipher)));
          }
          await db.runAsync('UPDATE offline_queue SET payload = ? WHERE id = ?;', [b64, row.id]);
        }
      });

      await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, newKey);
      cachedEncryptionKey = newKey;
      console.log('[SQLite Encryption] Queue encryption key rotated successfully.');
    } catch (err: any) {
      console.error('[SQLite Encryption Error] Key rotation failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Resolves Loophole 131: Canonical Deterministic Event Serialization
 */
export function canonicalSerialize(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') {
    if (typeof obj === 'number') {
      return Number.isInteger(obj) ? obj.toString() : obj.toFixed(6);
    }
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalSerialize).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => `"${key}":${canonicalSerialize(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Resolves Loophole 91: Hash and sign mutation payload
 */
export async function signMutationPayload(payload: any, token: string): Promise<string> {
  const serialized = canonicalSerialize(payload);
  const dataToSign = serialized + (token || '');
  try {
    const Crypto = require('expo-crypto');
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      dataToSign
    );
  } catch {
    let hash = 0;
    for (let i = 0; i < dataToSign.length; i++) {
      const char = dataToSign.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Helper to convert createdBy objects or strings into a stable database string.
 */
const getCreatedByString = (createdBy: any): string => {
  if (!createdBy) return 'unknown';
  if (typeof createdBy === 'string') return createdBy;
  if (typeof createdBy === 'object') {
    if (createdBy._id) return String(createdBy._id);
    if (createdBy.id) return String(createdBy.id);
  }
  return 'unknown';
};

/**
 * Helper to convert folderId objects or strings into a stable database string.
 */
const getFolderIdString = (folderId: any): string => {
  if (!folderId) return '';
  if (typeof folderId === 'string') return folderId;
  if (typeof folderId === 'object') {
    if (folderId._id) return String(folderId._id);
    if (folderId.id) return String(folderId.id);
  }
  return '';
};

// In-memory caching for deleted card, folder, and playlist IDs to avoid SQLite disk thrashing
let cachedDeletedCardIds: Set<string> | null = null;
let cachedDeletedFolderIds: Set<string> | null = null;
let cachedDeletedPlaylistIds: Set<string> | null = null;
let cachedDeletedUserId = '';

export function invalidateDeletedEntitiesCache() {
  cachedDeletedCardIds = null;
  cachedDeletedFolderIds = null;
  cachedDeletedPlaylistIds = null;
  cachedDeletedUserId = '';
}

export async function saveDeletedEntityToSQLite(
  entityId: string,
  entityType: DeletedEntityType,
  userId: string,
  deletedAt: string | Date = new Date(),
  revision = 0
): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  const cleanEntityId = String(entityId || '').split('-loop-')[0];
  if (!cleanEntityId) return;

  // Optimistically sync and update the in-memory cache
  if (userId) {
    if (cachedDeletedUserId !== userId) {
      invalidateDeletedEntitiesCache();
      cachedDeletedUserId = userId;
    }
    if (entityType === 'card') {
      if (!cachedDeletedCardIds) cachedDeletedCardIds = new Set();
      cachedDeletedCardIds.add(cleanEntityId);
    } else if (entityType === 'folder') {
      if (!cachedDeletedFolderIds) cachedDeletedFolderIds = new Set();
      cachedDeletedFolderIds.add(cleanEntityId);
    } else if (entityType === 'playlist') {
      if (!cachedDeletedPlaylistIds) cachedDeletedPlaylistIds = new Set();
      cachedDeletedPlaylistIds.add(cleanEntityId);
    }
  }

  try {
    const deletedAtIso = deletedAt instanceof Date ? deletedAt.toISOString() : new Date(deletedAt).toISOString();
    await db.runAsync(
      `INSERT INTO deleted_entities (userId, entityId, entityType, deletedAt, revision)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, entityId, entityType) DO UPDATE SET
         deletedAt=excluded.deletedAt,
         revision=max(deleted_entities.revision, excluded.revision);`,
      [userId, cleanEntityId, entityType, deletedAtIso, revision || 0]
    );
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveDeletedEntityToSQLite failed:', err.message);
  }
}

export async function isEntityDeletedInSQLite(userId: string, entityType: DeletedEntityType, entityId: string): Promise<boolean> {
  if (!isSQLiteAvailable()) return false;
  const cleanEntityId = String(entityId || '').split('-loop-')[0];
  if (!cleanEntityId) return false;

  try {
    const row = await executeQueryWithRecovery<any>(
      'SELECT entityId FROM deleted_entities WHERE userId = ? AND entityType = ? AND entityId = ? LIMIT 1;',
      [userId, entityType, cleanEntityId],
      2
    );
    return !!row;
  } catch (err: any) {
    console.error('[SQLite Bridge Error] isEntityDeletedInSQLite failed:', err.message);
    return false;
  }
}

export async function getDeletedEntityIdsFromSQLite(userId: string, entityType?: DeletedEntityType): Promise<Set<string>> {
  // Try serving from high-speed in-memory cache first
  if (userId && cachedDeletedUserId === userId) {
    if (entityType === 'card' && cachedDeletedCardIds) return cachedDeletedCardIds;
    if (entityType === 'folder' && cachedDeletedFolderIds) return cachedDeletedFolderIds;
    if (entityType === 'playlist' && cachedDeletedPlaylistIds) return cachedDeletedPlaylistIds;
  }

  if (!isSQLiteAvailable()) return new Set();

  try {
    const rows = entityType
      ? await executeGetAllQueryWithRecovery<any>('SELECT entityId FROM deleted_entities WHERE userId = ? AND entityType = ?;', [userId, entityType], 2)
      : await executeGetAllQueryWithRecovery<any>('SELECT entityId FROM deleted_entities WHERE userId = ?;', [userId], 2);
    
    const resultSet = new Set(rows.map((row) => String(row.entityId)));
    
    // Warm the cache with the fetched resultSet
    if (userId) {
      if (cachedDeletedUserId !== userId) {
        invalidateDeletedEntitiesCache();
        cachedDeletedUserId = userId;
      }
      if (entityType === 'card') cachedDeletedCardIds = resultSet;
      else if (entityType === 'folder') cachedDeletedFolderIds = resultSet;
      else if (entityType === 'playlist') cachedDeletedPlaylistIds = resultSet;
    }
    
    return resultSet;
  } catch (err: any) {
    console.error('[SQLite Bridge Error] getDeletedEntityIdsFromSQLite failed:', err.message);
    return new Set();
  }
}


function isCardDirty(incoming: any, cached: any): boolean {
  if (!cached) return true;
  
  const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const cachedTime = cached.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
  if (incomingTime !== cachedTime) return true;
  
  if (incoming.title !== cached.title) return true;
  if (incoming.topic !== cached.topic) return true;
  if (incoming.difficulty !== cached.difficulty) return true;
  if (incoming.isFavorite !== cached.isFavorite) return true;
  if (incoming.difficultyState !== cached.difficultyState) return true;
  
  const incomingQP = incoming.currentUserQuestionProgress;
  const cachedQP = cached.currentUserQuestionProgress;
  if ((incomingQP?.attemptStatus !== cachedQP?.attemptStatus) ||
      (incomingQP?.completedLoops !== cachedQP?.completedLoops)) return true;
      
  // If the cached card is not fully hydrated, it was loaded from SQLite metadata.
  // The full content is already stored in SQLite. If updatedAt matches, the SQLite content is identical.
  if (cached.isContentFullyHydrated !== false) {
    if (incoming.explanation !== undefined && incoming.explanation !== cached.explanation) return true;
    if (incoming.code !== undefined && incoming.code !== cached.code) return true;
  }
  
  return false;
}

function isFolderDirty(incoming: any, cached: any): boolean {
  if (!cached) return true;
  
  const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const cachedTime = cached.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
  if (incomingTime !== cachedTime) return true;
  
  if (incoming.title !== cached.title) return true;
  if (incoming.description !== cached.description) return true;
  if (incoming.icon !== cached.icon) return true;
  if (incoming.color !== cached.color) return true;
  if (incoming.order !== cached.order) return true;
  if (incoming.parentFolderId !== cached.parentFolderId) return true;
  
  const incomingCards = Array.isArray(incoming.cardIds) ? incoming.cardIds : [];
  const cachedCards = Array.isArray(cached.cardIds) ? cached.cardIds : [];
  if (incomingCards.length !== cachedCards.length) return true;
  for (let i = 0; i < incomingCards.length; i++) {
    if (incomingCards[i] !== cachedCards[i]) return true;
  }
  
  return false;
}

function isPlaylistDirty(incoming: any, cached: any): boolean {
  if (!cached) return true;
  
  const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const cachedTime = cached.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
  if (incomingTime !== cachedTime) return true;
  
  if (incoming.name !== cached.name) return true;
  if (incoming.title !== cached.title) return true;
  if (incoming.description !== cached.description) return true;
  if (incoming.color1 !== cached.color1) return true;
  if (incoming.color2 !== cached.color2) return true;
  
  const incomingCards = incoming.cardIds || incoming.orderedCardIds || [];
  const cachedCards = cached.cardIds || cached.orderedCardIds || [];
  if (incomingCards.length !== cachedCards.length) return true;
  for (let i = 0; i < incomingCards.length; i++) {
    if (incomingCards[i] !== cachedCards[i]) return true;
  }
  
  return false;
}

/**
 * Helper: Safely get a database connection with recovery on released connections
 * Uses lock to prevent concurrent initialization attempts
 */
async function getSafeDatabaseConnection(): Promise<any> {
  if (!isSQLiteAvailable()) return null;
  
  const release = await sqliteLock.acquire();
  try {
    // First attempt: get current instance
    try {
      return getDatabase();
    } catch (e) {
      // Database not initialized yet, fall through to init
    }

    // Second attempt: reinitialize if needed
    console.warn('[SQLite Bridge] Reinitializing database connection...');
    const { resetDatabaseInstance, initializeDatabaseAsync } = require('./sqliteDatabase');
    await resetDatabaseInstance();
    return await initializeDatabaseAsync();
  } finally {
    release();
  }
}

/**
 * Executes a query with automatic recovery on connection errors
 * Used for all read operations to handle "released connection" scenarios
 */
async function executeQueryWithRecovery<T>(
  query: string,
  params: any[],
  retryCount: number = 2
): Promise<T | null> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const release = await sqliteLock.acquire();
      try {
        const db = getDatabase();
        return await db.getFirstAsync<T>(query, params);
      } finally {
        release();
      }
    } catch (err: any) {
      lastError = err;
      console.error(`[SQLite Query] Attempt ${attempt + 1}/${retryCount} failed:`, err.message);
      
      // Check if it's a released connection error
      const isReleasedError = err.message && (
        err.message.includes('released') || 
        err.message.includes('NativeDatabase') ||
        err.message.includes('NativeStatement')
      );
      
      if (isReleasedError && attempt < retryCount - 1) {
        console.warn('[SQLite Query] Detected released connection. Attempting recovery...');
        const release2 = await sqliteLock.acquire();
        try {
          const { resetDatabaseInstance, initializeDatabaseAsync } = require('./sqliteDatabase');
          await resetDatabaseInstance();
          await initializeDatabaseAsync();
          console.warn('[SQLite Query] Recovery complete. Retrying query...');
        } catch (recoveryErr: any) {
          console.error('[SQLite Query Recovery] Failed:', recoveryErr.message);
        } finally {
          release2();
        }
      } else if (!isReleasedError) {
        // Not a recoverable error, fail immediately
        break;
      }
    }
  }
  
  console.error('[SQLite Query] All retries exhausted:', lastError?.message);
  return null;
}

/**
 * Executes an getAllAsync query with automatic recovery on connection errors
 * Used for batch read operations to handle "released connection" scenarios
 */
async function executeGetAllQueryWithRecovery<T>(
  query: string,
  params: any[],
  retryCount: number = 2
): Promise<T[]> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const release = await sqliteLock.acquire();
      try {
        const db = getDatabase();
        return await db.getAllAsync<T>(query, params);
      } finally {
        release();
      }
    } catch (err: any) {
      lastError = err;
      console.error(`[SQLite GetAll Query] Attempt ${attempt + 1}/${retryCount} failed:`, err.message);
      
      // Check if it's a released connection error
      const isReleasedError = err.message && (
        err.message.includes('released') || 
        err.message.includes('NativeDatabase') ||
        err.message.includes('NativeStatement')
      );
      
      if (isReleasedError && attempt < retryCount - 1) {
        console.warn('[SQLite GetAll Query] Detected released connection. Attempting recovery...');
        const release2 = await sqliteLock.acquire();
        try {
          const { resetDatabaseInstance, initializeDatabaseAsync } = require('./sqliteDatabase');
          await resetDatabaseInstance();
          await initializeDatabaseAsync();
          console.warn('[SQLite GetAll Query] Recovery complete. Retrying query...');
        } catch (recoveryErr: any) {
          console.error('[SQLite GetAll Query Recovery] Failed:', recoveryErr.message);
        } finally {
          release2();
        }
      } else if (!isReleasedError) {
        // Not a recoverable error, fail immediately
        break;
      }
    }
  }
  
  console.error('[SQLite GetAll Query] All retries exhausted:', lastError?.message);
  return [];
}

export async function getCardFullContentFromSQLite(cardId: string): Promise<any> {
  if (!isSQLiteAvailable()) return null;
  const cleanId = cardId.split('-loop-')[0];
  
  try {
    const row = await executeQueryWithRecovery<any>(
      'SELECT explanation, code, imageBlobPath, imageHash, examples, slides FROM cards_content WHERE cardId = ? LIMIT 1;',
      [cleanId],
      2
    );
    
    if (row) {
      return {
        explanation: row.explanation || '',
        code: row.code || '',
        imageBlobPath: row.imageBlobPath || undefined,
        imageHash: row.imageHash || undefined,
        examples: row.examples ? JSON.parse(row.examples) : [],
        slides: row.slides ? JSON.parse(row.slides) : undefined,
      };
    }
  } catch (err: any) {
    console.error('[SQLite Bridge Error] getCardFullContentFromSQLite final failure:', err.message);
  }
  
  return null;
}

/**
 * Bulk-loads card content in CHUNKS to avoid frame drops.
 * Processes 100 cards at a time, spreading work across multiple frames.
 */
export async function bulkHydrateAllCardContent(): Promise<Record<string, any>> {
  if (!isSQLiteAvailable()) return {};
  
  return profiler.profileAsync('Bulk Hydrate All Card Content', async () => {
    let retries = 0;
    const maxRetries = 2;
    const BATCH_SIZE = 100; // Process 100 cards per batch to stay under frame budget
    
    while (retries < maxRetries) {
      try {
        const release = await sqliteLock.acquire();
        try {
          const db = getDatabase();
          const rows = await db.getAllAsync<any>(
            'SELECT cardId, explanation, code, imageBlobPath, imageHash, examples, slides FROM cards_content;'
          );
          
          const contentMap: Record<string, any> = {};
          
          // Process rows in batches to avoid frame blocking
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            
            // Process this batch synchronously
            for (const row of batch) {
              if (!row.cardId) continue;
              contentMap[row.cardId] = {
                explanation: row.explanation || '',
                code: row.code || '',
                imageBlobPath: row.imageBlobPath || undefined,
                imageHash: row.imageHash || undefined,
                examples: row.examples ? JSON.parse(row.examples) : [],
                slides: row.slides ? JSON.parse(row.slides) : undefined,
              };
            }
            
            // Yield to allow other work (requestIdleCallback or setTimeout 0)
            await new Promise(resolve => {
              if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(() => resolve(undefined), { timeout: 50 });
              } else {
                setTimeout(() => resolve(undefined), 0);
              }
            });
          }
          
          if (__DEV__) {
            console.log(`[SQLite Bulk Hydration] Loaded full content for ${Object.keys(contentMap).length} cards in batches of ${BATCH_SIZE}`);
          }
          return contentMap;
        } finally {
          release();
        }
      } catch (err: any) {
        console.error(`[SQLite Bridge Error] bulkHydrateAllCardContent failed (attempt ${retries + 1}/${maxRetries}):`, err.message);
        
        // Check if it's a released connection error
        const isReleasedError = err.message && (
          err.message.includes('released') || 
          err.message.includes('NativeDatabase') ||
          err.message.includes('NativeStatement')
        );
        
        if (isReleasedError && retries < maxRetries - 1) {
          console.warn('[SQLite Bridge] Detected released connection during bulk hydration. Attempting recovery...');
          const release2 = await sqliteLock.acquire();
          try {
            const { resetDatabaseInstance, initializeDatabaseAsync } = require('./sqliteDatabase');
            await resetDatabaseInstance();
            await initializeDatabaseAsync();
            console.warn('[SQLite Bridge] Recovery complete for bulk hydration. Retrying...');
          } catch (recoveryErr: any) {
            console.error('[SQLite Bridge Recovery] Bulk hydration recovery failed:', recoveryErr.message);
            break;
          } finally {
            release2();
          }
          retries++;
        } else {
          // Not a recoverable error or max retries reached
          break;
        }
      }
    }
    
    return {};
  });
}

/**
 * Saves a list of folders to SQLite asynchronously.
 */
export async function saveFoldersToSQLite(folders: IFolder[], userId: string): Promise<void> {
  if (!isSQLiteAvailable() || folders.length === 0) return;
  const db = getDatabase();
  await profiler.profileAsync(`Save ${folders.length} Folders to SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      const deletedFolderIds = await getDeletedEntityIdsFromSQLite(userId, 'folder');
      const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
      const state = usePlaylistStateStore.getState();
      const activeFolders = folders.filter(f => {
        if (!f || !f._id) return false;
        if (deletedFolderIds.has(f._id)) return false;
        const cached = state.foldersById[f._id];
        return isFolderDirty(f, cached);
      });

      if (activeFolders.length === 0) return;

      const CHUNK_SIZE = 50;
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < activeFolders.length; i += CHUNK_SIZE) {
          const chunk = activeFolders.slice(i, i + CHUNK_SIZE);
          const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const values = chunk.flatMap(folder => [
            folder._id,
            userId,
            folder.title || '',
            folder.description || '',
            folder.icon || 'folder',
            folder.color || '#7c3aed',
            getCreatedByString(folder.createdBy),
            folder.visibility || 'public',
            folder.order || 0,
            folder.parentFolderId || null,
            Array.isArray(folder.cardIds) ? JSON.stringify(folder.cardIds) : '[]',
            (folder as any).revision || 0,
            (folder as any).pendingLogicalSequence || 0,
            (folder as any).ackedLogicalSequence || 0,
            (folder as any).serverLogicalSequence || 0,
            (folder as any).clockEpoch || 'default-epoch',
            folder.updatedAt ? new Date(folder.updatedAt).toISOString() : new Date().toISOString(),
            (folder as any).isDeleted ? 1 : 0,
            (folder as any).deletedAt ? new Date((folder as any).deletedAt).toISOString() : null
          ]);

          await db.runAsync(`
            INSERT INTO folders (
              id, userId, title, description, icon, color, createdBy, visibility, "order", parentFolderId, cardIds, revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
            ) VALUES ${placeholders}
            ON CONFLICT(id) DO UPDATE SET
              userId=excluded.userId,
              title=excluded.title,
              description=excluded.description,
              icon=excluded.icon,
              color=excluded.color,
              createdBy=excluded.createdBy,
              visibility=excluded.visibility,
              "order"=excluded."order",
              parentFolderId=excluded.parentFolderId,
              cardIds=excluded.cardIds,
              revision=excluded.revision,
              pendingLogicalSequence=excluded.pendingLogicalSequence,
              ackedLogicalSequence=excluded.ackedLogicalSequence,
              serverLogicalSequence=excluded.serverLogicalSequence,
              clockEpoch=excluded.clockEpoch,
              updatedAt=excluded.updatedAt,
              isDeleted=excluded.isDeleted,
              deletedAt=excluded.deletedAt;
          `, values);
        }
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] saveFoldersToSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Deletes a folder from SQLite asynchronously.
 */
export async function deleteFolderFromSQLite(folderId: string, userId: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Delete Folder ${folderId} from SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      const cleanId = folderId.split('-loop-')[0];
      await db.withTransactionAsync(async () => {
        await saveDeletedEntityToSQLite(cleanId, 'folder', userId);
        await db.runAsync('DELETE FROM folders WHERE id = ? AND userId = ?;', [cleanId, userId]);
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] deleteFolderFromSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Saves a list of playlists to SQLite asynchronously.
 */
export async function savePlaylistsToSQLite(playlists: ApiPlaylist[], userId: string): Promise<void> {
  if (!isSQLiteAvailable() || playlists.length === 0) return;
  const db = getDatabase();
  await profiler.profileAsync(`Save ${playlists.length} Playlists to SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      const deletedPlaylistIds = await getDeletedEntityIdsFromSQLite(userId, 'playlist');
      const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
      const state = usePlaylistStateStore.getState();
      const activePlaylists = playlists.filter(p => {
        if (!p || !p._id) return false;
        if (deletedPlaylistIds.has(p._id)) return false;
        const cached = state.playlistsById[p._id];
        return isPlaylistDirty(p, cached);
      });

      if (activePlaylists.length === 0) return;

      const CHUNK_SIZE = 50;
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < activePlaylists.length; i += CHUNK_SIZE) {
          const chunk = activePlaylists.slice(i, i + CHUNK_SIZE);
          const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const values = chunk.flatMap(p => {
            const cardIdsList = p.cardIds || p.orderedCardIds || [];
            return [
              p._id,
              userId,
              p.name || '',
              (p as any).title || p.name || '',
              p.description || '',
              p.color1 || '',
              p.color2 || '',
              p.itemCount ?? cardIdsList.length,
              JSON.stringify(cardIdsList),
              (p as any).revision || 0,
              (p as any).pendingLogicalSequence || 0,
              (p as any).ackedLogicalSequence || 0,
              (p as any).serverLogicalSequence || 0,
              (p as any).clockEpoch || 'default-epoch',
              (p as any).updatedAt ? new Date((p as any).updatedAt).toISOString() : new Date().toISOString(),
              (p as any).isDeleted ? 1 : 0,
              (p as any).deletedAt ? new Date((p as any).deletedAt).toISOString() : null
            ];
          });

          await db.runAsync(`
            INSERT INTO playlists (
              id, userId, name, title, description, color1, color2, itemCount, cardIds, revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
            ) VALUES ${placeholders}
            ON CONFLICT(id) DO UPDATE SET
              userId=excluded.userId,
              name=excluded.name,
              title=excluded.title,
              description=excluded.description,
              color1=excluded.color1,
              color2=excluded.color2,
              itemCount=excluded.itemCount,
              cardIds=excluded.cardIds,
              revision=excluded.revision,
              pendingLogicalSequence=excluded.pendingLogicalSequence,
              ackedLogicalSequence=excluded.ackedLogicalSequence,
              serverLogicalSequence=excluded.serverLogicalSequence,
              clockEpoch=excluded.clockEpoch,
              updatedAt=excluded.updatedAt,
              isDeleted=excluded.isDeleted,
              deletedAt=excluded.deletedAt;
          `, values);
        }
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] savePlaylistsToSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Deletes a playlist from SQLite asynchronously.
 */
export async function deletePlaylistFromSQLite(playlistId: string, userId: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Delete Playlist ${playlistId} from SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      const cleanId = playlistId.split('-loop-')[0];
      await db.withTransactionAsync(async () => {
        await saveDeletedEntityToSQLite(cleanId, 'playlist', userId);
        await db.runAsync(
          `UPDATE playlists SET isDeleted = 1, deletedAt = ? WHERE id = ? AND userId = ?;`,
          [new Date().toISOString(), cleanId, userId]
        );
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] deletePlaylistFromSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Saves a list of populated cards to SQLite asynchronously.
 */
export async function saveCardsToSQLite(cards: IPopulatedRevisionCard[], userId: string): Promise<void> {
  if (!isSQLiteAvailable() || cards.length === 0) return;
  const db = getDatabase();
  await profiler.profileAsync(`Save ${cards.length} Cards to SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      const deletedCardIds = await getDeletedEntityIdsFromSQLite(userId, 'card');
      const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
      const state = usePlaylistStateStore.getState();
      const activeCards = cards.filter(c => {
        if (!c || !c._id) return false;
        const cleanId = c._id.split('-loop-')[0];
        if (deletedCardIds.has(cleanId)) return false;
        const cached = state.cardsById[cleanId];
        return isCardDirty(c, cached);
      });

      if (activeCards.length === 0) return;

      const CHUNK_SIZE = 50;
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < activeCards.length; i += CHUNK_SIZE) {
          const chunk = activeCards.slice(i, i + CHUNK_SIZE);

          // 1. Batch insert into cards_metadata
          const metadataPlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const metadataValues = chunk.flatMap(c => {
            const cleanId = c._id.split('-loop-')[0];
            return [
              cleanId,
              c.title || '',
              c.topic || '',
              Array.isArray(c.tags) ? JSON.stringify(c.tags) : '[]',
              c.difficulty || 'Easy',
              getFolderIdString(c.folderId),
              getCreatedByString(c.createdBy),
              c.visibility || 'public',
              c.order || 0,
              (c as any).isDeleted ? 1 : 0,
              c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
            ];
          });
          await db.runAsync(`
            INSERT INTO cards_metadata (
              id, title, topic, tags, difficulty, folderId, createdBy, visibility, "order", isDeleted, updatedAt
            ) VALUES ${metadataPlaceholders}
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title,
              topic=excluded.topic,
              tags=excluded.tags,
              difficulty=excluded.difficulty,
              folderId=excluded.folderId,
              createdBy=excluded.createdBy,
              visibility=excluded.visibility,
              "order"=excluded."order",
              isDeleted=excluded.isDeleted,
              updatedAt=excluded.updatedAt;
          `, metadataValues);

          // 2. Batch insert into cards_content
          const contentPlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
          const contentValues = chunk.flatMap(c => {
            const cleanId = c._id.split('-loop-')[0];
            return [
              cleanId,
              c.explanation || '',
              c.code || '',
              (c as any).imageBlobPath || null,
              (c as any).imageHash || null,
              Array.isArray((c as any).examples) ? JSON.stringify((c as any).examples) : '[]',
              c.slides ? JSON.stringify(c.slides) : null
            ];
          });
          await db.runAsync(`
            INSERT INTO cards_content (
              cardId, explanation, code, imageBlobPath, imageHash, examples, slides
            ) VALUES ${contentPlaceholders}
            ON CONFLICT(cardId) DO UPDATE SET
              explanation=excluded.explanation,
              code=excluded.code,
              imageBlobPath=excluded.imageBlobPath,
              imageHash=excluded.imageHash,
              examples=excluded.examples,
              slides=excluded.slides;
          `, contentValues);

          // 3. Batch insert into card_progress
          const progressPlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const progressValues = chunk.flatMap(c => {
            const cleanId = c._id.split('-loop-')[0];
            const qp = c.currentUserQuestionProgress;
            const isCompleted = qp?.attemptStatus === 'attempted' ? 1 : 0;
            const revisionCount = (qp as any)?.completedLoops || 0;
            const isFavorite = c.isFavorite ? 1 : 0;
            const diffState = c.difficultyState || null;
            return [
              cleanId,
              userId,
              isCompleted,
              revisionCount,
              isFavorite,
              diffState,
              (c as any).revision || 0,
              (c as any).favoritePendingSequence || 0,
              (c as any).favoriteAckedSequence || 0,
              (c as any).favoriteServerSequence || 0,
              (c as any).favoriteClockEpoch || null,
              (c as any).difficultyPendingSequence || 0,
              (c as any).difficultyAckedSequence || 0,
              (c as any).difficultyServerSequence || 0,
              (c as any).difficultyClockEpoch || null,
              c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
            ];
          });
          await db.runAsync(`
            INSERT INTO card_progress (
              cardId, userId, completed, revisionCount, favorite, difficultyState, revision, favoritePendingSequence, favoriteAckedSequence, favoriteServerSequence, favoriteClockEpoch, difficultyPendingSequence, difficultyAckedSequence, difficultyServerSequence, difficultyClockEpoch, updatedAt
            ) VALUES ${progressPlaceholders}
            ON CONFLICT(cardId, userId) DO UPDATE SET
              completed=excluded.completed,
              revisionCount=excluded.revisionCount,
              favorite=excluded.favorite,
              difficultyState=excluded.difficultyState,
              revision=excluded.revision,
              favoritePendingSequence=excluded.favoritePendingSequence,
              favoriteAckedSequence=excluded.favoriteAckedSequence,
              favoriteServerSequence=excluded.favoriteServerSequence,
              favoriteClockEpoch=excluded.favoriteClockEpoch,
              difficultyPendingSequence=excluded.difficultyPendingSequence,
              difficultyAckedSequence=excluded.difficultyAckedSequence,
              difficultyServerSequence=excluded.difficultyServerSequence,
              difficultyClockEpoch=excluded.difficultyClockEpoch,
              updatedAt=excluded.updatedAt;
          `, progressValues);
        }
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] saveCardsToSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Saves a list of senior quotes to SQLite asynchronously.
 */
export async function saveSeniorQuotesToSQLite(quotes: any[], userId: string): Promise<void> {
  if (!isSQLiteAvailable() || quotes.length === 0) return;
  const db = getDatabase();
  await profiler.profileAsync(`Save ${quotes.length} Senior Quotes to SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      await db.withTransactionAsync(async () => {
        for (const q of quotes) {
          if (!q || !q._id) continue;
          await db.runAsync(`
            INSERT INTO senior_quotes (
              id, userId, text, author, collegeName, branch, yearOfGraduation, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              userId=excluded.userId,
              text=excluded.text,
              author=excluded.author,
              collegeName=excluded.collegeName,
              branch=excluded.branch,
              yearOfGraduation=excluded.yearOfGraduation,
              updatedAt=excluded.updatedAt;
          `, [
            q._id,
            userId,
            q.text || '',
            q.author || 'Anonymous',
            q.collegeName || null,
            q.branch || null,
            q.yearOfGraduation || null,
            q.updatedAt ? new Date(q.updatedAt).toISOString() : new Date().toISOString()
          ]);
        }
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] saveSeniorQuotesToSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Deletes a card from SQLite asynchronously.
 */
export async function deleteCardFromSQLite(cardId: string, userId: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Delete Card ${cardId} from SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      const cleanId = cardId.split('-loop-')[0];
      await db.withTransactionAsync(async () => {
        await saveDeletedEntityToSQLite(cleanId, 'card', userId);
        await db.runAsync('DELETE FROM cards_metadata WHERE id = ?;', [cleanId]);
        await db.runAsync('DELETE FROM card_progress WHERE cardId = ? AND userId = ?;', [cleanId, userId]);
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] deleteCardFromSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Enqueues an offline action into SQLite with Rest-Encryption asynchronously.
 */
export async function enqueueActionInSQLite(action: OfflineAction, userId: string, clockEpoch: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Enqueue Action ${action.action} in SQLite`, async () => {
    try {
      const payloadStr = JSON.stringify(action.payload || {});
      const encryptedPayload = await encryptPayload(payloadStr);

      await db.runAsync(`
        INSERT OR REPLACE INTO offline_queue (
          id, userId, action, payload, timestamp, retryCount, localRevision, deviceId, logicalSequence, clockEpoch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `, [
        action.id,
        userId,
        action.action,
        encryptedPayload,
        action.timestamp,
        action.retryCount || 0,
        action.localRevision || 0,
        action.deviceId || 'unknown',
        action.logicalSequence || 0,
        clockEpoch
      ]);
    } catch (err: any) {
      console.error('[SQLite Bridge Error] enqueueActionInSQLite failed:', err.message);
    }
  });
}

/**
 * Removes multiple acknowledged offline actions from SQLite asynchronously.
 */
export async function removeProcessedActionsFromSQLite(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0 || !isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Remove ${ids.length} Processed Actions from SQLite`, async () => {
    const release = await sqliteLock.acquire();
    try {
      await db.withTransactionAsync(async () => {
        for (const id of ids) {
          const row = await db.getFirstAsync<{ action: string, payload?: string }>(
            'SELECT action, payload FROM offline_queue WHERE id = ? AND userId = ? LIMIT 1;',
            [id, userId]
          );
          if (row) {
            const action = row.action;
            let payload: any = null;
            if (row.payload) {
              try {
                const decrypted = decryptPayloadSync(row.payload);
                payload = JSON.parse(decrypted);
              } catch (decErr) {
                console.warn(`[SQLite Bridge Warning] removeProcessedActionsFromSQLite failed to decrypt payload for queue ID ${id}:`, decErr);
              }
            }
            if (payload) {
              if (action === 'DELETE_PLAYLIST' && payload.playlistId) {
                await db.runAsync('DELETE FROM playlists WHERE id = ? AND userId = ?;', [payload.playlistId, userId]);
                console.log(`[SQLite Bridge] Acknowledged DELETE_PLAYLIST: permanently removed playlist ${payload.playlistId}`);
              } else if (action === 'DELETE_FOLDER' && payload.folderId) {
                await db.runAsync('DELETE FROM folders WHERE id = ? AND userId = ?;', [payload.folderId, userId]);
                console.log(`[SQLite Bridge] Acknowledged DELETE_FOLDER: permanently removed folder ${payload.folderId}`);
              }
            }
          }
        }

        for (const id of ids) {
          await db.runAsync('DELETE FROM offline_queue WHERE id = ? AND userId = ?;', [id, userId]);
        }
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] removeProcessedActionsFromSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Durably removes replayed logs and updates cursors from SQLite inside a single atomic transaction asynchronously.
 */
export async function acknowledgeMutationsTransaction(ids: string[], userId: string, lastAppliedId: string): Promise<void> {
  if (ids.length === 0 || !isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Acknowledge ${ids.length} Mutations in Single SQL Transaction`, async () => {
    const release = await sqliteLock.acquire();
    try {
      // 1. Fetch all mutations and decrypt payloads in a single SELECT query before transaction starts
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.getAllAsync<any>(
        `SELECT id, action, payload FROM offline_queue WHERE id IN (${placeholders}) AND userId = ?;`,
        [...ids, userId]
      );

      const playlistIdsToDelete: string[] = [];
      const folderIdsToDelete: string[] = [];
      const queueIdsToDelete: string[] = [];

      for (const row of rows) {
        queueIdsToDelete.push(row.id);
        const action = row.action;
        if (row.payload) {
          try {
            const decrypted = decryptPayloadSync(row.payload);
            const payload = JSON.parse(decrypted);
            if (payload) {
              if (action === 'DELETE_PLAYLIST' && payload.playlistId) {
                playlistIdsToDelete.push(payload.playlistId);
              } else if (action === 'DELETE_FOLDER' && payload.folderId) {
                folderIdsToDelete.push(payload.folderId);
              }
            }
          } catch (decErr) {
            console.warn(`[SQLite Bridge Warning] acknowledgeMutationsTransaction failed to decrypt payload for queue ID ${row.id}:`, decErr);
          }
        }
      }

      // 2. Perform all deletes durably inside a single atomic SQL transaction
      await db.withTransactionAsync(async () => {
        if (playlistIdsToDelete.length > 0) {
          const plsPlaceholders = playlistIdsToDelete.map(() => '?').join(',');
          await db.runAsync(`DELETE FROM playlists WHERE id IN (${plsPlaceholders}) AND userId = ?;`, [...playlistIdsToDelete, userId]);
          console.log(`[SQLite Bridge] Acknowledged DELETE_PLAYLIST: permanently removed ${playlistIdsToDelete.length} playlists`);
        }
        if (folderIdsToDelete.length > 0) {
          const fldPlaceholders = folderIdsToDelete.map(() => '?').join(',');
          await db.runAsync(`DELETE FROM folders WHERE id IN (${fldPlaceholders}) AND userId = ?;`, [...folderIdsToDelete, userId]);
          console.log(`[SQLite Bridge] Acknowledged DELETE_FOLDER: permanently removed ${folderIdsToDelete.length} folders`);
        }
        if (queueIdsToDelete.length > 0) {
          const qPlaceholders = queueIdsToDelete.map(() => '?').join(',');
          await db.runAsync(`DELETE FROM offline_queue WHERE id IN (${qPlaceholders}) AND userId = ?;`, [...queueIdsToDelete, userId]);
        }
        await db.runAsync(
          `INSERT INTO sync_cursors (userId, lastAppliedMutationId, updatedAt) VALUES (?, ?, ?)
           ON CONFLICT(userId) DO UPDATE SET lastAppliedMutationId=excluded.lastAppliedMutationId, updatedAt=excluded.updatedAt;`,
          [userId, lastAppliedId, Date.now()]
        );
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] acknowledgeMutationsTransaction failed:', err.message);
      throw err;
    } finally {
      release();
    }
  });
}

/**
 * Wipes all enqueued offline actions from SQLite asynchronously.
 */
export async function clearOfflineActionsInSQLite(userId: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    await db.runAsync('DELETE FROM offline_queue WHERE userId = ?;', [userId]);
  } catch (err: any) {
    console.error('[SQLite Bridge Error] clearOfflineActionsInSQLite failed:', err.message);
  }
}

/**
 * Restructures and loads critical state (folders, playlists, queue) immediately.
 * Defers card metadata and content loading to avoid startup frame drops.
 */
export async function loadStateFromSQLite(userId: string) {
  if (!isSQLiteAvailable()) return null;
  const db = getDatabase();
  return profiler.profileAsync('Load Entire Database Snapshot Async', async () => {
    try {
      // CRITICAL PATH: Load essential layout/seeder data in parallel
      const [
        foldersRows,
        playlistsRows,
        progressRows,
        queueRows,
        folderTombstones,
        playlistTombstones,
        cardTombstones,
        deletedEntitiesRows,
        syncCursorRow,
        quotesRows,
        sessionRow
      ] = await Promise.all([
        db.getAllAsync<any>('SELECT * FROM folders WHERE userId = ? AND isDeleted = 0;', [userId]),
        db.getAllAsync<any>('SELECT * FROM playlists WHERE userId = ? AND isDeleted = 0;', [userId]),
        db.getAllAsync<any>('SELECT * FROM card_progress WHERE userId = ?;', [userId]),
        db.getAllAsync<any>('SELECT * FROM offline_queue WHERE userId = ? ORDER BY timestamp ASC;', [userId]),
        getDeletedEntityIdsFromSQLite(userId, 'folder'),
        getDeletedEntityIdsFromSQLite(userId, 'playlist'),
        getDeletedEntityIdsFromSQLite(userId, 'card'),
        db.getAllAsync<LocalDeletedEntity>('SELECT userId, entityId, entityType, deletedAt, revision FROM deleted_entities WHERE userId = ?;', [userId]),
        db.getFirstAsync<any>('SELECT lastPulledRevision, updatedAt FROM sync_cursors WHERE userId = ?;', [userId]),
        db.getAllAsync<any>('SELECT * FROM senior_quotes WHERE userId = ?;', [userId]),
        db.getFirstAsync<any>('SELECT selectedRootFolderIds, currentQuoteIndex FROM reel_sessions WHERE userId = ?;', [userId])
      ]);

      // Process Folders
      const foldersById: Record<string, any> = {};
      foldersRows.forEach((row) => {
        if (folderTombstones.has(row.id)) return;
        foldersById[row.id] = {
          _id: row.id,
          userId: row.userId,
          title: row.title,
          description: row.description,
          icon: row.icon,
          color: row.color,
          createdBy: row.createdBy,
          visibility: row.visibility,
          order: row.order,
          parentFolderId: row.parentFolderId,
          cardIds: row.cardIds ? JSON.parse(row.cardIds) : [],
          revision: row.revision,
          pendingLogicalSequence: row.pendingLogicalSequence,
          ackedLogicalSequence: row.ackedLogicalSequence,
          serverLogicalSequence: row.serverLogicalSequence,
          clockEpoch: row.clockEpoch,
          updatedAt: row.updatedAt,
        };
      });

      // Process Playlists
      const playlistsById: Record<string, any> = {};
      playlistsRows.forEach((row) => {
        if (playlistTombstones.has(row.id)) return;
        const rawCardIds = row.cardIds ? JSON.parse(row.cardIds) : [];
        playlistsById[row.id] = {
          _id: row.id,
          userId: row.userId,
          name: row.name,
          title: row.title,
          description: row.description,
          color1: row.color1,
          color2: row.color2,
          itemCount: row.itemCount,
          cardIds: rawCardIds.filter((id: string) => !cardTombstones.has(String(id).split('-loop-')[0])),
          revision: row.revision,
          pendingLogicalSequence: row.pendingLogicalSequence,
          ackedLogicalSequence: row.ackedLogicalSequence,
          serverLogicalSequence: row.serverLogicalSequence,
          clockEpoch: row.clockEpoch,
          updatedAt: row.updatedAt,
        };
      });

      // Process Progress Map
      const progressMap: Record<string, any> = {};
      progressRows.forEach((row) => {
        progressMap[row.cardId] = {
          completed: row.completed === 1,
          revisionCount: row.revisionCount,
          favorite: row.favorite === 1,
          difficultyState: row.difficultyState,
          revision: row.revision,
          favoritePendingSequence: row.favoritePendingSequence,
          favoriteAckedSequence: row.favoriteAckedSequence,
          favoriteServerSequence: row.favoriteServerSequence,
          favoriteClockEpoch: row.favoriteClockEpoch,
          difficultyPendingSequence: row.difficultyPendingSequence,
          difficultyAckedSequence: row.difficultyAckedSequence,
          difficultyServerSequence: row.difficultyServerSequence,
          difficultyClockEpoch: row.difficultyClockEpoch,
          updatedAt: row.updatedAt,
        };
      });

      // Decrypt queue payloads
      const offlineActionQueue: OfflineAction[] = [];
      for (const row of queueRows) {
        let plainPayload = '{}';
        try {
          plainPayload = await decryptPayload(row.payload);
        } catch (decErr) {
          console.warn(`[SQLite Decrypt Error] Failed decrypting queue payload: ${row.id}`, decErr);
        }
        offlineActionQueue.push({
          id: row.id,
          action: row.action as any,
          payload: JSON.parse(plainPayload),
          timestamp: row.timestamp,
          retryCount: 0,
        });
      }

      // Process Sync Cursor
      let lastSyncedRevision = 0;
      let lastSyncedAt: string | null = null;
      if (syncCursorRow) {
        lastSyncedRevision = syncCursorRow.lastPulledRevision || 0;
        lastSyncedAt = syncCursorRow.updatedAt ? new Date(syncCursorRow.updatedAt).toISOString() : null;
      }

      // Process Senior Quotes
      let seniorQuotes = quotesRows.map((r: any) => ({
        _id: r.id,
        text: r.text,
        author: r.author,
        collegeName: r.collegeName,
        branch: r.branch,
        yearOfGraduation: r.yearOfGraduation
      }));
      if (seniorQuotes.length === 0) {
        const defaultQuote = {
          id: "6a13357421b348638d89b061",
          userId,
          text: "It's a marathon to be endured, not a sprint to be ran.",
          author: "Mohit Pant",
          collegeName: "IIT KGP",
          branch: "Mining",
          yearOfGraduation: 2027,
          updatedAt: new Date().toISOString()
        };
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO senior_quotes (id, userId, text, author, collegeName, branch, yearOfGraduation, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [defaultQuote.id, defaultQuote.userId, defaultQuote.text, defaultQuote.author, defaultQuote.collegeName, defaultQuote.branch, defaultQuote.yearOfGraduation, defaultQuote.updatedAt]
          );
          seniorQuotes.push({
            _id: defaultQuote.id,
            text: defaultQuote.text,
            author: defaultQuote.author,
            collegeName: defaultQuote.collegeName,
            branch: defaultQuote.branch,
            yearOfGraduation: defaultQuote.yearOfGraduation
          });
        } catch (quoteInsertErr: any) {
          console.warn('[SQLite Bridge Error] Failed to seed default senior quote:', quoteInsertErr.message);
        }
      }

      // Process Reel Preferences Folder IDs and currentQuoteIndex
      let selectedRootFolderIds: string[] = [];
      let currentQuoteIndex = 0;
      if (sessionRow) {
        if (sessionRow.selectedRootFolderIds) {
          selectedRootFolderIds = JSON.parse(sessionRow.selectedRootFolderIds);
        }
        currentQuoteIndex = sessionRow.currentQuoteIndex || 0;
      }

      // DEFERRED PATH: Load card metadata asynchronously (600+ cards - heavy!)
      const cardsMetaPromise = new Promise<Record<string, any>>((resolve) => {
        const loadCardMetadata = async () => {
          try {
            const release = await sqliteLock.acquire();
            try {
              const cardsMetaRows = await db.getAllAsync<any>(
                'SELECT * FROM cards_metadata WHERE isDeleted = 0;'
              );
              
              const cardsById: Record<string, any> = {};
              const BATCH_SIZE = 150; // Process 150 cards per batch
              
              for (let i = 0; i < cardsMetaRows.length; i += BATCH_SIZE) {
                const batch = cardsMetaRows.slice(i, i + BATCH_SIZE);
                
                for (const row of batch) {
                  if (cardTombstones.has(row.id)) continue;
                  const prog = progressMap[row.id];
                  
                  cardsById[row.id] = {
                    _id: row.id,
                    title: row.title,
                    topic: row.topic,
                    tags: row.tags ? JSON.parse(row.tags) : [],
                    difficulty: row.difficulty,
                    folderId: row.folderId,
                    createdBy: row.createdBy,
                    visibility: row.visibility,
                    order: row.order,
                    isDeleted: row.isDeleted === 1,
                    updatedAt: row.updatedAt,
                    explanation: '',
                    code: '',
                    imageBlobPath: undefined,
                    imageHash: undefined,
                    examples: [],
                    slides: undefined,
                    isFavorite: prog ? prog.favorite : false,
                    difficultyState: prog ? prog.difficultyState : null,
                    currentUserQuestionProgress: prog && (prog.completed || prog.difficultyState === 'skipped')
                      ? {
                          attemptStatus: prog.completed ? 'attempted' : 'skipped',
                          completedLoops: prog.revisionCount,
                        }
                      : null,
                    isContentFullyHydrated: false,
                  };
                }
                
                // Yield to avoid blocking
                await new Promise(r => {
                  if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(() => r(undefined), { timeout: 50 });
                  } else {
                    setTimeout(() => r(undefined), 0);
                  }
                });
              }
              
              resolve(cardsById);
            } finally {
              release();
            }
          } catch (err: any) {
            console.error('[SQLite Bridge Error] Failed loading card metadata:', err.message);
            resolve({});
          }
        };
        
        // Schedule on idle or defer with 100ms delay max
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(loadCardMetadata, { timeout: 100 });
        } else {
          setTimeout(loadCardMetadata, 50);
        }
      });

      // Return critical data immediately, will be followed by card metadata
      return {
        foldersById,
        playlistsById,
        cardsById: {}, // Empty initially, will be populated by deferred load
        progressMap,
        offlineActionQueue,
        cardTombstones,
        cardsMetaPromise,
        deletedEntities: [],
        lastSyncedRevision: 0,
        lastSyncedAt: null,
        selectedRootFolderIds: [],
        seniorQuotes: [],
        currentQuoteIndex: 0,
      };
    } catch (err: any) {
      console.error('[SQLite Bridge Error] loadStateFromSQLite failed:', err.message);
      return null;
    }
  });
}

/**
 * Fully wipes all user-derived relational tables and sequence data asynchronously.
 */
export async function clearAllDataFromSQLite(userId: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync(`Scope Wiped Database for User ${userId}`, async () => {
    const release = await sqliteLock.acquire();
    try {
      console.log(`[SQLite Bridge] Purging tables asynchronously for user: ${userId}...`);
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM folders WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM playlists WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM card_progress WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM offline_queue WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM sync_transactions WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM delta_stream_checkpoints WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM id_translations WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM sync_cursors WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM replay_traces WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM queue_snapshots WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM user_metrics WHERE userId = ?;', [userId]);
        await db.runAsync('DELETE FROM deleted_entities WHERE userId = ?;', [userId]);
        await db.execAsync('UPDATE device_metadata SET lastIssuedLogicalSequence = 0;');
      });
      console.log('[SQLite Bridge] Scoped purge transaction committed successfully.');
    } catch (err: any) {
      console.error('[SQLite Bridge Error] clearAllDataFromSQLite failed:', err.message);
      throw err;
    } finally {
      release();
    }
  });
}

/**
 * Wipes rows for user accounts that have not synced for 30 consecutive days asynchronously.
 */
export async function evictOldAccountsFromSQLite(): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  await profiler.profileAsync('Evict Old Inactive Accounts', async () => {
    const release = await sqliteLock.acquire();
    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const cursors = await db.getAllAsync<any>('SELECT userId, updatedAt FROM sync_cursors ORDER BY updatedAt DESC;');
      if (cursors.length <= 3) return;

      const candidates = cursors.slice(3).filter((c: any) => c.updatedAt < thirtyDaysAgo);
      if (candidates.length === 0) return;

      await db.withTransactionAsync(async () => {
        for (const cand of candidates) {
          const uId = cand.userId;
          console.log(`[SQLite Eviction] Evicting stale inactive account: ${uId} (Last active: ${new Date(cand.updatedAt).toISOString()})`);
          await db.runAsync('DELETE FROM folders WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM playlists WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM card_progress WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM offline_queue WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM sync_transactions WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM delta_stream_checkpoints WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM id_translations WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM sync_cursors WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM replay_traces WHERE userId = ?;', [uId]);
          await db.runAsync('DELETE FROM queue_snapshots WHERE userId = ?;', [uId]);
        }
      });
    } catch (err: any) {
      console.error('[SQLite Bridge Error] evictOldAccountsFromSQLite failed:', err.message);
    } finally {
      release();
    }
  });
}

/**
 * Helper: Save user metrics asynchronously to SQLite
 */
export async function saveUserMetricsToSQLite(
  userId: string,
  metrics: { totalSwipes: number; totalScrolls: number; unsyncedSwipes: number; unsyncedScrolls: number }
): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    await db.runAsync(
      `INSERT INTO user_metrics (userId, totalSwipes, totalScrolls, unsyncedSwipes, unsyncedScrolls, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         totalSwipes=excluded.totalSwipes,
         totalScrolls=excluded.totalScrolls,
         unsyncedSwipes=excluded.unsyncedSwipes,
         unsyncedScrolls=excluded.unsyncedScrolls,
         updatedAt=excluded.updatedAt;`,
      [
        userId,
        metrics.totalSwipes,
        metrics.totalScrolls,
        metrics.unsyncedSwipes,
        metrics.unsyncedScrolls,
        Date.now(),
      ]
    );
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveUserMetricsToSQLite failed:', err.message);
  }
}

/**
 * Helper: Load user metrics asynchronously from SQLite
 */
export async function loadUserMetricsFromSQLite(userId: string) {
  if (!isSQLiteAvailable()) return null;
  try {
    return await executeQueryWithRecovery<any>(
      'SELECT totalSwipes, totalScrolls, unsyncedSwipes, unsyncedScrolls FROM user_metrics WHERE userId = ? LIMIT 1;',
      [userId],
      2
    );
  } catch (err: any) {
    console.error('[SQLite Bridge Error] loadUserMetricsFromSQLite failed:', err.message);
    return null;
  }
}

/**
 * Helper: Save reel preferences asynchronously to SQLite
 */
export async function saveReelPreferencesToSQLite(userId: string, selectedRootFolderIds: string[]): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const folderIdsJson = JSON.stringify(selectedRootFolderIds);
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO reel_sessions (userId, selectedRootFolderIds, currentIndex, updatedAt)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(userId) DO UPDATE SET selectedRootFolderIds = excluded.selectedRootFolderIds, updatedAt = excluded.updatedAt;`,
      [userId, folderIdsJson, now]
    );
    if (__DEV__) {
      console.log(`[SQLite Bridge] Saved reel preferences for user ${userId} asynchronously:`, selectedRootFolderIds);
    }
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveReelPreferencesToSQLite failed:', err.message);
  }
}

/**
 * Unified exit flush lifecycle: Commits all in-memory Zustand states to SQLite in a single transaction.
 */
export async function flushAllZustandToSQLite(userId: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  let db = getDatabase();

  const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
  const { useTrackingStore } = require('../store/useTrackingStore');
  const { flushSessionSeenCardsToSQLite } = require('./reelsFeedOfflineManager');

  const playlistState = usePlaylistStateStore.getState();
  const trackingState = useTrackingStore.getState();

  // 1. Extract entire current Zustand collections
  const playlists = Object.values(playlistState.playlistsById) as any[];
  const folders = Object.values(playlistState.foldersById) as any[];
  const cards = Object.values(playlistState.cardsById) as any[];
  const offlineActions = (playlistState.offlineActionQueue || []) as any[];
  const deletedEntities = (playlistState.deletedEntitiesQueue || []) as any[];

  if (__DEV__) {
    console.log(`[SQLite Lifecycle Flush] Starting transaction for user ${userId}. Saving ${playlists.length} playlists, ${folders.length} folders, ${cards.length} cards, ${offlineActions.length} offline actions, ${deletedEntities.length} deleted entities, ${trackingState.totalSwipes} swipes, ${trackingState.totalScrolls} scrolls...`);
  }

  let lockAcquired = false;
  const release = await sqliteLock.acquire();
  lockAcquired = true;
  try {
    await db.withTransactionAsync(async () => {
      // 2. Clear existing collections to perform a clean transactional overwrite
      await db.runAsync('DELETE FROM playlists WHERE userId = ?;', [userId]);
      await db.runAsync('DELETE FROM offline_queue WHERE userId = ?;', [userId]);
      await db.runAsync('DELETE FROM deleted_entities WHERE userId = ?;', [userId]);

      // 3. Save Playlists
      for (const p of playlists) {
        if (!p || !p.id) continue;
        const cleanId = p.id.split('-loop-')[0];
        const cardIdsJson = JSON.stringify(p.cardIds || p.orderedCardIds || []);
        const now = new Date().toISOString();
        await db.runAsync(`
          INSERT INTO playlists (
            id, userId, name, title, description, color1, color2, itemCount, cardIds, revision, clockEpoch, updatedAt, isDeleted, deletedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `, [
          cleanId,
          userId,
          p.name || '',
          (p as any).title || p.name || '',
          p.description || '',
          p.color1 || '',
          p.color2 || '',
          p.itemCount || 0,
          cardIdsJson,
          p.revision || 0,
          (p as any).clockEpoch || 'default-epoch',
          p.updatedAt ? new Date(p.updatedAt).toISOString() : now,
          (p as any).isDeleted ? 1 : 0,
          (p as any).deletedAt ? new Date((p as any).deletedAt).toISOString() : null
        ]);
      }

      // 4. Save Folders (matches DDL schema in sqliteDatabase.ts)
      for (const f of folders) {
        if (!f || !f._id) continue;
        const cleanId = f._id.split('-loop-')[0];
        const cardIdsJson = JSON.stringify(f.cardIds || []);
        const now = new Date().toISOString();
        await db.runAsync(`
          INSERT INTO folders (
            id, userId, title, description, icon, color, createdBy, visibility, "order", parentFolderId, cardIds,
            revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            userId=excluded.userId,
            title=excluded.title,
            description=excluded.description,
            icon=excluded.icon,
            color=excluded.color,
            createdBy=excluded.createdBy,
            visibility=excluded.visibility,
            "order"=excluded."order",
            parentFolderId=excluded.parentFolderId,
            cardIds=excluded.cardIds,
            revision=excluded.revision,
            pendingLogicalSequence=excluded.pendingLogicalSequence,
            ackedLogicalSequence=excluded.ackedLogicalSequence,
            serverLogicalSequence=excluded.serverLogicalSequence,
            clockEpoch=excluded.clockEpoch,
            updatedAt=excluded.updatedAt,
            isDeleted=excluded.isDeleted,
            deletedAt=excluded.deletedAt;
        `, [
          cleanId,
          userId,
          f.title || '',
          f.description || '',
          f.icon || 'folder',
          (f as any).color || '#7c3aed',
          getCreatedByString(f.createdBy),
          (f as any).visibility || 'public',
          (f as any).order || 0,
          f.parentFolderId || null,
          cardIdsJson,
          (f as any).revision || 0,
          (f as any).pendingLogicalSequence || 0,
          (f as any).ackedLogicalSequence || 0,
          (f as any).serverLogicalSequence || 0,
          (f as any).clockEpoch || 'default-epoch',
          f.updatedAt ? new Date(f.updatedAt).toISOString() : now,
          (f as any).isDeleted ? 1 : 0,
          (f as any).deletedAt ? new Date((f as any).deletedAt).toISOString() : null
        ]);
      }

      // 5. Save Cards
      for (const c of cards) {
        if (!c || !c._id) continue;
        const cleanId = c._id.split('-loop-')[0];
        const now = new Date().toISOString();

        // Save static metadata
        await db.runAsync(`
          INSERT INTO cards_metadata (
            id, title, topic, tags, difficulty, folderId, createdBy, visibility, "order", isDeleted, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title=excluded.title, topic=excluded.topic, tags=excluded.tags, difficulty=excluded.difficulty,
            folderId=excluded.folderId, createdBy=excluded.createdBy, visibility=excluded.visibility,
            "order"=excluded."order", isDeleted=excluded.isDeleted, updatedAt=excluded.updatedAt;
        `, [
          cleanId,
          c.title || '',
          c.topic || '',
          Array.isArray(c.tags) ? JSON.stringify(c.tags) : '[]',
          c.difficulty || 'Easy',
          getFolderIdString(c.folderId),
          getCreatedByString(c.createdBy),
          c.visibility || 'public',
          c.order || 0,
          (c as any).isDeleted ? 1 : 0,
          c.updatedAt ? new Date(c.updatedAt).toISOString() : now
        ]);

        // Save static content
        await db.runAsync(`
          INSERT INTO cards_content (
            cardId, explanation, code, imageBlobPath, imageHash, examples, slides
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cardId) DO UPDATE SET
            explanation=excluded.explanation, code=excluded.code, imageBlobPath=excluded.imageBlobPath,
            imageHash=excluded.imageHash, examples=excluded.examples, slides=excluded.slides;
        `, [
          cleanId,
          c.explanation || '',
          c.code || '',
          (c as any).imageBlobPath || null,
          (c as any).imageHash || null,
          Array.isArray((c as any).examples) ? JSON.stringify((c as any).examples) : '[]',
          c.slides ? JSON.stringify(c.slides) : null
        ]);

        // Save dynamic progress
        const qp = c.currentUserQuestionProgress;
        const isCompleted = qp?.attemptStatus === 'attempted' ? 1 : 0;
        const revisionCount = (qp as any)?.completedLoops || 0;
        const isFavorite = c.isFavorite ? 1 : 0;
        const diffState = c.difficultyState || null;
        const seenInReels = (c as any).seenInReels || 0;
        
        await db.runAsync(`
          INSERT INTO card_progress (
            cardId, userId, completed, revisionCount, favorite, difficultyState, seenInReels, revision, 
            favoritePendingSequence, favoriteAckedSequence, favoriteServerSequence, favoriteClockEpoch, 
            difficultyPendingSequence, difficultyAckedSequence, difficultyServerSequence, difficultyClockEpoch, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(cardId, userId) DO UPDATE SET
            completed=excluded.completed,
            revisionCount=excluded.revisionCount,
            favorite=excluded.favorite,
            difficultyState=excluded.difficultyState,
            seenInReels=excluded.seenInReels,
            revision=excluded.revision,
            favoritePendingSequence=excluded.favoritePendingSequence,
            favoriteAckedSequence=excluded.favoriteAckedSequence,
            favoriteServerSequence=excluded.favoriteServerSequence,
            favoriteClockEpoch=excluded.favoriteClockEpoch,
            difficultyPendingSequence=excluded.difficultyPendingSequence,
            difficultyAckedSequence=excluded.difficultyAckedSequence,
            difficultyServerSequence=excluded.difficultyServerSequence,
            difficultyClockEpoch=excluded.difficultyClockEpoch,
            updatedAt=excluded.updatedAt;
        `, [
          cleanId, userId, isCompleted, revisionCount, isFavorite, diffState, seenInReels, (c as any).revision || 0,
          (c as any).favoritePendingSequence || 0, (c as any).favoriteAckedSequence || 0, (c as any).favoriteServerSequence || 0, (c as any).favoriteClockEpoch || null,
          (c as any).difficultyPendingSequence || 0, (c as any).difficultyAckedSequence || 0, (c as any).difficultyServerSequence || 0, (c as any).difficultyClockEpoch || null,
          c.updatedAt ? new Date(c.updatedAt).toISOString() : now
        ]);
      }

      // 6. Save Offline Actions
      for (const act of offlineActions) {
        const payloadStr = JSON.stringify(act.payload || {});
        const encryptedPayload = await encryptPayload(payloadStr);
        await db.runAsync(`
          INSERT INTO offline_queue (
            id, userId, action, payload, timestamp, retryCount, localRevision, deviceId, logicalSequence, clockEpoch
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `, [
          act.id, userId, act.action, encryptedPayload, act.timestamp,
          act.retryCount || 0, act.localRevision || 0, act.deviceId || 'unknown',
          act.logicalSequence || 0, String(playlistState.logicalClockSequence || 0)
        ]);
      }

      // 7. Save Deleted Entities
      for (const de of deletedEntities) {
        await db.runAsync(`
          INSERT OR REPLACE INTO deleted_entities (
            userId, entityId, entityType, deletedAt, revision
          ) VALUES (?, ?, ?, ?, ?);
        `, [
          userId, de.entityId, de.entityType, de.deletedAt, de.revision || 0
        ]);
      }

      // 7.5 Save Reel Preferences / selectedRootFolderIds
      const selectedRootFolderIds = playlistState.selectedRootFolderIds || [];
      const folderIdsJson = JSON.stringify(selectedRootFolderIds);
      const nowStr = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO reel_sessions (userId, selectedRootFolderIds, currentIndex, updatedAt)
         VALUES (?, ?, 0, ?)
         ON CONFLICT(userId) DO UPDATE SET selectedRootFolderIds = excluded.selectedRootFolderIds, updatedAt = excluded.updatedAt;`,
        [userId, folderIdsJson, nowStr]
      );
    });

    // 8. Flush Metrics
    await saveUserMetricsToSQLite(userId, {
      totalSwipes: trackingState.totalSwipes,
      totalScrolls: trackingState.totalScrolls,
      unsyncedSwipes: trackingState.unsyncedSwipes,
      unsyncedScrolls: trackingState.unsyncedScrolls
    });

    // 9. Flush Seen Reels Memory Shadow
    await flushSessionSeenCardsToSQLite(userId);

    // 10. Clear deletedEntitiesQueue in memory
    usePlaylistStateStore.setState({ deletedEntitiesQueue: [] });

    if (__DEV__) {
      console.log(`[SQLite Lifecycle Flush] Successfully batched and committed all Zustand states to SQLite for user ${userId} (${trackingState.totalSwipes} swipes, ${trackingState.totalScrolls} scrolls).`);
    }
  } catch (err: any) {
    console.error('[SQLite Lifecycle Flush Error] Failed to execute full flush:', err.message);
    if (err.message && (err.message.includes('released') || err.message.includes('NativeDatabase'))) {
      try {
        console.warn('[SQLite Lifecycle Flush Recovery] Shared database object was released. Reconnecting...');
        const { resetDatabaseInstance, initializeDatabaseAsync } = require('./sqliteDatabase');
        await resetDatabaseInstance();
        await initializeDatabaseAsync();
        
        if (lockAcquired) {
          release();
          lockAcquired = false;
        }
        
        console.log('[SQLite Lifecycle Flush Recovery] Retrying full flush operation...');
        return await flushAllZustandToSQLite(userId);
      } catch (retryErr: any) {
        console.error('[SQLite Lifecycle Flush Recovery] Auto-reconnect retry failed:', retryErr.message);
      }
    }
  } finally {
    if (lockAcquired) {
      release();
    }
  }
}

/**
 * Add saveAnalyticsToSQLite helper to update user_metrics table.
 */
export async function saveAnalyticsToSQLite(
  userId: string,
  totalSwipes: number,
  totalScrolls: number
): Promise<void> {
  if (!isSQLiteAvailable()) return;
  try {
    const existing = await executeQueryWithRecovery<{ unsyncedSwipes: number; unsyncedScrolls: number }>(
      'SELECT unsyncedSwipes, unsyncedScrolls FROM user_metrics WHERE userId = ? LIMIT 1;',
      [userId],
      2
    );
    const unsyncedSwipes = existing?.unsyncedSwipes || 0;
    const unsyncedScrolls = existing?.unsyncedScrolls || 0;
    
    await saveUserMetricsToSQLite(userId, {
      totalSwipes,
      totalScrolls,
      unsyncedSwipes,
      unsyncedScrolls
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveAnalyticsToSQLite failed:', err.message);
  }
}

/**
 * Add saveOfflineQueueToSQLite helper to save a list of pending offline actions.
 */
export async function saveOfflineQueueToSQLite(
  actions: OfflineAction[],
  userId: string
): Promise<void> {
  if (!isSQLiteAvailable() || actions.length === 0) return;
  const db = getDatabase();
  try {
    const epoch = await getOrCreateClockEpoch();
    for (const act of actions) {
      const payloadStr = JSON.stringify(act.payload || {});
      const encryptedPayload = await encryptPayload(payloadStr);
      await db.runAsync(`
        INSERT OR REPLACE INTO offline_queue (
          id, userId, action, payload, timestamp, retryCount, localRevision, deviceId, logicalSequence, clockEpoch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `, [
        act.id,
        userId,
        act.action,
        encryptedPayload,
        act.timestamp,
        act.retryCount || 0,
        act.localRevision || 0,
        act.deviceId || 'unknown',
        act.logicalSequence || 0,
        epoch
      ]);
    }
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveOfflineQueueToSQLite failed:', err.message);
  }
}

/**
 * Add saveCardProgressToSQLite helper to upsert card perceived difficulty/attempts directly to card_progress.
 */
export async function saveCardProgressToSQLite(
  cardId: string,
  difficultyState: string | null,
  userId: string
): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  const cleanId = cardId.split('-loop-')[0];
  const now = new Date().toISOString();
  try {
    await db.runAsync(`
      INSERT INTO card_progress (
        cardId, userId, completed, revisionCount, favorite, difficultyState, seenInReels, revision, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cardId, userId) DO UPDATE SET
        difficultyState=excluded.difficultyState,
        updatedAt=excluded.updatedAt;
    `, [
      cleanId,
      userId,
      difficultyState === 'skipped' ? 0 : 1, // completed if not skipped
      0, // loops
      0, // favorite
      difficultyState,
      0, // seenInReels
      0, // revision
      now
    ]);
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveCardProgressToSQLite failed:', err.message);
  }
}

