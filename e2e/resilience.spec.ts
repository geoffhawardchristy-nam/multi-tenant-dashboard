import { test, expect } from '@playwright/test';

test.describe('Module E - Resilience, Offline Recovery, and Chunk Error Boundary E2E', () => {
  test('Injects offline failure via Chaos Control Drawer, shows recoverable error, and recovers when back online', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('login-submit-btn').click();
    await expect(page.getByTestId('employees-table')).toBeVisible();

    await page.getByTestId('open-chaos-drawer-btn').click();
    await expect(page.getByTestId('chaos-control-drawer')).toBeVisible();

    await page.getByTestId('trigger-chunk-error-btn').click();
    await expect(page.getByTestId('error-boundary-code-badge')).toHaveText('CHUNK_LOAD_ERROR');
    await page.getByTestId('error-boundary-recover-btn').click();
    await expect(page.getByTestId('chunk-sandbox-healthy')).toBeVisible();

    await page.getByTestId('chaos-toggle-offline-btn').click();
    await expect(page.getByTestId('navbar-offline-badge')).toHaveText('OFFLINE');
    await page.getByTestId('close-chaos-drawer-btn').click();

    await page.getByTestId('page-next-btn').click();
    await expect(page.getByTestId('error-state-view')).toContainText('Network is offline');

    await page.getByTestId('open-chaos-drawer-btn').click();
    await page.getByTestId('chaos-toggle-offline-btn').click();
    await page.getByTestId('close-chaos-drawer-btn').click();

    await page.getByRole('button', { name: /try again/i }).click();
    await expect(page.getByTestId('pagination-summary')).toContainText('Page 2 of');
  });
});