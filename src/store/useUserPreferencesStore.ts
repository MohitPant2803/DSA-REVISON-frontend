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
  theme?: 'light' | 'dark';
  gptPromptMode?: 'explanation' | 'quiz';
  lowEndDeviceMode: boolean;
}

interface PreferencesState {
  preferences: UserLearningPreferences;
  updatePreference: <K extends keyof UserLearningPreferences>(
    key: K,
    value: UserLearningPreferences[K]
  ) => void;
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
        theme: 'light',
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
    }),
    {
      name: 'user-learning-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
