import { create } from 'zustand';
import { Sheet, Placard, PersonalFolder } from '../types';
import { sheets as initialSheets, placards as initialPlacards, personalFolders } from '../lib/dummyData';

interface User {
  name: string;
  avatarUrl: string;
}

interface AppState {
  user: User;
  sheets: Sheet[];
  personalFolders: PersonalFolder[];
  placards: Placard[];
  searchQuery: string;
  selectedSheetId: string;
  setSearchQuery: (query: string) => void;
  setSelectedSheetId: (sheetId: string) => void;
  getPlacardsBySheet: (sheetId: string) => Placard[];
  togglePlacardCompletion: (placardId: string) => void;
  getStats: () => { totalSolved: number; totalQuestions: number; accuracy: number };
}

const sheetsWithDerivedProgress = initialSheets.map(sheet => {
  const completed = initialPlacards.filter(p => p.sheetId === sheet.id && p.isCompleted).length;
  return { ...sheet, completedQuestions: completed };
});

export const useAppStore = create<AppState>((set, get) => ({
  user: {
    name: 'Mohit',
    avatarUrl: 'https://github.com/shadcn.png' // dummy avatar
  },
  sheets: sheetsWithDerivedProgress,
  personalFolders: personalFolders,
  placards: initialPlacards,
  searchQuery: '',
  selectedSheetId: initialSheets[0]?.id || '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedSheetId: (sheetId) => set({ selectedSheetId: sheetId }),
  getPlacardsBySheet: (sheetId) => get().placards.filter(p => p.sheetId === sheetId),
  togglePlacardCompletion: (placardId) => set(state => {
    let placardToUpdate: Placard | undefined;
    const newPlacards = state.placards.map(p => {
      if (p.id === placardId) {
        placardToUpdate = p;
        return { ...p, isCompleted: !p.isCompleted };
      }
      return p;
    });

    if (!placardToUpdate) {
      return {}; // Placard not found, do nothing
    }

    const wasCompleted = placardToUpdate.isCompleted;

    const newSheets = state.sheets.map(sheet => {
      if (sheet.id === placardToUpdate!.sheetId) {
        const newCompletedCount = wasCompleted
          ? sheet.completedQuestions - 1
          : sheet.completedQuestions + 1;
        return { ...sheet, completedQuestions: Math.max(0, newCompletedCount) };
      }
      return sheet;
    });

    return { placards: newPlacards, sheets: newSheets };
  }),
  getStats: () => {
    const { sheets } = get();
    const totalSolved = sheets.reduce((sum, sheet) => sum + sheet.completedQuestions, 0);
    const totalQuestions = sheets.reduce((sum, sheet) => sum + sheet.totalQuestions, 0);
    return { totalSolved, totalQuestions, accuracy: 85 }; // Dummy accuracy
  }
}));