import type { IPopulatedRevisionCard } from '@/types/revision';
import {
  generateReelsQueueLocally,
  getReelFeedSliceLocally,
  updateReelIndexLocally,
  getLocalUserPreferences,
  markReelAsSeenLocally
} from '@/utils/reelsFeedOfflineManager';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';

export interface IReelPreferences {
  _id: string;
  userId: string;
  selectedRootFolderIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IReelFeedSlice {
  queueLength: number;
  orderedCardIds?: string[];
  startIdx: number;
  currentIndex: number;
  deepestIndexReached: number;
  queueVersion: number;
  contentHash: string;
  cardsSlice: IPopulatedRevisionCard[];
}

export const getReelPreferences = async (): Promise<IReelPreferences> => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  const prefs = await getLocalUserPreferences(userId);
  return {
    _id: userId,
    userId,
    selectedRootFolderIds: prefs.selectedRootFolderIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

export const updateReelPreferences = async (
  selectedRootFolderIds: string[]
): Promise<IReelPreferences> => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  
  // Update local Zustand store + SQLite + offline sync queue
  await usePlaylistStateStore.getState().updateReelPreferencesInStore(selectedRootFolderIds);
  
  // Re-generate reels queue locally to match new root folders
  await generateReelsQueueLocally(userId, 'preference_change');

  return {
    _id: userId,
    userId,
    selectedRootFolderIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

export const getReelFeedSlice = async (feedSessionId?: string): Promise<IReelFeedSlice> => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  const slice = await getReelFeedSliceLocally(userId, feedSessionId);
  if (!slice) {
    throw new Error('Could not retrieve offline reels feed slice');
  }
  return slice;
};

export const updateReelIndex = async (
  currentIndex: number,
  clientTimestamp: number = Date.now()
): Promise<any> => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  await updateReelIndexLocally(userId, currentIndex);
  return { success: true };
};

export const regenerateReelQueue = async (): Promise<any> => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  const session = await generateReelsQueueLocally(userId, 'scroll_refill');
  return session;
};

export const markReelAsSeen = async (cardId: string): Promise<any> => {
  const userId = usePlaylistStateStore.getState().userId || 'guest-user';
  await markReelAsSeenLocally(userId, cardId);
  return { success: true };
};
