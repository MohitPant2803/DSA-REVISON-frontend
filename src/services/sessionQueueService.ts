import api from '@/services/api';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { cacheStorage } from '@/lib/cache';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { resolveCardState } from '@/utils/resolveCardState';
import { AppState } from 'react-native';
import { getAllDescendantFolderIds } from '@/utils/folderHelpers';

export interface ISessionQueue {
  _id: string;
  userId: string;
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater';
  sourceId: string;
  orderedCardIds: string[];
  currentIndex: number;
  shuffle: boolean;
  seenSet: string[];
  cycleNumber: number;
  createdAt: string;
}

export interface ISessionCardsSlice {
  orderedCardIds: string[];
  currentIndex: number;
  shuffle: boolean;
  cardsSlice: IPopulatedRevisionCard[];
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater';
  sourceId: string;
}

// In-memory simulation of active local session queues for offline mode
const localSessions: Record<string, ISessionQueue> = {};

const pendingCacheFlushes: Record<string, ISessionQueue> = {};
let cacheFlushTimeout: NodeJS.Timeout | null = null;

export const flushSessionQueuesToCacheSync = () => {
  if (cacheFlushTimeout) {
    clearTimeout(cacheFlushTimeout);
    cacheFlushTimeout = null;
  }
  
  Object.keys(pendingCacheFlushes).forEach((key) => {
    const session = pendingCacheFlushes[key];
    delete pendingCacheFlushes[key];
    cacheStorage.set(`session_${session._id}`, session).catch((e) => {
      console.error('[Session Queue] Sync cache flush failed:', e);
    });
  });
};

const flushSessionQueuesToCache = async () => {
  if (cacheFlushTimeout) {
    clearTimeout(cacheFlushTimeout);
    cacheFlushTimeout = null;
  }
  
  const keys = Object.keys(pendingCacheFlushes);
  for (const key of keys) {
    const session = pendingCacheFlushes[key];
    delete pendingCacheFlushes[key];
    try {
      await cacheStorage.set(`session_${session._id}`, session);
    } catch (e) {
      console.error('[Session Queue] Async cache flush failed:', e);
    }
  }
};

const persistSessionMemory = (session: ISessionQueue) => {
  localSessions[session._id] = session;
  pendingCacheFlushes[session._id] = session;
  
  if (cacheFlushTimeout) {
    clearTimeout(cacheFlushTimeout);
  }
  
  cacheFlushTimeout = setTimeout(() => {
    flushSessionQueuesToCache().catch(console.error);
  }, 3000); // 3-second debounce
};

AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'inactive' || nextAppState === 'background') {
    flushSessionQueuesToCacheSync();
  }
});

export const invalidateSession = async (sourceId: string) => {
  const sessionId = `local-session-${sourceId}`;
  delete localSessions[sessionId];
  delete pendingCacheFlushes[sessionId];
  await cacheStorage.remove(`session_${sessionId}`);
  console.log('[Session Queue] Invalidated session for:', sourceId);
};

const persistSession = async (session: ISessionQueue) => {
  localSessions[session._id] = session;
  await cacheStorage.set(`session_${session._id}`, session);
};

const getDeterministicQueue = (baseCardIds: string[], cardsById: Record<string, any>) => {
  const skipped: string[] = [];
  const unseen: string[] = [];
  const hard: string[] = [];
  const medium: string[] = [];
  const easy: string[] = [];
  const others: string[] = [];

  for (const id of baseCardIds) {
    const card = cardsById[id];
    const difficulty = card?.difficultyState;
    if (difficulty === 'skipped') skipped.push(id);
    else if (!difficulty) unseen.push(id);
    else if (difficulty === 'hard') hard.push(id);
    else if (difficulty === 'medium') medium.push(id);
    else if (difficulty === 'easy') easy.push(id);
    else others.push(id);
  }

  // Shuffle within categories to add novelty but respect priority
  const shuffleArray = (arr: string[]) => {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  };

  return [
    ...shuffleArray(skipped),
    ...shuffleArray(unseen),
    ...shuffleArray(hard),
    ...shuffleArray(medium),
    ...shuffleArray(easy),
    ...shuffleArray(others)
  ];
};

export const startLocalSession = async (
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater',
  sourceId: string,
  shuffle = false,
  startCardId?: string
): Promise<ISessionQueue> => {
  console.log('[Session Queue] Launching Local-First Virtual Session for:', sourceId);
  
  const sessionId = `local-session-${sourceId}`;
  
  // Try restoring a persistent session first
  if (sourceType === 'folder' && !startCardId) {
    try {
      const cachedSession = await cacheStorage.get<ISessionQueue>(`session_${sessionId}`);
      if (cachedSession && cachedSession.shuffle === shuffle) {
        console.log('[Session Queue] Restored persisted session for:', sourceId);
        localSessions[sessionId] = cachedSession;
        return cachedSession;
      }
    } catch (e) {}
  }

  let orderedCardIds: string[] = [];
  const { cardsById, playlistCardOrderMap, playlistsById } = usePlaylistStateStore.getState();

  if (sourceType === 'playlist' || sourceType === 'liked' || sourceType === 'watchLater') {
    const playlistId = sourceType === 'liked' ? 'likes' : (sourceType === 'watchLater' ? 'watch-later' : sourceId);
    const seen = new Set<string>();
    const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);

    if (isSmart) {
      const cardDifficultyMap = usePlaylistStateStore.getState().cardDifficultyMap;
      const resolved = Object.keys(cardsById)
        .map((cardId) => cardsById[cardId])
        .filter(Boolean)
        .map((card) => resolveCardState(card as any, cardDifficultyMap, cardsById as any))
        .filter((resolvedCard) => resolvedCard.difficultyState === playlistId);

      const seenTitles = new Set<string>();
      const uniqueResolved = resolved.filter((card) => {
        if (!card.title) return false;
        const titleKey = card.title.trim().toLowerCase();
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
      });

      const order = playlistCardOrderMap[playlistId] || [];
      if (order.length > 0) {
        const orderMap = new Map<string, number>(order.map((id, index) => [id, index]));
        uniqueResolved.sort((a, b) => {
          const idxA = orderMap.has(a._id) ? orderMap.get(a._id)! : 9999;
          const idxB = orderMap.has(b._id) ? orderMap.get(b._id)! : 9999;
          return idxA - idxB;
        });
      }
      orderedCardIds = uniqueResolved.map((card) => card._id);
    } else {
      const playlist = playlistsById[playlistId];
      const baseIds = playlistCardOrderMap[playlistId] || playlist?.cardIds || playlist?.orderedCardIds || [];
      orderedCardIds = baseIds.filter((id) => {
        const cleanId = id.split('-loop-')[0];
        if (!cleanId || seen.has(cleanId)) return false;
        seen.add(cleanId);
        return true;
      });
    }
  } else if (sourceType === 'folder') {
    try {
      const cached = await cacheStorage.get<any>(`cards_folder_${sourceId}_true`) || await cacheStorage.get<any>(`cards_folder_${sourceId}`);
      if (cached && cached.results) {
        orderedCardIds = cached.results.map((c: any) => c._id);
      }
    } catch (e) {}

    if (orderedCardIds.length === 0) {
      const { foldersById } = usePlaylistStateStore.getState();
      const descendantIds = getAllDescendantFolderIds(sourceId, foldersById);
      orderedCardIds = Object.values(cardsById)
        .filter((c) => {
          if (!c) return false;
          const fid = typeof c.folderId === 'object' && c.folderId !== null ? (c.folderId as any)._id : c.folderId;
          return descendantIds.has(fid) || (c.rootFolderId && descendantIds.has(c.rootFolderId));
        })
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((c) => c._id);
    }
  }

  if (shuffle && orderedCardIds.length > 0) {
    orderedCardIds = getDeterministicQueue(orderedCardIds, cardsById);
  }

  let currentIndex = 0;
  if (startCardId) {
    const targetClean = startCardId.split('-loop-')[0];
    for (let i = 0; i < orderedCardIds.length; i++) {
      if (orderedCardIds[i].split('-loop-')[0] === targetClean) {
        currentIndex = i;
        break;
      }
    }
  }

  const session: ISessionQueue = {
    _id: sessionId,
    userId: 'local-user',
    sourceType,
    sourceId,
    orderedCardIds,
    currentIndex,
    shuffle,
    seenSet: [],
    cycleNumber: 1,
    createdAt: new Date().toISOString()
  };

  await persistSession(session);
  return session;
};

export const startSession = async (
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater',
  sourceId: string,
  shuffle = false,
  startCardId?: string
): Promise<ISessionQueue> => {
  // Always use local session queue for ultra-fast, local-first performance (<5ms)
  return startLocalSession(sourceType, sourceId, shuffle, startCardId);
};

export const getSessionQueue = async (sessionId: string): Promise<ISessionQueue> => {
  let session = localSessions[sessionId];
  if (!session) {
    session = await cacheStorage.get<ISessionQueue>(`session_${sessionId}`) as ISessionQueue;
    if (session) localSessions[sessionId] = session;
  }
  if (!session) {
    console.warn('[Session Queue] Local session not found, creating fallback for:', sessionId);
    const sourceId = sessionId.replace('local-session-', '');
    const sourceType = sourceId.length > 20 ? 'folder' : 'playlist';
    return startLocalSession(sourceType, sourceId, false);
  }
  return session;
};

export const updateSessionIndex = async (
  sessionId: string,
  currentIndex: number
): Promise<ISessionQueue> => {
  const session = await getSessionQueue(sessionId);
  if (session) {
    session.currentIndex = currentIndex;
    
    const currentCardId = session.orderedCardIds[currentIndex];
    if (currentCardId && !session.seenSet.includes(currentCardId)) {
      session.seenSet.push(currentCardId);
    }

    // Check for cycle completion
    if (session.seenSet.length >= session.orderedCardIds.length && session.orderedCardIds.length > 0) {
      session.cycleNumber += 1;
      session.seenSet = [];
      const { cardsById } = usePlaylistStateStore.getState();
      if (session.shuffle) {
        session.orderedCardIds = getDeterministicQueue(session.orderedCardIds, cardsById);
      }
      session.currentIndex = 0; // Restart cycle
    }

    persistSessionMemory(session);
  }
  return session;
};

export const toggleSessionShuffle = async (
  sessionId: string,
  shuffle: boolean
): Promise<ISessionQueue> => {
  const session = await getSessionQueue(sessionId);
  if (session) {
    session.shuffle = shuffle;
    const { cardsById } = usePlaylistStateStore.getState();
    if (shuffle) {
      session.orderedCardIds = getDeterministicQueue(session.orderedCardIds, cardsById);
    } else {
      // Revert to non-shuffled state by re-generating the original queue
      const tempSession = await startLocalSession(session.sourceType, session.sourceId, false);
      session.orderedCardIds = tempSession.orderedCardIds;
    }
    await persistSession(session);
  }
  return session;
};

export const getSessionCardsSlice = async (sessionId: string): Promise<ISessionCardsSlice> => {
  const session = await getSessionQueue(sessionId);
  if (!session) {
    throw new Error('Local session not found');
  }

  // Pure in-memory card array mapping using Zustand store (already fully hydrated on boot)
  const { cardsById } = usePlaylistStateStore.getState();
  const cardsSlice = session.orderedCardIds
    .map(id => cardsById[id.split('-loop-')[0]])
    .filter(Boolean) as IPopulatedRevisionCard[];

  return {
    orderedCardIds: session.orderedCardIds,
    currentIndex: session.currentIndex,
    shuffle: session.shuffle,
    cardsSlice,
    sourceType: session.sourceType,
    sourceId: session.sourceId,
  };
};
