import type {
  BulkDeleteEmployeesRequest,
  BulkDeleteEmployeesResponse,
  CreateEmployeeRequest,
  DeleteEmployeeRequest,
  EmployeeListQueryParams,
  PaginatedResponse,
  SortDirection,
  SortField,
  UpdateEmployeeRequest,
} from '@/types/api';
import type { Employee } from '@/types/domain';
import { mockDb } from './db';
import { mockApiEngine } from './engine';
import { MockApiError } from './errors';

const searchTermLatencyMap: Map<string, number> = new Map();

export function setSearchTermDelayMs(searchTerm: string, delayMs: number): void {
  searchTermLatencyMap.set(searchTerm.trim().toLowerCase(), Math.max(0, delayMs));
}

export function clearSearchTermDelays(): void {
  searchTermLatencyMap.clear();
}

function compareEmployees(a: Employee, b: Employee, sortBy: SortField, sortDir: SortDirection): number {
  const multiplier = sortDir === 'asc' ? 1 : -1;
  let comparison = 0;

  if (sortBy === 'salaryUsd') {
    comparison = a.salaryUsd - b.salaryUsd;
  } else {
    const valA = String(a[sortBy]).toLowerCase();
    const valB = String(b[sortBy]).toLowerCase();
    comparison = valA.localeCompare(valB);
  }

  if (comparison !== 0) {
    return comparison * multiplier;
  }

  // Deterministic tie-breaker using stable employee ID
  return a.id.localeCompare(b.id) * multiplier;
}

export const mockEmployeesApi = {
  async list(
    params: EmployeeListQueryParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Employee>> {
    const normalizedSearch = (params.search ?? '').trim().toLowerCase();
    const customSearchDelay = normalizedSearch
      ? searchTermLatencyMap.get(normalizedSearch)
      : undefined;

    return mockApiEngine.execute({
      endpoint: 'employees.list',
      signal,
      customDelayMs: customSearchDelay,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          params.token,
          'employee:read',
          params.organizationId
        );

        const allOrgEmployees = mockDb.getEmployeesByOrganization(session.activeOrganizationId);

        const filtered = allOrgEmployees.filter((emp) => {
          if (
            params.department &&
            params.department !== 'ALL' &&
            emp.department !== params.department
          ) {
            return false;
          }
          if (
            params.roleTitle &&
            params.roleTitle !== 'ALL' &&
            emp.roleTitle !== params.roleTitle
          ) {
            return false;
          }
          if (params.status && params.status !== 'ALL' && emp.status !== params.status) {
            return false;
          }
          if (normalizedSearch.length > 0) {
            const matchesName = emp.fullName.toLowerCase().includes(normalizedSearch);
            const matchesEmail = emp.email.toLowerCase().includes(normalizedSearch);
            const matchesId = emp.id.toLowerCase().includes(normalizedSearch);
            const matchesRole = emp.roleTitle.toLowerCase().includes(normalizedSearch);
            const matchesDept = emp.department.toLowerCase().includes(normalizedSearch);
            if (!matchesName && !matchesEmail && !matchesId && !matchesRole && !matchesDept) {
              return false;
            }
          }
          return true;
        });

        const sortBy: SortField = params.sortBy ?? 'fullName';
        const sortDir: SortDirection = params.sortDir ?? 'asc';

        filtered.sort((a, b) => compareEmployees(a, b, sortBy, sortDir));

        const pageSize = Math.max(1, Math.min(500, params.pageSize));
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

        // Clamp page to [1, totalPages] so deleting the last item on the final page never strands the user
        const safePage = Math.max(1, Math.min(params.page, totalPages));
        const startOffset = (safePage - 1) * pageSize;
        const items = filtered.slice(startOffset, startOffset + pageSize);

        return {
          items,
          totalItems,
          totalPages,
          currentPage: safePage,
          pageSize,
          organizationId: session.activeOrganizationId,
        };
      },
    });
  },

  async create(request: CreateEmployeeRequest, signal?: AbortSignal): Promise<Employee> {
    return mockApiEngine.execute({
      endpoint: 'employees.create',
      signal,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:create',
          request.organizationId
        );

        const cached = mockDb.getIdempotentResult<Employee>(request.idempotencyKey);
        if (cached) {
          return cached;
        }

        const firstName = request.firstName.trim();
        const lastName = request.lastName.trim();
        const email = request.email.trim().toLowerCase();

        if (!firstName || !lastName || !email.includes('@')) {
          throw new MockApiError({
            status: 422,
            code: 'VALIDATION_ERROR',
            message: 'First name, last name, and a valid email address are required.',
          });
        }

        const duplicate = mockDb.findEmployeeByEmailInOrg(session.activeOrganizationId, email);
        if (duplicate) {
          throw new MockApiError({
            status: 409,
            code: 'DUPLICATE_EMAIL',
            message: `An employee with email "${email}" already exists in this organization.`,
            fieldErrors: {
              email: 'This email address is already registered in this organization.',
            },
          });
        }

        const newEmployee: Employee = {
          id: mockDb.generateNextEmployeeId(),
          organizationId: session.activeOrganizationId,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          email,
          department: request.department,
          roleTitle: request.roleTitle,
          status: request.status,
          salaryUsd: request.salaryUsd,
          hireDate: request.hireDate,
          updatedAt: new Date().toISOString(),
          version: 1,
        };

        mockDb.setEmployee(newEmployee);
        mockDb.setIdempotentResult(request.idempotencyKey, newEmployee);
        return newEmployee;
      },
    });
  },

  async update(request: UpdateEmployeeRequest, signal?: AbortSignal): Promise<Employee> {
    return mockApiEngine.execute({
      endpoint: 'employees.update',
      signal,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:update',
          request.organizationId
        );

        const existing = mockDb.getEmployeeById(request.employeeId);
        if (!existing) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: `Employee "${request.employeeId}" does not exist.`,
          });
        }

        if (existing.organizationId !== session.activeOrganizationId) {
          throw new MockApiError({
            status: 403,
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot update an employee belonging to another organization.',
          });
        }

        if (existing.version !== request.expectedVersion) {
          throw new MockApiError({
            status: 409,
            code: 'VERSION_CONFLICT',
            message: `Record "${existing.fullName}" was modified by another administrator (Server v${existing.version} vs. Your v${request.expectedVersion}).`,
            conflictDetails: {
              serverRecord: existing,
              attemptedVersion: request.expectedVersion,
            },
          });
        }

        const firstName = request.firstName.trim();
        const lastName = request.lastName.trim();
        const email = request.email.trim().toLowerCase();

        const emailOwner = mockDb.findEmployeeByEmailInOrg(session.activeOrganizationId, email);
        if (emailOwner && emailOwner.id !== existing.id) {
          throw new MockApiError({
            status: 409,
            code: 'DUPLICATE_EMAIL',
            message: `Another employee in this organization already uses "${email}".`,
            fieldErrors: {
              email: 'Email is already in use by another employee in this organization.',
            },
          });
        }

        const updated: Employee = {
          ...existing,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          email,
          department: request.department,
          roleTitle: request.roleTitle,
          status: request.status,
          salaryUsd: request.salaryUsd,
          hireDate: request.hireDate,
          updatedAt: new Date().toISOString(),
          version: existing.version + 1,
        };

        mockDb.setEmployee(updated);
        return updated;
      },
    });
  },

  async delete(
    request: DeleteEmployeeRequest,
    signal?: AbortSignal
  ): Promise<{ readonly deletedId: string }> {
    return mockApiEngine.execute({
      endpoint: 'employees.delete',
      signal,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:delete',
          request.organizationId
        );

        const existing = mockDb.getEmployeeById(request.employeeId);
        if (!existing) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: `Employee "${request.employeeId}" was not found.`,
          });
        }

        if (existing.organizationId !== session.activeOrganizationId) {
          throw new MockApiError({
            status: 403,
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot delete an employee belonging to another organization.',
          });
        }

        mockDb.deleteEmployee(existing.id);
        return { deletedId: existing.id };
      },
    });
  },

  async bulkDelete(
    request: BulkDeleteEmployeesRequest,
    signal?: AbortSignal
  ): Promise<BulkDeleteEmployeesResponse> {
    return mockApiEngine.execute({
      endpoint: 'employees.bulkDelete',
      signal,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:bulk_delete',
          request.organizationId
        );

        if (request.employeeIds.length === 0) {
          return { deletedCount: 0, deletedIds: [] };
        }

        // First pass: verify tenant isolation for all requested IDs before mutating
        for (const id of request.employeeIds) {
          const record = mockDb.getEmployeeById(id);
          if (record && record.organizationId !== session.activeOrganizationId) {
            throw new MockApiError({
              status: 403,
              code: 'CROSS_TENANT_ACCESS_DENIED',
              message: `Bulk delete rejected: record "${id}" belongs to another organization.`,
            });
          }
        }

        const deletedIds: string[] = [];
        for (const id of request.employeeIds) {
          if (mockDb.deleteEmployee(id)) {
            deletedIds.push(id);
          }
        }

        return {
          deletedCount: deletedIds.length,
          deletedIds,
        };
      },
    });
  },
};