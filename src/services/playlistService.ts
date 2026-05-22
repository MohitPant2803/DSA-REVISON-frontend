import api from '@/services/api';

export interface ApiPlaylist {
  _id: string;
  name: string;
  description?: string;
  color1?: string;
  color2?: string;
  itemCount?: number;
  completedLoops?: number;
  orderedCardIds?: string[];
  cardIds?: string[];
}

export interface PlaylistDetail {
  playlist: ApiPlaylist;
  cardIds: string[];
  pagination: { total: number; page: number; pages: number };
}

const unwrap = <T,>(response: { data?: { data?: T } & T }): T => {
  const d = response.data;
  if (d && typeof d === 'object' && 'data' in d && d.data != null) {
    return d.data as T;
  }
  return d as T;
};

export const getPlaylists = async (): Promise<ApiPlaylist[]> => {
  const response = await api.get('/playlists');
  const payload = unwrap<{ playlists: ApiPlaylist[] }>(response);
  return payload?.playlists ?? [];
};

export const createPlaylist = async (data: {
  name: string;
  description?: string;
  color1?: string;
  color2?: string;
}): Promise<ApiPlaylist> => {
  const response = await api.post('/playlists/create', data);
  const payload = unwrap<{ playlist: ApiPlaylist }>(response);
  return payload.playlist;
};

export const deletePlaylist = async (playlistId: string): Promise<void> => {
  await api.delete(`/playlists/${playlistId}`);
};

export const getPlaylistById = async (
  playlistId: string,
  page = 1,
  limit = 100
): Promise<PlaylistDetail> => {
  const response = await api.get(`/playlists/${playlistId}`, {
    params: { page, limit },
  });
  const payload = unwrap<PlaylistDetail & { items?: string[] }>(response);
  const cardIds = payload.cardIds ?? payload.items ?? [];
  return {
    playlist: payload.playlist,
    cardIds,
    pagination: payload.pagination ?? { total: cardIds.length, page: 1, pages: 1 },
  };
};

export const addToPlaylist = async (playlistId: string, revisionCardId: string): Promise<void> => {
  await api.post('/playlists/add', { playlistId, revisionCardId });
};

export const removeFromPlaylist = async (playlistId: string, revisionCardId: string): Promise<void> => {
  await api.post('/playlists/remove', { playlistId, revisionCardId });
};

export const reorderPlaylist = async (playlistId: string, cardIds: string[]): Promise<ApiPlaylist> => {
  const response = await api.post(`/playlists/${playlistId}/reorder`, { cardIds });
  const payload = unwrap<{ playlist: ApiPlaylist }>(response);
  return payload.playlist;
};
