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

export const updateDifficultyState = async (
  cardId: string,
  difficultyState: 'easy' | 'medium' | 'hard' | 'skipped' | null
): Promise<{ message: string }> => {
  const payload = {
    revisionCardId: cardId,
    difficultyState,
  };
  const response = await api.post('/progress/update', payload);
  return response.data?.data ?? response.data ?? { message: 'Difficulty state updated' };
};

export const updatePlaylistMembership = async (
  cardId: string,
  addToPlaylist?: string,
  removeFromPlaylist?: string
) => {
  const payload: Record<string, unknown> = { revisionCardId: cardId };
  if (addToPlaylist) payload.addToPlaylist = addToPlaylist;
  if (removeFromPlaylist) payload.removeFromPlaylist = removeFromPlaylist;

  const response = await api.post('/progress/update', payload);
  return response.data?.data ?? response.data ?? { message: 'Playlist membership updated' };
};

export const updateLastViewedCard = async (cardId: string): Promise<void> => {
  await api.post('/progress/update', {
    revisionCardId: cardId,
    timeSpent: 1,
  });
};

export const registerLoop = async (type: 'folder' | 'playlist', id: string, cardsViewed: number) => {
  const response = await api.post('/progress/loop', { type, id, cardsViewed });
  return response.data?.data?.loopStats ?? response.data?.loopStats;
};

export const getFolderLoops = async () => {
  const response = await api.get('/progress/folder-loops');
  return response.data?.data?.loops ?? response.data?.loops ?? [];
};

export const updateResumeState = async (
  type: 'folder' | 'playlist',
  id: string,
  resumeData: {
    resumeCardId?: string;
    resumeIndex?: number;
    resumeScrollOffset?: number;
  }
) => {
  const response = await api.post('/progress/resume', { type, id, resumeData });
  return response.data?.data?.result ?? response.data?.result;
};

export const getResumeStates = async () => {
  const response = await api.get('/progress/resume');
  return response.data?.data?.states ?? response.data?.states;
};
