# Sahi-Web 2026 Project Architecture

## 1. Project Overview

Sahi-Web is a festival management system for SSF Sahithyolsav 2026. It supports hierarchical administration, participant registration, item registration, schedule management, judge assignment, mark entry, result calculation, certificates, reports, public viewing, and level-wise data transfer.

The system must remain configurable by festival year. 2025 handbook data may be retained as historical/reference data, but active 2026 behavior must come from database-backed settings and rule configuration.

## 2. Current Technology Stack

- Frontend: React Native with Expo and React Native Web.
- Router: Expo Router file-based routing.
- Language: TypeScript.
- Styling: NativeWind and shared `Ssf*` UI components.
- Icons: Lucide React Native.
- State: Zustand.
- Server state/cache: TanStack React Query.
- Backend: Supabase.
- Future Backend API Layer: FastAPI, introduced gradually behind frontend services.
- Database: PostgreSQL with migrations.
- Auth: Supabase Auth.
- Security: Row Level Security.
- Realtime: Supabase Realtime where needed.
- PDF: `expo-print`.
- Excel: `xlsx`.
- QR/barcode: `expo-barcode-scanner`.

## 3. Current Folder Structure

Important roots:

```text
src/app/(admin)     Admin screens
src/app/(super)     Super-admin screens
src/app/(judge)     Judge-facing area
src/app/(public)    No-login public viewer
src/components      Shared UI
src/constants       Category/item/topic constants
src/core            Config, hooks, auth store, utilities
src/lib             Validation/calculation logic
src/types           Shared TypeScript types
supabase/migrations Database migrations
```

## 4. Backend Architecture Direction

Supabase/Postgres remains the system of record. New implementation should avoid direct Supabase calls scattered through UI screens.

Target flow:

```text
Screen -> Hook -> Service -> Rule Engine/Calculator -> Repository -> Supabase
```

This keeps business rules testable, settings configurable, and migrations safer.

Future API flow:

```text
Screen -> Hook -> Frontend Service -> API Provider -> NestJS -> Backend Service -> Repository -> PostgreSQL/Supabase/R2
```

NestJS should be added as an API/backend layer only after frontend service boundaries exist. UI screens must not call NestJS directly.

NestJS responsibilities:

- server-side rule validation.
- sensitive storage signed URL generation.
- certificate/report generation orchestration.
- transfer and sync validation.
- queue/worker coordination (BullMQ + Redis).
- safe abstraction over Supabase/Postgres/R2.

## 5. Multi-Tenant Hierarchy

Supported levels:

```text
Super Admin -> District -> Division -> Sector -> Unit
```

Access principles:

- Users can only access data allowed by their level and tenant.
- Unit admins see only their unit.
- Higher levels can manage lower-level transferred/owned data according to RLS policies.
- Public viewer must only expose published public data.

## 6. Core Domain Modules

- Festival settings.
- Organisations and hierarchy.
- Participants.
- Registrations.
- Group items.
- Schedule and venues.
- Code letter and check-in.
- Judges and marks.
- Results and points.
- Reports.
- Certificates.
- Public viewer.
- Data transfer.
- Storage/files.
- Queue jobs.
- Audit logs.

## 7. Database Principles

Every tenant/festival-scoped table should usually include:

- `id`
- `tenant_id`
- `festival_id`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Every new table exposed to the app needs:

- RLS enabled.
- Role-appropriate policies.
- Indexes for tenant/festival/filter columns.
- Safe migrations only.

## 8. Configurable 2026 Model

Do not hard-code festival-year values in UI or rule functions.

Configurable records:

- festival calendar.
- registration windows.
- active categories.
- active items.
- item-level restrictions.
- book test books.
- speech/story/drawing topics.
- point values.
- grade thresholds.
- minimum judges.
- less-than-3-teams behavior.
- certificate templates.
- storage provider.

## 9. Storage Direction

Current Supabase Storage can remain active. Future file handling should go through `storageService` so Cloudflare R2 can be added without changing UI screens.

Frontend must never store secret storage credentials.

Storage must be designed around logical buckets, not provider-specific bucket names.

Default logical buckets:

- `participant-photos`
- `import-files`
- `reports`
- `certificates`
- `public-assets`
- `transfer-packages`

Provider mapping should live in the database:

```text
logical_bucket_id -> provider -> provider_bucket_name -> privacy -> mime rules -> size limit
```

Screens and hooks must never know whether a file is stored in Supabase Storage or R2. They should call `storageService`, and `storageService` should resolve the active provider and bucket mapping.

Sensitive buckets must stay private. Public access should be limited to `public-assets` and controlled certificate verification/download flows.

## 10. Queue Direction

Long-running work should be queued:

- bulk imports.
- result recalculation.
- report generation.
- certificate generation.
- transfer package generation.

Initial queue can be Postgres-backed. It can later move to Edge Functions, pg_cron, or an external worker.

## 11. Engineering Rules

- Read `plan.md`, `rule.md`, and this file before work.
- Prefer small module-by-module changes.
- Do not rewrite old migrations.
- Do not bypass RLS.
- Do not hard-code 2025 values.
- Keep rules inside rule-engine functions, not UI screens.
- Keep Supabase access inside services/repositories for new work.
- Update `plan.md` Session Log after significant work.
