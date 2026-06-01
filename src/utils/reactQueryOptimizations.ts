/**
 * REACT QUERY OPTIMIZATION UTILITIES
 * 
 * Purpose:
 * - Prevent focus-triggered refetch cascades
 * - Ensure stable query keys to prevent unnecessary re-evaluations
 * - Batch query subscriptions
 * - Reduce query subscriber count for massive payloads
 * 
 * Safe for production. All changes are performance-only.
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { profileQuery } from '@/hooks/useProfiler';

/**
 * Utility to create stable, memoized query keys
 * Prevents unnecessary cache invalidations due to object reference changes
 */
export function useStableQueryKey(
  baseKey: string | string[],
  params: Record<string, any> = {}
) {
  return useMemo(() => {
    const key = Array.isArray(baseKey) ? baseKey : [baseKey];
    // Only add params if they're defined and not empty
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, k) => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          acc[k] = params[k];
        }
        return acc;
      }, {} as Record<string, any>);

    return Object.keys(sortedParams).length > 0
      ? [...key, sortedParams]
      : key;
  }, [baseKey, JSON.stringify(params)]);
}

/**
 * Hook to safely refetch without cascading multiple queries
 * Batches refetch calls that happen within 16ms (one frame)
 */
export function useBatchedRefetch() {
  const queryClient = useQueryClient();
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const batchedQueriesRef = useRef(new Set<string>());

  const batchRefetch = useCallback(
    (queryKey: string | string[]) => {
      const keyStr = Array.isArray(queryKey) ? JSON.stringify(queryKey) : queryKey;
      batchedQueriesRef.current.add(keyStr);

      // Clear previous timeout
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }

      // Batch all refetch calls within 16ms
      batchTimeoutRef.current = setTimeout(() => {
        const queries = Array.from(batchedQueriesRef.current);
        batchedQueriesRef.current.clear();

        // Execute all refetches simultaneously
        queries.forEach((keyStr) => {
          const key = keyStr.startsWith('[')
            ? JSON.parse(keyStr)
            : keyStr;
          queryClient.refetchQueries({ queryKey: key, type: 'active' });
        });
      }, 16); // One frame
    },
    [queryClient]
  );

  return batchRefetch;
}

/**
 * Hook to safely invalidate queries without triggering immediate refetch
 * Marks stale but defers refetch until next actual use
 */
export function useLazyInvalidate() {
  const queryClient = useQueryClient();

  const lazyInvalidate = useCallback(
    (queryKey: string | string[]) => {
      // Mark as stale without immediate refetch
      queryClient.invalidateQueries({
        queryKey,
        refetchType: 'none', // Don't refetch immediately
      });
    },
    [queryClient]
  );

  return lazyInvalidate;
}

/**
 * Safe wrapper for query evaluation that logs timing
 * Used to profile and detect expensive queries
 */
export function useProfiledQuery<T>(
  queryKey: string | string[],
  queryFn: () => Promise<T>,
  options?: any
) {
  const wrappedFn = useCallback(async () => {
    const startTime = performance.now();
    try {
      const result = await queryFn();
      const duration = performance.now() - startTime;
      profileQuery(queryKey, duration);
      return result;
    } catch (err) {
      const duration = performance.now() - startTime;
      profileQuery(queryKey, duration);
      throw err;
    }
  }, [queryKey, queryFn]);

  return wrappedFn;
}

/**
 * Configuration presets for different query types
 * Use these to standardize cache behavior across app
 */
export const QUERY_CONFIG = {
  // User profile - rarely changes, safe to cache aggressively
  USER_PROFILE: {
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },

  // Folder/playlist lists - changes infrequently, moderate cache
  COLLECTIONS: {
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'stale', // Refetch if stale on reconnect
  },

  // Card content - rarely changes, aggressive cache
  CARD_CONTENT: {
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  },

  // Dashboard stats - changes frequently, minimal cache
  DASHBOARD: {
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: 'stale',
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'stale',
  },

  // Reels feed - volatile, cache only for fast re-navigation
  REELS_FEED: {
    staleTime: 0, // Always stale (user expects fresh)
    gcTime: 1000 * 60, // 1 minute (fast re-nav cache)
    refetchOnMount: false, // Don't auto-refetch on component mount
    refetchOnWindowFocus: false, // Don't refetch on tab switch
    refetchOnReconnect: 'stale', // Refetch on reconnect if needed
  },

  // Real-time data - must always be fresh
  REALTIME: {
    staleTime: 0,
    gcTime: 1000 * 30, // 30 seconds
    refetchOnMount: 'stale',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
};

/**
 * Memoized selector to prevent unnecessary rerenders
 * Ensures query subscribers only rerender when actually needed
 */
export function useStableSelector<T, R>(
  data: T | undefined,
  selector: (data: T) => R,
  equalityFn?: (a: R, b: R) => boolean
) {
  const prevRef = useRef<R | undefined>();
  const memoizedRef = useRef<R | undefined>();

  const defaultEquality = (a: any, b: any) => {
    // Shallow equality check
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => a[key] === b[key]);
  };

  const equals = equalityFn ?? defaultEquality;

  if (!data) {
    return memoizedRef.current;
  }

  const selected = selector(data);

  if (prevRef.current === undefined || !equals(selected, prevRef.current)) {
    prevRef.current = selected;
    memoizedRef.current = selected;
  }

  return memoizedRef.current;
}
