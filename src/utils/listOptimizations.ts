/**
 * LIST & COMPONENT MEMOIZATION UTILITIES
 * 
 * Purpose:
 * - Aggressively memoize list item components
 * - Eliminate unstable props that cause rerenders
 * - Optimize FlatList/FlashList rendering
 * - Prevent deep tree rerenders
 * 
 * Safe for production. Pure performance optimizations.
 */

import React, { useMemo, useCallback, memo } from 'react';

/**
 * Factory for creating memoized list item components
 * Automatically prevents rerenders unless exact props change
 */
export function createMemoizedListItem<T extends object>(
  Component: React.ComponentType<T>,
  propsEqualityFn?: (prevProps: T, nextProps: T) => boolean
): React.ComponentType<T> {
  return memo(Component, (prevProps, nextProps) => {
    if (propsEqualityFn) {
      return propsEqualityFn(prevProps, nextProps);
    }

    // Default: shallow equality
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);

    if (prevKeys.length !== nextKeys.length) return false;

    return prevKeys.every(
      (key) =>
        (prevProps as any)[key] === (nextProps as any)[key]
    );
  });
}

/**
 * Utility to stabilize callbacks for list items
 * Prevents creating new functions on each render
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: React.DependencyList
): T {
  return useCallback(callback, deps ?? []) as T;
}

/**
 * Utility to stabilize object props for list items
 */
export function useStableMemo<T>(
  factory: () => T,
  deps?: React.DependencyList
): T {
  return useMemo(factory, deps ?? []);
}

/**
 * FlatList/FlashList rendering optimization settings
 * Use these settings to tune scrolling performance
 */
export const OPTIMIZED_FLATLIST_SETTINGS = {
  // Mid-range device defaults (Snapdragon 888, etc.)
  midRange: {
    windowSize: 10, // Only render items within 10 item heights of viewport
    updateCellsBatchingPeriod: 50, // Batch cell updates every 50ms
    maxToRenderPerBatch: 10, // Max 10 items per batch
    initialNumToRender: 20, // Start with 20 items visible
    removeClippedSubviews: true, // Remove off-screen items from memory
    scrollEventThrottle: 16, // Update scroll events every frame (16ms)
  },

  // Budget device defaults (Snapdragon 665, etc.)
  budget: {
    windowSize: 8,
    updateCellsBatchingPeriod: 75,
    maxToRenderPerBatch: 8,
    initialNumToRender: 15,
    removeClippedSubviews: true,
    scrollEventThrottle: 16,
  },

  // High-end device defaults (Snapdragon 8 Gen 1, etc.)
  highEnd: {
    windowSize: 15,
    updateCellsBatchingPeriod: 30,
    maxToRenderPerBatch: 15,
    initialNumToRender: 30,
    removeClippedSubviews: true,
    scrollEventThrottle: 16,
  },
};

/**
 * Hook to detect device performance tier and return appropriate FlatList settings
 */
export function useOptimizedFlatListSettings() {
  return useMemo(() => {
    // In production, detect device via getDeviceInfo or similar
    // For now, default to midRange as safe default
    return OPTIMIZED_FLATLIST_SETTINGS.midRange;
  }, []);
}

/**
 * Memoized key extractor for FlatList
 * Prevents key regeneration on each render
 */
export function useStableKeyExtractor<T extends { id?: string | number }>(
  keyField: keyof T = 'id' as keyof T
) {
  return useCallback((item: T, index: number) => {
    return String(item[keyField] ?? index);
  }, [keyField]);
}

/**
 * Wrapper to ensure renderItem callbacks don't change between renders
 * 
 * Usage:
 *   const renderItem = useFlatListRenderItem(({ item, index }) => {
 *     return <YourComponent data={item} />;
 *   });
 *   // renderItem never changes, preventing FlatList rerender
 */
export function useFlatListRenderItem<T>(
  renderFn: (info: { item: T; index: number }) => React.ReactElement
) {
  return useCallback(renderFn, []);
}

/**
 * Prevent inline functions/objects that cause list rerenders
 */
export function useStableListProps<T extends object>(props: T): T {
  return useMemo(() => props, [JSON.stringify(props)]);
}

/**
 * Helper to create properly memoized nested list structures
 * (folder trees, playlist hierarchies, etc.)
 */
export function createMemoizedNestedList<T extends { children?: T[] }>(
  ItemComponent: React.ComponentType<{ item: T; depth: number }>,
  maxDepth: number = 5
) {
  const MemoizedItem = memo(ItemComponent);

  const TreeNode: React.ComponentType<{ item: T; depth: number }> = memo(
    ({ item, depth }) => {
      if (depth >= maxDepth) return null;

      const children = item.children?.map((child, idx) => 
        React.createElement(TreeNode as any, {
          key: `${depth}-${idx}`,
          item: child,
          depth: depth + 1
        })
      ) || [];

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(MemoizedItem, { item, depth }),
        ...children
      );
    }
  );

  return TreeNode;
}

/**
 * Batched list item renderer
 * Groups item renders to prevent FlatList thrashing
 */
export function useBatchedListRenderer<T>(
  items: T[],
  renderItem: (item: T, index: number) => React.ReactElement,
  batchSize: number = 20
) {
  const [displayedCount, setDisplayedCount] = React.useState(batchSize);

  const displayedItems = useMemo(
    () => items.slice(0, displayedCount),
    [items, displayedCount]
  );

  const loadMore = useCallback(() => {
    setDisplayedCount((prev) => Math.min(prev + batchSize, items.length));
  }, [items.length, batchSize]);

  const renderedItems = useMemo(
    () => displayedItems.map((item, idx) => renderItem(item, idx)),
    [displayedItems, renderItem]
  );

  return { renderedItems, loadMore, displayedCount, total: items.length };
}

/**
 * Virtualized list helper for extremely large lists
 * Only renders visible items plus small buffer
 */
export function useVirtualizedList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  buffer: number = 5
) {
  const [scrollOffset, setScrollOffset] = React.useState(0);

  const startIndex = Math.max(0, Math.floor(scrollOffset / itemHeight) - buffer);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollOffset + containerHeight) / itemHeight) + buffer
  );

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const offsetY = startIndex * itemHeight;

  return {
    visibleItems,
    offsetY,
    startIndex,
    endIndex,
    setScrollOffset,
  };
}
