import { create } from 'zustand';
import { Sheet } from '../types';

interface AppState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sheets: Sheet[];
  selectedSheetId: string | null;
  setSelectedSheetId: (id: string | null) => void;
}

const MOCK_SHEETS: Sheet[] = [
  {
    id: 'sheet-blind-75',
    title: 'Blind 75',
    description: 'The ultimate list of 75 curated LeetCode questions to master essential DSA patterns.',
    totalQuestions: 75,
    completedQuestions: 12,
  },
  {
    id: 'sheet-neetcode-150',
    title: 'Neetcode 150',
    description: 'Comprehensive set of 150 curated questions covering all major DSA algorithms and structures.',
    totalQuestions: 150,
    completedQuestions: 24,
  },
  {
    id: 'sheet-dp-special',
    title: 'Dynamic Programming',
    description: 'Classic DP problems focusing on Knapsack, LCS, LIS, and state machine transitions.',
    totalQuestions: 30,
    completedQuestions: 5,
  }
];

export const useAppStore = create<AppState>((set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  sheets: MOCK_SHEETS,
  selectedSheetId: 'sheet-blind-75',
  setSelectedSheetId: (id) => set({ selectedSheetId: id }),
}));
