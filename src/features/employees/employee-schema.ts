import { z } from 'zod';
import type {
  Employee,
  EmployeeDepartment,
  EmployeeRoleTitle,
  EmployeeStatus,
} from '@/types/domain';

export const EMPLOYEE_DEPARTMENTS: ReadonlyArray<EmployeeDepartment> = [
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Finance',
  'Operations',
  'People',
  'Security',
];

export const EMPLOYEE_ROLE_TITLES: ReadonlyArray<EmployeeRoleTitle> = [
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

export const EMPLOYEE_STATUSES: ReadonlyArray<EmployeeStatus> = [
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'OFFBOARDED',
];

export const employeeFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'First name must be at least 2 characters.')
    .max(60, 'First name cannot exceed 60 characters.'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Last name must be at least 2 characters.')
    .max(60, 'Last name cannot exceed 60 characters.'),
  email: z
    .string()
    .trim()
    .min(1, 'Work email is required.')
    .email('Please enter a valid work email address.'),
  department: z.enum([
    'Engineering',
    'Product',
    'Design',
    'Sales',
    'Finance',
    'Operations',
    'People',
    'Security',
  ]),
  roleTitle: z.enum([
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
  ]),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'OFFBOARDED']),
  salaryUsd: z.coerce
    .number({ invalid_type_error: 'Salary must be a valid number.' })
    .int('Salary must be a whole dollar amount.')
    .min(30000, 'Annual salary must be at least $30,000.')
    .max(1000000, 'Annual salary cannot exceed $1,000,000.'),
  hireDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Hire date must be in YYYY-MM-DD format.'),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export interface ConflictingFieldDiff<K extends keyof EmployeeFormValues = keyof EmployeeFormValues> {
  readonly field: K;
  readonly label: string;
  readonly serverValue: EmployeeFormValues[K];
  readonly clientValue: EmployeeFormValues[K];
  readonly isDifferent: boolean;
}

const FIELD_LABELS: Readonly<Record<keyof EmployeeFormValues, string>> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Work Email',
  department: 'Department',
  roleTitle: 'Role Title',
  status: 'Employment Status',
  salaryUsd: 'Annual Salary (USD)',
  hireDate: 'Hire Date',
};

export function extractFormValuesFromEmployee(employee: Employee): EmployeeFormValues {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    department: employee.department,
    roleTitle: employee.roleTitle,
    status: employee.status,
    salaryUsd: employee.salaryUsd,
    hireDate: employee.hireDate,
  };
}

export function computeConflictDiffs(
  serverRecord: Employee,
  clientValues: EmployeeFormValues
): ReadonlyArray<ConflictingFieldDiff> {
  const serverValues = extractFormValuesFromEmployee(serverRecord);
  const keys = Object.keys(FIELD_LABELS) as Array<keyof EmployeeFormValues>;

  return keys.map((field) => {
    const sVal = serverValues[field];
    const cVal = clientValues[field];
    return {
      field,
      label: FIELD_LABELS[field],
      serverValue: sVal,
      clientValue: cVal,
      isDifferent: String(sVal) !== String(cVal),
    };
  });
}