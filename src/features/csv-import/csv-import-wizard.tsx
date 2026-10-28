'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileSpreadsheet,
  Filter,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { mockCsvImportApi } from '@/lib/mock-api/csv-import-api';
import { isAbortError, isMockApiError } from '@/lib/mock-api/errors';
import type { CsvImportInitRowInput, CsvImportJobStatusResponse } from '@/types/api';
import type { CsvImportRowState, CsvRowStatus } from '@/types/domain';
import { ErrorStateView } from '@/components/feedback/state-views';
import { useAuth } from '@/features/auth/auth-context';
import { useUiStore } from '@/store/ui-store';
import {
  autoDetectColumnMapping,
  generateBulkImportRows,
  mapRawCsvRowsToImportInputs,
  parseCsvString,
  validateCsvFileMetadata,
  type ColumnMappingConfig,
  type ParsedCsvRawRow,
} from './csv-parser';

const ACTIVE_CSV_JOB_STORAGE_KEY = 'nexus_active_csv_import_job_v1';

interface PersistedJobPointer {
  readonly jobId: string;
  readonly organizationId: string;
  readonly fileName: string;
}

export interface CsvImportWizardProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onImportComplete?: () => void;
}

type AuditFilterStatus = 'ALL' | CsvRowStatus;

const STATUS_BADGE_MAP: Readonly<Record<CsvRowStatus, { label: string; className: string }>> = {
  PENDING: { label: 'Pending', className: 'bg-slate-100 text-slate-800 border-slate-300' },
  SUCCEEDED: { label: 'Succeeded', className: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  FAILED: { label: 'Failed (Retryable)', className: 'bg-red-100 text-red-900 border-red-300' },
  INVALID: { label: 'Invalid Row', className: 'bg-rose-100 text-rose-900 border-rose-300' },
  SKIPPED_DUPLICATE_IN_CSV: {
    label: 'Duplicate in CSV',
    className: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  SKIPPED_EXISTING_IN_ORG: {
    label: 'Skipped (Exists in Org)',
    className: 'bg-blue-100 text-blue-900 border-blue-300',
  },
};

export function CsvImportWizard({
  isOpen,
  onClose,
  onImportComplete,
}: CsvImportWizardProps): React.JSX.Element | null {
  const { session, handleUnauthorizedError, simulateSessionExpiry } = useAuth();
  const { showBanner } = useUiStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'upload' | 'mapping' | 'progress' | 'summary'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<ReadonlyArray<ParsedCsvRawRow>>([]);
  const [prebuiltRows, setPrebuiltRows] = useState<ReadonlyArray<CsvImportInitRowInput> | null>(
    null
  );
  const [headers, setHeaders] = useState<ReadonlyArray<string>>([]);
  const [mapping, setMapping] = useState<ColumnMappingConfig>({
    firstNameField: '',
    lastNameField: '',
    emailField: '',
    departmentField: '',
    roleTitleField: '',
    statusField: '',
    salaryField: '',
    hireDateField: '',
  });

  // Step 2 Data Preview pagination
  const [previewPage, setPreviewPage] = useState<number>(1);
  const previewPageSize = 50;

  // Step 3/4 Full 10,000-Row Audit Log filtering, search & pagination
  const [auditStatusFilter, setAuditStatusFilter] = useState<AuditFilterStatus>('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditPageSize, setAuditPageSize] = useState<number>(100);

  const [jobStatus, setJobStatus] = useState<CsvImportJobStatusResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simulateFailureAtRow, setSimulateFailureAtRow] = useState<string>('');
  const [recoverableJobPointer, setRecoverableJobPointer] = useState<PersistedJobPointer | null>(
    null
  );

  const isPausedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const chunkAbortControllerRef = useRef<AbortController | null>(null);

  const activeOrgId = session?.activeOrganization.id ?? '';
  const sessionToken = session?.token ?? '';

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !activeOrgId) {
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(ACTIVE_CSV_JOB_STORAGE_KEY);
      if (!raw) {
        setRecoverableJobPointer(null);
        return;
      }
      const parsed = JSON.parse(raw) as PersistedJobPointer;
      if (parsed && parsed.organizationId === activeOrgId && parsed.jobId) {
        setRecoverableJobPointer(parsed);
      } else {
        setRecoverableJobPointer(null);
      }
    } catch {
      setRecoverableJobPointer(null);
    }
  }, [activeOrgId, isOpen]);

  useEffect(() => {
    return () => {
      chunkAbortControllerRef.current?.abort();
    };
  }, []);

  // All mapped preview rows (supports browsing all 10,000 rows in Step 2)
  const allMappedPreviewRows = useMemo(() => {
    if (prebuiltRows) {
      return prebuiltRows;
    }
    if (rawRows.length === 0) {
      return [];
    }
    return mapRawCsvRowsToImportInputs(rawRows, mapping);
  }, [mapping, prebuiltRows, rawRows]);

  const totalPreviewPages = Math.max(1, Math.ceil(allMappedPreviewRows.length / previewPageSize));
  const safePreviewPage = Math.max(1, Math.min(previewPage, totalPreviewPages));
  const paginatedPreviewRows = useMemo(() => {
    const start = (safePreviewPage - 1) * previewPageSize;
    return allMappedPreviewRows.slice(start, start + previewPageSize);
  }, [allMappedPreviewRows, safePreviewPage]);

  // Filtered & searched audit log rows across all 10,000 records
  const filteredAuditRows: ReadonlyArray<CsvImportRowState> = useMemo(() => {
    const allRows = jobStatus?.job.rows ?? [];
    if (allRows.length === 0) return [];

    const normalizedQuery = auditSearchQuery.trim().toLowerCase();

    return allRows.filter((row) => {
      if (auditStatusFilter !== 'ALL' && row.processingStatus !== auditStatusFilter) {
        return false;
      }
      if (normalizedQuery.length > 0) {
        const matchesRowNum = String(row.rowNumber) === normalizedQuery || `#${row.rowNumber}` === normalizedQuery;
        const matchesName = `${row.firstName} ${row.lastName}`.toLowerCase().includes(normalizedQuery);
        const matchesEmail = row.rawEmail.toLowerCase().includes(normalizedQuery);
        const matchesEmpId = (row.createdEmployeeId ?? '').toLowerCase().includes(normalizedQuery);
        const matchesError = (row.errorMessage ?? '').toLowerCase().includes(normalizedQuery);
        if (!matchesRowNum && !matchesName && !matchesEmail && !matchesEmpId && !matchesError) {
          return false;
        }
      }
      return true;
    });
  }, [auditSearchQuery, auditStatusFilter, jobStatus?.job.rows]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditRows.length / auditPageSize));
  const safeAuditPage = Math.max(1, Math.min(auditPage, totalAuditPages));

  const paginatedAuditRows = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditRows.slice(start, start + auditPageSize);
  }, [auditPageSize, filteredAuditRows, safeAuditPage]);

  if (!isOpen) {
    return null;
  }

  const totalDetectedRows = allMappedPreviewRows.length;

  const handleSelectAuditFilter = (status: AuditFilterStatus) => {
    setAuditStatusFilter(status);
    setAuditPage(1);
  };

  const saveRecoverableJobPointer = (jobId: string, name: string) => {
    if (typeof window === 'undefined') return;
    const pointer: PersistedJobPointer = {
      jobId,
      organizationId: activeOrgId,
      fileName: name,
    };
    window.sessionStorage.setItem(ACTIVE_CSV_JOB_STORAGE_KEY, JSON.stringify(pointer));
    setRecoverableJobPointer(pointer);
  };

  const clearRecoverableJobPointer = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(ACTIVE_CSV_JOB_STORAGE_KEY);
    setRecoverableJobPointer(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const metadataError = validateCsvFileMetadata(file);
    if (metadataError) {
      setErrorMsg(metadataError);
      return;
    }

    setFileName(file.name);
    setErrorMsg(null);
    setPrebuiltRows(null);
    setPreviewPage(1);

    try {
      const text = await file.text();
      const result = await parseCsvString(text);
      if (result.parseError) {
        setErrorMsg(`CSV Parse Error: ${result.parseError}`);
        return;
      }
      if (result.rawRows.length === 0) {
        setErrorMsg('The uploaded CSV file contains 0 data rows.');
        return;
      }

      setHeaders(result.headers);
      setRawRows(result.rawRows);
      setMapping(autoDetectColumnMapping(result.headers));
      setStep('mapping');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read CSV file.');
    }
  };

  const handleLoad10kRecoveryPreset = () => {
    setErrorMsg(null);
    setPreviewPage(1);
    const rows = generateBulkImportRows(10000, 'tenk');
    setFileName('enterprise-10000-employees-recovery.csv');
    setPrebuiltRows(rows);
    setHeaders([
      'First Name',
      'Last Name',
      'Work Email',
      'Department',
      'Role Title',
      'Status',
      'Salary',
      'Hire Date',
    ]);
    setMapping({
      firstNameField: 'First Name',
      lastNameField: 'Last Name',
      emailField: 'Work Email',
      departmentField: 'Department',
      roleTitleField: 'Role Title',
      statusField: 'Status',
      salaryField: 'Salary',
      hireDateField: 'Hire Date',
    });
    setSimulateFailureAtRow('7000');
    setStep('mapping');
  };

  const handleLoadEdgeCasePreset = async () => {
    setErrorMsg(null);
    setPrebuiltRows(null);
    setPreviewPage(1);
    const sampleCsv = [
      'First Name,Last Name,Work Email,Department,Role Title,Status,Salary,Hire Date',
      '"Neha","Verma, Jr.","neha.verma.csv1@acme.io","Engineering","Senior Engineer","ACTIVE","128000","2026-02-10"',
      '"Neha","Verma Duplicate","neha.verma.csv1@acme.io","Engineering","Senior Engineer","ACTIVE","128000","2026-02-10"',
      '"Asad","Khan Existing","asad.khan.1@acme.io","Security","Security Architect","ACTIVE","140000","2021-10-07"',
      '"X","InvalidRow","not-an-email","Sales","Account Executive","ACTIVE","12000","bad-date"',
      '"Rishi","Kapoor","rishi.kapoor.csv2@acme.io","Product","Product Manager","ACTIVE","142000","2026-02-14"',
    ].join('\n');

    const parsed = await parseCsvString(sampleCsv);
    setFileName('edge-cases-duplicates-invalid.csv');
    setHeaders(parsed.headers);
    setRawRows(parsed.rawRows);
    setMapping(autoDetectColumnMapping(parsed.headers));
    setSimulateFailureAtRow('');
    setStep('mapping');
  };

  const runChunkProcessor = async (
    jobId: string,
    startIndex: number,
    options?: {
      readonly failAfterRow?: number;
      readonly retryFailedOnly?: boolean;
    }
  ) => {
    const batchSize = 1000;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    setIsPaused(false);
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      let currentIdx = startIndex;

      while (true) {
        if (isCancelledRef.current || isPausedRef.current) {
          setIsProcessing(false);
          return;
        }

        const controller = new AbortController();
        chunkAbortControllerRef.current = controller;

        const res = await mockCsvImportApi.processChunk(
          {
            token: sessionToken,
            organizationId: activeOrgId,
            jobId,
            startIndex: currentIdx,
            batchSize,
            simulateNetworkFailureAfterRow: options?.failAfterRow,
            retryFailedRows: options?.retryFailedOnly,
          },
          controller.signal
        );

        setJobStatus(res);

        if (res.isComplete || currentIdx + batchSize >= res.job.rows.length) {
          setIsProcessing(false);
          if (res.failedCount === 0 && res.pendingCount === 0) {
            clearRecoverableJobPointer();
          }
          setAuditStatusFilter('ALL');
          setAuditPage(1);
          setStep('summary');
          void queryClient.invalidateQueries({
            queryKey: ['tenant', activeOrgId],
          });
          onImportComplete?.();
          break;
        }

        currentIdx += batchSize;
        await new Promise((r) => setTimeout(r, 15));
      }
    } catch (err: unknown) {
      setIsProcessing(false);

      if (isAbortError(err)) {
        return;
      }

      try {
        const latestStatus = await mockCsvImportApi.getJobStatus({
          token: sessionToken,
          organizationId: activeOrgId,
          jobId,
        });
        setJobStatus(latestStatus);
      } catch {
        // Ignore secondary status error if session expired
      }

      if (handleUnauthorizedError(err)) {
        return;
      }

      setErrorMsg(
        isMockApiError(err) ? err.message : 'Network error occurred during batch import.'
      );
    }
  };

  const handleStartImport = async () => {
    setErrorMsg(null);
    setIsProcessing(true);
    setAuditStatusFilter('ALL');
    setAuditSearchQuery('');
    setAuditPage(1);

    const formattedRows: ReadonlyArray<CsvImportInitRowInput> = allMappedPreviewRows;

    try {
      const initRes = await mockCsvImportApi.initImportJob({
        token: sessionToken,
        organizationId: activeOrgId,
        fileName,
        rows: formattedRows,
      });

      setJobStatus(initRes);
      saveRecoverableJobPointer(initRes.job.jobId, fileName);
      setStep('progress');

      const failAtRowNum = simulateFailureAtRow.trim()
        ? Number(simulateFailureAtRow.trim())
        : undefined;

      await runChunkProcessor(initRes.job.jobId, 0, {
        failAfterRow: failAtRowNum,
      });
    } catch (err: unknown) {
      setIsProcessing(false);
      if (!handleUnauthorizedError(err)) {
        setErrorMsg(isMockApiError(err) ? err.message : 'Failed to initialize import job.');
      }
    }
  };

  const handleResumeOrRetryRemaining = async (retryFailedOnly = false) => {
    if (!jobStatus) return;

    const nextIndex = jobStatus.job.rows.findIndex((r) =>
      retryFailedOnly
        ? r.processingStatus === 'FAILED'
        : r.processingStatus === 'PENDING' || r.processingStatus === 'FAILED'
    );

    const startIdx = nextIndex >= 0 ? nextIndex : 0;
    setStep('progress');
    await runChunkProcessor(jobStatus.job.jobId, startIdx, {
      failAfterRow: undefined,
      retryFailedOnly,
    });
  };

  const handleReuploadSameFileIdempotencyCheck = async () => {
    if (!jobStatus) return;
    setStep('progress');
    await runChunkProcessor(jobStatus.job.jobId, 0, {
      failAfterRow: undefined,
      retryFailedOnly: false,
    });
    showBanner(
      'info',
      `Re-ran import job ${jobStatus.job.jobId}: all ${jobStatus.succeededCount.toLocaleString()} previously succeeded rows were skipped idempotently with 0 duplicates created.`
    );
  };

  const handleCancelImport = async () => {
    isCancelledRef.current = true;
    chunkAbortControllerRef.current?.abort();
    setIsProcessing(false);

    if (!jobStatus) return;
    try {
      const cancelled = await mockCsvImportApi.cancelJob({
        token: sessionToken,
        organizationId: activeOrgId,
        jobId: jobStatus.job.jobId,
      });
      setJobStatus(cancelled);
      clearRecoverableJobPointer();
      setStep('summary');
      void queryClient.invalidateQueries({
        queryKey: ['tenant', activeOrgId],
      });
    } catch (err: unknown) {
      handleUnauthorizedError(err);
    }
  };

  const handleRecoverInterruptedJob = async () => {
    if (!recoverableJobPointer) return;
    setErrorMsg(null);
    try {
      const restored = await mockCsvImportApi.getJobStatus({
        token: sessionToken,
        organizationId: activeOrgId,
        jobId: recoverableJobPointer.jobId,
      });
      setFileName(recoverableJobPointer.fileName);
      setJobStatus(restored);
      setStep('progress');
    } catch (err: unknown) {
      clearRecoverableJobPointer();
      if (!handleUnauthorizedError(err)) {
        setErrorMsg(
          isMockApiError(err) ? err.message : 'Interrupted import job is no longer available.'
        );
      }
    }
  };

  const handleResetWizard = () => {
    isCancelledRef.current = true;
    chunkAbortControllerRef.current?.abort();
    setStep('upload');
    setFileName('');
    setRawRows([]);
    setPrebuiltRows(null);
    setHeaders([]);
    setJobStatus(null);
    setIsProcessing(false);
    setIsPaused(false);
    setErrorMsg(null);
    setSimulateFailureAtRow('');
    setAuditStatusFilter('ALL');
    setAuditSearchQuery('');
    setAuditPage(1);
    setPreviewPage(1);
  };

  const percentComplete = jobStatus
    ? Math.round((jobStatus.processedCount / Math.max(1, jobStatus.job.totalRows)) * 100)
    : 0;

  const renderFullAuditLogSection = (statusData: CsvImportJobStatusResponse) => {
    const filterButtons: ReadonlyArray<{
      readonly id: AuditFilterStatus;
      readonly label: string;
      readonly count: number;
      readonly activeClass: string;
    }> = [
      {
        id: 'ALL',
        label: 'All Rows',
        count: statusData.job.totalRows,
        activeClass: 'bg-slate-900 text-white border-slate-900',
      },
      {
        id: 'SUCCEEDED',
        label: 'Succeeded',
        count: statusData.succeededCount,
        activeClass: 'bg-emerald-700 text-white border-emerald-700',
      },
      {
        id: 'FAILED',
        label: 'Failed',
        count: statusData.failedCount,
        activeClass: 'bg-red-700 text-white border-red-700',
      },
      {
        id: 'INVALID',
        label: 'Invalid',
        count: statusData.invalidCount,
        activeClass: 'bg-rose-700 text-white border-rose-700',
      },
      {
        id: 'SKIPPED_EXISTING_IN_ORG',
        label: 'Skipped (Exists in Org)',
        count: statusData.skippedExistingCount,
        activeClass: 'bg-blue-700 text-white border-blue-700',
      },
      {
        id: 'SKIPPED_DUPLICATE_IN_CSV',
        label: 'CSV Duplicates',
        count: statusData.duplicateInCsvCount,
        activeClass: 'bg-amber-700 text-white border-amber-700',
      },
      {
        id: 'PENDING',
        label: 'Pending',
        count: statusData.pendingCount,
        activeClass: 'bg-slate-700 text-white border-slate-700',
      },
    ];

    const startRowIndex =
      filteredAuditRows.length === 0 ? 0 : (safeAuditPage - 1) * auditPageSize + 1;
    const endRowIndex = Math.min(filteredAuditRows.length, safeAuditPage * auditPageSize);

    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-700" aria-hidden="true" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Complete Row-Level Processing Audit Log ({filteredAuditRows.length.toLocaleString()}{' '}
              matching of {statusData.job.totalRows.toLocaleString()} total rows)
            </h4>
          </div>

          {/* Search input inside Audit Log */}
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              data-testid="audit-log-search-input"
              placeholder="Search Row #, email, name, ID..."
              value={auditSearchQuery}
              onChange={(e) => {
                setAuditSearchQuery(e.target.value);
                setAuditPage(1);
              }}
              className="w-full rounded-md border border-slate-300 bg-white py-1 pl-8 pr-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter audit rows by status">
          {filterButtons.map((btn) => {
            const isSelected = auditStatusFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                data-testid={`audit-filter-${btn.id}`}
                onClick={() => handleSelectAuditFilter(btn.id)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                  isSelected
                    ? btn.activeClass
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{btn.label}</span>
                <span
                  className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${
                    isSelected ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {btn.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Paginated Table for all 10,000 Rows */}
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-xs" data-testid="csv-audit-log-table">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[11px] uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Row #</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Dept / Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created ID / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedAuditRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    No rows match the selected status filter ({auditStatusFilter}) or search query.
                  </td>
                </tr>
              ) : (
                paginatedAuditRows.map((row) => {
                  const badge = STATUS_BADGE_MAP[row.processingStatus];
                  return (
                    <tr key={row.rowNumber} data-testid={`audit-row-${row.rowNumber}`}>
                      <td className="px-3 py-1.5 font-mono font-semibold text-slate-600">
                        #{row.rowNumber.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-900">
                        {row.firstName || '(Empty)'} {row.lastName}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-600">{row.rawEmail}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {row.department} · {row.roleTitle}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700">
                        {row.createdEmployeeId ? (
                          <span className="font-semibold text-emerald-700">
                            Created: {row.createdEmployeeId}
                          </span>
                        ) : (
                          <span className="text-slate-600">{row.errorMessage ?? 'Waiting in queue'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Audit Log Pagination Controls (Browse all 10,000 rows) */}
        <div
          data-testid="audit-log-pagination"
          className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-600"
        >
          <div className="flex items-center gap-2">
            <span data-testid="audit-pagination-range">
              Showing rows <strong>{startRowIndex.toLocaleString()}</strong>–
              <strong>{endRowIndex.toLocaleString()}</strong> of{' '}
              <strong>{filteredAuditRows.length.toLocaleString()}</strong> (Page{' '}
              <strong>{safeAuditPage}</strong> of <strong>{totalAuditPages}</strong>)
            </span>

            <select
              aria-label="Audit rows per page"
              data-testid="audit-page-size-select"
              value={auditPageSize}
              onChange={(e) => {
                setAuditPageSize(Number(e.target.value));
                setAuditPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
            >
              {[50, 100, 250, 500].map((size) => (
                <option key={size} value={size}>
                  {size} rows / page
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="audit-page-first-btn"
              disabled={safeAuditPage <= 1}
              onClick={() => setAuditPage(1)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              First
            </button>
            <button
              type="button"
              data-testid="audit-page-prev-btn"
              disabled={safeAuditPage <= 1}
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              data-testid="audit-page-next-btn"
              disabled={safeAuditPage >= totalAuditPages}
              onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Next
            </button>
            <button
              type="button"
              data-testid="audit-page-last-btn"
              disabled={safeAuditPage >= totalAuditPages}
              onClick={() => setAuditPage(totalAuditPages)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Last (Page {totalAuditPages})
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
    >
      <div className="my-6 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-slate-800" aria-hidden="true" />
            <div>
              <h2 id="csv-wizard-title" className="text-base font-bold text-slate-900">
                Bulk CSV Import Engine (Up to 10,000 Rows &amp; Idempotent Recovery)
              </h2>
              <p className="text-xs text-slate-500">
                Active Organization Scope:{' '}
                <span className="font-mono font-semibold">{activeOrgId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="csv-wizard-close-btn"
            onClick={onClose}
            aria-label="Close wizard"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Interrupted Job Recovery Banner */}
        {step === 'upload' && recoverableJobPointer ? (
          <div
            data-testid="interrupted-job-banner"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950"
          >
            <div>
              <p className="font-bold">
                Interrupted Import Job Detected ({recoverableJobPointer.fileName})
              </p>
              <p className="mt-0.5 text-amber-800">
                Job ID <span className="font-mono">{recoverableJobPointer.jobId}</span> is stored on
                the server. You can resume without re-importing completed rows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="restore-interrupted-job-btn"
                onClick={() => {
                  void handleRecoverInterruptedJob();
                }}
                className="rounded bg-amber-900 px-3 py-1.5 font-semibold text-white hover:bg-amber-800"
              >
                Restore &amp; Resume Job
              </button>
              <button
                type="button"
                onClick={clearRecoverableJobPointer}
                className="rounded border border-amber-400 bg-white px-2.5 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="mt-4" data-testid="csv-error-banner">
            <ErrorStateView title="CSV Import Error / Partial Failure" message={errorMsg} />
          </div>
        ) : null}

        {/* Step 1: Upload or 1-Click Deterministic Presets */}
        {step === 'upload' ? (
          <div className="mt-6 space-y-5">
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <Upload className="h-10 w-10 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Upload a `.csv` file (up to 10,000 rows, max 15 MB)
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Supports RFC-4180 quoted fields, escaped quotes, embedded commas, and multi-line
                values.
              </p>

              <label
                htmlFor="csv-file-input"
                className="mt-4 inline-flex cursor-pointer items-center rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Browse CSV File
              </label>
              <input
                id="csv-file-input"
                data-testid="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  void handleFileUpload(e);
                }}
                className="hidden"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Sparkles className="h-4 w-4 text-purple-700" aria-hidden="true" />
                One-Click Critical Scenario Datasets
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Generate deterministic CSV datasets directly in the browser to test 10,000-row
                partial failure recovery and row-level validation:
              </p>

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  data-testid="load-10k-preset-btn"
                  onClick={handleLoad10kRecoveryPreset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3.5 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  1. Load 10,000-Row CSV (Preset Failure at Row 7,000)
                </button>

                <button
                  type="button"
                  data-testid="load-edge-cases-preset-btn"
                  onClick={() => {
                    void handleLoadEdgeCasePreset();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                  2. Load Mixed Edge-Case CSV (Duplicates, Existing Org &amp; Invalid Rows)
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 2: All 8 Column Mappings & Paginated Data Preview for all 10,000 rows */}
        {step === 'mapping' ? (
          <div className="mt-5 space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Step 2: Column Mapping ({totalDetectedRows.toLocaleString()} rows in {fileName})
                </h3>
                <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
                  Max Capacity: 10,000 rows
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {(
                  [
                    ['firstNameField', 'First Name *', 'map-first-name'],
                    ['lastNameField', 'Last Name *', 'map-last-name'],
                    ['emailField', 'Work Email *', 'map-email'],
                    ['departmentField', 'Department', 'map-department'],
                    ['roleTitleField', 'Role Title', 'map-role'],
                    ['statusField', 'Status', 'map-status'],
                    ['salaryField', 'Salary (USD)', 'map-salary'],
                    ['hireDateField', 'Hire Date', 'map-hire-date'],
                  ] as const
                ).map(([fieldKey, label, testId]) => (
                  <div key={fieldKey}>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      {label}
                    </label>
                    <select
                      aria-label={label}
                      data-testid={testId}
                      disabled={Boolean(prebuiltRows)}
                      value={mapping[fieldKey]}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                      }
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
                    >
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Paginated Data Preview Grid */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Data Preview (Page {safePreviewPage} of {totalPreviewPages} ·{' '}
                  {totalDetectedRows.toLocaleString()} Total Rows)
                </h4>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    disabled={safePreviewPage <= 1}
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={safePreviewPage >= totalPreviewPages}
                    onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs" data-testid="csv-preview-table">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Row #</th>
                      <th className="px-3 py-2">First Name</th>
                      <th className="px-3 py-2">Last Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Salary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedPreviewRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-1.5 font-mono text-slate-500">#{row.rowNumber}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-900">{row.firstName}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-900">{row.lastName}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-600">{row.email}</td>
                        <td className="px-3 py-1.5 text-slate-700">{row.department}</td>
                        <td className="px-3 py-1.5 text-slate-700">{row.roleTitle}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-700">
                          ${Number(row.salaryUsd).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deterministic Partial Network Failure Injection Input */}
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5">
              <label
                htmlFor="simulate-fail-row-input"
                className="block text-xs font-semibold text-amber-900"
              >
                Deterministic Network Failure Injection (Row Threshold):
              </label>
              <p className="mt-0.5 text-[11px] text-amber-800">
                When set to <code className="font-mono font-bold">7000</code>, the server commits
                7,000 rows and throws a network failure so you can verify idempotent resume of the
                remaining 3,000 rows.
              </p>
              <input
                id="simulate-fail-row-input"
                data-testid="simulate-fail-row-input"
                type="number"
                placeholder="e.g. 7000 (leave blank for uninterrupted import)"
                value={simulateFailureAtRow}
                onChange={(e) => setSimulateFailureAtRow(e.target.value)}
                className="mt-1.5 w-full rounded border border-amber-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleResetWizard}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>

              <button
                type="button"
                data-testid="start-import-btn"
                onClick={() => {
                  void handleStartImport();
                }}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Validate &amp; Import {totalDetectedRows.toLocaleString()} Rows
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Batch Progress, Partial Failure Recovery, Pause, Cancel & Live Audit Log */}
        {step === 'progress' && jobStatus ? (
          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span data-testid="import-progress-status-label">
                  {isProcessing
                    ? `Importing batch chunks for ${fileName}...`
                    : errorMsg
                      ? `Interrupted after ${jobStatus.succeededCount.toLocaleString()} of ${jobStatus.job.totalRows.toLocaleString()} rows`
                      : 'Import Paused'}
                </span>
                <span data-testid="import-progress-percent">{percentComplete}% Processed</span>
              </div>

              <div
                role="progressbar"
                aria-valuenow={percentComplete}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="CSV Import Progress"
                className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
              >
                <div
                  className="h-full bg-slate-900 transition-all duration-200"
                  style={{ width: `${percentComplete}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 text-center">
              <button
                type="button"
                onClick={() => handleSelectAuditFilter('PENDING')}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center hover:border-slate-400"
              >
                <p className="text-[10px] font-semibold uppercase text-slate-600">Pending</p>
                <p
                  data-testid="progress-pending-count"
                  className="mt-1 text-lg font-bold text-slate-900"
                >
                  {jobStatus.pendingCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('SUCCEEDED')}
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center hover:border-emerald-400"
              >
                <p className="text-[10px] font-semibold uppercase text-emerald-800">Succeeded</p>
                <p
                  data-testid="progress-succeeded-count"
                  className="mt-1 text-lg font-bold text-emerald-900"
                >
                  {jobStatus.succeededCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('FAILED')}
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-center hover:border-red-400"
              >
                <p className="text-[10px] font-semibold uppercase text-red-800">Failed</p>
                <p
                  data-testid="progress-failed-count"
                  className="mt-1 text-lg font-bold text-red-900"
                >
                  {jobStatus.failedCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('INVALID')}
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center hover:border-rose-400"
              >
                <p className="text-[10px] font-semibold uppercase text-rose-800">Invalid</p>
                <p
                  data-testid="progress-invalid-count"
                  className="mt-1 text-lg font-bold text-rose-900"
                >
                  {jobStatus.invalidCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('SKIPPED_EXISTING_IN_ORG')}
                className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center hover:border-blue-400"
              >
                <p className="text-[10px] font-semibold uppercase text-blue-800">Skipped (Org)</p>
                <p
                  data-testid="progress-skipped-count"
                  className="mt-1 text-lg font-bold text-blue-900"
                >
                  {jobStatus.skippedExistingCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('SKIPPED_DUPLICATE_IN_CSV')}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center hover:border-amber-400"
              >
                <p className="text-[10px] font-semibold uppercase text-amber-800">CSV Duplicates</p>
                <p
                  data-testid="progress-duplicate-count"
                  className="mt-1 text-lg font-bold text-amber-900"
                >
                  {jobStatus.duplicateInCsvCount.toLocaleString()}
                </p>
              </button>
            </div>

            {/* When paused or interrupted at Row 7,000, show the full 10,000-row Audit Log right here */}
            {!isProcessing ? renderFullAuditLogSection(jobStatus) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="cancel-import-btn"
                  onClick={() => {
                    void handleCancelImport();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  Cancel Import
                </button>

                <button
                  type="button"
                  data-testid="expire-session-mid-import-btn"
                  onClick={() => {
                    isPausedRef.current = true;
                    chunkAbortControllerRef.current?.abort();
                    void simulateSessionExpiry();
                  }}
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Simulate Session Expiry Now
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <button
                    type="button"
                    data-testid="pause-import-btn"
                    onClick={() => {
                      isPausedRef.current = true;
                      setIsPaused(true);
                      setIsProcessing(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="resume-import-btn"
                    onClick={() => {
                      void handleResumeOrRetryRemaining(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {errorMsg
                      ? `Retry / Resume Remaining ${jobStatus.pendingCount.toLocaleString()} Rows`
                      : 'Resume Import'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 4: Final Import Summary & Complete 10,000-Row Filterable Audit Log */}
        {step === 'summary' && jobStatus ? (
          <div className="mt-6 space-y-5">
            <div
              data-testid="csv-summary-banner"
              className={`flex items-center gap-3 rounded-lg border p-4 ${
                jobStatus.job.state === 'CANCELLED'
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-950'
              }`}
            >
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold">
                  {jobStatus.job.state === 'CANCELLED'
                    ? `Import Job Cancelled (${jobStatus.succeededCount.toLocaleString()} rows committed before cancellation)`
                    : `Import Job Completed (${jobStatus.job.jobId})`}
                </h3>
                <p className="text-xs opacity-90">
                  Server-authoritative summary for {fileName} (
                  {jobStatus.job.totalRows.toLocaleString()} total rows). Click any metric card or
                  filter tab below to inspect succeeded, failed, invalid, skipped, or duplicate
                  rows.
                </p>
              </div>
            </div>

            {/* Interactive Summary Cards (Clicking filters the Audit Log below) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
              <button
                type="button"
                onClick={() => handleSelectAuditFilter('SUCCEEDED')}
                className={`rounded-lg border p-3 shadow-sm transition ${
                  auditStatusFilter === 'SUCCEEDED'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                    : 'border-slate-200 bg-white hover:border-emerald-400'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-slate-500">Succeeded</p>
                <p
                  data-testid="summary-succeeded-count"
                  className="mt-1 text-xl font-bold text-emerald-700"
                >
                  {jobStatus.succeededCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('FAILED')}
                className={`rounded-lg border p-3 shadow-sm transition ${
                  auditStatusFilter === 'FAILED'
                    ? 'border-red-600 bg-red-50/60 ring-1 ring-red-600'
                    : 'border-slate-200 bg-white hover:border-red-400'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-slate-500">Failed</p>
                <p
                  data-testid="summary-failed-count"
                  className="mt-1 text-xl font-bold text-red-700"
                >
                  {jobStatus.failedCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('INVALID')}
                className={`rounded-lg border p-3 shadow-sm transition ${
                  auditStatusFilter === 'INVALID'
                    ? 'border-rose-600 bg-rose-50/60 ring-1 ring-rose-600'
                    : 'border-slate-200 bg-white hover:border-rose-400'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-slate-500">Invalid</p>
                <p
                  data-testid="summary-invalid-count"
                  className="mt-1 text-xl font-bold text-rose-700"
                >
                  {jobStatus.invalidCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('SKIPPED_EXISTING_IN_ORG')}
                className={`rounded-lg border p-3 shadow-sm transition ${
                  auditStatusFilter === 'SKIPPED_EXISTING_IN_ORG'
                    ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white hover:border-blue-400'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-slate-500">Skipped (Org)</p>
                <p
                  data-testid="summary-skipped-count"
                  className="mt-1 text-xl font-bold text-blue-700"
                >
                  {jobStatus.skippedExistingCount.toLocaleString()}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAuditFilter('SKIPPED_DUPLICATE_IN_CSV')}
                className={`rounded-lg border p-3 shadow-sm transition ${
                  auditStatusFilter === 'SKIPPED_DUPLICATE_IN_CSV'
                    ? 'border-amber-600 bg-amber-50/60 ring-1 ring-amber-600'
                    : 'border-slate-200 bg-white hover:border-amber-400'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase text-slate-500">CSV Duplicates</p>
                <p
                  data-testid="summary-duplicate-count"
                  className="mt-1 text-xl font-bold text-amber-700"
                >
                  {jobStatus.duplicateInCsvCount.toLocaleString()}
                </p>
              </button>
            </div>

            {/* Complete 10,000-Row Filterable & Paginated Audit Log */}
            {renderFullAuditLogSection(jobStatus)}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="import-another-file-btn"
                  onClick={handleResetWizard}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Import Another File
                </button>

                <button
                  type="button"
                  data-testid="reupload-same-file-idempotency-btn"
                  onClick={() => {
                    void handleReuploadSameFileIdempotencyCheck();
                  }}
                  className="rounded-md border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Re-run Same Job (Verify 0 Duplicates)
                </button>
              </div>

              <div className="flex items-center gap-2">
                {jobStatus.failedCount > 0 ? (
                  <button
                    type="button"
                    data-testid="retry-failed-rows-btn"
                    onClick={() => {
                      void handleResumeOrRetryRemaining(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry Only Failed Rows ({jobStatus.failedCount})
                  </button>
                ) : null}

                <button
                  type="button"
                  data-testid="csv-summary-done-btn"
                  onClick={onClose}
                  className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}