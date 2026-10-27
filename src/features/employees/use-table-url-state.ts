'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import type { SortDirection, SortField } from '@/types/api';
import type { EmployeeDepartment, EmployeeRoleTitle, EmployeeStatus } from '@/types/domain';

const departmentValues = [
  'ALL',
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Finance',
  'Operations',
  'People',
  'Security',
] as const;

const roleTitleValues = [
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
] as const;

const statusValues = ['ALL', 'ACTIVE', 'INVITED', 'SUSPENDED', 'OFFBOARDED'] as const;

const sortFieldValues = [
  'fullName',
  'email',
  'department',
  'roleTitle',
  'status',
  'hireDate',
  'salaryUsd',
] as const;

const sortDirValues = ['asc', 'desc'] as const;

const urlQuerySchema = z.object({
  q: z.string().default(''),
  dept: z.enum(departmentValues).catch('ALL'),
  role: z.enum(roleTitleValues).catch('ALL'),
  status: z.enum(statusValues).catch('ALL'),
  sortBy: z.enum(sortFieldValues).catch('fullName'),
  sortDir: z.enum(sortDirValues).catch('asc'),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(200).catch(25),
});

export interface TableUrlState {
  readonly search: string;
  readonly department: EmployeeDepartment | 'ALL';
  readonly roleTitle: EmployeeRoleTitle | 'ALL';
  readonly status: EmployeeStatus | 'ALL';
  readonly sortBy: SortField;
  readonly sortDir: SortDirection;
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_TABLE_URL_STATE: TableUrlState = {
  search: '',
  department: 'ALL',
  roleTitle: 'ALL',
  status: 'ALL',
  sortBy: 'fullName',
  sortDir: 'asc',
  page: 1,
  pageSize: 25,
};

export function parseTableUrlStateFromSearch(searchString: string): TableUrlState {
  const params = new URLSearchParams(searchString);
  const raw = {
    q: params.get('q') ?? undefined,
    dept: params.get('dept') ?? undefined,
    role: params.get('role') ?? undefined,
    status: params.get('status') ?? undefined,
    sortBy: params.get('sortBy') ?? undefined,
    sortDir: params.get('sortDir') ?? undefined,
    page: params.get('page') ?? undefined,
    pageSize: params.get('pageSize') ?? undefined,
  };

  const parsed = urlQuerySchema.parse(raw);
  return {
    search: parsed.q,
    department: parsed.dept,
    roleTitle: parsed.role,
    status: parsed.status,
    sortBy: parsed.sortBy,
    sortDir: parsed.sortDir,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

export function serializeTableUrlStateToSearch(state: TableUrlState): string {
  const params = new URLSearchParams();
  if (state.search.trim().length > 0) {
    params.set('q', state.search.trim());
  }
  if (state.department !== 'ALL') {
    params.set('dept', state.department);
  }
  if (state.roleTitle !== 'ALL') {
    params.set('role', state.roleTitle);
  }
  if (state.status !== 'ALL') {
    params.set('status', state.status);
  }
  if (state.sortBy !== 'fullName') {
    params.set('sortBy', state.sortBy);
  }
  if (state.sortDir !== 'asc') {
    params.set('sortDir', state.sortDir);
  }
  if (state.page !== 1) {
    params.set('page', String(state.page));
  }
  if (state.pageSize !== 25) {
    params.set('pageSize', String(state.pageSize));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useTableUrlState(): {
  readonly urlState: TableUrlState;
  readonly updateUrlState: (updater: (prev: TableUrlState) => TableUrlState) => void;
  readonly resetUrlState: () => void;
} {
  const [urlState, setUrlState] = useState<TableUrlState>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_TABLE_URL_STATE;
    }
    return parseTableUrlStateFromSearch(window.location.search);
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handlePopState = () => {
      setUrlState(parseTableUrlStateFromSearch(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const updateUrlState = useCallback((updater: (prev: TableUrlState) => TableUrlState) => {
    setUrlState((prev) => {
      const next = updater(prev);
      if (typeof window !== 'undefined') {
        const searchStr = serializeTableUrlStateToSearch(next);
        const nextUrl = `${window.location.pathname}${searchStr}`;
        window.history.replaceState(null, '', nextUrl);
      }
      return next;
    });
  }, []);

  const resetUrlState = useCallback(() => {
    updateUrlState(() => DEFAULT_TABLE_URL_STATE);
  }, [updateUrlState]);

  return {
    urlState,
    updateUrlState,
    resetUrlState,
  };
}