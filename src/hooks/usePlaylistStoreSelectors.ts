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
    useCallback((state) => {
      const isSmart = ['easy', 'medium', 'hard', 'skipped'].includes(playlistId);
      if (!isSmart) {
        const order = state.playlistCardOrderMap[playlistId];
        return order === undefined ? undefined : order.length;
      }
      
      return Math.max(0, (state.initialSmartCounts[playlistId] || 0) + (state.smartPlaylistDeltaCounts[playlistId] || 0));
    }, [playlistId])
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
  storeRef: any;       // cardsById reference for O(1) skip
  diffRef: any;        // cardDifficultyMap reference for O(1) skip
  orderRef?: any;      // playlistCardOrderMap[id] reference for custom playlists
  revisionCounter?: number; // integer counter instead of fingerprint
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

        const cached = playlistCardsCache.get(cacheKey);

        // ===================================================================
        // Layer 1: O(1) Reference Check — skip ALL computation when inputs
        // haven't changed. cardsById and cardDifficultyMap only get new
        // references on real mutations, so this is the common-case fast path.
        // ===================================================================
        if (cached) {
          if (isSmart) {
            if (cached.storeRef === state.cardsById &&
                cached.diffRef === cardDifficultyMap) {
              return cached.cards;
            }
          } else {
            const order = state.playlistCardOrderMap[playlistId] || [];
            if (cached.storeRef === state.cardsById &&
                cached.diffRef === cardDifficultyMap &&
                cached.orderRef === order) {
              return cached.cards;
            }
          }
        }

        // ===================================================================
        // Layer 2: Full computation — only reached when a real mutation
        // produced a new store reference.
        // ===================================================================

        // Eviction logic to bound memory usage of the playlist cache map
        const evictIfNeeded = () => {
          if (playlistCardsCache.size >= 30) {
            const firstKey = playlistCardsCache.keys().next().value;
            if (firstKey !== undefined) {
              playlistCardsCache.delete(firstKey);
            }
          }
        };

        if (!isSmart) {
          // Resolve custom playlist card order strictly in stored order
          const order = state.playlistCardOrderMap[playlistId] || [];

          if (cached && cached.revisionCounter === state.currentRevisionCounter && cached.orderRef === order) {
            return cached.cards;
          }

          const resolved = order
            .map((id) => state.cardsById[id])
            .filter((card: any) => card && !card.isDeleted)
            .map((card) => resolveCardState(card, cardDifficultyMap, state.cardsById));

          evictIfNeeded();
          playlistCardsCache.set(cacheKey, {
            cards: resolved,
            storeRef: state.cardsById,
            diffRef: cardDifficultyMap,
            orderRef: order,
            revisionCounter: state.currentRevisionCounter,
          });

          return resolved;
        } else {
          if (cached && cached.revisionCounter === state.currentRevisionCounter) {
            return cached.cards;
          }

          // Smart playlist: derives items on the fly
          const resolved = Object.keys(state.cardsById)
            .map((cardId) => state.cardsById[cardId])
            .filter((card: any) => card && !card.isDeleted)
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

          evictIfNeeded();
          playlistCardsCache.set(cacheKey, {
            cards: uniqueResolved,
            storeRef: state.cardsById,
            diffRef: cardDifficultyMap,
            revisionCounter: state.currentRevisionCounter,
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

/**
 * Returns ONLY the specific card's favorite status from the store.
 * Isolated re-render hook. Rerenders ONLY if this card's favorite status changes.
 */
export function useCardFavorite(cardId: string): boolean {
  return usePlaylistStateStore(
    useCallback((state) => {
      const cleanId = cardId.split('-loop-')[0];
      return state.cardsById[cleanId]?.isFavorite === true;
    }, [cardId])
  );
}

/**
 * Cache maps to guarantee O(1) skips on hot/unrelated store updates
 */
const rawFolderCardsCache = new Map<string, {
  cards: IPopulatedRevisionCard[];
  storeRef: any;
  currentRevisionCounter: number;
}>();

const folderCountsCache = new Map<string, {
  counts: { easy: number; medium: number; hard: number; skipped: number; unattempted: number };
  storeRef: any;
  diffRef: any;
  currentRevisionCounter: number;
}>();

const folderCardsCache = new Map<string, {
  cards: IPopulatedRevisionCard[];
  storeRef: any;
  diffRef: any;
  currentRevisionCounter: number;
}>();

/**
 * Hook to retrieve the raw, sorted folder cards.
 * Returns a stable reference resolved array, completely bypassing O(N) conversions
 * when no actual card changes have occurred.
 */
export function useFolderCards(folderId: string): IPopulatedRevisionCard[] {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const cached = rawFolderCardsCache.get(folderId);
        if (cached && 
            cached.storeRef === state.cardsById && 
            cached.currentRevisionCounter === state.currentRevisionCounter) {
          return cached.cards;
        }

        const resolved = (Object.values(state.cardsById) as IPopulatedRevisionCard[])
          .filter((c: any) => c && (c.folderId === folderId || c.rootFolderId === folderId) && !c.isDeleted)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        if (rawFolderCardsCache.size >= 30) {
          const firstKey = rawFolderCardsCache.keys().next().value;
          if (firstKey !== undefined) {
            rawFolderCardsCache.delete(firstKey);
          }
        }

        rawFolderCardsCache.set(folderId, {
          cards: resolved,
          storeRef: state.cardsById,
          currentRevisionCounter: state.currentRevisionCounter,
        });

        return resolved;
      }, [folderId])
    )
  );
}

/**
 * Dynamically computes folder-level stats and progress classification counts.
 * Shallowly compared; rerenders ONLY when counts for this specific folder change!
 */
export function useFolderDifficultyCounts(folderId: string): {
  easy: number;
  medium: number;
  hard: number;
  skipped: number;
  unattempted: number;
} {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const cached = folderCountsCache.get(folderId);
        if (cached && 
            cached.storeRef === state.cardsById && 
            cached.diffRef === state.cardDifficultyMap && 
            cached.currentRevisionCounter === state.currentRevisionCounter) {
          return cached.counts;
        }

        const folderCards = (Object.values(state.cardsById) as IPopulatedRevisionCard[])
          .filter((c: any) => c && (c.folderId === folderId || c.rootFolderId === folderId) && !c.isDeleted);

        let easy = 0, medium = 0, hard = 0, skipped = 0, unattempted = 0;
        const cardDifficultyMap = state.cardDifficultyMap;

        folderCards.forEach((c) => {
          const cleanId = c._id.split('-loop-')[0];
          const local = cardDifficultyMap[cleanId];
          const difficulty = local ? local.difficulty : state.cardsById[cleanId]?.difficultyState;
          
          if (difficulty === 'easy') easy++;
          else if (difficulty === 'medium') medium++;
          else if (difficulty === 'hard') hard++;
          else if (difficulty === 'skipped') skipped++;
          else unattempted++;
        });

        const counts = { easy, medium, hard, skipped, unattempted };

        if (folderCountsCache.size >= 30) {
          const firstKey = folderCountsCache.keys().next().value;
          if (firstKey !== undefined) {
            folderCountsCache.delete(firstKey);
          }
        }

        folderCountsCache.set(folderId, {
          counts,
          storeRef: state.cardsById,
          diffRef: cardDifficultyMap,
          currentRevisionCounter: state.currentRevisionCounter,
        });

        return counts;
      }, [folderId])
    )
  );
}

/**
 * Resolves raw local folder card states and caches the results.
 * Returns a stable reference resolved array, preventing parent component rerenders
 * unless a card in this specific folder has actual property updates.
 */
export function useResolvedFolderCards(folderId: string): IPopulatedRevisionCard[] {
  return usePlaylistStateStore(
    useShallow(
      useCallback((state) => {
        const cardDifficultyMap = state.cardDifficultyMap;
        const cachedEntry = folderCardsCache.get(folderId);

        if (cachedEntry && 
            cachedEntry.storeRef === state.cardsById && 
            cachedEntry.diffRef === cardDifficultyMap && 
            cachedEntry.currentRevisionCounter === state.currentRevisionCounter) {
          return cachedEntry.cards;
        }

        const rawCards = (Object.values(state.cardsById) as IPopulatedRevisionCard[])
          .filter((c: any) => c && (c.folderId === folderId || c.rootFolderId === folderId) && !c.isDeleted)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        const resolved = rawCards.map((c) => resolveCardState(c, cardDifficultyMap, state.cardsById));
        
        if (folderCardsCache.size >= 30) {
          const firstKey = folderCardsCache.keys().next().value;
          if (firstKey !== undefined) {
            folderCardsCache.delete(firstKey);
          }
        }

        folderCardsCache.set(folderId, {
          cards: resolved,
          storeRef: state.cardsById,
          diffRef: cardDifficultyMap,
          currentRevisionCounter: state.currentRevisionCounter,
        });

        return resolved;
      }, [folderId])
    )
  );
}
