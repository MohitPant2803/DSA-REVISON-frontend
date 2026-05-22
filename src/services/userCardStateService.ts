import api from '@/services/api';
import type { IPopulatedRevisionCard } from '@/types/revision';

export interface IUserCardState {
  _id: string;
  userId: string;
  cardId: string;
  liked: boolean;
  watchLater: boolean;
  viewed: boolean;
  lastViewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCards {
  results: IPopulatedRevisionCard[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const toggleLike = async (cardId: string): Promise<IUserCardState> => {
  const response = await api.post<IUserCardState>('/user-card-states/like', { cardId });
  return response.data;
};

export const toggleWatchLater = async (cardId: string): Promise<IUserCardState> => {
  const response = await api.post<IUserCardState>('/user-card-states/watch-later', { cardId });
  return response.data;
};

export const markViewed = async (cardId: string): Promise<IUserCardState> => {
  const response = await api.post<IUserCardState>('/user-card-states/viewed', { cardId });
  return response.data;
};

export const getLikedCards = async (page = 1, limit = 20): Promise<PaginatedCards> => {
  const response = await api.get<PaginatedCards>('/user-card-states/liked', {
    params: { page, limit },
  });
  return response.data;
};

export const getWatchLaterCards = async (page = 1, limit = 20): Promise<PaginatedCards> => {
  const response = await api.get<PaginatedCards>('/user-card-states/watch-later', {
    params: { page, limit },
  });
  return response.data;
};

export const getUserCardState = async (cardId: string): Promise<IUserCardState> => {
  const response = await api.get<IUserCardState>(`/user-card-states/state/${cardId}`);
  return response.data;
};
