import { getDatabase, isSQLiteAvailable } from './sqliteDatabase';
import { OfflineAction } from '../store/usePlaylistStateStore';
import type { IFolder } from '@/types/folder';
import type { ApiPlaylist } from '@/services/playlistService';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';

/**
 * Robust helper to convert createdBy objects or strings into a stable database string.
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
 * Robust helper to convert folderId objects or strings into a stable database string.
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

/**
 * Saves a list of folders to SQLite, handling upsert logic inside a transaction.
 */
export function saveFoldersToSQLite(folders: IFolder[]): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT INTO folders (
          id, title, description, icon, color, createdBy, visibility, "order", parentFolderId, cardIds, revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
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
          updatedAt=excluded.updatedAt;
      `);

      for (const folder of folders) {
        if (!folder || !folder._id) continue;
        stmt.executeSync([
          folder._id,
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
          folder.updatedAt ? new Date(folder.updatedAt).toISOString() : new Date().toISOString()
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
export function deleteFolderFromSQLite(folderId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.runSync('DELETE FROM folders WHERE id = ?;', [folderId]);
  } catch (err: any) {
    console.error('[SQLite Bridge Error] deleteFolderFromSQLite failed:', err.message);
  }
}

/**
 * Saves a list of playlists to SQLite, handling upsert logic inside a transaction.
 */
export function savePlaylistsToSQLite(playlists: ApiPlaylist[]): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      const stmt = db.prepareSync(`
        INSERT INTO playlists (
          id, userId, name, title, description, color1, color2, itemCount, cardIds, revision, pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
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
          updatedAt=excluded.updatedAt;
      `);

      for (const p of playlists) {
        if (!p || !p._id) continue;
        const cardIdsList = p.cardIds || p.orderedCardIds || [];
        stmt.executeSync([
          p._id,
          (p as any).userId || 'unknown',
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
          (p as any).updatedAt ? new Date((p as any).updatedAt).toISOString() : new Date().toISOString()
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
export function deletePlaylistFromSQLite(playlistId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.runSync('DELETE FROM playlists WHERE id = ?;', [playlistId]);
  } catch (err: any) {
    console.error('[SQLite Bridge Error] deletePlaylistFromSQLite failed:', err.message);
  }
}

/**
 * Saves a list of populated cards to SQLite, separating metadata from explanations/code blobs.
 */
export function saveCardsToSQLite(cards: IPopulatedRevisionCard[]): void {
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
        ON CONFLICT(cardId) DO UPDATE SET
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

        // 1. Cards Metadata Table
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

        // 2. Cards Content Attachment Table (Separation)
        stmtContent.executeSync([
          cleanId,
          c.explanation || '',
          c.code || '',
          (c as any).imageBlobPath || null, // Filesystem blob path reference
          (c as any).imageHash || null,     // SHA-256 validation hash
          Array.isArray((c as any).examples) ? JSON.stringify((c as any).examples) : '[]',
          c.slides ? JSON.stringify(c.slides) : null
        ]);

        // 3. Spaced Repetition Card Progress (Logical clocks)
        const qp = c.currentUserQuestionProgress;
        const isCompleted = qp?.attemptStatus === 'attempted' ? 1 : 0;
        const revisionCount = (qp as any)?.completedLoops || 0;
        const isFavorite = c.isFavorite ? 1 : 0;
        const diffState = c.difficultyState || null;

        stmtProgress.executeSync([
          cleanId,
          getCreatedByString(c.createdBy),
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
export function deleteCardFromSQLite(cardId: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    const cleanId = cardId.split('-loop-')[0];
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM cards_metadata WHERE id = ?;', [cleanId]);
      db.runSync('DELETE FROM card_progress WHERE cardId = ?;', [cleanId]);
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] deleteCardFromSQLite failed:', err.message);
  }
}

/**
 * Enqueues an offline action into SQLite.
 */
export function enqueueActionInSQLite(action: OfflineAction, clockEpoch: string): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.runSync(`
      INSERT INTO offline_queue (
        id, action, payload, timestamp, retryCount, localRevision, deviceId, logicalSequence, clockEpoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      action.id,
      action.action,
      JSON.stringify(action.payload || {}),
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
export function removeProcessedActionsFromSQLite(ids: string[]): void {
  if (ids.length === 0 || !isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.withTransactionSync(() => {
      const stmt = db.prepareSync('DELETE FROM offline_queue WHERE id = ?;');
      for (const id of ids) {
        stmt.executeSync([id]);
      }
      stmt.finalizeSync();
    });
  } catch (err: any) {
    console.error('[SQLite Bridge Error] removeProcessedActionsFromSQLite failed:', err.message);
  }
}

/**
 * Wipes all enqueued offline actions from SQLite.
 */
export function clearOfflineActionsInSQLite(): void {
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  try {
    db.runSync('DELETE FROM offline_queue;');
  } catch (err: any) {
    console.error('[SQLite Bridge Error] clearOfflineActionsInSQLite failed:', err.message);
  }
}

/**
 * Restructures and loads the entire relational database into memory for Zustand.
 */
export function loadStateFromSQLite() {
  if (!isSQLiteAvailable()) return null;
  const db = getDatabase();
  try {
    const foldersRows = db.getAllSync<any>('SELECT * FROM folders;');
    const playlistsRows = db.getAllSync<any>('SELECT * FROM playlists;');
    const cardsMetaRows = db.getAllSync<any>('SELECT * FROM cards_metadata;');
    const cardsContentRows = db.getAllSync<any>('SELECT * FROM cards_content;');
    const progressRows = db.getAllSync<any>('SELECT * FROM card_progress;');
    const queueRows = db.getAllSync<any>('SELECT * FROM offline_queue ORDER BY timestamp ASC;');

    // 1. Rebuild Folders
    const foldersById: Record<string, any> = {};
    foldersRows.forEach((row) => {
      foldersById[row.id] = {
        _id: row.id,
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

    // 2. Rebuild Playlists
    const playlistsById: Record<string, any> = {};
    playlistsRows.forEach((row) => {
      playlistsById[row.id] = {
        _id: row.id,
        userId: row.userId,
        name: row.name,
        title: row.title,
        description: row.description,
        color1: row.color1,
        color2: row.color2,
        itemCount: row.itemCount,
        cardIds: row.cardIds ? JSON.parse(row.cardIds) : [],
        revision: row.revision,
        pendingLogicalSequence: row.pendingLogicalSequence,
        ackedLogicalSequence: row.ackedLogicalSequence,
        serverLogicalSequence: row.serverLogicalSequence,
        clockEpoch: row.clockEpoch,
        updatedAt: row.updatedAt,
      };
    });

    // 3. Build Card Explanation Map
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

    // 4. Build Spaced Repetition Card Progress Map
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

    // 5. Rebuild Populated Revision Cards
    const cardsById: Record<string, any> = {};
    cardsMetaRows.forEach((row) => {
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
        slides: extraContent.slides, // Restored Custom Slides!
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

    // 6. Rebuild Offline Queue
    const offlineActionQueue: OfflineAction[] = queueRows.map((row: any) => ({
      id: row.id,
      action: row.action as any,
      payload: row.payload ? JSON.parse(row.payload) : {},
      timestamp: row.timestamp,
      retryCount: row.retryCount,
      localRevision: row.localRevision,
      deviceId: row.deviceId,
      logicalSequence: row.logicalSequence,
    }));

    return {
      foldersById,
      playlistsById,
      cardsById,
      offlineActionQueue,
      progressMap,
    };
  } catch (err: any) {
    console.error('[SQLite Bridge Error] loadStateFromSQLite failed:', err.message);
    return null;
  }
}
