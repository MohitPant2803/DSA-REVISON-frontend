import api from '@/services/api';
import type { DashboardStats, PersonalLibrary } from '@/types/progress';

export type ProgressAction = 'favorite' | 'difficult' | 'archived';

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get('/progress/stats');
  return response.data?.data?.stats ?? response.data?.stats;
};

export const getPersonalLibrary = async (): Promise<PersonalLibrary> => {
  const response = await api.get('/progress/library');
  return response.data?.data?.library ?? response.data?.library;
};

export const updateUserProgress = async (
  cardId: string,
  action: ProgressAction,
  value: boolean
): Promise<{ message: string }> => {
  const payload: Record<string, unknown> = { revisionCardId: cardId };
  if (action === 'favorite') payload.favorite = value;
  if (action === 'difficult') payload.difficult = value;
  if (action === 'archived') payload.archived = value;

  const response = await api.post('/progress/update', payload);
  return response.data?.data ?? response.data ?? { message: 'Progress updated' };
};

export const updateLastViewedCard = async (cardId: string): Promise<void> => {
  await api.post('/progress/update', {
    revisionCardId: cardId,
    timeSpent: 1,
  });
};
