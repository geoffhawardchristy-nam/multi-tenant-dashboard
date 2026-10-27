import { ROLE_PERMISSIONS, type Permission, type UserRole } from '@/types/domain';

export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) {
    return false;
  }
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes(permission);
}

export function canSwitchOrganization(role: UserRole | null | undefined): boolean {
  return hasPermission(role, 'org:switch');
}

export function canMutateEmployees(role: UserRole | null | undefined): boolean {
  return (
    hasPermission(role, 'employee:create') &&
    hasPermission(role, 'employee:update') &&
    hasPermission(role, 'employee:delete')
  );
}

export function canImportCsv(role: UserRole | null | undefined): boolean {
  return hasPermission(role, 'employee:import_csv');
}

export function getRoleBadgeInfo(role: UserRole): {
  readonly label: string;
  readonly badgeClass: string;
  readonly summary: string;
} {
  switch (role) {
    case 'SUPER_ADMIN':
      return {
        label: 'Super Admin',
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
        summary: 'Multi-tenant organization switching + full administrative privileges',
      };
    case 'ORG_ADMIN':
      return {
        label: 'Organization Admin',
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
        summary: 'Scoped to assigned organization with full employee & CSV management',
      };
    case 'VIEWER':
      return {
        label: 'Viewer (Read-Only)',
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
        summary: 'Scoped to assigned organization with strictly read-only permissions',
      };
  }
}