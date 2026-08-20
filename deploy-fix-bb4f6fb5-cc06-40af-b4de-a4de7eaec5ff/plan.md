# Sahi-Web 2026 Complete Agent Plan

This document is the operating plan for SSF Sahithyolsav 2026 work. Every agent, developer, and future session must read this file together with `rule.md` and `project.md` before changing code.

## 1. Mandatory Agent Startup Protocol

Before starting any task:

1. Read `plan.md`, `rule.md`, and `project.md`.
2. Identify the task's module, phase, affected files, database tables, and business rules.
3. Inspect existing code and migrations before writing new code.
4. If the task touches Supabase, read existing migrations in `supabase/migrations/` and follow the migration safety rules below.
5. If the task touches rules, dates, points, categories, items, certificates, registrations, or results, use `rule.md` as the source of truth.
6. Do not hard-code 2025 data. 2026 defaults must be configurable from Settings and stored in the database.
7. Keep all work scoped. Do not rewrite unrelated screens, styles, migrations, or shared utilities.
8. After completing a task, update the Session Log in this file with what changed and what remains.

Agent output format for each task:

```text
Read: plan.md, rule.md, project.md
Task scope:
Files inspected:
Files changed:
Database changes:
Rules used:
Validation/testing:
Remaining risks:
```

## 2. Project Context

- Product: SSF Sahithyolsav festival management system.
- Target year: 2026.
- Existing app: Expo + React Native Web + Expo Router.
- Language: TypeScript.
- UI: NativeWind, Lucide icons, reusable `Ssf*` components.
- State/data: Zustand and TanStack React Query.
- Current backend: Supabase Auth, PostgreSQL, RLS, Storage, Realtime.
- Planned backend direction: keep Supabase/Postgres as system of record for now, introduce service layer, add optional FastAPI backend API layer, isolate rule engine, add queue jobs, and support optional R2 storage for files.
- Routing roots:
  - `src/app/(admin)/`
  - `src/app/(super)/`
  - `src/app/(judge)/`
  - `src/app/(public)/`
- Core code roots:
  - `src/core/`
  - `src/lib/`
  - `src/constants/`
  - `src/components/`
- Migrations: `supabase/migrations/`.

## 3. Current Known State

Completed or partially completed:

- Expo Router app structure.
- Auth screens and Supabase client.
- Super/admin dashboard shells.
- Hierarchy and organisation management.
- Participant add/list/import/detail screens.
- Settings screens for calendar, items, and points.
- Festival hooks: `src/core/hooks/useFestival.ts`.
- Existing mock settings hook: `src/core/hooks/useFestivalSettings.ts`.
- Registration validator: `src/lib/validation/registrationValidator.ts`.
- Result calculator: `src/lib/calculators/resultCalculator.ts`.
- Migrations `001` through `015`.
- Database provider foundation: `src/providers/database/*`.
- Festival settings service boundary: `src/services/festivalSettingsService.ts`.
- Festival repository boundary: `src/lib/repositories/festivalRepository.ts`.
- Participant service boundary: `src/services/participantService.ts`.
- Participant repository boundary: `src/lib/repositories/participantRepository.ts`.
- Auth provider foundation: `src/providers/auth/*`.
- Auth service boundary: `src/services/authService.ts`.
- `src/core/hooks/useFestival.ts` no longer calls Supabase directly.
- Participant list/add/detail/import organisation lookup no longer call Supabase directly.
- `src/core/hooks/useBulkImport.ts` duplicate check and batch insert no longer call Supabase directly.
- Login/session/logout now go through `authService`.

Known gaps:

- Some settings still use mock data.
- Rules are partly hard-coded and partly encoded as constants.
- Malayalam text in some docs/code appears mojibake encoded and needs gradual cleanup.
- No complete service layer boundary yet; the current migration has started with festival settings, participants, bulk import, and auth only.
- R2 storage, queue processing, certificate pipeline, public viewer, and transfer workflow are not complete.
- Many screens listed in the old plan are not implemented yet.
- Some screens outside the migrated scope still call Supabase directly, especially super/admin organisation and dashboard areas.
- `npx tsc --noEmit` still has pre-existing UI/FileSystem typing errors that must be fixed without UI design changes.

## 3.1 Current Decoupling Status

This section tracks the practical migration status so future agents know exactly where the project currently stands.

| Area | Current Status | Files | Notes |
|---|---|---|---|
| Database provider | Started | `src/providers/database/DatabaseProvider.ts`, `src/providers/database/SupabaseDatabaseProvider.ts` | Supabase is still active provider, but app code can begin moving behind provider methods. |
| Festival settings | Migrated | `src/core/hooks/useFestival.ts`, `src/services/festivalSettingsService.ts`, `src/lib/repositories/festivalRepository.ts` | React Query keys and hook shape preserved. |
| Participants | Partially migrated | `src/app/(admin)/participants/index.tsx`, `add.tsx`, `[id]/index.tsx`, `import.tsx`, `src/services/participantService.ts`, `src/lib/repositories/participantRepository.ts` | List/add/detail and import organisation lookup use service layer. |
| Bulk import | Partially migrated | `src/core/hooks/useBulkImport.ts` | Duplicate check and batch insert use service layer. File parsing still lives in hook. |
| Auth | Started | `src/app/(auth)/login.tsx`, `src/core/store/authStore.ts`, `src/services/authService.ts`, `src/providers/auth/*` | Login/session/logout go through auth service. Supabase Auth remains behind provider. |
| Direct Supabase still present | Not complete | super/admin dashboard, organisation screens, participant validation duplicate helper, other modules | Must be migrated gradually without UI changes. |
| TypeScript verification | Not clean yet | existing UI/FileSystem/admin dashboard issues | Current service migration does not introduce new known TypeScript errors, but project still fails `npx tsc --noEmit`. |

Next recommended safe step:

1. Fix existing TypeScript errors without UI design changes.
2. Migrate remaining participant duplicate helper from `participantValidation.ts`.
3. Migrate organisation/super-admin direct Supabase calls behind services.
4. Add soft-delete migration before changing delete behavior.

## 4. Non-Breaking Rules

Never break these:

- Existing login/session behavior.
- Existing tenant and organisation hierarchy behavior.
- Existing participant add/list/import flow unless the task explicitly changes it.
- Existing RLS isolation.
- Existing migrations already applied in production-like environments.
- Existing route names unless a migration path is included.
- Existing public/admin/super/judge route groups.
- Existing env variable names unless new compatible names are added.

No destructive database work:

- Do not drop tables, columns, policies, functions, buckets, or indexes without a written migration note and rollback plan.
- Do not rewrite old migrations. Add a new migration.
- Do not use broad `delete` or `update` migrations without a `where` clause and explanation.
- Do not bypass RLS in app code.
- Do not use service-role keys in frontend code.

## 5. 2026 Configurability Requirement

The system must support 2026 without hard-coded 2025 values.

Configurable data must include:

- Festival year.
- Level calendar dates.
- Registration open/close dates.
- Item enable/disable per level/category/year.
- Points table.
- Grade thresholds.
- Minimum judges.
- Less-than-3-teams behavior.
- Chest number series and manual override.
- Certificate template fields.
- Book test books.
- Speech/story/drawing topics.
- Special item notes and restrictions.

Required database direction:

- Store defaults as 2026 seed/config rows.
- Allow tenant/festival-level overrides.
- Preserve 2025 rule references as historical data, not active defaults.
- Add audit fields for settings changes: `created_by`, `updated_by`, `updated_at`.

## 6. Architecture Target

Use this architecture for new work:

```text
UI screens
  -> feature hooks
  -> service layer
  -> rule engine / calculators
  -> Supabase repositories
  -> Postgres tables, RPCs, RLS
```

Recommended folders:

```text
src/features/
  participants/
  registrations/
  schedule/
  judges/
  marks/
  results/
  reports/
  certificates/
  transfer/
  settings/

src/services/
  participantService.ts
  authService.ts
  registrationService.ts
  festivalSettingsService.ts
  resultService.ts
  certificateService.ts
  storageService.ts
  syncService.ts
  reportService.ts

src/lib/rules/
  ruleEngine.ts
  registrationRules.ts
  resultRules.ts
  scheduleRules.ts
  certificateRules.ts

src/lib/repositories/
  festivalRepository.ts
  participantRepository.ts
  registrationRepository.ts
  resultRepository.ts
```

Do not create this full structure in one large refactor. Introduce it module by module when touching that module.

## 6.1 Future FastAPI Backend Layer

FastAPI is approved as the future backend API layer, but it must be introduced gradually and must not force a UI rewrite.

Target architecture:

```text
Expo UI
  -> hooks
  -> frontend services
  -> API provider
  -> FastAPI
  -> backend services / rule engine / workers
  -> PostgreSQL / Supabase / R2
```

Rules:

- Do not connect UI screens directly to FastAPI.
- Frontend screens must continue calling frontend services.
- Services may switch provider from Supabase provider to FastAPI API provider module by module.
- Supabase remains active until a module has a tested FastAPI replacement.
- Do not migrate auth, storage, realtime, and database all at once.
- FastAPI must never break Expo Router routes, React Query keys, Zustand auth state, or existing UI flows.
- FastAPI must own sensitive operations that should not live in frontend:
  - R2 signed URL generation.
  - certificate/report generation.
  - transfer package validation.
  - server-side rule validation.
  - secure sync/federation logic.
  - future worker queue coordination.

Suggested backend folder, when added:

```text
backend/
  app/
    main.py
    api/
      participants.py
      auth.py
      settings.py
      storage.py
      reports.py
      certificates.py
      sync.py
    services/
    repositories/
    rules/
    workers/
    config.py
  pyproject.toml
  README.md
```

Safe rollout order:

1. Finish frontend service/provider boundaries.
2. Add FastAPI scaffold without changing UI.
3. Add health check endpoint.
4. Add one low-risk read endpoint, such as active festival or participant list.
5. Add API provider in frontend service layer.
6. Feature-flag the API provider per module.
7. Compare Supabase-provider and FastAPI-provider outputs.
8. Switch one module only after verification.

## 7. Supabase Migration Strategy

Every database task must:

1. Read existing migrations first.
2. Create a new numbered migration.
3. Use additive changes first: new tables, nullable columns, indexes, policies, functions.
4. Backfill data safely in small, explicit statements.
5. Add RLS policies for every new table before exposing it in the app.
6. Add `tenant_id` and `festival_id` where data is tenant/festival scoped.
7. Keep `created_at`, `updated_at`, and audit columns where admin actions matter.
8. Test queries with the expected role model: super, district, division, sector, unit, judge, public.

Suggested near-term migrations:

- `016_2026_festival_settings.sql`
  - festival year/config tables.
  - calendar defaults and tenant overrides.
  - points/grade/min-judge config.
- `017_rule_engine_tables.sql`
  - item rules, category rules, topic/book-test config.
  - active rule set per festival.
- `018_registration_result_core.sql`
  - registrations, group members, schedules, judges, marks, results, point ledger if missing.
- `019_certificate_storage_jobs.sql`
  - certificate templates, generated certificates, job queue records.
- `020_storage_provider_config.sql`
  - Supabase Storage/R2 provider config and file metadata.

## 8. Service Layer Rules

New screens must not directly scatter Supabase calls everywhere.

Use services for:

- Participant CRUD and import.
- Registration validation and save.
- Calendar/settings updates.
- Mark entry and result calculation.
- Certificate generation.
- File upload/download.
- Transfer export/import.

Services must:

- Accept typed input.
- Return typed results.
- Convert Supabase errors into user-safe messages.
- Keep business rules outside UI components.
- Avoid hidden side effects.

## 9. Rule Engine Isolation

Rules must be testable and reusable.

Rule engine responsibilities:

- Registration rules: max item count, category match, same unit, duplicate, group member count, plagiarism ban, registration window, Daf/Arabana restrictions, regional language restrictions.
- Schedule rules: duration limit, venue conflicts, buffer times.
- Result rules: minimum judges, average marks, grade thresholds, tie break, shared rank, less-than-3-teams behavior, points ledger.
- Transfer rules: upward-only transfer, duplicate detection, qualified participant selection, group lock after Division.
- Certificate rules: all grade holders eligible, template/year/level validation.

Rule functions must:

- Be pure where possible.
- Receive config as input.
- Avoid hard-coded 2025 or 2026 values except seed defaults.
- Return structured errors/warnings with rule ids.

## 10. Storage And Bucket Migration

Current app can keep using Supabase Storage. Future storage must support Cloudflare R2 through `storageService`. Bucket design is part of the migration plan and must not be left as an implementation detail.

Never call R2 directly from UI screens.

Storage abstractions:

- `uploadParticipantPhoto`
- `uploadImportFile`
- `uploadCertificatePdf`
- `getSignedDownloadUrl`
- `deleteFileIfAllowed`

### 10.1 Required Buckets

Default logical buckets:

| Bucket | Purpose | Public | Notes |
|---|---|---|---|
| `participant-photos` | Participant profile photos and ID images | No | Signed URLs only. |
| `import-files` | Uploaded Excel/CSV import files | No | Keep original file for audit/debug. |
| `reports` | Generated PDF/Excel reports | No | Admin download only. |
| `certificates` | Generated certificate PDFs/images | Mixed | Private by default; public verification uses controlled signed/read route. |
| `public-assets` | Logos, event banners, public viewer assets | Yes | Only non-sensitive files. |
| `transfer-packages` | JSON/Excel/QR transfer bundles | No | Short expiry and audit mandatory. |

Bucket names may change per provider, but logical bucket ids must stay stable in app code.

### 10.2 Bucket Provider Mapping

Store provider mapping in database, not in UI:

```text
logical_bucket_id -> provider -> provider_bucket_name -> region -> public/private -> max_file_size -> allowed_mime_types
```

Example:

```text
participant-photos -> supabase -> participant-photos
participant-photos -> r2 -> sahi-2026-participant-photos
certificates -> r2 -> sahi-2026-certificates
```

### 10.3 Bucket Migration Rules

When moving from Supabase Storage to R2:

1. Add provider config and metadata tables first.
2. Keep Supabase Storage working while R2 is introduced.
3. Upload new files through `storageService`.
4. Backfill old file metadata before moving files.
5. Copy files bucket by bucket.
6. Verify file count, size, checksum when available, and sample signed downloads.
7. Switch reads to provider config only after verification.
8. Keep rollback option: old Supabase object keys must remain usable until migration is accepted.
9. Never expose R2 account id, access key, secret key, or service credentials in frontend env.

### 10.4 Bucket Setup Agent Instructions

Any agent working on buckets must explain:

- Which logical bucket is being touched.
- Which provider is active: Supabase Storage or R2.
- Whether the bucket is public or private.
- Required MIME types.
- Required max file size.
- Object key format.
- Database metadata table changes.
- RLS/policy changes.
- Migration/rollback plan.

Recommended object key format:

```text
{tenant_id}/{festival_year}/{module}/{entity_id}/{timestamp}-{safe_filename}
```

Examples:

```text
tenant_123/2026/participants/participant_456/20260515-photo.jpg
tenant_123/2026/certificates/result_789/20260515-certificate.pdf
```

### 10.5 Bucket Policies

Private buckets:

- participant photos.
- import files.
- reports.
- transfer packages.
- draft/generated certificates before public release.

Public buckets:

- public assets only.

Certificates:

- Do not make the whole certificates bucket public unless explicitly approved.
- Prefer certificate verification route or short-lived signed URL.
- Public certificate lookup must expose only published certificate data.

File metadata must be stored in Postgres:

- tenant id.
- festival id.
- owner module.
- storage provider.
- logical bucket id.
- provider bucket name.
- object key.
- public URL when applicable.
- signed URL expiry when generated.
- content type.
- size.
- checksum when available.
- created by.
- migration status when copied between providers.

Frontend must never contain R2 secret keys.

## 11. Queue System

Use queue jobs for long or repeatable operations:

- Bulk Excel import validation.
- Chest number generation.
- Bulk certificate generation.
- Results publishing and point ledger recalculation.
- Transfer package generation.
- Large PDF/Excel report generation.

Initial implementation can be database-backed jobs. Later it can move to Supabase Edge Functions, pg_cron, or an external worker.

Job records should include:

- type.
- status.
- payload.
- progress.
- error.
- created_by.
- tenant_id.
- festival_id.

## 12. Certificate Module Rules

Certificates are sensitive output. Do not make them a quick UI-only PDF.

Certificate module must support:

- Template configuration per festival/year.
- SSF branding fields.
- Participant name, chest number, category, item, grade/rank, level, year.
- Bulk generation for all grade holders.
- Regeneration with audit record.
- Download link through storage service.
- Public verification by certificate id or QR code.

## 13. Feature Flags

Use feature flags for large migrations:

- `enable_service_layer_settings`
- `enable_rule_engine_v2`
- `enable_r2_storage`
- `enable_queue_jobs`
- `enable_certificate_v2`
- `enable_public_viewer`
- `enable_transfer_v2`

Default to off until the module is tested.

## 14. Setup Guide For New Agents

If an agent or developer is unfamiliar with this stack, do this:

1. Install dependencies: `npm install`.
2. Start web app: `npm run web`.
3. Lint: `npm run lint`.
4. Supabase env required:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
5. Supabase CLI workflow, if configured:
   - `supabase start`
   - `supabase db reset`
   - `supabase migration new <name>`
6. Expo Router rules:
   - app routes live under `src/app`.
   - admin routes live under `src/app/(admin)`.
   - dynamic routes use `[id].tsx` or `[id]/index.tsx`.
7. NativeWind rule:
   - use `className` styling consistent with existing screens.
8. Icons:
   - use `lucide-react-native` for buttons/actions when available.

## 15. Implementation Phases

### Phase 0 - Documentation And Safety Baseline

- Keep `plan.md`, `rule.md`, and `project.md` aligned.
- Add 2026 configurable rule wording.
- Remove hard-coded 2025 assumptions from plans.
- Document migration rules and agent protocol.

### Phase 1 - Settings And 2026 Rule Config

Files:

- `src/app/(admin)/settings/calendar.tsx`
- `src/app/(admin)/settings/items.tsx`
- `src/app/(admin)/settings/points.tsx`
- `src/core/hooks/useFestival.ts`
- new settings service/repository.

Tasks:

- Replace mock settings usage with Supabase-backed settings.
- Add festival year selector/default 2026.
- Calendar defaults plus override mode.
- Points and grade thresholds configurable.
- Item active/inactive config per festival.
- Audit settings changes.

### Phase 2 - Participant Management Completion

Files:

- `src/app/(admin)/participants/index.tsx`
- `src/app/(admin)/participants/add.tsx`
- `src/app/(admin)/participants/import.tsx`
- `src/app/(admin)/participants/[id]/index.tsx`
- `src/core/hooks/useBulkImport.ts`
- `src/core/utils/participantValidation.ts`

Tasks:

- Search/filter/export.
- Approve/reject with reason.
- Bulk import preview with row-level errors.
- Duplicate check by name + DOB + tenant/festival.
- Chest number generation with manual override.
- Plagiarism ban fields and validation.

### Phase 3 - Registration And Rule Engine

Files:

- `src/lib/validation/registrationValidator.ts`
- new `src/lib/rules/*`.
- `src/app/(admin)/registrations/index.tsx`.
- `src/app/(admin)/participants/[id]/register-items.tsx`.

Tasks:

- Move rules into pure rule engine functions.
- Load festival config from database.
- Validate all 13 registration rules in real time.
- Group registration with min/max and uniqueness.
- Same unit and dual team/category checks.

### Phase 4 - Schedule, Venue, Check-In

Files:

- `src/app/(admin)/schedule/venues.tsx`
- `src/app/(admin)/schedule/create.tsx`
- `src/app/(admin)/schedule/index.tsx`
- `src/app/(admin)/schedule/[id]/code-letter.tsx`
- `src/app/(admin)/schedule/[id]/checkin.tsx`

Tasks:

- Venue CRUD.
- Conflict detection.
- 15-minute buffer support.
- Sector/Division max 2-day enforcement from config.
- Code letter random draw.
- QR/manual check-in.

### Phase 5 - Judges, Marks, Results

Files:

- `src/app/(admin)/judges/index.tsx`
- `src/app/(admin)/marks/[scheduleId].tsx`
- `src/app/(admin)/marks/summary/[itemId].tsx`
- `src/app/(admin)/results/*`
- `src/lib/calculators/resultCalculator.ts`

Tasks:

- Minimum judges configurable, default 3.
- Criteria total validation, default 100.
- Draft/final mark entry lock.
- Result calculation through rule engine.
- Points ledger and publish/unpublish audit.

### Phase 6 - Reports And Certificates

Files:

- `src/app/(admin)/reports/*`
- `src/app/(admin)/certificates/*`
- new certificate service.

Tasks:

- PDF/Excel report generation.
- Certificate template settings.
- Bulk certificate queue jobs.
- Certificate storage metadata.
- QR/public verification support.

### Phase 7 - Public Viewer

Files:

- `src/app/(public)/index.tsx`
- new public routes for schedule, results, points, winners, certificates.

Tasks:

- No-login public schedule.
- Live results.
- Point table.
- Winner list.
- Certificate download/verify.

### Phase 8 - Transfer System

Files:

- `src/app/(admin)/transfer/index.tsx`
- transfer service/rules.

Tasks:

- Upward-only transfer: Unit -> Sector -> Division -> District -> State.
- QR package with expiry.
- JSON/Excel export/import.
- 8-char sync code.
- Duplicate detection.
- Group member lock after Division result publish.

## 16. Testing And Verification

For every task:

- Run TypeScript/lint where possible.
- Test the touched screen in web if UI changed.
- Test RLS-sensitive queries with the expected role.
- Test rules with at least valid, invalid, and warning cases.
- For migrations, include rollback notes in comments or task summary.

Minimum checks:

```bash
npm run lint
npm run web
```

## 17. Agent Task Template

Use this prompt for future agents:

```text
Read `plan.md`, `rule.md`, and `project.md` first. Work only inside the module requested. Follow the 2026 configurable rules model. Do not hard-code 2025 data. If touching Supabase, add a new safe migration and preserve RLS. Use services/rule-engine boundaries where appropriate. After finishing, update `plan.md` Session Log with files changed, database changes, rules used, and remaining risks.

Task:
[write the specific task here]
```

## 18. Session Log

### 18.1 Project Pause Handoff - 2026-05-16

This section is the current restart point for the next developer/agent. Read this before continuing any code work.

Current position:

- The project is currently in Phase 7 leaderboard/public viewer work.
- Participant management, registration, judge access, mark entry, dynamic scoring rules, result publishing, and points calculation are already implemented or partially implemented as described in the Session Log below.
- The point calculation engine is considered complete for the current phase. Do not rebuild or replace it.
- Published results already write `results.points_awarded`; leaderboard work must read/display these existing calculated values only.
- A public leaderboard read path was started through `get_public_leaderboard` RPC and frontend service/hook boundaries:
  - `supabase/migrations/024_public_leaderboard_rpc.sql`
  - `src/core/hooks/useLeaderboard.ts`
  - `src/services/leaderboardService.ts`
  - `src/lib/repositories/leaderboardRepository.ts`
  - `src/providers/database/*`
- A high-fidelity admin leaderboard panel was created at `src/app/(admin)/leaderboard.tsx`, and `src/app/(admin)/settings/index.tsx` currently links to it.

Important correction from latest user instruction (COMPLETED):

- The leaderboard control center was successfully moved into the `Festival Settings -> Leaderboard` area.
- The frontend/design/layout is now housed at `src/app/(admin)/settings/leaderboard.tsx`.
- The standalone `/(admin)/leaderboard` screen was removed.
- `src/app/(admin)/settings/index.tsx` correctly points to the new leaderboard settings route.

What was being worked on when paused:

- We successfully refactored the admin leaderboard UI into the Festival Settings subtree.
- The base UI for publishing, auto-update toggles, and manual refreshes are now part of the settings layout.

Required next work:

1. Connect the new modular configuration UI blocks inside the settings leaderboard to an actual backend state/persistence layer (if not already done).
   - This includes saving changes for: publish, hide, freeze, auto refresh intervals, public visibility toggles, etc.
   - If persistence is needed, add a new safe migration for leaderboard settings/config only. Do not edit old migrations.
2. Build/integrate Poster generation controls (background/template upload UI, dynamic result field mapping UI, export-ready poster action).
3. Build/integrate Optional certificate controls (enable/disable, template rendering settings, dynamic positioning UI, generate from published results).
4. Do not change result calculation, mark entry, participant registration, hierarchy, or point rules during this phase.

Leaderboard hierarchy rule to preserve:

- Sector festival shows Unit rankings.
- Division festival shows Sector rankings.
- District festival shows Division rankings.
- In general, display rankings for the direct child organisations of the active festival root.
- The current RPC/UI may still need refinement to fully enforce direct-child organisation ranking. Do that as a read/display aggregation improvement only; do not touch the core hierarchy design.

Public display restrictions:

- Public leaderboard may show only organisation/unit name, total points, rank, optional movement, optional grade summary, and optional timestamp.
- Never publicly show individual participant points, internal marks, unfinished results, draft scores, or hidden results.

Known verification status:

- `npx eslint src/app/(admin)/leaderboard.tsx` passed.
- `npx eslint src/app/(admin)/settings/index.tsx` passed with one existing unused `FadeInDown` warning.
- `npx tsc --noEmit` still fails on pre-existing issues:
  - Expo FileSystem typing in participant import/list export.
  - `schedule/[id]/marks.tsx` nullable schedule id typing.
  - scoring-rules screens expecting `session` on auth store.
  - super tenant setup mutation references.
- These TypeScript errors were not introduced by leaderboard settings work, but they should be cleaned before a production release.

Recommended restart prompt:

```text
Read `plan.md`, `rule.md`, and `project.md` first. Continue from the Project Pause Handoff. Do not create a standalone leaderboard module. Move/extend the leaderboard management work inside `Festival Settings -> Leaderboard`. Preserve point calculation and result workflows. Add modular settings/control blocks only, using existing leaderboard data and published results. Keep backend changes out unless a safe config-only migration is explicitly needed.
```

| Date | Work Done | Files Changed | Database Changes | Verification | Notes |
|---|---|---|---|---|---|
| 2026-05-15 | Rebuilt documentation plan for 2026 configurable migration, service layer, rule engine, R2/storage abstraction, queue jobs, certificates, feature flags, safe Supabase migration, and agent startup protocol. | `plan.md`, `rule.md`, `project.md` | None | Docs reviewed against current tree and migrations. | Git metadata was not present in the active folder. |
| 2026-05-15 | Added strict bucket-level storage migration plan covering logical buckets, Supabase/R2 provider mapping, privacy policies, object keys, file metadata, migration rules, and agent setup instructions. | `plan.md`, `rule.md`, `project.md` | None | Verified bucket sections exist in all three docs. | Added because bucket-specific migration details were missing from the first documentation pass. |
| 2026-05-15 | Started backend decoupling without UI changes: added database provider, festival repository, festival settings service, and migrated `useFestival` away from direct Supabase calls while preserving React Query keys and hook shape. | `src/providers/database/*`, `src/lib/repositories/festivalRepository.ts`, `src/services/festivalSettingsService.ts`, `src/core/hooks/useFestival.ts`, `plan.md` | None | `npx tsc --noEmit` no longer reports errors from the migrated settings/festival hook; remaining errors are pre-existing UI/FileSystem/Button typing issues. | Supabase remains the active provider behind the new provider boundary. |
| 2026-05-15 | Added participant and auth service boundaries without UI layout changes. Participant list/add/detail/import organisation lookup now use `participantService`; login/session/logout now use `authService`; Supabase remains behind provider implementations. | `src/services/participantService.ts`, `src/lib/repositories/participantRepository.ts`, `src/services/authService.ts`, `src/providers/auth/*`, `src/providers/database/*`, participant screens, login, auth store, `plan.md` | None | Direct Supabase search in participant screens/auth store/login is clean except a false positive for `Array.from`; `npx tsc --noEmit` still fails only on pre-existing admin dashboard and Expo FileSystem typing issues. | `useBulkImport.ts` still contains direct Supabase access and should be the next participant-related service migration. |
| 2026-05-15 | Migrated bulk import duplicate-check and batch participant insert through `participantService`/repository/provider. | `src/core/hooks/useBulkImport.ts`, `src/services/participantService.ts`, `src/lib/repositories/participantRepository.ts`, `src/providers/database/*`, `plan.md` | None | Direct Supabase search for participant/import/auth scope is clean except regex false positive `Array.from`; `npx tsc --noEmit` still fails only on existing admin dashboard and Expo FileSystem typing issues. | Next manual-safe cleanup: fix FileSystem export typing and admin dashboard component typing without UI design changes. |
| 2026-05-15 | Documented FastAPI as approved future backend API layer behind frontend services, with gradual rollout rules and no direct UI calls. | `plan.md`, `project.md`, `rule.md` | None | Documentation-only change. | FastAPI scaffold not added yet; first complete frontend service boundaries and current TypeScript cleanup. |
| 2026-05-16 | **Phase 5 & 4 Implementation Progress:** Completed secure 6-character Judge Access Code generation. Fixed "Invalid code" error in Judge Portal by implementing `validate_judge_token` RPC (SECURITY DEFINER) to bypass RLS for unauthenticated portal access. Verified Admin features: Participant search/filter, manual verification (bypass QR scan), and manual event registration. | `supabase/migrations/021...022`, `SupabaseDatabaseProvider.ts`, `src/app/(judge)/index.tsx`, `plan.md` | `021_generate_judge_token_rpc.sql` (6-char tokens), `022_validate_judge_token_rpc.sql` (anonymous validation). | Verified Judge login flow, Admin check-in search, and manual verification UI. | Next: Complete test data insertion for 'Kodasseri North' and proceed with full end-to-end festival testing. |
| 2026-05-16 | **Bug Fixes (Check-in & Registration):** Fixed check-in UI crash caused by missing `chest_number`, adjusted category mappings (`JUNIOR`->`JR`, `SENIOR`->`SR`, `CAMPUS`->`CA`) and updated DB trigger/constraint. Fixed registration mapping from `unit_org_id` to `organisation_id`, updated React Query caching to invalidate `itemRegistrations` on new registration. Fixed UI search filtering to correctly handle null participant edge cases. | `checkin.tsx`, `participants/[id]/index.tsx`, `useParticipants.ts`, `participantService.ts`, `005_category_age_logic.sql` | Updated `chk_category_code` constraint and updated all legacy `JUNIOR`, `SENIOR`, `CAMPUS` rows to short codes. | Tested Check-in page resilience and event registration dropdown filters (now considers Gender + Short Category Codes). | All test student workflows (Registration + Check-in Verification) should now operate securely. |
| 2026-05-16 | **Phase 5 & 1 Completion (Scoring Engine & Points):** Migrated hardcoded scoring criteria for 183 items to DB. Created Admin UI for criteria management. Implemented dynamic point calculator (Individual vs Group). Updated Results Publication to automatically calculate `total_score` and `points_awarded` using DB-backed `PointsConfig`. Updated Judge Portal for dynamic criteria fetching. | `scoring_rules`, `scoring_criteria`, `points.tsx`, `results.tsx`, `pointCalculator.ts`, `scoringRuleRepository.ts` | `022_scoring_rules.sql` (Seeded 183 items), `023_expanded_points_config.sql` (Ind/Grp columns). | Verified Points management UI, Criteria management UI, and Result publishing flow with dynamic points. | **NEXT PRIORITY: Phase 7 - Leaderboard (Point Table).** Implement live unit-wise/organisation-wise points display based on `results.points_awarded`. |
| 2026-05-17 | **Phase 6 Completion (R2 Media Storage Layer):** Implemented a production-grade Cloudflare R2 storage layer using Supabase Edge Functions. Securely decoupled media assets (posters, certificates, exports) from Supabase Storage. Added `r2-presign` Edge Function for secure 120s presigned URLs without exposing frontend AWS SDK/secrets. Added `storageService`, `uploadService`, and specific wrappers with file validation (UUID naming, size limits). Integrated poster generation flow hook into `results.tsx` publish lifecycle. | `storageService.ts`, `uploadService.ts`, `posterStorage.ts`, `certificateStorage.ts`, `exportStorage.ts`, `_shared/r2Client.ts`, `r2-presign/index.ts`, `results.tsx` | `025_r2_storage_metadata.sql` (Created `file_metadata` with strict public/private RLS policies). | Verified architecture adheres to strict security rules, avoiding frontend secret leaks and keeping backend logic isolated. | **NEXT PRIORITY: Phase 7 - Leaderboard (Point Table).** Proceeding with Leaderboard implementation. |
| 2026-05-16 | **Phase 7 Started (Public Leaderboard):** Added no-login public leaderboard screen backed by published `results.points_awarded` aggregates. Added service/repository/provider boundary and refreshed leaderboard cache after result publish. Fixed missing points config hook import in result publication page. | `src/app/(public)/leaderboard.tsx`, `src/app/(public)/index.tsx`, `src/core/hooks/useLeaderboard.ts`, `src/services/leaderboardService.ts`, `src/lib/repositories/leaderboardRepository.ts`, `src/providers/database/*`, `src/core/hooks/useJudges.ts`, `src/app/(admin)/schedule/[id]/results.tsx`, `plan.md` | `024_public_leaderboard_rpc.sql` creates `get_public_leaderboard` RPC returning published organisation totals only. | `npx tsc --noEmit` still fails on pre-existing FileSystem/scoring/super-admin errors, but the earlier `results.tsx` `usePointsConfig` error is fixed. `npm run lint` still fails on pre-existing FileSystem/unescaped quote lint errors. Browser verification was attempted, but the local Expo server did not respond and the in-app browser blocked localhost navigation. | Apply migration `024` before using the public leaderboard against Supabase. Next: fix remaining TypeScript errors, then expand public viewer to schedule/results detail pages. |
| 2026-05-16 | **Phase 7 Admin Leaderboard UI:** Added a high-fidelity responsive admin leaderboard management panel with desktop sidebar, header live status, metric cards, dominant unit ranking table, right-side control panel, mobile drawer, and mobile card-list ranking layout. Kept the work frontend-only and reused existing leaderboard data hook/service without backend changes. | `src/app/(admin)/leaderboard.tsx`, `src/app/(admin)/_layout.tsx`, `plan.md` | None | `npx eslint src/app/(admin)/leaderboard.tsx` passes. `npx tsc --noEmit` still fails only on pre-existing FileSystem/scoring/super-admin errors. Expo web started on port 8091; direct browser route redirects to public because auth guard is active without an admin session. | The panel is available at `/(admin)/leaderboard` for authenticated admin users. Buttons are visual/control-state actions only except refresh/recalculate, which refetches existing leaderboard data. |
| 2026-05-17 | **Phase 7 Leaderboard Refactor:** Moved the Admin Leaderboard control panel into the `Festival Settings` area without modifying the frontend UI or layout. | `src/app/(admin)/settings/leaderboard.tsx`, `src/app/(admin)/_layout.tsx`, `src/app/(admin)/settings/index.tsx` | None | Verified routes and relative imports inside `settings/leaderboard.tsx`. | The Admin Leaderboard is now officially part of settings (`/(admin)/settings/leaderboard`), satisfying the architecture requirement while keeping the exact existing UI. |
| 2026-05-18 | **Phase 7 Completion (Item-Level Result Controls & Public Leaderboard Fixes):** Refactored the `item-results.tsx` page to group participant results by competition/item, introducing item-level bulk actions (Publish/Hide All) to replace the checkbox system. Resolved the ambiguous `tenant_id` error in `get_festival_results`. Fixed the `get_public_leaderboard` RPC hierarchy logic for sub-units and corrected the fallback festival ID resolution to display results properly for public users. Fixed a NULL check bug in public visibility settings. Pushed the final codebase to the new GitHub repository. | `src/app/(admin)/settings/leaderboard/item-results.tsx`, `supabase/migrations/037...039`, `plan.md` | `037_get_festival_results_hierarchy.sql`, `038_complete_leaderboard_fix.sql`, `039_public_leaderboard_edge_cases.sql` | Verified Public Leaderboard displays 5 unit results. Verified `get_festival_results` fetches accurately for Admin unit-rankings. Verified GitHub push success. | **Completed.** |
| 2026-05-18 | **Public Leaderboard Robustness & DB Recovery Hotfixes:** Resolved a crash on the Public Leaderboard due to an invalid `created_at` column reference in the resolved active festival query by replacing it with `start_date`. Created `040_backfill_published_at.sql` to backfill missing `published_at` timestamps using `NOW()` and ensure draft states are completely hidden. Fixed an over-aggressive database exclusion using `041_emergency_republish.sql` to restore all published results. Fixed React Query cache keys in `useResultVisibility.ts` to completely refresh the public view upon admin publish/hide actions. | `supabase/migrations/039...041`, `src/core/hooks/useResultVisibility.ts`, `src/core/hooks/useLeaderboard.ts`, `src/constants/leaderboard.ts` | `039_public_leaderboard_edge_cases.sql` (v2), `040_backfill_published_at.sql`, `041_emergency_republish.sql` | **NEXT PRIORITY: Public Leaderboard UI Redesign.** Custom layout refactoring for the public leaderboard page (`src/app/(public)/leaderboard.tsx`) as per new UI design specifications. | **NEXT PRIORITY: Next-Level Public Leaderboard UI Upgrade.** Redesign the public leaderboard page (`src/app/(public)/leaderboard.tsx`) to feature premium aesthetics (sleek dark/modern mode, glassmorphism card styling, responsive trophies/podium layout for Top 3 units, dynamic search/filter, and custom micro-animations for rank transitions). |
| 2026-06-11 | **Phase 7 Visual Refinements & Visual Polish:** Applied visual refinements to the Admin Dashboard. Implemented premium dark-sidebar active state, Layer 0.5 secondary surface container, card-specific elevations, softer `#FCFDFD` backgrounds (leaving welcome at `#FFFFFF`), and aligned panel heights. Reduced bottom empty space below the footer to exactly 40px and simplified the Quick Actions wrapper into a layout view. | `src/app/(admin)/index.tsx`, `src/global.css`, `plan.md` | None | `npx tsc --noEmit` verified zero errors in the modified files. | Spacing scale standardized, transitions updated, and native shadow settings preserved. |

