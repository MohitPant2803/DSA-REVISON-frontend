import api from '@/services/api';
import type { IPopulatedRevisionCard } from '@/types/revision';

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

export const startSession = async (
  sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater',
  sourceId: string,
  shuffle = false
): Promise<ISessionQueue> => {
  const response = await api.post<ISessionQueue>('/sessions/start', {
    sourceType,
    sourceId,
    shuffle,
  });
  return response.data;
};

export const getSessionQueue = async (sessionId: string): Promise<ISessionQueue> => {
  const response = await api.get<ISessionQueue>(`/sessions/${sessionId}`);
  return response.data;
};

export const updateSessionIndex = async (
  sessionId: string,
  currentIndex: number
): Promise<ISessionQueue> => {
  const response = await api.put<ISessionQueue>(`/sessions/${sessionId}/index`, {
    currentIndex,
  });
  return response.data;
};

export const toggleSessionShuffle = async (
  sessionId: string,
  shuffle: boolean
): Promise<ISessionQueue> => {
  const response = await api.put<ISessionQueue>(`/sessions/${sessionId}/shuffle`, {
    shuffle,
  });
  return response.data;
};

export const getSessionCardsSlice = async (sessionId: string): Promise<ISessionCardsSlice> => {
  const response = await api.get<ISessionCardsSlice>(`/sessions/${sessionId}/slice`);
  return response.data;
};
