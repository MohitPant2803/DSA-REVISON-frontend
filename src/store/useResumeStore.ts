import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ResumeState {
  resumeCardId: string;
  resumeIndex: number;
  resumeScrollOffset: number;
  resumeTimestamp: string; // ISO string
}

interface ResumeStore {
  folderProgress: Record<string, ResumeState>;
  playlistProgress: Record<string, ResumeState>;
  
  saveFolderProgress: (folderId: string, state: Omit<ResumeState, 'resumeTimestamp'>) => void;
  savePlaylistProgress: (playlistId: string, state: Omit<ResumeState, 'resumeTimestamp'>) => void;
  
  getFolderProgress: (folderId: string) => ResumeState | undefined;
  getPlaylistProgress: (playlistId: string) => ResumeState | undefined;
  
  clearFolderProgress: (folderId: string) => void;
  clearPlaylistProgress: (playlistId: string) => void;
  clearAll: () => void;
}

export const useResumeStore = create<ResumeStore>()(
  persist(
    (set, get) => ({
      folderProgress: {},
      playlistProgress: {},
      
      saveFolderProgress: (folderId, state) => set((prev) => ({
        folderProgress: {
          ...prev.folderProgress,
          [folderId]: {
            ...state,
            resumeTimestamp: new Date().toISOString()
          }
        }
      })),
      
      savePlaylistProgress: (playlistId, state) => set((prev) => ({
        playlistProgress: {
          ...prev.playlistProgress,
          [playlistId]: {
            ...state,
            resumeTimestamp: new Date().toISOString()
          }
        }
      })),
      
      getFolderProgress: (folderId) => get().folderProgress[folderId],
      getPlaylistProgress: (playlistId) => get().playlistProgress[playlistId],
      
      clearFolderProgress: (folderId) => set((prev) => {
        const next = { ...prev.folderProgress };
        delete next[folderId];
        return { folderProgress: next };
      }),
      
      clearPlaylistProgress: (playlistId) => set((prev) => {
        const next = { ...prev.playlistProgress };
        delete next[playlistId];
        return { playlistProgress: next };
      }),
      
      clearAll: () => set({ folderProgress: {}, playlistProgress: {} }),
    }),
    {
      name: 'resume-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const { useAuthStore } = require('./useAuthStore');
        const isGuest = useAuthStore.getState().user?.id === 'guest-user';
        if (isGuest) {
          return {};
        }
        return state;
      }
    }
  )
);
