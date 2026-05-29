type CatalogLikeState = {
  userId?: string | null;
  playlistsById?: Record<string, any>;
  playlistCardOrderMap?: Record<string, string[]>;
  offlineActionQueue?: unknown[];
};

const SYSTEM_PLAYLIST_IDS = ['easy', 'medium', 'hard', 'skipped'];

export function getPersonalCatalogSnapshot(state: CatalogLikeState) {
  const playlistsById = state.playlistsById || {};
  const orderMap = state.playlistCardOrderMap || {};
  const playlists = Object.values(playlistsById).filter((playlist: any) => playlist && !playlist.isDeleted);
  const customPlaylists = playlists.filter((playlist: any) => !SYSTEM_PLAYLIST_IDS.includes(playlist._id));

  const focusCards = SYSTEM_PLAYLIST_IDS.reduce((total, id) => {
    const explicitCount = playlistsById[id]?.itemCount;
    return total + (typeof explicitCount === 'number' ? explicitCount : (orderMap[id]?.length || 0));
  }, 0);

  const customCards = customPlaylists.reduce((total, playlist: any) => {
    const id = playlist._id;
    const explicitIds = playlist.cardIds || playlist.orderedCardIds || orderMap[id] || [];
    return total + explicitIds.length;
  }, 0);

  return {
    userId: state.userId || 'guest-user',
    focusPlaylists: SYSTEM_PLAYLIST_IDS.length,
    customPlaylists: customPlaylists.length,
    totalPlaylists: SYSTEM_PLAYLIST_IDS.length + customPlaylists.length,
    focusCards,
    customCards,
    totalCardsInPlaylists: focusCards + customCards,
    pendingSyncActions: state.offlineActionQueue?.length || 0,
  };
}

export function logPersonalAction(action: string, details: Record<string, unknown> = {}, state?: CatalogLikeState) {
  const snapshot = state ? getPersonalCatalogSnapshot(state) : undefined;
  console.log(`[Personal Audit] ${action}`, {
    ...details,
    ...(snapshot ? { catalog: snapshot } : {}),
  });
}
