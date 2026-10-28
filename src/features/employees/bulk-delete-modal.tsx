'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, Trash2, UserMinus, X } from 'lucide-react';
import type { Employee, EmployeeStatus } from '@/types/domain';

export interface BulkDeleteConfirmModalProps {
  readonly isOpen: boolean;
  readonly selectedEmployees: ReadonlyArray<Employee>;
  readonly isDeleting: boolean;
  readonly onClose: () => void;
  readonly onRemoveFromSelection: (employeeId: string) => void;
  readonly onConfirmDelete: () => void;
}

const STATUS_BADGE_STYLES: Readonly<Record<EmployeeStatus, string>> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  INVITED: 'bg-blue-100 text-blue-800 border-blue-200',
  SUSPENDED: 'bg-amber-100 text-amber-800 border-amber-200',
  OFFBOARDED: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function BulkDeleteConfirmModal({
  isOpen,
  selectedEmployees,
  isDeleting,
  onClose,
  onRemoveFromSelection,
  onConfirmDelete,
}: BulkDeleteConfirmModalProps): React.JSX.Element | null {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setCurrentPage(1);
    }
  }, [isOpen]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return selectedEmployees;
    }
    return selectedEmployees.filter((emp) => {
      return (
        emp.fullName.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.roleTitle.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedEmployees]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));

  const paginatedEmployees = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, pageSize, safePage]);

  if (!isOpen) {
    return null;
  }

  const totalSelectedCount = selectedEmployees.length;
  const startRowNumber =
    filteredEmployees.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRowNumber = Math.min(filteredEmployees.length, safePage * pageSize);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-delete-modal-title"
      data-testid="bulk-delete-modal"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
    >
      <div className="my-6 flex max-h-[90vh] w-full max-w-4xl flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="bulk-delete-modal-title"
                  className="text-base font-bold text-slate-900"
                >
                  Confirm Bulk Employee Deletion
                </h2>
                <span
                  data-testid="bulk-delete-total-badge"
                  className="rounded-full bg-red-100 px-2.5 py-0.5 font-mono text-xs font-bold text-red-900"
                >
                  {totalSelectedCount.toLocaleString()} record(s) scheduled for deletion
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Review the complete list of selected employees below before permanently removing
                them from this organization.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isDeleting}
            data-testid="bulk-delete-close-btn"
            onClick={onClose}
            aria-label="Close bulk delete confirmation modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Record Preview Body */}
        <div className="my-4 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div className="text-xs font-semibold text-slate-700">
              Selected Employee Audit Preview ({filteredEmployees.length.toLocaleString()} matching
              of {totalSelectedCount.toLocaleString()} total selected)
            </div>

            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                data-testid="bulk-delete-search-input"
                placeholder="Filter selected by name, email, ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-md border border-slate-300 bg-white py-1 pl-8 pr-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Paginated Preview Table */}
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
            <table
              className="w-full text-left text-xs"
              data-testid="bulk-delete-preview-table"
            >
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[11px] uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Employee ID</th>
                  <th className="px-3 py-2">Full Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Department &amp; Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Selection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                      No selected employees match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp, idx) => {
                    const itemNumber = (safePage - 1) * pageSize + idx + 1;
                    return (
                      <tr
                        key={emp.id}
                        data-testid={`bulk-delete-preview-row-${emp.id}`}
                        className="hover:bg-red-50/30"
                      >
                        <td className="px-3 py-2 font-mono text-slate-500">
                          {itemNumber}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-700">
                          {emp.id}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {emp.fullName}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {emp.email}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {emp.department} Â· {emp.roleTitle}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${
                              STATUS_BADGE_STYLES[emp.status]
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={isDeleting}
                            data-testid={`bulk-delete-keep-btn-${emp.id}`}
                            onClick={() => onRemoveFromSelection(emp.id)}
                            title={`Keep ${emp.fullName} (remove from deletion list)`}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                          >
                            <UserMinus className="h-3 w-3" aria-hidden="true" />
                            Keep
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Audit-Style Pagination Controls */}
          <div
            data-testid="bulk-delete-pagination"
            className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-600"
          >
            <div className="flex items-center gap-2">
              <span data-testid="bulk-delete-pagination-summary">
                Showing <strong>{startRowNumber.toLocaleString()}</strong>â€“
                <strong>{endRowNumber.toLocaleString()}</strong> of{' '}
                <strong>{filteredEmployees.length.toLocaleString()}</strong> selected records (Page{' '}
                <strong>{safePage}</strong> of <strong>{totalPages}</strong>)
              </span>

              <select
                aria-label="Preview rows per page"
                data-testid="bulk-delete-page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
              >
                {[5, 10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} rows / page
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="bulk-delete-page-first-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                First
              </button>
              <button
                type="button"
                data-testid="bulk-delete-page-prev-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                data-testid="bulk-delete-page-next-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Next
              </button>
              <button
                type="button"
                data-testid="bulk-delete-page-last-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Last
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="text-xs font-medium text-red-800">
            This action will permanently delete{' '}
            <strong>{totalSelectedCount.toLocaleString()}</strong> employee record(s).
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDeleting}
              data-testid="bulk-delete-cancel-btn"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isDeleting || totalSelectedCount === 0}
              data-testid="bulk-delete-confirm-exec-btn"
              onClick={onConfirmDelete}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {isDeleting
                ? 'Deleting Records...'
                : `Confirm & Delete ${totalSelectedCount.toLocaleString()} Employee(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}