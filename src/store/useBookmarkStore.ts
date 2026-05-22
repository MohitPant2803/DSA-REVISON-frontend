import { create } from 'zustand';

/** Session-only UI state for reels navigation. Playlist data lives in React Query + API. */
interface BookmarkState {
  activePlaylistId: string | null;
  setActivePlaylistId: (id: string | null) => void;
  resetSession: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  activePlaylistId: null,
  setActivePlaylistId: (id) => set({ activePlaylistId: id }),
  resetSession: () => set({ activePlaylistId: null }),
}));
