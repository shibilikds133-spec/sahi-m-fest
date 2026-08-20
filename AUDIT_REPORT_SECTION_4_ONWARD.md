# Full Application Audit — Section 4 Onward

Audit date: 2026-08-15  
Scope: checklist sections 4–15 only. Sections 1–3 were treated as user-verified.  
Mode: read-only repository, production schema inspection, local browser smoke test, lint/type checks. No code, migration, or deployment change was made during this audit.

## Executive result

The application is not ready for a clean production sign-off yet. The most important risks are:

1. several schedule, check-in, marks, results, stage, and PDF paths identify records by `item_id` instead of `schedule_id`;
2. production RLS still contains broad authenticated `true` policies on operational tables;
3. two judge readiness RPCs and the safe-unassign RPC are executable by `anon` in production;
4. bulk schedule creation is atomic, but does not enforce venue time-overlap rules in the database;
5. the JSON schedule importer has a hard-coded fallback tenant ID and intentionally performs partial chunk imports;
6. local and production migration histories are out of sync (`136–138` and `141` are not recorded remotely, and there are duplicate local `134` migration IDs);
7. the current lint/type gates are already failing independently of this audit.

## Severity key

- **P0** — immediate security/data-integrity risk; do not deploy dependent changes.
- **P1** — high probability of wrong-tenant/wrong-event data or destructive workflow failure.
- **P2** — material correctness, reliability, or operational issue.
- **P3** — quality, UX, or maintainability issue.

## Findings

### P0 — Production RLS allows broad authenticated access

Remote `pg_policies` inspection on project `szhwkngspodujiqzblab` found permissive policies with `USING true` / `WITH CHECK true` on:

- `registrations` — `Admins can manage their own registrations`
- `results` — `results_select_policy`, `results_insert_policy`, `results_update_policy`, `results_delete_policy`
- `items` — `items_select`, `items_insert`, `items_update`, `items_delete` variants
- `attendance` — select/insert/update/delete policy variants
- `festival_calendar` — select/insert/update/delete policy variants
- `judges` — authenticated select/insert/update/delete variants
- `point_table` — select/insert/update/delete variants

Because permissive policies are OR-combined, the tenant-scoped policies do not neutralize these broad policies. Team Leader direct access is separately denied by restrictive policies, but other authenticated roles can still receive cross-tenant read/write access through the broad policies. This must be corrected through a reviewed migration and role/tenant matrix before production changes.

Evidence: remote `pg_policies` query on 2026-08-15; RLS is enabled on the affected tables but `FORCE ROW LEVEL SECURITY` is false.

### P0 — R2 presign function has no object ownership authorization

`supabase/functions/r2-presign/index.ts:57-86` authenticates only that a user exists and validates the object-key shape. It does not verify that the caller owns the festival/tenant encoded in the key, or that the caller has permission for the requested operation. `upload`, `download`, `delete`, and `verify` then operate on the supplied key (`:90-148`).

Impact: any authenticated user who can call the function may be able to sign or delete another tenant’s allowed-path object if the object key is known. This is outside the intended tenant isolation contract.

Required gate: server-side resolve of object key → festival → tenant, role check, operation-specific authorization, and audit for delete.

### P0 — Production function grants do not match the intended security contract

Remote privilege inspection found:

- `safe_unassign_registration(uuid,text)` executable by `anon` and `authenticated`;
- `get_judge_submission_summary(uuid)` executable by `anon` and `authenticated`;
- `get_schedule_readiness(uuid)` executable by `anon` and `authenticated`.

The local migration for safe unassign grants only `authenticated`, and the stage/team functions correctly show `anon=false`. Therefore the production state is not aligned with the local security source. These grants must be revoked remotely in a reviewed migration; no anonymous caller should access operational registration/marks readiness or unassignment.

### P1 — Schedule workflows are item-scoped where they must be schedule-scoped

The shared hook `src/core/hooks/useParticipants.ts:33-41` defines `useItemRegistrations(itemId)` without a festival ID in the key or service call. It is used by:

- `src/app/(admin)/schedule/[id]/checkin.tsx:43`
- `src/app/(admin)/schedule/[id]/code-letter.tsx:21`
- `src/app/(admin)/schedule/[id]/marks.tsx:42`
- `src/app/(admin)/schedule/[id]/results.tsx:60`

The service/provider can accept an optional festival ID, but these callers do not pass it. If the same item exists in more than one schedule/festival, the UI can show or mutate registrations belonging to another schedule. Code letters, check-in, marks, and result screens are therefore not reliably isolated to the selected event.

Related provider issue: `SupabaseDatabaseProvider.listResults` (`:1156-1170`) loads the selected schedule’s `item_id` and then selects all results by `item_id`, without `schedule_id` or `festival_id`.

Required gate: use schedule-scoped server RPCs/queries for every operational screen; derive festival and tenant from the schedule server-side, never from a client-selected item alone.

### P1 — Admin schedule dashboard and Stage Management repeat the same item bleed

`src/app/(admin)/schedule/index.tsx:293`, `:302`, `:892`, and `:1045` filter registrations/results by `item_id` while rendering a specific schedule. `src/app/stage-management/index.tsx` also calculates workflow badges with item-based registration matching. This can make check-in, code-letter, marks, and published badges appear on the wrong schedule when an item is reused.

The public leaderboard schedule view also derives reporting/code-letter status with `item_id` (`src/app/(public)/leaderboard.tsx:1080-1082`). Public status should be schedule-specific or omitted if the public contract does not expose operational status.

### P1 — Judge readiness RPCs are not festival-scoped

Remote definitions for `get_judge_submission_summary(p_schedule_id)` and `get_schedule_readiness(p_schedule_id)` join registrations to the selected schedule only through `r.item_id = s.item_id`. They do not constrain registration `tenant_id` or `festival_id` to the schedule.

The RPCs do check the schedule tenant in their outer permission condition, but same-tenant registrations from another festival can still enter the item-based eligible-registration set. This produces incorrect submitted/pending counts and can affect readiness decisions.

### P1 — `safe_unassign_registration` permission boundary is weaker than the operation

`supabase/migrations/135_safe_unassign_registration.sql:39-44` authorizes with `is_superadmin()` or `is_org_visible(registration.organisation_id)`. It does not explicitly require an admin role, tenant equality, active festival ownership, or a server-resolved current festival. The function performs a hard delete when it sees no dependencies.

The dependency checks are a good safety foundation: marks, results/published results, attendance, verification/code letter, group members, and group snapshot are checked. However, a destructive function should use the same strict admin/tenant/festival authorization contract as the surrounding registration mutation path, and production currently has an anonymous execute grant.

### P1 — Bulk schedule RPC is atomic but does not check venue overlaps

`supabase/migrations/142_secure_bulk_schedule_creation.sql` validates active festival, item/venue ownership, duplicate item IDs, time ordering, judge count, and break-context shape. It does not check whether the new slot overlaps an existing schedule at the same venue, nor whether two different rows in the request overlap at the same venue.

The UI preview is not a sufficient final authority because concurrent requests can race. The requested “full breaks before competitions” rule also needs a server-side interval contract, not only client-generated `bulk_break_context`.

### P1 — JSON schedule import can use the wrong tenant and is intentionally partial

`src/app/(admin)/schedule/import-json.tsx:20` falls back to a hard-coded tenant UUID when auth has no tenant. A missing auth tenant must fail closed; it must never select a default tenant.

The import executes 50-row chunks (`:219-252`) and continues after a failed chunk (`continue`). The UI explicitly describes this as safe partial import (`:341`). This can leave a partially imported schedule set while the operator assumes the operation is one logical import. The importer also contains a client workaround for an old migration time-format typo (`:224-228`) and does not share the new bulk RPC contract.

### P1 — Schedule/PDF filtering is not a complete item+category contract

`src/services/schedulePdfService.ts:91-98` matches registrations to schedules by `item_id`; the master/venue calculations at `:297-306` repeat the same pattern. Organisation-wise output groups participants by organisation but does not carry a registration ID or schedule ID into the row. A repeated item or stale participant list can produce wrong counts or duplicate-looking rows.

The admin export does apply the current item/category filters (`:222-235`), but the input is already client-filtered and the PDF generator has no independent tenant/festival assertion. This should be treated as a presentation/export layer, not a security boundary.

### P1 — Migration history is drifted and contains duplicate local IDs

`supabase migration list --linked` shows:

- local `136`, `137`, `138`, and `141` with no remote version;
- local duplicate migration ID `134` (two files) while remote has only one `134`;
- remote `142` is applied.

This means local source, remote production schema, and migration ordering are not a single reproducible state. In particular, local Team Leader context/slug migrations are not confirmed as production-applied. Do not apply a new migration until duplicate IDs and the missing remote versions are reconciled through a migration plan.

### P2 — Team Leader portal reads are server-RPC based but freshness/error handling is incomplete

The service correctly avoids client-supplied tenant/festival IDs and reads through `get_team_leader_*` RPCs. The context is refreshed every five minutes (`src/core/contexts/TeamLeaderContext.tsx`), but dashboard/schedule/results/announcements/team pages fetch their data once and mostly catch errors silently. Only the dashboard exposes a context error state; several data pages can render empty data after a failed request without a retry affordance.

This is consistent with the previously observed “Unable to load portal context”/empty portal symptoms. Add explicit error + retry + refresh states per page and a common invalidation/refetch contract after admin mutations.

### P2 — Team Leader SQL functions need explicit tenant predicates for defense in depth

The Team Leader functions are principally festival/organisation scoped, which is the right shape. Several joins rely on the festival mapping without also asserting `s.tenant_id`, `i.tenant_id`, `v.tenant_id`, or `res` tenant values in the same query. Database integrity may normally make this safe, but the functions are `SECURITY DEFINER`; explicit parent-tenant predicates are recommended as defense in depth and to prevent bad legacy rows from becoming cross-tenant output.

### P2 — Stage Management RPC boundary is stronger than the UI badge logic

`supabase/migrations/139_stage_management_tenant_scope.sql` uses `stage_assert_admin_access()` and schedule/festival tenant checks for stage reads and writes. The mutation RPCs also bind registrations to schedule festival and item. This is a positive control.

However, the dashboard’s visual workflow aggregation is still item-based, and query errors/loading states are not consistently exposed at the index page. The backend boundary should remain the source of truth; the UI should consume schedule-scoped rows returned by the RPC rather than recompute by item.

### P2 — Public schedule smoke test exposed an active-data mismatch

Local browser smoke navigation succeeded for `/`, `/leaderboard`, `/leaderboard/schedule`, and `/team/login`. The public schedule page rendered “No schedules scheduled” for the selected active public festival.

Remote aggregate inspection showed active festivals with schedules and status `scheduled`, so this requires a data-path investigation: public schedule query/nested `items` and `venues` RLS, public settings festival selection, and cache hydration must be tested together. The public status policy allows `scheduled`, `ongoing`, and `in_progress`; this must be compared with actual UI status values and nested relation visibility.

### P2 — Validation gates are failing before any new fixes

Read-only checks on the current worktree:

- `npm run lint`: **237 problems** — 10 errors and 227 warnings. Relevant errors include `expo-file-system` API usage in participant import screens and an unescaped-entity error in Super Admin organisations.
- `npx tsc --noEmit`: fails with participant import typing errors, schedule import `string | undefined` error, existing leaderboard/export errors, and expected Deno/Edge import typing errors under the normal TypeScript config.
- `git diff --check`: no whitespace error in the inspected diff.

The lint/type failures must be separated into baseline vs touched-scope failures before a production release gate is declared green.

### P3 — Schedule editor UI still has inconsistent time contracts

The bulk-create screen uses 12-hour controls and converts internally, while `src/app/(admin)/schedule/[id]/edit.tsx` uses native `input type="time"`. Create, bulk-create, import, edit, preview, and PDF should share one timezone-aware conversion/formatting utility. Otherwise an operator can see different representations for the same instant.

### P3 — Destructive schedule/venue UI actions lack a dependent-data preflight

The schedule dashboard directly deletes schedules after a confirmation (`src/app/(admin)/schedule/index.tsx:405`), and the venue screen directly deletes venues after a confirmation. There is no visible dependent schedule/result/attendance preflight or safe archive path. This is separate from the participant-item safe-unassign flow and should be reviewed before enabling destructive operations in production.

## Verified positives

- Local browser route smoke navigation worked for the landing page, public leaderboard routes, team login, and unauthenticated redirects.
- Stage Management reads/writes use SECURITY DEFINER RPCs with authenticated admin checks and schedule/festival binding.
- Team Leader portal core reads use zero-argument server-resolved RPCs rather than trusting a client tenant/team ID.
- The bulk schedule function is transactional at the function level and prevents duplicate item IDs within one request.
- `safe_unassign_registration` records blocked/removed actions in `audit_logs` and blocks deletion when the currently known operational dependencies exist.
- Remote RLS is enabled on the principal operational tables; the main issue is policy composition, not lack of RLS activation.

## Recommended fix order before production

1. **Security stop:** remove broad `true` policies and anonymous operational function grants; harden R2 object ownership.
2. **Scope stop:** make registration/results/readiness/PDF/stage/public status paths schedule + festival + tenant scoped.
3. **Migration reconciliation:** resolve duplicate local `134`, reconcile remote-missing `136–138`/`141`, then create one reviewed migration for the security fixes.
4. **Schedule integrity:** add server-side venue overlap/break validation and replace the importer’s hard-coded tenant/partial path.
5. **Portal reliability:** add per-page error/retry/refresh, then run authenticated browser tests for admin, stage, judge, team leader, and public flows.
6. **Release gate:** rerun lint/type checks with a documented baseline allowlist, then perform College Fest + Sahithyolsav regression matrix tests.

## Implementation status — 2026-08-15

The source fixes for the P0/P1/P2 findings above are now staged in the worktree, without applying or deploying them:

- `supabase/migrations/143_section4_audit_scope_hardening.sql` narrows operational RLS, removes the broad public registration read, adds schedule-aware result/readiness contracts, venue-overlap protection, safe unassign/delete guards, explicit Team Leader tenant predicates, and authenticated-only function grants.
- `supabase/migrations/144_team_leader_team_branding.sql` preserves the branding migration after resolving the duplicate local `134` migration ID.
- Schedule operational screens, Stage Management, results/PDF matching, JSON schedule import, public schedule reads, R2 presigning, participant import fallbacks, and Team Leader retry states were updated without changing existing route-level options.
- Public leaderboard no longer reads operational registrations directly; public status is derived only from the public schedule contract.
- Local browser smoke routes load without console errors. Targeted ESLint has 0 errors. Full lint/type checks still contain pre-existing baseline issues outside the main audit scope, and local Supabase lint cannot run until Docker/Postgres on `127.0.0.1:54322` is available.

## Completion gate status

Application source work: **implemented and locally smoke-tested**. Database migration/runtime gate: **pending**. Before production, start the local Supabase stack, run `supabase db lint --local --fail-on error`, apply the reviewed migrations in a disposable local database, run authenticated College Fest + Sahithyolsav regression tests, then reconcile the remote migration history before any production apply/deploy.
