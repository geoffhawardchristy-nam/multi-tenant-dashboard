import { env } from '@/config/env';
import type {
  CsvImportJob,
  Employee,
  Organization,
  Permission,
  SessionRecord,
} from '@/types/domain';
import { ROLE_PERMISSIONS } from '@/types/domain';
import { MockApiError } from './errors';
import {
  generateSeedEmployees,
  SEED_ACCOUNTS,
  SEED_ORGANIZATIONS,
  type MockCredentialAccount,
} from './seed';

const MOCK_SERVER_SESSIONS_STORAGE_KEY = 'nexus_mock_server_db_sessions_v1';

export class MockDatabase {
  private organizations: Map<string, Organization> = new Map();
  private accounts: Map<string, MockCredentialAccount> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();
  private employees: Map<string, Employee> = new Map();
  private mutationIdempotencyCache: Map<string, unknown> = new Map();
  private csvImportJobs: Map<string, CsvImportJob> = new Map();

  constructor(seedCount: number = env.NEXT_PUBLIC_DEFAULT_SEED_COUNT) {
    this. initializeData(seedCount);
    this.hydrateSessionsFromStorage();
  }

  private initializeData(seedCount: number): void {
    this.organizations.clear();
    this.accounts.clear();
    this.employees.clear();
    this.mutationIdempotencyCache.clear();
    this.csvImportJobs.clear();

    for (const org of SEED_ORGANIZATIONS) {
      this.organizations.set(org.id, org);
    }

    for (const account of SEED_ACCOUNTS) {
      this.accounts.set(account.user.email.toLowerCase(), account);
    }

    const seededEmployees = generateSeedEmployees(seedCount);
    for (const emp of seededEmployees) {
      this.employees.set(emp.id, emp);
    }
  }

  private hydrateSessionsFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(MOCK_SERVER_SESSIONS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as ReadonlyArray<SessionRecord>;
      if (Array.isArray(parsed)) {
        for (const record of parsed) {
          if (record && typeof record.token === 'string') {
            this.sessions.set(record.token, record);
          }
        }
      }
    } catch {
      // Ignore malformed storage data
    }
  }

  private persistSessionsToStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const serialized = JSON.stringify(Array.from(this.sessions.values()));
      window.sessionStorage.setItem(MOCK_SERVER_SESSIONS_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota errors in test environments
    }
  }

  public reset(seedCount: number = env.NEXT_PUBLIC_DEFAULT_SEED_COUNT): void {
    this.sessions.clear();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(MOCK_SERVER_SESSIONS_STORAGE_KEY);
    }
    this.initializeData(seedCount);
  }

  public getOrganizations(): Organization[] {
    return Array.from(this.organizations.values());
  }

  public getOrganizationById(orgId: string): Organization | undefined {
    return this.organizations.get(orgId);
  }

  public findAccountByEmail(email: string): MockCredentialAccount | undefined {
    return this.accounts.get(email.trim().toLowerCase());
  }

  public createSession(session: SessionRecord): void {
    this.hydrateSessionsFromStorage();
    this.sessions.set(session.token, session);
    this.persistSessionsToStorage();
  }

  public getSession(token: string): SessionRecord | undefined {
    if (!this.sessions.has(token)) {
      this.hydrateSessionsFromStorage();
    }
    return this.sessions.get(token);
  }

  public updateSession(
    token: string,
    updater: (prev: SessionRecord) => SessionRecord
  ): SessionRecord {
    const existing = this.getSession(token);
    if (!existing) {
      throw new MockApiError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Session not found. Please sign in.',
      });
    }
    const updated = updater(existing);
    this.sessions.set(token, updated);
    this.persistSessionsToStorage();
    return updated;
  }

  public deleteSession(token: string): void {
    this.hydrateSessionsFromStorage();
    this.sessions.delete(token);
    this.persistSessionsToStorage();
  }

  public requireAuthorizedSession(
    token: string | null | undefined,
    requiredPermission: Permission,
    requestedOrganizationId?: string
  ): SessionRecord {
    if (!token) {
      throw new MockApiError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication token is required.',
      });
    }

    const session = this.getSession(token);
    if (!session) {
      throw new MockApiError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid or unknown session token.',
      });
    }

    if (Date.now() > session.expiresAtMs) {
      this.deleteSession(token);
      throw new MockApiError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
      });
    }

    const allowedPermissions = ROLE_PERMISSIONS[session.user.role];
    if (!allowedPermissions.includes(requiredPermission)) {
      throw new MockApiError({
        status: 403,
        code: 'FORBIDDEN',
        message: `Role "${session.user.role}" does not have permission "${requiredPermission}".`,
      });
    }

    if (requestedOrganizationId !== undefined) {
      if (
        session.user.role !== 'SUPER_ADMIN' &&
        requestedOrganizationId !== session.user.organizationId
      ) {
        throw new MockApiError({
          status: 403,
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message:
            'Cross-tenant access denied: you cannot access records outside your organization.',
        });
      }

      if (requestedOrganizationId !== session.activeOrganizationId) {
        throw new MockApiError({
          status: 403,
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message:
            'Requested organization does not match the active tenant context on the server.',
        });
      }
    }

    return session;
  }

  public getEmployeesByOrganization(organizationId: string): Employee[] {
    const result: Employee[] = [];
    for (const emp of this.employees.values()) {
      if (emp.organizationId === organizationId) {
        result.push(emp);
      }
    }
    return result;
  }

  public getEmployeeById(employeeId: string): Employee | undefined {
    return this.employees.get(employeeId);
  }

  public setEmployee(employee: Employee): void {
    this.employees.set(employee.id, employee);
  }

  public deleteEmployee(employeeId: string): boolean {
    return this.employees.delete(employeeId);
  }

  public getTotalEmployeeCount(): number {
    return this.employees.size;
  }

  public getIdempotentResult<T>(key: string): T | undefined {
    return this.mutationIdempotencyCache.get(key) as T | undefined;
  }

  public setIdempotentResult<T>(key: string, value: T): void {
    this.mutationIdempotencyCache.set(key, value);
  }

  public getCsvImportJob(jobId: string): CsvImportJob | undefined {
    return this.csvImportJobs.get(jobId);
  }

  public setCsvImportJob(job: CsvImportJob): void {
    this.csvImportJobs.set(job.jobId, job);
  }
}

export const mockDb = new MockDatabase();