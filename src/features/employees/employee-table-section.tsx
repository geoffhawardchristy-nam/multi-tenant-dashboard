'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertOctagon,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  clearSearchTermDelays,
  mockEmployeesApi,
  setSearchTermDelayMs,
} from '@/lib/mock-api/employees-api';
import { mockApiEngine } from '@/lib/mock-api/engine';
import { isMockApiError } from '@/lib/mock-api/errors';
import type { PaginatedResponse, SortField } from '@/types/api';
import type {
  Employee,
  EmployeeDepartment,
  EmployeeRoleTitle,
  EmployeeStatus,
} from '@/types/domain';
import {
  EmptyStateView,
  ErrorStateView,
  LoadingSkeleton,
} from '@/components/feedback/state-views';
import { useAuth } from '@/features/auth/auth-context';
import { canMutateEmployees } from '@/features/auth/permissions';
import { useUiStore } from '@/store/ui-store';
import { useTableUrlState } from './use-table-url-state';
import { EmployeeTableRow } from './employee-row';
import { EmployeeQuickModal, type EmployeeFormValues } from './employee-quick-modal';

const DEPARTMENTS: ReadonlyArray<EmployeeDepartment | 'ALL'> = [
  'ALL',
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Finance',
  'Operations',
  'People',
  'Security',
];

const ROLE_TITLES: ReadonlyArray<EmployeeRoleTitle | 'ALL'> = [
  'ALL',
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

const STATUSES: ReadonlyArray<EmployeeStatus | 'ALL'> = [
  'ALL',
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'OFFBOARDED',
];

export interface EmployeeTableSectionProps {
  readonly onDataMutated?: () => void;
}

export function EmployeeTableSection({
  onDataMutated,
}: EmployeeTableSectionProps): React.JSX.Element {
  const { session, handleUnauthorizedError } = useAuth();
  const { showBanner } = useUiStore();
  const queryClient = useQueryClient();

  const { urlState, updateUrlState, resetUrlState } = useTableUrlState();

  const [searchInput, setSearchInput] = useState<string>(urlState.search);

  useEffect(() => {
    setSearchInput(urlState.search);
  }, [urlState.search]);

  useEffect(() => {
    const trimmedInput = searchInput.trim();
    if (trimmedInput === urlState.search.trim()) {
      return;
    }
    const timerId = setTimeout(() => {
      updateUrlState((prev) => ({
        ...prev,
        search: trimmedInput,
        page: 1,
      }));
    }, 200);

    return () => clearTimeout(timerId);
  }, [searchInput, updateUrlState, urlState.search]);

  // Stable ID-based row selection
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [mutatingRowIds, setMutatingRowIds] = useState<ReadonlySet<string>>(() => new Set());

  // Modal state for Create / Edit
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const activeOrgId = session?.activeOrganization.id ?? '';
  const sessionToken = session?.token ?? '';
  const canMutate = canMutateEmployees(session?.user.role);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeOrgId]);

  const queryKey = useMemo(
    () =>
      [
        'tenant',
        activeOrgId,
        'employees',
        {
          page: urlState.page,
          pageSize: urlState.pageSize,
          search: urlState.search,
          department: urlState.department,
          roleTitle: urlState.roleTitle,
          status: urlState.status,
          sortBy: urlState.sortBy,
          sortDir: urlState.sortDir,
        },
      ] as const,
    [
      activeOrgId,
      urlState.department,
      urlState.page,
      urlState.pageSize,
      urlState.roleTitle,
      urlState.search,
      urlState.sortBy,
      urlState.sortDir,
      urlState.status,
    ]
  );

  const latestQuerySeqRef = useRef<number>(0);

  const employeesQuery = useQuery({
    queryKey,
    enabled: Boolean(session && activeOrgId),
    queryFn: async ({ signal }) => {
      const requestSeq = ++latestQuerySeqRef.current;
      try {
        const response = await mockEmployeesApi.list(
          {
            token: sessionToken,
            organizationId: activeOrgId,
            page: urlState.page,
            pageSize: urlState.pageSize,
            search: urlState.search,
            department: urlState.department,
            roleTitle: urlState.roleTitle,
            status: urlState.status,
            sortBy: urlState.sortBy,
            sortDir: urlState.sortDir,
          },
          signal
        );

        if (response.currentPage !== urlState.page && requestSeq === latestQuerySeqRef.current) {
          updateUrlState((prev) => ({
            ...prev,
            page: response.currentPage,
          }));
        }

        return response;
      } catch (err: unknown) {
        handleUnauthorizedError(err);
        throw err;
      }
    },
  });

  const quickToggleMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      const nextStatus: EmployeeStatus =
        employee.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      return mockEmployeesApi.update({
        token: sessionToken,
        organizationId: activeOrgId,
        employeeId: employee.id,
        expectedVersion: employee.version,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        department: employee.department,
        roleTitle: employee.roleTitle,
        status: nextStatus,
        salaryUsd: employee.salaryUsd,
        hireDate: employee.hireDate,
      });
    },
    onMutate: (employee) => {
      setMutatingRowIds((prev) => {
        const next = new Set(prev);
        next.add(employee.id);
        return next;
      });
    },
    onSuccess: (updatedEmployee) => {
      queryClient.setQueryData<PaginatedResponse<Employee>>(queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) =>
            item.id === updatedEmployee.id ? updatedEmployee : item
          ),
        };
      });
      onDataMutated?.();
    },
    onError: (err: unknown) => {
      if (!handleUnauthorizedError(err)) {
        showBanner(
          'error',
          isMockApiError(err) ? err.message : 'Failed to update employee status.'
        );
      }
    },
    onSettled: (_data, _error, employee) => {
      setMutatingRowIds((prev) => {
        const next = new Set(prev);
        next.delete(employee.id);
        return next;
      });
    },
  });

  const deleteRowMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      return mockEmployeesApi.delete({
        token: sessionToken,
        organizationId: activeOrgId,
        employeeId: employee.id,
      });
    },
    onMutate: (employee) => {
      setMutatingRowIds((prev) => {
        const next = new Set(prev);
        next.add(employee.id);
        return next;
      });
    },
    onSuccess: ({ deletedId }, employee) => {
      setSelectedIds((prev) => {
        if (!prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
      showBanner('success', `Deleted employee ${employee.fullName} (${deletedId}).`);
      void queryClient.invalidateQueries({
        queryKey: ['tenant', activeOrgId, 'employees'],
      });
      onDataMutated?.();
    },
    onError: (err: unknown) => {
      if (!handleUnauthorizedError(err)) {
        showBanner('error', isMockApiError(err) ? err.message : 'Failed to delete employee.');
      }
    },
    onSettled: (_data, _err, employee) => {
      setMutatingRowIds((prev) => {
        const next = new Set(prev);
        next.delete(employee.id);
        return next;
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (idsToDelete: ReadonlyArray<string>) => {
      return mockEmployeesApi.bulkDelete({
        token: sessionToken,
        organizationId: activeOrgId,
        employeeIds: idsToDelete,
      });
    },
    onSuccess: (res) => {
      setSelectedIds(new Set());
      showBanner('success', `Deleted ${res.deletedCount} selected employee record(s).`);
      void queryClient.invalidateQueries({
        queryKey: ['tenant', activeOrgId, 'employees'],
      });
      onDataMutated?.();
    },
    onError: (err: unknown) => {
      if (!handleUnauthorizedError(err)) {
        showBanner('error', isMockApiError(err) ? err.message : 'Bulk delete failed.');
      }
    },
  });

  const saveModalMutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      if (modalMode === 'create') {
        const idempotencyKey = `create_${activeOrgId}_${values.email.toLowerCase()}_${Date.now()}`;
        return mockEmployeesApi.create({
          token: sessionToken,
          organizationId: activeOrgId,
          idempotencyKey,
          ...values,
        });
      }
      if (!editingEmployee) {
        throw new Error('No employee selected for editing.');
      }
      return mockEmployeesApi.update({
        token: sessionToken,
        organizationId: activeOrgId,
        employeeId: editingEmployee.id,
        expectedVersion: editingEmployee.version,
        ...values,
      });
    },
    onSuccess: (savedEmployee) => {
      setIsModalOpen(false);
      setModalError(null);
      if (modalMode === 'edit') {
        queryClient.setQueryData<PaginatedResponse<Employee>>(queryKey, (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item) =>
              item.id === savedEmployee.id ? savedEmployee : item
            ),
          };
        });
        showBanner('success', `Updated ${savedEmployee.fullName} (v${savedEmployee.version}).`);
      } else {
        void queryClient.invalidateQueries({
          queryKey: ['tenant', activeOrgId, 'employees'],
        });
        showBanner('success', `Created employee ${savedEmployee.fullName} (${savedEmployee.id}).`);
      }
      onDataMutated?.();
    },
    onError: (err: unknown) => {
      if (!handleUnauthorizedError(err)) {
        setModalError(isMockApiError(err) ? err.message : 'Failed to save employee.');
      }
    },
  });

  // Store mutation functions in refs so row callbacks have [] dependencies and never change reference
  const deleteRowMutateRef = useRef(deleteRowMutation.mutate);
  deleteRowMutateRef.current = deleteRowMutation.mutate;

  const quickToggleMutateRef = useRef(quickToggleMutation.mutate);
  quickToggleMutateRef.current = quickToggleMutation.mutate;

  const handleToggleSelectRow = useCallback((employeeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }, []);

  const handleOpenEditModal = useCallback((employee: Employee) => {
    setModalMode('edit');
    setEditingEmployee(employee);
    setModalError(null);
    setIsModalOpen(true);
  }, []);

  const handleDeleteRow = useCallback((employee: Employee) => {
    deleteRowMutateRef.current(employee);
  }, []);

  const handleQuickToggleStatus = useCallback((employee: Employee) => {
    quickToggleMutateRef.current(employee);
  }, []);

  const handleSortColumn = (field: SortField) => {
    updateUrlState((prev) => {
      if (prev.sortBy === field) {
        return {
          ...prev,
          sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc',
          page: 1,
        };
      }
      return {
        ...prev,
        sortBy: field,
        sortDir: 'asc',
        page: 1,
      };
    });
  };

  const currentItems = employeesQuery.data?.items ?? [];
  const allCurrentPageSelected =
    currentItems.length > 0 && currentItems.every((emp) => selectedIds.has(emp.id));

  const handleToggleSelectCurrentPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allCurrentPageSelected) {
        for (const emp of currentItems) {
          next.delete(emp.id);
        }
      } else {
        for (const emp of currentItems) {
          next.add(emp.id);
        }
      }
      return next;
    });
  };

  const runAsadThenRahulRaceDemo = () => {
    setSearchTermDelayMs('asad', 450);
    setSearchTermDelayMs('rahul', 10);

    setSearchInput('Asad');
    updateUrlState((prev) => ({ ...prev, search: 'Asad', page: 1 }));

    setTimeout(() => {
      setSearchInput('Rahul');
      updateUrlState((prev) => ({ ...prev, search: 'Rahul', page: 1 }));
      setTimeout(() => {
        clearSearchTermDelays();
      }, 600);
    }, 25);
  };

  const armNextPageFailure = () => {
    mockApiEngine.enqueueFailureRule({
      id: `table-fail-once-${Date.now()}`,
      endpointPattern: 'employees.list',
      failureType: 'HTTP_500',
      remainingTriggers: 3,
      delayMs: 10,
    });
    showBanner(
      'warning',
      'Armed HTTP 500 failure for the next table request. Click "Next Page" or change a filter to verify recoverable error handling.'
    );
  };

  const renderSortIcon = (field: SortField) => {
    if (urlState.sortBy !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />;
    }
    return urlState.sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-slate-900" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-slate-900" aria-hidden="true" />
    );
  };

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (urlState.sortBy !== field) return 'none';
    return urlState.sortDir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <section
      aria-labelledby="employee-directory-heading"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 id="employee-directory-heading" className="text-lg font-bold text-slate-900">
            Employee Directory ({employeesQuery.data?.totalItems.toLocaleString() ?? '...'} matching
            records)
          </h2>
          <p className="text-xs text-slate-500">
            Server-paginated, URL-synchronized, race-protected table with stable ID selection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="race-demo-asad-rahul-btn"
            onClick={runAsadThenRahulRaceDemo}
            className="inline-flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-900 hover:bg-purple-100"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Race Test: &ldquo;Asad&rdquo; (450ms) &rarr; &ldquo;Rahul&rdquo; (10ms)
          </button>

          <button
            type="button"
            data-testid="arm-table-error-btn"
            onClick={armNextPageFailure}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />
            Fail Next Table Request
          </button>

          {canMutate ? (
            <button
              type="button"
              data-testid="open-create-employee-modal-btn"
              onClick={() => {
                setModalMode('create');
                setEditingEmployee(null);
                setModalError(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Employee
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative lg:col-span-4">
          <label htmlFor="employee-search-input" className="sr-only">
            Search employees by name, email, or ID
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="employee-search-input"
            data-testid="employee-search-input"
            type="search"
            placeholder="Search name, email, or ID (e.g. Asad, Rahul)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                updateUrlState((prev) => ({
                  ...prev,
                  search: searchInput.trim(),
                  page: 1,
                }));
              }
            }}
            className="w-full rounded-md border border-slate-300 py-1.5 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="filter-department" className="sr-only">
            Filter by Department
          </label>
          <select
            id="filter-department"
            aria-label="Filter by Department"
            data-testid="filter-department"
            value={urlState.department}
            onChange={(e) => {
              const value = e.target.value as EmployeeDepartment | 'ALL';
              updateUrlState((prev) =>
                prev.department === value ? prev : { ...prev, department: value, page: 1 }
              );
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept === 'ALL' ? 'All Departments' : dept}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="filter-role" className="sr-only">
            Filter by Role Title
          </label>
          <select
            id="filter-role"
            aria-label="Filter by Role Title"
            data-testid="filter-role"
            value={urlState.roleTitle}
            onChange={(e) => {
              const value = e.target.value as EmployeeRoleTitle | 'ALL';
              updateUrlState((prev) =>
                prev.roleTitle === value ? prev : { ...prev, roleTitle: value, page: 1 }
              );
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            {ROLE_TITLES.map((role) => (
              <option key={role} value={role}>
                {role === 'ALL' ? 'All Role Titles' : role}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="filter-status" className="sr-only">
            Filter by Status
          </label>
          <select
            id="filter-status"
            aria-label="Filter by Status"
            data-testid="filter-status"
            value={urlState.status}
            onChange={(e) => {
              const value = e.target.value as EmployeeStatus | 'ALL';
              updateUrlState((prev) =>
                prev.status === value ? prev : { ...prev, status: value, page: 1 }
              );
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          >
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {st === 'ALL' ? 'All Statuses' : st}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-1">
          <button
            type="button"
            data-testid="reset-table-filters-btn"
            onClick={() => {
              setSearchInput('');
              resetUrlState();
            }}
            title="Reset search, filters, and sort"
            className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div
          data-testid="bulk-selection-bar"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-900/20 bg-slate-900 px-4 py-2.5 text-xs text-white"
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold" data-testid="selected-count-badge">
              {selectedIds.size} employee(s) selected by stable ID
            </span>
            <span className="font-mono text-[11px] text-slate-300">
              [{Array.from(selectedIds).slice(0, 4).join(', ')}
              {selectedIds.size > 4 ? ', ...' : ''}]
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="clear-selection-btn"
              onClick={() => setSelectedIds(new Set())}
              className="rounded border border-white/20 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10"
            >
              Clear Selection
            </button>

            {canMutate ? (
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending}
                data-testid="confirm-bulk-delete-btn"
                onClick={() => {
                  bulkDeleteMutation.mutate(Array.from(selectedIds));
                }}
                className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {bulkDeleteMutation.isPending
                  ? 'Deleting...'
                  : `Delete Selected (${selectedIds.size})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {employeesQuery.isLoading ? (
        <LoadingSkeleton rows={8} label="Loading tenant employees..." />
      ) : employeesQuery.isError ? (
        <ErrorStateView
          title="Failed to Load Employee Table"
          message={
            isMockApiError(employeesQuery.error)
              ? employeesQuery.error.message
              : 'Network error while fetching employees.'
          }
          code={isMockApiError(employeesQuery.error) ? employeesQuery.error.code : 'ERROR'}
          onRetry={() => {
            void employeesQuery.refetch();
          }}
        />
      ) : currentItems.length === 0 ? (
        <EmptyStateView
          title="No Matching Employees Found"
          description="No employee records in this organization match your current search or filter criteria."
          actionLabel="Clear All Filters"
          onAction={() => {
            setSearchInput('');
            resetUrlState();
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm" data-testid="employees-table">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all employees on current page"
                    data-testid="select-all-current-page"
                    checked={allCurrentPageSelected}
                    onChange={handleToggleSelectCurrentPage}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                </th>

                <th aria-sort={getAriaSort('fullName')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-fullName"
                    onClick={() => handleSortColumn('fullName')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Employee
                    {renderSortIcon('fullName')}
                  </button>
                </th>

                <th aria-sort={getAriaSort('email')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-email"
                    onClick={() => handleSortColumn('email')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Email
                    {renderSortIcon('email')}
                  </button>
                </th>

                <th aria-sort={getAriaSort('department')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-department"
                    onClick={() => handleSortColumn('department')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Department
                    {renderSortIcon('department')}
                  </button>
                </th>

                <th aria-sort={getAriaSort('roleTitle')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-roleTitle"
                    onClick={() => handleSortColumn('roleTitle')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Role
                    {renderSortIcon('roleTitle')}
                  </button>
                </th>

                <th aria-sort={getAriaSort('status')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-status"
                    onClick={() => handleSortColumn('status')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Status
                    {renderSortIcon('status')}
                  </button>
                </th>

                <th aria-sort={getAriaSort('salaryUsd')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-salaryUsd"
                    onClick={() => handleSortColumn('salaryUsd')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Salary
                    {renderSortIcon('salaryUsd')}
                  </button>
                </th>

                <th aria-sort={getAriaSort('hireDate')} className="px-4 py-3">
                  <button
                    type="button"
                    data-testid="sort-col-hireDate"
                    onClick={() => handleSortColumn('hireDate')}
                    className="inline-flex items-center gap-1 font-semibold uppercase hover:text-slate-900"
                  >
                    Hire Date
                    {renderSortIcon('hireDate')}
                  </button>
                </th>

                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {currentItems.map((emp) => (
                <EmployeeTableRow
                  key={emp.id}
                  employee={emp}
                  isSelected={selectedIds.has(emp.id)}
                  canMutate={canMutate}
                  isRowMutating={mutatingRowIds.has(emp.id)}
                  onToggleSelect={handleToggleSelectRow}
                  onEdit={handleOpenEditModal}
                  onDelete={handleDeleteRow}
                  onQuickToggleStatus={handleQuickToggleStatus}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {employeesQuery.data ? (
        <div
          data-testid="pagination-footer"
          className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600"
        >
          <div className="flex items-center gap-3">
            <span data-testid="pagination-summary">
              Page <strong>{employeesQuery.data.currentPage}</strong> of{' '}
              <strong>{employeesQuery.data.totalPages}</strong> (
              {employeesQuery.data.totalItems.toLocaleString()} total records)
            </span>

            <label htmlFor="page-size-select" className="sr-only">
              Rows per page
            </label>
            <select
              id="page-size-select"
              aria-label="Rows per page"
              data-testid="page-size-select"
              value={urlState.pageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                updateUrlState((prev) => ({
                  ...prev,
                  pageSize: nextSize,
                  page: 1,
                }));
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="page-first-btn"
              disabled={employeesQuery.data.currentPage <= 1}
              onClick={() => updateUrlState((prev) => ({ ...prev, page: 1 }))}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              First
            </button>

            <button
              type="button"
              data-testid="page-prev-btn"
              disabled={employeesQuery.data.currentPage <= 1}
              onClick={() =>
                updateUrlState((prev) => ({
                  ...prev,
                  page: Math.max(1, prev.page - 1),
                }))
              }
              className="rounded border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>

            <button
              type="button"
              data-testid="page-next-btn"
              disabled={employeesQuery.data.currentPage >= employeesQuery.data.totalPages}
              onClick={() =>
                updateUrlState((prev) => ({
                  ...prev,
                  page: prev.page + 1,
                }))
              }
              className="rounded border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next Page
            </button>

            <button
              type="button"
              data-testid="page-last-btn"
              disabled={employeesQuery.data.currentPage >= employeesQuery.data.totalPages}
              onClick={() =>
                updateUrlState((prev) => ({
                  ...prev,
                  page: employeesQuery.data?.totalPages ?? 1,
                }))
              }
              className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      ) : null}

      <EmployeeQuickModal
        isOpen={isModalOpen}
        mode={modalMode}
        initialEmployee={editingEmployee}
        isSubmitting={saveModalMutation.isPending}
        errorMessage={modalError}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (values) => {
          await saveModalMutation.mutateAsync(values);
        }}
      />
    </section>
  );
}