import { create } from 'zustand';

export interface Playlist {
  id: string;
  name: string;
  placardIds: string[];
  color1: string;
  color2: string;
}

interface BookmarkState {
  bookmarkedIds: string[];
  playlists: Playlist[];
  recentlyViewedIds: string[];
  activeBookmarkId: string | null;
  activePlaylistId: string | null;
  toggleBookmark: (id: string) => void;
  setActiveBookmark: (id: string | null) => void;
  setActivePlaylistId: (id: string | null) => void;
  createPlaylist: (name: string, initialPlacardId?: string) => void;
  togglePlaylist: (playlistId: string, placardId: string) => void;
  addRecentlyViewed: (id: string) => void;
}

const PRESET_COLORS = [
  ['#818cf8', '#c084fc'], // Indigo to Fuchsia
  ['#34d399', '#3b82f6'], // Emerald to Blue
  ['#fbbf24', '#f87171'], // Amber to Rose
  ['#a78bfa', '#f472b6'], // Violet to Pink
  ['#38bdf8', '#818cf8'], // Light Blue to Indigo
];

export const useBookmarkStore = create<BookmarkState>((set) => ({
  bookmarkedIds: [],
  playlists: [],
  recentlyViewedIds: [],
  activeBookmarkId: null,
  activePlaylistId: null,
  toggleBookmark: (id) => set((state) => ({
    bookmarkedIds: state.bookmarkedIds.includes(id)
      ? state.bookmarkedIds.filter(bId => bId !== id)
      : [...state.bookmarkedIds, id]
  })),
  setActiveBookmark: (id) => set({ activeBookmarkId: id }),
  setActivePlaylistId: (id) => set({ activePlaylistId: id }),
  createPlaylist: (name, initialPlacardId) => set((state) => {
    const [color1, color2] = PRESET_COLORS[state.playlists.length % PRESET_COLORS.length];
    const newPlaylist: Playlist = { id: `pl-${Date.now()}`, name, placardIds: initialPlacardId ? [initialPlacardId] : [], color1, color2 };
    return { playlists: [newPlaylist, ...state.playlists] };
  }),
  togglePlaylist: (playlistId, placardId) => set((state) => ({
    playlists: state.playlists.map(pl => pl.id === playlistId ? { ...pl, placardIds: pl.placardIds.includes(placardId) ? pl.placardIds.filter(id => id !== placardId) : [...pl.placardIds, placardId] } : pl)
  })),
  addRecentlyViewed: (id) => set((state) => ({
    recentlyViewedIds: [id, ...state.recentlyViewedIds.filter(rid => rid !== id)].slice(0, 15)
  }))
}));