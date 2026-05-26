import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useResumeStore } from '@/store/useResumeStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { useUpdateResumeState, useRegisterLoop } from '@/services/useUserProgress';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';
import Toast from 'react-native-toast-message';
import { InteractionManager } from 'react-native';

export const useProgressSync = () => {
  const queryClient = useQueryClient();
  
  const {
    saveFolderProgress,
    savePlaylistProgress,
  } = useResumeStore();

  const {
    registerLoopCompletion,
  } = useTrackingStore();

  const updateResumeMutation = useUpdateResumeState();
  const registerLoopMutation = useRegisterLoop();

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
    // 1. Instant local Zustand persistence (always runs)
    const statePayload = {
      resumeCardId: resumeData.resumeCardId,
      resumeIndex: resumeData.resumeIndex,
      resumeScrollOffset: resumeData.resumeScrollOffset ?? 0,
    };

    if (type === 'folder') {
      saveFolderProgress(id, statePayload);
    } else {
      savePlaylistProgress(id, statePayload);
    }

    // Skip database sync for virtual playlists
    if (type === 'playlist' && (id === 'likes' || id === 'watch-later')) {
      return;
    }

    // Defer DB sync when in paused interaction zone — will flush on resumeAndFlush
    const isPaused = usePlaylistStateStore.getState().isLiveSyncPaused;
    if (isPaused) {
      if (__DEV__) console.log('[ProgressSync] DB resume sync deferred — interaction zone active.');
      return;
    }

    // 2. Asynchronous background synchronization to Database
    updateResumeMutation.mutate({
      type,
      id,
      resumeData: {
        lastCardId: resumeData.resumeCardId,
        lastIndex: resumeData.resumeIndex,
        resumeScrollOffset: resumeData.resumeScrollOffset ?? 0,
      },
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

    // 1. Optimistically register loop locally
    registerLoopCompletion(id);

    // Skip database sync for virtual playlists
    if (type === 'playlist' && (id === 'likes' || id === 'watch-later')) {
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

    // 2. Call DB loop completion api
    registerLoopMutation.mutate(
      { type, id, cardsViewed },
      {
        onSuccess: () => {
          // Suppress toasts if sync was paused between mutation start and resolution
          if (!usePlaylistStateStore.getState().isLiveSyncPaused) {
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
        },
        onError: (error) => {
          console.error(`Failed to register loop completion for ${type}:`, error.message);
          // Only show error toasts when NOT in an interaction zone
          if (!usePlaylistStateStore.getState().isLiveSyncPaused) {
            InteractionManager.runAfterInteractions(() => {
              Toast.show({
                type: 'error',
                text1: 'Sync Failed',
                text2: 'Could not sync completed loop to database. Will retry when connection stabilizes.',
                position: 'top',
              });
            });
          }
        },
      }
    );
  };

  return {
    syncResumeState,
    syncLoopCompletion,
    isSyncingResume: updateResumeMutation.isPending,
    isSyncingLoop: registerLoopMutation.isPending,
  };
};
