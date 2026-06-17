import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import { useAuthStore } from '@/store/useAuthStore';
import { updateResumeState, registerLoop } from '@/services/progressService';
import Toast from 'react-native-toast-message';
import { InteractionManager } from 'react-native';

export const useProgressSync = () => {
  /**
   * Syncs the user's current reading/viewing card index and ID.
   * Updates Zustand local storage instantly, and updates DB in background with optimistic fallback.
   * When isLiveSyncPaused is true (interaction zone active), DB sync is deferred — only local state is saved.
   */
  const syncResumeState = async (
    type: 'folder' | 'playlist',
    id: string,
    resumeData: {
      resumeCardId: string;
      resumeIndex: number;
      resumeScrollOffset?: number;
    }
  ) => {
    // Skip database sync for virtual playlists
    if (type === 'playlist' && ['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(id)) {
      return;
    }

    // Skip database sync for guest users
    const isGuest = useAuthStore.getState().user?.id === 'guest-user';
    if (isGuest) {
      return;
    }

    // Defer DB sync when in paused interaction zone — will flush on resumeAndFlush
    const isPaused = usePlaylistStateStore.getState().isLiveSyncPaused;
    if (isPaused) {
      if (__DEV__) console.log('[ProgressSync] DB resume sync deferred — interaction zone active.');
      return;
    }

    // Call service which handles both local writes and offline action enqueuing
    await updateResumeState(type, id, {
      resumeCardId: resumeData.resumeCardId,
      resumeIndex: resumeData.resumeIndex,
      resumeScrollOffset: resumeData.resumeScrollOffset ?? 0,
    });
  };

  /**
   * Registers a completed loop for a folder or playlist.
   * Triggers background API and updates Zustand store.
   * Toast notifications are suppressed when isLiveSyncPaused is active.
   */
  const syncLoopCompletion = async (
    type: 'folder' | 'playlist',
    id: string,
    cardsViewed: number
  ) => {
    const isPaused = usePlaylistStateStore.getState().isLiveSyncPaused;

    // Skip database sync for virtual playlists
    if (type === 'playlist' && ['likes', 'watch-later', 'easy', 'medium', 'hard', 'skipped'].includes(id)) {
      if (!isPaused) {
        InteractionManager.runAfterInteractions(() => {
          Toast.show({
            type: 'success',
            text1: `Loop completed!`,
            text2: `Successfully saved loop progress for this ${type}.`,
            position: 'top',
            visibilityTime: 2000,
          });
        });
      }
      return;
    }

    // Skip database sync for guest users
    const isGuest = useAuthStore.getState().user?.id === 'guest-user';
    if (isGuest) {
      if (!isPaused) {
        InteractionManager.runAfterInteractions(() => {
          Toast.show({
            type: 'success',
            text1: `Loop completed!`,
            text2: `Successfully saved loop progress for this ${type}.`,
            position: 'top',
            visibilityTime: 2000,
          });
        });
      }
      return;
    }

    // Defer DB sync when in paused interaction zone
    if (isPaused) {
      if (__DEV__) console.log('[ProgressSync] DB loop sync deferred — interaction zone active.');
      return;
    }

    // Call service which handles both local writes and offline action enqueuing
    await registerLoop(type, id, cardsViewed);

    // Toast logic fires immediately as the local/enqueue operations are synchronous
    InteractionManager.runAfterInteractions(() => {
      Toast.show({
        type: 'success',
        text1: `Loop completed!`,
        text2: `Successfully saved loop progress for this ${type}.`,
        position: 'top',
        visibilityTime: 2000,
      });
    });
  };

  return {
    syncResumeState,
    syncLoopCompletion,
    isSyncingResume: false,
    isSyncingLoop: false,
  };
};
