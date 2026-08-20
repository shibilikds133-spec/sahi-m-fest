# Sahi Web — Full System Architecture Handoff

Updated: 2026-08-16. Read this before editing, migrating or deploying. No
secrets or private participant data are included.

## 1. Project

- `sahi-web`, Expo + Expo Router, React Native Web, TypeScript.
- Styling: NativeWind/Tailwind; state: TanStack Query + Zustand.
- Backend: Supabase PostgreSQL, Auth, RLS, RPC, Realtime and Storage.
- Optional object storage: Cloudflare R2 through Edge Functions.
- PDF/export: jsPDF, jspdf-autotable, XLSX, Expo Print/Sharing.
- Fonts: Poppins, Montserrat, Inter and Noto Sans Malayalam.
- Workspace: `D:\work\fest\web-for-sahi--main\web-for-sahi--main`.
- Worktree is dirty. Preserve unrelated user changes; never reset/checkout.

## 2. Environment

Public client names:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_ENABLE_ONBOARDING`

Server/verification-only names:

- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- R2, Razorpay, Vercel and AI-provider secrets

Never put private keys/passwords in `EXPO_PUBLIC_*`, source, commits or handoff
files.

## 3. Application bootstrap

`src/app/_layout.tsx` loads fonts/theme/global CSS, restores auth, applies
`useProtectedRoute`, creates the QueryClient, mounts notifications and renders
the Expo Router slot.

Important boundaries:

- `src/core/store/authStore.ts`: session/user/role/tenant bootstrap
- `src/core/hooks/useProtectedRoute.ts`: route guards and redirects
- `src/core/contexts/NotificationContext.tsx`: notifications/realtime UI
- `src/core/contexts/TeamLeaderContext.tsx`: server-resolved team context
- `src/providers/database/SupabaseDatabaseProvider.ts`: DB adapter
- `src/providers/auth/SupabaseAuthProvider.ts`: auth adapter
- `src/providers/storage/*`: Supabase/R2 storage abstraction
- `src/lib/repositories/*`: repository layer
- `src/services/*`: domain/service layer
- `src/core/hooks/*`: query/mutation/cache layer

New screens should use repository/service/RPC paths, not unscoped direct
Supabase queries.

## 4. Roles and routes

Public: `/`, `/leaderboard`, `/leaderboard/item-results`,
`/leaderboard/schedule`, `/leaderboard/unit-rankings`, `/candidate/[slug]`,
`/unit-profile/[id]`.

Auth/shared: `/login`, `/team/login`, `/judge`, `/judge/marks`,
`/notifications`, `/settings`.

Admin: `/(admin)/` dashboard; participants/add/imports/[id]/chest numbers/cards;
organisations; team-leaders; judges/approvals/audit; schedule create,
bulk-create, JSON import, venues, check-in, code-letter, edit, marks, results;
communication/history; settings for items/categories/points/calendar/API keys/
scoring rules; leaderboard controls/rankings/item-results/media/posters.

Super Admin: `/(super)/`, tenants and cross-tenant organisations.

Stage: `/stage-management`, venue timeline, stage check-in and code-letter.

Team Leader: `/team/dashboard`, `my-team`, `participants`, `schedule`,
`schedule/full`, `results`, `announcements`, `profile`.

## 5. Domain model and workflows

Hierarchy:

`tenant → festival_calendar → organisations/units/items/venues/schedules`

Participant:

`participant → registration → chest number/check-in/code letter → marks → result → publication → leaderboard/team result`

Schedule:

`item + venue + time + festival → schedule → judges → check-in → code letter → marks → result`

Result publishing calls server RPC `calculate_festival_points(...)` and stores
`points_awarded`, `points_config_version` and `points_calculation`. Historical
views must use stored published values, not recalculate from current config.

## 6. Points system

Main source: `src/app/(admin)/settings/points.tsx`,
`src/core/utils/flexiblePointsEngine.ts`, `src/services/pointsService.ts`,
`src/providers/database/SupabaseDatabaseProvider.ts`.

Database: `points_config`, `points_config_versions`, and
`calculate_festival_points(uuid,text,integer,integer,boolean,text)`.

Verified: 4 config rows; 0 duplicate tenant/festival pairs; unique
`(tenant_id,festival_id)` constraint; points RPC `anon=false`,
`authenticated=true`; source uses `onConflict: 'tenant_id,festival_id'` and
latest config version reads.

## 7. Export system

- `src/services/participantItemsPdfService.ts`: participant/item PDFs, dark
  blue print layout and Malayalam support.
- `src/services/schedulePdfService.ts`: master, venue, organisation/team,
  item-wise and blank schedule PDFs.
- Admin participant/schedule pages expose exports.
- Export source queries must already be tenant/festival/filter scoped; PDFs are
  not a security boundary.

## 8. Team Leader and Judge systems

Team Leader: `teamLeaderPortalService.ts`, `TeamLeaderContext.tsx`,
`TeamLeaderAppShell.tsx`. Implemented fixes include server-resolved context,
default settings, profile slug/navigation, retries, admin caching, dashboard
redesign and team branding. Authenticated browser smoke is still pending.

Judge: `judgeService.ts`, `judgeTokenService.ts`, `judgeRepository.ts`.
Judge token/RPC flow is the login contract; do not restore anonymous direct
judge-table access.

## 9. Security/RLS

Applied hardening includes tenant-scoped operational policies, schedule-scoped
registration/readiness/stage functions, authenticated-only operational RPCs,
points RPC protection, safe schedule/venue deletion contracts, removal of
legacy broad `festival_calendar`/`items` policies and removal of anonymous
judge identification.

Intentionally public RPCs:

- `get_public_leaderboard_scoped(uuid,uuid)`
- `get_public_published_results_scoped(uuid,uuid,boolean)`
- `get_public_leaderboard_settings(uuid,uuid)`

These must return only public/published tenant+festival data. R2 presign must
enforce object ownership, operation authorization, size/type and expiry.

## 10. Migration state

Local migrations extend through 149. Applied atomically after rollback dry-runs:

- 143 `section4_audit_scope_hardening`
- 144 `team_leader_team_branding`
- 145 `public_leaderboard_festival_name`
- 146 `public_leaderboard_tenant_scope`
- 147 `harden_points_config_upsert`
- 148 `remove_legacy_broad_policies`

143 was corrected before apply: invalid `min(uuid)` became ordered
`array_agg(...)[1]`; existing `profile_slug` was preserved. It backfilled only
unambiguous result `schedule_id` values; no rows were deleted. Post-check: 94
result rows total, 80 with `schedule_id`.

149 `tenant_leaderboard_agent_prompt.sql` is local but was not applied in this
session. Inspect and dry-run it before any apply.

Remote migration ledger is drifted: it reports through 142 with historical
gaps. Versions 143–148 are applied in schema but were not fabricated into the
ledger. Never run blind `supabase db push`; reconcile exact versions 136–149
through the official workflow first.

## 11. Audit logs

`public.audit_logs` exists with tenant/user/action/table/record/old/new/time
fields. Latest observed application entry: `UPDATE` on `participants` at
`2026-08-16T08:35:10.240Z`.

DDL, grants and migrations do not automatically create application audit rows.
Migration evidence belongs in the migration ledger/release log, not fabricated
application audit rows.

## 12. Validation

Passed: targeted ESLint for points provider/settings; web export build;
`git diff --check`; rollback dry-runs for 143–146 and 148; post-apply
read-only schema/policy/grant/duplicate checks.

Still pending/not green: full TypeScript baseline errors; Node ESLint false
errors for Deno imports; authenticated browser smoke for all roles; College
Fest + Sahithyolsav regression matrix; staging verification; migration-ledger
reconciliation; migration 149 review/apply.

## 13. Safe commands

```bash
npm install
npx expo start --web --port 8081
npx expo export --platform web
npm run lint
npx tsc --noEmit
```

For every migration: inspect; dry-run in a transaction and rollback; stop on
any error; apply reviewed files atomically; rerun read-only evidence. Never
print secrets, run test-data clear/reset scripts, use `git reset --hard`, broad
deletes, or blind migration pushes.

## 14. Next-agent checklist

1. Read this file and `AUDIT_REPORT_SECTION_4_ONWARD.md`.
2. Inspect `git status`; preserve user changes.
3. Read-only inspect remote ledger/schema/policies/functions/grants.
4. Inspect migration 149; do not assume it is applied.
5. Reconcile versions 136–149 without fake ledger rows.
6. Run authenticated role/browser and College Fest/Sahithyolsav tests.
7. Separate baseline lint/TS failures from touched-scope failures.
8. Do not deploy until staging and release gates are green.

First files: `src/app/_layout.tsx`, `useProtectedRoute.ts`, `authStore.ts`,
`SupabaseDatabaseProvider.ts`, `pointsService.ts`, `teamLeaderPortalService.ts`,
`schedulePdfService.ts`, `participantItemsPdfService.ts`, migrations 090/143/
147/148/149 and `AUDIT_REPORT_SECTION_4_ONWARD.md`.

## Conclusion

Database changes 143–148 are applied and read-only verified. Application audit
logs are active. Migration history is intentionally not fabricated and must be
reconciled by the next agent. Migration 149 is pending and must not be applied
blindly.
