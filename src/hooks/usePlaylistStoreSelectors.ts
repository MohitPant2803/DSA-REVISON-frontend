import { usePlaylistStateStore, DifficultyState, LocalCardState } from '@/store/usePlaylistStateStore';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { resolveCardState } from '@/utils/resolveCardState';

/**
 * Returns ONLY the specific card's interactive difficulty state from the store.
 * Isolated re-render hook. Rerenders ONLY if this card's classification changes.
 */
export function useCardDifficulty(cardId: string): DifficultyState {
  return usePlaylistStateStore(
    useCallback((state) => {
      const cleanId = cardId.split('-loop-')[0];
      return state.cardDifficultyMap[cleanId]?.difficulty;
    }, [cardId])
  );
}

/**
 * Dynamically computes smart/custom playlist lengths in O(1) derived from normalized state.
 * Rerenders ONLY when count changes.
 */
export function usePlaylistCount(playlistId: string): number {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
        if (!isSmart) {
          const order = state.playlistCardOrderMap[playlistId];
          if (order === undefined) {
            return state.initialSmartCounts[playlistId] || 0;
          }
          return order.length;
        }
        
        // If the smart playlist is hydrated, return the exact unique cards count inside
        if (state.hydratedPlaylists[playlistId]) {
          const cardDifficultyMap = state.cardDifficultyMap;
          const resolved = Object.keys(state.cardsById)
            .map((cardId) => state.cardsById[cardId])
            .filter(Boolean)
            .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById))
            .filter((resolvedCard) => resolvedCard.difficultyState === playlistId);

          const seenTitles = new Set<string>();
          const uniqueResolved = resolved.filter((card) => {
            if (!card.title) return false;
            const titleKey = card.title.trim().toLowerCase();
            if (seenTitles.has(titleKey)) return false;
            seenTitles.add(titleKey);
            return true;
          });

          return uniqueResolved.length;
        }
        
        const initial = state.initialSmartCounts[playlistId] || 0;
        const delta = state.smartPlaylistDeltaCounts[playlistId] || 0;
        return Math.max(0, initial + delta);
      }, [playlistId])
    )
  );
}

/**
 * Subscribes to a single card's populated details in cardsById cache.
 * Isolated re-render hook. Rerenders ONLY when this specific card updates.
 */
export function usePlaylistCard(cardId: string): IPopulatedRevisionCard | undefined {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const cleanId = cardId.split('-loop-')[0];
        const card = state.cardsById[cleanId];
        if (!card) return undefined;
        return resolveCardState(card, state.cardDifficultyMap, state.cardsById);
      }, [cardId])
    )
  );
}

/**
 * Hook to retrieve the interactive, resolved cards list for a specific playlist ID.
 * Returns a shallow-compared array of resolved card structures.
 */
export function usePlaylistCards(playlistId: string): IPopulatedRevisionCard[] {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
        const cardDifficultyMap = state.cardDifficultyMap;

        if (!isSmart) {
          // Resolve custom playlist card order strictly in stored order from cardsById cache
          const ids = state.playlistCardOrderMap[playlistId] || [];
          const resolved = ids
            .map((id) => state.cardsById[id])
            .filter(Boolean)
            .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById));
          
          return resolved;
        }

        // Derives smart playlist items on the fly
        const resolved = Object.keys(state.cardsById)
          .map((cardId) => state.cardsById[cardId])
          .filter(Boolean)
          .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById))
          .filter((resolvedCard) => resolvedCard.difficultyState === playlistId);

        // Deduplicate smart playlist cards by unique title to resolve seed data overlapping document duplicates
        const seenTitles = new Set<string>();
        const uniqueResolved = resolved.filter((card) => {
          if (!card.title) return false;
          const titleKey = card.title.trim().toLowerCase();
          if (seenTitles.has(titleKey)) return false;
          seenTitles.add(titleKey);
          return true;
        });

        // Sort by manual order if it exists
        const order = state.playlistCardOrderMap[playlistId] || [];
        if (order.length > 0) {
          const orderMap = new Map<string, number>(order.map((id, index) => [id, index]));
          uniqueResolved.sort((a, b) => {
            const idxA = orderMap.has(a._id) ? orderMap.get(a._id)! : 9999;
            const idxB = orderMap.has(b._id) ? orderMap.get(b._id)! : 9999;
            return idxA - idxB;
          });
        }

        return uniqueResolved;
      }, [playlistId])
    )
  );
}

/**
 * Subscribes to the authoritative difficulty map.
 */
export function useCardDifficultyMap(): Record<string, LocalCardState> {
  return usePlaylistStateStore(useShallow((state) => state.cardDifficultyMap));
}

/**
 * Subscribes to hydration guards.
 */
export function useHydratedPlaylists(): Record<string, boolean> {
  return usePlaylistStateStore(useShallow((state) => state.hydratedPlaylists));
}

/**
 * Subscribes to the authoritative normalized cardsById lookup cache.
 */
export function useCardsById(): Record<string, IPopulatedRevisionCard> {
  return usePlaylistStateStore(useShallow((state) => state.cardsById));
}
