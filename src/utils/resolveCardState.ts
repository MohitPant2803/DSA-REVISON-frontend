import type { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';
import { LocalCardState } from '@/store/usePlaylistStateStore';

/**
 * Pure, non-mutating utility to resolve card classification state based on central local store entries.
 * Ensures strict object reference identity stability to prevent redundant React rerenders.
 */
export function resolveCardState(
  card: IPopulatedRevisionCard,
  cardDifficultyMap: Record<string, LocalCardState>,
  cardsById?: Record<string, IPopulatedRevisionCard>
): IPopulatedRevisionCard {
  if (!card) return card;
  const cleanId = card._id.split('-loop-')[0];
  
  // 1. Prioritize active optimistic session difficulties
  const local = cardDifficultyMap[cleanId];
  if (local !== undefined) {
    const localDifficulty = local.difficulty;
    
    // Avoid re-creating progress object if it matches the current local difficulty state
    const currentQP = card.currentUserQuestionProgress;
    const currentAttempt = currentQP?.attemptStatus || null;
    const currentDifficulty = currentQP?.perceivedDifficultyByUser || null;

    let resolvedQP = currentQP;
    if (localDifficulty === 'skipped') {
      if (currentAttempt !== 'skipped') {
        resolvedQP = { attemptStatus: 'skipped' as const, perceivedDifficultyByUser: null };
      }
    } else if (localDifficulty) {
      if (currentAttempt !== 'attempted' || currentDifficulty !== localDifficulty) {
        resolvedQP = { attemptStatus: 'attempted' as const, perceivedDifficultyByUser: localDifficulty as any };
      }
    } else {
      if (currentQP !== null && currentQP !== undefined) {
        resolvedQP = null;
      }
    }

    // If nothing changed, preserve original card reference to protect memoization
    if (card.difficultyState === localDifficulty && card.currentUserQuestionProgress === resolvedQP) {
      return card;
    }

    console.log(`[DIAGNOSTIC - SELECTOR] Card ID: ${cleanId} resolved strictly from ACTIVE SESSION MAP: "${localDifficulty}"`);

    return {
      ...card,
      difficultyState: localDifficulty,
      currentUserQuestionProgress: resolvedQP,
    };
  }

  // 2. Fallback to the store's confirmed normalized card cache if it exists
  const cached = cardsById?.[cleanId];
  if (cached !== undefined) {
    if (
      card.difficultyState === cached.difficultyState && 
      card.currentUserQuestionProgress === cached.currentUserQuestionProgress
    ) {
      return card;
    }
    
    console.log(`[DIAGNOSTIC - SELECTOR] Card ID: ${cleanId} resolved from CANONICAL CACHE: "${cached.difficultyState}"`);

    return {
      ...card,
      difficultyState: cached.difficultyState,
      currentUserQuestionProgress: cached.currentUserQuestionProgress,
    };
  }

  return card;
}

/**
 * Robust field-level card reconciliation function.
 * Merges an incoming card (from a query/payload) with the existing cached card and active local session delta.
 * Follows strict precedence: Local session delta > Authoritative cached state > Stale query incoming payload.
 */
export function mergeCardState(
  local: LocalCardState | undefined,
  cached: IPopulatedRevisionCard | undefined,
  incoming: IPopulatedRevisionCard
): IPopulatedRevisionCard {
  if (!incoming) return incoming;
  const cleanId = incoming._id.split('-loop-')[0];

  console.log(`[DIAGNOSTIC - HYDRATION] mergeCardState for Card ID: ${cleanId} | Time: ${Date.now()}`);
  console.log(`  - Incoming query payload difficultyState: "${incoming.difficultyState}"`);
  console.log(`  - Canonical cache difficultyState: "${cached?.difficultyState}" (updatedAt: ${cached?.updatedAt})`);
  console.log(`  - Session map difficultyState: "${local?.difficulty}" (optimistic: ${local?.optimistic})`);

  // 1. Start with the incoming card data as the baseline, forcing clean canonical ID
  let merged = { ...incoming, _id: cleanId };

  // 2. If there is a cached version in our store, perform field-level reconciliation
  if (cached !== undefined) {
    const cachedTime = cached.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
    const incomingTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;

    // Shift hydration to be additive-only: never downgrade timestamps or fields if cache is newer/equal
    const useCachedBase = cachedTime >= incomingTime;

    merged = {
      ...incoming,
      ...(useCachedBase ? cached : {}),
      // Always protect local curation flags from being corrupted by stale queries
      isFavorite: cached.isFavorite !== undefined ? cached.isFavorite : incoming.isFavorite,
      isDifficult: cached.isDifficult !== undefined ? cached.isDifficult : incoming.isDifficult,
      isArchived: cached.isArchived !== undefined ? cached.isArchived : incoming.isArchived,
      // For core states, fallback to cached if cached is newer or equal
      difficultyState: useCachedBase 
        ? (cached.difficultyState !== undefined ? cached.difficultyState : incoming.difficultyState) 
        : (incoming.difficultyState !== undefined ? incoming.difficultyState : cached.difficultyState),
      currentUserQuestionProgress: useCachedBase
        ? (cached.currentUserQuestionProgress !== undefined ? cached.currentUserQuestionProgress : incoming.currentUserQuestionProgress)
        : (incoming.currentUserQuestionProgress !== undefined ? incoming.currentUserQuestionProgress : cached.currentUserQuestionProgress),
    };
  }

  // 3. Overlay active optimistic session difficulties if they exist (local takes absolute priority)
  if (local !== undefined) {
    const localDifficulty = local.difficulty;
    let resolvedQP = merged.currentUserQuestionProgress;
    
    if (localDifficulty === 'skipped') {
      resolvedQP = { attemptStatus: 'skipped' as const, perceivedDifficultyByUser: null };
    } else if (localDifficulty) {
      resolvedQP = { attemptStatus: 'attempted' as const, perceivedDifficultyByUser: localDifficulty as any };
    } else {
      resolvedQP = null;
    }

    merged.difficultyState = localDifficulty;
    merged.currentUserQuestionProgress = resolvedQP;
  }

  console.log(`  -> RESULT Reconciled difficultyState: "${merged.difficultyState}"`);

  return merged;
}

