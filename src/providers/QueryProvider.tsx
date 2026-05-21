import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Using useState ensures the QueryClient is only initialized once per app lifecycle
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2, // Retry failed requests twice before throwing an error
            staleTime: 1000 * 60 * 5, // Data remains fresh for 5 minutes
            gcTime: 1000 * 60 * 60 * 24, // Garbage collection time: Keep unused data in cache for 24 hours
            refetchOnWindowFocus: false, // Usually set to false for React Native apps
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}