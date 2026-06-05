import { create } from 'zustand';

/** Session-only UI state for reels navigation. Playlist data lives in React Query + API. */
interface BookmarkState {
  activePlaylistId: string | null;
  activeFolderId: string | null;
  setActivePlaylistId: (id: string | null) => void;
  setActiveFolderId: (id: string | null) => void;
  resetSession: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  activePlaylistId: null,
  activeFolderId: null,
  setActivePlaylistId: (id) => set({ activePlaylistId: id }),
  setActiveFolderId: (id) => set({ activeFolderId: id }),
  resetSession: () => set({ activePlaylistId: null, activeFolderId: null }),
}));
