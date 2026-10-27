import type {
  AuthenticatedUser,
  Employee,
  EmployeeDepartment,
  EmployeeRoleTitle,
  EmployeeStatus,
  Organization,
  UserRole,
} from './domain';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'CROSS_TENANT_ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_EMAIL'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_SERVER_ERROR'
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_OFFLINE'
  | 'REQUEST_ABORTED';

export type HttpStatusCode = 400 | 401 | 403 | 404 | 408 | 409 | 422 | 429 | 500 | 503;

export interface ConflictErrorDetails {
  readonly serverRecord: Employee;
  readonly attemptedVersion: number;
}

export interface ApiErrorPayload {
  readonly status: HttpStatusCode;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly conflictDetails?: ConflictErrorDetails;
  readonly retryAfterMs?: number;
  readonly timestamp: string;
}

export type SortField =
  | 'fullName'
  | 'email'
  | 'department'
  | 'roleTitle'
  | 'status'
  | 'hireDate'
  | 'salaryUsd';
export type SortDirection = 'asc' | 'desc';

export interface EmployeeListQueryParams {
  readonly token: string | null | undefined;
  readonly organizationId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly department?: EmployeeDepartment | 'ALL';
  readonly roleTitle?: EmployeeRoleTitle | 'ALL';
  readonly status?: EmployeeStatus | 'ALL';
  readonly sortBy?: SortField;
  readonly sortDir?: SortDirection;
}

export interface PaginatedResponse<TItem> {
  readonly items: ReadonlyArray<TItem>;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly currentPage: number;
  readonly pageSize: number;
  readonly organizationId: string;
}

export interface CreateEmployeeRequest {
  readonly token: string | null | undefined;
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly department: EmployeeDepartment;
  readonly roleTitle: EmployeeRoleTitle;
  readonly status: EmployeeStatus;
  readonly salaryUsd: number;
  readonly hireDate: string;
}

export interface UpdateEmployeeRequest {
  readonly token: string | null | undefined;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly expectedVersion: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly department: EmployeeDepartment;
  readonly roleTitle: EmployeeRoleTitle;
  readonly status: EmployeeStatus;
  readonly salaryUsd: number;
  readonly hireDate: string;
}

export interface DeleteEmployeeRequest {
  readonly token: string | null | undefined;
  readonly organizationId: string;
  readonly employeeId: string;
}

export interface BulkDeleteEmployeesRequest {
  readonly token: string | null | undefined;
  readonly organizationId: string;
  readonly employeeIds: ReadonlyArray<string>;
}

export interface BulkDeleteEmployeesResponse {
  readonly deletedCount: number;
  readonly deletedIds: ReadonlyArray<string>;
}

export interface LoginRequest {
  readonly email: string;
  readonly passwordPlain: string;
}

export interface SwitchOrganizationRequest {
  readonly token: string;
  readonly targetOrganizationId: string;
}

export interface SessionContextResponse {
  readonly token: string;
  readonly user: AuthenticatedUser;
  readonly activeOrganization: Organization;
  readonly availableOrganizations: ReadonlyArray<Organization>;
  readonly expiresAtMs: number;
}

export interface TenantOverviewResponse {
  readonly organization: Organization;
  readonly totalEmployees: number;
  readonly activeCount: number;
  readonly invitedCount: number;
  readonly suspendedCount: number;
  readonly departmentBreakdown: Readonly<Record<EmployeeDepartment, number>>;
  readonly sampleEmployees: ReadonlyArray<
    Pick<
      Employee,
      'id' | 'fullName' | 'email' | 'department' | 'roleTitle' | 'status' | 'organizationId'
    >
  >;
}

export interface SecurityProbeRequest {
  readonly token: string;
  readonly requestedOrganizationId: string;
  readonly targetEmployeeId?: string;
  readonly clientClaimedRole?: UserRole;
  readonly operation: 'READ_TENANT' | 'MUTATE_EMPLOYEE' | 'SWITCH_ORG';
}

export interface FailureInjectionRule {
  readonly id: string;
  readonly endpointPattern: string;
  readonly failureType:
    | 'HTTP_401'
    | 'HTTP_403'
    | 'HTTP_409'
    | 'HTTP_429'
    | 'HTTP_500'
    | 'TIMEOUT'
    | 'OFFLINE';
  readonly remainingTriggers: number;
  readonly delayMs?: number;
}