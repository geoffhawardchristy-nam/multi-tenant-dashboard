'use client';

import React, { useRef } from 'react';
import { Edit2, Eye, Trash2, RefreshCw } from 'lucide-react';
import type { Employee, EmployeeStatus } from '@/types/domain';

export interface EmployeeTableRowProps {
  readonly employee: Employee;
  readonly isSelected: boolean;
  readonly canMutate: boolean;
  readonly isRowMutating: boolean;
  readonly onToggleSelect: (employeeId: string) => void;
  readonly onEdit: (employee: Employee) => void;
  readonly onDelete: (employee: Employee) => void;
  readonly onQuickToggleStatus: (employee: Employee) => void;
}

const STATUS_BADGE_STYLES: Readonly<Record<EmployeeStatus, string>> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  INVITED: 'bg-blue-100 text-blue-800 border-blue-200',
  SUSPENDED: 'bg-amber-100 text-amber-800 border-amber-200',
  OFFBOARDED: 'bg-slate-100 text-slate-700 border-slate-200',
};

function EmployeeTableRowComponent({
  employee,
  isSelected,
  canMutate,
  isRowMutating,
  onToggleSelect,
  onEdit,
  onDelete,
  onQuickToggleStatus,
}: EmployeeTableRowProps): React.JSX.Element {
  const renderCountRef = useRef<number>(0);
  renderCountRef.current += 1;

  return (
    <tr
      data-testid={`employee-row-${employee.id}`}
      data-render-count={renderCountRef.current}
      className={`transition-colors ${
        isSelected ? 'bg-slate-900/5' : 'hover:bg-slate-50'
      }`}
    >
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          aria-label={`Select ${employee.fullName}`}
          data-testid={`select-row-${employee.id}`}
          checked={isSelected}
          onChange={() => onToggleSelect(employee.id)}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
      </td>

      <td className="px-4 py-3">
        <div className="font-medium text-slate-900" data-testid={`row-name-${employee.id}`}>
          {employee.fullName}
        </div>
        <div className="font-mono text-xs text-slate-500">
          {employee.id} Â· v{employee.version}
        </div>
      </td>

      <td className="px-4 py-3 font-mono text-xs text-slate-600">{employee.email}</td>

      <td
        data-testid={`row-dept-${employee.id}`}
        className="px-4 py-3 text-xs font-medium text-slate-700"
      >
        {employee.department}
      </td>

      <td className="px-4 py-3 text-xs text-slate-700">{employee.roleTitle}</td>

      <td className="px-4 py-3">
        <span
          data-testid={`row-status-${employee.id}`}
          className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${
            STATUS_BADGE_STYLES[employee.status]
          }`}
        >
          {employee.status}
        </span>
      </td>

      <td
        data-testid={`row-salary-${employee.id}`}
        className="px-4 py-3 font-mono text-xs text-slate-700"
      >
        ${employee.salaryUsd.toLocaleString()}
      </td>

      <td className="px-4 py-3 font-mono text-xs text-slate-500">{employee.hireDate}</td>

      <td className="px-4 py-3 text-right">
        {canMutate ? (
          <div className="inline-flex items-center justify-end gap-1.5">
            <button
              type="button"
              disabled={isRowMutating}
              data-testid={`quick-status-btn-${employee.id}`}
              onClick={() => onQuickToggleStatus(employee)}
              title="Toggle Active / Suspended status (single-row update)"
              aria-label={`Toggle status for ${employee.fullName}`}
              className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={isRowMutating}
              data-testid={`edit-row-btn-${employee.id}`}
              onClick={() => onEdit(employee)}
              title={`Edit ${employee.fullName}`}
              aria-label={`Edit ${employee.fullName}`}
              className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-40"
            >
              <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={isRowMutating}
              data-testid={`delete-row-btn-${employee.id}`}
              onClick={() => onDelete(employee)}
              title={`Delete ${employee.fullName}`}
              aria-label={`Delete ${employee.fullName}`}
              className="rounded border border-red-200 bg-red-50 p-1.5 text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid={`inspect-row-btn-${employee.id}`}
            onClick={() => onEdit(employee)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-medium text-slate-600 hover:bg-slate-100"
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            Inspect
          </button>
        )}
      </td>
    </tr>
  );
}

export const EmployeeTableRow = React.memo(EmployeeTableRowComponent, (prev, next) => {
  return (
    prev.employee.id === next.employee.id &&
    prev.employee.version === next.employee.version &&
    prev.employee.updatedAt === next.employee.updatedAt &&
    prev.employee.fullName === next.employee.fullName &&
    prev.employee.department === next.employee.department &&
    prev.employee.salaryUsd === next.employee.salaryUsd &&
    prev.employee.status === next.employee.status &&
    prev.isSelected === next.isSelected &&
    prev.canMutate === next.canMutate &&
    prev.isRowMutating === next.isRowMutating &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onQuickToggleStatus === next.onQuickToggleStatus
  );
});