import { test, expect } from '@playwright/test';

test.describe('Module A Authentication, Organizations, and RBAC E2E', () => {
  test('Super Admin switches organizations, sees isolated records, and survives page reload', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('login-submit-btn').click();

    await expect(page.getByTestId('active-tenant-heading')).toHaveText('Acme Cloud Systems');
    await expect(page.getByTestId('tenant-total-employees')).toHaveText('10,000');

    await page.getByTestId('org-switcher-select').selectOption('org-globex');
    await expect(page.getByTestId('active-tenant-heading')).toHaveText('Globex FinTech Corp');
    await expect(page.getByTestId('tenant-total-employees')).toHaveText('120');

    await page.reload();
    await expect(page.getByTestId('active-tenant-heading')).toHaveText('Globex FinTech Corp');
    await expect(page.getByTestId('tenant-total-employees')).toHaveText('120');
  });

  test('Organization Admin is scoped to assigned organization and blocked from cross-tenant access', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('quick-fill-usr-admin-acme').click();
    await page.getByTestId('login-submit-btn').click();

    await expect(page.getByTestId('locked-org-badge')).toContainText('Acme Cloud Systems');
    await expect(page.getByTestId('org-switcher-select')).toHaveCount(0);

    await page.getByTestId('probe-cross-tenant-org-btn').click();
    await expect(page.getByTestId('security-probe-result')).toContainText(
      'HTTP 403 (CROSS_TENANT_ACCESS_DENIED)'
    );
  });

  test('Viewer has read-only access and clicking Expire Session immediately redirects to login', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('quick-fill-usr-viewer-acme').click();
    await page.getByTestId('login-submit-btn').click();

    await expect(page.getByTestId('viewer-readonly-notice')).toBeVisible();
    await expect(page.getByTestId('create-employee-action-btn')).toHaveCount(0);

    await page.getByTestId('simulate-expiry-btn').click();

    await expect(page.getByTestId('login-submit-btn')).toBeVisible();
    await expect(page.getByTestId('status-banner')).toContainText('session has expired');
  });
});