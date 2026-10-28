import type {
  CsvImportChunkRequest,
  CsvImportInitRequest,
  CsvImportJobStatusResponse,
} from '@/types/api';
import type {
  CsvImportJob,
  CsvImportRowState,
  Employee,
  EmployeeDepartment,
  EmployeeRoleTitle,
  EmployeeStatus,
} from '@/types/domain';
import { mockDb } from './db';
import { mockApiEngine } from './engine';
import { MockApiError } from './errors';

const VALID_DEPARTMENTS: ReadonlyArray<EmployeeDepartment> = [
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Finance',
  'Operations',
  'People',
  'Security',
];

const VALID_ROLES: ReadonlyArray<EmployeeRoleTitle> = [
  'Staff Engineer',
  'Senior Engineer',
  'Software Engineer',
  'Product Manager',
  'Product Designer',
  'Account Executive',
  'Financial Analyst',
  'Operations Lead',
  'HR Specialist',
  'Security Architect',
];

const VALID_STATUSES: ReadonlyArray<EmployeeStatus> = [
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'OFFBOARDED',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Tracks which jobIds have already triggered their one-time simulated partial network failure
const triggeredNetworkFailureJobs = new Set<string>();
// Tracks rows configured to fail once with a transient row-level error and succeed on retry
const transientRowFailureRegistry = new Set<string>();

export function resetCsvImportSimulationState(): void {
  triggeredNetworkFailureJobs.clear();
  transientRowFailureRegistry.clear();
}

export function computeJobSummary(job: CsvImportJob): CsvImportJobStatusResponse {
  let pendingCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let invalidCount = 0;
  let skippedExistingCount = 0;
  let duplicateInCsvCount = 0;

  for (const row of job.rows) {
    switch (row.processingStatus) {
      case 'PENDING':
        pendingCount += 1;
        break;
      case 'SUCCEEDED':
        succeededCount += 1;
        break;
      case 'FAILED':
        failedCount += 1;
        break;
      case 'INVALID':
        invalidCount += 1;
        break;
      case 'SKIPPED_EXISTING_IN_ORG':
        skippedExistingCount += 1;
        break;
      case 'SKIPPED_DUPLICATE_IN_CSV':
        duplicateInCsvCount += 1;
        break;
    }
  }

  const processedCount = job.totalRows - pendingCount;
  const isComplete = pendingCount === 0 && job.state !== 'CANCELLED';

  return {
    job,
    pendingCount,
    succeededCount,
    failedCount,
    invalidCount,
    skippedExistingCount,
    duplicateInCsvCount,
    processedCount,
    isComplete,
  };
}

export const mockCsvImportApi = {
  async initImportJob(
    request: CsvImportInitRequest,
    signal?: AbortSignal
  ): Promise<CsvImportJobStatusResponse> {
    return mockApiEngine.execute({
      endpoint: 'csv.initJob',
      signal,
      customDelayMs: 10,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:import_csv',
          request.organizationId
        );

        if (request.rows.length === 0) {
          throw new MockApiError({
            status: 422,
            code: 'VALIDATION_ERROR',
            message: 'CSV file contains 0 data rows.',
          });
        }

        if (request.rows.length > 10000) {
          throw new MockApiError({
            status: 422,
            code: 'VALIDATION_ERROR',
            message: `CSV contains ${request.rows.length.toLocaleString()} rows, exceeding the maximum allowed 10,000 rows per import.`,
          });
        }

        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const seenEmailsInCsv = new Set<string>();

        const initializedRows: CsvImportRowState[] = request.rows.map((raw) => {
          const emailNormalized = String(raw.email ?? '')
            .trim()
            .toLowerCase();
          const firstName = String(raw.firstName ?? '').trim();
          const lastName = String(raw.lastName ?? '').trim();
          const parsedSalary = Number(raw.salaryUsd);
          const salaryUsd = Number.isFinite(parsedSalary) ? Math.round(parsedSalary) : NaN;
          const hireDate = String(raw.hireDate ?? '').trim() || '2026-01-15';

          const rawDept = String(raw.department ?? '').trim();
          const department: EmployeeDepartment = VALID_DEPARTMENTS.includes(
            rawDept as EmployeeDepartment
          )
            ? (rawDept as EmployeeDepartment)
            : 'Engineering';

          const rawRole = String(raw.roleTitle ?? '').trim();
          const roleTitle: EmployeeRoleTitle = VALID_ROLES.includes(rawRole as EmployeeRoleTitle)
            ? (rawRole as EmployeeRoleTitle)
            : 'Software Engineer';

          const rawStatus = String(raw.status ?? '')
            .trim()
            .toUpperCase();
          const status: EmployeeStatus = VALID_STATUSES.includes(rawStatus as EmployeeStatus)
            ? (rawStatus as EmployeeStatus)
            : 'ACTIVE';

          const idempotencyKey = `csv_${session.activeOrganizationId}_${
            emailNormalized || `row_${raw.rowNumber}`
          }`;

          if (raw.forceRowFailureOnce) {
            transientRowFailureRegistry.add(`${jobId}:${raw.rowNumber}`);
          }

          let processingStatus: CsvImportRowState['processingStatus'] = 'PENDING';
          let errorMessage: string | undefined;

          const validationErrors: string[] = [];
          if (firstName.length < 2) {
            validationErrors.push('First name must be at least 2 characters');
          }
          if (lastName.length < 2) {
            validationErrors.push('Last name must be at least 2 characters');
          }
          if (!EMAIL_REGEX.test(emailNormalized)) {
            validationErrors.push('Invalid email format');
          }
          if (!Number.isFinite(salaryUsd) || salaryUsd < 30000 || salaryUsd > 1000000) {
            validationErrors.push('Salary must be between $30,000 and $1,000,000');
          }
          if (!DATE_REGEX.test(hireDate)) {
            validationErrors.push('Hire date must be YYYY-MM-DD');
          }

          if (validationErrors.length > 0) {
            processingStatus = 'INVALID';
            errorMessage = validationErrors.join('; ');
          } else if (seenEmailsInCsv.has(emailNormalized)) {
            processingStatus = 'SKIPPED_DUPLICATE_IN_CSV';
            errorMessage = 'Duplicate email address within the same CSV file.';
          } else {
            seenEmailsInCsv.add(emailNormalized);
            const existingInOrg = mockDb.findEmployeeByEmailInOrg(
              session.activeOrganizationId,
              emailNormalized
            );
            if (existingInOrg) {
              processingStatus = 'SKIPPED_EXISTING_IN_ORG';
              errorMessage = `Email already belongs to employee ${existingInOrg.id} in ${session.activeOrganizationId}.`;
            }
          }

          return {
            rowNumber: raw.rowNumber,
            idempotencyKey,
            rawEmail: String(raw.email ?? '').trim(),
            firstName,
            lastName,
            department,
            roleTitle,
            status,
            salaryUsd: Number.isFinite(salaryUsd) ? salaryUsd : 0,
            hireDate,
            processingStatus,
            errorMessage,
          };
        });

        const hasPending = initializedRows.some((r) => r.processingStatus === 'PENDING');
        const job: CsvImportJob = {
          jobId,
          organizationId: session.activeOrganizationId,
          createdByUserId: session.user.id,
          fileName: request.fileName,
          totalRows: initializedRows.length,
          state: hasPending ? 'IN_PROGRESS' : 'COMPLETED',
          createdAt: new Date().toISOString(),
          rows: initializedRows,
        };

        mockDb.setCsvImportJob(job);
        return computeJobSummary(job);
      },
    });
  },

  async processChunk(
    request: CsvImportChunkRequest,
    signal?: AbortSignal
  ): Promise<CsvImportJobStatusResponse> {
    return mockApiEngine.execute({
      endpoint: 'csv.processChunk',
      signal,
      customDelayMs: 5,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:import_csv',
          request.organizationId
        );

        const job = mockDb.getCsvImportJob(request.jobId);
        if (!job) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: `CSV import job "${request.jobId}" not found.`,
          });
        }

        if (job.organizationId !== session.activeOrganizationId) {
          throw new MockApiError({
            status: 403,
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Tenant mismatch for CSV import job.',
          });
        }

        const startIndex = Math.max(0, request.startIndex);
        const batchSize = Math.max(1, request.batchSize);
        const endIndex = Math.min(job.rows.length, startIndex + batchSize);

        const updatedRows = [...job.rows];
        const newlyCreatedEmployees: Employee[] = [];
        let shouldThrowSimulatedNetworkFailure = false;
        let simulatedFailureBoundaryRow = 0;

        for (let i = startIndex; i < endIndex; i++) {
          const row = updatedRows[i];
          if (!row) continue;

          // Authoritative Idempotency Guarantee:
          // Never re-process SUCCEEDED, INVALID, or SKIPPED rows.
          // Only process PENDING rows (or FAILED rows when retryFailedRows === true).
          const isEligible =
            row.processingStatus === 'PENDING' ||
            (Boolean(request.retryFailedRows) && row.processingStatus === 'FAILED');

          if (!isEligible) {
            continue;
          }

          // Check if this specific row is armed for a transient row-level failure once
          const transientKey = `${job.jobId}:${row.rowNumber}`;
          if (transientRowFailureRegistry.has(transientKey)) {
            transientRowFailureRegistry.delete(transientKey);
            updatedRows[i] = {
              ...row,
              processingStatus: 'FAILED',
              errorMessage: `Transient database write error on row ${row.rowNumber}. Eligible for retry.`,
            };
            continue;
          }

          // Check server-side idempotency registry first
          const previouslyCreated = mockDb.getIdempotentResult<Employee>(row.idempotencyKey);
          if (previouslyCreated) {
            updatedRows[i] = {
              ...row,
              processingStatus: 'SUCCEEDED',
              createdEmployeeId: previouslyCreated.id,
              errorMessage: undefined,
            };
          } else {
            const existingInOrg = mockDb.findEmployeeByEmailInOrg(
              session.activeOrganizationId,
              row.rawEmail
            );
            if (existingInOrg) {
              updatedRows[i] = {
                ...row,
                processingStatus: 'SKIPPED_EXISTING_IN_ORG',
                errorMessage: `Email already exists in organization (${existingInOrg.id}).`,
              };
            } else {
              const newEmployee: Employee = {
                id: mockDb.generateNextEmployeeId(),
                organizationId: session.activeOrganizationId,
                firstName: row.firstName,
                lastName: row.lastName,
                fullName: `${row.firstName} ${row.lastName}`,
                email: row.rawEmail.trim().toLowerCase(),
                department: row.department,
                roleTitle: row.roleTitle,
                status: row.status,
                salaryUsd: row.salaryUsd,
                hireDate: row.hireDate,
                updatedAt: new Date().toISOString(),
                version: 1,
              };

              newlyCreatedEmployees.push(newEmployee);
              mockDb.setIdempotentResult(row.idempotencyKey, newEmployee);

              updatedRows[i] = {
                ...row,
                processingStatus: 'SUCCEEDED',
                createdEmployeeId: newEmployee.id,
                errorMessage: undefined,
              };
            }
          }

          // Critical Recovery Scenario:
          // If `simulateNetworkFailureAfterRow` (e.g. 7000) is reached and hasn't fired yet for this job,
          // commit all rows up through 7000 and throw a network error halting the batch!
          if (
            request.simulateNetworkFailureAfterRow !== undefined &&
            row.rowNumber === request.simulateNetworkFailureAfterRow &&
            !triggeredNetworkFailureJobs.has(job.jobId)
          ) {
            triggeredNetworkFailureJobs.add(job.jobId);
            shouldThrowSimulatedNetworkFailure = true;
            simulatedFailureBoundaryRow = row.rowNumber;
            break;
          }
        }

        // Persist all newly created employees in a single O(N) bulk operation
        if (newlyCreatedEmployees.length > 0) {
          mockDb.setEmployeesBulk(newlyCreatedEmployees);
        }

        const stillHasPending = updatedRows.some((r) => r.processingStatus === 'PENDING');
        const hasFailures = updatedRows.some((r) => r.processingStatus === 'FAILED');

        const updatedJob: CsvImportJob = {
          ...job,
          state: shouldThrowSimulatedNetworkFailure
            ? 'PARTIAL_FAILURE'
            : stillHasPending
              ? 'IN_PROGRESS'
              : hasFailures
                ? 'PARTIAL_FAILURE'
                : 'COMPLETED',
          rows: updatedRows,
        };

        mockDb.setCsvImportJob(updatedJob);

        if (shouldThrowSimulatedNetworkFailure) {
          throw new MockApiError({
            status: 503,
            code: 'NETWORK_OFFLINE',
            message: `Simulated network drop after committing ${simulatedFailureBoundaryRow.toLocaleString()} of ${job.totalRows.toLocaleString()} rows. Click "Retry / Resume Import" to process the remaining ${(
              job.totalRows - simulatedFailureBoundaryRow
            ).toLocaleString()} rows without duplicating the first ${simulatedFailureBoundaryRow.toLocaleString()} records.`,
          });
        }

        return computeJobSummary(updatedJob);
      },
    });
  },

  async cancelJob(params: {
    readonly token: string | null | undefined;
    readonly organizationId: string;
    readonly jobId: string;
  }): Promise<CsvImportJobStatusResponse> {
    return mockApiEngine.execute({
      endpoint: 'csv.cancelJob',
      customDelayMs: 5,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          params.token,
          'employee:import_csv',
          params.organizationId
        );

        const job = mockDb.getCsvImportJob(params.jobId);
        if (!job) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: `Job "${params.jobId}" not found.`,
          });
        }

        if (job.organizationId !== session.activeOrganizationId) {
          throw new MockApiError({
            status: 403,
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied for CSV import job.',
          });
        }

        const cancelledJob: CsvImportJob = {
          ...job,
          state: 'CANCELLED',
        };
        mockDb.setCsvImportJob(cancelledJob);
        return computeJobSummary(cancelledJob);
      },
    });
  },

  async getJobStatus(
    params: {
      readonly token: string | null | undefined;
      readonly organizationId: string;
      readonly jobId: string;
    },
    signal?: AbortSignal
  ): Promise<CsvImportJobStatusResponse> {
    return mockApiEngine.execute({
      endpoint: 'csv.getJobStatus',
      signal,
      customDelayMs: 5,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          params.token,
          'employee:import_csv',
          params.organizationId
        );

        const job = mockDb.getCsvImportJob(params.jobId);
        if (!job) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: `Job "${params.jobId}" not found.`,
          });
        }

        if (job.organizationId !== session.activeOrganizationId) {
          throw new MockApiError({
            status: 403,
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied for CSV import job.',
          });
        }

        return computeJobSummary(job);
      },
    });
  },
};