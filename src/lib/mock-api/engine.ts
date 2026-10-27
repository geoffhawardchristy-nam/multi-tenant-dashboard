import { env } from '@/config/env';
import type { FailureInjectionRule } from '@/types/api';
import { MockApiError } from './errors';

export interface MockRequestOptions<TResult> {
  readonly endpoint: string;
  readonly signal?: AbortSignal;
  readonly customDelayMs?: number;
  readonly handler: () => TResult | Promise<TResult>;
}

class MockApiEngine {
  private isOffline = false;
  private baseLatencyMs: number = env.NEXT_PUBLIC_MOCK_BASE_LATENCY_MS;
  private failureRules: FailureInjectionRule[] = [];
  private endpointDelayOverrides: Map<string, number> = new Map();

  public setOffline(offline: boolean): void {
    this.isOffline = offline;
  }

  public getOffline(): boolean {
    return this.isOffline;
  }

  public setBaseLatencyMs(ms: number): void {
    this.baseLatencyMs = Math.max(0, ms);
  }

  public setEndpointDelayOverride(endpointKey: string, delayMs: number): void {
    this.endpointDelayOverrides.set(endpointKey, Math.max(0, delayMs));
  }

  public clearEndpointDelayOverrides(): void {
    this.endpointDelayOverrides.clear();
  }

  public enqueueFailureRule(rule: FailureInjectionRule): void {
    this.failureRules.push({ ...rule });
  }

  public getFailureRules(): ReadonlyArray<FailureInjectionRule> {
    return [...this.failureRules];
  }

  public clearFailureRules(): void {
    this.failureRules = [];
  }

  public resetEngine(): void {
    this.isOffline = false;
    this.baseLatencyMs = env.NEXT_PUBLIC_MOCK_BASE_LATENCY_MS;
    this.failureRules = [];
    this.endpointDelayOverrides.clear();
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

    if (this.isOffline) {
      throw new MockApiError({
        status: 503,
        code: 'NETWORK_OFFLINE',
        message: 'Network is offline. Please check your internet connection.',
      });
    }

    const matchedRule = this.consumeMatchingRule(endpoint);
    const overrideDelay = this.endpointDelayOverrides.get(endpoint);
    const effectiveDelayMs =
      matchedRule?.delayMs ?? customDelayMs ?? overrideDelay ?? this.baseLatencyMs;

    await this.waitWithAbort(effectiveDelayMs, signal, endpoint);

    if (matchedRule) {
      this.throwInjectedFailure(matchedRule, endpoint);
    }

    return await handler();
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
          message: `Request to "${endpoint}" timed out.`,
        });
      case 'HTTP_401':
        throw new MockApiError({
          status: 401,
          code: 'SESSION_EXPIRED',
          message: `Session expired while calling "${endpoint}".`,
        });
      case 'HTTP_403':
        throw new MockApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: `You do not have permission to perform "${endpoint}".`,
        });
      case 'HTTP_409':
        throw new MockApiError({
          status: 409,
          code: 'VERSION_CONFLICT',
          message: `Version conflict detected on "${endpoint}".`,
        });
      case 'HTTP_429':
        throw new MockApiError({
          status: 429,
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded on "${endpoint}". Please retry shortly.`,
          retryAfterMs: 1000,
        });
      case 'HTTP_500':
        throw new MockApiError({
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: `Internal server error occurred while processing "${endpoint}".`,
        });
    }
  }
}

export const mockApiEngine = new MockApiEngine();