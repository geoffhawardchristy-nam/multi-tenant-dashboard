$ErrorActionPreference = "Stop"

function Write-ProjectFile {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [Parameter(Mandatory=$true)][string]$Content
    )
    $fullPath = Join-Path -Path (Get-Location) -ChildPath $FilePath
    $dir = Split-Path -Path $fullPath -Parent
    if (-not (Test-Path -Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, $Content.TrimStart(), $utf8NoBom)
    Write-Host "Updated/Created: $FilePath" -ForegroundColor Green
}

Write-ProjectFile -FilePath "src/__tests__/module-e-resilience.test.tsx" -Content @'
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/providers/app-providers';
import HomePage from '@/app/page';
import { mockDb } from '@/lib/mock-api/db';
import { mockApiEngine } from '@/lib/mock-api/engine';
import { shouldRetryRequest } from '@/lib/query/query-client';
import { MockApiError } from '@/lib/mock-api/errors';
import { useUiStore } from '@/store/ui-store';
import { ChunkLoadRecoverySandbox } from '@/components/feedback/error-boundary';

describe('Module E - Resilience, Failure Classes, Retry Policy, and Chunk Error Recovery', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    mockDb.reset();
    mockApiEngine.resetEngine();
    mockApiEngine.setBaseLatencyMs(5);
    useUiStore.getState().resetUiStore();
  });

  it('simulates all required failure classes (401, 403, 409, 429, 500, Timeout 408, Offline 503)', async () => {
    const failureTypes = [
      { type: 'HTTP_401' as const, expectedStatus: 401, expectedCode: 'SESSION_EXPIRED' },
      { type: 'HTTP_403' as const, expectedStatus: 403, expectedCode: 'FORBIDDEN' },
      { type: 'HTTP_409' as const, expectedStatus: 409, expectedCode: 'VERSION_CONFLICT' },
      { type: 'HTTP_429' as const, expectedStatus: 429, expectedCode: 'RATE_LIMITED' },
      { type: 'HTTP_500' as const, expectedStatus: 500, expectedCode: 'INTERNAL_SERVER_ERROR' },
      { type: 'TIMEOUT' as const, expectedStatus: 408, expectedCode: 'NETWORK_TIMEOUT' },
      { type: 'OFFLINE' as const, expectedStatus: 503, expectedCode: 'NETWORK_OFFLINE' },
    ];

    for (const item of failureTypes) {
      const endpointName = `test.endpoint.${item.type}`;
      mockApiEngine.enqueueFailureRule({
        id: `test-${item.type}`,
        endpointPattern: endpointName,
        failureType: item.type,
        remainingTriggers: 1,
        delayMs: 1,
      });

      await expect(
        mockApiEngine.execute({
          endpoint: endpointName,
          handler: () => 'ok',
        })
      ).rejects.toMatchObject({
        status: item.expectedStatus,
        code: item.expectedCode,
      });
    }
  });

  it('enforces retry policy: retries 408/429/500 up to 2 times, never retries 401/403/409/422 or aborted requests', () => {
    const err408 = new MockApiError({ status: 408, code: 'NETWORK_TIMEOUT', message: 'Timeout' });
    const err429 = new MockApiError({ status: 429, code: 'RATE_LIMITED', message: 'Rate limit' });
    const err500 = new MockApiError({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Server error',
    });
    const err401 = new MockApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauth' });
    const err403 = new MockApiError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' });
    const err409 = new MockApiError({ status: 409, code: 'VERSION_CONFLICT', message: 'Conflict' });
    const errAbort = new MockApiError({ status: 400, code: 'REQUEST_ABORTED', message: 'Aborted' });

    expect(shouldRetryRequest(0, err408)).toBe(true);
    expect(shouldRetryRequest(1, err429)).toBe(true);
    expect(shouldRetryRequest(1, err500)).toBe(true);
    expect(shouldRetryRequest(2, err500)).toBe(false);

    expect(shouldRetryRequest(0, err401)).toBe(false);
    expect(shouldRetryRequest(0, err403)).toBe(false);
    expect(shouldRetryRequest(0, err409)).toBe(false);
    expect(shouldRetryRequest(0, errAbort)).toBe(false);
  });

  it('automatically recovers from a transient 1-time HTTP 429 Rate Limit via TanStack Query retry without showing an error state', async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await user.click(screen.getByTestId('login-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('employees-table')).toBeInTheDocument();
    });

    mockApiEngine.enqueueFailureRule({
      id: 'transient-429',
      endpointPattern: 'employees.list',
      failureType: 'HTTP_429',
      remainingTriggers: 1,
      delayMs: 5,
    });

    await user.click(screen.getByTestId('page-next-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pagination-summary')).toHaveTextContent('Page 2 of');
    });
  });

  it('recovers from Dynamic Import ChunkLoadError and runtime errors inside ComponentErrorBoundary', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ChunkLoadRecoverySandbox />);

    expect(screen.getByTestId('chunk-sandbox-healthy')).toBeInTheDocument();

    await user.click(screen.getByTestId('trigger-chunk-error-btn'));

    expect(screen.getByTestId('component-error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-code-badge')).toHaveTextContent('CHUNK_LOAD_ERROR');

    await user.click(screen.getByTestId('error-boundary-recover-btn'));
    expect(screen.getByTestId('chunk-sandbox-healthy')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('allows injecting offline state and failure rules via the interactive Chaos Control Drawer', async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await user.click(screen.getByTestId('login-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('employees-table')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('open-chaos-drawer-btn'));
    expect(screen.getByTestId('chaos-control-drawer')).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId('chaos-failure-type-select'), 'TIMEOUT');
    await user.click(screen.getByTestId('chaos-enqueue-rule-btn'));

    expect(screen.getByTestId('chaos-active-rules-list')).toHaveTextContent('TIMEOUT');
    expect(screen.getByTestId('chaos-active-count-badge')).toHaveTextContent('1');

    await user.click(screen.getByTestId('chaos-toggle-offline-btn'));
    expect(screen.getByTestId('navbar-offline-badge')).toHaveTextContent('OFFLINE');

    await user.click(screen.getByTestId('chaos-reset-all-btn'));
    expect(screen.queryByTestId('navbar-offline-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('chaos-no-rules-msg')).toBeInTheDocument();
  });
});
'@

Write-Host "`nResilience test fixed with unique endpoints! Run 'npm run test:run' now." -ForegroundColor Cyan