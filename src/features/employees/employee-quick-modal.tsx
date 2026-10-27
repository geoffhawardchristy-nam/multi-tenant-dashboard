'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type {
  Employee,
  EmployeeDepartment,
  EmployeeRoleTitle,
  EmployeeStatus,
} from '@/types/domain';
import { ErrorStateView } from '@/components/feedback/state-views';

export interface EmployeeFormValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly department: EmployeeDepartment;
  readonly roleTitle: EmployeeRoleTitle;
  readonly status: EmployeeStatus;
  readonly salaryUsd: number;
  readonly hireDate: string;
}

export interface EmployeeQuickModalProps {
  readonly isOpen: boolean;
  readonly mode: 'create' | 'edit';
  readonly initialEmployee: Employee | null;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (values: EmployeeFormValues) => Promise<void>;
}

const DEPARTMENTS: ReadonlyArray<EmployeeDepartment> = [
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Finance',
  'Operations',
  'People',
  'Security',
];

const ROLE_TITLES: ReadonlyArray<EmployeeRoleTitle> = [
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

const STATUSES: ReadonlyArray<EmployeeStatus> = ['ACTIVE', 'INVITED', 'SUSPENDED', 'OFFBOARDED'];

export function EmployeeQuickModal({
  isOpen,
  mode,
  initialEmployee,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: EmployeeQuickModalProps): React.JSX.Element | null {
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [department, setDepartment] = useState<EmployeeDepartment>('Engineering');
  const [roleTitle, setRoleTitle] = useState<EmployeeRoleTitle>('Software Engineer');
  const [status, setStatus] = useState<EmployeeStatus>('ACTIVE');
  const [salaryUsd, setSalaryUsd] = useState<number>(115000);
  const [hireDate, setHireDate] = useState<string>('2026-01-15');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValidationError(null);
    if (mode === 'edit' && initialEmployee) {
      setFirstName(initialEmployee.firstName);
      setLastName(initialEmployee.lastName);
      setEmail(initialEmployee.email);
      setDepartment(initialEmployee.department);
      setRoleTitle(initialEmployee.roleTitle);
      setStatus(initialEmployee.status);
      setSalaryUsd(initialEmployee.salaryUsd);
      setHireDate(initialEmployee.hireDate);
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setDepartment('Engineering');
      setRoleTitle('Software Engineer');
      setStatus('ACTIVE');
      setSalaryUsd(115000);
      setHireDate('2026-01-15');
    }
  }, [initialEmployee, isOpen, mode]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!firstName.trim() || !lastName.trim()) {
      setValidationError('First name and last name are required.');
      return;
    }
    if (!email.trim().includes('@')) {
      setValidationError('Please enter a valid work email address.');
      return;
    }

    setValidationError(null);
    await onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      department,
      roleTitle,
      status,
      salaryUsd: Number(salaryUsd) || 80000,
      hireDate,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 id="employee-modal-title" className="text-base font-bold text-slate-900">
              {mode === 'create'
                ? 'Add New Employee'
                : `Edit Employee (${initialEmployee?.id ?? ''})`}
            </h2>
            {mode === 'edit' && initialEmployee ? (
              <p className="font-mono text-xs text-slate-500">
                Record Version: v{initialEmployee.version}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {validationError || errorMessage ? (
          <div className="mt-4">
            <ErrorStateView
              title="Cannot Save Employee"
              message={validationError ?? errorMessage ?? 'Error saving record'}
            />
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
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
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
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
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
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
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="emp-dept" className="block text-xs font-semibold text-slate-700">
                Department
              </label>
              <select
                id="emp-dept"
                data-testid="modal-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value as EmployeeDepartment)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {DEPARTMENTS.map((dept) => (
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
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value as EmployeeRoleTitle)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {ROLE_TITLES.map((role) => (
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
                value={status}
                onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {STATUSES.map((st) => (
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
                Annual Salary (USD)
              </label>
              <input
                id="emp-salary"
                data-testid="modal-salary"
                type="number"
                min={30000}
                max={1000000}
                value={salaryUsd}
                onChange={(e) => setSalaryUsd(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="emp-hire-date" className="block text-xs font-semibold text-slate-700">
                Hire Date
              </label>
              <input
                id="emp-hire-date"
                data-testid="modal-hire-date"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="modal-submit-btn"
              className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Create Employee'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}