import { create } from 'zustand';

interface UIState {
  hasAppBeenAnimated: boolean;
  setHasAppBeenAnimated: (value: boolean) => void;
  isExitPromptOpen: boolean;
  setExitPromptOpen: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  hasAppBeenAnimated: false,
  setHasAppBeenAnimated: (value) => set({ hasAppBeenAnimated: value }),
  isExitPromptOpen: false,
  setExitPromptOpen: (value) => set({ isExitPromptOpen: value }),
}));

