import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlaybackMode = 'sequential' | 'shuffle' | 'difficult' | 'favorites' | 'watchLater';

interface TrackingState {
  // Playback configuration
  currentMode: PlaybackMode;
  infiniteLoop: boolean;
  
  // Watch later local storage (offline-first watch later feature)
  watchLaterCardIds: string[];
  
  // Real-time Session Tracking
  sessionStartTime: number | null;
  sessionTotalTime: number; // accumulated time from previous paused blocks in seconds
  completedCardsCount: number;
  completedCardIds: Record<string, boolean>; // uniquely tracks cards completed in current session
  
  // Persistent loops completed per folder/playlist
  loopsCompleted: Record<string, number>;
  
  // Analytics
  totalSwipes: number;
  totalScrolls: number;
  unsyncedSwipes: number;
  unsyncedScrolls: number;
  
  // Actions
  setMode: (mode: PlaybackMode) => void;
  setInfiniteLoop: (enabled: boolean) => void;
  toggleWatchLater: (cardId: string) => void;
  setWatchLater: (cardIds: string[]) => void;
  
  startSession: () => void;
  updateSessionTime: () => void;
  markCardCompleted: (cardId: string) => void;
  toggleCardCompleted: (cardId: string) => void;
  registerLoopCompletion: (id: string) => void;
  resetSession: () => void;

  incrementSwipe: () => void;
  incrementScroll: () => void;
  clearUnsyncedAnalytics: () => void;
  setMetrics: (metrics: { totalSwipes: number; totalScrolls: number; unsyncedSwipes: number; unsyncedScrolls: number }) => void;
}

export const useTrackingStore = create<TrackingState>()(
  persist(
    (set, get) => ({
      currentMode: 'sequential',
      infiniteLoop: true,
      
      watchLaterCardIds: [],
      
      sessionStartTime: null,
      sessionTotalTime: 0,
      completedCardsCount: 0,
      completedCardIds: {},
      
      loopsCompleted: {},
      
      totalSwipes: 0,
      totalScrolls: 0,
      unsyncedSwipes: 0,
      unsyncedScrolls: 0,
      
      setMode: (mode) => set({ currentMode: mode }),
      
      setInfiniteLoop: (enabled) => set({ infiniteLoop: enabled }),
      
      toggleWatchLater: (cardId) => set((state) => {
        const exists = state.watchLaterCardIds.includes(cardId);
        const updated = exists
          ? state.watchLaterCardIds.filter((id) => id !== cardId)
          : [...state.watchLaterCardIds, cardId];
        return { watchLaterCardIds: updated };
      }),
      
      setWatchLater: (cardIds) => set({ watchLaterCardIds: cardIds }),
      
      startSession: () => set({
        sessionStartTime: Date.now(),
        sessionTotalTime: 0,
        completedCardsCount: 0,
        completedCardIds: {},
      }),
      
      updateSessionTime: () => {
        const { sessionStartTime, sessionTotalTime } = get();
        if (!sessionStartTime) return;
        const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        set({
          sessionTotalTime: sessionTotalTime + elapsed,
          sessionStartTime: Date.now(), // Reset anchor to now
        });
      },
      
      markCardCompleted: (cardId) => set((state) => {
        if (state.completedCardIds[cardId]) return {}; // already counted
        
        const newCompletedIds = { ...state.completedCardIds, [cardId]: true };
        return {
          completedCardIds: newCompletedIds,
          completedCardsCount: Object.keys(newCompletedIds).length,
        };
      }),
      
      toggleCardCompleted: (cardId) => set((state) => {
        const exists = !!state.completedCardIds[cardId];
        const newCompletedIds = { ...state.completedCardIds };
        if (exists) {
          delete newCompletedIds[cardId];
        } else {
          newCompletedIds[cardId] = true;
        }
        return {
          completedCardIds: newCompletedIds,
          completedCardsCount: Object.keys(newCompletedIds).length,
        };
      }),
      
      registerLoopCompletion: (id) => set((state) => {
        const currentCount = state.loopsCompleted[id] || 0;
        return {
          loopsCompleted: {
            ...state.loopsCompleted,
            [id]: currentCount + 1,
          },
        };
      }),
      
      resetSession: () => set({
        sessionStartTime: null,
        sessionTotalTime: 0,
        completedCardsCount: 0,
        completedCardIds: {},
      }),
      
      incrementSwipe: () => set((state) => {
        const nextSwipes = state.totalSwipes + 1;
        const nextUnsynced = state.unsyncedSwipes + 1;
        
        // Save to SQLite instantly in background
        const authStore = require('./useAuthStore').useAuthStore;
        const userId = authStore.getState().user?.id || 'guest-user';
        const { saveUserMetricsToSQLite } = require('@/utils/sqliteSyncBridge');
        saveUserMetricsToSQLite(userId, {
          totalSwipes: nextSwipes,
          totalScrolls: state.totalScrolls,
          unsyncedSwipes: nextUnsynced,
          unsyncedScrolls: state.unsyncedScrolls,
        });

        return {
          totalSwipes: nextSwipes,
          unsyncedSwipes: nextUnsynced,
        };
      }),
      
      incrementScroll: () => set((state) => {
        const nextScrolls = state.totalScrolls + 1;
        const nextUnsynced = state.unsyncedScrolls + 1;
        
        // Save to SQLite instantly in background
        const authStore = require('./useAuthStore').useAuthStore;
        const userId = authStore.getState().user?.id || 'guest-user';
        const { saveUserMetricsToSQLite } = require('@/utils/sqliteSyncBridge');
        saveUserMetricsToSQLite(userId, {
          totalSwipes: state.totalSwipes,
          totalScrolls: nextScrolls,
          unsyncedSwipes: state.unsyncedSwipes,
          unsyncedScrolls: nextUnsynced,
        });

        return {
          totalScrolls: nextScrolls,
          unsyncedScrolls: nextUnsynced,
        };
      }),
      
      clearUnsyncedAnalytics: () => set((state) => {
        // Save to SQLite instantly in background
        const authStore = require('./useAuthStore').useAuthStore;
        const userId = authStore.getState().user?.id || 'guest-user';
        const { saveUserMetricsToSQLite } = require('@/utils/sqliteSyncBridge');
        saveUserMetricsToSQLite(userId, {
          totalSwipes: state.totalSwipes,
          totalScrolls: state.totalScrolls,
          unsyncedSwipes: 0,
          unsyncedScrolls: 0,
        });

        return {
          unsyncedSwipes: 0,
          unsyncedScrolls: 0,
        };
      }),

      setMetrics: (metrics) => set({
        totalSwipes: metrics.totalSwipes,
        totalScrolls: metrics.totalScrolls,
        unsyncedSwipes: metrics.unsyncedSwipes,
        unsyncedScrolls: metrics.unsyncedScrolls,
      }),
    }),
    {
      name: 'dsa-tracking-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentMode: state.currentMode,
        infiniteLoop: state.infiniteLoop,
        watchLaterCardIds: state.watchLaterCardIds,
        loopsCompleted: state.loopsCompleted,
      }),
    }
  )
);
