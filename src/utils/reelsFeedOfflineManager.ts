import { getDatabase, isSQLiteAvailable } from './sqliteDatabase';
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

let saveSessionTimeout: NodeJS.Timeout | null = null;
let lastRegenTimestamp = 0;

export function flushSessionIndexToSQLiteSync(userId: string) {
  if (!sessionMemoryShadow || sessionMemoryShadow.userId !== userId) return;
  if (saveSessionTimeout) {
    clearTimeout(saveSessionTimeout);
    saveSessionTimeout = null;
  }
  
  if (!isSQLiteAvailable()) return;
  const db = getDatabase();
  
  const { currentIndex, deepestIndexReached, updatedAt } = sessionMemoryShadow;
  
  if (__DEV__) {
    console.log(`[SQLite Save] Entity: reel_sessions | Action: flushSessionIndexToSQLiteSync | Index: ${currentIndex}`);
  }

  db.runAsync(
    'UPDATE reel_sessions SET currentIndex = ?, deepestIndexReached = ?, updatedAt = ? WHERE userId = ?;',
    [currentIndex, deepestIndexReached, updatedAt, userId]
  ).catch(err => {
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
  const db = getDatabase();
  
  try {
    const { currentIndex, deepestIndexReached, updatedAt } = sessionMemoryShadow;
    if (__DEV__) {
      console.log(`[SQLite Save] Entity: reel_sessions | Action: flushSessionIndexToSQLite | Index: ${currentIndex}`);
    }
    await db.runAsync(
      'UPDATE reel_sessions SET currentIndex = ?, deepestIndexReached = ?, updatedAt = ? WHERE userId = ?;',
      [currentIndex, deepestIndexReached, updatedAt, userId]
    );

    // Flush seen cards in batch inside transaction
    await flushSessionSeenCardsToSQLite(userId);
  } catch (err: any) {
    console.error('[Offline Feed Manager] Failed to flush session index to SQLite:', err.message);
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

  const folderIdsToQuery = [...parentIds];
  let currentParentIds = [...parentIds];

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
  if (!isSQLiteAvailable()) return { selectedRootFolderIds: [] };
  const db = getDatabase();

  try {
    const row = await db.getFirstAsync<{ selectedRootFolderIds: string }>(
      'SELECT selectedRootFolderIds FROM reel_sessions WHERE userId = ? LIMIT 1;',
      [userId]
    );

    if (row && row.selectedRootFolderIds) {
      const parsed = JSON.parse(row.selectedRootFolderIds);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { selectedRootFolderIds: parsed };
      }
    }

    // Default: find all root folders (parentFolderId is NULL)
    const rootFolders = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM folders WHERE parentFolderId IS NULL AND isDeleted = 0;'
    );
    const folderIds = rootFolders.map(f => f.id);

    return { selectedRootFolderIds: folderIds };
  } catch (err: any) {
    console.error('[Offline Feed Manager] Failed to get user preferences:', err.message);
    return { selectedRootFolderIds: [] };
  }
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
    // Retrieve user root folder preferences
    const prefs = await getLocalUserPreferences(userId);
    const selectedFolders = prefs.selectedRootFolderIds;

    if (__DEV__) {
      console.log(`[Reels Queue Regen] Executing Memory-First | Reason: ${triggerReason} | Folders: [${selectedFolders.join(',')}]`);
    }

    if (selectedFolders.length === 0) {
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
        const db = getDatabase();
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
    const { hash, cardCount } = await computeLocalContentHash(selectedFolders, userId);
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
    const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
    const storeState = usePlaylistStateStore.getState();
    const cardsById = storeState.cardsById;

    const folderCardGroups: Record<string, string[]> = {};
    selectedFolders.forEach(id => {
      folderCardGroups[id] = [];
    });

    const allCards = Object.values(cardsById);

    selectedFolders.forEach(rootId => {
      const descendants = getDescendantFolderIdsInMemory([rootId]);
      if (descendants.length > 0) {
        const folderSet = new Set(descendants);
        folderCardGroups[rootId] = allCards
          .filter((c: any) => c && folderSet.has(c.folderId) && !c.isDeleted)
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

    for (const rootId of selectedFolders) {
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
    if (unseenEligibleCardCount === 0 && selectedFolders.length > 0) {
      for (const rootId of selectedFolders) {
        const groupCards = folderCardGroups[rootId] || [];
        if (groupCards.length === 0) continue;
        const shuffledGroup = seededShuffle(groupCards, prng);
        folderSampledLists.push(shuffledGroup);
        unseenEligibleCardCount += groupCards.length;
      }
    }

    // Reset exhausted folders progress locally asynchronously in background
    if (cardsToReset.length > 0 && isSQLiteAvailable()) {
      const db = getDatabase();
      const placeholders = cardsToReset.map(() => '?').join(',');
      db.runAsync(
        `UPDATE card_progress SET completed = 0, difficultyState = NULL, seenInReels = 0 WHERE userId = ? AND cardId IN (${placeholders})`,
        [userId, ...cardsToReset]
      ).catch(err => console.error('[SQLite Reset Progress Async Error]', err.message));
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
    const selectedFoldersStr = JSON.stringify(selectedFolders);
    const updatedAt = new Date().toISOString();

    const sessionResult = {
      userId,
      selectedRootFolderIds: selectedFolders,
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
      const db = getDatabase();
      db.runAsync(
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
      ).catch(err => console.error('[SQLite Session Save Async Error]', err.message));
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
  const db = getDatabase();

  return profiler.profileAsync('Get Reel Feed Slice Locally (Async)', async () => {
    const isNewSession = feedSessionId && feedSessionId !== lastProcessedFeedSessionId;
    if (isNewSession) {
      lastProcessedFeedSessionId = feedSessionId;
    }

    // 1. Resolve active session from memory shadow first
    let session = sessionMemoryShadow;
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

    if (!session || !session.queue) {
      const generated = await generateReelsQueueLocally(userId, 'session_start');
      session = sessionMemoryShadow || {
        userId,
        currentIndex: generated.currentIndex,
        deepestIndexReached: generated.deepestIndexReached,
        queue: generated.queue,
        contentHash: generated.contentHash,
        eligibleCardCount: generated.eligibleCardCount,
        queueVersion: generated.queueVersion,
        updatedAt: generated.updatedAt
      };
      sessionMemoryShadow = session;
    } else {
      // Validate local content hash asynchronously only on new session bounds
      if (isNewSession) {
        const prefs = await getLocalUserPreferences(userId);
        const { hash } = await computeLocalContentHash(prefs.selectedRootFolderIds, userId);

        if (session.contentHash !== hash) {
          console.log('[Offline Feed Manager] New session & hash mismatch. Regenerating queue...');
          await generateReelsQueueLocally(userId, 'session_start');
          session = sessionMemoryShadow || session;
        }
      }
    }

    const queue = session.queue;
    const queueLength = queue.length;
    if (queueLength === 0) {
      throw new Error('Your study queue is empty');
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

    const { usePlaylistStateStore } = require('../store/usePlaylistStateStore');
    const store = usePlaylistStateStore.getState();
    const cardsById = store.cardsById;
    const foldersById = store.foldersById;

    let sliceIds: string[] = [];
    let orderedSlice: IPopulatedRevisionCard[] = [];
    let refillRetries = 0;

    while (refillRetries < 3) {
      const startIdx = Math.max(0, currentIdx - PREVIOUS_WINDOW_SIZE);
      const endIdx = Math.min(queueLength - 1, currentIdx + NEXT_WINDOW_SIZE);

      sliceIds = queue.slice(startIdx, endIdx + 1);

      if (sliceIds.length === 0) break;

      orderedSlice = sliceIds.map(id => {
        const cleanId = id.split('-loop-')[0];
        const card = cardsById[cleanId];
        if (!card || card.isDeleted) return null;

        // Safety-net: only trigger on-demand hydration for cards not yet hydrated at boot
        // After bulk boot hydration, this should almost never fire
        if (!card.isContentFullyHydrated) {
          store.hydrateCardContentOnDemand(id).catch(() => {});
        }

        const folderRef = foldersById[card.folderId] || { _id: card.folderId, title: 'Folder' };

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
      const activeCardId = queue[currentIdx];
      const activeCard = cardsById[activeCardId];
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
      console.warn('[Offline Slice Manager] Running emergency hard queue replenishment...');
      sessionMemoryShadow = null;
      invalidateSliceCache();
      return getReelFeedSliceLocally(userId);
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
    const db = getDatabase();
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
export async function flushSessionSeenCardsToSQLite(userId: string): Promise<void> {
  if (sessionSeenMemoryShadow.size === 0) return;
  if (!isSQLiteAvailable()) return;

  const seenIds = Array.from(sessionSeenMemoryShadow);
  sessionSeenMemoryShadow.clear(); // Clear memory shadow immediately to avoid double-processing

  try {
    const now = new Date().toISOString();
    await sqliteWriteManager.enqueue({
      id: `flush-seen-${Date.now()}`,
      type: 'custom',
      userId,
      data: {
        executor: async (db: any) => {
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
        }
      },
      timestamp: Date.now(),
      priority: 'normal',
    });
    if (__DEV__) {
      console.log(`[SQLite Save] Bulk flushed ${seenIds.length} seen card states inside transaction.`);
    }
  } catch (err: any) {
    console.error('[Offline Feed Manager] Failed to flush seen cards in batch:', err.message);
  }
}
