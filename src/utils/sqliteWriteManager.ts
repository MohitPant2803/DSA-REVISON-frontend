/**
 * CRITICAL ARCHITECTURE: Serialized SQLite Write Pipeline
 * 
 * Resolves:
 * - Overlapping concurrent writes
 * - Nested transaction deadlocks
 * - WAL contention
 * - Transaction conflicts
 * 
 * Single canonical write queue - ALL SQLite mutations must go through here.
 * One active transaction at a time. FIFO serialization. No random execAsync().
 */

import { getDatabase, sqliteLock, isSQLiteAvailable } from './sqliteDatabase';
import { profiler } from './profiler';
import { interactionScheduler } from './interactionScheduler';

const mapDifficultyToSQLite = (diff: string | undefined | null): string => {
  if (!diff) return 'Easy';
  const lower = diff.toLowerCase().trim();
  if (lower === 'easy') return 'Easy';
  if (lower === 'medium') return 'Medium';
  if (lower === 'hard') return 'Hard';
  const cap = diff.charAt(0).toUpperCase() + diff.slice(1);
  if (cap === 'Easy' || cap === 'Medium' || cap === 'Hard') return cap;
  return 'Easy'; // Fallback to satisfy CHECK constraint
};

export interface WriteOperation {
  id: string;
  type: 'cards' | 'folders' | 'playlists' | 'difficulty' | 'quotes' | 'deleted' | 'custom' | 'bulk_resync';
  userId: string;
  data: any;
  timestamp: number;
  priority: 'critical' | 'normal' | 'low';
  dedupeKey?: string; // For coalescing (e.g., "cards:userId:cardId")
}

export interface WriteMetrics {
  totalOps: number;
  coalescedOps: number;
  queueWaitMs: number;
  transactionMs: number;
  errorCount: number;
  lastExecutedAt: number;
}

/**
 * Singleton write manager: guarantees one transaction at a time.
 */
export class SQLiteWriteManager {
  private static instance: SQLiteWriteManager;

  private queue: WriteOperation[] = [];
  private executing = false;
  private abortSignal: AbortController | null = null;
  private coalesceMap: Map<string, WriteOperation> = new Map();
  private coalesceTimer: NodeJS.Timeout | null = null;
  private pendingResolvers: Map<string, { resolve: () => void; reject: (err: any) => void }[]> = new Map();
  private metrics: WriteMetrics = {
    totalOps: 0,
    coalescedOps: 0,
    queueWaitMs: 0,
    transactionMs: 0,
    errorCount: 0,
    lastExecutedAt: Date.now(),
  };

  private readonly COALESCE_WINDOW_MS = 300; // Debounce writes within 300ms
  private readonly MAX_QUEUE_SIZE = 5000;

  private constructor() {}

  static getInstance(): SQLiteWriteManager {
    if (!SQLiteWriteManager.instance) {
      SQLiteWriteManager.instance = new SQLiteWriteManager();
    }
    return SQLiteWriteManager.instance;
  }

  /**
   * Enqueue a write operation. Automatically coalesces duplicate dedupeKey entries.
   * ONLY entry point for SQLite writes.
   */
  async enqueue(op: WriteOperation): Promise<void> {
    if (!isSQLiteAvailable()) {
      if (__DEV__) console.warn('[Write Manager] SQLite not available, skipping operation:', op.type);
      return Promise.resolve();
    }

    if (op.userId === 'guest-user') {
      if (__DEV__) {
        console.log(`[Write Manager] Guest session write operation discarded: ${op.type}`);
      }
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const actualOp = { ...op };
      const key = actualOp.dedupeKey || actualOp.id;

      if (!this.pendingResolvers.has(key)) {
        this.pendingResolvers.set(key, []);
      }
      this.pendingResolvers.get(key)!.push({ resolve, reject });

      // Dedupe coalescing: if same key exists, replace it (last write wins)
      if (actualOp.dedupeKey) {
        if (this.coalesceMap.has(actualOp.dedupeKey)) {
          this.metrics.coalescedOps++;
        }
        this.coalesceMap.set(actualOp.dedupeKey, actualOp);

        // Debounce actual queue insertion
        if (!this.coalesceTimer) {
          this.coalesceTimer = setTimeout(() => {
            this.flushCoalesced();
          }, this.COALESCE_WINDOW_MS);
        }
        return;
      }

      // No coalescing: add directly to queue
      if (this.queue.length >= this.MAX_QUEUE_SIZE) {
        console.warn('[Write Manager] Queue overflow detected. Dropping low-priority operation.');
        if (op.priority === 'low') {
          resolve();
          return;
        }
      }

      this.queue.push(actualOp);
      this.metrics.totalOps++;

      if (interactionScheduler.isInteracting()) {
        if (__DEV__) {
          console.log(`[Write Manager] Deferring write queue processing: ${actualOp.type} (user is interacting)`);
        }
        interactionScheduler.runWhenIdle(() => {
          this.processQueue().catch(reject);
        });
      } else {
        this.processQueue().catch(reject);
      }
    });
  }

  /**
   * Flush coalesced operations into main queue.
   */
  private flushCoalesced(): void {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }

    const coalescedOps = Array.from(this.coalesceMap.values());
    this.coalesceMap.clear();

    for (const op of coalescedOps) {
      if (this.queue.length < this.MAX_QUEUE_SIZE) {
        this.queue.push(op);
        this.metrics.totalOps++;
      }
    }

    if (coalescedOps.length > 0) {
      if (__DEV__) {
        console.log(`[Write Manager] Flushed ${coalescedOps.length} coalesced operations. Queue size: ${this.queue.length}`);
      }
    }

    this.processQueue().catch((err) => {
      console.error('[Write Manager] Queue processing error:', err);
    });
  }

  /**
   * Process queue one operation at a time.
   * Guarantees: one active transaction at any moment.
   * Lock is acquired per-operation and released between ops to allow reads to interleave.
   */
  private async processQueue(): Promise<void> {
    if (this.executing || this.queue.length === 0) return;

    this.executing = true;
    let db = getDatabase();

    try {
      while (this.queue.length > 0) {
        if (interactionScheduler.isInteracting()) {
          if (__DEV__) {
            console.log('[Write Manager] User started interacting. Pausing write queue processing.');
          }
          interactionScheduler.runWhenIdle(() => {
            this.processQueue().catch(console.error);
          });
          break; // Break the while loop to yield thread control to the UI!
        }

        const op = this.queue.shift()!;
        const waitMs = performance.now() - op.timestamp;
        this.metrics.queueWaitMs = Math.max(this.metrics.queueWaitMs, waitMs);

        const startTx = performance.now();
        const key = op.dedupeKey || op.id;
        const resolvers = this.pendingResolvers.get(key) || [];
        this.pendingResolvers.delete(key);

        // Acquire lock per-operation so reads (e.g., card content hydration) can interleave between writes
        const release = await sqliteLock.acquire();
        try {
          await db.withTransactionAsync(async () => {
            await this.executeOperation(db, op);
          });

          const txMs = performance.now() - startTx;
          this.metrics.transactionMs = Math.max(this.metrics.transactionMs, txMs);
          this.metrics.lastExecutedAt = Date.now();

          if (__DEV__ && txMs > 100) {
            console.log(`[Write Manager] Slow transaction detected: ${op.type} took ${txMs.toFixed(1)}ms`);
          }

          resolvers.forEach(r => r.resolve());
        } catch (err: any) {
          this.metrics.errorCount++;
          console.error(`[Write Manager] Operation failed: ${op.type}`, err?.message);
          resolvers.forEach(r => r.reject(err));
          
          // Self-healing recovery: if database is locked or connection was released
          const isReleasedOrLockError = err?.message && (
            err.message.includes('released') ||
            err.message.includes('NativeDatabase') ||
            err.message.includes('NativeStatement') ||
            err.message.includes('locked')
          );
          if (isReleasedOrLockError) {
            console.warn('[Write Manager] Attempting SQLite connection recovery...');
            try {
              const { resetDatabaseInstance, initializeDatabaseAsync } = require('./sqliteDatabase');
              await resetDatabaseInstance();
              db = await initializeDatabaseAsync();
              console.warn('[Write Manager] SQLite connection recovered successfully.');
            } catch (recoveryErr: any) {
              console.error('[Write Manager] Connection recovery failed:', recoveryErr.message);
            }
          }
        } finally {
          release();
        }

        // Yield microtask between operations so pending read queries can acquire the lock
        if (this.queue.length > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }
    } finally {
      this.executing = false;
    }
  }

  /**
   * Execute a single operation within transaction context.
   */
  private async executeOperation(db: any, op: WriteOperation): Promise<void> {
    const { type, data, userId } = op;

    switch (type) {
      case 'cards':
        this.executeCardsWrite(db, data, userId);
        break;
      case 'folders':
        this.executeFoldersWrite(db, data, userId);
        break;
      case 'playlists':
        this.executePlaylistsWrite(db, data, userId);
        break;
      case 'difficulty':
        this.executeDifficultyWrite(db, data, userId);
        break;
      case 'quotes':
        this.executeQuotesWrite(db, data, userId);
        break;
      case 'deleted':
        await this.executeDeletedWrite(db, data, userId);
        break;
      case 'custom':
        if (typeof data.executor === 'function') {
          await data.executor(db);
        }
        break;
      case 'bulk_resync':
        this.executeCardsWrite(db, data.cards || [], userId);
        this.executeFoldersWrite(db, data.folders || [], userId);
        this.executePlaylistsWrite(db, data.playlists || [], userId);
        
        if (data.deletions && data.deletions.length > 0) {
          const deleteFolderStmt = db.prepareSync('DELETE FROM folders WHERE id = ?;');
          const deletePlaylistStmt = db.prepareSync('DELETE FROM playlists WHERE id = ?;');
          const deleteCardMetaStmt = db.prepareSync('DELETE FROM cards_metadata WHERE id = ?;');
          const deleteCardContStmt = db.prepareSync('DELETE FROM cards_content WHERE cardId = ?;');
          const deleteCardProgStmt = db.prepareSync('DELETE FROM card_progress WHERE cardId = ? AND userId = ?;');
          try {
            for (const del of data.deletions) {
              const cleanId = String(del.entityId).split('-loop-')[0];
              if (del.entityType === 'folder') {
                deleteFolderStmt.executeSync([cleanId]);
              } else if (del.entityType === 'playlist') {
                deletePlaylistStmt.executeSync([cleanId]);
              } else if (del.entityType === 'card') {
                deleteCardMetaStmt.executeSync([cleanId]);
                deleteCardContStmt.executeSync([cleanId]);
                deleteCardProgStmt.executeSync([cleanId, userId]);
              }
            }
          } finally {
            deleteFolderStmt.finalizeSync();
            deletePlaylistStmt.finalizeSync();
            deleteCardMetaStmt.finalizeSync();
            deleteCardContStmt.finalizeSync();
            deleteCardProgStmt.finalizeSync();
          }
        }

        if (data.deletedEntities && data.deletedEntities.length > 0) {
          const stmt = db.prepareSync(`
            INSERT INTO deleted_entities (userId, entityId, entityType, deletedAt, revision)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(userId, entityId, entityType) DO UPDATE SET
              deletedAt=excluded.deletedAt,
              revision=max(deleted_entities.revision, excluded.revision);
          `);
          try {
            for (const del of data.deletedEntities) {
              const cleanId = String(del.entityId).split('-loop-')[0];
              const deletedAtStr = del.deletedAt instanceof Date
                ? del.deletedAt.toISOString()
                : new Date(del.deletedAt || 0).toISOString();
              stmt.executeSync([userId, cleanId, del.entityType, deletedAtStr, del.revision || 0]);
            }
          } finally {
            stmt.finalizeSync();
          }
        }

        if (data.cursor) {
          await db.runAsync(
            `INSERT INTO sync_cursors (userId, lastPulledRevision, updatedAt) VALUES (?, ?, ?)
             ON CONFLICT(userId) DO UPDATE SET lastPulledRevision=excluded.lastPulledRevision, updatedAt=excluded.updatedAt;`,
            [userId, data.cursor.revision, data.cursor.updatedAt]
          );
        }
        break;
      default:
        console.warn('[Write Manager] Unknown operation type:', type);
    }
  }

  /**
   * Write cards: UPSERT only changed cards using synchronous prepared statements to eliminate JS event loop latency.
   */
  private executeCardsWrite(db: any, cards: any[], userId: string): void {
    if (!cards || cards.length === 0) return;

    // 1. Prepare statements synchronously
    const metadataStmt = db.prepareSync(`
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

    const contentStmt = db.prepareSync(`
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

    const progressStmt = db.prepareSync(`
      INSERT INTO card_progress (
        cardId, userId, completed, revisionCount, favorite, difficultyState, revision,
        favoritePendingSequence, favoriteAckedSequence, favoriteServerSequence, favoriteClockEpoch,
        difficultyPendingSequence, difficultyAckedSequence, difficultyServerSequence, difficultyClockEpoch, updatedAt
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

    try {
      for (const c of cards) {
        if (!c || !c._id) continue;
        const cleanId = String(c._id).split('-loop-')[0];

        // 1. Execute metadata upsert
        metadataStmt.executeSync([
          cleanId,
          c.title || '',
          c.topic || '',
          Array.isArray(c.tags) ? JSON.stringify(c.tags) : '[]',
          mapDifficultyToSQLite(c.difficulty),
          c.folderId ? (typeof c.folderId === 'object' ? c.folderId._id || c.folderId.id : c.folderId) : '',
          c.createdBy ? (typeof c.createdBy === 'object' ? c.createdBy._id || c.createdBy.id : c.createdBy) : 'unknown',
          c.visibility || 'public',
          c.order || 0,
          c.isDeleted ? 1 : 0,
          c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
        ]);

        // 2. Execute content upsert
        contentStmt.executeSync([
          cleanId,
          c.explanation || '',
          c.code || '',
          c.imageBlobPath || null,
          c.imageHash || null,
          Array.isArray(c.examples) ? JSON.stringify(c.examples) : '[]',
          c.slides ? JSON.stringify(c.slides) : null
        ]);

        // 3. Execute progress upsert
        const qp = c.currentUserQuestionProgress;
        const isCompleted = qp?.attemptStatus === 'attempted' ? 1 : 0;
        const revisionCount = qp?.completedLoops || 0;
        const isFavorite = c.isFavorite ? 1 : 0;
        const diffState = c.difficultyState || null;

        progressStmt.executeSync([
          cleanId,
          userId,
          isCompleted,
          revisionCount,
          isFavorite,
          diffState,
          c.revision || 0,
          c.favoritePendingSequence || 0,
          c.favoriteAckedSequence || 0,
          c.favoriteServerSequence || 0,
          c.favoriteClockEpoch || null,
          c.difficultyPendingSequence || 0,
          c.difficultyAckedSequence || 0,
          c.difficultyServerSequence || 0,
          c.difficultyClockEpoch || null,
          c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
        ]);
      }
    } finally {
      // Finalize all prepared statements to release native resources
      metadataStmt.finalizeSync();
      contentStmt.finalizeSync();
      progressStmt.finalizeSync();
    }
  }

  /**
   * Write folders: UPSERT only changed folders using synchronous prepared statements
   */
  private executeFoldersWrite(db: any, folders: any[], userId: string): void {
    if (!folders || folders.length === 0) return;

    const stmt = db.prepareSync(`
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
    `);

    try {
      for (const folder of folders) {
        if (!folder || !folder._id) continue;
        const folderId = folder._id;
        const updatedAtStr = folder.updatedAt ? new Date(folder.updatedAt).toISOString() : new Date().toISOString();

        stmt.executeSync([
          folderId,
          userId,
          folder.title || '',
          folder.description || '',
          folder.icon || 'folder',
          folder.color || '#7c3aed',
          folder.createdBy ? (typeof folder.createdBy === 'object' ? folder.createdBy._id || folder.createdBy.id : folder.createdBy) : 'unknown',
          folder.visibility || 'public',
          folder.order || 0,
          folder.parentFolderId || null,
          Array.isArray(folder.cardIds) ? JSON.stringify(folder.cardIds) : '[]',
          folder.revision || 0,
          folder.pendingLogicalSequence || 0,
          folder.ackedLogicalSequence || 0,
          folder.serverLogicalSequence || 0,
          folder.clockEpoch || 'default-epoch',
          updatedAtStr,
          folder.isDeleted ? 1 : 0,
          folder.deletedAt ? new Date(folder.deletedAt).toISOString() : null
        ]);
      }
    } finally {
      stmt.finalizeSync();
    }
  }

  /**
   * Write playlists: UPSERT only changed playlists using synchronous prepared statements
   */
  private executePlaylistsWrite(db: any, playlists: any[], userId: string): void {
    if (!playlists || playlists.length === 0) return;

    const stmt = db.prepareSync(`
      INSERT INTO playlists (
        id, userId, name, title, description, color1, color2, itemCount, cardIds, revision,
        pendingLogicalSequence, ackedLogicalSequence, serverLogicalSequence, clockEpoch, updatedAt, isDeleted, deletedAt
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

    try {
      for (const p of playlists) {
        if (!p || !p._id) continue;
        const playlistId = p._id;
        const cardIdsList = p.cardIds || p.orderedCardIds || [];
        const updatedAtStr = p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString();

        stmt.executeSync([
          playlistId,
          userId,
          p.name || '',
          p.title || p.name || '',
          p.description || '',
          p.color1 || '',
          p.color2 || '',
          p.itemCount ?? cardIdsList.length,
          JSON.stringify(cardIdsList),
          p.revision || 0,
          p.pendingLogicalSequence || 0,
          p.ackedLogicalSequence || 0,
          p.serverLogicalSequence || 0,
          p.clockEpoch || 'default-epoch',
          updatedAtStr,
          p.isDeleted ? 1 : 0,
          p.deletedAt ? new Date(p.deletedAt).toISOString() : null
        ]);
      }
    } finally {
      stmt.finalizeSync();
    }
  }

  /**
   * Write difficulty state: UPSERT difficulty map entries using synchronous prepared statements
   */
  private executeDifficultyWrite(db: any, difficultyMap: Record<string, any>, userId: string): void {
    if (!difficultyMap || Object.keys(difficultyMap).length === 0) return;

    const stmt = db.prepareSync(`
      INSERT INTO card_difficulty 
        (userId, cardId, difficulty, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(userId, cardId) DO UPDATE SET
         difficulty=excluded.difficulty,
         updatedAt=excluded.updatedAt;
    `);

    try {
      for (const [cardId, entry] of Object.entries(difficultyMap)) {
        const difficulty = (entry as any).difficulty || '';
        stmt.executeSync([userId, cardId, difficulty, Date.now()]);
      }
    } finally {
      stmt.finalizeSync();
    }
  }

  /**
   * Write senior quotes: insert/upsert quotes using synchronous prepared statements
   */
  private executeQuotesWrite(db: any, quotes: any[], userId: string): void {
    if (!quotes || quotes.length === 0) return;

    const stmt = db.prepareSync(`
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
    `);

    try {
      for (const q of quotes) {
        if (!q || !q._id) continue;
        stmt.executeSync([
          q._id,
          userId,
          q.text || q.quote || '',
          q.author || 'Anonymous',
          q.collegeName || q.college || null,
          q.branch || null,
          q.yearOfGraduation || q.year || null,
          q.updatedAt ? new Date(q.updatedAt).toISOString() : new Date().toISOString()
        ]);
      }
    } finally {
      stmt.finalizeSync();
    }
  }

  /**
   * Write deleted entities: record deletions (idempotent)
   */
  private async executeDeletedWrite(db: any, deletedEntity: any, userId: string): Promise<void> {
    if (!deletedEntity || !deletedEntity.entityId) return;

    const cleanId = String(deletedEntity.entityId).split('-loop-')[0];
    const deletedAt = deletedEntity.deletedAt instanceof Date
      ? deletedEntity.deletedAt.toISOString()
      : new Date(deletedEntity.deletedAt || 0).toISOString();

    await db.runAsync(
      `INSERT INTO deleted_entities (userId, entityId, entityType, deletedAt, revision)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, entityId, entityType) DO UPDATE SET
         deletedAt=excluded.deletedAt,
         revision=max(deleted_entities.revision, excluded.revision);`,
      [userId, cleanId, deletedEntity.entityType, deletedAt, deletedEntity.revision || 0]
    );
  }

  /**
   * Clear queue (e.g., on logout or session reset)
   */
  clear(): void {
    this.queue = [];
    this.coalesceMap.clear();
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): WriteMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalOps: 0,
      coalescedOps: 0,
      queueWaitMs: 0,
      transactionMs: 0,
      errorCount: 0,
      lastExecutedAt: Date.now(),
    };
  }

  /**
   * Ensure all pending operations are flushed (e.g., before app close)
   */
  async flush(): Promise<void> {
    this.flushCoalesced();
    while (this.queue.length > 0 || this.executing) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (__DEV__) console.log('[Write Manager] All pending writes flushed.');
  }

  /**
   * Dispose: cleanup and abort pending operations
   */
  dispose(): void {
    if (this.abortSignal) {
      this.abortSignal.abort();
      this.abortSignal = null;
    }
    this.clear();
    if (__DEV__) console.log('[Write Manager] Disposed.');
  }
}

export const sqliteWriteManager = SQLiteWriteManager.getInstance();
