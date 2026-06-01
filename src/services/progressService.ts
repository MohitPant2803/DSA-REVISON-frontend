import api from '@/services/api';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { isNetworkConnected } from '@/utils/network';
import type { DashboardStats, PersonalLibrary, LibraryEntry } from '@/types/progress';

export type ProgressAction = 'favorite' | 'difficult' | 'archived';

export const getDashboardStats = async (): Promise<DashboardStats> => {
  try {
    const connected = await isNetworkConnected();
    if (connected) {
      const response = await api.get('/progress/stats');
      return response.data?.data?.stats ?? response.data?.stats;
    }
  } catch (err: any) {
    console.warn('[Progress Service] Online stats fetch failed, falling back to local Zustand resolution:', err.message);
  }

  // Local Offline-First Resolution
  const state = usePlaylistStateStore.getState();
  const trackingState = useTrackingStore.getState();
  const allCards = Object.values(state.cardsById);

  // Favorites
  const favorites = allCards.filter(c => c.isFavorite);
  
  // Difficult cards
  const difficult = allCards.filter(c => c.difficultyState === 'hard');

  // Attempted cards
  const attempted = allCards.filter(c => c.difficultyState && c.difficultyState !== 'skipped');

  // Construct LibraryEntries for recently revised cards
  const recentlyRevisedEntries: LibraryEntry[] = allCards
    .filter(c => c.updatedAt)
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 10)
    .map(card => ({
      progressId: `local-progress-${card._id}`,
      lastViewedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
      favorite: card.isFavorite,
      difficult: card.difficultyState === 'hard',
      card,
    }));

  return {
    streakCount: 1, // Fallback local streak count
    totalSwipes: trackingState.totalSwipes || 0,
    totalScrolls: trackingState.totalScrolls || 0,
    totalRevisions: attempted.length,
    totalTimeSpent: Math.floor((trackingState.totalSwipes || 0) * 1.5), // Estimate based on swipes
    favoritesCount: favorites.length,
    difficultCount: difficult.length,
    totalCardsAvailable: allCards.length,
    recentlyRevised: recentlyRevisedEntries,
    weakTopics: [],
    consistencyByDay: [],
  };
};

export const getPersonalLibrary = async (): Promise<PersonalLibrary> => {
  try {
    const connected = await isNetworkConnected();
    if (connected) {
      const response = await api.get('/progress/library');
      return response.data?.data?.library ?? response.data?.library;
    }
  } catch (err: any) {
    console.warn('[Progress Service] Online library fetch failed, falling back to local Zustand resolution:', err.message);
  }

  // Local Offline-First Resolution
  const state = usePlaylistStateStore.getState();
  const allCards = Object.values(state.cardsById);

  // Favorites entries
  const favoritesEntries: LibraryEntry[] = allCards
    .filter(c => c.isFavorite)
    .map(card => ({
      progressId: `local-fav-${card._id}`,
      lastViewedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
      favorite: true,
      card,
    }));

  // Archived entries
  const archivedEntries: LibraryEntry[] = [];

  // Recent Bookmarks entries (sorted by updatedAt)
  const recentBookmarksEntries: LibraryEntry[] = allCards
    .filter(c => c.updatedAt)
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 20)
    .map(card => ({
      progressId: `local-bookmark-${card._id}`,
      lastViewedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
      favorite: card.isFavorite,
      card,
    }));

  return {
    favorites: favoritesEntries,
    archived: archivedEntries,
    recentBookmarks: recentBookmarksEntries,
  };
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
