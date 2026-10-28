'use client';

import React from 'react';
import { AlertOctagon, RefreshCw, RotateCcw } from 'lucide-react';

export interface ComponentErrorBoundaryProps {
  readonly children: React.ReactNode;
  readonly boundaryName?: string;
  readonly onReset?: () => void;
}

interface ComponentErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly isChunkLoadError: boolean;
}

export function isDynamicChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message)
  );
}

export class ComponentErrorBoundary extends React.Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkLoadError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): ComponentErrorBoundaryState {
    return {
      hasError: true,
      error,
      isChunkLoadError: isDynamicChunkLoadError(error),
    };
  }

  public handleResetBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      isChunkLoadError: false,
    });
    this.props.onReset?.();
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, isChunkLoadError } = this.state;
    const boundaryLabel = this.props.boundaryName ?? 'Workspace Module';

    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="component-error-boundary-fallback"
        className="rounded-xl border-2 border-red-300 bg-red-50 p-6 text-red-950 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <AlertOctagon className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-red-950">
                {isChunkLoadError
                  ? `Dynamic Chunk Load Failure in ${boundaryLabel}`
                  : `Runtime Error Caught in ${boundaryLabel}`}
              </h3>
              <span
                data-testid="error-boundary-code-badge"
                className="rounded bg-red-200 px-2 py-0.5 font-mono text-xs font-semibold text-red-900"
              >
                {isChunkLoadError ? 'CHUNK_LOAD_ERROR' : (error?.name ?? 'RUNTIME_ERROR')}
              </span>
            </div>

            <p className="text-xs text-red-800">
              {error?.message ?? 'An unexpected rendering error occurred in this module.'}
            </p>

            {isChunkLoadError ? (
              <p className="text-xs font-medium text-red-900">
                A new deployment or network interruption prevented a JavaScript chunk from loading.
                You can recover this component tree immediately without losing your session.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                data-testid="error-boundary-recover-btn"
                onClick={this.handleResetBoundary}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-900"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {isChunkLoadError ? 'Retry Loading Module Chunk' : 'Recover Component'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function CrashingChunkChild({
  mode,
}: {
  readonly mode: 'none' | 'chunk' | 'runtime';
}): React.JSX.Element {
  if (mode === 'chunk') {
    const chunkErr = new Error(
      'Loading chunk app-dashboard-analytics-8f92a failed (simulated network drop).'
    );
    chunkErr.name = 'ChunkLoadError';
    throw chunkErr;
  }
  if (mode === 'runtime') {
    throw new Error('Simulated unexpected null reference in child widget.');
  }
  return (
    <div
      data-testid="chunk-sandbox-healthy"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900"
    >
      Dynamic Module Sandbox Status: Healthy &amp; Mounted
    </div>
  );
}

export function ChunkLoadRecoverySandbox(): React.JSX.Element {
  const [crashMode, setCrashMode] = React.useState<'none' | 'chunk' | 'runtime'>('none');

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Error Boundary &amp; Dynamic Chunk-Load Recovery Verifier
          </h4>
          <p className="text-[11px] text-slate-600">
            Simulate a failed dynamic `import()` chunk or render crash to verify isolated recovery:
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="trigger-chunk-error-btn"
            onClick={() => setCrashMode('chunk')}
            className="rounded border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-900 hover:bg-purple-100"
          >
            Simulate ChunkLoadError
          </button>

          <button
            type="button"
            data-testid="trigger-runtime-error-btn"
            onClick={() => setCrashMode('runtime')}
            className="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          >
            Simulate Render Crash
          </button>

          {crashMode !== 'none' ? (
            <button
              type="button"
              onClick={() => setCrashMode('none')}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <ComponentErrorBoundary
        boundaryName="LazyAnalyticsChunk"
        onReset={() => setCrashMode('none')}
      >
        <CrashingChunkChild mode={crashMode} />
      </ComponentErrorBoundary>
    </div>
  );
}