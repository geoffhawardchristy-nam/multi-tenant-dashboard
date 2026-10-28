'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Lock, Users, X, Zap } from 'lucide-react';
import type { ConflictErrorDetails } from '@/types/api';
import type { Employee } from '@/types/domain';
import { ErrorStateView } from '@/components/feedback/state-views';
import {
  EMPLOYEE_DEPARTMENTS,
  EMPLOYEE_ROLE_TITLES,
  EMPLOYEE_STATUSES,
  employeeFormSchema,
  extractFormValuesFromEmployee,
  type EmployeeFormValues,
} from './employee-schema';
import { ConflictResolutionPanel } from './conflict-resolution-panel';

export type { EmployeeFormValues };

export interface EmployeeQuickModalProps {
  readonly isOpen: boolean;
  readonly mode: 'create' | 'edit';
  readonly initialEmployee: Employee | null;
  readonly canMutate?: boolean;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly conflictDetails?: ConflictErrorDetails | null;
  readonly onClose: () => void;
  readonly onClearConflict?: () => void;
  readonly onSimulateConcurrentAdminEdit?: (employee: Employee) => Promise<Employee>;
  readonly onArmNextSaveFailure?: () => void;
  readonly onSubmit: (
    values: EmployeeFormValues,
    options?: { readonly expectedVersionOverride?: number; readonly idempotencyKey?: string }
  ) => Promise<void>;
}

const DEFAULT_CREATE_VALUES: EmployeeFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  department: 'Engineering',
  roleTitle: 'Software Engineer',
  status: 'ACTIVE',
  salaryUsd: 115000,
  hireDate: '2026-01-15',
};

export function EmployeeQuickModal({
  isOpen,
  mode,
  initialEmployee,
  canMutate = true,
  isSubmitting,
  errorMessage,
  fieldErrors,
  conflictDetails = null,
  onClose,
  onClearConflict,
  onSimulateConcurrentAdminEdit,
  onArmNextSaveFailure,
  onSubmit,
}: EmployeeQuickModalProps): React.JSX.Element | null {
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState<boolean>(false);
  const [baseVersion, setBaseVersion] = useState<number>(initialEmployee?.version ?? 1);
  const [concurrentNotice, setConcurrentNotice] = useState<string | null>(null);

  // Synchronous lock to prevent duplicate form submissions on rapid double-click
  const inFlightSubmitRef = useRef<boolean>(false);
  // Stable idempotency key per modal session so retries of the same create form never duplicate records
  const draftIdempotencyKeyRef = useRef<string>(`emp_draft_${Date.now()}`);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setError,
    formState: { errors, isDirty },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: DEFAULT_CREATE_VALUES,
    mode: 'onSubmit',
  });

  // Initialize form state when modal opens or switches target employee
  useEffect(() => {
    if (!isOpen) {
      setShowUnsavedPrompt(false);
      setConcurrentNotice(null);
      inFlightSubmitRef.current = false;
      return;
    }

    setShowUnsavedPrompt(false);
    setConcurrentNotice(null);
    draftIdempotencyKeyRef.current = `emp_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (mode === 'edit' && initialEmployee) {
      setBaseVersion(initialEmployee.version);
      reset(extractFormValuesFromEmployee(initialEmployee));
    } else {
      setBaseVersion(1);
      reset(DEFAULT_CREATE_VALUES);
    }
  }, [initialEmployee?.id, isOpen, mode, reset]);

  // Apply backend field-level errors (such as duplicate email) onto React Hook Form fields
  useEffect(() => {
    if (!fieldErrors) return;
    for (const [key, message] of Object.entries(fieldErrors)) {
      if (
        key === 'firstName' ||
        key === 'lastName' ||
        key === 'email' ||
        key === 'department' ||
        key === 'roleTitle' ||
        key === 'status' ||
        key === 'salaryUsd' ||
        key === 'hireDate'
      ) {
        setError(key, { type: 'server', message });
      }
    }
  }, [fieldErrors, setError]);

  // Browser beforeunload unsaved-changes guard
  useEffect(() => {
    if (!isOpen || !isDirty || !canMutate) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [canMutate, isDirty, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleRequestClose = () => {
    if (isSubmitting) return;
    if (isDirty && canMutate) {
      setShowUnsavedPrompt(true);
      return;
    }
    onClose();
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedPrompt(false);
    onClearConflict?.();
    onClose();
  };

  const onValidSubmit = async (values: EmployeeFormValues) => {
    if (!canMutate || isSubmitting || inFlightSubmitRef.current) {
      return;
    }
    inFlightSubmitRef.current = true;
    try {
      await onSubmit(values, {
        expectedVersionOverride: baseVersion,
        idempotencyKey: draftIdempotencyKeyRef.current,
      });
    } catch {
      // Error state is managed by parent mutation and displayed in modal while preserving user input
    } finally {
      inFlightSubmitRef.current = false;
    }
  };

  const handleReloadServerRecord = (serverRecord: Employee) => {
    setBaseVersion(serverRecord.version);
    reset(extractFormValuesFromEmployee(serverRecord));
    setConcurrentNotice(
      `Reloaded latest server record (v${serverRecord.version}). You can now make fresh edits.`
    );
    onClearConflict?.();
  };

  const handleResolveMergedValues = async (
    mergedValues: EmployeeFormValues,
    newExpectedVersion: number
  ) => {
    if (isSubmitting || inFlightSubmitRef.current) return;
    inFlightSubmitRef.current = true;
    try {
      setBaseVersion(newExpectedVersion);
      reset(mergedValues, { keepDirty: true });
      await onSubmit(mergedValues, {
        expectedVersionOverride: newExpectedVersion,
        idempotencyKey: draftIdempotencyKeyRef.current,
      });
    } catch {
      // Handled by parent mutation
    } finally {
      inFlightSubmitRef.current = false;
    }
  };

  const handleTriggerAdminAConcurrentEdit = async () => {
    if (!initialEmployee || !onSimulateConcurrentAdminEdit) return;
    const updatedOnServer = await onSimulateConcurrentAdminEdit(initialEmployee);
    setConcurrentNotice(
      `Administrator A saved changes on the server! Server is now at v${updatedOnServer.version} (Salary: $${updatedOnServer.salaryUsd.toLocaleString()}, Dept: ${updatedOnServer.department}), while your open form is still based on v${baseVersion}. Click "Save Changes" to trigger HTTP 409 Conflict Resolution.`
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
    >
      <div className="my-8 w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="employee-modal-title" className="text-base font-bold text-slate-900">
                {!canMutate
                  ? `Inspect Employee (${initialEmployee?.id ?? ''})`
                  : mode === 'create'
                    ? 'Add New Employee'
                    : `Edit Employee (${initialEmployee?.id ?? ''})`}
              </h2>
              {mode === 'edit' && initialEmployee ? (
                <span
                  data-testid="modal-version-badge"
                  className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700"
                >
                  Base Version: v{baseVersion}
                </span>
              ) : null}
              {isDirty && canMutate ? (
                <span
                  data-testid="dirty-indicator-badge"
                  className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                >
                  Unsaved Edits
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {canMutate
                ? 'Validated with React Hook Form + Zod. Protected against duplicate submits and stale version overwrites.'
                : 'Read-only inspection view. Viewer role cannot modify employee fields.'}
            </p>
          </div>

          <button
            type="button"
            data-testid="modal-close-btn"
            onClick={handleRequestClose}
            aria-label="Close modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Simulation Toolbar for Module C Critical Scenarios (Concurrent Edit & Optimistic Rollback) */}
        {canMutate && mode === 'edit' && initialEmployee ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">Concurrency &amp; Rollback Simulators:</span>
            <div className="flex flex-wrap items-center gap-2">
              {onSimulateConcurrentAdminEdit ? (
                <button
                  type="button"
                  data-testid="simulate-concurrent-admin-a-btn"
                  onClick={() => {
                    void handleTriggerAdminAConcurrentEdit();
                  }}
                  className="inline-flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-2.5 py-1 font-semibold text-purple-900 hover:bg-purple-100"
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Simulate Admin A Save (Bump Server to v{baseVersion + 1})
                </button>
              ) : null}

              {onArmNextSaveFailure ? (
                <button
                  type="button"
                  data-testid="arm-save-rollback-error-btn"
                  onClick={onArmNextSaveFailure}
                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  Fail Next Save (HTTP 500 Rollback)
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {concurrentNotice ? (
          <div
            role="status"
            data-testid="concurrent-simulation-notice"
            className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-2.5 text-xs font-medium text-purple-900"
          >
            {concurrentNotice}
          </div>
        ) : null}

        {/* Unsaved Changes Confirmation Guard */}
        {showUnsavedPrompt ? (
          <div
            role="alert"
            data-testid="unsaved-changes-prompt"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>You have unsaved changes. Are you sure you want to discard them?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="keep-editing-btn"
                onClick={() => setShowUnsavedPrompt(false)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 hover:bg-slate-100"
              >
                Keep Editing
              </button>
              <button
                type="button"
                data-testid="discard-changes-btn"
                onClick={handleConfirmDiscard}
                className="rounded bg-red-700 px-2.5 py-1 font-semibold text-white hover:bg-red-800"
              >
                Discard Changes
              </button>
            </div>
          </div>
        ) : null}

        {/* Interactive HTTP 409 Conflict Resolution Panel */}
        {conflictDetails ? (
          <ConflictResolutionPanel
            serverRecord={conflictDetails.serverRecord}
            attemptedVersion={conflictDetails.attemptedVersion}
            attemptedValues={getValues()}
            isSubmitting={isSubmitting}
            onReloadServerVersion={handleReloadServerRecord}
            onResolveWithMergedValues={handleResolveMergedValues}
          />
        ) : errorMessage ? (
          <div className="mt-4">
            <ErrorStateView
              title="Cannot Save Employee (Optimistic Changes Rolled Back)"
              message={errorMessage}
            />
          </div>
        ) : null}

        {/* Employee Form */}
        <form onSubmit={handleSubmit(onValidSubmit)} className="mt-4 space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="emp-first-name"
                className="block text-xs font-semibold text-slate-700"
              >
                First Name *
              </label>
              <input
                id="emp-first-name"
                data-testid="modal-first-name"
                type="text"
                disabled={!canMutate || isSubmitting}
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? 'emp-first-name-error' : undefined}
                {...register('firstName')}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.firstName ? (
                <p
                  id="emp-first-name-error"
                  data-testid="error-firstName"
                  role="alert"
                  className="mt-1 text-xs font-medium text-red-600"
                >
                  {errors.firstName.message}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="emp-last-name"
                className="block text-xs font-semibold text-slate-700"
              >
                Last Name *
              </label>
              <input
                id="emp-last-name"
                data-testid="modal-last-name"
                type="text"
                disabled={!canMutate || isSubmitting}
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? 'emp-last-name-error' : undefined}
                {...register('lastName')}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.lastName ? (
                <p
                  id="emp-last-name-error"
                  data-testid="error-lastName"
                  role="alert"
                  className="mt-1 text-xs font-medium text-red-600"
                >
                  {errors.lastName.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="emp-email" className="block text-xs font-semibold text-slate-700">
              Work Email *
            </label>
            <input
              id="emp-email"
              data-testid="modal-email"
              type="email"
              disabled={!canMutate || isSubmitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'emp-email-error' : undefined}
              {...register('email')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
            />
            {errors.email ? (
              <p
                id="emp-email-error"
                data-testid="error-email"
                role="alert"
                className="mt-1 text-xs font-medium text-red-600"
              >
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="emp-dept" className="block text-xs font-semibold text-slate-700">
                Department
              </label>
              <select
                id="emp-dept"
                data-testid="modal-department"
                disabled={!canMutate || isSubmitting}
                {...register('department')}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              >
                {EMPLOYEE_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="emp-role" className="block text-xs font-semibold text-slate-700">
                Role Title
              </label>
              <select
                id="emp-role"
                data-testid="modal-role"
                disabled={!canMutate || isSubmitting}
                {...register('roleTitle')}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              >
                {EMPLOYEE_ROLE_TITLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="emp-status" className="block text-xs font-semibold text-slate-700">
                Status
              </label>
              <select
                id="emp-status"
                data-testid="modal-status"
                disabled={!canMutate || isSubmitting}
                {...register('status')}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              >
                {EMPLOYEE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="emp-salary" className="block text-xs font-semibold text-slate-700">
                Annual Salary (USD) *
              </label>
              <input
                id="emp-salary"
                data-testid="modal-salary"
                type="number"
                disabled={!canMutate || isSubmitting}
                aria-invalid={Boolean(errors.salaryUsd)}
                aria-describedby={errors.salaryUsd ? 'emp-salary-error' : undefined}
                {...register('salaryUsd', { valueAsNumber: true })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.salaryUsd ? (
                <p
                  id="emp-salary-error"
                  data-testid="error-salaryUsd"
                  role="alert"
                  className="mt-1 text-xs font-medium text-red-600"
                >
                  {errors.salaryUsd.message}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="emp-hire-date" className="block text-xs font-semibold text-slate-700">
                Hire Date (YYYY-MM-DD) *
              </label>
              <input
                id="emp-hire-date"
                data-testid="modal-hire-date"
                type="date"
                disabled={!canMutate || isSubmitting}
                aria-invalid={Boolean(errors.hireDate)}
                aria-describedby={errors.hireDate ? 'emp-hire-date-error' : undefined}
                {...register('hireDate')}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.hireDate ? (
                <p
                  id="emp-hire-date-error"
                  data-testid="error-hireDate"
                  role="alert"
                  className="mt-1 text-xs font-medium text-red-600"
                >
                  {errors.hireDate.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            {!canMutate ? (
              <span
                data-testid="modal-readonly-restriction"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Viewer role cannot submit changes.
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">
                * Required fields validated before dispatch
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="modal-cancel-btn"
                onClick={handleRequestClose}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {canMutate ? 'Cancel' : 'Close'}
              </button>

              {canMutate ? (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="modal-submit-btn"
                  className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : mode === 'create'
                      ? 'Create Employee'
                      : 'Save Changes'}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}