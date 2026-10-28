# GeoffHaward Enterprise Admin - Production-Ready Multi-Tenant Admin Dashboard

A production-grade **Multi-Tenant Admin Dashboard** built with **Next.js 14 (App Router)**, **React 18**, **Strict TypeScript**, **TanStack Query v5**, **Zustand**, **React Hook Form + Zod**, and **PapaParse**.

Rather than focusing purely on surface UI, this project is engineered around **frontend systems architecture, strict tenant isolation, authoritative role-based access control (RBAC), race-condition safety, optimistic concurrency control (HTTP 409 conflict resolution), idempotent 10,000-row CSV imports with partial-failure recovery, real-time cross-tab synchronization, and deterministic chaos engineering**.

---

## 1. Project Overview & Core Features

- **Module 0 - Foundation & Authoritative Mock Persistence:**
  - Strict TypeScript configuration (`strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`) with zero `any` usage.
  - Deterministic Mulberry32 PRNG database seeding **3 Organizations** and **10,200 Employee Records** (`10,000` in `org-acme`, `120` in `org-globex`, `80` in `org-initech`).
  - Reusable, accessible ARIA-compliant feedback states (`LoadingSkeleton`, `ErrorStateView`, `EmptyStateView`, `StatusBanner`).
- **Module A - Authentication, Organizations & RBAC:**
  - Server-authoritative session validation (`mockDb.requireAuthorizedSession`) with session TTL enforcement and `HTTP 401 SESSION_EXPIRED` handling.
  - Three roles (`SUPER_ADMIN`, `ORG_ADMIN`, `VIEWER`) with organization switching restricted to `SUPER_ADMIN` and automatic tenant cache eviction on context switch or logout.
  - Built-in **Backend Authorization & Tampered Request Verifier** demonstrating rejection of manipulated `organizationId` values, cross-tenant `employeeId` mutations, and spoofed client roles (`HTTP 403`).
- **Module B - 10,000+ Record Employee Management Table:**
  - Server-style pagination, multi-column sorting, debounced search, and multi-facet filtering (`Department`, `Role Title`, `Status`).
  - Out-of-order search race protection (`AbortSignal` cancellation + monotonic sequence guards) ensuring a slow "Asad" request never overwrites a newer "Rahul" search.
  - Bidirectional URL query parameter synchronization (`?q=&dept=&role=&status=&sortBy=&sortDir=&page=&pageSize=`) surviving browser refreshes (`F5`).
  - Stable ID row selection across sorting/filtering/paging, **Paginated Bulk Delete Confirmation & Record Preview Modal**, automatic page clamping when deletions reduce page count, and `React.memo` single-row updates.
- **Module C - Reliable Forms, Optimistic Rollback & Concurrent Editing (HTTP 409):**
  - React Hook Form + Zod schema validation with accessible `aria-invalid` and `aria-describedby` field-level error announcements.
  - Unsaved-changes guard (`isDirty` confirmation prompt + browser `beforeunload` protection) and synchronous duplicate-submit lock with idempotency keys.
  - Optimistic table updates with automatic cache snapshot rollback on failure while preserving user form input.
  - Version-aware concurrency (`expectedVersion`): detects concurrent edits with `HTTP 409 VERSION_CONFLICT` and renders a side-by-side field-by-field diff resolver (**Keep Server** vs. **Keep Mine** or **Reload Server Version**).
- **Module D - Reliable 10,000-Row Bulk CSV Import:**
  - RFC-4180 CSV parser (`PapaParse`) supporting quoted fields, escaped quotes, commas, and multi-line values.
  - 8-field column mapping, paginated pre-import data preview, intra-CSV duplicate detection (`SKIPPED_DUPLICATE_IN_CSV`), existing organization email detection (`SKIPPED_EXISTING_IN_ORG`), and row-level validation (`INVALID`).
  - **7,000 / 10,000 Partial Failure Recovery:** Deterministic row idempotency keys ensure that when a network drop occurs after 7,000 rows, clicking **Retry / Resume** processes only the remaining 3,000 rows without duplicating the first 7,000 records.
  - **Complete 10,000-Row Filterable & Paginated Audit Log:** Filter imported rows by status tab (`All`, `Succeeded`, `Failed`, `Invalid`, `Skipped`, `Duplicates`, `Pending`) or search query.
- **Module E - Resilience, Real Hardware Offline Detection & Chaos Control Panel:**
  - Native browser hardware offline/online detection (`navigator.onLine` + `offline`/`online` events), sliding-window rate limiting (`HTTP 429`), and request timeout cutoffs (`HTTP 408`).
  - Interactive **Chaos & Resilience Control Panel** for deterministic failure injection (`HTTP 401`, `403`, `409`, `429`, `500`, `TIMEOUT`, `OFFLINE`, latency jitter) and a **Dynamic Chunk-Load Error (`ChunkLoadError`) Recovery Sandbox**.

---

## 2. Technology Choices & Rationale

| Technology | Version | Rationale |
| :--- | :--- | :--- |
| **Next.js (App Router) & React** | 14.2.13 / 18.3.1 | Route-level error boundaries, URL search parameter integration, and concurrent React rendering. |
| **TypeScript (strict: true)** | 5.6.2 | Enforces compile-time safety across domain entities, API contracts, and RBAC permissions with zero any. |
| **TanStack Query v5** | 5.56.2 | Manages server state, tenant-scoped cache keys, AbortSignal propagation, optimistic updates/rollbacks, and status-aware retry policies. |
| **Zustand** | 4.5.5 | Lightweight synchronous client UI store (active session token, notification banners, Chaos drawer visibility). |
| **React Hook Form + Zod** | 7.53.0 / 3.23.8 | Performant form state management with shared schema validation across forms, URL state parsing, and environment configuration. |
| **PapaParse** | 5.4.1 | RFC-4180 compliant CSV parser handling embedded commas, escaped quotes, and newlines for up to 10,000 rows. |
| **Tailwind CSS + Lucide React** | 3.4.12 / 0.441.0 | Accessible focus states, responsive layout primitives, and zero-runtime CSS overhead. |
| **Vitest + Testing Library + Playwright** | 2.1.1 / 16.0.1 / 1.47.2 | Fast JSDOM unit/integration testing paired with real Chromium browser end-to-end verification. |

---

## 3. Architecture & Folder Structure

```text
multi-tenant-admin-dashboard/
|-- e2e/                                      # Playwright End-to-End Browser Specs
|   |-- smoke.spec.ts                         # Module 0 foundation smoke test
|   |-- rbac-tenant.spec.ts                   # Module A org switching, tenant lock & session expiry
|   |-- table-scenarios.spec.ts               # Module B 'Asad' -> 'Rahul' race & URL state persistence
|   |-- conflict-resolution.spec.ts           # Module C HTTP 409 concurrent edit reconciliation
|   |-- csv-import-recovery.spec.ts           # Module D 10,000-row -> 7,000-row partial failure recovery
|   +-- resilience.spec.ts                    # Module E offline mode & ChunkLoadError recovery
|-- src/
|   |-- app/                                  # Next.js App Router entrypoints & boundaries
|   |-- config/env.ts                         # Zod-validated runtime environment config
|   |-- types/                                # Domain entities, RBAC permissions & API contracts
|   |-- lib/
|   |   |-- mock-api/                         # Authoritative MockDB, Engine, Auth, Employees & CSV APIs
|   |   |-- query/query-client.ts             # TanStack Query client & status-aware retry policy
|   |   +-- utils/cn.ts
|   |-- store/ui-store.ts                     # Zustand synchronous UI state store
|   |-- components/feedback/                  # Accessible state views & ComponentErrorBoundary
|   |-- features/
|   |   |-- auth/                             # Module A login, navbar, RBAC guard & security probes
|   |   |-- employees/                        # Modules B & C table, URL state, RHF modal, conflict & bulk delete
|   |   |-- csv-import/                       # Module D RFC-4180 parser & 10,000-row import wizard
|   |   +-- chaos/                            # Module E Chaos & Resilience Control Drawer
|   |-- providers/app-providers.tsx           # QueryClientProvider + AuthProvider wrapper
|   +-- __tests__/                            # Vitest Unit & Integration Suites (Modules 0, A, B, C, D, E)
+-- package.json, tsconfig.json, vitest.config.ts, playwright.config.ts
```

---

## 4. Prerequisites & Installation

- **Node.js:** v18.18.0+ or v20.x LTS
- **npm:** v9.x+ or v10.x+

```bash
# 1. Install all project dependencies
npm install

# 2. Install Playwright Chromium browser binary (for E2E tests)
npx playwright install chromium
```

---

## 5. Environment Configuration

Runtime environment variables are validated via Zod in `src/config/env.ts` with safe defaults out of the box. Optionally create a `.env.local` file:

```env
NEXT_PUBLIC_APP_NAME="GeoffHaward Enterprise Admin"
NEXT_PUBLIC_DEFAULT_SEED_COUNT=10200
NEXT_PUBLIC_MOCK_BASE_LATENCY_MS=40
NEXT_PUBLIC_SESSION_TTL_MINUTES=60
```

---

## 6. Development, Testing & Production Build Commands

```bash
# Start local development server at http://localhost:3000
npm run dev

# Run strict TypeScript compiler check (tsc --noEmit)
npm run typecheck

# Run ESLint code quality checks
npm run lint

# Run all Vitest unit and integration test suites
npm run test:run

# Run all Playwright end-to-end browser tests
npm run test:e2e

# Create an optimized production build
npm run build

# Start the production server
npm start
```

---

## 7. Mock Authentication Credentials & RBAC Matrix

One-click credential fill buttons are available directly on the Sign-In page (`http://localhost:3000`):

| Role | Email | Password | Home Organization | Granted Server Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@nexus.io` | `SuperSecret!2026` | `org-acme` (Can switch across all 3 orgs) | `org:switch`, `employee:read`, `employee:create`, `employee:update`, `employee:delete`, `employee:bulk_delete`, `employee:import_csv` |
| **Organization Admin (Acme)** | `admin@acme.io` | `AcmeAdmin!2026` | `org-acme` (Locked) | `employee:read`, `employee:create`, `employee:update`, `employee:delete`, `employee:bulk_delete`, `employee:import_csv` |
| **Organization Admin (Globex)** | `admin@globex.io` | `GlobexAdmin!2026` | `org-globex` (Locked) | `employee:read`, `employee:create`, `employee:update`, `employee:delete`, `employee:bulk_delete`, `employee:import_csv` |
| **Viewer (Acme)** | `viewer@acme.io` | `AcmeViewer!2026` | `org-acme` (Locked) | `employee:read` (Strictly Read-Only) |

---

## 8. Real-World HTTP Error Flows & Chaos Failure Injection Guide

| Error Class | Real-World Application Trigger (No Chaos Panel Needed) | Deterministic Chaos Panel / Test Helper Trigger |
| :--- | :--- | :--- |
| **HTTP 401 (UNAUTHORIZED / SESSION_EXPIRED)** | Enter an invalid password on Sign In, OR click **Expire Session** in the top navbar. | Enqueue HTTP_401 in the **Chaos & Resilience** drawer. |
| **HTTP 403 (FORBIDDEN / CROSS_TENANT_ACCESS_DENIED)** | Sign in as Acme Admin or Viewer and click the **Backend Authorization Verifier** probes at the bottom of the dashboard. | Enqueue HTTP_403 in the **Chaos & Resilience** drawer. |
| **HTTP 404 (NOT_FOUND)** | Open an employee Edit modal in Tab 1, delete that employee in Tab 2, then click **Save Changes** in Tab 1. | Call update/delete on a deleted employee ID. |
| **HTTP 408 (NETWORK_TIMEOUT)** | Set Base API Latency above the 2500ms server timeout cutoff (e.g. 3000ms) and trigger any action. | Enqueue TIMEOUT in the **Chaos & Resilience** drawer. |
| **HTTP 409 (VERSION_CONFLICT)** | Open the same employee Edit modal (v1) in **Tab 1** and **Tab 2**. Save in Tab 1 (v2), then save in Tab 2 (v1) to open the Conflict Resolver. | Inside any Edit Employee modal, click **Simulate Admin A Save (Bump Server to v2)**, then click **Save Changes**. |
| **HTTP 409 (DUPLICATE_EMAIL)** | Click **Add Employee** and submit an email that already exists in the organization (e.g. asad.khan.1@acme.io). | Handled automatically by create and update endpoints. |
| **HTTP 429 (RATE_LIMITED)** | Rapidly click a row **Toggle Status** button more than 6 times within 2 seconds to trigger the sliding-window rate limiter. | Enqueue HTTP_429 in the **Chaos & Resilience** drawer. |
| **HTTP 500 (INTERNAL_SERVER_ERROR)** | Triggered when an unhandled server exception occurs. | Click **Fail Next Table Request**, **Fail Next Save (HTTP 500 Rollback)**, or enqueue HTTP_500 in the Chaos drawer. |
| **HTTP 503 (NETWORK_OFFLINE)** | Disconnect your PC Wi-Fi/Ethernet or select **Offline** in Chrome DevTools -> Network tab. | Click **Network is ONLINE (Simulate Offline)** inside the Chaos drawer. |
| **ChunkLoadError** | Occurs when a dynamic JS bundle fails to download during a deployment or network drop. | Open the **Chaos & Resilience** drawer and click **Simulate ChunkLoadError**. |

---

## 9. Bulk CSV Import Behavior & Idempotent Retry Semantics

1. **File & Schema Validation:** Accepts .csv files up to **15 MB** and **10,000 rows**. Validates required names, email format, salary range (,000-,000,000), and YYYY-MM-DD hire dates.
2. **Deduplication Rules:**
   - **Intra-CSV Duplicates:** First occurrence is processed; subsequent occurrences in the same file are marked SKIPPED_DUPLICATE_IN_CSV.
   - **Existing Organization Emails:** Emails already registered in the active tenant are marked SKIPPED_EXISTING_IN_ORG.
3. **10,000-Row Partial Failure at Row 7,000 & Idempotent Resume:**
   - Each row is assigned a deterministic idempotencyKey and tracked inside a server-side CsvImportJob.
   - Clicking **1. Load 10,000-Row CSV (Preset Failure at Row 7,000)** commits rows 1-7,000 and throws a simulated network drop (7,000 Succeeded, 3,000 Pending).
   - Clicking **Retry / Resume Remaining 3,000 Rows** resumes the existing jobId, skipping all 7,000 succeeded rows and importing only rows 7,001-10,000 with zero duplicates.

---

## 10. Known Limitations & Deployment

- **In-Browser Mock Persistence:** Because this assessment uses an in-process mock backend rather than an external database, clearing browser storage resets the dataset to its initial 10,200 seeded employees.
- **Deployment:** Push to GitHub and import into Vercel (Framework Preset: Next.js, Build Command: npm run build, Install Command: npm install), or run self-hosted via npm ci && npm run build && npm start.

---

## 11. Security Disclaimer

> **Important Statement:** The centralized Mock API in this project (src/lib/mock-api/*) demonstrates authentication lifecycles, RBAC permission enforcement, tenant data isolation, optimistic concurrency control, and idempotent retry semantics within a self-contained frontend architecture assessment. **It is not a substitute for a production-secure backend.** In production, authentication, session management, role verification, and tenant boundary enforcement must execute on an isolated backend server with HTTP-only cookies/tokens and database-level row security (RLS).
