import { test, expect } from '@playwright/test';

test.describe('Module D - 10,000-Row CSV Import & Partial Failure Recovery E2E', () => {
  test('10,000-row import fails deterministically after 7,000 rows and resumes remaining 3,000 rows without duplicates', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('login-submit-btn').click();

    await expect(page.getByTestId('employees-table')).toBeVisible();
    await expect(page.getByTestId('tenant-total-employees')).toHaveText('10,000');

    // Open Bulk CSV Import Wizard
    await page.getByTestId('open-csv-wizard-btn').click();

    // Click 1-Click 10,000-Row Preset (pre-configured with failure at row 7,000)
    await page.getByTestId('load-10k-preset-btn').click();
    await expect(page.getByTestId('csv-preview-table')).toBeVisible();
    await expect(page.getByTestId('simulate-fail-row-input')).toHaveValue('7000');

    // Start 10,000-row import
    await page.getByTestId('start-import-btn').click();

    // Verify simulated network failure stops at exactly 7,000 succeeded rows and 3,000 pending rows
    await expect(page.getByTestId('csv-error-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('progress-succeeded-count')).toHaveText('7,000');
    await expect(page.getByTestId('progress-pending-count')).toHaveText('3,000');

    // Click Retry / Resume Remaining 3,000 Rows
    await page.getByTestId('resume-import-btn').click();

    // Verify all 10,000 rows complete and total tenant employees is 20,000 (no duplicate creation of the 7,000 rows)
    await expect(page.getByTestId('csv-summary-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('summary-succeeded-count')).toHaveText('10,000');

    await page.getByTestId('csv-summary-done-btn').click();
    await expect(page.getByTestId('tenant-total-employees')).toHaveText('20,000');
  });
});