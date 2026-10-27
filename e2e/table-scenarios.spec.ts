import { test, expect } from '@playwright/test';

test.describe('Module B â€” Employee Management Table E2E', () => {
  test('Rapid search race ("Asad" then "Rahul") never displays stale results and URL state survives refresh', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('login-submit-btn').click();

    await expect(page.getByTestId('employees-table')).toBeVisible();

    // Run deterministic race test ("Asad" 450ms -> "Rahul" 10ms)
    await page.getByTestId('race-demo-asad-rahul-btn').click();
    await expect(page.getByTestId('row-name-emp-00002')).toHaveText('Rahul Sharma');

    // Wait 550ms to ensure slower "Asad" request has settled and did not overwrite "Rahul"
    await page.waitForTimeout(550);
    await expect(page.getByTestId('row-name-emp-00002')).toHaveText('Rahul Sharma');
    await expect(page.getByTestId('row-name-emp-00001')).toHaveCount(0);

    // Refresh browser and confirm URL state (?q=Rahul) is restored
    await page.reload();
    await expect(page.getByTestId('employee-search-input')).toHaveValue('Rahul');
    await expect(page.getByTestId('row-name-emp-00002')).toHaveText('Rahul Sharma');
  });
});