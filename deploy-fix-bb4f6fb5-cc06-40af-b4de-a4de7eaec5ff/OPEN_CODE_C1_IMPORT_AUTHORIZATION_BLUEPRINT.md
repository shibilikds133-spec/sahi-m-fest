# C1 — Import RPC Authorization Blueprint

**Status:** READ-ONLY analysis + design. No source, migration, database, or configuration changes made.
**Branch:** `main` @ `92dcb8fb`
**Date:** 2026-08-03
**Scope:** Authorization hardening for the 8 dataset-import RPCs (junior/senior/upper-primary/LP/HS/HSS/general/schedule). Related gap in `rollback_unit_assignment` noted (C1.5).

---

## 1. Executive summary

All 8 import RPCs are `SECURITY DEFINER` functions that trust client-supplied `p_tenant_id` / `p_festival_id` with **no `auth.uid()` check, no tenant/festival/superadmin check, and no entity-belonging validation**. Default ACL is `PUBLIC` execute. Any anonymous or cross-tenant caller can inject rows into arbitrary tenants/festivals.

Recommended fix (Option B from prior review): one internal `SECURITY DEFINER` helper `_assert_import_access(p_target_tenant_id, p_target_festival_id)` used at the top of all 8 RPCs, plus entity-scoping fixes and GRANT hygiene. The codebase already has an established, analogous pattern in migration `056_participant_unit_audit_logs.sql`.

---

## 2. RPC inventory (all UNSAFE today)

| # | Function | Migration | Signatures (client-supplied) | Item lookup | Duplicate-participant lookup |
|---|----------|-----------|------------------------------|-------------|------------------------------|
| 1 | `execute_junior_import_chunk` | `058` | `(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)` | festival-scoped `058:128-131` | festival-scoped `058:96` |
| 2 | `execute_senior_import_chunk` | `059` | same, `p_session_id uuid` | festival-scoped `059:98-99` | festival-scoped `059:64` |
| 3 | `execute_upper_primary_import_chunk` | `070` | same, `p_session_id uuid` | festival-scoped `070:131-132` | festival-scoped `070:75` |
| 4 | `execute_lp_import_chunk` | `071` | `(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)` | **tenant-only** `071:102-103` | festival-scoped `071:70` |
| 5 | `execute_hs_import_chunk` | `071` | same, `p_session_id text` | **tenant-only** `071:235-236` | festival-scoped `071:209` |
| 6 | `execute_hss_import_chunk` | `071` | same, `p_session_id text` | **tenant-only** `071:366-367` | festival-scoped `071:340` |
| 7 | `execute_general_import_chunk` | `072` | same, `p_session_id text` | **tenant-only** `072:75-76` | festival-scoped |
| 8 | `execute_schedule_import_chunk` | `061` | `(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_schedule_entries jsonb)` | festival-scoped + `is_active` `061:65-66` | n/a (venues festival-scoped `061:104`) |

Common to all 8:
- **No `auth.uid()` null-check / authentication gate.**
- **No tenant-access check** — `p_tenant_id` is trusted verbatim.
- **No festival-belonging check** — `p_festival_id` is trusted verbatim (festival could belong to a different tenant than `p_tenant_id`).
- **Default `PUBLIC` execute** — no `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`.
- Writes `participants`, `registrations` (and for `061`: `schedules`, `schedule_judges`) with `status='approved'` — bypasses RLS (SECURITY DEFINER).

Related: `rollback_unit_assignment` (`056`) authorizes via `is_org_visible` but does **not** verify the supplied `p_batch_id` is owned by the caller — a separate gap (see C1.5).

---

## 3. Root cause

The import functions were written before multi-tenant authorization matured. They rely on:
- `SECURITY DEFINER` to write through RLS, but never gate entry;
- the client already "knowing" the right tenant/festival (a broken assumption: Supabase exposes RPCs directly to the client).

Helper primitives that already exist and are trusted in this codebase:
- `public.get_my_tenant_id()` — `012:35` / `011:17` (caller tenant, `NULL` for superadmin).
- `public.is_superadmin()` — true when `profiles.is_superadmin`.
- `public.get_visible_organisations(p_tenant_id)` — `029:18` recursive walk **down** the hierarchy from the anchor tenant's org.
- `public.is_org_visible(p_org_id)` — `029:42` (caller's downward tree contains the org).
- Reference authorization pattern already used in `056` (`056:149-159`, `056:217-227`).

---

## 4. Recommended authorization model

### 4.1 One internal helper (no client grant)

```sql
-- Internal only. NO GRANT to any role (called from SECURITY DEFINER context).
CREATE OR REPLACE FUNCTION public._assert_import_access(
  p_target_tenant_id uuid,
  p_target_festival_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Tenant access: caller's tenant OR a descendant org's tenant, or superadmin.
  IF NOT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.get_visible_organisations(public.get_my_tenant_id())
      WHERE tenant_id = p_target_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied: no access to target tenant';
  END IF;

  -- 2. Festival must belong to the target tenant (works for superadmin cross-tenant too).
  IF NOT EXISTS (
    SELECT 1 FROM public.festival_calendar
    WHERE id = p_target_festival_id AND tenant_id = p_target_tenant_id
  ) THEN
    RAISE EXCEPTION 'Festival does not belong to the target tenant';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_import_access(uuid, uuid) FROM PUBLIC;
```

Semantics (matches product intent from `import.tsx` `targetOrg?.tenant_id || tenantId`):
- **Parent → child tenant import:** allowed — child org is in the caller's downward tree via `get_visible_organisations`.
- **Same-tenant import:** allowed — anchor org carries `tenant_id = get_my_tenant_id()`.
- **Sibling / unrelated tenant:** rejected — not in the caller's downward tree (walk is down-only).
- **Superadmin:** short-circuits to TRUE; cross-tenant import explicitly intended. Festival-belonging still enforced for consistency.
- **Unauthenticated:** rejected.

Alternative considered (rejected): per-RPC inline checks → duplicated drift across 8 functions. Option A (frontend-side `organisation_id` gating) rejected earlier: client-only, no real protection.

### 4.2 Apply at the top of all 8 RPCs

Insert immediately after `BEGIN` in each of `058`, `059`, `070`, `071` (×3), `072`, `061`:

```sql
PERFORM public._assert_import_access(p_tenant_id, p_festival_id);
```

---

## 5. Entity-validation fixes (defense-in-depth)

These are correctness/security fixes, not signature changes:

1. **Item lookup — align LP/HS/HSS/general with the JR/SR/UP festival-scoped pattern.**
   Replace `WHERE tenant_id = p_tenant_id AND item_code = v_event_code`
   with `WHERE festival_id = p_festival_id AND item_code = v_event_code`
   in `071:102-103`, `071:235-236`, `071:366-367`, `072:75-76`.
   Rationale: closes cross-festival item leakage within a tenant; a festival belongs to exactly one tenant, so this is strictly tighter and matches `058/059/070/061`.
   ⚠ **Behavior change to verify:** any tenant-scoped item with `festival_id IS NULL` previously matched and will now be skipped. Confirm test fixtures cover this (see §12).

2. **Participant duplicate lookup — add `tenant_id = p_tenant_id`** alongside the existing `festival_id = p_festival_id AND chest_number = v_chest` (`058:96`, `059:64`, `070:75`, `071:70/209/340`, `072`) for defense-in-depth on the denormalized `participants.tenant_id`.

3. **Schedule import (061):** add `tenant_id = p_tenant_id` to the venue lookup (`061:104`) and to the item lookup (`061:65`) for the same reason; keep `is_active = true`.

4. **`p_session_id` type inconsistency** (`uuid` in junior/senior/UP vs `text` in LP/HS/HSS/general): pre-existing, **intentionally NOT changed** in this work (would ripple into `SupabaseDatabaseProvider.ts`). Logged as a follow-up.

---

## 6. GRANT hygiene

For each of the 8 functions (by full signature):

```sql
REVOKE ALL ON FUNCTION public.<name>(<full sig>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<full sig>) TO authenticated;
```

The helper `_assert_import_access` gets **no** grant (internal only). Verify with `\df+` that `PUBLIC` no longer holds execute.

---

## 7. Frontend impact

**None.** All 8 signatures preserved; `p_tenant_id`/`p_festival_id` unchanged. `SupabaseDatabaseProvider.ts` callers (`1497-1574`) and `import.tsx` (already passes `targetOrg?.tenant_id || tenantId` and the active festival) require no edits. No TypeScript changes.

---

## 8. Implementation batches (for implementation phase)

- **C1.1** — Shared foundation: create `_assert_import_access` + GRANT hygiene for all 8 RPCs.
- **C1.2** — Participant import hardening: JR/SR/UP (`058/059/070`) — insert gate, add `_assert_import_access`, tenant-id on duplicate lookup.
- **C1.3** — Existing-participant hardening: LP/HS/HSS (`071`) + general (`072`) — gate + festival-scoped item lookup.
- **C1.4** — Schedule import hardening (`061`) — gate + tenant-id on venue/item lookups.
- **C1.5** — (Related, separate) `rollback_unit_assignment` batch-ownership check (`056`) — verify `p_batch_id` owner before rollback.

---

## 9. Migration numbering

**Not assigned** in this read-only phase. Next available number is **`094`** (latest is `093_secure_token_bound_judge_marks.sql`). Recommend a single migration `094_import_rpc_authorization.sql` containing helper + all rewrites + GRANTs, so it can be reviewed/applied atomically and reconciled against Codex migration files.

---

## 10. Open questions for the user

1. Confirm **parent→child tenant import must remain allowed** (recommended YES per product hierarchy).
2. Confirm **superadmin cross-tenant import is intended behavior** (recommended YES; will be documented + tested, not treated as a bypass).
3. Confirm the **`festival_id IS NULL` item-skip** behavior change is acceptable (or whether tenant-scoped items with NULL festival must be preserved via a fallback `OR festival_id IS NULL` — note JR/SR/UP already use strict festival scoping).
4. Confirm **`_assert_import_access` naming/`_`-prefix** convention (mirrors existing internal-function style).

---

## 11. Verification plan

- `SELECT has_function_privilege('anon', 'public.execute_lp_import_chunk(text)', 'EXECUTE')` → must be `false`.
- Call each RPC from `anon`/`authenticated` with a foreign `p_tenant_id` → expect `Permission denied`.
- Call with correct tenant but foreign festival → expect `Festival does not belong`.
- Parent-admin → child tenant import → expect success; sibling tenant → denied.
- Superadmin cross-tenant import → success (documented).
- Re-run existing import smoke tests (`execute_*` happy path per category) to catch the item-lookup behavior change.

---

## 12. Confirmation of read-only status

No source, migration, database, or configuration changes were made. No migration created, numbered, edited, applied, or pushed. Codex reconciliation files, migration `093`, and all existing files left untouched. No credentials or live catalog accessed. Only this report was written.

---

## Summary of recommended changes (delivery shape)

| File | Change |
|------|--------|
| `094_import_rpc_authorization.sql` (new) | `_assert_import_access` helper (no grant); gate in all 8 RPCs; festival-scoped item lookups in `071`/`072`; tenant-id on duplicate/venue lookups; `REVOKE PUBLIC` + `GRANT authenticated` on all 8. |

READ-ONLY C1 IMPLEMENTATION BLUEPRINT COMPLETED — WAITING FOR MIGRATION RECONCILIATION
