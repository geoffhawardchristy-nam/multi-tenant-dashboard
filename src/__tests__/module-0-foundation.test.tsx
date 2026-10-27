import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockDb } from '@/lib/mock-api/db';
import { mockApiEngine } from '@/lib/mock-api/engine';
import { MockApiError } from '@/lib/mock-api/errors';
import { shouldRetryRequest } from '@/lib/query/query-client';
import {
  EmptyStateView,
  ErrorStateView,
  LoadingSkeleton,
} from '@/components/feedback/state-views';
import { AppProviders } from '@/providers/app-providers';
import HomePage from '@/app/page';

describe('Module 0 â€” Project Foundation & Mock Infrastructure', () => {
  it('deterministically seeds 3 organizations and 10,200 employees (10,000 in org-acme)', () => {
    const orgs = mockDb.getOrganizations();
    expect(orgs).toHaveLength(3);

    expect(mockDb.getTotalEmployeeCount()).toBe(10200);
    const acmeEmployees = mockDb.getEmployeesByOrganization('org-acme');
    expect(acmeEmployees).toHaveLength(10000);

    const first = mockDb.getEmployeeById('emp-00001');
    const second = mockDb.getEmployeeById('emp-00002');
    expect(first?.fullName).toBe('Asad Khan');
    expect(second?.fullName).toBe('Rahul Sharma');
  });

  it('enforces server-side RBAC and blocks cross-tenant access in requireAuthorizedSession', () => {
    const token = 'test-session-org-admin';
    mockDb.createSession({
      token,
      user: {
        id: 'usr-admin-acme',
        email: 'admin@acme.io',
        name: 'Marcus Sterling',
        role: 'ORG_ADMIN',
        organizationId: 'org-acme',
      },
      activeOrganizationId: 'org-acme',
      expiresAtMs: Date.now() + 60_000,
    });

    const validSession = mockDb.requireAuthorizedSession(token, 'employee:update', 'org-acme');
    expect(validSession.user.organizationId).toBe('org-acme');

    expect(() => mockDb.requireAuthorizedSession(token, 'org:switch', 'org-acme')).toThrowError(
      MockApiError
    );

    try {
      mockDb.requireAuthorizedSession(token, 'employee:read', 'org-globex');
      expect.fail('Should have thrown CROSS_TENANT_ACCESS_DENIED');
    } catch (err) {
      expect(err).toBeInstanceOf(MockApiError);
      const apiErr = err as MockApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    }
  });

  it('aborts pending requests immediately when AbortSignal fires', async () => {
    const controller = new AbortController();
    const promise = mockApiEngine.execute({
      endpoint: 'employees.list',
      customDelayMs: 500,
      signal: controller.signal,
      handler: () => 'should-not-resolve',
    });

    setTimeout(() => controller.abort(), 15);

    await expect(promise).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    });
  });

  it('injects deterministic failures and decrements remainingTriggers', async () => {
    mockApiEngine.enqueueFailureRule({
      id: 'rule-500-once',
      endpointPattern: 'employees.update',
      failureType: 'HTTP_500',
      remainingTriggers: 1,
      delayMs: 5,
    });

    await expect(
      mockApiEngine.execute({
        endpoint: 'employees.update',
        handler: () => 'ok',
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });

    const secondResult = await mockApiEngine.execute({
      endpoint: 'employees.update',
      customDelayMs: 1,
      handler: () => 'recovered',
    });
    expect(secondResult).toBe('recovered');
  });

  it('configures retry policy to retry transient 500/429 errors but never 401/403/409', () => {
    const err401 = new MockApiError({
      status: 401,
      code: 'SESSION_EXPIRED',
      message: 'Expired',
    });
    const err409 = new MockApiError({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Conflict',
    });
    const err500 = new MockApiError({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Server failure',
    });

    expect(shouldRetryRequest(0, err401)).toBe(false);
    expect(shouldRetryRequest(0, err409)).toBe(false);
    expect(shouldRetryRequest(0, err500)).toBe(true);
    expect(shouldRetryRequest(2, err500)).toBe(false);
  });

  it('renders accessible LoadingSkeleton, ErrorStateView, EmptyStateView, and Foundation page', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <div>
        <LoadingSkeleton rows={3} label="Loading employees" />
        <ErrorStateView
          message="Simulated failure"
          code="INTERNAL_SERVER_ERROR"
          onRetry={onRetry}
        />
        <EmptyStateView title="No employees match" description="Try clearing your search filter." />
      </div>
    );

    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Simulated failure');

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );
    expect(screen.getByTestId('foundation-status-badge')).toHaveTextContent('Foundation Ready');
    expect(screen.getByTestId('org-card-org-acme')).toHaveTextContent('10,000 seeded employees');
  });
});