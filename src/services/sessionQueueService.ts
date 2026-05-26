import api from '@/services/api';
import type { IPopulatedRevisionCard } from '@/types/revision';
import { cacheStorage } from '@/lib/cache';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';

export interface ISessionQueue {
  _id: string;
  userId: string;
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater';
  sourceId: string;
  orderedCardIds: string[];
  currentIndex: number;
  shuffle: boolean;
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

const startLocalSession = async (
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater',
  sourceId: string,
  shuffle = false
): Promise<ISessionQueue> => {
  console.log('[Session Queue] Launching Local-First Virtual Session for:', sourceId);
  
  const sessionId = `local-session-${sourceId}`;
  let orderedCardIds: string[] = [];

  if (sourceType === 'playlist' || sourceType === 'liked' || sourceType === 'watchLater') {
    const playlistId = sourceType === 'liked' ? 'likes' : (sourceType === 'watchLater' ? 'watch-later' : sourceId);
    orderedCardIds = usePlaylistStateStore.getState().playlistCardOrderMap[playlistId] || [];
  } else if (sourceType === 'folder') {
    // Try resolving from cache first
    try {
      const cached = await cacheStorage.get<any>(`cards_folder_${sourceId}_true`) || await cacheStorage.get<any>(`cards_folder_${sourceId}`);
      if (cached && cached.results) {
        orderedCardIds = cached.results.map((c: any) => c._id);
      }
    } catch (e) {}

    // Zustand store fallback: derive folder cards from persisted cardsById
    if (orderedCardIds.length === 0) {
      const { cardsById } = usePlaylistStateStore.getState();
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
    const shuffled = [...orderedCardIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    orderedCardIds = shuffled;
  }

  const session: ISessionQueue = {
    _id: sessionId,
    userId: 'local-user',
    sourceType,
    sourceId,
    orderedCardIds,
    currentIndex: 0,
    shuffle,
    createdAt: new Date().toISOString()
  };

  localSessions[sessionId] = session;
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
    const session = localSessions[sessionId];
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
    const session = localSessions[sessionId];
    if (session) {
      session.currentIndex = currentIndex;
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
    const session = localSessions[sessionId];
    if (session) {
      session.shuffle = shuffle;
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
    const session = localSessions[sessionId];
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
        // Fallback: resolve directly from Zustand persisted store
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
