# C2: Tenant & Child-Organisation Onboarding Implementation Report

**Agent:** opencode (D2) — Tenant Admin & Child-Organisation Onboarding Repair
**Date:** 2026-08-03
**Branch / HEAD:** `main` @ `92dcb8f` (unchanged)
**Scope:** Repair tenant-admin and child-organisation onboarding, prevent orphan auth users, remove RPC contract mismatches, eliminate plaintext-password persistence.

---

## 1. Repo State at Start

- Branch `main` @ commit `92dcb8f` (`feat: modernize admin, scheduling, and judging workflows`).
- `git status` already contained uncommitted work by other agents (judge-mark ACL batch, `.env.example` edits, deletion of `082_update_generate_token_rpc.sql`, untracked migration archive). None of that work was modified by this batch.
- Highest present migration: `098_tenant_access_disable_archive.sql` (unapplied in this working tree; per the C3 handoff it is already deployed to the hosted Supabase project).
- Next free migration number: `099` (verified against both `supabase/migrations/` and `supabase/migration_archive/`).

## 2. Blueprint Availability (Gap Recorded)

- The mandated blueprint path `OPEN_CODE_C2_TENANT_CHILD_ONBOARDING_BLUEPRINT.md` does **not** exist (glob `OPEN_CODE_C2*` returned nothing).
- Recorded as a formal gap. This batch therefore performed its own read-only analysis (section 3) and follows the same deliverable structure used for the C1/C3 batches (blueprint-gap noted, implementation report produced).

## 3. Problems Confirmed by Static Analysis (C2.1)

1. **Root onboarding (super admin "Onboard organisation"):**
   - `src/services/superService.ts` `setupTenantRecords()` called `dummyClient.auth.signUp({email, password, data:{full_name}})` and then `supabase.rpc('setup_tenant_records', {p_org_id, p_org_name, p_org_type, p_admin_email, p_admin_pass, p_user_id})` — **6 payload keys against a 4-parameter SQL signature** (`setup_tenant_records(p_org_id uuid, p_user_id uuid, p_org_name text, p_org_type text)`, defined in `009_tenant_management_funcs.sql`).
   - Result: PostgREST rejected the extra keys (`p_admin_email`, `p_admin_pass`), so **no RPC row was ever created**, while the Auth user had already been created → **orphan auth user per onboarding attempt**.
   - `setup_tenant_records` had **no caller authorization** inside the function and default `PUBLIC` EXECUTE grant.
2. **Child onboarding (tenant admin "Create sub-organisation"):**
   - `src/lib/repositories/organisationRepository.ts` `signUpNewOrganisationUser()` used `isolatedSupabase.auth.signUp(...)` and then RPC `setup_child_organisation` with **7 payload keys** (`p_parent_id, p_new_user_id, p_org_name, p_org_type, p_username, p_internal_email, p_password_temp`) against the effective 6-parameter signature (`p_parent_id, p_new_user_id, p_org_name, p_org_type, p_username, p_password_temp`).
   - `p_internal_email` does not exist in any signature → PostgREST rejected the call → **orphan auth user per child onboarding attempt**.
   - Effective implementation is `029_hybrid_participant_management.sql`, which **stored the plaintext `p_password_temp` into `organisations.admin_password_temp`** (a plaintext-password persistence column) and returned it.
   - `setup_child_organisation` default `PUBLIC` EXECUTE; the function itself had no explicit caller check.
3. **Privilege escalation surface (profiles):**
   - `002_auth_profiles.sql` trigger `handle_new_user()` created every new Auth user's profile with **default role `'admin'`**.
   - Profiles RLS included `"Users can insert their own profile."` (INSERT WITH CHECK `auth.uid() = id`) and `"Users can update own profile."` (UPDATE USING `auth.uid() = id`) → a self-registered/session user could escalate role/tenant on their own row.
4. **Plaintext password in transit and at rest:** temp password sent over the client RPC payload and persisted in `admin_password_temp`; supervisor UI rendered it and offered copy/open-login links.
5. **No SMTP in the project** (confirmed in handoff notes and `.env.example`): `auth.signUp` without `email_confirm: true` leaves users in an unusable `unconfirmed` state — another contributor to the "created but never usable" symptom.

## 4. Product Decisions

- Root tenant onboarding: **superadmin-only**, email + organisation name/type; no passwords in the UI; server generates the credential once; shown to the superadmin exactly once.
- Child onboarding: **tenant admin (or superadmin)**; parent must be inside the caller's visible hierarchy and linked to a non-disabled tenant; org type limited to `unit | sector | division | district | state`; username instead of an external email (project log-in model uses username).
- Child admin email: `{username}_{uuid-slice}@sahi.local` — deliberately un-routable; forced confirmed (see 5). Documented as a limitation: username/password log-in only, no e-mail workflow.
- Temp password: generated server-side (edge function, service role), returned once, never logged, never persisted.
- Retry safety: idempotency keys everywhere; a failed attempt can be retried without creating duplicates.

## 5. Auth Model Decision

- No SMTP → the edge function calls `admin.auth.admin.createUser({email, password, email_confirm: true, user_metadata:{full_name}})`.
- The generated temporary password is delivered once via the UI after the database link completes. Password-reset-by-email is **not** available (no SMTP); this is recorded as a documented limitation (remaining limitations, section 25).

## 6. Architecture

```
UI (super tenants / admin organisations screens)
  -> hooks (useProvisionRootTenant / useOrganisations)
  -> src/services/tenantProvisioningService.ts      (business rules, idempotency keys)
  -> src/lib/repositories/provisioningRepository.ts (functions.invoke('provision-admin'))
  -> Edge Function supabase/functions/provision-admin/index.ts (service role)
       |-- admin client: JWT verification (auth.getUser), auth.admin.createUser, deleteUser
       |-- caller-scoped client: finalisation RPC with the acting admin's Bearer token
  -> DB: finalise_tenant_provisioning / finalise_child_organisation_provisioning (SECURITY DEFINER)
       |-- auth.uid() = acting admin; is_superadmin() / get_my_tenant_id() / is_org_visible() checks
       |-- tenant_provisioning_operations: idempotency + resume + audit state
       +-> tenant_access_audit_logs (098): audit rows
```

- Pattern precedent: `supabase/functions/send-notification/index.ts` (Deno STDLIB 0.177.0, supabase-js 2.38.4, service-role env vars, `auth.getUser` JWT verification, profile-role checks, safe JSON errors). Frontend `functions.invoke` precedent: `src/services/storage/r2StorageProvider.ts`.

## 7. Files Changed / Created

**Created:**
- `supabase/migrations/099_tenant_child_provisioning_safety.sql` (forward-only, NOT applied)
- `supabase/functions/provision-admin/index.ts` (trusted provisioning edge function)
- `src/services/tenantProvisioningService.ts`
- `src/lib/repositories/provisioningRepository.ts`

**Modified (C2 batch):**
- `src/services/superService.ts` — removed `setupTenantRecords` + `dummyClient` auth sign-up.
- `src/lib/repositories/superRepository.ts` — removed `setupTenantRecords` method.
- `src/providers/database/DatabaseProvider.ts`, `src/providers/database/SupabaseDatabaseProvider.ts` — removed `setupTenantRecords` from interface + implementation.
- `src/core/hooks/useSuperAdmin.ts` — `useSetupTenantRecords` → `useProvisionRootTenant`.
- `src/services/organisationService.ts` — removed `generateCredentials`; added `createSubOrganisation(parentId, orgName, orgType?, idempotencyKey?)`.
- `src/lib/repositories/organisationRepository.ts` — removed `signUpNewOrganisationUser` (isolated `auth.signUp`) and the 7-key RPC call.
- `src/core/hooks/useOrganisations.ts` — create mutation takes `{orgName, orgType?, idempotencyKey?}`; removed `generateCredentials` from return.
- `src/app/(super)/tenants/index.tsx` — OnboardModal rewritten (email-only, phases, temp-password-once, safe errors, retry).
- `src/app/(admin)/organisations/index.tsx` — removed credential preview/`generateCredentials`; per-form idempotency key; server credential shown once on success.

**Not touched (other agents / out of scope):** judge-mark batch files, `authService.ts`, `082` deletion, `.env.example`, `093`–`098` migrations.

## 8. Migration `099` — Structure

- Forward-only, single `BEGIN`/`COMMIT`, `search_path` pinned on every function.
1. **`tenant_provisioning_operations` table** — `operation_type` CHECK (`root_tenant` | `child_organisation`), `idempotency_key`, `requested_by`, `target_organisation_id`, `target_tenant_id`, `target_user_id`, `admin_email`, `status` CHECK (`pending | validated | auth_user_created | database_linked | completed | failed | compensation_pending | compensated`), `failure_code`, timestamps, `UNIQUE (operation_type, idempotency_key)`, indexes on `requested_by` and `status`. RLS enabled; **single SELECT policy** (`requested_by = auth.uid() OR is_superadmin()`); no client INSERT/UPDATE/DELETE policies.
2. **`handle_new_user()` redefinition** — new Auth users now get default role `'participant'` (was `'admin'`); `is_superadmin` stays `false`.
3. **Profile RLS replacement** — drops `"Users can insert their own profile."` and `"Users can update own profile."`; adds `"Users can update own non-privileged profile fields"` with a WITH CHECK subselect requiring `role`, `tenant_id`, `is_superadmin` to be unchanged.
4. **Internal helpers** (`REVOKE`d from PUBLIC/anon/authenticated): `_provisioning_get_org(uuid)`, `_provisioning_link_profile(uuid,uuid,text)` (refuses superadmin; refuses tenant changes; ON CONFLICT UPDATE only when `tenant_id IS NULL`), `_provisioning_get_op(text,text)`, `_provisioning_upsert_op(...)`.
5. **`record_provisioning_event(...)`** — SECURITY DEFINER, **revoked from all client roles** (service-role only); used by the edge function for status transitions.
6. **`finalise_tenant_provisioning(p_org_id, p_user_id, p_org_name, p_org_type, p_idempotency_key)`** — see 10.
7. **`finalise_child_organisation_provisioning(p_parent_id, p_user_id, p_org_name, p_org_type, p_username, p_idempotency_key)`** — see 11.
8. **Legacy neutralisation** — see 12.
9. **Grants** — `REVOKE ... FROM PUBLIC/anon`, `GRANT ... TO authenticated` on all four client-callable RPC names; `NOTIFY pgrst, 'reload schema'`.

## 9. Provisioning Operation Model

- Every provisioning attempt is recorded (or resumed) in `tenant_provisioning_operations`, keyed by `UNIQUE(operation_type, idempotency_key)`.
- **Status flow (edge):** `pending → validated → auth_user_created → database_linked → completed`. Failure at the DB-link step: `failed → (compensated | compensation_pending)`. DB-side (migration 099 finalise functions) marks `failed` (transactional, nothing committed).
- **Idempotent replay:** if an op is already `completed`, both the edge pre-check and the DB finalise functions return the stored result without creating anything.
- **Resume:** a retry of the same key reuses the recorded `target_tenant_id`, `target_organisation_id` (DB) and `target_user_id` (edge, only for statuses that did not compensate) — no second account, no second tenant, no second org.
- **Audit:** success rows land in `tenant_access_audit_logs` (098) with actor (`superadmin` | `tenant_admin`), action (`tenant_provisioned` | `child_organisation_provisioned`), previous/new status JSON, success flag.

## 10. Root Flow (Finalised)

1. Superadmin UI → `provisionRootTenant({orgId, orgName, orgType, adminEmail})`; idempotency key `root-${orgId}` (stable per org).
2. Edge verifies JWT (`admin.auth.getUser`), loads profile server-side, enforces `is_superadmin`.
3. Idempotency pre-check; validate email/name/type; `createUser` with 14-char crypto password, `email_confirm: true`, metadata `full_name`.
4. `record_provisioning_event('auth_user_created')`; caller-scoped RPC `finalise_tenant_provisioning(...)`.
5. DB (transactional): superadmin check; replay/resume; create tenant if none; link org (conflict reject); `_provisioning_link_profile`; upsert `completed`; audit row.
6. Success response carries `temporary_password` once; failure → compensation (14) → safe error with `operation_id`.

## 11. Child Flow (Finalised)

1. Tenant admin UI → `createSubOrganisation(parentId, orgName, orgType='unit', idempotencyKey?)`; default key `child-${parentId}` unless the form supplies a per-attempt key (admin screen uses a per-form key so separate forms cannot collide).
2. Edge verifies JWT + profile; allowed if superadmin **or** caller has a tenant (`profile.tenant_id` present). The DB performs the authoritative hierarchy check.
3. Validation: username `^[a-z0-9_]{3,40}$`, org name 2–120, org type in allowed set.
4. Email `{username}_{uuid4slice}@sahi.local`; `createUser` with temp password, `email_confirm: true`.
5. Caller-scoped RPC `finalise_child_organisation_provisioning(...)`.
6. DB: non-superadmin must have enabled tenant (`get_my_tenant_id() IS NULL` → raise; this relies on the 098 correction that returns NULL for disabled tenants) and `is_org_visible(p_parent_id)` (own org or descendant; sibling/above/unrelated denied); parent must be linked to a tenant, tenant not disabled; username uniqueness checked **only when creating a new org** (resume-safe); creates tenant + org (`admin_email = username`), links `tenants.organisation_id`, links profile, upserts `completed`, audit with actor `tenant_admin`.
7. No password anywhere in the DB path.

## 12. Legacy Contract Neutralisation

- `setup_tenant_records(uuid, uuid, text, text)` — **retained as a superadmin-gated compatibility name** that delegates to `finalise_tenant_provisioning(..., NULL)`. Any old caller sending `p_admin_email`/`p_admin_pass` now fails at PostgREST (key mismatch) instead of creating orphans. Superadmin enforcement is inside the finalise function itself.
- `setup_child_organisation(uuid, uuid, text, text, text, text)` (old, `p_password_temp`) — **DROPPED**. A weaker overload must not remain as a bypass.
- `setup_child_organisation(uuid, uuid, text, text, text)` (safe, no password) — **retained** as a wrapper delegating to the finalise function.
- All four client-callable names: `REVOKE FROM PUBLIC, anon`; `GRANT TO authenticated`.

## 13. Authorization Matrix (post-099)

| Entry point | Superadmin | Tenant admin (enabled tenant) | anon / other |
|---|---|---|---|
| `finalise_tenant_provisioning` | yes (`is_superadmin()`) | no | no |
| `finalise_child_organisation_provisioning` | yes | yes, only if `get_my_tenant_id()` non-null AND `is_org_visible(parent)` AND parent tenant enabled | no |
| `setup_tenant_records` (legacy) | yes (delegates) | no | no |
| `setup_child_organisation` (5-param legacy) | yes | yes (delegates) | no |
| `record_provisioning_event` | service-role only (revoked) | no | no |
| `tenant_provisioning_operations` SELECT | all rows | own rows only | no |
| profiles UPDATE | own non-privileged fields only | same | no |

## 14. Compensation (Edge Function)

- If DB finalisation throws after `createUser`, the edge attempts `admin.auth.admin.deleteUser(targetUserId)` (**hard delete** so a retry can recreate the account).
- Deletion scope: **only the user created by this operation** (the just-created user, or the recorded `target_user_id` of this op on resume). Never a user from another operation.
- `404` is treated as success. Delete failure → op marked `compensation_pending` (via service role), response `502 PROVISIONING_COMPENSATION_PENDING` with instruction to retry the same key.
- Delete success → op marked `compensated`, response `502 PROVISIONING_DATABASE_LINK_FAILED_COMPENSATED`.
- DB side is transactional: a finalise `RAISE` rolls back the single statement, so no partial DB rows remain.

## 15. Idempotency & Retry

- Keys: root `root-${orgId}` (no duplicate account per org); child per-form attempt key (`child-${timestamp}-${random}`), stable across retries of the same form; service-layer `getProvisioningStatus` supported but the UI currently surfaces errors/retry instead of polling.
- Edge pre-check + DB replay both guard `completed`; DB resume reuses tenant/org; edge resume reuses the auth user for non-compensated statuses.
- Retry after compensation creates a fresh user under the same key (op was `compensated`; the `target_user_id` is not reused).

## 16. Profile / Role Safety

- `handle_new_user` now creates `participant`-role profiles.
- Self-INSERT policy dropped (new profiles come from the trigger only).
- Self-UPDATE restricted to non-privileged fields: `role`, `tenant_id`, `is_superadmin` cannot be changed by the row owner (subselect check).
- `_provisioning_link_profile` never moves a profile across tenants, never assigns superadmin, and only fills `tenant_id` when it is NULL.
- Superadmin provisioning of a profile whose `tenant_id` is already set (not NULL and different) raises.

## 17. Passwords & Secrets

- No plaintext password is ever sent to the DB, stored, or returned from an RPC. The old `admin_password_temp` write path is gone (6-param function dropped).
- Temp passwords are generated with `crypto.randomUUID`-derived 14-char strings inside the edge function, held in memory only, returned once on success, and never written to logs or the operations table.
- `SUPABASE_SERVICE_ROLE_KEY` is read from `Deno.env` inside the edge function only; never in the app bundle. `.env.example` keeps placeholders only (unchanged by this batch).
- Audit/ops tables contain no password material.

## 18. Edge Function Security

- CORS restricted to expected methods/headers; OPTIONS preflight.
- JWT verified via `admin.auth.getUser(token)` (not client-supplied claims); the profile is loaded server-side with the service-role client.
- The finalisation RPC is executed with a **caller-scoped client** (anonymous client + the acting admin's Bearer token), so `auth.uid()` and RLS semantics inside the DB reflect the real actor.
- Safe error envelope: internal exception text never forwarded; unknown errors map to a generic 500; no credentials/keys in responses; error paths log only messages (no user data beyond IDs).
- Status lookup is scoped: `403` unless the requester owns the op or is a superadmin.

## 19. Service Layer

- `tenantProvisioningService.ts`: typed inputs (`ProvisionRootTenantInput`, `ProvisionChildOrganisationInput`, `ProvisioningStatusInput`), `provisionRootTenant`, `provisionChildOrganisation`, `getProvisioningStatus`.
- `provisioningRepository.ts`: single `supabase.functions.invoke('provision-admin', {body})` call; maps `{error}` results to `Error` with `.code` and `.operationId` for safe UI display.
- `organisationService.createSubOrganisation` replaces `generateCredentials`-based child creation; `getMyOrganisation` / `getChildOrganisations` / `archiveChildOrganisation` unchanged.

## 20. Frontend Changes

- Super tenants screen: OnboardModal has no password field; phases `idle → provisioning → success | failed`; email validation; success shows the temp password once (green box) with copy/open-login affordances; failure shows the safe error plus Retry (same key → same op); provisioning state notes the account is usable only after linking; leftover unused imports/`useCallback`/unescaped quotes fixed.
- Admin organisations screen: create modal no longer generates or previews credentials client-side; each form gets a stable `attemptKey`; success alert shows the server-returned temp password once; button label reflects "Creating account & linking…".
- Hooks: `useProvisionRootTenant` (invalidates `['superadmin','tenants']` on success); `useOrganisations` create passes `{orgName, orgType?, idempotencyKey?}`.

## 21. Grants Review

- Internal helpers (`_provisioning_*`) and `record_provisioning_event`: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` → service-role only.
- Client RPCs: PUBLIC/anon revoked, `authenticated` granted (4 names listed in section 12).
- `tenant_provisioning_operations`: RLS-enforced SELECT-only visibility (requester or superadmin).
- Verified in the migration text; DB-side verification pending until applied (section 26).

## 22. Orphan-Diagnosis & Remediation Notes

- Root cause per onboarding attempt: RPC payload/signature mismatch after an unconditional `auth.signUp` (root: `p_admin_email`/`p_admin_pass` keys; child: `p_internal_email` key) — PostgREST rejected the call while the Auth user already existed.
- This design cannot create orphans anymore: the edge function creates the auth user and the DB record in one guarded flow; DB failure triggers compensation; retries reuse the same op.
- Pre-existing orphan auth users (created by the old flows) were **not deleted** by this batch (no live DB access; see section 26) — a cleanup pass over `auth.users` lacking a `profiles` row or a completed op is recommended.

## 23. TypeScript / Lint Status

- `npx tsc --noEmit` — clean for all changed files (no new errors).
- `npx eslint` on all changed files — **0 errors, 4 warnings**, all pre-existing style warnings (`no-unused-expressions` ternary patterns in `src/app/(super)/tenants/index.tsx` lines 110/114/141/145; unchanged code).
- Repo grep for legacy symbols in `src/` (`setupTenantRecords|setup_tenant_records|setup_child_organisation|p_admin_pass|p_password_temp|p_internal_email|signUpNewOrganisationUser|generateCredentials|setupMutation|dummyClient|isolatedSupabase`) — **zero matches**.

## 24. Tests

- No test framework is configured in this repo (`package.json` has no test script). Static verification (grep + tsc + eslint + SQL review) is the extent of local testing.
- SQL logic was reviewed for: resume ordering (username collision check only for new orgs), replay returns, idempotency key bounds, org-type/name validation, search_path pinning, exception handler placement (`v_op_id IS NULL` guard).

## 25. Remaining Limitations (Documented)

- No SMTP: credentials are shown once at provisioning; e-mail-based password reset is unavailable. Child admins get un-routable `@sahi.local` addresses; log-in is username + password.
- The UI does not poll `getProvisioningStatus`; retry is the resume path. A polling UI could be added later.
- `tenant_provisioning_operations` has no client-visible status page.
- Pre-existing orphan auth users require a one-off cleanup (no live DB access here).
- Legacy `setup_tenant_records` 4-param name kept for compatibility; old 6-key callers now fail loudly at PostgREST (desired), but any deployed client that still calls it will show an error until it moves to the new flow.

## 26. Runtime Tests (Pending — No Live DB)

- Migration `099` was **not applied**; no psql/live DB access in this environment.
- Pending after deployment: apply `099`; run the edge function against a real project (service-role env vars set in Supabase dashboard); exercise root onboarding, child onboarding, retry-after-failure, compensation path, username collision, and disabled-parent rejection; verify `pgrst` schema reload and grants via `verify-grants`-style queries.

## 27. Git Diff Summary

- Created (untracked): `supabase/migrations/099_tenant_child_provisioning_safety.sql`, `supabase/functions/provision-admin/`, `src/services/tenantProvisioningService.ts`, `src/lib/repositories/provisioningRepository.ts`, this report.
- Modified: the 10 frontend/service/provider/hook files listed in section 7.
- `097` and `098` are untouched by this batch (untracked by their owning agents). `082` deletion, judge-mark batch, `.env.example` — untouched by this batch.

## 28. Migration Not Applied

- `099` is delivered as a forward-only migration, **not applied** to any database. Per the workflow, application/deployment and runtime verification are left to the reviewing agent (Gemini) and the deployment step.

## 29. No Users / Tenants / Organisations Deleted

- This batch performed **no deletes** of any kind: no auth users, tenants, or organisations were removed. Compensation deletes occur only at runtime inside the edge function and only for users created by a failed operation of the same key.

## 30. Cross-Batch Confirmation

- `098`'s corrected `get_my_tenant_id()` (NULL when tenant disabled) is a hard dependency of the child finalisation gate and is treated as deployed per the C3 handoff. If `098` is ever absent, the disabled-tenant guard weakens to the `is_org_visible` + parent-enabled checks.
- `tenant_access_audit_logs` (098) is reused for provisioning audit rows; migration ordering (`099` after `098`) is correct.

---

## Sign-off

- Pre-implementation checks: ✔ (recorded before any change)
- Implementation: ✔ (migration + edge function + service layer + UI)
- Static verification: ✔ (grep clean, tsc clean, eslint 0 errors)
- Migration applied: ✘ (deliberately NOT applied)
- Users/tenants/organisations deleted: ✘ (none)
- Open items: runtime tests (section 26), blueprint-gap (section 2), orphan cleanup (section 22), status polling UI (section 25).

**C2 ONBOARDING IMPLEMENTATION COMPLETED — WAITING FOR INDEPENDENT REVIEW**
