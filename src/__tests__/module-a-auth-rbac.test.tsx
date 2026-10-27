import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/providers/app-providers';
import HomePage from '@/app/page';
import { mockDb } from '@/lib/mock-api/db';
import { mockApiEngine } from '@/lib/mock-api/engine';
import { mockAuthApi } from '@/lib/mock-api/auth-api';
import { useUiStore } from '@/store/ui-store';
import {
  canImportCsv,
  canMutateEmployees,
  canSwitchOrganization,
  hasPermission,
} from '@/features/auth/permissions';

describe('Module A â€” Authentication, Organizations, and RBAC', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockDb.reset();
    mockApiEngine.resetEngine();
    mockApiEngine.setBaseLatencyMs(5);
    useUiStore.getState().resetUiStore();
  });

  it('evaluates role permissions accurately for SUPER_ADMIN, ORG_ADMIN, and VIEWER', () => {
    expect(canSwitchOrganization('SUPER_ADMIN')).toBe(true);
    expect(canSwitchOrganization('ORG_ADMIN')).toBe(false);
    expect(canSwitchOrganization('VIEWER')).toBe(false);

    expect(canMutateEmployees('SUPER_ADMIN')).toBe(true);
    expect(canMutateEmployees('ORG_ADMIN')).toBe(true);
    expect(canMutateEmployees('VIEWER')).toBe(false);

    expect(canImportCsv('SUPER_ADMIN')).toBe(true);
    expect(canImportCsv('ORG_ADMIN')).toBe(true);
    expect(canImportCsv('VIEWER')).toBe(false);

    expect(hasPermission('VIEWER', 'employee:read')).toBe(true);
    expect(hasPermission('VIEWER', 'employee:delete')).toBe(false);
  });

  it('rejects invalid credentials with HTTP 401 UNAUTHORIZED', async () => {
    await expect(
      mockAuthApi.login({
        email: 'admin@acme.io',
        passwordPlain: 'WrongPassword123',
      })
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('allows SUPER_ADMIN to switch organizations while rejecting ORG_ADMIN and VIEWER with 403 FORBIDDEN', async () => {
    const superSession = await mockAuthApi.login({
      email: 'superadmin@nexus.io',
      passwordPlain: 'SuperSecret!2026',
    });
    expect(superSession.availableOrganizations).toHaveLength(3);
    expect(superSession.activeOrganization.id).toBe('org-acme');

    const switched = await mockAuthApi.switchOrganization({
      token: superSession.token,
      targetOrganizationId: 'org-globex',
    });
    expect(switched.activeOrganization.id).toBe('org-globex');

    const orgAdminSession = await mockAuthApi.login({
      email: 'admin@acme.io',
      passwordPlain: 'AcmeAdmin!2026',
    });
    expect(orgAdminSession.availableOrganizations).toHaveLength(1);

    await expect(
      mockAuthApi.switchOrganization({
        token: orgAdminSession.token,
        targetOrganizationId: 'org-globex',
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('blocks cross-tenant organizationId manipulation, cross-tenant employeeId manipulation, and role spoofing at the API boundary', async () => {
    const acmeAdmin = await mockAuthApi.login({
      email: 'admin@acme.io',
      passwordPlain: 'AcmeAdmin!2026',
    });

    await expect(
      mockAuthApi.getTenantOverview({
        token: acmeAdmin.token,
        organizationId: 'org-globex',
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'CROSS_TENANT_ACCESS_DENIED',
    });

    await expect(
      mockAuthApi.attemptSecurityProbe({
        token: acmeAdmin.token,
        requestedOrganizationId: 'org-acme',
        targetEmployeeId: 'emp-10005',
        operation: 'MUTATE_EMPLOYEE',
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'CROSS_TENANT_ACCESS_DENIED',
    });

    const acmeViewer = await mockAuthApi.login({
      email: 'viewer@acme.io',
      passwordPlain: 'AcmeViewer!2026',
    });

    await expect(
      mockAuthApi.attemptSecurityProbe({
        token: acmeViewer.token,
        requestedOrganizationId: 'org-acme',
        clientClaimedRole: 'SUPER_ADMIN',
        operation: 'MUTATE_EMPLOYEE',
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('supports UI login, SUPER_ADMIN organization switching, and survives browser page refresh', async () => {
    const user = userEvent.setup();

    const { unmount } = render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await user.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('active-tenant-heading')).toHaveTextContent('Acme Cloud Systems');
      expect(screen.getByTestId('tenant-total-employees')).toHaveTextContent('10,000');
    });

    const switcher = screen.getByTestId('org-switcher-select');
    await user.selectOptions(switcher, 'org-globex');

    await waitFor(() => {
      expect(screen.getByTestId('active-tenant-heading')).toHaveTextContent('Globex FinTech Corp');
      expect(screen.getByTestId('tenant-total-employees')).toHaveTextContent('120');
    });

    unmount();

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-tenant-heading')).toHaveTextContent('Globex FinTech Corp');
      expect(screen.getByTestId('tenant-total-employees')).toHaveTextContent('120');
    });
  });

  it('enforces VIEWER read-only UI and rejects spoofed mutation probes', async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await user.click(screen.getByTestId('quick-fill-usr-viewer-acme'));
    await user.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-readonly-notice')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('org-switcher-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('locked-org-badge')).toHaveTextContent('Acme Cloud Systems');

    expect(screen.queryByTestId('create-employee-action-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('csv-import-action-btn')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('probe-role-spoof-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('security-probe-result')).toHaveTextContent('HTTP 403 (FORBIDDEN)');
    });
  });

  it('immediately expires session, redirects to Login with warning, and dismisses the banner when X is clicked', async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await user.click(screen.getByTestId('quick-fill-usr-admin-acme'));
    await user.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('active-tenant-heading')).toHaveTextContent('Acme Cloud Systems');
    });

    await user.click(screen.getByTestId('simulate-expiry-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-btn')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);

    await user.click(screen.getByRole('button', { name: /dismiss notification/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});