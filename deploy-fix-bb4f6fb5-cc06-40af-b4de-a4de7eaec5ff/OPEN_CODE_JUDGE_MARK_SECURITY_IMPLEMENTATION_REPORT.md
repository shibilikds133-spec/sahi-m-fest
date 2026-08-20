# OPEN_CODE — Judge Mark Security Implementation Report

**Branch:** `main`
**Base commit:** `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
**Migration:** `supabase/migrations/093_secure_token_bound_judge_marks.sql`
**Date:** 2026-08-03
**Scope:** P0 security batch — token-bound judge registration access and token-bound draft/final mark submission; removal of direct anonymous `mark_entries` writes.

---

## 1. Root Cause

The judge portal (`src/app/judge/marks.tsx`) relied on:

1. `databaseProvider.getRegistrationsBySchedule(schedule_id)` — an anonymous,
   schedule-id based read (`get_judge_registrations(uuid)`), where the caller
   supplied the schedule id. Any anonymous caller who knew (or guessed) a
   schedule uuid could enumerate registrations for that event without any
   judge token.
2. `databaseProvider.upsertMarkEntry({...})` — a direct `mark_entries` insert
   performed by the anonymous `anon` role. The judge portal runs **without an
   authenticated Supabase session** (the judge uses a plaintext access code),
   so mark writes were gated only by the table RLS policies:
   - `"Public insert for judge tokens"` (actually on `mark_entries`) — an
     unrestricted anonymous `INSERT` policy.
   - `"Public select for mark entries"` and `"Public update for mark entries"`
     — unrestricted anonymous `SELECT`/`UPDATE` policies.

A caller that can enumerate a schedule id can therefore read every participant
and **write arbitrary final marks** for that event without ever holding a judge
token. The approval/rejection workflow, `is_used`/`is_revoked`/`expires_at`
token lifecycle, and `validate_mark_entry_scoring` trigger all became
irrelevant to the anonymous write path.

## 2. Fix Strategy

- **Server-derived context.** All judge, schedule, tenant, and festival
  context is derived inside `SECURITY DEFINER` RPCs from the approved token
  only. A client-supplied schedule id is never authoritative on the judge
  path.
- **Token-bound reads.** The judge registration list is fetched through
  `get_judge_registrations(p_token text)`, which requires an approved, active,
  unexpired, unrevoked, unused token and an active `schedule_judge_assignments`
  row. It returns the judge's own `existing_mark` (draft prefill) but never a
  plaintext token or hash.
- **Token-bound writes.** Draft and final marks are written through
  `upsert_judge_mark(...)`. The RPC re-validates the token, the active
  assignment, the registration's item/festival/tenant/org-tree membership,
  enforces final immutability, stores the authorising `judge_tokens` row id in
  `mark_entries.token_id` (audit), and lets the existing scoring trigger run.
- **Close the direct anonymous write path.** The three unrestricted
  `mark_entries` policies are dropped and `REVOKE ALL ON public.mark_entries
  FROM anon, public` is applied (defense in depth below RLS). A tenant-scoped
  authenticated read policy is re-added for the realtime admin/judge dashboards.
- **Harden the legacy read.** `get_judge_registrations(p_schedule_id uuid)`
  keeps the same shape for the authenticated admin screen but now requires
  `is_superadmin()` or `get_my_tenant_id() = schedule tenant`, and anonymous
  execution is revoked.

## 3. Files Changed

| File | Change |
| --- | --- |
| `supabase/migrations/093_secure_token_bound_judge_marks.sql` | **New.** Token-bound `get_judge_registrations(text)`, hardened `get_judge_registrations(uuid)`, `upsert_judge_mark`, `mark_entries.token_id` column, anonymous policy/privilege closure, `NOTIFY pgrst`. |
| `src/app/judge/marks.tsx` | Judge portal switched to `getJudgeRegistrationsByToken` + `submitJudgeMark`; server `existing_mark` merged for prefill; criteria snapshot built from UI criteria. |
| `src/services/judgeService.ts` | Added `getJudgeRegistrationsByToken`, `submitJudgeMark`. |
| `src/lib/repositories/judgeRepository.ts` | Same two methods (provider passthrough). |
| `src/providers/database/DatabaseProvider.ts` | Interface additions for the two methods. |
| `src/providers/database/SupabaseDatabaseProvider.ts` | Implementations calling `get_judge_registrations({p_token})` and `upsert_judge_mark(...)` with flat-column → `participants`/`existing_mark` mapping. |

Untouched on purpose (still authenticated, schedule-id based): the admin
mark-entry screen `src/app/(admin)/schedule/[id]/marks.tsx`, the admin judges
screen realtime subscription `src/app/(admin)/judges/index.tsx`, and the judge
index/approval screen `src/app/judge/index.tsx` (its realtime `judge_tokens`
subscription is preserved; token RLS is out of scope for this batch).

## 4. Migration Summary (`093`)

1. `ALTER TABLE mark_entries ADD COLUMN token_id uuid REFERENCES judge_tokens(id) ON DELETE SET NULL`.
2. `get_judge_registrations(text)` — `SECURITY DEFINER`, `STABLE`, token
   validated by `token_hash = digest(upper(token))` **or** legacy plaintext
   `token` column; requires `status='approved'`, `is_used=false`,
   `is_revoked IS NOT TRUE`, `expires_at > now()`, active assignment, then
   returns registrations for the token-derived item/festival within the
   schedule tenant's organisation tree (parent→descendant), ordered by
   `code_letter`, with the judge's own latest `existing_mark`. Granted to
   `anon, authenticated`.
3. `get_judge_registrations(uuid)` — hardened: requires superadmin or schedule
   tenant membership; anon/public execution revoked; granted to `authenticated`
   only. Same organisation-tree scoping (Sector→Unit, Division→Sector,
   District→Division), excluding sibling/unrelated orgs.
4. `upsert_judge_mark(token, registration_id, criteria_scores, total_mark,
   status, entry_mode, max_mark, criteria_snapshot)` — re-validates token +
   active assignment, verifies the registration belongs to the token-derived
   item/festival and the permitted organisation tree, rejects `rejected`
   registrations, validates status ∈ {draft, final}, rejects overwriting an
   existing final entry, then upserts on
   `(schedule_id, judge_id, registration_id)`, recording `token_id` and letting
   `validate_mark_entry_scoring` enforce scoring shape/range. Granted to
   `anon, authenticated`.
5. Policy/privilege closure on `mark_entries`: drop `"Public select for mark
   entries"`, `"Public insert for judge tokens"`, `"Public update for mark
   entries"`, `"Enable read access for all authenticated users"`;
   `REVOKE ALL ... FROM anon, public`; re-create tenant-scoped
   `"Tenant members can read mark entries"` for `authenticated`
   (`tenant_id = get_my_tenant_id() OR is_superadmin()`).
6. `NOTIFY pgrst, 'reload schema'`; entire migration wrapped in one
   transaction.

## 5. Security / Functional Regression Checks

- **Anonymous direct write closed:** the former `"Public insert for judge
  tokens"` policy (unrestricted `INSERT` on `mark_entries`) is dropped and the
  `anon`/`public` roles have no table privileges; anonymous `SELECT`/`UPDATE`
  on `mark_entries` are likewise gone.
- **No schedule-id vector on the judge path:** `marks.tsx` no longer calls
  `getRegistrationsBySchedule`; registration reads require an approved token.
- **Token lifecycle honoured server-side:** `approved` + `is_used=false` +
  `is_revoked IS NOT TRUE` + not expired + active assignment — enforced in both
  the read and write RPCs regardless of client state.
- **Final immutability:** a second `final` write is rejected in the RPC before
  the scoring trigger; draft→final remains allowed; final→draft is impossible.
- **Org-tree scope preserved (PARTIAL):** registration eligibility in the
  `text` RPC uses the same recursive organisation tree as the legacy read
  (root organisation plus all descendants), excluding siblings and unrelated
  tenants. The judgement page itself does not display a hierarchy UI, so
  hierarchy *visibility* does not change; eligibility of descendant
  participants is preserved.
- **Approval workflow preserved:** `validate_judge_token` (migration `084`) is
  unchanged; a judge whose token is not yet `approved` can still poll for
  approval on the judge index screen but gets the server-side
  `'Access code is invalid, awaiting approval, or expired.'` on marks.
- **Scoring modes preserved:** the `total_only` and criteria paths both map to
  the existing `entry_mode_snapshot`/`max_mark_snapshot`/`criteria_snapshot`
  columns; `validate_mark_entry_scoring` still validates shapes/ranges. The
  snapshot built on the judge page (`{key, label, max}`) matches the trigger's
  expected `key`/`max` fields.
- **Admin screen unaffected:** `src/app/(admin)/schedule/[id]/marks.tsx`
  continues to use `useScheduleRegistrations`/`useMarkEntries`
  (`upsertMarkEntry`, `finalizeMarkEntry`, `listMarkEntries`) under an
  authenticated tenant-scoped session and RLS.
- **Realtime dashboards preserved:** the re-added tenant-scoped `SELECT`
  policy keeps the admin judges realtime subscription and judge status screens
  working for authenticated members.

## 6. Verification Performed

- `node_modules\.bin\tsc.cmd --noEmit` — only **pre-existing** errors remain,
  all in files not touched by this batch (see section 7). No errors in
  `marks.tsx`, `judgeService.ts`, `judgeRepository.ts`, `DatabaseProvider.ts`,
  or `SupabaseDatabaseProvider.ts`.
- `node_modules\.bin\eslint.cmd` on the five touched files — 0 errors; 1
  pre-existing `react-hooks/exhaustive-deps` warning (missing `loadSession`
  dependency) already present before this change.
- Manual SQL review of `093` (token predicates, active-assignment check,
  org-tree CTE, `ON CONFLICT` clause, policy drop/create, `REVOKE`,
  transaction boundaries).

## 7. Pre-existing Failures (Not Introduced by This Batch)

`tsc --noEmit` fails on pre-existing files only, e.g.:

- `src/app/(admin)/participants/chest-cards.tsx` (`profile_slug` typing).
- `src/app/(admin)/participants/import-*.tsx` (undefined-safe parameter typing,
  `documentDirectory` on expo-file-system, `{}` typing).
- `src/app/(admin)/schedule/import-json.tsx`, `src/app/stage-management/[id]/code-letter.tsx`.
- `src/components/leaderboard/BackgroundExportEngine.tsx`.
- `src/core/contexts/NotificationContext.tsx` (expo-notifications behavior API).
- `supabase/functions/*` (Deno/AWS SDK module resolution — expected; these are
  Deno edge functions, not part of the TS app).

## 8. Limitations & Notes

- **No local database runtime verification.** This environment has no `psql`,
  `pg_ctl`, Docker, or Supabase CLI, and production credentials are
  intentionally local to `.env*`. The migration is reviewed statically only and
  **must** be validated on a staging instance before release. No production
  database was changed; no migrations were applied in this session.
- **Token RLS untouched (out of scope).** `judge_tokens` retains its
  validation read policy so the anonymous approval realtime flow keeps working;
  a future batch could tighten it to a hash-only RPC. Plaintext token columns
  already exist and are matched case-insensitively; hashed matching
  (`token_hash`) is preferred when present.
- **Qualification / current-stage model unchanged.** Scoring entry still relies
  on the item's scoring rule resolved by `event_name` for the judge portal (via
  `formatCriteriaForUI`), consistent with the pre-existing dual-mode model;
  `total_only` mode snapshots 100 as the max. No new assumptions were
  introduced.
- **Org-tree hierarchy preservation: PARTIAL.** Eligibility scoping is
  preserved and anonymous access closed; the judge UI intentionally shows
  code letters only (identity confidential), so no hierarchy browsing surface
  is exposed or removed.
- Untracked files `UPDATED_PROJECT_REVALIDATION_REPORT.md` and
  `GEMINI_SCHEDULE_VENUE_RESULT_ACCESS_ANALYSIS.md` were left untouched.

## 9. Confirmation

- No commits, no pushes, no production data changes, no secrets exposed.
- All changes are auth/security-related and confined to the files listed in
  section 3.
