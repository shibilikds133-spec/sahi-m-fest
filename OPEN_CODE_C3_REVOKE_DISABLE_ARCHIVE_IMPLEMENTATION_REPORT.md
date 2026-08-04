# OPEN CODE C3 — Tenant Access Disable, Re-enable and Child Organisation Archive — Implementation Report

## 1. Repository State

- Branch: `main` — Commit: `92dcb8fb` (`92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`).
- Inner repo path: `D:\work\fest\web-for-sahi--main\web-for-sahi--main` (the outer path is not a git repository).
- Highest migration before this batch: `097_import_rpc_authorization.sql` (reviewed and deployed; left unchanged).
- Next free migration number checked across `supabase/migrations/` and `supabase/migration_archive/`: `098` is free → used.
- Pre-existing uncommitted work by other agents (`.env.example`, judge mark RPC work in `judgeRepository.ts`/`judgeService.ts`/`judges/marks.tsx`/`SupabaseDatabaseProvider.ts`, deletion of `082_update_generate_token_rpc.sql`) is present in the working tree and was **not** touched by this batch.
- No live database is reachable from this environment (no `psql`); verification is static (typecheck + lint) and the migration was **not** applied.

## 2. Current Legacy Behavior

- `revoke_tenant_access(p_org_id uuid)` (migration `010`):
  - `SECURITY DEFINER`, `SET search_path = public`, no caller authorization, default `PUBLIC` execute.
  - Unlinked the organisation (`SET tenant_id = NULL, admin_email = NULL, admin_password_temp = NULL`).
  - Deleted `auth.identities` then `auth.users` for the tenant admin.
  - Attempted `DELETE FROM tenants` (blocked by FKs when data exists).
  - Non-transactional autocommit → partial, irreversible, inconsistent state.
- `delete_child_organisation(p_org_id uuid)`: called by the frontend (`organisationRepository.ts`) but no RPC existed → runtime failure.
- RLS gap: `007` policy `"Admins full access to organisations"` (`FOR ALL USING (true)`) allowed ANY authenticated user to directly `INSERT/UPDATE/DELETE` any organisation row via PostgREST.

## 3. Product Decisions Applied

- Disable first; no hard-delete by default.
- Preserve all festival data, tenant/org history, profiles and auth users.
- "Delete child organisation" is a reversible archive, not physical deletion.
- Superadmin: disable/re-enable any tenant; archive child organisations; legacy revoke → safe disable.
- Parent tenant admin: archive an authorised descendant child organisation only (never own org, never sibling/unrelated).
- Normal authenticated members and anonymous callers: denied.
- Hard delete: not implemented (no permanent-delete RPC created).

## 4. Files Changed

Migration (new, forward-only):
- `supabase/migrations/098_tenant_access_disable_archive.sql` (created).

Frontend:
- `src/providers/database/DatabaseProvider.ts` — added `disableTenantAccess`, `enableTenantAccess` to the interface.
- `src/providers/database/SupabaseDatabaseProvider.ts` — implemented the two RPCs; `listTenantAccounts` now embeds `tenants.access_disabled`.
- `src/lib/repositories/superRepository.ts` — added `disableTenantAccess`, `enableTenantAccess`.
- `src/services/superService.ts` — added the two service methods.
- `src/core/hooks/useSuperAdmin.ts` — added `useDisableTenantAccess`, `useEnableTenantAccess`.
- `src/app/(super)/tenants/index.tsx` — replaced destructive revoke wording with Disable/Re-enable; added disabled state badges; removed unused `Trash2` import.
- `src/lib/repositories/organisationRepository.ts` — `getChildOrganisations` filters out archived; renamed `deleteChildOrganisation` → `archiveChildOrganisation`.
- `src/services/organisationService.ts` — renamed method to `archiveChildOrganisation`.
- `src/core/hooks/useOrganisations.ts` — renamed to `archiveOrganisation` / `isArchiving`.
- `src/app/(admin)/organisations/index.tsx` — "Delete" → "Archive" button/wording/confirmation.
- `src/services/authService.ts` — added tenant-disabled guard on login and session restore.

Untouched (per rules): `010_tenant_revocation_func.sql`, `093_secure_token_bound_judge_marks.sql`, `097_import_rpc_authorization.sql`, all import RPCs, judge/marks system, schedule/venue/results policies, onboarding, username login.

## 5. Migration Created

`098_tenant_access_disable_archive.sql` (single transaction, `BEGIN`/`COMMIT`, `NOTIFY pgrst`).
- `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_disabled boolean NOT NULL DEFAULT false`.
- `ALTER TABLE organisations ADD COLUMN IF NOT EXISTS archived_at timestamptz`.
- New `tenant_access_audit_logs` table (actor, role, target tenant/org, action, reason, previous/new status, success, created_at) with RLS (superadmin read only) + indexes.
- Dropped the wide-open `007 "Admins full access to organisations"` write policy (superadmin writes still covered by `014`).

## 6. New/Changed RPCs

- `disable_tenant_access(p_org_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb`.
- `enable_tenant_access(p_org_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb`.
- `archive_child_organisation(p_org_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb`.
- `restore_child_organisation(p_org_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb`.
- `revoke_tenant_access(p_org_id uuid)` — replaced: superadmin-only safe-disable compatibility wrapper.
- `delete_child_organisation(p_org_id uuid)` — created: authorised safe-archive compatibility wrapper.
- Internal helpers (no client grant): `_assert_superadmin_access()`, `_assert_organisation_hierarchy_access(uuid)`.

## 7. Authorization Matrix

| Operation | anon | normal member | tenant admin (own) | parent admin (descendant) | superadmin |
|---|---|---|---|---|---|
| `disable_tenant_access` | DENY | DENY | DENY | DENY | ALLOW |
| `enable_tenant_access` | DENY | DENY | DENY | DENY | ALLOW |
| `archive_child_organisation` | DENY | DENY | DENY (own org) | ALLOW (descendant only) | ALLOW |
| `restore_child_organisation` | DENY | DENY | DENY (own org) | ALLOW (descendant only) | ALLOW |
| `revoke_tenant_access` (legacy) | DENY | DENY | DENY | DENY | ALLOW (→ disable) |
| `delete_child_organisation` (legacy) | DENY | DENY | DENY (own org) | ALLOW (descendant only) | ALLOW (→ archive) |

Hierarchy check: `is_org_visible(p_org_id)` (walk-down via `get_visible_organisations`) AND `p_org_id <> get_my_org_id()`; caller must be an admin-role profile with an enabled tenant. Disabled-tenant admins are blocked server-side for these RPCs.

## 8. Tenant Disable Behavior

- Requires authenticated superadmin.
- Resolves org → tenant server-side; rejects missing / already-unlinked orgs.
- Sets `tenants.access_disabled = true` only. No auth-user/identity/profile deletion, no org unlink, no tenant deletion, no data changes.
- Idempotent (no-op returns `success` with `state='disabled'`).
- Writes `tenant_disabled` audit row with reason + status transition.
- Returns structured `jsonb` result.

## 9. Tenant Re-enable Behavior

- Requires authenticated superadmin.
- Sets `tenants.access_disabled = false`; no duplicate users/profiles ever created.
- If a historical revoke removed the admin auth account, returns `state='TENANT_ENABLED_BUT_ADMIN_ACCOUNT_MISSING'` (verified against `auth.users` joined with `profiles`); no credentials invented.
- Idempotent; writes `tenant_enabled` audit row.

## 10. Child Archive Behavior

- Requires authenticated admin-role caller; superadmin any org; parent admin only a descendant (never own org; siblings/parents/unrelated denied).
- Sets `organisations.archived_at = now()`; preserves tenant/org/participants/registrations/marks/results/points.
- Hidden from the normal active child list (frontend filters `archived_at is null`).
- Idempotent; writes `child_organisation_archived` audit row.

## 11. Child Restore Behavior

- `restore_child_organisation` implemented server-side with the same hierarchy authorization; clears `archived_at`.
- Writes `child_organisation_restored` audit row.
- Restore UI: **PENDING** — archived orgs are hidden from the active child list and no dedicated "archived tab" was added in this batch (kept minimal). State is fully retained, so a future UI toggle can restore without any data loss.

## 12. Legacy Compatibility Wrappers

- `revoke_tenant_access(p_org_id uuid)` → superadmin-only; calls `disable_tenant_access`; no auth-user/identity/tenant/org deletion, no unlink; records `legacy_revoke_redirected` audit when successful.
- `delete_child_organisation(p_org_id uuid)` → authorised; calls `archive_child_organisation`; no physical deletion.

## 13. Data Preservation

- No table content is deleted by any new/changed code path.
- Disable: only `tenants.access_disabled`. Archive: only `organisations.archived_at`.
- Existing tenants, orgs, hierarchy, participants, registrations, marks, results, points, and admin references are untouched.

## 14. Auth User Handling

- Auth users/identities/profiles are never deleted.
- Disabled tenants are blocked at the application layer: `authService.login` and `authService.getCurrentSession` check `tenants.access_disabled` and refuse the session with a clear message (superadmins are exempt). Best-effort `signOut` is attempted.
- Server-side: a disabled tenant's admin is additionally denied by `_assert_organisation_hierarchy_access`.
- Statement: auth identity remains present, but tenant operations are denied for disabled tenants.

## 15. Audit Logging

- New `tenant_access_audit_logs` records: actor_user_id, actor_role (superadmin/tenant_admin), target_tenant_id, target_organisation_id, action, reason, previous_status (jsonb), new_status (jsonb), success, created_at.
- Actions: `tenant_disabled`, `tenant_enabled`, `child_organisation_archived`, `child_organisation_restored`, `legacy_revoke_redirected`.
- No passwords, tokens, service keys, participant details, or raw SQL errors are stored. Authorization/validation failures raise safe exceptions and write no audit rows.

## 16. Frontend Changes

- Superadmin tenants screen: destructive "Revoke Access & Delete Account" removed; replaced with **Disable Access** / **Re-enable Access**; confirmation says "This disables tenant access. Festival data and history will be preserved. This action can be reversed."; list and modal show a **Disabled** state.
- Admin sub-organisations screen: "Delete" replaced with **Archive**; confirmation says "This archives the organisation and preserves participant, registration, result and festival history."
- Restore action UI: pending (see §11).

## 17. Grants and SECURITY DEFINER Review

- Every new/changed privileged RPC: `SECURITY DEFINER`, `SET search_path = public`, schema-qualified objects, `auth.uid()` validated, caller role validated, target validated, hierarchy validated, no dynamic SQL, safe error messages.
- Grants: `REVOKE ... FROM PUBLIC, anon` then `GRANT EXECUTE TO authenticated` on `disable_tenant_access`, `enable_tenant_access`, `archive_child_organisation`, `restore_child_organisation`, `revoke_tenant_access`, `delete_child_organisation`.
- Internal helpers `_assert_superadmin_access`, `_assert_organisation_hierarchy_access`: `REVOKE ... FROM PUBLIC, anon, authenticated` (no client grant).
- Legacy `revoke_tenant_access` no longer `PUBLIC`-executable and no longer destructive.

## 18. Tests Performed

Static (this environment; no live DB):
- `npx tsc --noEmit` — no errors in any changed file (pre-existing repo-wide errors in unrelated files unchanged).
- `npx eslint` on all changed files — no new errors/warnings introduced (only pre-existing warnings and a pre-existing unescaped-quote error at `tenants/index.tsx:308` "Open Login" text, both present before this batch).
- Migration reviewed line-by-line for PostgreSQL syntax, grant hygiene, and idempotency.
- Test-matrix mapping (authorization/preservation/functionality/audit, per task §17 items 1-26): all covered by the implemented guards; runtime execution is deferred until the migration is applied (see §19).

## 19. TypeScript/Lint Status

- No type errors in changed files.
- No new lint errors in changed files.
- `npx tsc --noEmit` reports pre-existing errors only in unrelated files (`(admin)/participants/import-*.tsx`, `schedule/import-json.tsx`, Deno edge functions, `NotificationContext.tsx`, `BackgroundExportEngine.tsx`, `code-letter.tsx`).

## 20. Remaining Limitations

- Enforcement of "disabled tenant cannot operate" relies on the application login/session guard plus server-side gating of the new management RPCs. ~~Direct PostgREST table reads/writes by an already-authenticated session of a disabled tenant are not revoked in real time until the app reloads/re-checks the session~~ — **SUPERSEDED by the server-side correction (§25): `get_my_tenant_id()` now returns NULL for disabled tenants, so every tenant-scoped RLS policy and RPC gate denies the existing session immediately, with no app reload needed.**
- `deleteGlobalOrganisation` (superadmin global-org screen) remains a direct table delete for superadmin only — pre-existing, unrelated to tenant/child flow, now additionally safe because the wide-open `007` write policy is dropped.
- Restore UI pending; server-side restore RPC is ready.
- Runtime verification against a staging database is outstanding and should be run after the migration is applied.

## 21. Git Diff Summary

- Modified (this batch): `DatabaseProvider.ts`, `SupabaseDatabaseProvider.ts`, `superRepository.ts`, `superService.ts`, `useSuperAdmin.ts`, `useOrganisations.ts`, `organisationRepository.ts`, `organisationService.ts`, `authService.ts`, `src/app/(super)/tenants/index.tsx`, `src/app/(admin)/organisations/index.tsx`.
- Created: `supabase/migrations/098_tenant_access_disable_archive.sql`.
- Net diff for this batch: ~266 insertions, ~61 deletions across the 11 frontend files; migration adds ~530 lines.
- Pre-existing modifications by other agents (judge mark RPCs, `.env.example`, `082` deletion) are untouched and remain in the working tree.

## 22. Confirmation That Migration Was Not Applied

- `supabase/migrations/098_tenant_access_disable_archive.sql` was **NOT** applied to any Supabase project.
- No `db push`, SQL execution, or schema repair was performed.
- The database schema is unchanged.

---

# CORRECTION REPORT — Server-Side Disabled-Tenant Enforcement (Gemini Review)

## 23. Gemini Finding

Review of migration `098` found the migration **FAIL**: `get_my_tenant_id()` returned the caller's profile `tenant_id` whenever the JWT was valid, **without checking `tenants.access_disabled`**. A disabled tenant's already-issued session could therefore continue all tenant-scoped RLS reads/writes and RPC flows; the frontend guard in `authService.ts` was the only blocker and is not authoritative (any client can bypass the app).

## 24. Root Cause

`get_my_tenant_id()` (last effective definition in `017_fix_items_upsert.sql`):

```sql
CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

It read only `profiles`, never `tenants`, so `access_disabled` could not affect it. Every tenant-scoped RLS policy of the form `tenant_id = public.get_my_tenant_id()` and every RPC gate built on `get_my_tenant_id() IS NULL` evaluated against a still-valid ID after disable.

## 25. Server-Side Correction

Edited the **unapplied** `supabase/migrations/098_tenant_access_disable_archive.sql` only (no `099`, no changes to older migrations):

- `public.get_my_tenant_id()` is redefined (same signature `RETURNS uuid`, same `LANGUAGE sql STABLE SECURITY DEFINER`, added explicit `SET search_path = public`) to return the profile `tenant_id` **only when** the profile exists, the linked tenant row exists, and `tenants.access_disabled = false`; otherwise `NULL`.
- Superadmin access is intentionally **not** folded into the helper — it continues exclusively through explicit `public.is_superadmin()` branches in policies/RPCs. A disabled tenant can never regain access via `get_my_tenant_id()`, and superadmin flows (list, disable, re-enable, archive, deleteGlobalOrganisation) are unaffected.
- Execution grants for `get_my_tenant_id()` keep the existing default `PUBLIC` execute so every pre-existing RLS policy and RPC still resolves (no grant was revoked; the existing `007`/`014` policies continue to work).
- New authenticated-only status RPC `public.get_my_access_status() RETURNS jsonb` (`SECURITY DEFINER`, `SET search_path = public`, `REVOKE` PUBLIC/anon, `GRANT EXECUTE TO authenticated`), returning only the caller's own `{authenticated, tenant_id, access_disabled, superadmin}`.
- Frontend guard `src/services/authService.ts` `assertTenantEnabled` now calls `get_my_access_status()` instead of a direct `tenants` table read (the tenants RLS policy `id = get_my_tenant_id()` now denies the disabled tenant its own row, which would have made the old guard fail open). Guard logic and messages unchanged.

## 26. Effective `get_my_tenant_id()` Behavior

| Caller | Before | After correction |
|---|---|---|
| Active tenant member | tenant_id | tenant_id (unchanged) |
| Disabled tenant member (existing JWT) | tenant_id (leak) | **NULL → denied** |
| Profile with missing tenant row | tenant_id (orphan) | NULL → denied |
| No auth | NULL | NULL (unchanged) |
| Superadmin with active own tenant | own tenant_id | own tenant_id (unchanged) |
| Superadmin whose own tenant is disabled | tenant_id | NULL (superadmin flows still work via `is_superadmin()` branches) |

`NULL` is a safe denial: equality policies (`tenant_id = get_my_tenant_id()`) evaluate to `NULL` → denied; RPC gates raising on `get_my_tenant_id() IS NULL` deny the call; `is_org_visible()`/`get_visible_organisations(NULL)` return empty sets. `is_superadmin()` is unchanged and never consults `access_disabled`.

## 27. Active / Disabled / Superadmin Operation Matrix

| Operation | Active tenant | Disabled tenant (existing JWT) | Superadmin |
|---|---|---|---|
| `get_my_tenant_id()` | tenant_id | NULL | own tenant_id, unless own tenant disabled → NULL |
| Tenant-scoped RLS SELECT (`tenant_id = get_my_tenant_id()`) | allowed | **denied** (NULL equality) | allowed (via `is_superadmin()` OR branch) |
| Tenant-scoped RLS write | allowed | **denied** | allowed |
| Import RPCs (097 `_assert_import_access` → `get_visible_organisations(get_my_tenant_id())`) | allowed | **denied** (empty visible set) | allowed (`is_superadmin()` short-circuit) |
| `archive_child_organisation` / `restore_child_organisation` (098 hierarchy helper) | allowed (descendant only) | **denied** (`get_my_tenant_id() IS NULL` raises) | allowed (early return) |
| `disable_tenant_access` / `enable_tenant_access` / legacy `revoke_tenant_access` | n/a | n/a (no grant to use meaningfully; `_assert_superadmin_access` denies) | allowed (explicit `is_superadmin()` gate) |
| Re-enable a disabled tenant | n/a | n/a | allowed (gate is `is_superadmin()`, not `get_my_tenant_id()`) |

## 28. RLS/RPC Impact

- Verified callers of `get_my_tenant_id()` across migrations (`011`, `012`, `013` `setup_child_organisation`, `014` `get_my_org_id`, `017`, `018`, `029`, `075`, `083/084/095` judge/admin gates, `097` import gate, `098`): all use either equality comparison (NULL-safe denial) or `IS NULL` checks, or `OR is_superadmin()` short-circuits. No caller treats `NULL` as "no restriction".
- `get_my_org_id()` (`014`) inherits the fix: for a disabled tenant it returns `NULL`, so `parent_id = get_my_org_id()` policies deny and the 098 hierarchy helper raises.
- `097` import authorization confirmed: `PERFORM public._assert_import_access(...)` → `is_superadmin() OR EXISTS (get_visible_organisations(get_my_tenant_id()))` → disabled tenant gets an empty set → **denied**.
- 098's own hierarchy helper `_assert_organisation_hierarchy_access` now denies disabled admins at its `get_my_tenant_id() IS NULL` branch (message "tenant access required"); its explicit `access_disabled` check is retained as a defensive second layer (comment updated).
- No frontend dependency on `get_my_tenant_id()` exists (grep: zero matches in `src/`).

## 29. Organisation CRUD Conclusion

- The wide-open `007 "Admins full access to organisations"` (`USING (true)`) policy remains **dropped**; `USING (true)` was **not** restored.
- Audit of all `organisations` table access in `src/`: reads only (`getOrganisation`, `getChildOrganisations`, stats, superadmin lists) via RLS (014 superadmin / tenant-scoped 011-014 policies — all safe), `createGlobalOrganisation` + `deleteGlobalOrganisation` (superadmin-only direct writes, pre-existing), and child creation via the SECURITY DEFINER `setup_child_organisation` RPC. No legitimate non-superadmin direct `UPDATE`/`DELETE` feature exists.
- Conclusion: no new policy needed; the intentional safe restriction is documented in `098` (section 10 comment). All organisation writes used by the app run through `setup_child_organisation`, `archive_child_organisation`, `restore_child_organisation`, or superadmin-only direct access.

## 30. Tests / Static Verification (Correction)

- `npx tsc --noEmit` filtered to `authService.ts` — no errors (repo-wide pre-existing errors in unrelated files unchanged).
- `npx eslint src/services/authService.ts` — no issues.
- Repo-wide grep for `get_my_access_status` / `access_disabled`: definitions and all uses confined to `098` + `authService.ts` + the tenants screen display fields + `SupabaseDatabaseProvider.listTenantAccounts`.
- `git status`: `098_tenant_access_disable_archive.sql` is a new **untracked** file (so `git diff` shows no content); reviewed by full-file read, lines 1–625.
- Migration remains forward-only, single transaction, and line-by-line reviewed for PostgreSQL syntax, grants, and idempotency.

## 31. Confirmation That Migration Was Not Applied (Correction)

- The corrected `supabase/migrations/098_tenant_access_disable_archive.sql` was **NOT** applied to any Supabase project.
- No `db push`, SQL execution, or schema repair was performed.
- The database schema is unchanged. Runtime verification against a staging database is still outstanding after apply.
