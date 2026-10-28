'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, GitMerge, RotateCcw } from 'lucide-react';
import type { Employee } from '@/types/domain';
import {
  computeConflictDiffs,
  extractFormValuesFromEmployee,
  type EmployeeFormValues,
} from './employee-schema';

export interface ConflictResolutionPanelProps {
  readonly serverRecord: Employee;
  readonly attemptedVersion: number;
  readonly attemptedValues: EmployeeFormValues;
  readonly isSubmitting: boolean;
  readonly onReloadServerVersion: (serverRecord: Employee) => void;
  readonly onResolveWithMergedValues: (
    mergedValues: EmployeeFormValues,
    newExpectedVersion: number
  ) => Promise<void>;
}

type FieldChoice = 'server' | 'client';

export function ConflictResolutionPanel({
  serverRecord,
  attemptedVersion,
  attemptedValues,
  isSubmitting,
  onReloadServerVersion,
  onResolveWithMergedValues,
}: ConflictResolutionPanelProps): React.JSX.Element {
  const diffs = useMemo(
    () => computeConflictDiffs(serverRecord, attemptedValues),
    [attemptedValues, serverRecord]
  );

  // Default choices: select 'client' for fields the user changed, while allowing 1-click toggle per field
  const [choices, setChoices] = useState<Record<keyof EmployeeFormValues, FieldChoice>>(() => ({
    firstName: 'client',
    lastName: 'client',
    email: 'client',
    department: 'client',
    roleTitle: 'client',
    status: 'client',
    salaryUsd: 'client',
    hireDate: 'client',
  }));

  const serverFormValues = useMemo(
    () => extractFormValuesFromEmployee(serverRecord),
    [serverRecord]
  );

  const mergedPreview: EmployeeFormValues = useMemo(() => {
    return {
      firstName:
        choices.firstName === 'server' ? serverFormValues.firstName : attemptedValues.firstName,
      lastName:
        choices.lastName === 'server' ? serverFormValues.lastName : attemptedValues.lastName,
      email: choices.email === 'server' ? serverFormValues.email : attemptedValues.email,
      department:
        choices.department === 'server' ? serverFormValues.department : attemptedValues.department,
      roleTitle:
        choices.roleTitle === 'server' ? serverFormValues.roleTitle : attemptedValues.roleTitle,
      status: choices.status === 'server' ? serverFormValues.status : attemptedValues.status,
      salaryUsd:
        choices.salaryUsd === 'server' ? serverFormValues.salaryUsd : attemptedValues.salaryUsd,
      hireDate:
        choices.hireDate === 'server' ? serverFormValues.hireDate : attemptedValues.hireDate,
    };
  }, [attemptedValues, choices, serverFormValues]);

  const handleSelectFieldSource = (field: keyof EmployeeFormValues, source: FieldChoice) => {
    setChoices((prev) => ({
      ...prev,
      [field]: source,
    }));
  };

  return (
    <div
      role="region"
      aria-labelledby="conflict-resolution-heading"
      data-testid="conflict-resolution-panel"
      className="mt-4 space-y-4 rounded-xl border-2 border-amber-400 bg-amber-50/70 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="conflict-resolution-heading"
              className="text-sm font-bold text-amber-950"
            >
              Concurrent Edit Conflict Detected (HTTP 409)
            </h3>
            <span className="rounded bg-amber-200 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-900">
              Your Base: v{attemptedVersion} &rarr; Latest Server: v{serverRecord.version}
            </span>
          </div>
          <p className="text-xs text-amber-900">
            Another administrator updated <strong>{serverRecord.fullName}</strong> while you were
            editing. Your optimistic table change was safely rolled back. Compare the versions below
            and choose how to resolve:
          </p>
        </div>
      </div>

      {/* Side-by-side comparison table */}
      <div className="overflow-x-auto rounded-lg border border-amber-300 bg-white">
        <table className="w-full text-left text-xs" data-testid="conflict-diff-table">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Latest Server (v{serverRecord.version})</th>
              <th className="px-3 py-2">Your Attempted Edit (v{attemptedVersion})</th>
              <th className="px-3 py-2 text-right">Resolution Choice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {diffs.map((diff) => {
              const selectedSource = choices[diff.field];
              return (
                <tr
                  key={diff.field}
                  data-testid={`conflict-row-${diff.field}`}
                  className={diff.isDifferent ? 'bg-amber-50/40 font-medium' : 'text-slate-600'}
                >
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    {diff.label}
                    {diff.isDifferent ? (
                      <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        CHANGED
                      </span>
                    ) : null}
                  </td>

                  <td
                    data-testid={`conflict-server-val-${diff.field}`}
                    className={`px-3 py-2 font-mono ${
                      selectedSource === 'server' && diff.isDifferent
                        ? 'font-bold text-emerald-800 underline'
                        : 'text-slate-700'
                    }`}
                  >
                    {diff.field === 'salaryUsd'
                      ? `$${Number(diff.serverValue).toLocaleString()}`
                      : String(diff.serverValue)}
                  </td>

                  <td
                    data-testid={`conflict-client-val-${diff.field}`}
                    className={`px-3 py-2 font-mono ${
                      selectedSource === 'client' && diff.isDifferent
                        ? 'font-bold text-blue-800 underline'
                        : 'text-slate-700'
                    }`}
                  >
                    {diff.field === 'salaryUsd'
                      ? `$${Number(diff.clientValue).toLocaleString()}`
                      : String(diff.clientValue)}
                  </td>

                  <td className="px-3 py-2 text-right">
                    {diff.isDifferent ? (
                      <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
                        <button
                          type="button"
                          data-testid={`choose-server-${diff.field}`}
                          onClick={() => handleSelectFieldSource(diff.field, 'server')}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            selectedSource === 'server'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Keep Server
                        </button>
                        <button
                          type="button"
                          data-testid={`choose-client-${diff.field}`}
                          onClick={() => handleSelectFieldSource(diff.field, 'client')}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            selectedSource === 'client'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Keep Mine
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Identical
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Explicit Resolution Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          disabled={isSubmitting}
          data-testid="conflict-reload-server-btn"
          onClick={() => onReloadServerVersion(serverRecord)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Discard My Edits &amp; Reload Server (v{serverRecord.version})
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          data-testid="conflict-submit-merged-btn"
          onClick={() => {
            void onResolveWithMergedValues(mergedPreview, serverRecord.version);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
          {isSubmitting
            ? 'Reconciling...'
            : `Reconcile & Save as v${serverRecord.version + 1}`}
        </button>
      </div>
    </div>
  );
}