'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Info, RefreshCw, X } from 'lucide-react';

export interface LoadingSkeletonProps {
  readonly rows?: number;
  readonly label?: string;
}

export function LoadingSkeleton({
  rows = 5,
  label = 'Loading data...',
}: LoadingSkeletonProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className="w-full space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={`skeleton-row-${index}`}
          className="grid grid-cols-4 gap-4 py-2"
          data-testid="skeleton-row"
        >
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export interface ErrorStateViewProps {
  readonly title?: string;
  readonly message: string;
  readonly code?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

export function ErrorStateView({
  title = 'Unable to complete request',
  message,
  code,
  onRetry,
  retryLabel = 'Try Again',
}: ErrorStateViewProps): React.JSX.Element {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-red-950">{title}</h3>
            {code ? (
              <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs font-medium text-red-800">
                {code}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-red-800">{message}</p>
          {onRetry ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-md bg-red-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {retryLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export interface EmptyStateViewProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function EmptyStateView({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateViewProps): React.JSX.Element {
  return (
    <div
      role="region"
      aria-label={title}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Inbox className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export interface StatusBannerProps {
  readonly variant: 'info' | 'success' | 'warning' | 'error';
  readonly message: string;
  readonly onDismiss?: () => void;
}

export function StatusBanner({
  variant,
  message,
  onDismiss,
}: StatusBannerProps): React.JSX.Element {
  const styles: Record<StatusBannerProps['variant'], string> = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };

  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles[variant]}`}
    >
      <div className="flex items-center gap-2.5">
        {variant === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : variant === 'error' || variant === 'warning' ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Info className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
        )}
        <span className="font-medium">{message}</span>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="rounded p-1 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}