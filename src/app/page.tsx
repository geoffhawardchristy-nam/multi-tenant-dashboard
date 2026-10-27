'use client';

import React from 'react';
import { env } from '@/config/env';
import { mockDb } from '@/lib/mock-api/db';
import { ROLE_PERMISSIONS } from '@/types/domain';
import { StatusBanner } from '@/components/feedback/state-views';

export default function DashboardFoundationPage(): React.JSX.Element {
  const organizations = mockDb.getOrganizations();
  const totalEmployees = mockDb.getTotalEmployeeCount();
  const acmeEmployeesCount = mockDb.getEmployeesByOrganization('org-acme').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              {env.NEXT_PUBLIC_APP_NAME}
            </h1>
            <p className="text-xs text-slate-500">
              Module 0 Foundation Verified â€” Multi-Tenant Architecture & Mock Persistence Active
            </p>
          </div>
          <span
            data-testid="foundation-status-badge"
            className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
          >
            Foundation Ready
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <StatusBanner
          variant="info"
          message={`Deterministic Mock DB initialized with ${organizations.length} organizations and ${totalEmployees.toLocaleString()} employee records (${acmeEmployeesCount.toLocaleString()} in Acme Cloud Systems).`}
        />

        <section aria-labelledby="tenants-heading" className="grid gap-4 sm:grid-cols-3">
          <h2 id="tenants-heading" className="sr-only">
            Seeded Organizations
          </h2>
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