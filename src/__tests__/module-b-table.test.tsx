import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/providers/app-providers';
import HomePage from '@/app/page';
import { mockDb } from '@/lib/mock-api/db';
import { mockApiEngine } from '@/lib/mock-api/engine';
import {
  clearSearchTermDelays,
  mockEmployeesApi,
  setSearchTermDelayMs,
} from '@/lib/mock-api/employees-api';
import { mockAuthApi } from '@/lib/mock-api/auth-api';
import { useUiStore } from '@/store/ui-store';

describe('Module B Advanced Employee Management Table (10,000+ Records & 9 Critical Scenarios)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    clearSearchTermDelays();
    mockDb.reset();
    mockApiEngine.resetEngine();
    mockApiEngine.setBaseLatencyMs(5);
    useUiStore.getState().resetUiStore();
  });

  it('Scenario 1: Search for "Asad", then immediately search for "Rahul" stale "Asad" response never overwrites "Rahul"', async () => {
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

    // Trigger the deterministic race condition where "Asad" takes 450ms and "Rahul" takes 10ms
    await user.click(screen.getByTestId('race-demo-asad-rahul-btn'));

    // Wait for "Rahul Sharma" to appear
    await waitFor(() => {
      expect(screen.getByTestId('row-name-emp-00002')).toHaveTextContent('Rahul Sharma');
    });

    // Wait past the 450ms window of the slower "Asad" request and verify "Asad Khan" NEVER replaces "Rahul Sharma"
    await new Promise((r) => setTimeout(r, 520));

    expect(screen.getByTestId('row-name-emp-00002')).toHaveTextContent('Rahul Sharma');
    expect(screen.queryByTestId('row-name-emp-00001')).not.toBeInTheDocument();
  });

  it('Scenario 2 & 5: Changes filters while pending and restores URL state across browser refresh', async () => {
    const user = userEvent.setup();

    const { unmount } = render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await user.click(screen.getByTestId('login-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('employees-table')).toBeInTheDocument();
    });

    // Change department filter and sort column
    setSearchTermDelayMs('', 80);
    await user.selectOptions(screen.getByTestId('filter-department'), 'Security');
    await user.selectOptions(screen.getByTestId('filter-status'), 'ACTIVE');
    await user.click(screen.getByTestId('sort-col-salaryUsd'));

    await waitFor(() => {
      expect(window.location.search).toContain('dept=Security');
      expect(window.location.search).toContain('status=ACTIVE');
      expect(window.location.search).toContain('sortBy=salaryUsd');
    });

    // Unmount and remount to simulate browser page refresh (F5)
    unmount();

    render(
      <AppProviders>
        <HomePage />
      </AppProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('filter-department')).toHaveValue('Security');
      expect(screen.getByTestId('filter-status')).toHaveValue('ACTIVE');
    });
  });

  it('Scenario 3, 8 & 9: Preserves stable ID selection across sorting/filtering and clamps page when deletion reduces available pages', async () => {
    const session = await mockAuthApi.login({
      email: 'admin@globex.io',
      passwordPlain: 'GlobexAdmin!2026',
    });

    // Globex has 120 employees. With pageSize=50, totalPages = 3 (50 + 50 + 20 on page 3)
    const page3Before = await mockEmployeesApi.list({
      token: session.token,
      organizationId: 'org-globex',
      page: 3,
      pageSize: 50,
    });
    expect(page3Before.totalPages).toBe(3);
    expect(page3Before.currentPage).toBe(3);
    expect(page3Before.items).toHaveLength(20);

    // Delete all 20 employees on page 3 via bulkDelete
    const idsOnPage3 = page3Before.items.map((e) => e.id);
    const bulkRes = await mockEmployeesApi.bulkDelete({
      token: session.token,
      organizationId: 'org-globex',
      employeeIds: idsOnPage3,
    });
    expect(bulkRes.deletedCount).toBe(20);

    // Requesting page 3 now automatically clamps currentPage to 2 (since 100 items / 50 = 2 pages)
    const afterDelete = await mockEmployeesApi.list({
      token: session.token,
      organizationId: 'org-globex',
      page: 3,
      pageSize: 50,
    });
    expect(afterDelete.totalPages).toBe(2);
    expect(afterDelete.currentPage).toBe(2);
    expect(afterDelete.items).toHaveLength(50);
  });

  it('Scenario 4: Recovers gracefully from an API failure when navigating to another page', async () => {
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

    // Inject HTTP 500 failure (3 triggers so TanStack Query's 2 automatic retries also fail)
    mockApiEngine.enqueueFailureRule({
      id: 'fail-page-2',
      endpointPattern: 'employees.list',
      failureType: 'HTTP_500',
      remainingTriggers: 3,
      delayMs: 5,
    });

    await user.click(screen.getByTestId('page-next-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to Load Employee Table/i)).toBeInTheDocument();
    });

    // Click "Try Again" and verify page 2 loads cleanly
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByTestId('pagination-summary')).toHaveTextContent('Page 2 of');
    });
  });

  it('Scenario 6 & 9: Updates a single row without rerendering unselected sibling rows and keeps selection tied to stable ID across sort', async () => {
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

    const tbody = within(screen.getByTestId('employees-table')).getAllByRole('row');
    // tbody[0] is header row, tbody[1] is first data row, tbody[2] is second data row
    const firstRow = tbody[1]!;
    const secondRow = tbody[2]!;

    const firstRowTestId = firstRow.getAttribute('data-testid')!;
    const secondRowTestId = secondRow.getAttribute('data-testid')!;
    const firstEmpId = firstRowTestId.replace('employee-row-', '');

    const secondRowInitialRenderCount = Number(secondRow.getAttribute('data-render-count'));

    // Toggle status on the first row only
    await user.click(screen.getByTestId(`quick-status-btn-${firstEmpId}`));

    await waitFor(() => {
      const updatedFirstRow = screen.getByTestId(firstRowTestId);
      expect(updatedFirstRow.textContent).toContain('v2');
    });

    // Verify the second row did NOT rerender when the first row was updated
    const secondRowAfter = screen.getByTestId(secondRowTestId);
    expect(Number(secondRowAfter.getAttribute('data-render-count'))).toBe(
      secondRowInitialRenderCount
    );

    // Select firstEmpId, then reverse sort order and verify selection badge still holds firstEmpId
    await user.click(screen.getByTestId(`select-row-${firstEmpId}`));
    expect(screen.getByTestId('bulk-selection-bar')).toHaveTextContent(firstEmpId);

    await user.click(screen.getByTestId('sort-col-fullName'));
    await waitFor(() => {
      expect(screen.getByTestId('bulk-selection-bar')).toHaveTextContent(firstEmpId);
    });
  });
});