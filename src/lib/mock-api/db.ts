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

export const MOCK_SERVER_SESSIONS_STORAGE_KEY = 'nexus_mock_server_db_sessions_v1';
export const MOCK_SERVER_EMPLOYEE_DELTAS_KEY = 'nexus_mock_server_db_deltas_v1';

interface EmployeeMutationDeltas {
  readonly upserted: ReadonlyArray<Employee>;
  readonly deletedIds: ReadonlyArray<string>;
}

export class MockDatabase {
  private organizations: Map<string, Organization> = new Map();
  private accounts: Map<string, MockCredentialAccount> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();
  private baseSeededEmployees: Map<string, Employee> = new Map();
  private employees: Map<string, Employee> = new Map();
  private emailIndexByOrg: Map<string, Map<string, Employee>> = new Map();
  private upsertedEmployees: Map<string, Employee> = new Map();
  private deletedEmployeeIds: Set<string> = new Set();
  private lastSyncedDeltasRaw: string | null = null;
  private nextEmployeeSequence = 10201;
  private mutationIdempotencyCache: Map<string, unknown> = new Map();
  private csvImportJobs: Map<string, CsvImportJob> = new Map();

  constructor(seedCount: number = env.NEXT_PUBLIC_DEFAULT_SEED_COUNT) {
    this.initializeData(seedCount);
    this.hydrateSessionsFromStorage();
    this.syncEmployeesFromStorage(true);
  }

  private rebuildEmailIndex(): void {
    this.emailIndexByOrg.clear();
    for (const org of this.organizations.keys()) {
      this.emailIndexByOrg.set(org, new Map());
    }
    for (const emp of this.employees.values()) {
      let orgMap = this.emailIndexByOrg.get(emp.organizationId);
      if (!orgMap) {
        orgMap = new Map();
        this.emailIndexByOrg.set(emp.organizationId, orgMap);
      }
      orgMap.set(emp.email.toLowerCase(), emp);
    }
  }

  private indexSingleEmployee(emp: Employee): void {
    let orgMap = this.emailIndexByOrg.get(emp.organizationId);
    if (!orgMap) {
      orgMap = new Map();
      this.emailIndexByOrg.set(emp.organizationId, orgMap);
    }
    orgMap.set(emp.email.toLowerCase(), emp);
  }

  private initializeData(seedCount: number): void {
    this.organizations.clear();
    this.accounts.clear();
    this.baseSeededEmployees.clear();
    this.employees.clear();
    this.upsertedEmployees.clear();
    this.deletedEmployeeIds.clear();
    this.lastSyncedDeltasRaw = null;
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
      this.baseSeededEmployees.set(emp.id, emp);
      this.employees.set(emp.id, emp);
    }
    this.nextEmployeeSequence = seedCount + 1;
    this.rebuildEmailIndex();
  }

  private hydrateSessionsFromStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(MOCK_SERVER_SESSIONS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as ReadonlyArray<SessionRecord>;
      if (Array.isArray(parsed)) {
        this.sessions.clear();
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
      window.localStorage.setItem(MOCK_SERVER_SESSIONS_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota errors
    }
  }

  private syncEmployeesFromStorage(force = false): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(MOCK_SERVER_EMPLOYEE_DELTAS_KEY);
      if (!force && raw === this.lastSyncedDeltasRaw) {
        return;
      }
      this.lastSyncedDeltasRaw = raw;

      this.employees = new Map(this.baseSeededEmployees);
      this.upsertedEmployees.clear();
      this.deletedEmployeeIds.clear();

      if (raw) {
        const parsed = JSON.parse(raw) as EmployeeMutationDeltas;
        if (parsed && Array.isArray(parsed.deletedIds)) {
          for (const id of parsed.deletedIds) {
            this.deletedEmployeeIds.add(id);
            this.employees.delete(id);
          }
        }
        if (parsed && Array.isArray(parsed.upserted)) {
          for (const emp of parsed.upserted) {
            if (emp && typeof emp.id === 'string') {
              this.upsertedEmployees.set(emp.id, emp);
              this.employees.set(emp.id, emp);
            }
          }
        }
      }
      this.rebuildEmailIndex();
    } catch {
      // Ignore malformed delta data
    }
  }

  private persistEmployeeDeltasToStorage(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      // To prevent 5MB localStorage quota overflow when importing 10,000 rows in bulk,
      // only persist deltas to localStorage when upserted size is within safe storage bounds (<= 1,500)
      if (this.upsertedEmployees.size > 1500) {
        return;
      }
      const deltas: EmployeeMutationDeltas = {
        upserted: Array.from(this.upsertedEmployees.values()),
        deletedIds: Array.from(this.deletedEmployeeIds.values()),
      };
      const raw = JSON.stringify(deltas);
      this.lastSyncedDeltasRaw = raw;
      window.localStorage.setItem(MOCK_SERVER_EMPLOYEE_DELTAS_KEY, raw);
    } catch {
      // Ignore storage quota errors during 10,000-row stress tests
    }
  }

  public reset(seedCount: number = env.NEXT_PUBLIC_DEFAULT_SEED_COUNT): void {
    this.sessions.clear();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(MOCK_SERVER_SESSIONS_STORAGE_KEY);
      window.sessionStorage.removeItem(MOCK_SERVER_EMPLOYEE_DELTAS_KEY);
      window.localStorage.removeItem(MOCK_SERVER_SESSIONS_STORAGE_KEY);
      window.localStorage.removeItem(MOCK_SERVER_EMPLOYEE_DELTAS_KEY);
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
    this.hydrateSessionsFromStorage();
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
    this.syncEmployeesFromStorage();
    const result: Employee[] = [];
    for (const emp of this.employees.values()) {
      if (emp.organizationId === organizationId) {
        result.push(emp);
      }
    }
    return result;
  }

  public getEmployeeById(employeeId: string): Employee | undefined {
    this.syncEmployeesFromStorage();
    return this.employees.get(employeeId);
  }

  public findEmployeeByEmailInOrg(organizationId: string, email: string): Employee | undefined {
    this.syncEmployeesFromStorage();
    const normalized = email.trim().toLowerCase();
    return this.emailIndexByOrg.get(organizationId)?.get(normalized);
  }

  public setEmployee(employee: Employee): void {
    this.syncEmployeesFromStorage();
    const previous = this.employees.get(employee.id);
    if (previous && previous.email.toLowerCase() !== employee.email.toLowerCase()) {
      this.emailIndexByOrg.get(previous.organizationId)?.delete(previous.email.toLowerCase());
    }
    this.employees.set(employee.id, employee);
    this.indexSingleEmployee(employee);
    this.deletedEmployeeIds.delete(employee.id);
    this.upsertedEmployees.set(employee.id, employee);
    this.persistEmployeeDeltasToStorage();
  }

  /**
   * High-speed O(N) batch insert for 10,000-row CSV imports so localStorage is not
   * serialized on every individual row.
   */
  public setEmployeesBulk(newEmployees: ReadonlyArray<Employee>): void {
    this.syncEmployeesFromStorage();
    for (const employee of newEmployees) {
      this.employees.set(employee.id, employee);
      this.indexSingleEmployee(employee);
      this.deletedEmployeeIds.delete(employee.id);
      this.upsertedEmployees.set(employee.id, employee);
    }
    this.persistEmployeeDeltasToStorage();
  }

  public deleteEmployee(employeeId: string): boolean {
    this.syncEmployeesFromStorage();
    const existing = this.employees.get(employeeId);
    const existed = this.employees.delete(employeeId);
    if (existed && existing) {
      this.emailIndexByOrg.get(existing.organizationId)?.delete(existing.email.toLowerCase());
      this.upsertedEmployees.delete(employeeId);
      this.deletedEmployeeIds.add(employeeId);
      this.persistEmployeeDeltasToStorage();
    }
    return existed;
  }

  public generateNextEmployeeId(): string {
    while (
      this.employees.has(`emp-${String(this.nextEmployeeSequence).padStart(5, '0')}`) ||
      this.deletedEmployeeIds.has(`emp-${String(this.nextEmployeeSequence).padStart(5, '0')}`)
    ) {
      this.nextEmployeeSequence += 1;
    }
    const id = `emp-${String(this.nextEmployeeSequence).padStart(5, '0')}`;
    this.nextEmployeeSequence += 1;
    return id;
  }

  public getTotalEmployeeCount(): number {
    this.syncEmployeesFromStorage();
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