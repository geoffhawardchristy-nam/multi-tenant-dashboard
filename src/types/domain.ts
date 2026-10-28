export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'VIEWER';

export type Permission =
  | 'org:switch'
  | 'employee:read'
  | 'employee:create'
  | 'employee:update'
  | 'employee:delete'
  | 'employee:bulk_delete'
  | 'employee:import_csv';

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlyArray<Permission>>> = {
  SUPER_ADMIN: [
    'org:switch',
    'employee:read',
    'employee:create',
    'employee:update',
    'employee:delete',
    'employee:bulk_delete',
    'employee:import_csv',
  ],
  ORG_ADMIN: [
    'employee:read',
    'employee:create',
    'employee:update',
    'employee:delete',
    'employee:bulk_delete',
    'employee:import_csv',
  ],
  VIEWER: ['employee:read'],
};

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: 'ENTERPRISE' | 'GROWTH' | 'STARTER';
  readonly createdAt: string;
}

export type EmployeeDepartment =
  | 'Engineering'
  | 'Product'
  | 'Design'
  | 'Sales'
  | 'Finance'
  | 'Operations'
  | 'People'
  | 'Security';

export type EmployeeRoleTitle =
  | 'Staff Engineer'
  | 'Senior Engineer'
  | 'Software Engineer'
  | 'Product Manager'
  | 'Product Designer'
  | 'Account Executive'
  | 'Financial Analyst'
  | 'Operations Lead'
  | 'HR Specialist'
  | 'Security Architect';

export type EmployeeStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'OFFBOARDED';

export interface Employee {
  readonly id: string;
  readonly organizationId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly email: string;
  readonly department: EmployeeDepartment;
  readonly roleTitle: EmployeeRoleTitle;
  readonly status: EmployeeStatus;
  readonly salaryUsd: number;
  readonly hireDate: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  readonly organizationId: string;
}

export interface SessionRecord {
  readonly token: string;
  readonly user: AuthenticatedUser;
  readonly activeOrganizationId: string;
  readonly expiresAtMs: number;
}

export type CsvRowStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED_DUPLICATE_IN_CSV'
  | 'SKIPPED_EXISTING_IN_ORG'
  | 'INVALID';

export type CsvJobState = 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_FAILURE' | 'CANCELLED';

export interface CsvImportRowState {
  readonly rowNumber: number;
  readonly idempotencyKey: string;
  readonly rawEmail: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly department: EmployeeDepartment;
  readonly roleTitle: EmployeeRoleTitle;
  readonly status: EmployeeStatus;
  readonly salaryUsd: number;
  readonly hireDate: string;
  readonly processingStatus: CsvRowStatus;
  readonly errorMessage?: string;
  readonly createdEmployeeId?: string;
}

export interface CsvImportJob {
  readonly jobId: string;
  readonly organizationId: string;
  readonly createdByUserId: string;
  readonly fileName: string;
  readonly totalRows: number;
  readonly state: CsvJobState;
  readonly createdAt: string;
  readonly rows: ReadonlyArray<CsvImportRowState>;
}