'use client';

import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, Building2 } from 'lucide-react';
import { env } from '@/config/env';
import { mockDb } from '@/lib/mock-api/db';
import { isMockApiError } from '@/lib/mock-api/errors';
import { SEED_ACCOUNTS } from '@/lib/mock-api/seed';
import { ROLE_PERMISSIONS } from '@/types/domain';
import { ErrorStateView, StatusBanner } from '@/components/feedback/state-views';
import { useUiStore } from '@/store/ui-store';
import { useAuth } from './auth-context';
import { getRoleBadgeInfo } from './permissions';

export function LoginView(): React.JSX.Element {
  const { login, authError, clearAuthError } = useAuth();
  const { banner, clearBanner } = useUiStore();

  const [email, setEmail] = useState<string>('superadmin@nexus.io');
  const [password, setPassword] = useState<string>('SuperSecret!2026');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const organizations = mockDb.getOrganizations();
  const totalEmployees = mockDb.getTotalEmployeeCount();

  const handleDismissBanner = () => {
    clearBanner();
    clearAuthError();
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await login({ email, passwordPlain: password });
    } catch (err: unknown) {
      const message = isMockApiError(err) ? err.message : 'Unable to sign in.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAccountSelect = (accountEmail: string, accountPassword: string) => {
    setEmail(accountEmail);
    setPassword(accountPassword);
    setSubmitError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                {env.NEXT_PUBLIC_APP_NAME}
              </h1>
              <p className="text-xs text-slate-500">
                Multi-Tenant Admin Portal â€” Authoritative RBAC & Session Isolation
              </p>
            </div>
          </div>
          <span
            data-testid="foundation-status-badge"
            className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
          >
            Foundation Ready
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {banner ? (
          <StatusBanner
            variant={banner.variant}
            message={banner.message}
            onDismiss={handleDismissBanner}
          />
        ) : authError ? (
          <StatusBanner
            variant="warning"
            message={authError}
            onDismiss={handleDismissBanner}
          />
        ) : null}

        <div className="grid gap-8 lg:grid-cols-12">
          <section
            aria-labelledby="login-heading"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5"
          >
            <div className="flex items-center gap-2 text-slate-900">
              <Lock className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h2 id="login-heading" className="text-lg font-bold">
                Sign In to Tenant Workspace
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Sessions are validated server-side inside the Mock API boundary.
            </p>

            {submitError ? (
              <div className="mt-4">
                <ErrorStateView
                  title="Authentication Failed"
                  message={submitError}
                  code="UNAUTHORIZED"
                />
              </div>
            ) : null}

            <form onSubmit={handleFormSubmit} className="mt-5 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Work Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="login-submit-btn"
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </section>

          <section
            aria-labelledby="quick-accounts-heading"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h2 id="quick-accounts-heading" className="text-base font-bold text-slate-900">
                Mock Role Accounts (One-Click Credential Fill)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Select any seeded role below to populate credentials and test multi-tenant RBAC
              isolation:
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SEED_ACCOUNTS.map((account) => {
                const badge = getRoleBadgeInfo(account.user.role);
                const isSelected = email.toLowerCase() === account.user.email.toLowerCase();
                return (
                  <button
                    key={account.user.id}
                    type="button"
                    data-testid={`quick-fill-${account.user.id}`}
                    onClick={() =>
                      handleQuickAccountSelect(account.user.email, account.passwordPlain)
                    }
                    className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900/5 ring-1 ring-slate-900'
                        : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${badge.badgeClass}`}
                      >
                        {badge.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {account.user.organizationId}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {account.user.name}
                    </p>
                    <p className="font-mono text-xs text-slate-600">{account.user.email}</p>
                    <p className="mt-1.5 text-[11px] text-slate-500">{badge.summary}</p>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <section aria-labelledby="tenants-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="tenants-heading"
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Seeded Multi-Tenant Datasets ({totalEmployees.toLocaleString()} Total Employees)
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {organizations.map((org) => {
              const count = mockDb.getEmployeesByOrganization(org.id).length;
              return (
                <div
                  key={org.id}
                  data-testid={`org-card-${org.id}`}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-500">{org.id}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {org.plan}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">{org.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {count.toLocaleString()} seeded employees
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="rbac-matrix-heading"
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 id="rbac-matrix-heading" className="text-base font-semibold text-slate-900">
            Authoritative Role Permission Matrix
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2">Granted Server-Side Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>).map(
                  (role) => (
                    <tr key={role}>
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-slate-900">
                        {role}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {ROLE_PERMISSIONS[role].map((perm) => (
                            <span
                              key={perm}
                              className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}