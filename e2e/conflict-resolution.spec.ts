import { test, expect } from '@playwright/test';

test.describe('Module C Concurrent Editing & HTTP 409 Conflict Resolution E2E', () => {
  test('Two administrators encounter an HTTP 409 version conflict and resolve it to v3', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('login-submit-btn').click();

    await expect(page.getByTestId('employees-table')).toBeVisible();

    // Filter to Asad Khan (emp-00001)
    const searchInput = page.getByTestId('employee-search-input');
    await searchInput.fill('Asad');
    await searchInput.press('Enter');

    await expect(page.getByTestId('row-name-emp-00001')).toHaveText('Asad Khan');

    // Admin B opens emp-00001 at v1
    await page.getByTestId('edit-row-btn-emp-00001').click();
    await expect(page.getByTestId('modal-version-badge')).toHaveText('Base Version: v1');

    // Admin A saves in background -> server bumps to v2
    await page.getByTestId('simulate-concurrent-admin-a-btn').click();
    await expect(page.getByTestId('concurrent-simulation-notice')).toContainText(
      'Server is now at v2'
    );

    // Admin B modifies Role Title and submits stale v1
    await page.getByTestId('modal-role').selectOption('Staff Engineer');
    await page.getByTestId('modal-submit-btn').click();

    // Conflict resolution UI appears
    await expect(page.getByTestId('conflict-resolution-panel')).toBeVisible();
    await expect(page.getByTestId('conflict-client-val-roleTitle')).toHaveText('Staff Engineer');

    // Reconcile and save as v3
    await page.getByTestId('choose-server-department').click();
    await page.getByTestId('conflict-submit-merged-btn').click();

    await expect(page.getByTestId('conflict-resolution-panel')).toHaveCount(0);
    await expect(page.getByTestId('employee-row-emp-00001')).toContainText('v3');
    await expect(page.getByTestId('employee-row-emp-00001')).toContainText('Staff Engineer');
  });
});