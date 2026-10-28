import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/providers/app-providers';
import HomePage from '@/app/page';
import { mockDb } from '@/lib/mock-api/db';
import { mockApiEngine } from '@/lib/mock-api/engine';
import { clearSearchTermDelays } from '@/lib/mock-api/employees-api';
import { useUiStore } from '@/store/ui-store';
import { employeeFormSchema } from '@/features/employees/employee-schema';

describe('Module C - Reliable Forms, Optimistic Rollback, and Concurrent Editing (HTTP 409)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    clearSearchTermDelays();
    mockDb.reset();
    mockApiEngine.resetEngine();
    mockApiEngine.setBaseLatencyMs(5);
    useUiStore.getState().resetUiStore();
  });

  it('validates employee schema rules (required fields, email format, salary bounds)', () => {
    const invalid = employeeFormSchema.safeParse({
      firstName: 'A',
      lastName: '',
      email: 'not-an-email',
      department: 'Engineering',
      roleTitle: 'Software Engineer',
      status: 'ACTIVE',
      salaryUsd: 10000,
      hireDate: '2026/01/01',
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const messages = invalid.error.issues.map((i) => i.message);
      expect(messages).toContain('First name must be at least 2 characters.');
      expect(messages).toContain('Last name must be at least 2 characters.');
      expect(messages).toContain('Please enter a valid work email address.');
      expect(messages).toContain('Annual salary must be at least $30,000.');
      expect(messages).toContain('Hire date must be in YYYY-MM-DD format.');
    }
  });

  it('shows accessible field-level validation messages and warns before discarding unsaved form changes', async () => {
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

    await user.click(screen.getByTestId('open-create-employee-modal-btn'));

    await user.click(screen.getByTestId('modal-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-firstName')).toHaveTextContent(
        'First name must be at least 2 characters.'
      );
      expect(screen.getByTestId('error-email')).toHaveTextContent('Work email is required.');
    });
    expect(screen.getByTestId('modal-first-name')).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByTestId('modal-first-name'), 'Kiran');
    expect(screen.getByTestId('dirty-indicator-badge')).toHaveTextContent('Unsaved Edits');

    await user.click(screen.getByTestId('modal-cancel-btn'));
    expect(screen.getByTestId('unsaved-changes-prompt')).toBeInTheDocument();

    await user.click(screen.getByTestId('keep-editing-btn'));
    expect(screen.queryByTestId('unsaved-changes-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('modal-first-name')).toHaveValue('Kiran');

    await user.click(screen.getByTestId('modal-cancel-btn'));
    await user.click(screen.getByTestId('discard-changes-btn'));
    expect(screen.queryByTestId('modal-first-name')).not.toBeInTheDocument();
  });

  it('rolls back optimistic table updates when a mutation fails while preserving user form input', async () => {
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

    const searchInput = screen.getByTestId('employee-search-input');
    await user.type(searchInput, 'Asad{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('row-name-emp-00001')).toHaveTextContent('Asad Khan');
    });

    await user.click(screen.getByTestId('edit-row-btn-emp-00001'));

    const firstNameInput = screen.getByTestId('modal-first-name');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'AsadModified');

    await user.click(screen.getByTestId('arm-save-rollback-error-btn'));
    await user.click(screen.getByTestId('modal-submit-btn'));

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot Save Employee \(Optimistic Changes Rolled Back\)/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId('modal-first-name')).toHaveValue('AsadModified');
    expect(screen.getByTestId('row-name-emp-00001')).toHaveTextContent('Asad Khan');
  });

  it('detects HTTP 409 concurrent version conflicts (Admin A vs Admin B), displays side-by-side diff, and reconciles to v3', async () => {
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

    const searchInput = screen.getByTestId('employee-search-input');
    await user.type(searchInput, 'Asad{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('row-name-emp-00001')).toHaveTextContent('Asad Khan');
    });

    // Step 1 & 2: Administrator B opens emp-00001 at version 1
    await user.click(screen.getByTestId('edit-row-btn-emp-00001'));
    expect(screen.getByTestId('modal-version-badge')).toHaveTextContent('Base Version: v1');

    // Step 3: Administrator A saves changes in the background, bumping server record to v2
    await user.click(screen.getByTestId('simulate-concurrent-admin-a-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('concurrent-simulation-notice')).toHaveTextContent(
        /Server is now at v2/i
      );
    });

    // Step 4: Administrator B edits Role Title and submits based on stale v1
    await user.selectOptions(screen.getByTestId('modal-role'), 'Staff Engineer');
    await user.click(screen.getByTestId('modal-submit-btn'));

    // Step 5, 6 & 7: Mock API rejects with 409 VERSION_CONFLICT; wait for panel and mutation settle
    await waitFor(() => {
      expect(screen.getByTestId('conflict-resolution-panel')).toBeInTheDocument();
      expect(screen.getByTestId('conflict-submit-merged-btn')).not.toBeDisabled();
    });

    expect(screen.getByTestId('conflict-resolution-panel')).toHaveTextContent(
      /Your Base: v1.*Latest Server: v2/i
    );
    expect(screen.getByTestId('conflict-client-val-roleTitle')).toHaveTextContent('Staff Engineer');

    // Step 8: Administrator B selects "Keep Server" for Department and clicks Reconcile & Save as v3
    await user.click(screen.getByTestId('choose-server-department'));
    await user.click(screen.getByTestId('conflict-submit-merged-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('conflict-resolution-panel')).not.toBeInTheDocument();
      expect(screen.getByTestId('employee-row-emp-00001')).toHaveTextContent('v3');
      expect(screen.getByTestId('employee-row-emp-00001')).toHaveTextContent('Staff Engineer');
    });
  });
});