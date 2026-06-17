import { getDatabase as getDatabaseRaw, isSQLiteAvailable } from './sqliteDatabase';
import { whenDatabaseReady } from './appBootstrapGate';

/**
 * Gated database accessor to prevent querying before DDL schema is complete.
 */
async function getDatabase(): Promise<ReturnType<typeof getDatabaseRaw>> {
  await whenDatabaseReady();
  return getDatabaseRaw();
}

import { usePlaylistStateStore } from '../store/usePlaylistStateStore';
import { sqliteWriteManager } from './sqliteWriteManager';
import type { IPopulatedRevisionCard } from '../types/revision';
import { profiler } from './profiler';
import { AppState } from 'react-native';
import { interactionScheduler } from './interactionScheduler';

const MAX_QUEUE_SIZE = 2000;
const PREVIOUS_WINDOW_SIZE = 3;
const NEXT_WINDOW_SIZE = 6;

// Seeded PRNG LCG implementation for diverse, highly reproducible shuffles
class SeededRandom {
  private seed: number;
  constructor(seedString: string) {
    let h = 1779033703 ^ seedString.length;
    for (let i = 0; i < seedString.length; i++) {
      h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    this.seed = (h >>> 0);
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

const seededShuffle = <T>(array: T[], prng: SeededRandom): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Folder hash caches to avoid CPU thrashing during Reels swipe gesture loops
let cachedHash: string | null = null;
let cachedCardCount = 0;
let lastFolderKey = '';

// Memory shadow state for reel session to avoid disk writes during gestures
let sessionMemoryShadow: {
  userId: string;
  currentIndex: number;
  deepestIndexReached: number;
  queue: string[];
  contentHash: string;
  eligibleCardCount: number;
  queueVersion: number;
  updatedAt: string;
} | null = null;

// Memory set of card IDs seen in the current session to avoid disk writes during swipes
let sessionSeenMemoryShadow = new Set<string>();

// Slide-slice cache to eliminate SQLite access during active reels navigation
let cachedSliceResult: any = null;
let cachedSliceUserId = '';

export function invalidateSliceCache() {
  cachedSliceResult = null;
  cachedSliceUserId = '';
}

export function setSessionMemoryShadow(session: typeof sessionMemoryShadow) {
  sessionMemoryShadow = session;
  invalidateSliceCache();
}

let saveSessionTimeout: NodeJS.Timeout | null = null;
let lastRegenTimestamp = 0;
let replenishmentAttemptsCount = 0;
let lastReplenishmentTime = 0;

export function isValidCardForQueue(card: any): boolean {
  if (!card) return false;
  if (card.isDeleted) return false;
  if (!card._id || !card.folderId) return false;
  if (!card.title && !card.topic) return false;
  return true;
}

export function flushSessionIndexToSQLiteSync(userId: string) {
  if (!sessionMemoryShadow || sessionMemoryShadow.userId !== userId) return;
  if (saveSessionTimeout) {
    clearTimeout(saveSessionTimeout);
    saveSessionTimeout = null;
  }
  
  if (!isSQLiteAvailable()) return;
  
  const { currentIndex, deepestIndexReached, updatedAt } = sessionMemoryShadow;
  
  if (__DEV__) {
    console.log(`[SQLite Save] Entity: reel_sessions | Action: flushSessionIndexToSQLiteSync | Index: ${currentIndex}`);
  }

  sqliteWriteManager.enqueue({
    id: `flush-session-sync-${Date.now()}`,
    type: 'custom',
    userId,
    data: {
      executor: async (db: any) => {
        await db.runAsync(
          'UPDATE reel_sessions SET currentIndex = ?, deepestIndexReached = ?, updatedAt = ? WHERE userId = ?;',
          [currentIndex, deepestIndexReached, updatedAt, userId]
        );
      }
    },
    timestamp: Date.now(),
    priority: 'normal'
  }).catch(err => {
    console.error('[Offline Feed Manager] Failed to flush session index to SQLite Sync:', err.message);
  });

  // Flush seen cards asynchronously in the background
  flushSessionSeenCardsToSQLite(userId).catch(console.error);
}

export async function flushSessionIndexToSQLite(userId: string): Promise<void> {
  if (!sessionMemoryShadow || sessionMemoryShadow.userId !== userId) return;
  if (saveSessionTimeout) {
    clearTimeout(saveSessionTimeout);
    saveSessionTimeout = null;
  }
  
  if (!isSQLiteAvailable()) return;
  
  try {
    const { currentIndex, deepestIndexReached, updatedAt } = sessionMemoryShadow;
    if (__DEV__) {
      console.log(`[SQLite Save] Entity: reel_sessions | Action: flushSessionIndexToSQLite | Index: ${currentIndex}`);
    }
    await sqliteWriteManager.enqueue({
      id: `flush-session-async-${Date.now()}`,
      type: 'custom',
      userId,
      data: {
        executor: async (db: any) => {
          await db.runAsync(
            'UPDATE reel_sessions SET currentIndex = ?, deepestIndexReached = ?, updatedAt = ? WHERE userId = ?;',
            [currentIndex, deepestIndexReached, updatedAt, userId]
          );
        }
      },
      timestamp: Date.now(),
      priority: 'normal'
    });

    // Flush seen cards in batch inside transaction
    await flushSessionSeenCardsToSQLite(userId);
  } catch (err: any) {
    console.error('[Offline Feed Manager] Failed to flush session index to SQLite:', err.message);
  }
}

export async function flushSessionIndexAndQueueToSQLite(userId: string): Promise<void> {
  if (!sessionMemoryShadow || sessionMemoryShadow.userId !== userId) return;
  if (saveSessionTimeout) {
    clearTimeout(saveSessionTimeout);
    saveSessionTimeout = null;
  }
  
  if (!isSQLiteAvailable()) return;
  
  try {
    const { currentIndex, deepestIndexReached, queue, updatedAt } = sessionMemoryShadow;
    const queueStr = JSON.stringify(queue);
    if (__DEV__) {
      console.log(`[SQLite Save] Entity: reel_sessions | Action: flushSessionIndexAndQueueToSQLite | Index: ${currentIndex} | Queue Size: ${queue.length}`);
    }
    await sqliteWriteManager.enqueue({
      id: `flush-session-queue-async-${Date.now()}`,
      type: 'custom',
      userId,
      data: {
        executor: async (db: any) => {
          await db.runAsync(
            'UPDATE reel_sessions SET currentIndex = ?, deepestIndexReached = ?, queue = ?, updatedAt = ? WHERE userId = ?;',
            [currentIndex, deepestIndexReached, queueStr, updatedAt, userId]
          );
        }
      },
      timestamp: Date.now(),
      priority: 'normal'
    });

    await flushSessionSeenCardsToSQLite(userId);
  } catch (err: any) {
    console.error('[Offline Feed Manager] Failed to flush session index and queue to SQLite:', err.message);
  }
}

AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'inactive' || nextAppState === 'background') {
    const userId = usePlaylistStateStore.getState().userId || 'guest-user';
    flushSessionIndexToSQLiteSync(userId);
  }
});

// Periodic checkpoint to flush session index to SQLite every 3 minutes to guarantee durability without lag
setInterval(() => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  if (sessionMemoryShadow && sessionMemoryShadow.userId === userId) {
    if (__DEV__) {
      console.log('[Reels Periodic Checkpoint] Saving session index to SQLite...');
    }
    flushSessionIndexToSQLite(userId).catch(err => {
      console.error('[Reels Periodic Checkpoint] Failed to save session index:', err.message);
    });
  }
}, 180000); // 3 minutes

/**
 * Recursively fetches all descendant folder IDs in memory using the Zustand store.
 */
function getDescendantFolderIdsInMemory(parentIds: string[]): string[] {
  const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
  const foldersById = usePlaylistStateStore.getState().foldersById;
  const allFolders = Object.values(foldersById);

  const folderIdsToQuery = parentIds.filter(id => foldersById[id] && !(foldersById[id] as any).isDeleted);
  let currentParentIds = [...folderIdsToQuery];

  while (currentParentIds.length > 0) {
    const nextParentIds: string[] = [];
    for (const pid of currentParentIds) {
      const children = allFolders.filter((f: any) => f && f.parentFolderId === pid && !f.isDeleted) as any[];
      for (const child of children) {
        if (child && !folderIdsToQuery.includes(child._id)) {
          folderIdsToQuery.push(child._id);
          nextParentIds.push(child._id);
        }
      }
    }
    currentParentIds = nextParentIds;
  }

  return folderIdsToQuery;
}

/**
 * Compute contentHash representing the local eligible card universe state in memory, partitioned by userId.
 * Invalidated only when folder selection actually changes to prevent mid-session single-frame stalls.
 */
export async function computeLocalContentHash(
  selectedFolderIds: string[],
  userId: string
): Promise<{ hash: string; cardCount: number }> {
  const foldersKey = [...selectedFolderIds].sort().join(',');
  if (cachedHash && foldersKey === lastFolderKey) {
    return { hash: cachedHash, cardCount: cachedCardCount };
  }

  lastFolderKey = foldersKey;

  // Get all descendant folders recursively from memory
  const folderIdsToQuery = getDescendantFolderIdsInMemory(selectedFolderIds);
  if (folderIdsToQuery.length === 0) {
    return { hash: 'empty', cardCount: 0 };
  }

  // Count non-deleted cards in memory
  const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
  const cardsById = usePlaylistStateStore.getState().cardsById;
  const folderSet = new Set(folderIdsToQuery);

  const cardCount = Object.values(cardsById).filter(
    (c: any) => c && folderSet.has(c.folderId) && !c.isDeleted
  ).length;

  const rawString = foldersKey;

  // Stable pure JS hashing (DJB2-like) to execute synchronously in microtask
  let hash = 5381;
  for (let i = 0; i < rawString.length; i++) {
    hash = (hash * 33) ^ rawString.charCodeAt(i);
  }
  const hashString = Math.abs(hash).toString(16);

  if (__DEV__) {
    console.log(`[Reels Queue Hash] Calculated Memory Hash: ${hashString} | Folders: [${foldersKey}] | Card Count: ${cardCount}`);
  }

  // Update debounced caches
  cachedHash = hashString;
  cachedCardCount = cardCount;

  return { hash: hashString, cardCount };
}

/**
 * Get or Create user folder preferences asynchronously from SQLite.
 */
export async function getLocalUserPreferences(userId: string): Promise<{ selectedRootFolderIds: string[] }> {
  // Directly read from Zustand store to bypass SQLite database locking
  const state = usePlaylistStateStore.getState();
  const selectedRootFolderIds = state.selectedRootFolderIds;
  if (Array.isArray(selectedRootFolderIds) && selectedRootFolderIds.length > 0) {
    return { selectedRootFolderIds };
  }

  // Fallback to root folders in Zustand (folders where parentFolderId is null/empty and non-deleted)
  const foldersById = state.foldersById || {};
  const rootFoldersFromStore = Object.values(foldersById).filter(
    (f: any) => f && !f.isDeleted && (!f.parentFolderId || f.parentFolderId === null)
  );
  const folderIds = rootFoldersFromStore.map((f: any) => f.id || f._id).filter(Boolean);

  return { selectedRootFolderIds: folderIds };
}

/**
 * Generate local, interleaved feed session in SQLite asynchronously.
 */
export async function generateReelsQueueLocally(
  userId: string,
  triggerReason: 'preference_change' | 'scroll_refill' | 'session_start' = 'session_start'
): Promise<any> {
  // Cooldown gate: skip if executed in the last 15 seconds and memory shadow exists
  // BUT bypass the cooldown gate completely for preference changes or scroll refills to guarantee instant content updates
  const now = Date.now();
  const isVolatileRefill = triggerReason === 'preference_change' || triggerReason === 'scroll_refill';
  if (!isVolatileRefill && now - lastRegenTimestamp < 15000 && sessionMemoryShadow && sessionMemoryShadow.userId === userId) {
    if (__DEV__) {
      console.log(`[Reels Queue Regen] Cooldown Gate Triggered | Elapsed: ${now - lastRegenTimestamp}ms | Skipping regeneration and serving memory shadow`);
    }
    return sessionMemoryShadow;
  }

  // Interaction Priority Gate: defer queue regeneration if user is actively interacting and memory shadow exists
  if (interactionScheduler.isInteracting() && sessionMemoryShadow && sessionMemoryShadow.userId === userId) {
    if (__DEV__) {
      console.log(`[Reels Queue Regen] [DEFERRED] User is actively interacting. Serving in-memory shadow queue to protect UI frame rate.`);
    }
    return sessionMemoryShadow;
  }

  return profiler.profileAsync('Generate Reels Queue Locally (Async)', async () => {
    // Retrieve user root folder preferences and filter out deleted folders
    const prefs = await getLocalUserPreferences(userId);
    const foldersById = usePlaylistStateStore.getState().foldersById;
    const selectedFolders = prefs.selectedRootFolderIds.filter(id => {
      const folder = foldersById[id] as any;
      return folder && !folder.isDeleted;
    });

    let finalSelectedFolders = [...selectedFolders];
    if (finalSelectedFolders.length === 0) {
      // 1. Get all root folders from Zustand memory state
      const allFolders = Object.values(foldersById || {});
      const cardsById = usePlaylistStateStore.getState().cardsById;
      const allCards = Object.values(cardsById || {});
      
      // We want to find which folders actually contain cards
      const folderIdsWithCards = new Set(
        allCards.filter((c: any) => c && !c.isDeleted && c.folderId).map((c: any) => c.folderId)
      );
      
      // Let's filter folders that are root folders (parentFolderId is null/empty) and non-deleted
      const rootFolders = allFolders.filter(
        (f: any) => f && !f.isDeleted && (!f.parentFolderId || f.parentFolderId === null)
      );
      
      // Get IDs of root folders containing cards
      let fallbackIds = rootFolders
        .map((f: any) => f.id || f._id)
        .filter(id => id && folderIdsWithCards.has(id));
        
      if (fallbackIds.length === 0) {
        // Fallback to any root folders regardless of direct cards (since child folders might have cards)
        fallbackIds = rootFolders.map((f: any) => f.id || f._id).filter(Boolean);
      }
      
      if (fallbackIds.length === 0) {
        // Fallback to any non-deleted folders in the store
        fallbackIds = allFolders.filter((f: any) => f && !f.isDeleted).map((f: any) => f.id || f._id).filter(Boolean);
      }
      
      finalSelectedFolders = fallbackIds;
      
      if (__DEV__) {
        console.log(`[Reels Queue Regen] Folder fallback triggered. Selected folders: [${finalSelectedFolders.join(',')}]`);
      }
    }

    // verification diagnostics logs
    const allFoldersList = Object.values(foldersById || {});
    const totalFolders = allFoldersList.length;
    const nonDeletedFolders = allFoldersList.filter((f: any) => f && !f.isDeleted).length;
    const selectedRootFolders = finalSelectedFolders.length;
    
    const descendantsSet = new Set<string>();
    finalSelectedFolders.forEach(rootId => {
      getDescendantFolderIdsInMemory([rootId]).forEach(dId => descendantsSet.add(dId));
    });
    const cardsAvailableAfterFolderFiltering = Object.values(usePlaylistStateStore.getState().cardsById || {}).filter(
      (c: any) => c && !c.isDeleted && descendantsSet.has(c.folderId)
    ).length;
    
    console.log('[Reels Study Source Verification]', {
      userId,
      totalFolders,
      nonDeletedFolders,
      selectedRootFolders,
      cardsAvailableAfterFolderFiltering,
      isGuest: userId === 'guest-user',
    });

    if (finalSelectedFolders.length === 0) {
      console.warn('[Offline Feed Manager] No root folders selected in study preferences');
      return null;
    }

    // 1. Fetch or initialize indexes
    let currentIndex = 0;
    let deepestIndexReached = 0;
    let queueVersion = 1;

    if (sessionMemoryShadow && sessionMemoryShadow.userId === userId) {
      currentIndex = sessionMemoryShadow.currentIndex;
      deepestIndexReached = sessionMemoryShadow.deepestIndexReached;
      queueVersion = sessionMemoryShadow.queueVersion;
    } else if (isSQLiteAvailable()) {
      try {
        const db = await getDatabase();
        const existing = await db.getFirstAsync<any>(
          'SELECT currentIndex, deepestIndexReached, queueVersion FROM reel_sessions WHERE userId = ? LIMIT 1;',
          [userId]
        );
        if (existing) {
          currentIndex = existing.currentIndex;
          deepestIndexReached = existing.deepestIndexReached;
          queueVersion = existing.queueVersion || 1;
        }
      } catch {}
    }

    // 2. Compute content hash and count eligible cards in-memory
    const { hash, cardCount } = await computeLocalContentHash(finalSelectedFolders, userId);
    if (cardCount === 0) {
      console.warn('[Offline Feed Manager] Selected root folders contain no cards');
      return null;
    }

    // Create seeded random generator
    const timestampBucket = Math.floor(Date.now() / (15 * 60 * 1000));
    const seedString = `${userId}-${queueVersion}-${hash}-${timestampBucket}`;
    const prng = new SeededRandom(seedString);

    const samplingCap = Math.min(MAX_QUEUE_SIZE, cardCount);

    // 3. Group descendant folder cards by their root ancestor folder using in-memory state
    const storeState = usePlaylistStateStore.getState();
    const cardsById = storeState.cardsById;

    const folderCardGroups: Record<string, string[]> = {};
    finalSelectedFolders.forEach(id => {
      folderCardGroups[id] = [];
    });

    const allCards = Object.values(cardsById);

    finalSelectedFolders.forEach(rootId => {
      const descendants = getDescendantFolderIdsInMemory([rootId]);
      if (descendants.length > 0) {
        const folderSet = new Set(descendants);
        folderCardGroups[rootId] = allCards
          .filter((c: any) => isValidCardForQueue(c) && folderSet.has(c.folderId))
          .map((c: any) => c._id);
      }
    });

    // 4. Gather viewed states in-memory with O(1) Set lookup
    const viewedCardIds = new Set<string>();
    sessionSeenMemoryShadow.forEach(id => viewedCardIds.add(id));
    allCards.forEach((c: any) => {
      if (c && !c.isDeleted && (c.seenInReels === 1 || c.difficultyState !== null || c.currentUserQuestionProgress !== null)) {
        viewedCardIds.add(c._id);
      }
    });

    const folderSampledLists: string[][] = [];
    const cardsToReset: string[] = [];
    let unseenEligibleCardCount = 0;

    for (const rootId of finalSelectedFolders) {
      const groupCards = folderCardGroups[rootId] || [];
      if (groupCards.length === 0) continue;

      const viewedInFolder = groupCards.filter(c => viewedCardIds.has(c));
      let unseenGroupCards: string[] = [];

      // Check folder exhaustion
      const isExhausted = viewedInFolder.length >= groupCards.length;
      if (isExhausted) {
        cardsToReset.push(...groupCards);
        unseenGroupCards = [...groupCards]; // Reset and treat all as unseen
      } else {
        unseenGroupCards = groupCards.filter(c => !viewedCardIds.has(c));
      }

      if (unseenGroupCards.length === 0) continue;

      unseenEligibleCardCount += unseenGroupCards.length;

      // Seeded shuffle on group
      const shuffledGroup = seededShuffle(unseenGroupCards, prng);
      folderSampledLists.push(shuffledGroup);
    }

    // Emergency fallback if all cards viewed
    if (unseenEligibleCardCount === 0 && finalSelectedFolders.length > 0) {
      for (const rootId of finalSelectedFolders) {
        const groupCards = folderCardGroups[rootId] || [];
        if (groupCards.length === 0) continue;
        const shuffledGroup = seededShuffle(groupCards, prng);
        folderSampledLists.push(shuffledGroup);
        unseenEligibleCardCount += groupCards.length;
      }
    }

    // Reset exhausted folders progress locally asynchronously in background
    if (cardsToReset.length > 0 && isSQLiteAvailable()) {
      const placeholders = cardsToReset.map(() => '?').join(',');
      sqliteWriteManager.enqueue({
        id: `reset-progress-${Date.now()}`,
        type: 'custom',
        userId,
        data: {
          executor: async (db: any) => {
            await db.runAsync(
              `UPDATE card_progress SET completed = 0, difficultyState = NULL, seenInReels = 0 WHERE userId = ? AND cardId IN (${placeholders})`,
              [userId, ...cardsToReset]
            );
          }
        },
        timestamp: Date.now(),
        priority: 'normal'
      }).catch(err => console.error('[SQLite Reset Progress Async Error]', err.message));
    }

    // Re-adjust proportional size allocations based on exact unseen count
    for (let i = 0; i < folderSampledLists.length; i++) {
      const pool = folderSampledLists[i];
      const allocation = Math.round((pool.length / Math.max(1, unseenEligibleCardCount)) * samplingCap);
      folderSampledLists[i] = pool.slice(0, Math.max(1, allocation));
    }

    // Interleave proportional card groups using weighted fatigue scores
    const finalQueueIds: string[] = [];
    const poolIndices = new Array(folderSampledLists.length).fill(0);
    const fatigueScores = new Array(folderSampledLists.length).fill(0);

    while (finalQueueIds.length < samplingCap) {
      let bestFolderIndex = -1;
      let lowestScore = Infinity;

      for (let i = 0; i < folderSampledLists.length; i++) {
        const pool = folderSampledLists[i];
        const idx = poolIndices[i];
        if (idx < pool.length) {
          if (fatigueScores[i] < lowestScore) {
            lowestScore = fatigueScores[i];
            bestFolderIndex = i;
          }
        }
      }

      if (bestFolderIndex === -1) break;

      const pool = folderSampledLists[bestFolderIndex];
      const idx = poolIndices[bestFolderIndex];
      finalQueueIds.push(pool[idx]);

      poolIndices[bestFolderIndex] = idx + 1;
      fatigueScores[bestFolderIndex] += 1.5;

      for (let j = 0; j < fatigueScores.length; j++) {
        if (j !== bestFolderIndex) {
          fatigueScores[j] = Math.max(0, fatigueScores[j] - 0.4);
        }
      }
    }

    // Adjust indexes based on trigger
    if (triggerReason === 'preference_change') {
      currentIndex = Math.min(currentIndex, finalQueueIds.length - 1);
      deepestIndexReached = Math.min(deepestIndexReached, finalQueueIds.length - 1);
      if (currentIndex < 0) currentIndex = 0;
      if (deepestIndexReached < 0) deepestIndexReached = 0;
    } else {
      currentIndex = 0;
      deepestIndexReached = 0;
    }

    const queueStr = JSON.stringify(finalQueueIds);
    const selectedFoldersStr = JSON.stringify(finalSelectedFolders);
    const updatedAt = new Date().toISOString();

    const sessionResult = {
      userId,
      selectedRootFolderIds: finalSelectedFolders,
      currentIndex,
      deepestIndexReached,
      queue: finalQueueIds,
      contentHash: hash,
      eligibleCardCount: cardCount,
      queueVersion: queueVersion + 1,
      updatedAt
    };

    sessionMemoryShadow = sessionResult;
    lastRegenTimestamp = now;
    invalidateSliceCache();

    // Persist session to SQLite asynchronously in the background so it doesn't block the UI threads
    if (isSQLiteAvailable()) {
      sqliteWriteManager.enqueue({
        id: `save-session-${Date.now()}`,
        type: 'custom',
        userId,
        data: {
          executor: async (db: any) => {
            await db.runAsync(
              `INSERT INTO reel_sessions (
                userId, selectedRootFolderIds, currentIndex, deepestIndexReached, queue, contentHash, eligibleCardCount, queueVersion, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(userId) DO UPDATE SET
                selectedRootFolderIds=excluded.selectedRootFolderIds,
                currentIndex=excluded.currentIndex,
                deepestIndexReached=excluded.deepestIndexReached,
                queue=excluded.queue,
                contentHash=excluded.contentHash,
                eligibleCardCount=excluded.eligibleCardCount,
                queueVersion=excluded.queueVersion + 1,
                updatedAt=excluded.updatedAt;`,
              [
                userId,
                selectedFoldersStr,
                currentIndex,
                deepestIndexReached,
                queueStr,
                hash,
                cardCount,
                queueVersion,
                updatedAt
              ]
            );
          }
        },
        timestamp: Date.now(),
        priority: 'normal'
      }).catch(err => console.error('[SQLite Save Session Async Error]', err.message));
    }

    return sessionResult;
  });
}

let lastProcessedFeedSessionId: string | null = null;

/**
 * Hydrate and serve a sliding slice window of cards completely offline asynchronously.
 */
export async function getReelFeedSliceLocally(userId: string, feedSessionId?: string): Promise<any> {
  if (!isSQLiteAvailable()) return null;
  const db = await getDatabase();

  return profiler.profileAsync('Get Reel Feed Slice Locally (Async)', async () => {
    const isNewSession = feedSessionId && feedSessionId !== lastProcessedFeedSessionId;
    if (isNewSession) {
      lastProcessedFeedSessionId = feedSessionId;
    }

    // 1. Resolve active session from memory shadow first
    let session: any = sessionMemoryShadow;
    if (userId === 'guest-user') {
      if (!session || session.userId !== userId) {
        const generated = await generateReelsQueueLocally(userId, 'session_start');
        session = sessionMemoryShadow || generated;
      }
    } else {
      if (!session || session.userId !== userId) {
        const dbRow = await db.getFirstAsync<any>(
          'SELECT * FROM reel_sessions WHERE userId = ? LIMIT 1;',
          [userId]
        );
        if (dbRow) {
          session = {
            userId: dbRow.userId,
            currentIndex: dbRow.currentIndex,
            deepestIndexReached: dbRow.deepestIndexReached,
            queue: typeof dbRow.queue === 'string' ? JSON.parse(dbRow.queue) : dbRow.queue,
            contentHash: dbRow.contentHash,
            eligibleCardCount: dbRow.eligibleCardCount,
            queueVersion: dbRow.queueVersion || 1,
            updatedAt: dbRow.updatedAt
          };
          sessionMemoryShadow = session;
        }
      }
    }

    if (!session || !session.queue) {
      const generated = await generateReelsQueueLocally(userId, 'session_start');
      session = sessionMemoryShadow || {
        userId,
        currentIndex: generated?.currentIndex || 0,
        deepestIndexReached: generated?.deepestIndexReached || 0,
        queue: generated?.queue || [],
        contentHash: generated?.contentHash || '',
        eligibleCardCount: generated?.eligibleCardCount || 0,
        queueVersion: generated?.queueVersion || 1,
        updatedAt: generated?.updatedAt || new Date().toISOString()
      };
      sessionMemoryShadow = session;
    } else {
      // Validate local content hash asynchronously only on new session bounds
      if (isNewSession) {
        const prefs = await getLocalUserPreferences(userId);
        const { hash } = await computeLocalContentHash(prefs.selectedRootFolderIds, userId);

        if (session.contentHash !== hash) {
          console.log('[Offline Feed Manager] New session & hash mismatch. Regenerating queue...');
          const generated = await generateReelsQueueLocally(userId, 'session_start');
          session = sessionMemoryShadow || generated || session;
        }
      }
    }

    const store = usePlaylistStateStore.getState();
    const cardsById = store.cardsById;
    const foldersById = store.foldersById;

    const queue = session.queue || [];
    
    // Step 3 — BULK CLEAN INVALID QUEUE: Remove ALL invalid/deleted cards from queue immediately
    const initialQueueLength = queue.length;
    const cleanQueue = queue.filter((id: any) => {
      const cleanId = id.split('-loop-')[0];
      const card = cardsById[cleanId] as any;
      return card && !card.isDeleted;
    });

    const uniqueIds = new Set(cleanQueue);
    const duplicateCount = cleanQueue.length - uniqueIds.size;

    if (cleanQueue.length !== initialQueueLength) {
      console.warn(`[Offline Slice Manager] Queue contained invalid/deleted cards. Bulk cleaned ${initialQueueLength - cleanQueue.length} cards. Unique: ${uniqueIds.size}, Duplicates: ${duplicateCount}`);
      session.queue = cleanQueue;
      if (session.currentIndex >= cleanQueue.length) {
        session.currentIndex = 0;
        session.deepestIndexReached = 0;
      }
      session.updatedAt = new Date().toISOString();
      flushSessionIndexAndQueueToSQLite(userId).catch(console.error);
    }

    const queueLength = cleanQueue.length;
    if (queueLength === 0) {
      console.warn('[Offline Slice Manager] Queue became empty after cleaning. Rebuilding feed from source-of-truth...');
      invalidateSliceCache();
      sessionMemoryShadow = null;
      
      const generated = await generateReelsQueueLocally(userId, 'scroll_refill');
      if (!generated || generated.queue.length === 0) {
        console.warn('[Offline Slice Manager] Study queue is empty after rebuilding.');
        return {
          queueLength: 0,
          orderedCardIds: [],
          startIdx: 0,
          currentIndex: 0,
          deepestIndexReached: 0,
          queueVersion: 1,
          contentHash: '',
          cardsSlice: [],
        };
      }
      
      generated.currentIndex = 0;
      generated.deepestIndexReached = 0;
      sessionMemoryShadow = generated;
      
      if (isSQLiteAvailable()) {
        sqliteWriteManager.enqueue({
          id: `reset-session-empty-${Date.now()}`,
          type: 'custom',
          userId,
          data: {
            executor: async (db: any) => {
              await db.runAsync(
                'UPDATE reel_sessions SET currentIndex = 0, deepestIndexReached = 0, queue = ?, updatedAt = ? WHERE userId = ?;',
                [JSON.stringify(generated.queue), new Date().toISOString(), userId]
              );
            }
          },
          timestamp: Date.now(),
          priority: 'normal'
        }).catch(console.error);
      }
      
      const startIdx = 0;
      const endIdx = Math.min(generated.queue.length - 1, NEXT_WINDOW_SIZE);
      const sliceIds = generated.queue.slice(startIdx, endIdx + 1);
      const orderedSlice = sliceIds.map((id: any) => {
        const cleanId = id.split('-loop-')[0];
        const card = cardsById[cleanId] as any;
        if (!card || card.isDeleted) return null;
        
        const folderIdStr = typeof card.folderId === 'object' ? card.folderId?._id : card.folderId;
        const folderRef = (foldersById as any)[folderIdStr] || { _id: folderIdStr, title: 'Folder' };
        
        return {
          _id: card._id,
          title: card.title,
          topic: card.topic,
          tags: card.tags || [],
          difficulty: card.difficulty,
          folderId: {
            _id: folderRef._id,
            title: folderRef.title,
            icon: folderRef.icon || 'folder',
            color: folderRef.color || '#7c3aed',
          },
          createdBy: { id: typeof card.createdBy === 'object' ? (card.createdBy as any)?.id || '' : card.createdBy, name: 'Author' },
          visibility: card.visibility || 'public',
          order: card.order || 0,
          explanation: card.explanation || '',
          code: card.code || '',
          imageBlobPath: card.imageBlobPath,
          imageHash: card.imageHash,
          examples: card.examples || [],
          slides: card.slides,
          isFavorite: !!card.isFavorite,
          difficultyState: card.difficultyState || null,
          currentUserQuestionProgress: card.currentUserQuestionProgress || null,
          createdAt: card.updatedAt,
          updatedAt: card.updatedAt,
          isContentFullyHydrated: !!card.isContentFullyHydrated,
        } as any;
      }).filter(Boolean) as IPopulatedRevisionCard[];
      
      return {
        queueLength: generated.queue.length,
        orderedCardIds: generated.queue,
        startIdx: 0,
        currentIndex: 0,
        deepestIndexReached: 0,
        queueVersion: generated.queueVersion,
        contentHash: generated.contentHash,
        cardsSlice: orderedSlice,
      };
    }

    let currentIdx = session.currentIndex || 0;
    if (currentIdx >= queueLength) {
      currentIdx = 0;
      session.currentIndex = 0;
      session.deepestIndexReached = 0;
      session.updatedAt = new Date().toISOString();
      // Debounce writing this wrap-around index
      if (saveSessionTimeout) clearTimeout(saveSessionTimeout);
      saveSessionTimeout = setTimeout(() => {
        flushSessionIndexToSQLite(userId).catch(console.error);
      }, 3000);
    }
    if (currentIdx < 0) currentIdx = 0;

    // 2. Check active viewport slice cache from memory
    if (
      cachedSliceResult &&
      cachedSliceUserId === userId &&
      !isNewSession &&
      Math.abs(currentIdx - cachedSliceResult.currentIndex) <= 3 &&
      cachedSliceResult.queueLength === queueLength
    ) {
      cachedSliceResult.currentIndex = currentIdx;
      return cachedSliceResult;
    }

    let sliceIds: string[] = [];
    let orderedSlice: IPopulatedRevisionCard[] = [];
    let refillRetries = 0;

    while (refillRetries < 3) {
      const startIdx = Math.max(0, currentIdx - PREVIOUS_WINDOW_SIZE);
      const endIdx = Math.min(queueLength - 1, currentIdx + NEXT_WINDOW_SIZE);

      sliceIds = cleanQueue.slice(startIdx, endIdx + 1);

      if (sliceIds.length === 0) break;



      orderedSlice = sliceIds.map(id => {
        const cleanId = id.split('-loop-')[0];
        const card = cardsById[cleanId] as any;
        if (!card || card.isDeleted) return null;


        const folderIdStr = typeof card.folderId === 'object' ? card.folderId?._id : card.folderId;
        const folderRef = (foldersById as any)[folderIdStr] || { _id: folderIdStr, title: 'Folder' };

        return {
          _id: card._id,
          title: card.title,
          topic: card.topic,
          tags: card.tags || [],
          difficulty: card.difficulty,
          folderId: {
            _id: folderRef._id,
            title: folderRef.title,
            icon: folderRef.icon || 'folder',
            color: folderRef.color || '#7c3aed',
          },
          createdBy: { id: typeof card.createdBy === 'object' ? (card.createdBy as any)?.id || '' : card.createdBy, name: 'Author' },
          visibility: card.visibility || 'public',
          order: card.order || 0,
          explanation: card.explanation || '',
          code: card.code || '',
          imageBlobPath: card.imageBlobPath,
          imageHash: card.imageHash,
          examples: card.examples || [],
          slides: card.slides,
          isFavorite: !!card.isFavorite,
          difficultyState: card.difficultyState || null,
          currentUserQuestionProgress: card.currentUserQuestionProgress || null,
          createdAt: card.updatedAt,
          updatedAt: card.updatedAt,
          isContentFullyHydrated: !!card.isContentFullyHydrated,
        } as any;
      }).filter(Boolean) as IPopulatedRevisionCard[];

      // Verify active card exists
      const activeCardId = cleanQueue[currentIdx];
      const activeCard = cardsById[activeCardId] as any;
      const isActiveCardDeleted = !activeCard || activeCard.isDeleted;

      if (isActiveCardDeleted) {
        console.warn(`[Offline Slice Manager] Active card ${activeCardId} is deleted. Advancing scroll index...`);
        currentIdx++;

        if (currentIdx >= queueLength) {
          await generateReelsQueueLocally(userId, 'scroll_refill');
          currentIdx = 0;
          session = sessionMemoryShadow || session;
        } else {
          session.currentIndex = currentIdx;
          session.updatedAt = new Date().toISOString();
          if (saveSessionTimeout) clearTimeout(saveSessionTimeout);
          saveSessionTimeout = setTimeout(() => {
            flushSessionIndexToSQLite(userId).catch(console.error);
          }, 3000);
        }
        refillRetries++;
      } else {
        break;
      }
    }

    if (refillRetries >= 3) {
      const now = Date.now();
      if (now - lastReplenishmentTime < 5000) {
        replenishmentAttemptsCount++;
      } else {
        replenishmentAttemptsCount = 1;
      }
      lastReplenishmentTime = now;

      if (replenishmentAttemptsCount > 3) {
        console.error('[Offline Slice Manager] QUEUE RECOVERY LOOP DETECTED. Triggering hard reset...');
        sessionMemoryShadow = null;
        invalidateSliceCache();
        replenishmentAttemptsCount = 0;
        
        if (isSQLiteAvailable()) {
          sqliteWriteManager.enqueue({
            id: `hard-reset-session-${Date.now()}`,
            type: 'custom',
            userId,
            data: {
              executor: async (db: any) => {
                await db.runAsync('DELETE FROM reel_sessions WHERE userId = ?;', [userId]);
              }
            },
            timestamp: Date.now(),
            priority: 'critical'
          }).catch(console.error);
        }
        
        const generated = await generateReelsQueueLocally(userId, 'session_start');
        if (generated && generated.queue.length > 0) {
          const sliceIds = generated.queue.slice(0, NEXT_WINDOW_SIZE + 1);
          const orderedSlice = sliceIds.map((id: any) => {
            const cleanId = id.split('-loop-')[0];
            const card = cardsById[cleanId] as any;
            if (!card || card.isDeleted) return null;
            const folderIdStr = typeof card.folderId === 'object' ? card.folderId?._id : card.folderId;
            const folderRef = (foldersById as any)[folderIdStr] || { _id: folderIdStr, title: 'Folder' };
            return {
              _id: card._id,
              title: card.title,
              topic: card.topic,
              tags: card.tags || [],
              difficulty: card.difficulty,
              folderId: {
                _id: folderRef._id,
                title: folderRef.title,
                icon: folderRef.icon || 'folder',
                color: folderRef.color || '#7c3aed',
              },
              createdBy: { id: typeof card.createdBy === 'object' ? (card.createdBy as any)?.id || '' : card.createdBy, name: 'Author' },
              visibility: card.visibility || 'public',
              order: card.order || 0,
              explanation: card.explanation || '',
              code: card.code || '',
              imageBlobPath: card.imageBlobPath,
              imageHash: card.imageHash,
              examples: card.examples || [],
              slides: card.slides,
              isFavorite: !!card.isFavorite,
              difficultyState: card.difficultyState || null,
              currentUserQuestionProgress: card.currentUserQuestionProgress || null,
              createdAt: card.updatedAt,
              updatedAt: card.updatedAt,
              isContentFullyHydrated: !!card.isContentFullyHydrated,
            } as any;
          }).filter(Boolean) as IPopulatedRevisionCard[];

          return {
            queueLength: generated.queue.length,
            orderedCardIds: generated.queue,
            startIdx: 0,
            currentIndex: 0,
            deepestIndexReached: 0,
            queueVersion: generated.queueVersion,
            contentHash: generated.contentHash,
            cardsSlice: orderedSlice,
          };
        } else {
          return {
            queueLength: 0,
            orderedCardIds: [],
            startIdx: 0,
            currentIndex: 0,
            deepestIndexReached: 0,
            queueVersion: 1,
            contentHash: '',
            cardsSlice: [],
          };
        }
      }

      console.warn(`[Offline Slice Manager] Running emergency hard queue replenishment (Attempt ${replenishmentAttemptsCount})...`);
      invalidateSliceCache();
      const generated = await generateReelsQueueLocally(userId, 'scroll_refill');
      if (generated && generated.queue.length > 0) {
        const sliceIds = generated.queue.slice(0, NEXT_WINDOW_SIZE + 1);
        const orderedSlice = sliceIds.map((id: any) => {
          const cleanId = id.split('-loop-')[0];
          const card = cardsById[cleanId] as any;
          if (!card || card.isDeleted) return null;
          const folderIdStr = typeof card.folderId === 'object' ? card.folderId?._id : card.folderId;
          const folderRef = (foldersById as any)[folderIdStr] || { _id: folderIdStr, title: 'Folder' };
          return {
            _id: card._id,
            title: card.title,
            topic: card.topic,
            tags: card.tags || [],
            difficulty: card.difficulty,
            folderId: {
              _id: folderRef._id,
              title: folderRef.title,
              icon: folderRef.icon || 'folder',
              color: folderRef.color || '#7c3aed',
            },
            createdBy: { id: typeof card.createdBy === 'object' ? (card.createdBy as any)?.id || '' : card.createdBy, name: 'Author' },
            visibility: card.visibility || 'public',
            order: card.order || 0,
            explanation: card.explanation || '',
            code: card.code || '',
            imageBlobPath: card.imageBlobPath,
            imageHash: card.imageHash,
            examples: card.examples || [],
            slides: card.slides,
            isFavorite: !!card.isFavorite,
            difficultyState: card.difficultyState || null,
            currentUserQuestionProgress: card.currentUserQuestionProgress || null,
            createdAt: card.updatedAt,
            updatedAt: card.updatedAt,
            isContentFullyHydrated: !!card.isContentFullyHydrated,
          } as any;
        }).filter(Boolean) as IPopulatedRevisionCard[];

        return {
          queueLength: generated.queue.length,
          orderedCardIds: generated.queue,
          startIdx: 0,
          currentIndex: 0,
          deepestIndexReached: 0,
          queueVersion: generated.queueVersion,
          contentHash: generated.contentHash,
          cardsSlice: orderedSlice,
        };
      } else {
        return {
          queueLength: 0,
          orderedCardIds: [],
          startIdx: 0,
          currentIndex: 0,
          deepestIndexReached: 0,
          queueVersion: 1,
          contentHash: '',
          cardsSlice: [],
        };
      }
    }

    const result = {
      queueLength,
      orderedCardIds: queue,
      startIdx: Math.max(0, currentIdx - PREVIOUS_WINDOW_SIZE),
      currentIndex: currentIdx,
      deepestIndexReached: session.deepestIndexReached,
      queueVersion: session.queueVersion,
      contentHash: session.contentHash,
      cardsSlice: orderedSlice,
    };

    cachedSliceResult = result;
    cachedSliceUserId = userId;

    return result;
  });
}

/**
 * Monotonically update index locally asynchronously and enqueue offline progress report.
 */
export async function updateReelIndexLocally(userId: string, currentIndex: number): Promise<void> {
  // Try using memory shadow session
  let session = sessionMemoryShadow;
  if (!session || session.userId !== userId) {
    if (!isSQLiteAvailable()) return;
    const db = await getDatabase();
    try {
      const dbRow = await db.getFirstAsync<any>(
        'SELECT * FROM reel_sessions WHERE userId = ? LIMIT 1;',
        [userId]
      );
      if (dbRow) {
        session = {
          userId: dbRow.userId,
          currentIndex: dbRow.currentIndex,
          deepestIndexReached: dbRow.deepestIndexReached,
          queue: typeof dbRow.queue === 'string' ? JSON.parse(dbRow.queue) : dbRow.queue,
          contentHash: dbRow.contentHash,
          eligibleCardCount: dbRow.eligibleCardCount,
          queueVersion: dbRow.queueVersion || 1,
          updatedAt: dbRow.updatedAt
        };
        sessionMemoryShadow = session;
      }
    } catch (err: any) {
      console.error('[Offline Feed Manager] Failed to load session for index update:', err.message);
      return;
    }
  }

  if (!session) {
    console.warn('[Offline Feed Manager] Active reels session not found for index update');
    return;
  }

  const queue = session.queue;
  let targetIndex = currentIndex;
  let hasWrapped = false;
  if (targetIndex >= queue.length) {
    targetIndex = 0;
    hasWrapped = true;
  } else if (targetIndex < 0) {
    targetIndex = queue.length - 1;
  }

  const deepest = hasWrapped ? 0 : Math.max(session.deepestIndexReached || 0, targetIndex);
  const updatedAt = new Date().toISOString();

  // Update memory shadow instantly
  session.currentIndex = targetIndex;
  session.deepestIndexReached = deepest;
  session.updatedAt = updatedAt;
}

/**
 * Mark card as watched/seen inside Reels locally asynchronously (in-memory shadow).
 */
export async function markReelAsSeenLocally(userId: string, cardId: string): Promise<void> {
  const cleanId = cardId.split('-loop-')[0];
  sessionSeenMemoryShadow.add(cleanId);
  if (__DEV__) {
    console.log(`[Memory Save] Marked seen in session: ${cleanId}`);
  }
}

/**
 * Flush all seen cards collected in sessionSeenMemoryShadow in batch to SQLite.
 */
export async function flushSessionSeenCardsToSQLite(userId: string, dbOverride?: any): Promise<void> {
  if (sessionSeenMemoryShadow.size === 0) return;
  if (!isSQLiteAvailable()) return;

  const seenIds = Array.from(sessionSeenMemoryShadow);
  sessionSeenMemoryShadow.clear(); // Clear memory shadow immediately to avoid double-processing

  const runUpdates = async (db: any) => {
    const now = new Date().toISOString();
    for (const cleanId of seenIds) {
      const row = await db.getFirstAsync(
        'SELECT cardId FROM card_progress WHERE userId = ? AND cardId = ? LIMIT 1;',
        [userId, cleanId]
      );

      if (row) {
        await db.runAsync(
          'UPDATE card_progress SET seenInReels = 1, updatedAt = ? WHERE userId = ? AND cardId = ?;',
          [now, userId, cleanId]
        );
      } else {
        await db.runAsync(
          `INSERT INTO card_progress (
            cardId, userId, completed, revisionCount, favorite, difficultyState, seenInReels, revision, updatedAt
          ) VALUES (?, ?, 0, 0, 0, NULL, 1, 0, ?);`,
          [cleanId, userId, now]
        );
      }
    }
  };

  try {
    if (dbOverride) {
      await runUpdates(dbOverride);
    } else {
      await sqliteWriteManager.enqueue({
        id: `flush-seen-${Date.now()}`,
        type: 'custom',
        userId,
        data: {
          executor: runUpdates
        },
        timestamp: Date.now(),
        priority: 'normal',
      });
    }
    if (__DEV__) {
      console.log(`[SQLite Save] Bulk flushed ${seenIds.length} seen card states.`);
    }
  } catch (err: any) {
    console.error('[Offline Feed Manager] Failed to flush seen cards in batch:', err.message);
  }
}

/**
 * Get the current replenishment attempts count (for diagnostics).
 */
export function getReplenishmentAttemptsCount(): number {
  return replenishmentAttemptsCount;
}

