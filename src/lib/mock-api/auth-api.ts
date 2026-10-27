import { env } from '@/config/env';
import type {
  LoginRequest,
  SecurityProbeRequest,
  SessionContextResponse,
  SwitchOrganizationRequest,
  TenantOverviewResponse,
} from '@/types/api';
import type { EmployeeDepartment, Organization, SessionRecord } from '@/types/domain';
import { mockDb } from './db';
import { mockApiEngine } from './engine';
import { MockApiError } from './errors';

function buildSessionContextResponse(session: SessionRecord): SessionContextResponse {
  const activeOrganization = mockDb.getOrganizationById(session.activeOrganizationId);
  if (!activeOrganization) {
    throw new MockApiError({
      status: 404,
      code: 'NOT_FOUND',
      message: `Active organization "${session.activeOrganizationId}" was not found.`,
    });
  }

  const allOrganizations = mockDb.getOrganizations();
  const availableOrganizations: ReadonlyArray<Organization> =
    session.user.role === 'SUPER_ADMIN'
      ? allOrganizations
      : allOrganizations.filter((org) => org.id === session.user.organizationId);

  return {
    token: session.token,
    user: session.user,
    activeOrganization,
    availableOrganizations,
    expiresAtMs: session.expiresAtMs,
  };
}

function generateSessionToken(userId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `sess_${userId}_${Date.now()}_${randomPart}`;
}

export const mockAuthApi = {
  async login(
    request: LoginRequest,
    signal?: AbortSignal
  ): Promise<SessionContextResponse> {
    return mockApiEngine.execute({
      endpoint: 'auth.login',
      signal,
      handler: () => {
        const email = request.email.trim().toLowerCase();
        const account = mockDb.findAccountByEmail(email);

        if (!account || account.passwordPlain !== request.passwordPlain) {
          throw new MockApiError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password.',
          });
        }

        const ttlMs = env.NEXT_PUBLIC_SESSION_TTL_MINUTES * 60 * 1000;
        const session: SessionRecord = {
          token: generateSessionToken(account.user.id),
          user: { ...account.user },
          activeOrganizationId: account.user.organizationId,
          expiresAtMs: Date.now() + ttlMs,
        };

        mockDb.createSession(session);
        return buildSessionContextResponse(session);
      },
    });
  },

  async logout(token: string | null | undefined): Promise<{ readonly success: true }> {
    return mockApiEngine.execute({
      endpoint: 'auth.logout',
      handler: () => {
        if (token) {
          mockDb.deleteSession(token);
        }
        return { success: true };
      },
    });
  },

  async getSessionContext(
    token: string | null | undefined,
    signal?: AbortSignal
  ): Promise<SessionContextResponse> {
    return mockApiEngine.execute({
      endpoint: 'auth.getSessionContext',
      signal,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(token, 'employee:read');
        return buildSessionContextResponse(session);
      },
    });
  },

  async switchOrganization(
    request: SwitchOrganizationRequest,
    signal?: AbortSignal
  ): Promise<SessionContextResponse> {
    return mockApiEngine.execute({
      endpoint: 'auth.switchOrganization',
      signal,
      handler: () => {
        mockDb.requireAuthorizedSession(request.token, 'org:switch');

        const targetOrg = mockDb.getOrganizationById(request.targetOrganizationId);
        if (!targetOrg) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: `Organization "${request.targetOrganizationId}" does not exist.`,
          });
        }

        const updatedSession = mockDb.updateSession(request.token, (prev) => ({
          ...prev,
          activeOrganizationId: targetOrg.id,
        }));

        return buildSessionContextResponse(updatedSession);
      },
    });
  },

  async forceExpireSession(token: string): Promise<{ readonly expired: true }> {
    return mockApiEngine.execute({
      endpoint: 'auth.forceExpireSession',
      customDelayMs: 5,
      handler: () => {
        mockDb.updateSession(token, (prev) => ({
          ...prev,
          expiresAtMs: Date.now() - 5000,
        }));
        return { expired: true };
      },
    });
  },

  async getTenantOverview(
    params: {
      readonly token: string | null | undefined;
      readonly organizationId: string;
    },
    signal?: AbortSignal
  ): Promise<TenantOverviewResponse> {
    return mockApiEngine.execute({
      endpoint: 'tenant.getOverview',
      signal,
      handler: () => {
        const session = mockDb.requireAuthorizedSession(
          params.token,
          'employee:read',
          params.organizationId
        );

        const organization = mockDb.getOrganizationById(session.activeOrganizationId);
        if (!organization) {
          throw new MockApiError({
            status: 404,
            code: 'NOT_FOUND',
            message: 'Organization not found.',
          });
        }

        const employees = mockDb.getEmployeesByOrganization(organization.id);

        let activeCount = 0;
        let invitedCount = 0;
        let suspendedCount = 0;

        const departmentBreakdown: Record<EmployeeDepartment, number> = {
          Engineering: 0,
          Product: 0,
          Design: 0,
          Sales: 0,
          Finance: 0,
          Operations: 0,
          People: 0,
          Security: 0,
        };

        for (const emp of employees) {
          if (emp.status === 'ACTIVE') activeCount += 1;
          else if (emp.status === 'INVITED') invitedCount += 1;
          else if (emp.status === 'SUSPENDED') suspendedCount += 1;

          departmentBreakdown[emp.department] =
            (departmentBreakdown[emp.department] ?? 0) + 1;
        }

        const sampleEmployees = employees.slice(0, 5).map((emp) => ({
          id: emp.id,
          fullName: emp.fullName,
          email: emp.email,
          department: emp.department,
          roleTitle: emp.roleTitle,
          status: emp.status,
          organizationId: emp.organizationId,
        }));

        return {
          organization,
          totalEmployees: employees.length,
          activeCount,
          invitedCount,
          suspendedCount,
          departmentBreakdown,
          sampleEmployees,
        };
      },
    });
  },

  async attemptSecurityProbe(
    request: SecurityProbeRequest
  ): Promise<{ readonly allowed: true; readonly effectiveRole: string }> {
    return mockApiEngine.execute({
      endpoint: 'security.probe',
      handler: () => {
        if (request.operation === 'SWITCH_ORG') {
          const session = mockDb.requireAuthorizedSession(request.token, 'org:switch');
          return { allowed: true, effectiveRole: session.user.role };
        }

        if (request.operation === 'READ_TENANT') {
          const session = mockDb.requireAuthorizedSession(
            request.token,
            'employee:read',
            request.requestedOrganizationId
          );
          return { allowed: true, effectiveRole: session.user.role };
        }

        const session = mockDb.requireAuthorizedSession(
          request.token,
          'employee:update',
          request.requestedOrganizationId
        );

        if (request.targetEmployeeId) {
          const targetRecord = mockDb.getEmployeeById(request.targetEmployeeId);
          if (!targetRecord) {
            throw new MockApiError({
              status: 404,
              code: 'NOT_FOUND',
              message: `Employee "${request.targetEmployeeId}" not found.`,
            });
          }

          if (targetRecord.organizationId !== session.activeOrganizationId) {
            throw new MockApiError({
              status: 403,
              code: 'CROSS_TENANT_ACCESS_DENIED',
              message: `Record "${request.targetEmployeeId}" belongs to another organization and cannot be accessed or mutated.`,
            });
          }
        }

        return { allowed: true, effectiveRole: session.user.role };
      },
    });
  },
};