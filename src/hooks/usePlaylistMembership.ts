import { useMemo } from 'react';
import { usePlaylists, type UIPlaylist } from '@/hooks/usePlaylists';

export const useCardPlaylistMembership = (cardId: string | null, enabled: boolean) => {
  const { data: playlists, isLoading, isError } = usePlaylists();
  const cleanCardId = cardId ? cardId.split('-loop-')[0] : null;

  const membership = useMemo((): Record<string, boolean> => {
    if (!playlists || !cleanCardId) return {};
    const list = playlists as UIPlaylist[];
    const pairs = list.map((pl) => {
      const isMember = pl.orderedCardIds?.some(id => {
        if (!id) return false;
        const idStr = typeof (id as any) === 'object' ? ((id as any)._id?.toString() || (id as any).toString()) : String(id);
        return idStr === cleanCardId;
      }) ?? false;
      return [pl.id, isMember] as const;
    });
    return Object.fromEntries(pairs);
  }, [playlists, cleanCardId]);

  return {
    data: membership,
    isPending: isLoading,
    isError: isError,
  };
};

