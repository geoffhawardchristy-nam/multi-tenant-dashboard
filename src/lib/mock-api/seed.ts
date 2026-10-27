import type {
  AuthenticatedUser,
  Employee,
  EmployeeDepartment,
  EmployeeRoleTitle,
  EmployeeStatus,
  Organization,
} from '@/types/domain';

export const SEED_ORGANIZATIONS: ReadonlyArray<Organization> = [
  {
    id: 'org-acme',
    name: 'Acme Cloud Systems',
    slug: 'acme-cloud',
    plan: 'ENTERPRISE',
    createdAt: '2023-01-15T08:00:00.000Z',
  },
  {
    id: 'org-globex',
    name: 'Globex FinTech Corp',
    slug: 'globex-fintech',
    plan: 'ENTERPRISE',
    createdAt: '2023-04-20T10:30:00.000Z',
  },
  {
    id: 'org-initech',
    name: 'Initech BioLabs',
    slug: 'initech-biolabs',
    plan: 'GROWTH',
    createdAt: '2024-02-01T12:00:00.000Z',
  },
];

export interface MockCredentialAccount {
  readonly user: AuthenticatedUser;
  readonly passwordPlain: string;
}

export const SEED_ACCOUNTS: ReadonlyArray<MockCredentialAccount> = [
  {
    user: {
      id: 'usr-super-1',
      email: 'superadmin@nexus.io',
      name: 'Elena Vance (Super Admin)',
      role: 'SUPER_ADMIN',
      organizationId: 'org-acme',
    },
    passwordPlain: 'SuperSecret!2026',
  },
  {
    user: {
      id: 'usr-admin-acme',
      email: 'admin@acme.io',
      name: 'Marcus Sterling (Acme Admin)',
      role: 'ORG_ADMIN',
      organizationId: 'org-acme',
    },
    passwordPlain: 'AcmeAdmin!2026',
  },
  {
    user: {
      id: 'usr-admin-globex',
      email: 'admin@globex.io',
      name: 'Priya Nair (Globex Admin)',
      role: 'ORG_ADMIN',
      organizationId: 'org-globex',
    },
    passwordPlain: 'GlobexAdmin!2026',
  },
  {
    user: {
      id: 'usr-viewer-acme',
      email: 'viewer@acme.io',
      name: 'Devon Brooks (Acme Viewer)',
      role: 'VIEWER',
      organizationId: 'org-acme',
    },
    passwordPlain: 'AcmeViewer!2026',
  },
];

// Note: 'Asad' and 'Rahul' are reserved exclusively for deterministic records emp-00001 and emp-00002
const FIRST_NAMES = [
  'Aarav',
  'Sophia',
  'Liam',
  'Noah',
  'Maya',
  'Zara',
  'Ethan',
  'Lucas',
  'Chloe',
  'Amara',
  'Mateo',
  'Ananya',
  'Kai',
  'Elena',
  'Nadia',
  'Julian',
  'Fatima',
  'Vikram',
  'Rohan',
  'kabir',
] as const;

const LAST_NAMES = [
  'Khan',
  'Sharma',
  'Patel',
  'Chen',
  'Rivera',
  'Kim',
  'Okafor',
  'Silva',
  'Nguyen',
  'Kowalski',
  'Bauer',
  'Hassan',
  'Mehta',
  'Sato',
  'Morgan',
  'Rossi',
  'Alvarez',
  'Lindqvist',
  'Iyer',
  'Park',
] as const;

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

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function capitalize(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

export function generateSeedEmployees(totalCount = 10200): Employee[] {
  const rand = createMulberry32(20261027);
  const employees: Employee[] = [];

  const acmeCount = Math.max(10000, totalCount - 200);
  const globexCount = 120;

  for (let i = 1; i <= totalCount; i++) {
    let organizationId = 'org-initech';
    let domain = 'initech.io';

    if (i <= acmeCount) {
      organizationId = 'org-acme';
      domain = 'acme.io';
    } else if (i <= acmeCount + globexCount) {
      organizationId = 'org-globex';
      domain = 'globex.io';
    }

    let firstName: string;
    let lastName: string;

    if (i === 1) {
      firstName = 'Asad';
      lastName = 'Khan';
    } else if (i === 2) {
      firstName = 'Rahul';
      lastName = 'Sharma';
    } else {
      const rawFirst = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)] ?? 'Alex';
      const rawLast = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)] ?? 'Smith';
      firstName = capitalize(rawFirst);
      lastName = capitalize(rawLast);
    }

    const department = DEPARTMENTS[Math.floor(rand() * DEPARTMENTS.length)] ?? 'Engineering';
    const roleTitle = ROLE_TITLES[Math.floor(rand() * ROLE_TITLES.length)] ?? 'Software Engineer';

    const statusRoll = rand();
    const status: EmployeeStatus =
      statusRoll < 0.8
        ? 'ACTIVE'
        : statusRoll < 0.9
          ? 'INVITED'
          : statusRoll < 0.96
            ? 'SUSPENDED'
            : 'OFFBOARDED';

    const salaryUsd = 70000 + Math.floor(rand() * 160000);
    const year = 2020 + Math.floor(rand() * 6);
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, '0');
    const day = String(1 + Math.floor(rand() * 28)).padStart(2, '0');
    const hireDate = `${year}-${month}-${day}`;

    const id = `emp-${String(i).padStart(5, '0')}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@${domain}`;

    employees.push({
      id,
      organizationId,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      department,
      roleTitle,
      status,
      salaryUsd,
      hireDate,
      updatedAt: '2026-01-10T09:00:00.000Z',
      version: 1,
    });
  }

  return employees;
}