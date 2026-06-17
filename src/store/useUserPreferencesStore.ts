import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface UserLearningPreferences {
  explanationFlowOrder: string[];
  compactMode: boolean;
  revisionMode: boolean;
  showHintsEarly: boolean;
  hideCertainBlockTypes: string[];
  theme?: 'default' | 'zen' | 'rain' | 'matcha' | 'sunset' | 'midnight';
  gptPromptMode?: 'explanation' | 'quiz';
  lowEndDeviceMode: boolean;
}

interface PreferencesState {
  preferences: UserLearningPreferences;
  updatePreference: <K extends keyof UserLearningPreferences>(
    key: K,
    value: UserLearningPreferences[K]
  ) => void;
  resetToDefault: () => void;
}

export const useUserPreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      preferences: {
        explanationFlowOrder: ['intro', 'code', 'dryrun', 'summary'],
        compactMode: false,
        revisionMode: true,
        showHintsEarly: false,
        hideCertainBlockTypes: [],
        theme: 'midnight',
        gptPromptMode: 'explanation',
        lowEndDeviceMode: Platform.OS === 'android' && (Platform.Version as number) < 31,
      },
      updatePreference: (key, value) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            [key]: value,
          },
        })),
      resetToDefault: () =>
        set({
          preferences: {
            explanationFlowOrder: ['intro', 'code', 'dryrun', 'summary'],
            compactMode: false,
            revisionMode: true,
            showHintsEarly: false,
            hideCertainBlockTypes: [],
            theme: 'midnight',
            gptPromptMode: 'explanation',
            lowEndDeviceMode: Platform.OS === 'android' && (Platform.Version as number) < 31,
          },
        }),
    }),
    {
      name: 'user-learning-preferences',
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
