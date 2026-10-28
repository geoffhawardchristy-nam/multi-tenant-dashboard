import { env } from '@/config/env';
import type { FailureInjectionRule } from '@/types/api';
import { isMockApiError, MockApiError } from './errors';

export interface MockRequestOptions<TResult> {
  readonly endpoint: string;
  readonly signal?: AbortSignal;
  readonly customDelayMs?: number;
  readonly handler: () => TResult | Promise<TResult>;
}

export interface MockEngineSnapshot {
  readonly isOffline: boolean;
  readonly isBrowserHardwareOffline: boolean;
  readonly baseLatencyMs: number;
  readonly jitterMaxMs: number;
  readonly requestTimeoutMs: number;
  readonly failureRules: ReadonlyArray<FailureInjectionRule>;
}

type EngineListener = () => void;

const RATE_LIMIT_WINDOW_MS = 2000;
const RATE_LIMIT_MAX_BURST = 6;
const RATE_LIMIT_EXEMPT_ENDPOINTS = new Set([
  'csv.processChunk',
  'csv.getJobStatus',
  'auth.getSessionContext',
  'employees.list',
]);

class MockApiEngine {
  private manualOffline = false;
  private browserHardwareOffline = false;
  private baseLatencyMs: number = env.NEXT_PUBLIC_MOCK_BASE_LATENCY_MS;
  private jitterMaxMs = 0;
  private requestTimeoutMs = 2500;
  private failureRules: FailureInjectionRule[] = [];
  private endpointDelayOverrides: Map<string, number> = new Map();
  private endpointCallTimestamps: Map<string, number[]> = new Map();
  private listeners: Set<EngineListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.browserHardwareOffline = window.navigator.onLine === false;

      window.addEventListener('offline', () => {
        this.browserHardwareOffline = true;
        this.notifyListeners();
      });

      window.addEventListener('online', () => {
        this.browserHardwareOffline = false;
        this.notifyListeners();
      });
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private checkRealHardwareOffline(): boolean {
    if (typeof window !== 'undefined' && window.navigator.onLine === false) {
      this.browserHardwareOffline = true;
    }
    return this.browserHardwareOffline;
  }

  public getSnapshot(): MockEngineSnapshot {
    const hwOffline = this.checkRealHardwareOffline();
    return {
      isOffline: this.manualOffline || hwOffline,
      isBrowserHardwareOffline: hwOffline,
      baseLatencyMs: this.baseLatencyMs,
      jitterMaxMs: this.jitterMaxMs,
      requestTimeoutMs: this.requestTimeoutMs,
      failureRules: [...this.failureRules],
    };
  }

  public setOffline(offline: boolean): void {
    this.manualOffline = offline;
    this.notifyListeners();
  }

  public getOffline(): boolean {
    return this.manualOffline || this.checkRealHardwareOffline();
  }

  public setBaseLatencyMs(ms: number): void {
    this.baseLatencyMs = Math.max(0, ms);
    this.notifyListeners();
  }

  public getBaseLatencyMs(): number {
    return this.baseLatencyMs;
  }

  public setJitterMaxMs(ms: number): void {
    this.jitterMaxMs = Math.max(0, ms);
    this.notifyListeners();
  }

  public getJitterMaxMs(): number {
    return this.jitterMaxMs;
  }

  public setRequestTimeoutMs(ms: number): void {
    this.requestTimeoutMs = Math.max(100, ms);
    this.notifyListeners();
  }

  public setEndpointDelayOverride(endpointKey: string, delayMs: number): void {
    this.endpointDelayOverrides.set(endpointKey, Math.max(0, delayMs));
    this.notifyListeners();
  }

  public clearEndpointDelayOverrides(): void {
    this.endpointDelayOverrides.clear();
    this.notifyListeners();
  }

  public enqueueFailureRule(rule: FailureInjectionRule): void {
    this.failureRules.push({ ...rule });
    this.notifyListeners();
  }

  public removeFailureRule(ruleId: string): void {
    this.failureRules = this.failureRules.filter((r) => r.id !== ruleId);
    this.notifyListeners();
  }

  public getFailureRules(): ReadonlyArray<FailureInjectionRule> {
    return [...this.failureRules];
  }

  public clearFailureRules(): void {
    this.failureRules = [];
    this.notifyListeners();
  }

  public resetEngine(): void {
    this.manualOffline = false;
    this.browserHardwareOffline =
      typeof window !== 'undefined' ? window.navigator.onLine === false : false;
    this.baseLatencyMs = env.NEXT_PUBLIC_MOCK_BASE_LATENCY_MS;
    this.jitterMaxMs = 0;
    this.requestTimeoutMs = 2500;
    this.failureRules = [];
    this.endpointDelayOverrides.clear();
    this.endpointCallTimestamps.clear();
    this.notifyListeners();
  }

  private enforceSlidingWindowRateLimit(endpoint: string): void {
    if (RATE_LIMIT_EXEMPT_ENDPOINTS.has(endpoint)) {
      return;
    }
    const now = Date.now();
    const recent = (this.endpointCallTimestamps.get(endpoint) ?? []).filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS
    );

    if (recent.length >= RATE_LIMIT_MAX_BURST) {
      throw new MockApiError({
        status: 429,
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded on "${endpoint}" (more than ${RATE_LIMIT_MAX_BURST} requests in ${
          RATE_LIMIT_WINDOW_MS / 1000
        }s). Please wait before retrying.`,
        retryAfterMs: 1000,
      });
    }

    recent.push(now);
    this.endpointCallTimestamps.set(endpoint, recent);
  }

  private consumeMatchingRule(endpoint: string): FailureInjectionRule | undefined {
    const index = this.failureRules.findIndex(
      (r) =>
        r.remainingTriggers > 0 &&
        (r.endpointPattern === '*' ||
          r.endpointPattern === endpoint ||
          endpoint.startsWith(r.endpointPattern))
    );

    if (index === -1) {
      return undefined;
    }

    const matched = this.failureRules[index];
    if (!matched) {
      return undefined;
    }

    const updatedTriggers = matched.remainingTriggers - 1;
    if (updatedTriggers <= 0) {
      this.failureRules.splice(index, 1);
    } else {
      this.failureRules[index] = {
        ...matched,
        remainingTriggers: updatedTriggers,
      };
    }

    this.notifyListeners();
    return matched;
  }

  public async execute<TResult>(options: MockRequestOptions<TResult>): Promise<TResult> {
    const { endpoint, signal, customDelayMs, handler } = options;

    if (signal?.aborted) {
      throw new MockApiError({
        status: 400,
        code: 'REQUEST_ABORTED',
        message: `Request to "${endpoint}" was aborted before dispatch.`,
      });
    }

    // 1. Real Hardware / Browser Offline or Manual Offline Check
    if (this.getOffline()) {
      throw new MockApiError({
        status: 503,
        code: 'NETWORK_OFFLINE',
        message: this.browserHardwareOffline
          ? 'Browser network connection is offline (Wi-Fi / Ethernet disconnected or DevTools Offline enabled).'
          : 'Network is offline. Please check your connection and try again.',
      });
    }

    // 2. Real Sliding-Window Rate Limiter Check
    this.enforceSlidingWindowRateLimit(endpoint);

    const matchedRule = this.consumeMatchingRule(endpoint);
    const overrideDelay = this.endpointDelayOverrides.get(endpoint);
    const jitter =
      this.jitterMaxMs > 0 ? Math.floor(Math.random() * (this.jitterMaxMs + 1)) : 0;
    const effectiveDelayMs =
      (matchedRule?.delayMs ?? customDelayMs ?? overrideDelay ?? this.baseLatencyMs) + jitter;

    // 3. Real Request Timeout Cutoff: if latency exceeds requestTimeoutMs, abort with HTTP 408
    if (effectiveDelayMs > this.requestTimeoutMs) {
      await this.waitWithAbort(this.requestTimeoutMs, signal, endpoint);
      throw new MockApiError({
        status: 408,
        code: 'NETWORK_TIMEOUT',
        message: `Request to "${endpoint}" timed out after ${this.requestTimeoutMs}ms.`,
      });
    }

    await this.waitWithAbort(effectiveDelayMs, signal, endpoint);

    if (this.getOffline()) {
      throw new MockApiError({
        status: 503,
        code: 'NETWORK_OFFLINE',
        message: 'Network connection was lost while request was in flight.',
      });
    }

    if (matchedRule) {
      this.throwInjectedFailure(matchedRule, endpoint);
    }

    try {
      return await handler();
    } catch (err: unknown) {
      if (isMockApiError(err)) {
        throw err;
      }
      throw new MockApiError({
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message:
          err instanceof Error
            ? err.message
            : `Unhandled server exception in "${endpoint}".`,
      });
    }
  }

  private waitWithAbort(
    delayMs: number,
    signal: AbortSignal | undefined,
    endpoint: string
  ): Promise<void> {
    if (delayMs <= 0) {
      if (signal?.aborted) {
        return Promise.reject(
          new MockApiError({
            status: 400,
            code: 'REQUEST_ABORTED',
            message: `Request to "${endpoint}" was aborted.`,
          })
        );
      }
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timerId);
        reject(
          new MockApiError({
            status: 400,
            code: 'REQUEST_ABORTED',
            message: `Request to "${endpoint}" was cancelled.`,
          })
        );
      };

      const timerId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private throwInjectedFailure(rule: FailureInjectionRule, endpoint: string): never {
    switch (rule.failureType) {
      case 'OFFLINE':
        throw new MockApiError({
          status: 503,
          code: 'NETWORK_OFFLINE',
          message: `Simulated offline error on "${endpoint}".`,
        });
      case 'TIMEOUT':
        throw new MockApiError({
          status: 408,
          code: 'NETWORK_TIMEOUT',
          message: `Request to "${endpoint}" timed out after waiting for server response.`,
        });
      case 'HTTP_401':
        throw new MockApiError({
          status: 401,
          code: 'SESSION_EXPIRED',
          message: `Session expired while calling "${endpoint}". Please sign in again.`,
        });
      case 'HTTP_403':
        throw new MockApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: `Access forbidden: you do not have permission to execute "${endpoint}".`,
        });
      case 'HTTP_409':
        throw new MockApiError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: `Conflict detected on "${endpoint}". Another process modified this resource.`,
        });
      case 'HTTP_429':
        throw new MockApiError({
          status: 429,
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded on "${endpoint}" (HTTP 429). Please retry shortly.`,
          retryAfterMs: 120,
        });
      case 'HTTP_500':
        throw new MockApiError({
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: `Internal server error (HTTP 500) occurred while processing "${endpoint}".`,
        });
    }
  }
}

export const mockApiEngine = new MockApiEngine();