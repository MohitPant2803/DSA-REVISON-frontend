import { getDatabase, isSQLiteAvailable } from './sqliteDatabase';
import { OfflineAction } from '../store/usePlaylistStateStore';
import type { IFolder } from '@/types/folder';
import type { ApiPlaylist } from '@/services/playlistService';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import * as SecureStore from 'expo-secure-store';

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
  try {
    const oldKey = await getOrCreateEncryptionKey();
    const newKey = `k-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    const rows = db.getAllSync<any>('SELECT id, payload FROM offline_queue;');
    db.withTransactionSync(() => {
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
        db.runSync('UPDATE offline_queue SET payload = ? WHERE id = ?;', [b64, row.id]);
      }
    });

    await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_KEY, newKey);
    cachedEncryptionKey = newKey;
    console.log('[SQLite Encryption] Queue encryption key rotated successfully.');
  } catch (err: any) {
    console.error('[SQLite Encryption Error] Key rotation failed:', err.message);
  }
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

export function saveDeletedEntityToSQLite(
  entityId: string,
  entityType: DeletedEntityType,
  userId: string,
  deletedAt: string | Date = new Date(),
  revision = 0
): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  const cleanEntityId = String(entityId || '').split('-loop-')[0];
  if (!cleanEntityId) return;

  try {
    const deletedAtIso = deletedAt instanceof Date ? deletedAt.toISOString() : new Date(deletedAt).toISOString();
    db.runSync(
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

export function isEntityDeletedInSQLite(userId: string, entityType: DeletedEntityType, entityId: string): boolean {
  if (!isSQLiteAvailable()) return false;
  const db = getDatabase();
  const cleanEntityId = String(entityId || '').split('-loop-')[0];
  if (!cleanEntityId) return false;

  try {
    const row = db.getFirstSync<any>(
      'SELECT entityId FROM deleted_entities WHERE userId = ? AND entityType = ? AND entityId = ? LIMIT 1;',
      [userId, entityType, cleanEntityId]
    );
    return !!row;
  } catch (err: any) {
    console.error('[SQLite Bridge Error] isEntityDeletedInSQLite failed:', err.message);
    return false;
  }
}

export function getDeletedEntityIdsFromSQLite(userId: string, entityType?: DeletedEntityType): Set<string> {
  if (!isSQLiteAvailable()) return new Set();
  const db = getDatabase();

  try {
    const rows = entityType
      ? db.getAllSync<any>('SELECT entityId FROM deleted_entities WHERE userId = ? AND entityType = ?;', [userId, entityType])
      : db.getAllSync<any>('SELECT entityId FROM deleted_entities WHERE userId = ?;', [userId]);
    return new Set(rows.map((row) => String(row.entityId)));
  } catch (err: any) {
    console.error('[SQLite Bridge Error] getDeletedEntityIdsFromSQLite failed:', err.message);
    return new Set();
  }
}

/**
 * Saves a list of folders to SQLite, handling upsert logic inside a transaction.
 */
export function saveFoldersToSQLite(folders: IFolder[], userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT INTO folders (
          id, userId, title, description, icon, color, createdBy, visibility, "order", parentFolderId, cardIds, revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
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
      `);

      for (const folder of folders) {
        if (!folder || !folder._id) continue;
        if (isEntityDeletedInSQLite(userId, 'folder', folder._id)) continue;
        stmt.executeSync([
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
      }
      stmt.finalizeSync();
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveFoldersToSQLite failed:', err.message);
  }
}

/**
 * Deletes a folder from SQLite.
 */
export function deleteFolderFromSQLite(folderId: string, userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const cleanId = folderId.split('-loop-')[0];
    db.withTransactionSync(() => {
      saveDeletedEntityToSQLite(cleanId, 'folder', userId);
      db.runSync('DELETE FROM folders WHERE id = ? AND userId = ?;', [cleanId, userId]);
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] deleteFolderFromSQLite failed:', err.message);
  }
}

/**
 * Saves a list of playlists to SQLite, handling upsert logic inside a transaction.
 */
export function savePlaylistsToSQLite(playlists: ApiPlaylist[], userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT INTO playlists (
          id, userId, name, title, description, color1, color2, itemCount, cardIds, revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      `);

      for (const p of playlists) {
        if (!p || !p._id) continue;
        if (isEntityDeletedInSQLite(userId, 'playlist', p._id)) continue;
        const cardIdsList = p.cardIds || p.orderedCardIds || [];
        stmt.executeSync([
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
        ]);
      }
      stmt.finalizeSync();
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] savePlaylistsToSQLite failed:', err.message);
  }
}

/**
 * Deletes a playlist from SQLite.
 */
export function deletePlaylistFromSQLite(playlistId: string, userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const cleanId = playlistId.split('-loop-')[0];
    db.withTransactionSync(() => {
      saveDeletedEntityToSQLite(cleanId, 'playlist', userId);
      db.runSync(
        `UPDATE playlists SET isDeleted = 1, deletedAt = ? WHERE id = ? AND userId = ?;`,
        [new Date().toISOString(), cleanId, userId]
      );
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] deletePlaylistFromSQLite failed:', err.message);
  }
}

/**
 * Saves a list of populated cards to SQLite, separating metadata from explanations/code blobs.
 */
export function saveCardsToSQLite(cards: IPopulatedRevisionCard[], userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      const stmtMeta = db.prepareSync(`
        INSERT INTO cards_metadata (
          id, title, topic, tags, difficulty, folderId, createdBy, visibility, "order", isDeleted, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      `);

      const stmtContent = db.prepareSync(`
        INSERT INTO cards_content (
          cardId, explanation, code, imageBlobPath, imageHash, examples, slides
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cardId) DO UPDATE SET
          explanation=excluded.explanation,
          code=excluded.code,
          imageBlobPath=excluded.imageBlobPath,
          imageHash=excluded.imageHash,
          examples=excluded.examples,
          slides=excluded.slides;
      `);

      const stmtProgress = db.prepareSync(`
        INSERT INTO card_progress (
          cardId, userId, completed, revisionCount, favorite, difficultyState, revision, favoritePendingSequence, favoriteAckedSequence, favoriteServerSequence, favoriteClockEpoch, difficultyPendingSequence, difficultyAckedSequence, difficultyServerSequence, difficultyClockEpoch, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      `);

      for (const c of cards) {
        if (!c || !c._id) continue;
        const cleanId = c._id.split('-loop-')[0];
        if (isEntityDeletedInSQLite(userId, 'card', cleanId)) continue;

        stmtMeta.executeSync([
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
        ]);

        stmtContent.executeSync([
          cleanId,
          c.explanation || '',
          c.code || '',
          (c as any).imageBlobPath || null,
          (c as any).imageHash || null,
          Array.isArray((c as any).examples) ? JSON.stringify((c as any).examples) : '[]',
          c.slides ? JSON.stringify(c.slides) : null
        ]);

        const qp = c.currentUserQuestionProgress;
        const isCompleted = qp?.attemptStatus === 'attempted' ? 1 : 0;
        const revisionCount = (qp as any)?.completedLoops || 0;
        const isFavorite = c.isFavorite ? 1 : 0;
        const diffState = c.difficultyState || null;

        stmtProgress.executeSync([
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
        ]);
      }

      stmtMeta.finalizeSync();
      stmtContent.finalizeSync();
      stmtProgress.finalizeSync();
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] saveCardsToSQLite failed:', err.message);
  }
}

/**
 * Deletes a card from SQLite.
 */
export function deleteCardFromSQLite(cardId: string, userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const cleanId = cardId.split('-loop-')[0];
    db.withTransactionSync(() => {
      saveDeletedEntityToSQLite(cleanId, 'card', userId);
      db.runSync('DELETE FROM cards_metadata WHERE id = ?;', [cleanId]);
      db.runSync('DELETE FROM card_progress WHERE cardId = ? AND userId = ?;', [cleanId, userId]);
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] deleteCardFromSQLite failed:', err.message);
  }
}

/**
 * Enqueues an offline action into SQLite with Rest-Encryption.
 */
export async function enqueueActionInSQLite(action: OfflineAction, userId: string, clockEpoch: string): Promise<void> {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const payloadStr = JSON.stringify(action.payload || {});
    // Encrypt payload Rest-side
    const encryptedPayload = await encryptPayload(payloadStr);

    db.runSync(`
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
}

/**
 * Removes multiple acknowledged offline actions from SQLite.
 */
export function removeProcessedActionsFromSQLite(ids: string[], userId: string): void {
  if (ids.length === 0 || !isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      // 1. Permanently remove soft-deleted entities that have been successfully synced
      const stmtGet = db.prepareSync('SELECT action, payload FROM offline_queue WHERE id = ? AND userId = ? LIMIT 1;');
      const stmtDeletePlaylist = db.prepareSync('DELETE FROM playlists WHERE id = ? AND userId = ?;');
      const stmtDeleteFolder = db.prepareSync('DELETE FROM folders WHERE id = ? AND userId = ?;');

      for (const id of ids) {
        const row = stmtGet.executeSync<any>([id, userId]).next().value;
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
              stmtDeletePlaylist.executeSync([payload.playlistId, userId]);
              console.log(`[SQLite Bridge] Acknowledged DELETE_PLAYLIST: permanently removed playlist ${payload.playlistId}`);
            } else if (action === 'DELETE_FOLDER' && payload.folderId) {
              stmtDeleteFolder.executeSync([payload.folderId, userId]);
              console.log(`[SQLite Bridge] Acknowledged DELETE_FOLDER: permanently removed folder ${payload.folderId}`);
            }
          }
        }
      }
      stmtGet.finalizeSync();
      stmtDeletePlaylist.finalizeSync();
      stmtDeleteFolder.finalizeSync();

      // 2. Clear the actions from queue
      const stmt = db.prepareSync('DELETE FROM offline_queue WHERE id = ? AND userId = ?;');
      for (const id of ids) {
        stmt.executeSync([id, userId]);
      }
      stmt.finalizeSync();
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] removeProcessedActionsFromSQLite failed:', err.message);
  }
}

/**
 * Resolves Loophole 51: Atomic ACK transaction bridging.
 * Updates cursors and removes acknowledged queues in a single guaranteed transaction.
 */
export function acknowledgeMutationsTransaction(ids: string[], userId: string, lastAppliedId: string): void {
  if (ids.length === 0 || !isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      // 1. Durably remove replayed logs
      const stmt = db.prepareSync('DELETE FROM offline_queue WHERE id = ? AND userId = ?;');
      for (const id of ids) {
        stmt.executeSync([id, userId]);
      }
      stmt.finalizeSync();

      // 2. Update persistent incremental cursor
      db.runSync(
        `INSERT INTO sync_cursors (userId, lastAppliedMutationId, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET lastAppliedMutationId=excluded.lastAppliedMutationId, updatedAt=excluded.updatedAt;`,
        [userId, lastAppliedId, Date.now()]
      );
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] acknowledgeMutationsTransaction failed:', err.message);
    throw err; // Re-throw to inform sync loop of ACK failure
  }
}

/**
 * Wipes all enqueued offline actions from SQLite.
 */
export function clearOfflineActionsInSQLite(userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.runSync('DELETE FROM offline_queue WHERE userId = ?;', [userId]);
  } catch (err: any) {
    console.error('[SQLite Bridge Error] clearOfflineActionsInSQLite failed:', err.message);
  }
}

/**
 * Restructures and loads the entire relational database into memory for Zustand.
 */
export async function loadStateFromSQLite(userId: string) {
  if (!isSQLiteAvailable()) return null;
  const db = getDatabase();
  try {
    const foldersRows = db.getAllSync<any>('SELECT * FROM folders WHERE userId = ? AND isDeleted = 0;', [userId]);
    const playlistsRows = db.getAllSync<any>('SELECT * FROM playlists WHERE userId = ? AND isDeleted = 0;', [userId]);
    const cardsMetaRows = db.getAllSync<any>('SELECT * FROM cards_metadata WHERE isDeleted = 0;');
    const cardsContentRows = db.getAllSync<any>('SELECT * FROM cards_content;');
    const progressRows = db.getAllSync<any>('SELECT * FROM card_progress WHERE userId = ?;', [userId]);
    const queueRows = db.getAllSync<any>('SELECT * FROM offline_queue WHERE userId = ? ORDER BY timestamp ASC;', [userId]);
    const folderTombstones = getDeletedEntityIdsFromSQLite(userId, 'folder');
    const playlistTombstones = getDeletedEntityIdsFromSQLite(userId, 'playlist');
    const cardTombstones = getDeletedEntityIdsFromSQLite(userId, 'card');

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

    const contentMap: Record<string, any> = {};
    cardsContentRows.forEach((row) => {
      contentMap[row.cardId] = {
        explanation: row.explanation,
        code: row.code,
        imageBlobPath: row.imageBlobPath,
        imageHash: row.imageHash,
        examples: row.examples ? JSON.parse(row.examples) : [],
        slides: row.slides ? JSON.parse(row.slides) : null,
      };
    });

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

    const cardsById: Record<string, any> = {};
    cardsMetaRows.forEach((row) => {
      if (cardTombstones.has(row.id)) return;
      const extraContent = contentMap[row.id] || { explanation: '', code: '', examples: [], slides: null };
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
        explanation: extraContent.explanation,
        code: extraContent.code,
        imageBlobPath: extraContent.imageBlobPath,
        imageHash: extraContent.imageHash,
        examples: extraContent.examples,
        slides: extraContent.slides,
        isFavorite: prog ? prog.favorite : false,
        difficultyState: prog ? prog.difficultyState : null,
        currentUserQuestionProgress: prog
          ? {
              attemptStatus: prog.completed ? 'attempted' : 'skipped',
              completedLoops: prog.revisionCount,
            }
          : null,
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
        retryCount: row.retryCount,
        localRevision: row.localRevision,
        deviceId: row.deviceId,
        logicalSequence: row.logicalSequence,
      });
    }

    const deletedEntities = db.getAllSync<LocalDeletedEntity>(
      'SELECT userId, entityId, entityType, deletedAt, revision FROM deleted_entities WHERE userId = ?;',
      [userId]
    );

    let lastSyncedRevision = 0;
    let lastSyncedAt: string | null = null;
    try {
      const cursorRow = db.getFirstSync<any>('SELECT lastPulledRevision, updatedAt FROM sync_cursors WHERE userId = ?;', [userId]);
      if (cursorRow) {
        lastSyncedRevision = cursorRow.lastPulledRevision || 0;
        lastSyncedAt = cursorRow.updatedAt ? new Date(cursorRow.updatedAt).toISOString() : null;
      }
    } catch (cursorErr: any) {
      console.warn('[SQLite Bridge Error] Failed to read sync cursor:', cursorErr.message);
    }

    return {
      foldersById,
      playlistsById,
      cardsById,
      offlineActionQueue,
      progressMap,
      deletedEntities,
      lastSyncedRevision,
      lastSyncedAt,
    };
  } catch (err: any) {
    console.error('[SQLite Bridge Error] loadStateFromSQLite failed:', err.message);
    return null;
  }
}

/**
 * Fully wipes all user-derived relational tables and sequence data from the local SQLite database for specified user.
 */
export function clearAllDataFromSQLite(userId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    console.log(`[SQLite Bridge] Initiating exclusive immediate SQLite purge for user: ${userId}...`);
    db.execSync('BEGIN IMMEDIATE;');
    try {
      db.runSync('DELETE FROM folders WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM playlists WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM card_progress WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM offline_queue WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM sync_transactions WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM delta_stream_checkpoints WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM id_translations WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM sync_cursors WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM replay_traces WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM queue_snapshots WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM user_metrics WHERE userId = ?;', [userId]);
      db.runSync('DELETE FROM deleted_entities WHERE userId = ?;', [userId]);
      // Keep device_metadata logical sequence reset
      db.execSync('UPDATE device_metadata SET lastIssuedLogicalSequence = 0;');
      db.execSync('COMMIT;');
      console.log('[SQLite Bridge] Scoped purge transaction committed successfully.');
    } catch (innerErr: any) {
      db.execSync('ROLLBACK;');
      console.error('[SQLite Bridge] Scoped transaction failed. Rolled back.', innerErr.message);
      throw innerErr;
    }

    try {
      db.execSync('VACUUM;');
      console.log('[SQLite Bridge] Database vacuum sweep completed successfully.');
    } catch (vacErr: any) {
      console.warn('[SQLite Bridge Warning] Vacuum execution failed:', vacErr.message);
    }
  } catch (err: any) {
    console.error('[SQLite Bridge Error] clearAllDataFromSQLite scoped purge failed:', err.message);
    throw err;
  }
}

/**
 * Wipes rows for user accounts that have not synced for 30 consecutive days.
 * Preserves the top 3 most recently active accounts.
 */
export function evictOldAccountsFromSQLite(): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cursors = db.getAllSync<any>('SELECT userId, updatedAt FROM sync_cursors ORDER BY updatedAt DESC;');
    if (cursors.length <= 3) return;

    const candidates = cursors.slice(3).filter((c: any) => c.updatedAt < thirtyDaysAgo);
    if (candidates.length === 0) return;

    db.withTransactionSync(() => {
      for (const cand of candidates) {
        const uId = cand.userId;
        console.log(`[SQLite Eviction] Evicting stale inactive account: ${uId} (Last active: ${new Date(cand.updatedAt).toISOString()})`);
        db.runSync('DELETE FROM folders WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM playlists WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM card_progress WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM offline_queue WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM sync_transactions WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM delta_stream_checkpoints WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM id_translations WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM sync_cursors WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM replay_traces WHERE userId = ?;', [uId]);
        db.runSync('DELETE FROM queue_snapshots WHERE userId = ?;', [uId]);
      }
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] evictOldAccountsFromSQLite failed:', err.message);
  }
}

/**
 * Helper: Save user metrics (swipes/scrolls) to SQLite
 */
export function saveUserMetricsToSQLite(
  userId: string,
  metrics: { totalSwipes: number; totalScrolls: number; unsyncedSwipes: number; unsyncedScrolls: number }
): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.runSync(
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
 * Helper: Load user metrics from SQLite
 */
export function loadUserMetricsFromSQLite(userId: string) {
  if (!isSQLiteAvailable()) return null;
  const db = getDatabase();
  try {
    return db.getFirstSync<any>(
      'SELECT totalSwipes, totalScrolls, unsyncedSwipes, unsyncedScrolls FROM user_metrics WHERE userId = ? LIMIT 1;',
      [userId]
    );
  } catch (err: any) {
    console.error('[SQLite Bridge Error] loadUserMetricsFromSQLite failed:', err.message);
    return null;
  }
}
