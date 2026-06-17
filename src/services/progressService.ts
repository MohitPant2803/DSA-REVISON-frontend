import api from '@/services/api';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { useResumeStore } from '@/store/useResumeStore';
import { useAuthStore } from '@/store/useAuthStore';
import { sqliteWriteManager } from '@/utils/sqliteWriteManager';
import { isSQLiteAvailable } from '@/utils/sqliteDatabase';
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
  const store = usePlaylistStateStore.getState();

  if (action === 'favorite') {
    await store.toggleFavoriteInStore(cardId, value);
    await store.enqueueOfflineAction({
      action: 'TOGGLE_FAVORITE',
      payload: { cardId, value },
      timestamp: Date.now(),
    });
  }

  if (action === 'difficult') {
    const card = store.cardsById[cardId.split('-loop-')[0]];
    if (card) {
      const newState = value ? 'hard' : null;
      await store.transferCard(cardId, card, newState);
      await store.enqueueOfflineAction({
        action: 'CLASSIFY_CARD',
        payload: { cardId, state: newState },
        timestamp: Date.now(),
      });
    }
  }

  if (action === 'archived') {
    const cleanId = cardId.split('-loop-')[0];
    const existing = store.cardsById[cleanId];
    if (existing) {
      usePlaylistStateStore.setState({
        cardsById: {
          ...store.cardsById,
          [cleanId]: { ...existing, isArchived: value },
        },
      });
    }
    await store.enqueueOfflineAction({
      action: 'CLASSIFY_CARD',
      payload: { cardId, archived: value },
      timestamp: Date.now(),
    });
  }

  return { message: 'Progress updated locally' };
};

export const updateDifficultyState = async (
  cardId: string,
  difficultyState: 'easy' | 'medium' | 'hard' | 'skipped' | null
): Promise<{ message: string }> => {
  const store = usePlaylistStateStore.getState();
  const card = store.cardsById[cardId.split('-loop-')[0]];

  if (card) {
    await store.transferCard(cardId, card, difficultyState);
  }

  await store.enqueueOfflineAction({
    action: 'CLASSIFY_CARD',
    payload: { cardId, state: difficultyState },
    timestamp: Date.now(),
  });

  return { message: 'Difficulty state updated locally' };
};

export const updatePlaylistMembership = async (
  cardId: string,
  addToPlaylist?: string,
  removeFromPlaylist?: string
): Promise<{ message: string }> => {
  const store = usePlaylistStateStore.getState();
  const playlistId = addToPlaylist || removeFromPlaylist;

  if (playlistId) {
    const isAdding = !!addToPlaylist;
    await store.toggleCustomPlaylistItemInStore(playlistId, cardId, isAdding);
    await store.enqueueOfflineAction({
      action: 'TOGGLE_PLAYLIST_ITEM',
      payload: { playlistId, cardId, value: isAdding },
      timestamp: Date.now(),
    });
  }

  return { message: 'Playlist membership updated locally' };
};

export const updateLastViewedCard = async (cardId: string): Promise<void> => {
  const store = usePlaylistStateStore.getState();
  const userId = store.userId || 'guest-user';
  const cleanId = cardId.split('-loop-')[0];
  const now = new Date().toISOString();

  if (!isSQLiteAvailable()) return;

  sqliteWriteManager.enqueue({
    id: `last-viewed-${cleanId}-${Date.now()}`,
    type: 'custom',
    userId,
    data: {
      executor: async (db: any) => {
        await db.runAsync(`
          INSERT INTO card_progress (
            cardId, userId, completed, revisionCount, favorite, difficultyState, seenInReels, revision, updatedAt
          ) VALUES (?, ?, 0, 0, 0, NULL, 1, 0, ?)
          ON CONFLICT(cardId, userId) DO UPDATE SET
            seenInReels=1,
            updatedAt=excluded.updatedAt;
        `, [cleanId, userId, now]);
      }
    },
    timestamp: Date.now(),
    priority: 'low',
  }).catch((err: any) => console.error('[SQLite updateLastViewedCard Error]', err.message));
};

export const registerLoop = async (type: 'folder' | 'playlist', id: string, cardsViewed: number) => {
  const store = usePlaylistStateStore.getState();

  // Local write — TrackingStore is AsyncStorage-persisted, no SQLite needed
  useTrackingStore.getState().registerLoopCompletion(id);

  const isGuest = useAuthStore.getState().user?.id === 'guest-user' || !useAuthStore.getState().isAuthenticated;
  const isVirtual = type === 'playlist' && ['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(id);

  if (!isGuest && !isVirtual) {
    await store.enqueueOfflineAction({
      action: 'REGISTER_LOOP',
      payload: { type, id, cardsViewed },
      timestamp: Date.now(),
    });
  }

  return { message: 'Loop registered locally' };
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
  const store = usePlaylistStateStore.getState();
  const resumeStore = useResumeStore.getState();

  // Local write — ResumeStore is AsyncStorage-persisted, no SQLite needed
  const statePayload = {
    resumeCardId: resumeData.resumeCardId || '',
    resumeIndex: resumeData.resumeIndex || 0,
    resumeScrollOffset: resumeData.resumeScrollOffset || 0,
  };

  if (type === 'folder') {
    resumeStore.saveFolderProgress(id, statePayload);
  } else {
    resumeStore.savePlaylistProgress(id, statePayload);
  }

  const isGuest = useAuthStore.getState().user?.id === 'guest-user' || !useAuthStore.getState().isAuthenticated;
  const isVirtual = type === 'playlist' && ['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(id);

  if (!isGuest && !isVirtual) {
    await store.enqueueOfflineAction({
      action: 'UPDATE_RESUME_STATE',
      payload: { type, id, resumeData },
      timestamp: Date.now(),
    });
  }

  return { message: 'Resume state updated locally' };
};

export const getFolderLoops = async () => {
  const response = await api.get('/progress/folder-loops');
  return response.data?.data?.loops ?? response.data?.loops ?? [];
};

export const getResumeStates = async () => {
  const response = await api.get('/progress/resume');
  return response.data?.data?.states ?? response.data?.states;
};
