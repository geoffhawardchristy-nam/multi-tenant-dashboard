'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Plus,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { mockApiEngine, type MockEngineSnapshot } from '@/lib/mock-api/engine';
import type { FailureInjectionRule } from '@/types/api';
import { useUiStore } from '@/store/ui-store';
import { ChunkLoadRecoverySandbox } from '@/components/feedback/error-boundary';

const ENDPOINT_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: '*', label: 'All API Endpoints (*)' },
  { value: 'employees.list', label: 'employees.list (Table Fetch / Search / Filter)' },
  { value: 'employees.update', label: 'employees.update (Edit / Status Toggle)' },
  { value: 'employees.create', label: 'employees.create (Add Employee)' },
  { value: 'employees.delete', label: 'employees.delete (Single Delete)' },
  { value: 'employees.bulkDelete', label: 'employees.bulkDelete (Bulk Delete)' },
  { value: 'csv.processChunk', label: 'csv.processChunk (CSV Batch Import)' },
  { value: 'tenant.getOverview', label: 'tenant.getOverview (Dashboard Metrics)' },
];

const FAILURE_TYPE_OPTIONS: ReadonlyArray<{
  readonly value: FailureInjectionRule['failureType'];
  readonly label: string;
}> = [
  { value: 'HTTP_500', label: 'HTTP 500 Internal Server Error' },
  { value: 'HTTP_429', label: 'HTTP 429 Rate Limited (Retry-After)' },
  { value: 'TIMEOUT', label: 'HTTP 408  Network Request Timeout' },
  { value: 'OFFLINE', label: 'HTTP 503  Simulated Offline Drop' },
  { value: 'HTTP_401', label: 'HTTP 401 Session Expired Mid-Workflow' },
  { value: 'HTTP_403', label: 'HTTP 403 Forbidden / Access Denied' },
  { value: 'HTTP_409', label: 'HTTP 409 Version / Resource Conflict' },
];

export function ChaosControlDrawer(): React.JSX.Element | null {
  const { isChaosDrawerOpen, setChaosDrawerOpen, showBanner } = useUiStore();

  const [snapshot, setSnapshot] = useState<MockEngineSnapshot>(() =>
    mockApiEngine.getSnapshot()
  );

  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('employees.list');
  const [selectedFailureType, setSelectedFailureType] =
    useState<FailureInjectionRule['failureType']>('HTTP_500');
  const [triggerCount, setTriggerCount] = useState<number>(3);
  const [ruleDelayMs, setRuleDelayMs] = useState<number>(20);

  useEffect(() => {
    setSnapshot(mockApiEngine.getSnapshot());
    return mockApiEngine.subscribe(() => {
      setSnapshot(mockApiEngine.getSnapshot());
    });
  }, []);

  if (!isChaosDrawerOpen) {
    return null;
  }

  const handleToggleOffline = () => {
    const nextOffline = !snapshot.isOffline;
    mockApiEngine.setOffline(nextOffline);
    showBanner(
      nextOffline ? 'error' : 'success',
      nextOffline
        ? 'Network Offline Mode enabled: all API requests will now reject with HTTP 503 NETWORK_OFFLINE.'
        : 'Network Online restored: API requests will now flow normally.'
    );
  };

  const handleAddRule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const rule: FailureInjectionRule = {
      id: `chaos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      endpointPattern: selectedEndpoint,
      failureType: selectedFailureType,
      remainingTriggers: Math.max(1, Math.min(20, Number(triggerCount) || 1)),
      delayMs: Math.max(0, Math.min(10000, Number(ruleDelayMs) || 0)),
    };
    mockApiEngine.enqueueFailureRule(rule);
    showBanner(
      'warning',
      `Armed ${rule.failureType} on "${rule.endpointPattern}" (${rule.remainingTriggers} trigger(s)).`
    );
  };

  const handleResetAllChaos = () => {
    mockApiEngine.resetEngine();
    showBanner('info', 'Reset all chaos failure rules, latency overrides, and offline state.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chaos-drawer-title"
      data-testid="chaos-control-drawer"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
    >
      <div className="flex h-full w-full max-w-xl flex-col justify-between overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="space-y-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
                <Activity className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="chaos-drawer-title" className="text-base font-bold text-slate-900">
                  Chaos &amp; Resilience Engineering Control Panel
                </h2>
                <p className="text-xs text-slate-500">
                  Deterministically inject HTTP 401/403/409/429/500, Timeouts, Offline states &amp;
                  Chunk errors
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="close-chaos-drawer-btn"
              onClick={() => setChaosDrawerOpen(false)}
              aria-label="Close Chaos Control Panel"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* 1. Global Network Offline Toggle & Latency Controls */}
          <section
            aria-labelledby="network-state-heading"
            className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3
                  id="network-state-heading"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  1. Network Connectivity &amp; Latency Jitter
                </h3>
                <p className="text-xs text-slate-500">
                  Simulate complete offline drops or variable network jitter.
                </p>
              </div>

              <button
                type="button"
                data-testid="chaos-toggle-offline-btn"
                onClick={handleToggleOffline}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold shadow-sm ${
                  snapshot.isOffline
                    ? 'bg-red-700 text-white hover:bg-red-800'
                    : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                {snapshot.isOffline ? (
                  <>
                    <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Network is OFFLINE (Click to Restore)
                  </>
                ) : (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    Network is ONLINE (Simulate Offline)
                  </>
                )}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="chaos-base-latency"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Base API Latency (ms): {snapshot.baseLatencyMs}ms
                </label>
                <input
                  id="chaos-base-latency"
                  data-testid="chaos-base-latency-input"
                  type="number"
                  min={0}
                  max={5000}
                  value={snapshot.baseLatencyMs}
                  onChange={(e) => mockApiEngine.setBaseLatencyMs(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="chaos-jitter-latency"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Random Latency Jitter (0N ms): {snapshot.jitterMaxMs}ms
                </label>
                <input
                  id="chaos-jitter-latency"
                  data-testid="chaos-jitter-input"
                  type="number"
                  min={0}
                  max={3000}
                  value={snapshot.jitterMaxMs}
                  onChange={(e) => mockApiEngine.setJitterMaxMs(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          </section>

          {/* 2. Deterministic Failure Rule Builder */}
          <section
            aria-labelledby="failure-builder-heading"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <h3
                id="failure-builder-heading"
                className="text-xs font-bold uppercase tracking-wider text-slate-800"
              >
                2. Enqueue Deterministic API Failure Rule
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Note: TanStack Query automatically retries transient `408`/`429`/`500` errors up to
                2 times. Set Triggers = `1` to verify auto-retry recovery, or Triggers = `3` to
                surface the error UI.
              </p>
            </div>

            <form onSubmit={handleAddRule} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="chaos-endpoint-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Target Endpoint
                  </label>
                  <select
                    id="chaos-endpoint-select"
                    data-testid="chaos-endpoint-select"
                    value={selectedEndpoint}
                    onChange={(e) => setSelectedEndpoint(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    {ENDPOINT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="chaos-failure-type-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Failure Class
                  </label>
                  <select
                    id="chaos-failure-type-select"
                    data-testid="chaos-failure-type-select"
                    value={selectedFailureType}
                    onChange={(e) =>
                      setSelectedFailureType(
                        e.target.value as FailureInjectionRule['failureType']
                      )
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    {FAILURE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="chaos-trigger-count"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Trigger Count (1 = Auto-Retry Succeeds, 3 = Fails All Retries)
                  </label>
                  <input
                    id="chaos-trigger-count"
                    data-testid="chaos-trigger-count-input"
                    type="number"
                    min={1}
                    max={20}
                    value={triggerCount}
                    onChange={(e) => setTriggerCount(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>

                <div>
                  <label
                    htmlFor="chaos-rule-delay"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Simulated Delay Before Error (ms)
                  </label>
                  <input
                    id="chaos-rule-delay"
                    data-testid="chaos-rule-delay-input"
                    type="number"
                    min={0}
                    max={5000}
                    value={ruleDelayMs}
                    onChange={(e) => setRuleDelayMs(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                data-testid="chaos-enqueue-rule-btn"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Enqueue Failure Rule
              </button>
            </form>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Active Queued Rules ({snapshot.failureRules.length})
                </span>
                {snapshot.failureRules.length > 0 ? (
                  <button
                    type="button"
                    data-testid="chaos-clear-rules-btn"
                    onClick={() => mockApiEngine.clearFailureRules()}
                    className="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Clear All Rules
                  </button>
                ) : null}
              </div>

              {snapshot.failureRules.length === 0 ? (
                <p
                  data-testid="chaos-no-rules-msg"
                  className="rounded border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400"
                >
                  No failure injection rules currently queued.
                </p>
              ) : (
                <ul className="space-y-2" data-testid="chaos-active-rules-list">
                  {snapshot.failureRules.map((rule) => (
                    <li
                      key={rule.id}
                      data-testid={`chaos-rule-item-${rule.id}`}
                      className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-amber-950">
                          {rule.failureType}
                        </span>{' '}
                        on <span className="font-mono font-semibold">{rule.endpointPattern}</span>
                        <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                          {rule.remainingTriggers} left
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => mockApiEngine.removeFailureRule(rule.id)}
                        aria-label={`Remove rule ${rule.id}`}
                        className="rounded p-1 text-amber-900 hover:bg-amber-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 3. Dynamic Import / ChunkLoadError & ErrorBoundary Sandbox */}
          <ChunkLoadRecoverySandbox />
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
          <button
            type="button"
            data-testid="chaos-reset-all-btn"
            onClick={handleResetAllChaos}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset All Chaos Settings
          </button>

          <button
            type="button"
            onClick={() => setChaosDrawerOpen(false)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}