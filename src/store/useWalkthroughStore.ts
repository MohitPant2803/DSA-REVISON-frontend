import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WalkthroughStep = 
  | 'point-reels' 
  | 'reels-tutorial' 
  | 'point-myspace' 
  | 'myspace-theme' 
  | 'myspace-settings-arrow' 
  | 'myspace-settings-open' 
  | 'myspace-hard-focus' 
  | 'playlist-reorder' 
  | 'playlist-remove'
  | 'playlist-reminder' 
  | 'playlist-happy' 
  | 'none';

interface WalkthroughState {
  step: WalkthroughStep;
  isComplete: boolean;
  reelsShot: 1 | 2;
  reelsTutorialStep: number;
  setStep: (step: WalkthroughStep) => void;
  setReelsShot: (reelsShot: 1 | 2) => void;
  setReelsTutorialStep: (reelsTutorialStep: number) => void;
  initialize: () => Promise<void>;
  completeWalkthrough: () => Promise<void>;
}

export const useWalkthroughStore = create<WalkthroughState>((set) => ({
  step: 'none',
  isComplete: false,
  reelsShot: 1,
  reelsTutorialStep: 0,
  setStep: (step) => set({ step, reelsShot: 1 }),
  setReelsShot: (reelsShot) => set({ reelsShot }),
  setReelsTutorialStep: (reelsTutorialStep) => set({ reelsTutorialStep }),
  initialize: async () => {
    try {
      const { useAuthStore } = require('./useAuthStore');
      const isGuest = useAuthStore.getState().user?.id === 'guest-user';
      const key = isGuest ? 'guest-dsa-reels-walkthrough-complete' : 'dsa-reels-walkthrough-complete';
      const complete = await AsyncStorage.getItem(key);
      if (complete === 'true') {
        set({ isComplete: true, step: 'none', reelsTutorialStep: 0 });
      } else {
        set({ isComplete: false, step: 'point-reels', reelsTutorialStep: 0 });
      }
    } catch {
      set({ isComplete: false, step: 'point-reels', reelsTutorialStep: 0 });
    }
  },
  completeWalkthrough: async () => {
    try {
      const { useAuthStore } = require('./useAuthStore');
      const isGuest = useAuthStore.getState().user?.id === 'guest-user';
      const key = isGuest ? 'guest-dsa-reels-walkthrough-complete' : 'dsa-reels-walkthrough-complete';
      await AsyncStorage.setItem(key, 'true');
      set({ isComplete: true, step: 'none', reelsTutorialStep: 0 });
    } catch {}
  },
}));
