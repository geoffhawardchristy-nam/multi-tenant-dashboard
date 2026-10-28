'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Building2, Clock, LogOut, ShieldCheck, WifiOff } from 'lucide-react';
import { env } from '@/config/env';
import { mockApiEngine, type MockEngineSnapshot } from '@/lib/mock-api/engine';
import { useUiStore } from '@/store/ui-store';
import { useAuth } from './auth-context';
import { canSwitchOrganization, getRoleBadgeInfo } from './permissions';

export function TopNavbar(): React.JSX.Element | null {
  const {
    session,
    isSwitchingOrg,
    switchOrganization,
    simulateSessionExpiry,
    logout,
  } = useAuth();
  const { setChaosDrawerOpen } = useUiStore();

  const [engineSnapshot, setEngineSnapshot] = useState<MockEngineSnapshot>(() =>
    mockApiEngine.getSnapshot()
  );

  useEffect(() => {
    setEngineSnapshot(mockApiEngine.getSnapshot());
    return mockApiEngine.subscribe(() => {
      setEngineSnapshot(mockApiEngine.getSnapshot());
    });
  }, []);

  if (!session) {
    return null;
  }

  const { user, activeOrganization, availableOrganizations } = session;
  const roleBadge = getRoleBadgeInfo(user.role);
  const allowOrgSwitch = canSwitchOrganization(user.role);
  const activeRuleCount = engineSnapshot.failureRules.length;

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900">
                {env.NEXT_PUBLIC_APP_NAME}
              </span>
              <span
                data-testid="active-role-badge"
                className={`rounded border px-2 py-0.5 text-xs font-semibold ${roleBadge.badgeClass}`}
              >
                {roleBadge.label}
              </span>
              {engineSnapshot.isOffline ? (
                <span
                  data-testid="navbar-offline-badge"
                  className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white"
                >
                  <WifiOff className="h-3 w-3" aria-hidden="true" />
                  OFFLINE
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500" data-testid="authenticated-user-summary">
              Signed in as <strong className="text-slate-700">{user.name}</strong> ({user.email})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <Building2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
            {allowOrgSwitch ? (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="org-switcher-select"
                  className="text-xs font-semibold text-slate-600"
                >
                  Tenant:
                </label>
                <select
                  id="org-switcher-select"
                  aria-label="Switch Organization"
                  data-testid="org-switcher-select"
                  disabled={isSwitchingOrg}
                  value={activeOrganization.id}
                  onChange={(e) => {
                    void switchOrganization(e.target.value);
                  }}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-50"
                >
                  {availableOrganizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.id})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-slate-500">Scoped Organization:</span>
                <span
                  data-testid="locked-org-badge"
                  className="font-semibold text-slate-900"
                >
                  {activeOrganization.name} ({activeOrganization.id})
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="open-chaos-drawer-btn"
            onClick={() => setChaosDrawerOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold ${
              engineSnapshot.isOffline || activeRuleCount > 0
                ? 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100'
                : 'border-purple-300 bg-purple-50 text-purple-900 hover:bg-purple-100'
            }`}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Chaos &amp; Resilience
            {activeRuleCount > 0 ? (
              <span
                data-testid="chaos-active-count-badge"
                className="rounded-full bg-red-700 px-1.5 py-0.2 font-mono text-[10px] text-white"
              >
                {activeRuleCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => {
              void simulateSessionExpiry();
            }}
            data-testid="simulate-expiry-btn"
            title="Expire the server-side session immediately to test HTTP 401 handling"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Expire Session
          </button>

          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            data-testid="logout-btn"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}