import { test, expect } from '@playwright/test';

test.describe('Module 0 Smoke Test', () => {
  test('boots application foundation and displays seeded organization metrics', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('foundation-status-badge')).toHaveText('Foundation Ready');
    await expect(page.getByTestId('org-card-org-acme')).toContainText('Acme Cloud Systems');
    await expect(page.getByTestId('org-card-org-acme')).toContainText('10,000 seeded employees');
  });
});