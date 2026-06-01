import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PersonalizationPreferences {
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | '';
  weakTopics: string[];
  goals: string[];
  learningStyle: string;
  dailyTarget: number; // e.g., 3, 5, 10 cards per day
}

interface OnboardingState {
  isOnboarded: boolean;
  currentStep: number;
  preferences: PersonalizationPreferences;
  isGeneratingSystem: boolean;
  hasHydrated: boolean;
  
  // Actions
  setStep: (step: number) => void;
  updatePreferences: (prefs: Partial<PersonalizationPreferences>) => void;
  completeOnboarding: () => Promise<void>;
  setIsGeneratingSystem: (generating: boolean) => void;
  resetOnboarding: () => Promise<void>;
  setHasHydrated: (hydrated: boolean) => void;
}

const DEFAULT_PREFERENCES: PersonalizationPreferences = {
  skillLevel: '',
  weakTopics: [],
  goals: [],
  learningStyle: 'visual',
  dailyTarget: 5,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      isOnboarded: false,
      currentStep: 0,
      preferences: DEFAULT_PREFERENCES,
      isGeneratingSystem: false,
      hasHydrated: false,

      setStep: (step) => set({ currentStep: step }),

      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            ...prefs,
          },
        })),

      completeOnboarding: async () => {
        set({ isOnboarded: true });
      },

      setIsGeneratingSystem: (generating) => set({ isGeneratingSystem: generating }),

      resetOnboarding: async () => {
        set({
          isOnboarded: false,
          currentStep: 0,
          preferences: DEFAULT_PREFERENCES,
          isGeneratingSystem: false,
        });
      },

      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      name: 'dsa-onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isOnboarded: state.isOnboarded,
        preferences: state.preferences,
      }),
      merge: (persistedState: any, currentState) => {
        return { ...currentState, ...persistedState };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
