import { create } from 'zustand';

interface AppReadyStore {
  isAppReady: boolean;
  setAppReady: () => void;
}

export const useAppReadyStore = create<AppReadyStore>((set) => ({
  isAppReady: false,
  setAppReady: () => set({ isAppReady: true }),
}));