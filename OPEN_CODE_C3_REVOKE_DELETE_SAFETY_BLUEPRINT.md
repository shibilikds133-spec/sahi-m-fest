# OPEN CODE C3 — Tenant Revoke / Child-Org Delete Safety Blueprint (Read-Only)

Status: READ-ONLY BLUEPRINT. No code, migration, DB, config, or git changes were made.
Purpose: produce an implementation-ready design for safely revoking tenant access and removing child organisations, replacing the legacy irreversible `revoke_tenant_access` and the missing `delete_child_organisation` RPC.

---

## 1. Repository State

- Inner repo: `D:\work\fest\web-for-sahi--main\web-for-sahi--main`
- Branch: `main` — Commit: `92dcb8fb` (inner repo; the outer `D:\work\fest\web-for-sahi--main` path is NOT a git repository).
- Highest migration file: `097_import_rpc_authorization.sql` (created during C1, **NOT applied** to any database).
- C1 output present and untouched: `097_import_rpc_authorization.sql`, `OPEN_CODE_C1_IMPORT_AUTHORIZATION_BLUEPRINT.md`, `OPEN_CODE_C1_IMPORT_AUTHORIZATION_IMPLEMENTATION_REPORT.md`.
- No live DB verification is possible in this environment (no `psql` on PATH); all findings are static/read-only analysis of the migration and source files.

## 2. Scope and Exclusions

In scope:
- Legacy `revoke_tenant_access` RPC (`010_tenant_revocation_func.sql`) — authorization, atomicity, irreversibility.
- Missing `delete_child_organisation` RPC — contract gap, frontend expectations.
- RLS posture on `organisations`, `tenants`, `profiles`, and auth tables.
- Auth-user lifecycle (disable vs ban vs delete), hierarchy safety, audit, frontend wiring.
- Proposed `C3.1`–`C3.4` implementation sub-batches, test plan, and product decision list.

Excluded (by prior/parallel tasks or out of scope):
- Import RPCs and everything in `097`/`093` (being cross-reviewed by Gemini).
- Judge ACLs, token registration (`095`, `096`), historical migration reconciliation (`094`).
- Festival calendar / festival-year sync (`089`), poster studio, leaderboard internals.
- Any config, env, edge-function, or CI changes.

## 3. Parallel Work Detected

- Gemini is independently cross-checking `097_import_rpc_authorization.sql`; C3 must not touch or re-review that file.
- A prior reconciliation effort covered `093`–`096`; C3 confirms it did not add a `revoke_tenant_access` guard or a `delete_child_organisation` RPC.
- No migration number `098` has been assigned by anyone; C3 deliberately assigns **NO** migration number.

## 4. Current Superadmin Revoke Flow (frontend)

UI → service → repository → provider chain:
- `src/app/(super)/tenants/index.tsx` — `handleRevoke(org)`, `revokeMutation`, per-org Trash icon.
- `src/core/hooks/useSuperAdmin.ts:38` — `useRevokeTenantAccess`.
- `src/services/superService.ts` — `revokeTenantAccess`.
- `src/lib/repositories/superRepository.ts` — `revokeTenantAccess`.
- `src/providers/database/SupabaseDatabaseProvider.ts:810-811` — `supabase.rpc('revoke_tenant_access', { p_org_id: orgId })`.
- `onSuccess` invalidates `['superadmin','tenants']`; the tenant then disappears from the list because the `tenants` row was deleted.

Related provider-level table operations (no RPC):
- `listTenantAccounts` (provider ~801-805): direct `SELECT` on `organisations`.
- `deleteGlobalOrganisation` (provider ~796-798): direct `.delete()` on `organisations` — relies entirely on RLS.

## 5. Current Child Delete Flow (frontend)

- `src/app/(admin)/organisations/index.tsx` — `SubOrganisationsManager`, Trash2 button on each child row.
- Confirmation dialog text: `Delete "${org.name}"? This will permanently remove the account and all its data.`
- `src/core/hooks/useOrganisations.ts:33` — `deleteOrganisationMutation` → `organisationService.deleteChildOrganisation` → `organisationRepository.deleteChildOrganisation` → `supabase.rpc('delete_child_organisation', { p_org_id: orgId })` (`organisationRepository.ts:21-25`).
- `onSuccess` invalidates `['childOrganisations', parentId]`.

## 6. RPC and Frontend Contract

| RPC | Defined where | Frontend caller | Effective behavior |
|---|---|---|---|
| `revoke_tenant_access(p_org_id uuid)` | `010` only (SECURITY DEFINER) | superadmin tenants screen | Unlink org → delete `auth.identities` → delete `auth.users` → delete `tenants`; returns `jsonb` (SQLERRM on error) |
| `delete_child_organisation(p_org_id uuid)` | **NOWHERE** | admin organisations screen | Runtime error — RPC does not exist |

Confirmed by grep: the only `delete_*` RPCs in migrations are `revoke_tenant_access` (010) and `delete_judge_safely` (084). `delete_child_organisation` is a pure frontend contract with no backend implementation. The call therefore always fails.

## 7. Current Authorization Failure

1. `revoke_tenant_access` has **no caller check whatsoever**. It is `SECURITY DEFINER`, `SET search_path = public`, executes as owner (superuser), and grants are untouched — so `PUBLIC`/`anon`/`authenticated` can all invoke it. Any unauthenticated caller who can hit the Supabase REST API can pass any org UUID and trigger full account destruction.
2. `delete_child_organisation` does not exist — the authorized-but-unimplemented path fails; meanwhile the dangerous direct-table path below is wide open.
3. **RLS on `organisations` is effectively wide open**:
   - `007` `"Allow public read of organisations"` `FOR SELECT USING (true)` — public read, never dropped.
   - `007` `"Admins full access to organisations"` `FOR ALL USING (true)` — **any authenticated user can INSERT/UPDATE/DELETE any organisation row**; never dropped by `011` or `014`.
   - `011` created `"Superadmins can see all organisations"` and `"Admins can see their own organisation"`, but `014` **dropped** both (lines 7-8) and replaced them with the SELECT-only `"Admins can see own and child organisations"` + `"Superadmins full control organisations"`.
   - Net effective: `organisations` is publicly readable, and DELETE/UPDATE is permitted for every authenticated role (admin, judge, volunteer, participant) directly through PostgREST, bypassing any intended RPC gate. FK constraints (`participants.organisation_id`, `organisations.parent_id`) are the only thing preventing bulk data loss, and they silently fail instead of giving a clean error.
4. `tenants` and `profiles` RLS are tighter (superadmin-only ALL), so the RPC is the only direct path to `tenants`/auth rows — which is exactly why the legacy RPC is the single critical entry point.
5. `auth.users` / `auth.identities` live in the `auth` schema and are not PostgREST-exposed; the only code path that touches them is the SECURITY DEFINER RPC (and historical migration `008`, which wrote the superadmin directly with `crypt()`).

## 8. Current Partial-Failure Risks (legacy RPC, no explicit transaction)

`010` runs four statements with autocommit; if any later step fails, earlier steps remain committed:

| # | Step (010) | Failure mode | Reversible? | Data loss |
|---|---|---|---|---|
| 1 | `UPDATE organisations SET tenant_id = NULL, admin_email = NULL, admin_password_temp = NULL WHERE id = p_org_id` | succeeds | Partially (only if you know the original values) | No |
| 2 | `DELETE FROM auth.identities` for the tenant's users | succeeds | **No** | Yes (login identities) |
| 3 | `DELETE FROM auth.users` | succeeds | **No** | Yes (accounts) |
| 4 | `DELETE FROM tenants` | **Fails** — every tenant-referencing FK (`festival_calendar`, `participants`, `registrations`, `items`, `categories`, `profiles`, `organisations`) has no `ON DELETE CASCADE` | N/A | No (but state is already broken) |

Consequence: on a tenant that actually has data, step 4 throws (FK violation), the `EXCEPTION` block returns `SQLERRM`, but steps 1-3 are already committed. Result: org orphaned (`tenant_id` null), auth users gone, `tenants` row still present with no org/admin — a permanently inconsistent, unrecoverable state. Partial-failure risk: **HIGH** for auth-user deletion, **MEDIUM** overall.

Additional risks:
- Deleting `auth.users` rows whose `id` is referenced by `profiles.id` (FK) is prevented by the FK, so profiles normally save themselves — but only if the profiles exist; step ordering and the missing transaction still corrupt everything else.
- No audit record is written for any of these operations.
- The frontend treats "permanently remove the account and all its data" as the only child-delete option; there is no non-destructive alternative offered.

## 9. Data Dependency Analysis

- `tenants` referenced by: `organisations.tenant_id` (007), `participants.tenant_id`, `registrations.tenant_id`, `items.tenant_id`, `categories.tenant_id`, `festival_calendar.tenant_id` (001), `profiles.tenant_id` (002). All plain FKs, no cascade → `DELETE FROM tenants` is blocked whenever any data exists. Deleting tenants requires explicitly deleting dependents first.
- `organisations` referenced by: `participants.organisation_id` (007:19), `registrations.organisation_id` (007:37), `organisations.parent_id` (007:14). No cascade → hard delete must delete dependents bottom-up (children before parents, participants/registrations before orgs).
- `profiles.id → auth.users.id` and `profiles.tenant_id → tenants.id` (002). Deleting auth users is the only sanctioned way to revoke login today; deleting the profile row would also block login (frontend `getRequiredProfile` throws "Profile not found") but would orphan the auth user.
- Unique index `idx_participants_name_org (participants.name, organisation_id)` (007:31) — participant names are unique within an org; org deletion cascades that constraint.
- No `archived_at` / `status` / `disabled` column exists on `organisations` or `tenants` (only `tenants.subscription_status`, default `'trial'`, from 001). `admin_email` / `admin_password_temp` on `organisations` are used by 010/013/029 but **no `ALTER TABLE organisations ADD COLUMN` exists in the visible migrations** — their DDL must be verified against the live schema (see Information Needed).
- Audit: generic `audit_logs` (001: id, tenant_id, user_id, action, table_name, record_id, old_value, new_value, created_at) and `participant_unit_audit_logs` (056) exist but are not wired into any revoke/delete path.

## 10. Access Operation Definitions (8 distinct operations)

| # | Operation | Function (proposed) | Who may call | Effect | Reversible |
|---|---|---|---|---|---|
| 1 | Disable org access | `disable_organisation_access(p_org_id)` | superadmin, parent admin | Tenant/org flagged disabled; logins blocked (via `auth.users.banned_until`); data untouched | Yes |
| 2 | Re-enable org access | `enable_organisation_access(p_org_id)` | superadmin, parent admin | Clear disable; un-ban users; login restored | Yes |
| 3 | Remove admin login | `remove_organisation_admin_login(p_org_id)` | superadmin only | Null `admin_email`/`admin_password_temp`; ban admin user; keep org+data | Partially |
| 4 | Archive child org | `archive_child_organisation(p_org_id)` | superadmin, parent admin | Set `archived_at`; hidden from active lists; data preserved | Yes |
| 5 | Unlink org from tenant | `unlink_organisation(p_org_id)` | superadmin only | Detach `organisations.tenant_id`; keep both rows | Yes (manual) |
| 6 | Hard-delete tenant | `hard_delete_tenant(p_org_id)` | superadmin only | Delete org dependents → org → tenant (auth users handled by #7) | No |
| 7 | Hard-delete auth user(s) | `hard_delete_organisation_users(p_org_id)` | superadmin only | Delete `auth.identities` then `auth.users` for org users | No |
| 8 | Delete festival data | (no default RPC) | n/a | Purge scores/marks/results for an org | No |

Design rule: operations 1-5 are the default, revocable, non-destructive path. Operations 6-8 are separate, explicit, superadmin-only, preview-backed, and never bundled into a single "revoke" button.

## 11. Proposed Authorization Matrix

Mirror the C1 pattern (`_assert_import_access` style) — a single SECURITY DEFINER helper `_assert_organisation_access(p_org_id, require_superadmin boolean)`:

| Operation | `is_superadmin()` | Parent admin of `p_org_id` (`parent_id = get_my_org_id()` or `p_org_id ∈ get_visible_organisations(get_my_tenant_id())`) | Unrelated admin / judge / volunteer / participant | anon |
|---|---|---|---|---|
| Disable / re-enable / archive | ✅ | ✅ | ❌ | ❌ |
| Remove admin login | ✅ | ❌ | ❌ | ❌ |
| Unlink org | ✅ | ❌ | ❌ | ❌ |
| Preview / hard delete | ✅ | ❌ | ❌ | ❌ |

Enforcement points:
- RPC-level: `PERFORM public._assert_organisation_access(...)` first statement; `auth.uid()` must be non-null.
- RLS-level (future C3.3): add `archived_at IS NULL` to the read policy so archived orgs vanish from default queries; keep the wide-open `007` write policy in scope to be dropped/rewritten (it is a separate latent bug).
- All new RPCs: `SECURITY DEFINER`, `SET search_path = public`, explicit `REVOKE ... FROM PUBLIC, anon` and `GRANT EXECUTE TO authenticated` — never rely on defaults.

## 12. Hierarchy Safety

- Helpers already exist: `get_visible_organisations(p_tenant_id)` (029:18, walk-down anchor+descendants), `is_org_visible` (029:42), `get_my_org_id()` (014:11), `get_my_tenant_id()` (011/012).
- Use `get_visible_organisations(get_my_tenant_id())` as the "can manage" set for parent admins (covers multi-level children), and `is_superadmin()` for global scope.
- Forbidden operations by construction:
  - Parent admin may never act on their own org (`p_org_id` = `get_my_org_id()`) or any ancestor — only on descendants.
  - Moving/archiving may never create a cycle: `parent_id` must not equal self or a descendant.
  - Superadmin may act on any org including orphans (`tenant_id IS NULL`) but hard delete still requires explicit preview.
- Default disable flow keeps the hierarchy intact; unlink/hard-delete removes the org from the tree only at the final, explicit step.

## 13. Auth User Management Options

| Option | Mechanism | Blocks login? | Kills existing session? | Reversible? | Notes |
|---|---|---|---|---|---|
| (a) Ban users | Set `auth.users.banned_until` via SECURITY DEFINER RPC or a service-role edge function | ✅ (clean Supabase error) | ✅ (session check fails) | ✅ (clear ban) | Recommended default for "disable". Requires direct `auth` schema write (PostgREST can't; SECURITY DEFINER can, or a small edge function). |
| (b) Remove admin login | Null `admin_email`/`admin_password_temp` on org + ban admin user | ✅ | depends on (a) | Partial | Keeps judge/volunteer/participant logins if they use their own accounts. |
| (c) Delete profile row | `DELETE FROM profiles` (superadmin RLS) | ✅ ("Profile not found") | no | manual | Orphans the `auth.users` row; not recommended. |
| (d) Hard delete auth user | `DELETE FROM auth.identities`, then `auth.users` | ✅ | ✅ | ❌ | Only inside the explicit hard-delete operation (#6/#7), superadmin-only. |
| (e) Do nothing to auth | Unlink org only | no | no | n/a | Only for structural unlink, never a security control. |

No edge function currently uses `service_role` for auth-admin (only `notification-cron`, `r2-presign`, `send-notification`, `_shared/r2Client.ts`). Recommendation: implement banning inside the SECURITY DEFINER RPC (single code path, no new deployment) and only fall back to an edge function if `auth` schema writes are restricted.

## 14. Safe Disable / Re-enable Design (default workflow)

1. `disable_organisation_access(p_org_id)`:
   - `_assert_organisation_access(p_org_id, false)`.
   - Update `organisations SET tenant_id = NULL`? **No** — do not unlink. Instead record state on a new column (`organisations.access_disabled boolean default false`) OR null `admin_email`/`admin_password_temp` only.
   - Ban all of the org's auth users: `UPDATE auth.users SET banned_until = now() WHERE id IN (SELECT id FROM profiles WHERE tenant_id = <org's tenant>)`.
   - Write `audit_logs` row (`action='disable_organisation_access'`, actor, before/after).
2. `enable_organisation_access(p_org_id)`: clear the flag, `UPDATE auth.users SET banned_until = NULL` for those users, audit. Fully reversible.
3. Existing sessions: banning kills them via standard Supabase session validation; unlink-only would not, so disable MUST use banning to meet "block access now".
4. Data is never touched; festival data remains queryable by judges/superadmin.

## 15. Child Archive Design

- New column `organisations.archived_at timestamptz` (future C3.3 migration; also re-verify/ensure `admin_email`, `admin_password_temp` exist).
- `archive_child_organisation(p_org_id)`: parent-admin or superadmin; sets `archived_at = now()`; recursive archive of descendants via `get_visible_organisations`; audit.
- `unarchive_child_organisation(p_org_id)`: clears it; audit.
- RLS read policy becomes: `(archived_at IS NULL) AND (own OR child OR superadmin)` — archived orgs hidden from default `childOrganisations` and tenant lists; superadmin sees all via a separate query filter.
- Frontend: sub-org rows get "Archive / Restore" actions; confirmation text replaces the permanent-delete wording for the non-destructive path.

## 16. Hard Delete Design (explicit, superadmin-only, default OFF)

- `preview_organisation_deletion(p_org_id)` → `jsonb` counts: { organisations (descendants), participants, registrations, items/categories (tenant-owned), festival_calendar rows, profiles, auth_users }.
- `hard_delete_organisation(p_org_id)`:
  - Guard: `is_superadmin()` only; verify `p_org_id` valid; wrap in one explicit transaction.
  - Order: descendants (bottom-up) → participants → registrations → tenant-owned items/categories/calendar (decided by product; default preserve scores) → unlink tenant → delete tenant → delete `auth.identities` → delete `auth.users` → delete org rows.
  - Every step audited to `audit_logs`; on any failure the whole transaction rolls back.
  - Never auto-run; always requires preview + explicit confirm.
- `delete_child_organisation` resolution: keep it as a thin, guarded alias to `hard_delete_organisation` (behind `is_superadmin()` + parent check) OR rewire the frontend to call the new RPCs — product decision (see §25).

## 17. Audit Design

- Reuse `audit_logs` (001). New actions to record: `disable_organisation_access`, `enable_organisation_access`, `remove_organisation_admin_login`, `archive_child_organisation`, `unarchive_child_organisation`, `unlink_organisation`, `preview_organisation_deletion`, `hard_delete_organisation`, `hard_delete_organisation_users`.
- Columns: `tenant_id` = target tenant, `user_id` = `auth.uid()` actor, `table_name`/`record_id` = target org, `old_value`/`new_value` = JSONB before/after snapshots.
- Insert the audit row inside the same transaction as the mutation so partial states are never recorded as success.

## 18. Frontend Action Design

- Superadmin `(super)/tenants` screen: replace the single Trash/revoke action with an action menu: **Disable access / Re-enable**, **Remove admin login**, **Archive**, and (collapsed, superadmin-only, preview-backed) **Permanently delete**. On success invalidate `['superadmin','tenants']`.
- Admin `(admin)/organisations` screen: primary child action becomes **Archive** (revocable) with wording `Archive "${org.name}"? It will be hidden but its data is kept.` Hard-delete stays out of the default UI.
- `useSuperAdmin`, `superService`, `superRepository`, `organisationService`, `organisationRepository`, `SupabaseDatabaseProvider` gain per-operation methods mapping 1:1 to the RPCs; no single generic `action` param RPC on the frontend.
- New hooks invalidate `['superadmin','tenants']` and `['childOrganisations', parentId]` appropriately.

## 19. SECURITY DEFINER and Grant Plan

For each new RPC (`disable_organisation_access`, `enable_organisation_access`, `remove_organisation_admin_login`, `archive_child_organisation`, `unarchive_child_organisation`, `unlink_organisation`, `preview_organisation_deletion`, `hard_delete_organisation`, and the fixed `revoke_tenant_access`):
1. `CREATE OR REPLACE FUNCTION ... RETURNS ... LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
2. First statement: caller authorization (`_assert_organisation_access` or `is_superadmin()`).
3. `REVOKE ALL ON FUNCTION <fn>(...) FROM PUBLIC; REVOKE ALL ON FUNCTION <fn>(...) FROM anon; REVOKE ALL ON FUNCTION <fn>(...) FROM authenticated; GRANT EXECUTE ON FUNCTION <fn>(...) TO authenticated;`.
4. Helper `_assert_organisation_access` mirrors C1's `_assert_import_access`: throws `insufficient_privilege`-style exception, never returns `SQLERRM` strings to hide errors.
5. Neutralize legacy: in C3.1, `CREATE OR REPLACE` `revoke_tenant_access` to add the superadmin guard + transaction + audit, and `REVOKE ALL ... FROM PUBLIC, anon`.

## 20. C3.1 — Neutralize Legacy + Audit (implementation plan)

Migration `C3.1` (number assigned at implementation time):
- `CREATE OR REPLACE FUNCTION public.revoke_tenant_access(p_org_id uuid)`:
  - Guard: `IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'insufficient_privilege'`.
  - Wrap all steps in one transaction.
  - New semantics (disable-first, no auto auth deletion): unlink org, ban admin user, audit — hard-delete steps removed from this function.
- `REVOKE ALL ON FUNCTION public.revoke_tenant_access(uuid) FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.
- `CREATE OR REPLACE FUNCTION public._assert_organisation_access(...)` helper.
- Frontend: point superadmin tenants screen at the new disable/enable RPCs (C3.2) and stop calling `revoke_tenant_access` directly.

## 21. C3.2 — Disable / Enable / Remove Admin Login (implementation plan)

Migration `C3.2`:
- `disable_organisation_access(p_org_id)` / `enable_organisation_access(p_org_id)`: flag toggle + `auth.users.banned_until` update + audit (transactional).
- `remove_organisation_admin_login(p_org_id)`: superadmin-only; null admin credentials; ban admin user; audit.
- Grants per §19. Frontend: superadmin action menu; invalidate `['superadmin','tenants']`.

## 22. C3.3 — Child Archive + RLS Tightening (implementation plan)

Migration `C3.3`:
- `ALTER TABLE organisations ADD COLUMN archived_at timestamptz` (and verify/add `admin_email`, `admin_password_temp` if missing from live DDL).
- `archive_child_organisation` / `unarchive_child_organisation` (recursive via `get_visible_organisations`), transactional + audit.
- RLS: drop the wide-open `007 "Admins full access to organisations"` (FOR ALL USING(true)) and `007 "Allow public read of organisations"` (SELECT true); add archived-aware read policy (own / child / superadmin) and a write policy restricted to superadmin (plus, if approved, parent-admin archive via RPC only).
- Frontend: sub-org archive/restore actions; wording change (§18).

## 23. C3.4 — Preview + Hard Delete (implementation plan)

Migration `C3.4`:
- `preview_organisation_deletion(p_org_id)` → jsonb counts (§16).
- `hard_delete_organisation(p_org_id)`: superadmin-only, single transaction, bottom-up deletion, auth users last, full audit.
- Resolve `delete_child_organisation`: guarded alias to hard delete or frontend rewire (product decision).
- Grants per §19. Frontend: superadmin-only, preview-before-confirm dialog; default UI does not expose it.

## 24. Required Tests

1. anon call to `revoke_tenant_access` → rejected.
2. authenticated non-superadmin call to `revoke_tenant_access` → rejected.
3. superadmin call to new `revoke_tenant_access` → disable flow, org unlinked, admin banned, tenant+data intact.
4. `disable_organisation_access` by parent admin on own org → rejected.
5. `disable_organisation_access` by parent admin on descendant → success.
6. `disable_organisation_access` by unrelated admin/judge/volunteer/participant → rejected.
7. Disable → existing session invalidated (banned_until set).
8. Enable → login restored (banned_until cleared).
9. Remove admin login → admin cannot sign in, org+data intact.
10. Archive by parent admin → org hidden from child lists, data queryable.
11. Archive recursion covers descendants.
12. Unarchive restores visibility.
13. RLS: archived orgs filtered from default reads (post-C3.3).
14. RLS: authenticated non-superadmin direct DELETE on `organisations` now blocked (post-C3.3).
15. `preview_organisation_deletion` returns correct row counts for a leaf and a subtree.
16. Hard delete leaf org → participants/registrations/org/tenant removed, transaction atomic on injected failure.
17. Hard delete subtree → children deleted before parents; no FK violation.
18. Hard delete requires superadmin (parent admin rejected).
19. `delete_child_organisation` resolves to guarded path (alias or rewire).
20. Auth-user hard delete removes identities then users; profile FK handled.
21. Audit rows written for every operation with actor + before/after.
22. No partial state on mid-transaction failure (rollback verified).
23. Dev-mode bypass (`DevConfig`) does not hide auth failures in the test plan (tests run in non-dev mode).
24. Frontend: confirmation wording updated; invalidations correct.

## 25. Product Decisions Required

1. May parent admins disable/archive their own child orgs, or only superadmin? (Recommend: disable/archive yes; hard delete no.)
2. Should "disable" immediately revoke existing sessions? (Recommend: yes, via `banned_until`.)
3. May hard delete ever purge festival data (scores/marks/results), or preserve it? (Recommend: preserve; data is the product's value.)
4. Resolve `delete_child_organisation`: guarded alias vs frontend rewire. (Recommend: rewire frontend to explicit RPCs; keep an alias only if backward compat needed.)
5. Is replacing legacy revoke semantics (unlink + ban, no auth deletion) acceptable as the new default? (Recommend: yes.)
6. Do we need per-org re-enable, or is "disable" intended to be permanent per org? (Affects ban vs flag design.)
7. Should tenant deletion be offered at all in the current festival window? (Recommend: no; archive + disable is sufficient.)

## 26. Recommended Implementation Order

C3.1 (neutralize + guard + audit) → C3.2 (disable/enable/remove-login) → C3.3 (archive + RLS fix) → C3.4 (preview + hard delete). Each sub-batch ships as its own migration with the matching grant plan and tests, verified on a staging DB before the next. All work waits until `097` review is resolved so that C3.x migrations can be numbered contiguously.

## 27. Information Needed (for implementation / verification)

1. Live `auth.users` schema — does `banned_until` exist; is `auth` schema writable from a SECURITY DEFINER function in the target project?
2. Do `organisations.admin_email` / `admin_password_temp` exist in the live DB? (DDL is absent from the visible migrations; only 010/013/029 reference them.)
3. Real FK/reference counts per tenant/org; are there already orphaned orgs (`tenant_id IS NULL`) or tenants without orgs?
4. Was `revoke_tenant_access` ever successfully invoked in production (check `audit_logs`/history)?
5. Status of `097` review (Gemini) so C3.x migration numbers can be assigned without collision.
6. Whether `service_role` access exists for a possible auth-admin edge function (only needed if SECURITY DEFINER cannot write `auth`).
7. Confirm exact behavior expected of the "Delete account" confirmation today (is it ever actually used?) — to prioritize frontend rewire vs alias.

## 28. Confirmation of No Changes

- No source files modified.
- No migrations created; no migration numbers assigned (incl. no `098`).
- No SQL applied; no `db push`/repair; no DB access attempted.
- No git operations performed.
- No config/edge-function/CI changes.
- Only artifact produced: this blueprint file.

---

Verdict summary (read-only):
- Legacy `revoke_tenant_access`: **UNSAFE** — no caller auth, PUBLIC grants, irreversible auth-user deletion, non-transactional partial-failure corruption.
- `delete_child_organisation`: **MISSING** — frontend contract with no backend RPC; runtime failure.
- PUBLIC destructive access: **YES** — `organisations` RLS has a never-dropped `FOR ALL USING (true)` policy (any authenticated user) plus public read; tenants/profiles are superadmin-gated; auth users are only reachable via the RPC.
- Partial-failure risk: **HIGH** (auth-user path) / **MEDIUM** (tenant path).
- Recommended default: disable-first (revocable ban + flag), archive before any deletion, hard delete superadmin-only and preview-backed, never auto-delete auth users.
- Recommended RPC structure: separate narrowly-scoped RPCs (disable/enable/remove-login/archive/unlink/preview/hard-delete) + shared `_assert_organisation_access` helper — not one action-parameter RPC.
- Parent-admin child management: recommend disable/archive only; hard delete superadmin-only (needs product sign-off).
- Hard delete required now: **NO** — disable + archive satisfies the festival window.
- Proposed implementation sub-batches: C3.1 → C3.2 → C3.3 → C3.4.
- Migration number assigned: **NO** (read-only task).
- Files changed: **NONE except this report**.
