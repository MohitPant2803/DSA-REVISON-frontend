import { useMemo } from 'react';
import { usePlaylists, type UIPlaylist } from '@/hooks/usePlaylists';
import { usePlaylistStateStore } from '@/store/usePlaylistStateStore';

export const useCardPlaylistMembership = (cardId: string | null, enabled: boolean) => {
  const { data: playlists, isLoading, isError } = usePlaylists();
  const cleanCardId = cardId ? cardId.split('-loop-')[0] : null;

  // Read live playlistCardOrderMap from Zustand store
  const playlistCardOrderMap = usePlaylistStateStore((s) => s.playlistCardOrderMap);

  const membership = useMemo((): Record<string, boolean> => {
    if (!playlists || !cleanCardId) return {};
    const list = playlists as UIPlaylist[];
    const pairs = list.map((pl) => {
      // Prioritize live card order map from Zustand store
      const liveOrder = playlistCardOrderMap[pl.id];
      const isMember = liveOrder !== undefined
        ? liveOrder.some(id => id.split('-loop-')[0] === cleanCardId)
        : pl.orderedCardIds?.some(id => {
            if (!id) return false;
            const idStr = typeof (id as any) === 'object' ? ((id as any)._id?.toString() || (id as any).toString()) : String(id);
            return idStr.split('-loop-')[0] === cleanCardId;
          }) ?? false;

      return [pl.id, isMember] as const;
    });
    return Object.fromEntries(pairs);
  }, [playlists, cleanCardId, playlistCardOrderMap]);

  return {
    data: membership,
    isPending: isLoading,
    isError: isError,
  };
};

