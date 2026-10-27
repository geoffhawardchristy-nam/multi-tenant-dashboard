import type { Metadata } from 'next';
import './globals.css';
import { AppProviders } from '@/providers/app-providers';
import { env } from '@/config/env';

export const metadata: Metadata = {
  title: env.NEXT_PUBLIC_APP_NAME,
  description:
    'Production-Ready Multi-Tenant Admin Dashboard with RBAC, 10k+ Employee Table, Concurrent Editing & Idempotent CSV Import',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}