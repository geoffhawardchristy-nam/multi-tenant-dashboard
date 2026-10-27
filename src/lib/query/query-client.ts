import { QueryClient } from '@tanstack/react-query';
import { isAbortError, isMockApiError } from '@/lib/mock-api/errors';

export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }
  if (isAbortError(error)) {
    return false;
  }
  if (isMockApiError(error)) {
    if (
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 409 ||
      error.status === 422
    ) {
      return false;
    }
    return error.status === 408 || error.status === 429 || error.status === 500;
  }
  return false;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryRequest,
      },
      mutations: {
        retry: false,
      },
    },
  });
}