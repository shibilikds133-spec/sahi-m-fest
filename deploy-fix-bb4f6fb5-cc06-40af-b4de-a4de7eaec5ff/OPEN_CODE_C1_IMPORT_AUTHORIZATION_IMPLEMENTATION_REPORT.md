# C1 — Import RPC Authorization — Implementation Report

**Status:** COMPLETE (migration authored, NOT applied to Supabase)
**Branch:** `main`
**Date:** 2026-08-03
**Migration created:** `supabase/migrations/097_import_rpc_authorization.sql`

---

## 1. Migration created

`097_import_rpc_authorization.sql` (1327 lines, forward-only).

- `094` was **not free** (already occupied by `094_reconcile_historical_migration_drift.sql`). Highest existing migration was `096_fix_token_registration_mark_order.sql`, so the next unique number **`097`** was used. Confirmed no other agent/process created `097` before write.
- The migration is **read-only against the DB** — it has not been applied to Supabase or any local Postgres (no `psql` available; static review only).

## 2. Files changed

| File | Change |
|------|--------|
| `supabase/migrations/097_import_rpc_authorization.sql` | **New.** Creates `_assert_import_access` helper; hardens all 8 import RPCs; applies GRANT hygiene. |
| `OPEN_CODE_C1_IMPORT_AUTHORIZATION_IMPLEMENTATION_REPORT.md` | **New.** This report. |
| `OPEN_CODE_C1_IMPORT_AUTHORIZATION_BLUEPRINT.md` | **Existing (untouched).** Prior read-only blueprint; superseded in implementation details (migration number, schedule signature correction). |

No source files, no frontend files, no other migrations modified. `058`, `059`, `061`, `070`, `071`, `072`, `093` untouched.

## 3. RPCs hardened (8/8)

Each was recreated via `CREATE OR REPLACE` with **identical signatures** and given `SET search_path = public` plus an authorization gate as the first statement.

| RPC | Migration (original) | Signature (preserved) | Key hardening beyond the gate |
|-----|----------------------|-----------------------|-------------------------------|
| `execute_junior_import_chunk` | `058` | `(uuid, uuid, uuid, jsonb)` | session scoped to tenant+festival; duplicate lookup scoped by `tenant_id` |
| `execute_senior_import_chunk` | `059` | `(uuid, uuid, uuid, jsonb)` | festival-level detection kept; session + duplicate scoping |
| `execute_upper_primary_import_chunk` | `070` | `(uuid, uuid, uuid, jsonb)` | session + duplicate scoping |
| `execute_lp_import_chunk` | `071` | `(uuid, uuid, text, jsonb)` | item lookup now **festival-scoped** (was tenant-only); duplicate scoping; SQLERRM removed |
| `execute_hs_import_chunk` | `071` | `(uuid, uuid, text, jsonb)` | item lookup **festival-scoped**; duplicate scoping; SQLERRM removed |
| `execute_hss_import_chunk` | `071` | `(uuid, uuid, text, jsonb)` | item lookup **festival-scoped**; duplicate scoping; SQLERRM removed |
| `execute_general_import_chunk` | `072` | `(uuid, uuid, text, jsonb)` | item lookup **festival-scoped**; **reused `participant_id` verified** (safe cast + tenant/festival ownership); SQLERRM removed |
| `execute_schedule_import_chunk` | `061` | `(uuid, uuid, jsonb)` — **3 args** | venue lookup now tenant-scoped (`tenant_id = p_tenant_id`); item already festival-scoped |

Correctness note: `execute_schedule_import_chunk` has **3 parameters** (`p_tenant_id`, `p_festival_id`, `p_schedules`), not 4 — the blueprint's earlier `p_session_id` entry was inaccurate; the implementation preserves the real signature.

## 4. Public/anon execute removed

- All 8 RPCs: `REVOKE ALL ... FROM PUBLIC` and `REVOKE ALL ... FROM anon`, then `GRANT EXECUTE ... TO authenticated`. (Repo-wide search confirmed no pre-existing explicit grants on these 8 functions; they relied on the default PUBLIC execute, now removed.)
- Helper `_assert_import_access`: `REVOKE ALL ... FROM PUBLIC` and `FROM anon`, and **no** grant to `authenticated` — internal-only. It runs under the SECURITY DEFINER owner (postgres) of the calling RPCs.

## 5. Authorization model (approved decisions reflected)

`_assert_import_access(p_tenant_id, p_festival_id)` enforces, in order:

1. **Authenticated caller** — `auth.uid()` must be non-NULL (`Authentication required`).
2. **Non-null festival** — `p_festival_id IS NULL` is rejected (`Festival is required`).
3. **Admin gate** — caller must have `profiles.role IN ('super_admin','tenant_admin','festival_admin','admin','admin_leader','superadmin')` or `is_superadmin = true`. Normal authenticated users (judge/volunteer/participant) are denied.
4. **Tenant hierarchy** — caller's own tenant or an **authorised descendant org's tenant** via `get_visible_organisations(get_my_tenant_id())` (walks DOWN only; siblings/unrelated denied), or **superadmin** short-circuit for explicit cross-tenant import.
5. **Festival ownership** — `festival_calendar.tenant_id = p_target_tenant_id` (enforced for superadmin too).

Hierarchy semantics verified against product decision #1: parent→child allowed (child org is a descendant), child→parent denied (down-only walk), sibling denied, own-tenant allowed, superadmin cross-tenant allowed.

## 6. Entity-validation fixes

- **Items** — LP/HS/HSS/general item lookups changed from `tenant_id = p_tenant_id AND item_code = ...` to `festival_id = p_festival_id AND item_code = ...`, matching the established JR/SR/UP and schedule patterns. This closes cross-festival item leakage within a tenant. Senior/UP and schedule category checks (`category_codes` / item-category) preserved.
- **Venues** (schedule) — lookup now `festival_id = p_festival_id AND tenant_id = p_tenant_id`.
- **Duplicate detection** — all participant-import RPCs scope existing-participant lookups to `festival_id = p_festival_id AND chest_number = ... AND tenant_id = p_tenant_id`.
- **Reused participant IDs** (general import) — a supplied `participant_id` is now (a) cast safely (malformed UUID no longer aborts the chunk; recorded as error), and (b) verified to exist with `tenant_id = p_tenant_id AND festival_id = p_festival_id`; otherwise the participant is skipped with a row-level error.
- **Import sessions** (junior/senior/UP) — `import_sessions` status updates are scoped to `tenant_id = p_tenant_id AND festival_id = p_festival_id`, preventing attachment of a foreign session.
- **SQL error leakage** — raw `SQLERRM` in LP/HS/HSS/general exception handlers replaced with a fixed `'Registration could not be created'` while preserving row-level context (`chest`, `item_code`). Other functions never exposed SQLERRM.

## 7. Parent-child access preserved

Parent admin → child tenant import allowed (approved decision #1) via the `get_visible_organisations` walk-down. No broad same-tenant equality restriction was introduced that would break authorised child imports. Schema-qualified `public.` references used throughout; helper uses explicit `SET search_path = public`.

## 8. Superadmin behavior

`public.is_superadmin()` short-circuits the tenant-hierarchy check, allowing explicit cross-tenant imports (approved decision #2). The festival must still belong to the stated target tenant — a consistency rule, not a bypass.

## 9. Frontend changes required

**None.** Signatures are byte-for-byte compatible with the callers in `src/providers/database/SupabaseDatabaseProvider.ts` (lines 1497–1574):
- junior/senior/UP/LP/HS/HSS/general: 4 args — match preserved 4-arg signatures.
- schedule: 3 args (`p_tenant_id`, `p_festival_id`, `p_schedules`) — matches preserved 3-arg signature.
- Frontend types require `festival_id: string` (non-null), so no legitimate NULL-festival call path exists; per approved decision #3 any NULL festival is now rejected server-side.

## 10. Tests / static checks

- **Structural SQL review** — keyword balance verified: 9 `CREATE OR REPLACE FUNCTION` (1 helper + 8 RPCs); 15 `BEGIN` ↔ 15 `END;` (9 bodies + 6 EXCEPTION blocks); `IF`/`END IF` = 110/55; `LOOP`/`END LOOP` = 38/19; no remaining `SQLERRM` in function bodies; 0 remaining `tenant_id = p_tenant_id AND item_code` (tenant-only item lookups).
- **Line-level diff** of each hardened function against its original migration — only intended changes present (gate, `SET search_path`, scoping additions, SQLERRM replacement, reuse validation); all other differences are trailing-whitespace normalization.
- **Repo-wide search** — all 8 RPC definitions found only in the 6 original migrations + `097`; no external `GRANT ... EXECUTE` on these functions; frontend call shapes confirmed compatible.
- **TypeScript/ESLint** — not run: no source files were touched.
- **Git diff self-review** — directory is not a git repository; verified file inventory via filesystem and content reads instead.

## 11. Remaining limitations (documented, not defects of this migration)

1. **Strict festival item scoping is a behavior change**: custom/global items with `festival_id IS NULL` that were previously matched by tenant-only lookups (LP/HS/HSS/general) will no longer resolve. This matches the existing JR/SR/UP/schedule behavior and the approved `p_festival_id` ownership rule, but should be smoke-tested against real tenant datasets before applying.
2. **Category (`category_codes`) membership is not added** to LP/HS/HSS/general item lookups (only festival scoping). SR/UP/schedule keep their existing category checks. Adding category filters to the other four would risk silently dropping registrations and was deliberately not introduced.
3. **`p_session_id` type inconsistency** (`uuid` for junior/senior/UP vs `text` for LP/HS/HSS/general) is preserved as-is; not part of this scope.
4. **`rollback_unit_assignment` batch-ownership gap** (migration `056`) was noted in the blueprint but is out of the approved C1 scope (not an import RPC); left untouched.
5. **No live DB verification** was possible (no `psql`/local Postgres in this environment). The migration should be applied in a staging DB and the §10 verification plan of the blueprint executed before production apply.
6. **Parent→child festival selection**: a parent admin importing into a child tenant must pass the child tenant's festival (festival must belong to the target tenant). This is enforced server-side; the frontend flow must select the target org's festival.

## 12. Confirmation

- Migration `097_import_rpc_authorization.sql` was **not applied** to Supabase or any database.
- No frontend source files were changed.
- Migration `093` (judge/marks) and all other migrations left untouched.
- No schedules/venues/results RLS policies were modified (only RPC lookup predicates).
- No onboarding or revoke/delete fixes were introduced.
- No git operations performed (not a git repository).
