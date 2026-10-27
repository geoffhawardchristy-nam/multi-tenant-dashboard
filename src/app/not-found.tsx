import React from 'react';
import Link from 'next/link';

export default function NotFoundPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs font-semibold text-slate-700">
        HTTP 404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Resource or Tenant Route Not Found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page you requested does not exist or may belong to an organization outside your tenant
        scope.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        Return to Dashboard Home
      </Link>
    </main>
  );
}