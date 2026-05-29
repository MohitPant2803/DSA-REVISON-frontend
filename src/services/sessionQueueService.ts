import api from '@/services/api';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { cacheStorage } from '@/lib/cache';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { resolveCardState } from '@/utils/resolveCardState';

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

export const invalidateSession = async (sourceId: string) => {
  const sessionId = `local-session-${sourceId}`;
  delete localSessions[sessionId];
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

const startLocalSession = async (
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater',
  sourceId: string,
  shuffle = false
): Promise<ISessionQueue> => {
  console.log('[Session Queue] Launching Local-First Virtual Session for:', sourceId);
  
  const sessionId = `local-session-${sourceId}`;
  
  // Try restoring a persistent session first
  if (sourceType === 'folder') {
    try {
      const cachedSession = await cacheStorage.get<ISessionQueue>(`session_${sessionId}`);
      if (cachedSession) {
        console.log('[Session Queue] Restored persisted session for:', sourceId);
        localSessions[sessionId] = cachedSession;
        return cachedSession;
      }
    } catch (e) {}
  }

  let orderedCardIds: string[] = [];
  const { cardsById, playlistCardOrderMap } = usePlaylistStateStore.getState();

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
      orderedCardIds = (playlistCardOrderMap[playlistId] || []).filter((id) => {
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
      orderedCardIds = Object.values(cardsById)
        .filter((c) => {
          if (!c) return false;
          const fid = typeof c.folderId === 'object' && c.folderId !== null ? (c.folderId as any)._id : c.folderId;
          return fid === sourceId || c.rootFolderId === sourceId || c.subfolderIds?.includes(sourceId);
        })
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((c) => c._id);
    }
  }

  if (shuffle && orderedCardIds.length > 0) {
    orderedCardIds = getDeterministicQueue(orderedCardIds, cardsById);
  }

  const session: ISessionQueue = {
    _id: sessionId,
    userId: 'local-user',
    sourceType,
    sourceId,
    orderedCardIds,
    currentIndex: 0,
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
  shuffle = false
): Promise<ISessionQueue> => {
  const hasSynced = usePlaylistStateStore.getState().hasSyncedThisSession;
  if (hasSynced) {
    return startLocalSession(sourceType, sourceId, shuffle);
  }

  try {
    const response = await api.post<ISessionQueue>('/sessions/start', {
      sourceType,
      sourceId,
      shuffle,
    });
    return response.data;
  } catch (error) {
    return startLocalSession(sourceType, sourceId, shuffle);
  }
};

export const getSessionQueue = async (sessionId: string): Promise<ISessionQueue> => {
  if (sessionId.startsWith('local-session-')) {
    let session = localSessions[sessionId];
    if (!session) {
      session = await cacheStorage.get<ISessionQueue>(`session_${sessionId}`) as ISessionQueue;
      if (session) localSessions[sessionId] = session;
    }
    if (!session) throw new Error('Local session not found');
    return session;
  }
  const response = await api.get<ISessionQueue>(`/sessions/${sessionId}`);
  return response.data;
};

export const updateSessionIndex = async (
  sessionId: string,
  currentIndex: number
): Promise<ISessionQueue> => {
  if (sessionId.startsWith('local-session-')) {
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

      await persistSession(session);
    }
    return session!;
  }
  const response = await api.put<ISessionQueue>(`/sessions/${sessionId}/index`, {
    currentIndex,
  });
  return response.data;
};

export const toggleSessionShuffle = async (
  sessionId: string,
  shuffle: boolean
): Promise<ISessionQueue> => {
  if (sessionId.startsWith('local-session-')) {
    const session = await getSessionQueue(sessionId);
    if (session) {
      session.shuffle = shuffle;
      const { cardsById } = usePlaylistStateStore.getState();
      if (shuffle) {
        session.orderedCardIds = getDeterministicQueue(session.orderedCardIds, cardsById);
      }
      await persistSession(session);
    }
    return session!;
  }
  const response = await api.put<ISessionQueue>(`/sessions/${sessionId}/shuffle`, {
    shuffle,
  });
  return response.data;
};

export const getSessionCardsSlice = async (sessionId: string): Promise<ISessionCardsSlice> => {
  if (sessionId.startsWith('local-session-')) {
    const session = await getSessionQueue(sessionId);
    if (!session) {
      throw new Error('Local session not found');
    }

    let cardsSlice: IPopulatedRevisionCard[] = [];
    const { cardsById } = usePlaylistStateStore.getState();

    if (session.sourceType === 'folder') {
      const cached = await cacheStorage.get<any>(`cards_folder_${session.sourceId}_true`) || await cacheStorage.get<any>(`cards_folder_${session.sourceId}`);
      if (cached && cached.results) {
        const folderCards: IPopulatedRevisionCard[] = cached.results;
        const folderCardsMap = new Map(folderCards.map(c => [c._id, c]));
        cardsSlice = session.orderedCardIds.map(id => folderCardsMap.get(id) || cardsById[id]).filter(Boolean) as IPopulatedRevisionCard[];
      } else {
        cardsSlice = session.orderedCardIds.map(id => cardsById[id]).filter(Boolean) as IPopulatedRevisionCard[];
      }
    } else {
      cardsSlice = session.orderedCardIds.map(id => cardsById[id]).filter(Boolean) as IPopulatedRevisionCard[];
    }

    return {
      orderedCardIds: session.orderedCardIds,
      currentIndex: session.currentIndex,
      shuffle: session.shuffle,
      cardsSlice,
      sourceType: session.sourceType,
      sourceId: session.sourceId,
    };
  }

  const response = await api.get<ISessionCardsSlice>(`/sessions/${sessionId}/slice`);
  return response.data;
};
