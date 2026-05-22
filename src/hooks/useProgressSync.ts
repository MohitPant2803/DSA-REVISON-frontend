import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useResumeStore } from '@/store/useResumeStore';
import { useTrackingStore } from '@/store/useTrackingStore';
import { useUpdateResumeState, useRegisterLoop } from '@/services/useUserProgress';
import Toast from 'react-native-toast-message';

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
    // 1. Instant local Zustand persistence
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
   */
  const syncLoopCompletion = async (
    type: 'folder' | 'playlist',
    id: string,
    cardsViewed: number
  ) => {
    // 1. Optimistically register loop locally
    registerLoopCompletion(id);

    // Skip database sync for virtual playlists and show offline success toast
    if (type === 'playlist' && (id === 'likes' || id === 'watch-later')) {
      Toast.show({
        type: 'success',
        text1: `Loop completed!`,
        text2: `Successfully saved loop progress for this ${type}.`,
        position: 'top',
        visibilityTime: 2000,
      });
      return;
    }

    // 2. Call DB loop completion api
    registerLoopMutation.mutate(
      { type, id, cardsViewed },
      {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: `Loop completed!`,
            text2: `Successfully saved loop progress for this ${type}.`,
            position: 'top',
            visibilityTime: 2000,
          });
        },
        onError: (error) => {
          console.error(`Failed to register loop completion for ${type}:`, error.message);
          Toast.show({
            type: 'error',
            text1: 'Sync Failed',
            text2: 'Could not sync completed loop to database. Will retry when connection stabilizes.',
            position: 'top',
          });
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
