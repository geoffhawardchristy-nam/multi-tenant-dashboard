import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/providers/app-providers';
import HomePage from '@/app/page';
import { mockDb } from '@/lib/mock-api/db';
import { mockApiEngine } from '@/lib/mock-api/engine';
import {
  mockCsvImportApi,
  resetCsvImportSimulationState,
} from '@/lib/mock-api/csv-import-api';
import { mockAuthApi } from '@/lib/mock-api/auth-api';
import { useUiStore } from '@/store/ui-store';
import {
  autoDetectColumnMapping,
  generateBulkImportRows,
  parseCsvString,
  validateCsvFileMetadata,
} from '@/features/csv-import/csv-parser';

describe('Module D - Reliable Bulk CSV Import (10,000 Rows, Partial Failure at 7,000, & Edge Cases)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetCsvImportSimulationState();
    mockDb.reset();
    mockApiEngine.resetEngine();
    mockApiEngine.setBaseLatencyMs(1);
    useUiStore.getState().resetUiStore();
  });

  it('validates file type/size and parses RFC-4180 CSV with quoted fields, escaped quotes, commas, and line breaks', async () => {
    expect(
      validateCsvFileMetadata({ name: 'malware.exe', size: 1024, type: 'application/octet-stream' })
    ).toContain('Invalid file type');

    expect(
      validateCsvFileMetadata({ name: 'huge.csv', size: 20 * 1024 * 1024, type: 'text/csv' })
    ).toContain('exceeds the 15 MB maximum limit');

    const rfc4180Csv = `First Name,Last Name,Work Email,Dept,Job Title,Status,Salary,Hire Date
"Asad ""The Architect""","Khan, Jr.","asad.rfc@acme.io","Engineering","Staff Engineer","ACTIVE","145000","2026-01-10"
"Maya","Lin
MultiLine","maya.rfc@acme.io","Design","Product Designer","ACTIVE","118000","2026-02-15"`;

    const parsed = await parseCsvString(rfc4180Csv);
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.rawRows).toHaveLength(2);
    expect(parsed.rawRows[0]?.['First Name']).toBe('Asad "The Architect"');
    expect(parsed.rawRows[0]?.['Last Name']).toBe('Khan, Jr.');
    expect(parsed.rawRows[1]?.['Last Name']).toContain('MultiLine');

    const mapping = autoDetectColumnMapping(parsed.headers);
    expect(mapping.emailField).toBe('Work Email');
    expect(mapping.departmentField).toBe('Dept');
  });

  it('distinguishes valid rows, intra-CSV duplicates, existing org emails, invalid rows, and retryable failed rows', async () => {
    const admin = await mockAuthApi.login({
      email: 'admin@acme.io',
      passwordPlain: 'AcmeAdmin!2026',
    });

    const rows = [
      {
        rowNumber: 1,
        firstName: 'Zack',
        lastName: 'Snyder',
        email: 'zack.snyder@acme.io',
        department: 'Engineering',
        roleTitle: 'Staff Engineer',
        status: 'ACTIVE',
        salaryUsd: 120000,
        hireDate: '2026-03-01',
      },
      {
        rowNumber: 2,
        firstName: 'Zack',
        lastName: 'Duplicate',
        email: 'zack.snyder@acme.io', // Intra-CSV duplicate
        department: 'Engineering',
        roleTitle: 'Staff Engineer',
        status: 'ACTIVE',
        salaryUsd: 120000,
        hireDate: '2026-03-01',
      },
      {
        rowNumber: 3,
        firstName: 'Asad',
        lastName: 'Khan',
        email: 'asad.khan.1@acme.io', // Already exists in org-acme seed DB
        department: 'Engineering',
        roleTitle: 'Staff Engineer',
        status: 'ACTIVE',
        salaryUsd: 120000,
        hireDate: '2026-03-01',
      },
      {
        rowNumber: 4,
        firstName: 'X', // Invalid (< 2 chars)
        lastName: '',
        email: 'bad-email',
        department: 'Engineering',
        roleTitle: 'Staff Engineer',
        status: 'ACTIVE',
        salaryUsd: 5000,
        hireDate: 'invalid-date',
      },
      {
        rowNumber: 5,
        firstName: 'Transient',
        lastName: 'FailureRow',
        email: 'transient.row@acme.io',
        department: 'Security',
        roleTitle: 'Security Architect',
        status: 'ACTIVE',
        salaryUsd: 135000,
        hireDate: '2026-03-02',
        forceRowFailureOnce: true,
      },
    ];

    const initRes = await mockCsvImportApi.initImportJob({
      token: admin.token,
      organizationId: 'org-acme',
      fileName: 'mixed-cases.csv',
      rows,
    });

    expect(initRes.duplicateInCsvCount).toBe(1);
    expect(initRes.skippedExistingCount).toBe(1);
    expect(initRes.invalidCount).toBe(1);
    expect(initRes.pendingCount).toBe(2); // Row 1 and Row 5

    // First pass: Row 1 succeeds, Row 5 fails with transient error
    const firstPass = await mockCsvImportApi.processChunk({
      token: admin.token,
      organizationId: 'org-acme',
      jobId: initRes.job.jobId,
      startIndex: 0,
      batchSize: 10,
    });

    expect(firstPass.succeededCount).toBe(1);
    expect(firstPass.failedCount).toBe(1);

    // Retry only failed rows: Row 5 now succeeds and Row 1 is NOT duplicated
    const retryFailedPass = await mockCsvImportApi.processChunk({
      token: admin.token,
      organizationId: 'org-acme',
      jobId: initRes.job.jobId,
      startIndex: 0,
      batchSize: 10,
      retryFailedRows: true,
    });

    expect(retryFailedPass.succeededCount).toBe(2);
    expect(retryFailedPass.failedCount).toBe(0);
    expect(retryFailedPass.isComplete).toBe(true);
  });

  it('Critical Scenario: 10,000-row import processes 7,000 rows, hits simulated network failure, and resumes remaining 3,000 rows without duplicating the 7,000 records', async () => {
    const admin = await mockAuthApi.login({
      email: 'admin@acme.io',
      passwordPlain: 'AcmeAdmin!2026',
    });

    const initialOrgCount = mockDb.getEmployeesByOrganization('org-acme').length;
    expect(initialOrgCount).toBe(10000);

    const rows10k = generateBulkImportRows(10000, 'critical10k');
    const initRes = await mockCsvImportApi.initImportJob({
      token: admin.token,
      organizationId: 'org-acme',
      fileName: '10k-recovery.csv',
      rows: rows10k,
    });

    const jobId = initRes.job.jobId;
    const batchSize = 1000;

    // Run chunks with simulateNetworkFailureAfterRow: 7000
    let caughtError: unknown = null;
    for (let start = 0; start < 10000; start += batchSize) {
      try {
        await mockCsvImportApi.processChunk({
          token: admin.token,
          organizationId: 'org-acme',
          jobId,
          startIndex: start,
          batchSize,
          simulateNetworkFailureAfterRow: 7000,
        });
      } catch (err: unknown) {
        caughtError = err;
        break;
      }
    }

    expect(caughtError).toBeTruthy();

    // Verify authoritative server status after failure at row 7,000:
    // Exactly 7,000 succeeded, 3,000 still PENDING, and org employee count is 17,000
    const statusAtFailure = await mockCsvImportApi.getJobStatus({
      token: admin.token,
      organizationId: 'org-acme',
      jobId,
    });

    expect(statusAtFailure.succeededCount).toBe(7000);
    expect(statusAtFailure.pendingCount).toBe(3000);
    expect(mockDb.getEmployeesByOrganization('org-acme')).toHaveLength(17000);

    // Now retry/resume from the beginning (startIndex = 0) to prove the first 7,000 are skipped idempotently
    for (let start = 0; start < 10000; start += batchSize) {
      await mockCsvImportApi.processChunk({
        token: admin.token,
        organizationId: 'org-acme',
        jobId,
        startIndex: start,
        batchSize,
      });
    }

    const finalStatus = await mockCsvImportApi.getJobStatus({
      token: admin.token,
      organizationId: 'org-acme',
      jobId,
    });

    expect(finalStatus.succeededCount).toBe(10000);
    expect(finalStatus.pendingCount).toBe(0);
    expect(finalStatus.isComplete).toBe(true);

    // Crucial assertion: 10,000 original + 10,000 imported = 20,000 (the 7,000 rows were NEVER duplicated!)
    expect(mockDb.getEmployeesByOrganization('org-acme')).toHaveLength(20000);
  });

  it('completes the UI CSV Import Wizard workflow for edge-case presets and updates summary counts', async () => {
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

    await user.click(screen.getByTestId('open-csv-wizard-btn'));
    await user.click(screen.getByTestId('load-edge-cases-preset-btn'));

    // Verify Step 2 shows preview table and all 8 column mapping dropdowns
    await waitFor(() => {
      expect(screen.getByTestId('csv-preview-table')).toBeInTheDocument();
      expect(screen.getByTestId('map-role')).toBeInTheDocument();
      expect(screen.getByTestId('map-salary')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('start-import-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('csv-summary-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('summary-succeeded-count')).toHaveTextContent('2');
    expect(screen.getByTestId('summary-duplicate-count')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-skipped-count')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-invalid-count')).toHaveTextContent('1');
  });
});