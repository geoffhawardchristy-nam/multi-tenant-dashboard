'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, FileSpreadsheet, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { mockAuthApi } from '@/lib/mock-api/auth-api';
import { isMockApiError } from '@/lib/mock-api/errors';
import {
  ErrorStateView,
  LoadingSkeleton,
  StatusBanner,
} from '@/components/feedback/state-views';
import { useUiStore } from '@/store/ui-store';
import { EmployeeTableSection } from '@/features/employees/employee-table-section';
import { useAuth } from './auth-context';
import { LoginView } from './login-view';
import { TopNavbar } from './top-navbar';
import { canImportCsv, canMutateEmployees } from './permissions';

export function WorkspaceGuard(): React.JSX.Element {
  const {
    session,
    isInitializing,
    handleUnauthorizedError,
    checkPermission,
  } = useAuth();
  const { banner, clearBanner, showBanner } = useUiStore();

  const [probeResult, setProbeResult] = useState<{
    readonly status: 'idle' | 'blocked' | 'allowed';
    readonly code?: string;
    readonly httpStatus?: number;
    readonly message?: string;
  }>({ status: 'idle' });

  const activeOrgId = session?.activeOrganization.id ?? '';
  const sessionToken = session?.token ?? '';

  const overviewQuery = useQuery({
    queryKey: ['tenant', activeOrgId, 'overview'],
    enabled: Boolean(session && activeOrgId),
    queryFn: async ({ signal }) => {
      try {
        return await mockAuthApi.getTenantOverview(
          {
            token: sessionToken,
            organizationId: activeOrgId,
          },
          signal
        );
      } catch (err: unknown) {
        handleUnauthorizedError(err);
        throw err;
      }
    },
  });

  if (isInitializing) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <LoadingSkeleton rows={4} label="Restoring secure tenant session..." />
      </main>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  const allowEmployeeMutations = canMutateEmployees(session.user.role);
  const allowCsvImport = canImportCsv(session.user.role);

  const runCrossTenantReadProbe = async () => {
    const foreignOrgId = activeOrgId === 'org-globex' ? 'org-acme' : 'org-globex';
    try {
      const res = await mockAuthApi.attemptSecurityProbe({
        token: session.token,
        requestedOrganizationId: foreignOrgId,
        operation: 'READ_TENANT',
      });
      setProbeResult({
        status: 'allowed',
        message: `Allowed as ${res.effectiveRole}`,
      });
    } catch (err: unknown) {
      if (handleUnauthorizedError(err)) return;
      if (isMockApiError(err)) {
        setProbeResult({
          status: 'blocked',
          code: err.code,
          httpStatus: err.status,
          message: err.message,
        });
      }
    }
  };

  const runRoleEscalationProbe = async () => {
    try {
      const res = await mockAuthApi.attemptSecurityProbe({
        token: session.token,
        requestedOrganizationId: activeOrgId,
        clientClaimedRole: 'SUPER_ADMIN',
        operation: 'MUTATE_EMPLOYEE',
      });
      setProbeResult({
        status: 'allowed',
        message: `Authorized mutation permitted for server role ${res.effectiveRole}.`,
      });
    } catch (err: unknown) {
      if (handleUnauthorizedError(err)) return;
      if (isMockApiError(err)) {
        setProbeResult({
          status: 'blocked',
          code: err.code,
          httpStatus: err.status,
          message: err.message,
        });
      }
    }
  };

  const runCrossTenantRecordIdProbe = async () => {
    const foreignEmployeeId = activeOrgId === 'org-acme' ? 'emp-10005' : 'emp-00001';
    try {
      const res = await mockAuthApi.attemptSecurityProbe({
        token: session.token,
        requestedOrganizationId: activeOrgId,
        targetEmployeeId: foreignEmployeeId,
        operation: 'MUTATE_EMPLOYEE',
      });
      setProbeResult({
        status: 'allowed',
        message: `Mutation permitted for ${res.effectiveRole}`,
      });
    } catch (err: unknown) {
      if (handleUnauthorizedError(err)) return;
      if (isMockApiError(err)) {
        setProbeResult({
          status: 'blocked',
          code: err.code,
          httpStatus: err.status,
          message: err.message,
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavbar />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {banner ? (
          <StatusBanner
            variant={banner.variant}
            message={banner.message}
            onDismiss={clearBanner}
          />
        ) : null}

        <section
          aria-labelledby="workspace-tenant-heading"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold uppercase text-slate-500">
                Active Tenant Workspace
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800">
                {session.activeOrganization.id}
              </span>
            </div>
            <h1
              id="workspace-tenant-heading"
              data-testid="active-tenant-heading"
              className="mt-1 text-2xl font-bold text-slate-900"
            >
              {session.activeOrganization.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3" data-testid="role-action-toolbar">
            {allowEmployeeMutations ? (
              <>
                <button
                  type="button"
                  data-testid="create-employee-action-btn"
                  onClick={() => {
                    const trigger = document.querySelector<HTMLButtonElement>(
                      '[data-testid="open-create-employee-modal-btn"]'
                    );
                    trigger?.click();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Employee
                </button>
                <button
                  type="button"
                  data-testid="bulk-delete-action-btn"
                  onClick={() =>
                    showBanner(
                      'info',
                      'Select one or more rows in the Employee Directory below to trigger Bulk Delete.'
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Bulk Delete
                </button>
              </>
            ) : (
              <span
                data-testid="viewer-readonly-notice"
                className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Read-Only Mode: Employee creation, editing, deletion, and CSV imports are restricted
                for Viewer role.
              </span>
            )}

            {allowCsvImport ? (
              <button
                type="button"
                data-testid="csv-import-action-btn"
                onClick={() =>
                  showBanner(
                    'info',
                    'CSV Bulk Import authorized for your role. Full 10k-row engine in Module D.'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Bulk CSV Import
              </button>
            ) : null}
          </div>
        </section>

        {overviewQuery.isLoading ? (
          <LoadingSkeleton rows={4} label="Loading tenant-scoped metrics..." />
        ) : overviewQuery.isError ? (
          <ErrorStateView
            title="Failed to Load Tenant Overview"
            message={
              isMockApiError(overviewQuery.error)
                ? overviewQuery.error.message
                : 'Unexpected error loading tenant metrics.'
            }
            code={isMockApiError(overviewQuery.error) ? overviewQuery.error.code : 'ERROR'}
            onRetry={() => {
              void overviewQuery.refetch();
            }}
          />
        ) : overviewQuery.data ? (
          <section
            aria-label="Tenant Employee Metrics"
            className="grid gap-4 sm:grid-cols-4"
          >
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Total Employees</p>
              <p
                data-testid="tenant-total-employees"
                className="mt-2 text-2xl font-bold text-slate-900"
              >
                {overviewQuery.data.totalEmployees.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Strictly scoped to {overviewQuery.data.organization.id}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Active</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {overviewQuery.data.activeCount.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Invited</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">
                {overviewQuery.data.invitedCount.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">Suspended</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">
                {overviewQuery.data.suspendedCount.toLocaleString()}
              </p>
            </div>
          </section>
        ) : null}

        {/* Module B: Full 10,000+ Record Employee Management Table */}
        <EmployeeTableSection
          onDataMutated={() => {
            void overviewQuery.refetch();
          }}
        />

        {/* Backend Authorization & Tampered Request Verifier */}
        <section
          aria-labelledby="security-verifier-heading"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-800" aria-hidden="true" />
            <h2 id="security-verifier-heading" className="text-base font-bold text-slate-900">
              Backend Authorization & Tampered Request Verifier
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Verify that the Mock API boundary rejects manipulated organization IDs, cross-tenant
            record IDs, and spoofed role payloads even if triggered directly from the client:
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="probe-cross-tenant-org-btn"
              onClick={() => {
                void runCrossTenantReadProbe();
              }}
              className="rounded-md border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              1. Tamper Organization ID (Request Foreign Org)
            </button>

            <button
              type="button"
              data-testid="probe-cross-tenant-record-btn"
              onClick={() => {
                void runCrossTenantRecordIdProbe();
              }}
              className="rounded-md border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              2. Tamper Record ID (Mutate Foreign Employee ID)
            </button>

            <button
              type="button"
              data-testid="probe-role-spoof-btn"
              onClick={() => {
                void runRoleEscalationProbe();
              }}
              className="rounded-md border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              3. Spoof Client Role (`clientClaimedRole: SUPER_ADMIN`)
            </button>

            <button
              type="button"
              data-testid="probe-refresh-overview-btn"
              onClick={() => {
                void overviewQuery.refetch();
              }}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              4. Refetch Tenant Overview (Verify Session TTL)
            </button>
          </div>

          {probeResult.status !== 'idle' ? (
            <div
              data-testid="security-probe-result"
              role="status"
              className={`mt-4 rounded-lg border p-4 text-xs ${
                probeResult.status === 'blocked'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {probeResult.status === 'blocked' ? (
                  <span>
                    Rejected by Mock API Boundary â€” HTTP {probeResult.httpStatus} (
                    {probeResult.code})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Authorized by Mock API Boundary
                  </span>
                )}
              </div>
              <p className="mt-1">{probeResult.message}</p>
            </div>
          ) : null}

          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Active Role Permissions:{' '}
            <span className="font-mono font-semibold text-slate-700">
              {[
                checkPermission('org:switch') ? 'org:switch' : null,
                checkPermission('employee:read') ? 'employee:read' : null,
                checkPermission('employee:create') ? 'employee:create' : null,
                checkPermission('employee:update') ? 'employee:update' : null,
                checkPermission('employee:delete') ? 'employee:delete' : null,
                checkPermission('employee:import_csv') ? 'employee:import_csv' : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}