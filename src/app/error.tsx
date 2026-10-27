'use client';

import React, { useEffect } from 'react';
import { ErrorStateView } from '@/components/feedback/state-views';

export default function GlobalRouteError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    if (error.name === 'ChunkLoadError' || /Loading chunk [\d]+ failed/i.test(error.message)) {
      console.error('Dynamic chunk load failure detected:', error.message);
    }
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <ErrorStateView
        title="Application Error Boundary Triggered"
        message={error.message || 'An unexpected error occurred while rendering this route.'}
        code={error.digest ?? error.name}
        onRetry={reset}
        retryLabel="Recover View"
      />
    </main>
  );
}