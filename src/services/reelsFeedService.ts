import api from '@/services/api';
import type { IPopulatedRevisionCard } from '@/types/revision';

export interface IReelPreferences {
  _id: string;
  userId: string;
  selectedRootFolderIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IReelFeedSlice {
  queueLength: number;
  currentIndex: number;
  deepestIndexReached: number;
  queueVersion: number;
  contentHash: string;
  cardsSlice: IPopulatedRevisionCard[];
}

export const getReelPreferences = async (): Promise<IReelPreferences> => {
  const response = await api.get<IReelPreferences>('/reels/preferences');
  return response.data;
};

export const updateReelPreferences = async (
  selectedRootFolderIds: string[]
): Promise<IReelPreferences> => {
  const response = await api.put<IReelPreferences>('/reels/preferences', {
    selectedRootFolderIds,
  });
  return response.data;
};

export const getReelFeedSlice = async (): Promise<IReelFeedSlice> => {
  const response = await api.get<IReelFeedSlice>('/reels/feed');
  return response.data;
};

export const updateReelIndex = async (
  currentIndex: number,
  clientTimestamp: number = Date.now()
): Promise<any> => {
  const response = await api.put('/reels/feed/index', {
    currentIndex,
    clientTimestamp,
  });
  return response.data;
};

export const regenerateReelQueue = async (): Promise<any> => {
  const response = await api.post('/reels/feed/regenerate');
  return response.data;
};
