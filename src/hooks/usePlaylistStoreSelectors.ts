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
export function usePlaylistCount(playlistId: string): number | undefined {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
        if (!isSmart) {
          const order = state.playlistCardOrderMap[playlistId];
          if (order === undefined) {
            return undefined;
          }
          return order.length;
        }
        
        // Helper to compute live unique count from cache
        const getLiveCount = () => {
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
        };

        // If the smart playlist is hydrated, return the exact unique cards count inside
        if (state.hydratedPlaylists[playlistId]) {
          return getLiveCount();
        }
        
        const liveCount = getLiveCount();
        const fallbackCount = Math.max(0, (state.initialSmartCounts[playlistId] || 0) + (state.smartPlaylistDeltaCounts[playlistId] || 0));
        
        // Self-healing: if live cache has cards, prioritize live count correctness
        if (liveCount > 0 && (liveCount >= fallbackCount || fallbackCount === 0)) {
          return liveCount;
        }
        return fallbackCount;
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

// Selector cache to guarantee 100% stable references for React's getSnapshot / useSyncExternalStore
const playlistCardsCache = new Map<string, {
  cards: IPopulatedRevisionCard[];
  dependencies: {
    orderStr: string;
    difficultiesStr: string;
  };
}>();

/**
 * Hook to retrieve the interactive, resolved cards list for a specific playlist ID.
 * Returns a stable reference resolved card array from the local-first cache.
 */
export function usePlaylistCards(playlistId: string): IPopulatedRevisionCard[] {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
        const cardDifficultyMap = state.cardDifficultyMap;
        const cacheKey = `${playlistId}:${isSmart ? 'smart' : 'custom'}`;

        let orderStr = '';
        let difficultiesStr = '';

        if (!isSmart) {
          // Resolve custom playlist card order strictly in stored order from cardsById cache
          const ids = state.playlistCardOrderMap[playlistId] || [];
          orderStr = ids.join(',');
          difficultiesStr = ids.map(id => {
            const cleanId = id.split('-loop-')[0];
            const diff = cardDifficultyMap[cleanId]?.difficulty || '';
            const cardUpdated = state.cardsById[cleanId]?.updatedAt || '';
            return `${cleanId}:${diff}:${cardUpdated}`;
          }).join('|');

          const cachedEntry = playlistCardsCache.get(cacheKey);
          if (cachedEntry && cachedEntry.dependencies.orderStr === orderStr && cachedEntry.dependencies.difficultiesStr === difficultiesStr) {
            return cachedEntry.cards;
          }

          // Resolve custom cards
          const resolved = ids
            .map((id) => state.cardsById[id])
            .filter(Boolean)
            .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById));

          playlistCardsCache.set(cacheKey, {
            cards: resolved,
            dependencies: { orderStr, difficultiesStr }
          });

          return resolved;
        } else {
          // Derives smart playlist items on the fly
          const resolved = Object.keys(state.cardsById)
            .map((cardId) => state.cardsById[cardId])
            .filter(Boolean)
            .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById))
            .filter((resolvedCard) => resolvedCard.difficultyState === playlistId);

          // Deduplicate smart playlist cards by unique title
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

          orderStr = uniqueResolved.map(c => c._id).join(',');
          difficultiesStr = uniqueResolved.map(c => {
            const cleanId = c._id.split('-loop-')[0];
            const diff = cardDifficultyMap[cleanId]?.difficulty || '';
            const cardUpdated = c.updatedAt || '';
            return `${cleanId}:${diff}:${cardUpdated}`;
          }).join('|');

          const cachedEntry = playlistCardsCache.get(cacheKey);
          if (cachedEntry && cachedEntry.dependencies.orderStr === orderStr && cachedEntry.dependencies.difficultiesStr === difficultiesStr) {
            return cachedEntry.cards;
          }

          playlistCardsCache.set(cacheKey, {
            cards: uniqueResolved,
            dependencies: { orderStr, difficultiesStr }
          });

          return uniqueResolved;
        }
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
