import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlaybackMode = 'sequential' | 'shuffle' | 'difficult';

interface TrackingState {
  // Playback configuration
  currentMode: PlaybackMode;
  infiniteLoop: boolean;
  
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
  
  // Reels Session Tracking
  reelsSessionId: string | null;
  reelsSessionCards: string[];
  reelsActiveIndex: number;
  reelsSourceType: 'folder' | 'playlist' | 'liked' | 'watchLater' | null;
  reelsSourceId: string | null;

  setReelsSession: (session: {
    sessionId: string | null;
    sessionCards: string[];
    activeIndex: number;
    sourceType: 'folder' | 'playlist' | 'liked' | 'watchLater' | null;
    sourceId: string | null;
  }) => void;
  setReelsActiveIndex: (index: number) => void;

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
      
      sessionStartTime: null,
      sessionTotalTime: 0,
      completedCardsCount: 0,
      completedCardIds: {},
      
      loopsCompleted: {},
      
      totalSwipes: 0,
      totalScrolls: 0,
      unsyncedSwipes: 0,
      unsyncedScrolls: 0,

      reelsSessionId: null,
      reelsSessionCards: [],
      reelsActiveIndex: 0,
      reelsSourceType: null,
      reelsSourceId: null,
      
      setMode: (mode) => set({ currentMode: mode }),
      
      setInfiniteLoop: (enabled) => set({ infiniteLoop: enabled }),

      setReelsSession: (session) => set({
        reelsSessionId: session.sessionId,
        reelsSessionCards: session.sessionCards,
        reelsActiveIndex: session.activeIndex,
        reelsSourceType: session.sourceType,
        reelsSourceId: session.sourceId,
      }),
      setReelsActiveIndex: (index) => set({ reelsActiveIndex: index }),
      
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
        
        // Persist to SQLite every 5 swipes — survives force kill
        if (nextSwipes % 5 === 0) {
          try {
            const { usePlaylistStateStore } = require('./usePlaylistStateStore');
            const userId = usePlaylistStateStore.getState().userId;
            if (userId) {
              const { saveAnalyticsToSQLite } = require('../utils/sqliteSyncBridge');
              saveAnalyticsToSQLite(userId, nextSwipes, state.totalScrolls).catch(() => {});
            }
          } catch (e) {
            console.warn('[useTrackingStore] Failed to write analytics to SQLite:', e);
          }
        }

        return {
          totalSwipes: nextSwipes,
          unsyncedSwipes: nextUnsynced,
        };
      }),
      
      incrementScroll: () => set((state) => {
        const nextScrolls = state.totalScrolls + 1;
        const nextUnsynced = state.unsyncedScrolls + 1;

        // Persist to SQLite every 5 scrolls — survives force kill
        if (nextScrolls % 5 === 0) {
          try {
            const { usePlaylistStateStore } = require('./usePlaylistStateStore');
            const userId = usePlaylistStateStore.getState().userId;
            if (userId) {
              const { saveAnalyticsToSQLite } = require('../utils/sqliteSyncBridge');
              saveAnalyticsToSQLite(userId, state.totalSwipes, nextScrolls).catch(() => {});
            }
          } catch (e) {
            console.warn('[useTrackingStore] Failed to write analytics to SQLite:', e);
          }
        }

        return {
          totalScrolls: nextScrolls,
          unsyncedScrolls: nextUnsynced,
        };
      }),
      
      clearUnsyncedAnalytics: () => set(() => {
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
      partialize: (state) => {
        const { useAuthStore } = require('./useAuthStore');
        const isGuest = useAuthStore.getState().user?.id === 'guest-user';
        if (isGuest) {
          return {};
        }
        return {
          currentMode: state.currentMode,
          infiniteLoop: state.infiniteLoop,
          loopsCompleted: state.loopsCompleted,
          reelsSessionId: state.reelsSessionId,
          reelsSessionCards: state.reelsSessionCards,
          reelsActiveIndex: state.reelsActiveIndex,
          reelsSourceType: state.reelsSourceType,
          reelsSourceId: state.reelsSourceId,
        };
      },
    }
  )
);
