import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * OPTIMIZATION: React Query configuration tuned for React Native
 * - Aggressive caching to reduce focus-triggered refetches
 * - Deferred refetch on window focus (not applicable on React Native anyway)
 * - Long GC time to preserve cache for fast re-navigation
 * - Individual hooks can override these defaults
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2, // Retry failed requests twice before throwing an error
      staleTime: 1000 * 60 * 10, // OPTIMIZED: 10 minutes (was 5) - reduce refetch cascades
      gcTime: 1000 * 60 * 60 * 24, // Keep unused data in cache for 24 hours (fast re-nav)
      refetchOnWindowFocus: false, // Disabled for React Native
      refetchOnMount: false, // OPTIMIZED: Don't auto-refetch on mount (prevents focus-triggered cascades)
      refetchOnReconnect: 'stale', // Refetch only if data is stale and network reconnected
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}